import { createHash } from "node:crypto";
import type { NormalizedPlace } from "../../domain/places";
import { parseQueryIntent, type VibeId } from "../../domain/queryIntent";
import { classifyAskAiScope } from "../../functions/askAiStrictPgGuard";
import { manilaToday } from "../galaPlanDraftPlanner";
import { buildChips, buildItinerary, buildMap, buildWeather, fallbackText, mentionedPlaces, sanitizeAnswer, selectCards } from "./compose";
import { guardMessage, redactPersonalData, refusalText } from "./guard";
import { updateMemory } from "./memory";
import { buildSystemPrompt, groundedUserTurn, OFF_TOPIC_MARKER } from "./prompt";
import { ProviderError, type AssistantModelProvider, type ModelTurn, type ToolDeclaration } from "./providers/types";
import { ASSISTANT_PROVIDERS, validateAssistantResponse, type AssistantEvent, type AssistantMemory, type AssistantMode, type AssistantProvider, type AssistantResponse } from "./schema";
import { newLedger, queryTokens, runTool, TOOL_DECLARATIONS, VERIFY_TOOL, visiblePlaces, type ToolContext, type ToolLedger } from "./tools";

const MAX_STEPS = 4;
const MAX_HISTORY_TURNS = 6;
const CACHE_TTL_SECONDS = 30 * 60;
// Weather only adds a line to the answer; past this wait the model writes without it.
const WEATHER_WAIT_MS = 1500;

export type AgentHistoryTurn = { role: "user" | "assistant"; content: string };

export type AgentInput = {
  message: string;
  mode: AssistantMode;
  history: AgentHistoryTurn[];
  memory: AssistantMemory;
  requestId: string;
  signal?: AbortSignal;
};

export type AnswerCache = {
  get(key: string): Promise<AssistantResponse | null>;
  set(key: string, value: AssistantResponse, ttlSeconds: number): Promise<void>;
};

export type AgentDeps = {
  /** Tried in order; providers whose keys are missing are skipped. */
  providers: AssistantModelProvider[];
  tools: Omit<ToolContext, "todayIso">;
  imageUrl: (place: NormalizedPlace) => string | null;
  cache?: AnswerCache;
  today?: () => { iso: string; weekday: string };
  log?: (message: string) => void;
};

export function cacheKey(mode: AssistantMode, message: string) {
  const normalised = message.toLowerCase().replace(/[^\p{L}\p{N}₱ ]+/gu, " ").replace(/\s+/g, " ").trim();
  return `assistant:answer:v4:${mode}:${createHash("sha256").update(normalised).digest("hex").slice(0, 32)}`;
}

function historyTurns(history: AgentHistoryTurn[]): ModelTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) =>
    turn.role === "user"
      ? { role: "user" as const, text: redactPersonalData(turn.content.slice(0, 600)) }
      : { role: "model" as const, text: turn.content.slice(0, 600), toolCalls: [] }
  );
}

/** The search a model would most likely make, for when no model is reachable. */
export function fallbackSearchArgs(message: string, memory: AssistantMemory): Record<string, unknown> {
  // "Mas mura?" names nothing to search for: search the remembered topic again with the new limits.
  return {
    query: queryTokens(message).length > 0 || !memory.topic ? message : memory.topic,
    ...(memory.area ? { area: memory.area } : {}),
    ...(memory.vibe ? { vibe: memory.vibe } : {}),
    ...(memory.budgetPerHead !== null ? { budget_max: memory.budgetPerHead } : {}),
    ...(memory.indoor ? { indoor: true } : {}),
  };
}

const PLAN_WORDS = /\b(itinerary|day plan|plan|schedule|whole day|buong araw|\d+\s*days|weekend trip|weekend getaway|day trip|family day|for a day)\b|\bweekend\s*[?!.]*$/i;
const WEATHER_WORDS = /\b(umuulan|maulan|ulan|rain|raining|rainy|bagyo|storm|typhoon|weather|panahon)\b/i;
const NEAR_WORDS = /\b(near|nearby|malapit|around|katabi|beside)\b/i;
const FACT_WORDS = /\b(open|opens|closed?|hours?|bukas ba|sarado|oras|magkano|how much|price|presyo|entrance|fee|bayad|ticket|paano pumunta|how to get|parking|commute)\b/i;
const ITINERARY_WORDS = /\b(itinerary|plan|schedule|whole day|buong araw|\d+\s*days)\b/i;
const PLACE_KINDS = new Set<VibeId>(["beach", "waterfall", "mountain", "island", "hot-spring", "cave"]);
const GREETING =/^\s*(hi|hello|hey|yo|kumusta|kamusta|musta|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi))\b/i;

