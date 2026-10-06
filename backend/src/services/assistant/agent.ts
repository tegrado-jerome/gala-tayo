import { createHash } from "node:crypto";
import type { NormalizedPlace } from "../../domain/places";
import { classifyAskAiScope } from "../../functions/askAiStrictPgGuard";
import { manilaToday } from "../galaPlanDraftPlanner";
import { buildChips, buildItinerary, buildMap, buildWeather, fallbackText, sanitizeAnswer, selectCards } from "./compose";
import { guardMessage, redactPersonalData, refusalText } from "./guard";
import { detectLanguage, type ReplyLanguage } from "./language";
import { updateMemory } from "./memory";
import { buildSystemPrompt, OFF_TOPIC_MARKER } from "./prompt";
import { ProviderError, type AssistantModelProvider, type ModelTurn } from "./providers/types";
import { ASSISTANT_PROVIDERS, validateAssistantResponse, type AssistantEvent, type AssistantMemory, type AssistantMode, type AssistantProvider, type AssistantResponse } from "./schema";
import { newLedger, queryTokens, runTool, TOOL_DECLARATIONS, VERIFY_TOOL, visiblePlaces, type ToolContext, type ToolLedger } from "./tools";

const MAX_STEPS = 4;
const MAX_HISTORY_TURNS = 6;
const CACHE_TTL_SECONDS = 30 * 60;

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

const ENGLISH_HINTS = /\b(something|cheaper|more|what|where|how|any|nearby|please|thanks|show|else|other|instead)\b/i;

/** Short follow-ups ("BGC", "ok sige") keep the language the user has been using. */
export function replyLanguage(message: string, history: AgentHistoryTurn[]): ReplyLanguage {
  const detected = detectLanguage(message);
  if (detected === "taglish" || message.trim().split(/\s+/).length > 3 || ENGLISH_HINTS.test(message)) return detected;
  const lastUser = [...history].reverse().find((turn) => turn.role === "user");
  return lastUser ? detectLanguage(lastUser.content) : detected;
}

