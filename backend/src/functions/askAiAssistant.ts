import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces, type NormalizedPlace } from "../domain/places";
import { runAssistant, type AgentDeps, type AgentHistoryTurn, type AnswerCache } from "../services/assistant/agent";
import recorded from "../services/assistant/fixtures/conversations.json";
import { mapsVerifyEnabled, verifyPlaceOnGoogleMaps } from "../services/assistant/mapsVerify";
import { parseClientMemory } from "../services/assistant/memory";
import { GeminiProvider } from "../services/assistant/providers/gemini";
import { MockProvider, type RecordedConversation } from "../services/assistant/providers/mock";
import { cloudflareProvider, groqProvider, openRouterProvider } from "../services/assistant/providers/openaiCompatible";
import type { AssistantModelProvider } from "../services/assistant/providers/types";
import type { AssistantEvent, AssistantMode, AssistantResponse } from "../services/assistant/schema";
import { fetchWeather } from "../services/assistant/weather";
import { consumeAskAiUsageForActor, refundAskAiUsageForActor, type AskAiUsageResult } from "../services/askAiUsageService";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import { getJsonCacheValue, setJsonCacheValue } from "../services/redisCacheService";
import { isAskAiIpAllowed, resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
import { cancelAskAiRequest, getAskAiRequestId, markAskAiRequestUsageRefunded, registerAskAiRequest } from "../utils/askAiCancellation";
import { hdPhotoKey } from "../utils/hdPhotos";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { buildDailyLimitMessage } from "./askAi";

// Streams NDJSON as it is written. If the host can't stream, the same lines arrive in one piece and clients still parse them.
// ASSISTANT_HTTP_STREAM=off turns it off without a code change.
if (process.env.ASSISTANT_HTTP_STREAM !== "off") {
  try {
    app.setup({ enableHttpStream: true });
  } catch {
    // Setup is locked once the host has started; responses are then buffered.
  }
}

const MAX_MESSAGE_LENGTH = 500;
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function parseHistory(value: unknown): AgentHistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is { role: "user" | "assistant"; content: string } => {
      const candidate = turn as Record<string, unknown>;
      return (candidate?.role === "user" || candidate?.role === "assistant") && typeof candidate.content === "string" && candidate.content.trim() !== "";
    })
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, 1200) }))
    .slice(-8);
}

/** Gemini first, then Groq, then optional providers that switch on when their keys exist. ASSISTANT_PROVIDER=mock replays fixtures offline. */
function buildProviders(): AssistantModelProvider[] {
  if (process.env.ASSISTANT_PROVIDER === "mock") return [new MockProvider((recorded as { conversations: RecordedConversation[] }).conversations)];
  return [new GeminiProvider(), groqProvider(), cloudflareProvider(), openRouterProvider()];
}

const providers = buildProviders();

async function loadPlaces(): Promise<NormalizedPlace[]> {
  if (process.env.ASSISTANT_PLACES === "fixtures") {
    // Loaded only on demand: the snapshot is large and production never needs it.
    return (require("../services/assistant/fixtures/testPlaces") as typeof import("../services/assistant/fixtures/testPlaces")).allFixturePlaces;
  }
  return getActiveNormalizedPlaces();
}

const answerCache: AnswerCache = {
  get: (key) => getJsonCacheValue<AssistantResponse>(key),
  set: async (key, value, ttlSeconds) => {
    await setJsonCacheValue(key, value, { ttlSeconds });
  },
};

/** Card photos: the curated HD photo, else the place's approved upload (looked up once per answer). */
async function imageLookup(places: NormalizedPlace[]) {
  const withoutHd = places.filter((place) => !hdPhotoKey(place.slug)).map((place) => place.id);
  const uploads = withoutHd.length ? await getApprovedPlaceImagesByPlaceIds(withoutHd).catch(() => new Map()) : new Map();
  return (place: NormalizedPlace) => buildImageUrl(hdPhotoKey(place.slug) ?? uploads.get(place.id)?.[0]?.storage_key ?? null);
}

function usageBody(usage: AskAiUsageResult) {
  return { allowed: usage.allowed, usageType: usage.usageType, dailyLimit: usage.dailyLimit, requestCount: usage.requestCount, remaining: usage.remaining, resetsAt: usage.resetsAt };
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): HttpResponseInit {
  return { status, headers: { "Content-Type": "application/json", ...NO_STORE }, jsonBody: { ok: false, code, error: code, message, ...extra } };
}