export type ToolPlan = Array<{ name: string; args: Record<string, unknown> }>;

/**
 * The tool calls a model would make for a common gala ask, decided in code so the cards can show before any
 * model call. Null when the model should decide: greetings, injection attempts, unclear scope, or nothing to search.
 */
export function planTools(message: string, memory: AssistantMemory, places: NormalizedPlace[], history: AgentHistoryTurn[], injection: boolean): ToolPlan | null {
  const words = message.trim().split(/\s+/).length;
  if (injection || (GREETING.test(message) && words <= 4)) return null;
  const named = mentionedPlaces(message, places)[0] ?? null;
  const followUp = history.length > 0 && Boolean(memory.topic);
  if (classifyAskAiScope(message) !== "allow" && !named && !followUp) return null;
  // "Gala tayo" alone names nothing to look for: the model asks one question instead.
  const filters = Boolean(memory.area || memory.vibe || memory.indoor) || memory.budgetPerHead !== null;
  if (!named && !followUp && queryTokens(message).length === 0 && !filters) return null;

  const plan: ToolPlan = [];
  const near = Boolean(named) && NEAR_WORDS.test(message);
  if (named) plan.push(near ? { name: "nearby_places", args: { slug: named.slug, radius_km: 2 } } : { name: "get_place", args: { slug: named.slug } });
  // "Fort Santiago open ba, magkano?" is about that place: its own facts, not a list of places with similar names.
  if (named && !near && FACT_WORDS.test(message)) return plan;
  // "Beach day trip near Manila" asks for beaches; only an itinerary ask gets a timed plan.
  const kindAsk = parseQueryIntent(message, places).vibes.some((vibe) => PLACE_KINDS.has(vibe)) && !ITINERARY_WORDS.test(message);
  if (PLAN_WORDS.test(message) && !kindAsk) {
    const request = memory.area && !message.toLowerCase().includes(memory.area.toLowerCase()) ? `${message} (${memory.area})` : message;
    plan.push({ name: "plan_day", args: { request } });
  } else if (!near) {
    plan.push({ name: "search_places", args: fallbackSearchArgs(message, memory) });
  }
  if (WEATHER_WORDS.test(message)) plan.push({ name: "weather", args: memory.area ? { area: memory.area } : {} });
  return plan;
}

/** Runs a tool plan. Local tools finish at once; the weather lookup is handed back to await separately. */
async function runToolPlan(plan: ToolPlan, context: ToolContext, ledger: ToolLedger) {
  const results: Record<string, unknown> = {};
  const slow: Promise<void>[] = [];
  for (const call of plan) {
    const running = runTool(call.name, call.args, context, ledger).then((result) => {
      results[call.name] = result;
    });
    if (call.name === "weather") slow.push(running);
    else await running;
  }
  return { results, slow: Promise.all(slow) };
}

// Not unref'd: if the weather lookup never answers, this timer is what lets the request go on.
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ModelOutcome = { text: string; provider: AssistantProvider };
type ModelCall = { system: string; turns: ModelTurn[]; tools: ToolDeclaration[]; forceTool: boolean; grounded: boolean; maxOutputTokens: number };

