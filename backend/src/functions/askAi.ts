import { randomUUID } from "node:crypto";
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  checkAskAiUsageForActorType,
  consumeAskAiUsageForActor,
  refundAskAiUsageForActor,
  type AskAiUsageResult,
} from "../services/askAiUsageService";
import {
  GroqChatProviderError,
  type AskAiPromptGuardDecision,
  type GroqConversationMessage,
  classifyAskAiPromptWithGroq,
  generateFromGroq,
} from "../services/groqChatProvider";
import {
  getAskAiRequestId,
  isAskAiRequestCancelledError,
  markAskAiRequestUsageRefunded,
  registerAskAiRequest,
} from "../utils/askAiCancellation";
import { resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
import { getActiveNormalizedPlaces, type NormalizedPlace } from "../domain/places";
import { detectLocationIntent, findUncoveredArea, hasLocation, selectCandidates } from "../services/galaPlanDraftPlanner";
import { resolveAreaSlug } from "../utils/seoPlaces";
import {
  ASK_AI_SCOPE_REJECTION_MESSAGE,
  classifyAskAiScope,
  normalizeAskAiPromptForStrictPgGuard,
} from "./askAiStrictPgGuard";

type AskAiRequestBody = {
  question?: unknown;
  placeSlug?: unknown;
  conversationHistory?: unknown;
};

const MAX_CONVERSATION_HISTORY_MESSAGES = 8;
const MAX_USER_HISTORY_CONTENT_LENGTH = 2000;
const MAX_ASSISTANT_HISTORY_CONTENT_LENGTH = 1200;
type AskAiPromptGuardResult = {
  accepted: boolean;
};

export function normalizeAskAiPromptForGuard(value: string): string {
  return normalizeAskAiPromptForStrictPgGuard(value);
}

export function evaluateAskAiPromptGuardDecision(
  decision: AskAiPromptGuardDecision
): AskAiPromptGuardResult {
  // Refuse only what the classifier says is off-topic or unsafe; several valid asks in one message are fine.
  const hasInvalidActions = decision.invalidActions.length > 0;
  const hasRejectedAction = decision.actions.some((action) => !action.isAllowed);

  if (
    hasInvalidActions ||
    hasRejectedAction ||
    decision.label === "unrelated" ||
    decision.label === "deceptive" ||
    decision.label === "harmful" ||
    (!decision.accepted && !decision.fillerOnly)
  ) {
    return {
      accepted: false,
    };
  }

  return {
    accepted: true,
  };
}

/**
 * Scope check before answering. Plain outing/food/travel questions (any language mix) pass
 * without a model call; clear off-topic or unsafe ones are refused; only unclear ones go to
 * the model guard. If that guard is unavailable the message goes through, because the answer
 * model refuses clearly unrelated questions on its own.
 */
export async function shouldAcceptAskAiPrompt({
  message,
  requestId,
  context,
}: {
  message: string;
  requestId: string;
  context: InvocationContext;
}): Promise<AskAiPromptGuardResult> {
  const scope = classifyAskAiScope(message);
  context.log(`[AskAI Chatbot] scope requestId=${requestId} decision=${scope}`);
  if (scope !== "unsure") {
    return { accepted: scope === "allow" };
  }

  try {
    const decision = await classifyAskAiPromptWithGroq({
      message: normalizeAskAiPromptForGuard(message),
      requestId,
    });

    context.log(
      `[AskAI Chatbot] prompt-guard decision requestId=${requestId} accepted=${decision.accepted} label=${decision.label} fillerOnly=${decision.fillerOnly} actions=${decision.actions.length} invalidActions=${decision.invalidActions.length} confidence=${decision.confidence ?? "n/a"} reason=${decision.reason}`
    );

    return evaluateAskAiPromptGuardDecision(decision);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    context.warn(`[AskAI Chatbot] prompt-guard unavailable requestId=${requestId} reason=${reason}; letting the answer model decide`);
    return { accepted: true };
  }
}

function buildScopeRejectionResponse(requestId: string): HttpResponseInit {
  return {
    status: 200,
    headers: JSON_HEADERS,
    jsonBody: {
      ok: true,
      answer: ASK_AI_SCOPE_REJECTION_MESSAGE,
      sources: [],
      requestId,
    },
  };
}

async function getRequestBody(request: HttpRequest): Promise<AskAiRequestBody> {
  try {
    const body = await request.json();

    return body && typeof body === "object" ? (body as AskAiRequestBody) : {};
  } catch {
    return {};
  }
}

function getStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function trimHistoryContent(role: "user" | "assistant", content: string): string {
  const maxLength =
    role === "assistant"
      ? MAX_ASSISTANT_HISTORY_CONTENT_LENGTH
      : MAX_USER_HISTORY_CONTENT_LENGTH;

  return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content;
}

const MAX_GROUNDING_PLACES = 16;
const MAX_SOURCES = 6;

// Recommendations must come from GalaTayo's own places so every suggestion has a real page to open.
function buildPlaceGrounding(places: NormalizedPlace[]) {
  if (places.length === 0) return undefined;
  const lines = places.map((place) => {
    const budget = place.budget_min != null ? (place.budget_min === 0 ? "free" : `from PHP ${place.budget_min}`) : "budget unknown";
    const goodFor = place.good_for.slice(0, 3).join(", ");
    const where = [place.area, place.city].filter(Boolean).join(", ") || "Philippines";
    return `- ${place.name} | ${place.category ?? "Place"} | ${where} | ${budget}${goodFor ? ` | good for ${goodFor}` : ""}`;
  });
  const header =
    "GALATAYO PLACES in or near the area asked about (name | category | area | budget). Recommend only these, written exactly as shown. If none are in the exact neighbourhood, suggest the closest ones and say they are nearby. Never invent places and never mention this list.";
  return [header, ...lines].join("\n");
}

/** GalaTayo places named in the answer, in the order they appear, as in-app links. */
export function findMentionedPlaces(answer: string, places: NormalizedPlace[]) {
  const text = answer.toLowerCase();
  return places
    .filter((place) => place.name && place.slug)
    .map((place) => ({ place, index: text.indexOf(place.name.toLowerCase()) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)
    .slice(0, MAX_SOURCES)
    .map(({ place }) => ({
      title: place.name,
      url: `/places/${encodeURIComponent(resolveAreaSlug(place.city, place.area).slug)}/${encodeURIComponent(place.slug)}`,
    }));
}

/**
 * A follow-up like "may kainan malapit dun?" names no place, so ground it in the
 * latest area the user named earlier instead of falling back to all of Metro Manila.
 */
export function resolveLocationContext(message: string, history: GroqConversationMessage[], places: NormalizedPlace[]) {
  if (hasLocation(detectLocationIntent(places, message))) return message;
  const earlier = [...history].reverse().find((turn) => turn.role === "user" && hasLocation(detectLocationIntent(places, turn.content)));
  return earlier ? `${message} ${earlier.content}` : message;
}

function toUsageBody(usage: AskAiUsageResult) {
  return {
    allowed: usage.allowed,
    usageType: usage.usageType,
    dailyLimit: usage.dailyLimit,
    requestCount: usage.requestCount,
    remaining: usage.remaining,
    resetsAt: usage.resetsAt,
  };
}

/** States the real limit so the message never contradicts the usage pill (guests and members have different limits). */
export function buildDailyLimitMessage(actor: AskAiActor, dailyLimit: number) {
  return actor.kind === "guest"
    ? `You've used all ${dailyLimit} free AI requests for today.`
    : `You've used all ${dailyLimit} AI requests for today. They reset at midnight.`;
}

function getConversationHistory(value: unknown): GroqConversationMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap<GroqConversationMessage>((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as Record<string, unknown>;
      const role = candidate.role;
      const content = getStringField(candidate.content);

      if ((role !== "user" && role !== "assistant") || !content) {
        return [];
      }

      return [{
        role,
        content: trimHistoryContent(role, content),
      }];
    })
    .slice(-MAX_CONVERSATION_HISTORY_MESSAGES);
}

function withoutDuplicatedLatestUserMessage(
  conversationHistory: GroqConversationMessage[],
  message: string
): GroqConversationMessage[] {
  const lastMessage = conversationHistory.at(-1);
  const comparableLatestUserMessage = trimHistoryContent("user", message);

  if (lastMessage?.role === "user" && lastMessage.content === comparableLatestUserMessage) {
    return conversationHistory.slice(0, -1);
  }

  return conversationHistory;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

function getErrorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return 500;
}

function isGuestIdentityError(message: string): boolean {
  return message === "Missing Ask AI guest identifier.";
}

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
}

export async function postAskAiChatbot(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = getAskAiRequestId(request, randomUUID());
  let quotaConsumedUserId: string | null = null;
  let resolvedActor: AskAiActor | null = null;
  let unregisterCancellation: (() => void) | null = null;

  try {
    context.log(`[AskAI Chatbot] REQUEST STARTED requestId=${requestId}`);

    resolvedActor = await resolveAskAiActor(request);
    const body = await getRequestBody(request);
    const message =
      getStringField(body.question) ??
      getStringField((body as Record<string, unknown>).message);

    if (!message) {
      return {
        status: 400,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: "Message is required.",
          requestId,
        },
      };
    }

    const promptGuard = await shouldAcceptAskAiPrompt({
      message,
      requestId,
      context,
    });

    if (!promptGuard.accepted) {
      context.log(
        `[AskAI Chatbot] scope rejected requestId=${requestId} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
      );
      return buildScopeRejectionResponse(requestId);
    }

    const conversationHistory = withoutDuplicatedLatestUserMessage(
      getConversationHistory(body.conversationHistory),
      message
    );

    const aiUsage = await consumeAskAiUsageForActor(resolvedActor!, "chatbot_ai");

    if (!aiUsage.allowed) {
      const doubleCheck = await checkAskAiUsageForActorType(resolvedActor!, "chatbot_ai").catch(() => null);

      if (!doubleCheck?.allowed || doubleCheck.remaining <= 0) {
        context.log(
          `[AskAI Chatbot] quota blocked: usageType=chatbot_ai remaining=0 actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
        );

        return {
          status: 429,
          headers: JSON_HEADERS,
          jsonBody: {
            ok: false,
            error: "daily_ai_limit_reached",
            message: buildDailyLimitMessage(resolvedActor!, aiUsage.dailyLimit),
            usage: toUsageBody(aiUsage),
            requestId,
          },
        };
      }

      context.warn(
        `[AskAI Chatbot] RPC quota block overridden: requestCount=${doubleCheck.requestCount} remaining=${doubleCheck.remaining} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
      );
      Object.assign(aiUsage, { allowed: true, remaining: doubleCheck.remaining, requestCount: doubleCheck.requestCount });
    }

    quotaConsumedUserId = resolvedActor!.id;

    context.log(
      `[AskAI Chatbot] quota consumed: remaining=${aiUsage.remaining} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
    );

    const cancellation = registerAskAiRequest(requestId, {
      actor: resolvedActor!,
      usageType: "chatbot_ai",
    });
    unregisterCancellation = cancellation.unregister;

    const places = await getActiveNormalizedPlaces();
    const locationText = resolveLocationContext(message, conversationHistory, places);
    const uncoveredArea = findUncoveredArea(places, locationText);
    const candidates = uncoveredArea ? [] : selectCandidates(places, message, MAX_GROUNDING_PLACES, locationText);
    const answer = await generateFromGroq({
      message,
      conversationHistory,
      requestId,
      signal: cancellation.signal,
      groundingContext: uncoveredArea
        ? `GalaTayo has no listed places in ${uncoveredArea} yet. Do not name specific venues there; give general tips (local food to try, areas, timing, commute) and mention GalaTayo is still adding places there.`
        : buildPlaceGrounding(candidates),
    });
    const sources = findMentionedPlaces(answer, candidates);

    context.log(
      `[AskAI Chatbot] provider=groq requestId=${requestId} REQUEST COMPLETED answerLength=${answer.length} sources=${sources.length}`
    );

    return {
      status: 200,
      headers: JSON_HEADERS,
      jsonBody: {
        ok: true,
        answer,
        sources,
        usage: toUsageBody(aiUsage),
        requestId,
      },
    };
  } catch (error) {
    if (quotaConsumedUserId && markAskAiRequestUsageRefunded(requestId)) {
      context.log("[AskAI Chatbot] refunding usage after provider failure.");
      await refundAskAiUsageForActor({
        actor: resolvedActor ?? { kind: "guest", id: quotaConsumedUserId },
        usageType: "chatbot_ai",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    context.error(
      `[AskAI Chatbot] REQUEST FAILED requestId=${requestId} reason=${message}`
    );
    context.error(error);

    if (isGuestIdentityError(message)) {
      return {
        status: 400,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: message,
          requestId,
        },
      };
    }

    if (isAuthError(message)) {
      return {
        status: 401,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: "Unauthorized.",
          requestId,
        },
      };
    }

    if (
      isAskAiRequestCancelledError(error) ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"))
    ) {
      const isCancelled = isAskAiRequestCancelledError(error);
      return {
        status: isCancelled ? 499 : 504,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: isCancelled
            ? "Ask AI request was cancelled."
            : "The AI model had a temporary issue. Please try again in a moment.",
          errorCode: isCancelled
            ? "ASK_AI_REQUEST_CANCELLED"
            : "AI_PROVIDER_TEMPORARY_ERROR",
          userMessage:
            isCancelled
              ? "Ask AI request was cancelled."
              : "The AI model had a temporary issue. Please try again in a moment.",
          requestId,
        },
      };
    }

    const providerError =
      error instanceof GroqChatProviderError ? error : null;

    if (providerError) {
      return {
        // Provider trouble (including its rate limits) is temporary: 503 so clients offer Retry, never a daily-limit message.
        status: 503,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: providerError.userMessage,
          errorCode: providerError.errorCode,
          userMessage: providerError.userMessage,
          requestId,
        },
      };
    }

    const status = getErrorStatus(error);

    if (status === 429) {
      return {
        status: 429,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: "AI limit reached. Please try again later.",
          errorCode: "AI_PROVIDER_RATE_LIMITED",
          userMessage: "AI limit reached. Please try again later.",
          requestId,
        },
      };
    }

    if (status >= 500) {
      return {
        status: 503,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: "The AI model had a temporary issue. Please try again in a moment.",
          errorCode: "AI_PROVIDER_TEMPORARY_ERROR",
          userMessage:
            "The AI model had a temporary issue. Please try again in a moment.",
          requestId,
        },
      };
    }

    return {
      status: 500,
      headers: JSON_HEADERS,
      jsonBody: {
        ok: false,
        error: "The AI model had a temporary issue. Please try again in a moment.",
        errorCode: "AI_PROVIDER_TEMPORARY_ERROR",
        userMessage:
          "The AI model had a temporary issue. Please try again in a moment.",
        requestId,
      },
    };
  } finally {
    unregisterCancellation?.();
  }
}

app.http("askAiChatbot", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/chatbot",
  handler: postAskAiChatbot,
});