export function cacheKey(mode: AssistantMode, language: ReplyLanguage, message: string) {
  const normalised = message.toLowerCase().replace(/[^\p{L}\p{N}₱ ]+/gu, " ").replace(/\s+/g, " ").trim();
  return `assistant:answer:v1:${mode}:${language}:${createHash("sha256").update(normalised).digest("hex").slice(0, 32)}`;
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

const PLAN_WORDS = /\b(itinerary|day plan|plan|schedule|whole day|buong araw|2 days|weekend trip|day trip)\b/i;

type ModelOutcome = { text: string; provider: AssistantProvider };

async function runModel(
  input: AgentInput,
  deps: AgentDeps,
  context: ToolContext,
  ledger: ToolLedger,
  system: string,
  forceTool: boolean,
  emit: (event: AssistantEvent) => void,
  onPreview: () => void
): Promise<ModelOutcome | null> {
  const tools = context.verify ? [...TOOL_DECLARATIONS, VERIFY_TOOL] : TOOL_DECLARATIONS;
  const turns: ModelTurn[] = [...historyTurns(input.history), { role: "user", text: redactPersonalData(input.message) }];
  let streamed = false;

  for (const provider of deps.providers) {
    if (!(await provider.available().catch(() => false))) continue;
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const last = step === MAX_STEPS - 1;
        const result = await provider.step(
          {
            system,
            turns,
            tools: last ? [] : tools,
            toolChoice: step === 0 && forceTool && !turns.some((turn) => turn.role === "tool") ? "required" : "auto",
            maxOutputTokens: input.mode === "map" ? 450 : 700,
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
          deps.log?.(`provider=${provider.id} model=${result.model} steps=${step + 1} tools=${ledger.calls.map((call) => call.name).join(",") || "none"}`);
          if (!result.text.trim()) throw new ProviderError(provider.id, 502, "empty answer");
          return { text: result.text, provider: (ASSISTANT_PROVIDERS as readonly string[]).includes(provider.id) ? (provider.id as AssistantProvider) : "mock" };
        }
        turns.push({ role: "model", text: result.text, toolCalls: result.toolCalls, raw: result.raw, provider: provider.id });
        const results = await Promise.all(result.toolCalls.slice(0, 4).map(async (call) => ({ id: call.id, name: call.name, result: await runTool(call.name, call.args, context, ledger) })));
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
 * One assistant turn: guard, memory, tool-calling model (with provider fallbacks), then a structured
 * response built from what the tools returned. Events stream through `emit` as they happen.
 */
export async function runAssistant(input: AgentInput, deps: AgentDeps, emit: (event: AssistantEvent) => void = () => undefined): Promise<AssistantResponse> {
  const today = deps.today?.() ?? manilaToday();
  const context: ToolContext = { ...deps.tools, todayIso: today.iso };
  const places = visiblePlaces(deps.tools.places);
  const language = replyLanguage(input.message, input.history);
  const ledger = newLedger();
  const memory = updateMemory(input.memory, input.message, places, today.iso);

  const finish = (partial: Pick<AssistantResponse, "text" | "refused" | "provider"> & { clarify?: string | null }): AssistantResponse => {
    const cards = partial.refused || partial.clarify ? [] : selectCards(partial.text, ledger, input.mode, memory, language, deps.imageUrl);
    const itinerary = partial.refused ? null : buildItinerary(ledger);
    memory.lastPlaceSlugs = cards.length ? cards.map((card) => card.slug) : memory.lastPlaceSlugs;
    const response: AssistantResponse = {
      version: 1,
      requestId: input.requestId,
      mode: input.mode,
      language,
      text: partial.text,
      refused: partial.refused,
      clarify: partial.clarify ?? null,
      places: cards,
      map: buildMap(cards),
      itinerary,
      weather: partial.refused ? null : buildWeather(ledger),
      chips: buildChips({ language, mode: input.mode, memory, cards, hasItinerary: Boolean(itinerary), refused: partial.refused }),
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

  const guard = guardMessage(input.message);
  if (guard.action === "refuse") {
    const response = finish({ text: refusalText(language), refused: true, provider: "fallback" });
    emit({ type: "final", response });
    return response;
  }

  const firstTurn = input.history.length === 0 && !input.memory.area && input.memory.budgetPerHead === null;
  const key = cacheKey(input.mode, language, input.message);
  if (firstTurn && deps.cache) {
    const cached = await deps.cache.get(key).catch(() => null);
    if (cached && validateAssistantResponse(cached).ok) {
      const response: AssistantResponse = { ...cached, requestId: input.requestId, provider: "cache" };
      emit({ type: "places", places: response.places, map: response.map });
      emit({ type: "delta", text: response.text });
      emit({ type: "final", response });
      return response;
    }
  }

  emit({ type: "status", text: language === "taglish" ? "Naghahanap sa GalaTayo places…" : "Searching GalaTayo places…" });
  let previewSent = false;
  const preview = () => {
    if (previewSent || ledger.ranked.length === 0) return;
    previewSent = true;
    const cards = selectCards("", ledger, input.mode, memory, language, deps.imageUrl);
    emit({ type: "places", places: cards, map: buildMap(cards) });
  };

  const system = buildSystemPrompt({ mode: input.mode, language, memory, todayIso: today.iso, weekday: today.weekday, injection: guard.injection });
  const forceTool = classifyAskAiScope(input.message) === "allow" && !guard.injection && input.message.trim().split(/\s+/).length > 1;
  const outcome = await runModel(input, deps, context, ledger, system, forceTool, emit, preview);

  let response: AssistantResponse;
  if (outcome && outcome.text.includes(OFF_TOPIC_MARKER)) {
    const line = outcome.text.split(OFF_TOPIC_MARKER)[1]?.trim();
    response = finish({ text: line && line.length > 10 ? sanitizeAnswer(line, newLedger(), places, input.message) : refusalText(language), refused: true, provider: outcome.provider });
  } else if (outcome) {
    const text = sanitizeAnswer(outcome.text, ledger, places, input.message);
    const clarify = ledger.calls.length === 0 && /\?\s*$/.test(text) ? text.split(/(?<=[.!])\s+/).pop() ?? text : null;
    response = finish({ text, refused: false, clarify, provider: outcome.provider });
  } else {
    // No model reachable: answer from the tools alone, honestly and briefly.
    await runTool("search_places", fallbackSearchArgs(input.message, memory), context, ledger);
    if (PLAN_WORDS.test(input.message)) await runTool("plan_day", { request: [input.message, memory.area].filter(Boolean).join(" ") }, context, ledger);
    if (memory.indoor) await runTool("weather", memory.area ? { area: memory.area } : {}, context, ledger);
    const cards = selectCards("", ledger, input.mode, memory, language, deps.imageUrl);
    const text = fallbackText(cards, memory, language, buildWeather(ledger));
    emit({ type: "delta", text });
    response = finish({ text, refused: false, provider: "fallback" });
  }

  emit({ type: "final", response });
  // Not cached: weather goes stale, and Google Maps terms allow caching place ids only, never grounded results.
  const cacheable = firstTurn && deps.cache && !response.refused && response.provider !== "fallback" && !ledger.weather && ledger.verified.size === 0 && response.places.length > 0;
  if (cacheable) await deps.cache!.set(key, response, CACHE_TTL_SECONDS).catch(() => undefined);
  return response;
}