async function runModel(
  input: AgentInput,
  deps: AgentDeps,
  context: ToolContext,
  ledger: ToolLedger,
  call: ModelCall,
  emit: (event: AssistantEvent) => void,
  onPreview: () => void
): Promise<ModelOutcome | null> {
  const turns = [...call.turns];
  let streamed = false;

  for (const provider of deps.providers) {
    if (!(await provider.available().catch(() => false))) continue;
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const last = step === MAX_STEPS - 1;
        const result = await provider.step(
          {
            system: call.system,
            turns,
            tools: last ? [] : call.tools,
            toolChoice: step === 0 && call.forceTool && !turns.some((turn) => turn.role === "tool") ? "required" : "auto",
            grounded: call.grounded,
            maxOutputTokens: call.maxOutputTokens,
            temperature: 0.4,
            signal: input.signal,
            requestId: input.requestId,
          },
          (text) => {
            streamed = true;
            emit({ type: "delta", text });
          }
        );
        if (result.toolCalls.length === 0) {
          deps.log?.(`provider=${provider.id} model=${result.model} steps=${step + 1} tools=${ledger.calls.map((entry) => entry.name).join(",") || "none"}`);
          if (!result.text.trim()) throw new ProviderError(provider.id, 502, "empty answer");
          return { text: result.text, provider: (ASSISTANT_PROVIDERS as readonly string[]).includes(provider.id) ? (provider.id as AssistantProvider) : "mock" };
        }
        turns.push({ role: "model", text: result.text, toolCalls: result.toolCalls, raw: result.raw, provider: provider.id });
        const results = await Promise.all(result.toolCalls.slice(0, 4).map(async (entry) => ({ id: entry.id, name: entry.name, result: await runTool(entry.name, entry.args, context, ledger) })));
        turns.push({ role: "tool", results });
        onPreview();
      }
    } catch (error) {
      if (input.signal?.aborted) throw error;
      deps.log?.(`provider=${provider.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (streamed) {
        emit({ type: "reset" });
        streamed = false;
      }
      // A provider's own tool-call turns can't be replayed to another provider; keep only plain turns.
      for (let index = turns.length - 1; index >= 0; index--) {
        const turn = turns[index];
        if (turn.role === "tool" || (turn.role === "model" && turn.toolCalls.length > 0)) turns.splice(index, 1);
      }
      if (error instanceof ProviderError && !error.retryable) break;
    }
  }
  return null;
}

/**
 * One assistant turn. Common asks take the fast path: GalaTayo's own search runs in code, the cards stream
 * at once, and one model call ranks and phrases them. Everything else goes through the tool-calling loop.
 * Both end in a structured response built only from what the tools returned. Events stream through `emit`.
 */
export async function runAssistant(input: AgentInput, deps: AgentDeps, emit: (event: AssistantEvent) => void = () => undefined): Promise<AssistantResponse> {
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (stage: string) => {
    timings[stage] ??= Date.now() - started;
  };
  const today = deps.today?.() ?? manilaToday();
  const context: ToolContext = { ...deps.tools, todayIso: today.iso };
  const places = visiblePlaces(deps.tools.places);
  const ledger = newLedger();
  const memory = updateMemory(input.memory, input.message, places, today.iso);

  const finish = (partial: Pick<AssistantResponse, "text" | "refused" | "provider"> & { clarify?: string | null }): AssistantResponse => {
    const cards = partial.refused || partial.clarify ? [] : selectCards(partial.text, ledger, input.mode, memory, deps.imageUrl);
    const itinerary = partial.refused ? null : buildItinerary(ledger);
    memory.lastPlaceSlugs = cards.length ? cards.map((card) => card.slug) : memory.lastPlaceSlugs;
    const response: AssistantResponse = {
      version: 1,
      requestId: input.requestId,
      mode: input.mode,
      language: "english",
      text: partial.text,
      refused: partial.refused,
      clarify: partial.clarify ?? null,
      places: cards,
      map: buildMap(cards),
      itinerary,
      weather: partial.refused ? null : buildWeather(ledger),
      chips: buildChips({ mode: input.mode, memory, cards, hasItinerary: Boolean(itinerary), refused: partial.refused }),
      memory,
      attribution: ledger.verified.size
        ? { google: true, sources: [...ledger.verified.values()].filter((entry) => entry.uri).map((entry) => ({ title: entry.title ?? "Google Maps", uri: entry.uri! })) }
        : null,
      provider: partial.provider,
    };
    const validation = validateAssistantResponse(response);
    if (!validation.ok) deps.log?.(`schema problems: ${validation.errors.join("; ")}`);
    return response;
  };
  const logTimings = (path: string) => {
    mark("total");
    deps.log?.(`timings path=${path} ${Object.entries(timings).map(([stage, ms]) => `${stage}=${ms}`).join(" ")}`);
  };

  const guard = guardMessage(input.message);
  if (guard.action === "refuse") {
    const response = finish({ text: refusalText(), refused: true, provider: "fallback" });
    emit({ type: "final", response });
    logTimings("refused");
    return response;
  }

  const firstTurn = input.history.length === 0 && !input.memory.area && input.memory.budgetPerHead === null;
  const key = cacheKey(input.mode, input.message);
  const plan = planTools(input.message, memory, places, input.history, guard.injection);
  // The search is local and takes milliseconds: run it while the cache lookup is in flight.
  const prefetch = plan ? runToolPlan(plan, context, ledger) : null;
  if (firstTurn && deps.cache) {
    const cached = await deps.cache.get(key).catch(() => null);
    mark("cache");
    if (cached && validateAssistantResponse(cached).ok) {
      const response: AssistantResponse = { ...cached, requestId: input.requestId, provider: "cache" };
      emit({ type: "places", places: response.places, map: response.map });
      emit({ type: "delta", text: response.text });
      emit({ type: "final", response });
      logTimings("cache");
      return response;
    }
  }

  emit({ type: "status", text: "Searching GalaTayo places…" });
  let previewSent = false;
  const preview = () => {
    if (previewSent || ledger.ranked.length === 0) return;
    previewSent = true;
    const cards = selectCards("", ledger, input.mode, memory, deps.imageUrl);
    emit({ type: "places", places: cards, map: buildMap(cards) });
    mark("places");
  };
  const emitText = (event: AssistantEvent) => {
    if (event.type === "delta") mark("firstDelta");
    emit(event);
  };

  const system = buildSystemPrompt({ mode: input.mode, memory, todayIso: today.iso, weekday: today.weekday, injection: guard.injection, grounded: Boolean(plan) });
  const maxOutputTokens = input.mode === "map" ? 450 : 700;
  const allTools = context.verify ? [...TOOL_DECLARATIONS, VERIFY_TOOL] : TOOL_DECLARATIONS;
  const history = historyTurns(input.history);
  const message = redactPersonalData(input.message);
  let call: ModelCall;
  if (prefetch) {
    const { results, slow } = await prefetch;
    mark("search");
    preview();
    await Promise.race([slow, wait(WEATHER_WAIT_MS)]);
    mark("weather");
    // The search, plan and weather already ran; the model may still look up one place or what's near it.
    const extraTools = allTools.filter((tool) => !["search_places", "plan_day", "weather"].includes(tool.name));
    call = { system, turns: [...history, { role: "user", text: groundedUserTurn(message, results) }], tools: extraTools, forceTool: false, grounded: true, maxOutputTokens };
  } else {
    const forceTool = classifyAskAiScope(input.message) === "allow" && !guard.injection && input.message.trim().split(/\s+/).length > 1;
    call = { system, turns: [...history, { role: "user", text: message }], tools: allTools, forceTool, grounded: false, maxOutputTokens };
  }
  const outcome = await runModel(input, deps, context, ledger, call, emitText, preview);
  mark("model");

  let response: AssistantResponse;
  if (outcome && outcome.text.includes(OFF_TOPIC_MARKER)) {
    const line = outcome.text.split(OFF_TOPIC_MARKER)[1]?.trim();
    response = finish({ text: line && line.length > 10 ? sanitizeAnswer(line, newLedger(), places, input.message) : refusalText(), refused: true, provider: outcome.provider });
  } else if (outcome) {
    const text = sanitizeAnswer(outcome.text, ledger, places, input.message);
    const clarify = ledger.calls.length === 0 && /\?\s*$/.test(text) ? text.split(/(?<=[.!])\s+/).pop() ?? text : null;
    response = finish({ text, refused: false, clarify, provider: outcome.provider });
  } else {
    // No model reachable: answer from the tools alone, honestly and briefly.
    if (!prefetch) {
      await runTool("search_places", fallbackSearchArgs(input.message, memory), context, ledger);
      if (PLAN_WORDS.test(input.message)) await runTool("plan_day", { request: [input.message, memory.area].filter(Boolean).join(" ") }, context, ledger);
      if (memory.indoor) await runTool("weather", memory.area ? { area: memory.area } : {}, context, ledger);
    }
    const cards = selectCards("", ledger, input.mode, memory, deps.imageUrl);
    const text = fallbackText(cards, memory, buildWeather(ledger), ledger.inArea);
    emit({ type: "delta", text });
    response = finish({ text, refused: false, provider: "fallback" });
  }

  emit({ type: "final", response });
  logTimings(prefetch ? "fast" : "agent");
  // Not cached: weather goes stale, and Google Maps terms allow caching place ids only, never grounded results.
  const cacheable = firstTurn && deps.cache && !response.refused && response.provider !== "fallback" && !ledger.weather && ledger.verified.size === 0 && response.places.length > 0;
  if (cacheable) await deps.cache!.set(key, response, CACHE_TTL_SECONDS).catch(() => undefined);
  return response;
}