export async function postAskAiAssistant(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const requestId = getAskAiRequestId(request, randomUUID());
  let actor: AskAiActor;
  try {
    actor = await resolveAskAiActor(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return /guest identifier/i.test(message) ? errorResponse(400, "ASK_AI_GUEST_ID_REQUIRED", message) : errorResponse(401, "UNAUTHORIZED", "Sign in again to use Tara.");
  }
  if (!(await isAskAiIpAllowed(request, actor))) {
    return errorResponse(429, "rate_limited", "Too many Ask AI requests. Try again in a few minutes.");
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > MAX_MESSAGE_LENGTH) return errorResponse(400, "BAD_MESSAGE", `Write 1 to ${MAX_MESSAGE_LENGTH} characters.`);
  const mode: AssistantMode = body.mode === "map" ? "map" : "chat";
  const stream = body.stream !== false;
  const usageType = mode === "map" ? "ask_ai_maps" : "chatbot_ai";
  const history = parseHistory(body.history);
  const memory = parseClientMemory(body.memory);

  // Usage is taken before the model runs and handed back when no model answered (refusal, cache, fallback, failure).
  const usage = await consumeAskAiUsageForActor(actor, usageType);
  if (!usage.allowed) {
    return errorResponse(429, "daily_ai_limit_reached", buildDailyLimitMessage(actor, usage.dailyLimit), { usage: usageBody(usage) });
  }
  const cancellation = registerAskAiRequest(requestId, { actor, usageType });
  const refund = async () => {
    if (!markAskAiRequestUsageRefunded(requestId)) return;
    await refundAskAiUsageForActor({ actor, usageType }).catch(() => undefined);
    usage.remaining += 1;
    usage.requestCount = Math.max(0, usage.requestCount - 1);
  };

  const run = async (emit: (event: AssistantEvent) => void) => {
    try {
      const places = await loadPlaces();
      const deps: AgentDeps = {
        providers,
        tools: {
          places,
          weather: (latitude, longitude) => fetchWeather(latitude, longitude),
          ...(mapsVerifyEnabled() ? { verify: verifyPlaceOnGoogleMaps } : {}),
        },
        imageUrl: (place) => buildImageUrl(hdPhotoKey(place.slug)),
        cache: answerCache,
        log: (line) => context.log(`[Assistant] requestId=${requestId} ${line}`),
      };
      // Photos for the places this answer shows are looked up after the tools pick them.
      const uploadsFor = async (response: AssistantResponse) => {
        const shown = places.filter((place) => response.places.some((card) => card.slug === place.slug));
        const lookup = await imageLookup(shown);
        for (const card of response.places) {
          const place = shown.find((entry) => entry.slug === card.slug);
          if (place && !card.imageUrl) card.imageUrl = lookup(place);
        }
      };
      const response = await runAssistant({ message, mode, history, memory, requestId, signal: cancellation.signal }, deps, (event) => {
        if (event.type !== "final") emit(event);
      });
      await uploadsFor(response);
      if (response.refused || response.provider === "fallback" || response.provider === "cache") await refund();
      context.log(`[Assistant] requestId=${requestId} mode=${mode} provider=${response.provider} places=${response.places.length} refused=${response.refused}`);
      emit({ type: "final", response: { ...response, usage: usageBody(usage) } });
    } catch (error) {
      await refund();
      const cancelled = cancellation.signal.aborted;
      context.error(`[Assistant] requestId=${requestId} failed: ${error instanceof Error ? error.message : String(error)}`);
      emit({ type: "error", code: cancelled ? "ASK_AI_REQUEST_CANCELLED" : "AI_PROVIDER_TEMPORARY_ERROR", message: cancelled ? "Cancelled." : "Tara had a hiccup. Try again in a moment.", usage: usageBody(usage) });
    } finally {
      cancellation.unregister();
    }
  };

  if (!stream) {
    const events: AssistantEvent[] = [];
    await run((event) => events.push(event));
    const final = events.find((event) => event.type === "final");
    const failure = events.find((event) => event.type === "error");
    return final && final.type === "final"
      ? { status: 200, headers: { "Content-Type": "application/json", ...NO_STORE }, jsonBody: { ok: true, response: final.response } }
      : errorResponse(503, failure && failure.type === "error" ? failure.code : "AI_PROVIDER_TEMPORARY_ERROR", "Tara had a hiccup. Try again in a moment.");
  }

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      await run((event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)));
      controller.close();
    },
    cancel() {
      // The client went away (closed the chat or pressed stop): stop the model and refund.
      cancelAskAiRequest(requestId);
    },
  });
  return { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", ...NO_STORE }, body: body$ };
}

app.http("askAiAssistant", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/assistant",
  handler: postAskAiAssistant,
});
