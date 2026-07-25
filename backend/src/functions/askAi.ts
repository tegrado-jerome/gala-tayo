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
} from "../services/askAiUsageService";
import {
  GroqChatProviderError,
  type GroqConversationMessage,
  classifyAskAiPromptWithGroq,
  generateFromGroq,
  sanitizeChatbotAnswer,
} from "../services/groqChatProvider";
import {
  getAskAiRequestId,
  isAskAiRequestCancelledError,
  markAskAiRequestUsageRefunded,
  registerAskAiRequest,
} from "../utils/askAiCancellation";
import { resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";

type AskAiRequestBody = {
  question?: unknown;
  placeSlug?: unknown;
  conversationHistory?: unknown;
};

const MAX_CONVERSATION_HISTORY_MESSAGES = 8;
const MAX_USER_HISTORY_CONTENT_LENGTH = 2000;
const MAX_ASSISTANT_HISTORY_CONTENT_LENGTH = 1200;
const ASK_AI_SCOPE_REJECTION_MESSAGE =
  "GalaTayo AI will not answer this question because it does not align with the purpose of GalaTayo.";

type AskAiPromptGuardResult = {
  accepted: boolean;
};

type AskAiDeterministicGuardResult = AskAiPromptGuardResult & {
  reason: string;
};

const ASK_AI_OBVIOUS_INVALID_ACTION_PATTERNS = [
  /\b(?:what(?:'s| is)|solve|calculate|compute)\b[\s\S]{0,80}\d+\s*(?:\+|-|\*|\/|x)\s*\d+/i,
  /\b\d+\s*(?:\+|-|\*|\/|x)\s*\d+\b/i,
  /\b(?:recipe|resipe|cook|bake|lutuin|iluto)\b/i,
  /\b(?:credentials?|passwords?|passcodes?|tokens?|api\s*keys?|secrets?|private\s+keys?)\b/i,
  /\b(?:code|program|debug|sql|javascript|typescript|python|html|css)\b/i,
  /\b(?:essay|poem|song|cover\s+letter|resume|email)\b/i,
  /\b(?:when|what\s+date|kailan|kelan)\b[\s\S]{0,80}\b(?:birth|born|birthday|pinanganak|kaarawan)\b/i,
  /\b(?:birth|born|birthday|pinanganak|kaarawan)\b[\s\S]{0,80}\b(?:rizal|jose\s+rizal)\b/i,
];

const ASK_AI_OBVIOUS_HARMFUL_ACTION_PATTERNS = [
  /\b(?:jailbreak|prompt\s*inject|ignore\s+(?:your|previous|system)\s+instructions?)\b/i,
  /\b(?:hack|exploit|bypass|malware|virus|phishing|keylogger|ransomware|steal)\b/i,
];

const ASK_AI_CLEAR_GALATAYO_ACTION_PATTERNS = [
  /\b(?:where|saan)\b[\s\S]{0,100}\b(?:museum|park|mall|cafe|restaurant|place|spot|destination|ayala|bgc|makati)\b/i,
  /\b(?:directions?|route|commute|parking|map|navigate|pumunta|puntahan|papunta)\b/i,
  /\b(?:plan|planning|itinerary|budget|schedule|nearby|food\s*trip|date|hangout|lakad|gala)\b/i,
];

const ASK_AI_TASK_SHAPE_PATTERN =
  /\b(?:what|when|where|who|why|how|which|saan|kailan|kelan|sino|bakit|paano|make|write|create|give|show|tell|answer|gawan|gumawa|explain|solve|calculate|compute|list|summarize)\b/i;

const ASK_AI_CONVERSATIONAL_FILLER_TOKENS = new Set([
  "ah",
  "alright",
  "gets",
  "get",
  "got",
  "hello",
  "hey",
  "hi",
  "hmm",
  "i",
  "it",
  "itt",
  "lang",
  "na",
  "naman",
  "nice",
  "now",
  "okay",
  "ok",
  "oki",
  "po",
  "sige",
  "sure",
  "thanks",
  "thank",
  "uh",
  "um",
  "yeah",
  "yep",
  "yes",
  "you",
]);

function normalizeScopeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+\-*/]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScopeToken(value: string): string {
  return value.replace(/([a-z])\1{2,}/gi, "$1$1");
}

function getScopeTokens(normalizedMessage: string): string[] {
  return normalizedMessage
    .split(" ")
    .map(normalizeScopeToken)
    .filter(Boolean);
}

function isLikelyHarmlessConversationalFiller(
  normalizedMessage: string,
  originalMessage: string
): boolean {
  const tokens = getScopeTokens(normalizedMessage);

  if (tokens.length === 0 || tokens.length > 8) {
    return false;
  }

  if (/[?]/.test(originalMessage) || ASK_AI_TASK_SHAPE_PATTERN.test(normalizedMessage)) {
    return false;
  }

  return tokens.every((token) =>
    ASK_AI_CONVERSATIONAL_FILLER_TOKENS.has(token) ||
    (token.length <= 3 && /^[a-z]+$/i.test(token))
  );
}

function getDeterministicAskAiPromptDecision(
  message: string
): AskAiDeterministicGuardResult | null {
  const normalizedMessage = normalizeScopeText(message);

  if (!normalizedMessage) {
    return null;
  }

  const hasInvalidAction = ASK_AI_OBVIOUS_INVALID_ACTION_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
  const hasHarmfulAction = ASK_AI_OBVIOUS_HARMFUL_ACTION_PATTERNS.some((pattern) =>
    pattern.test(message)
  );
  const hasGalaTayoAction = ASK_AI_CLEAR_GALATAYO_ACTION_PATTERNS.some((pattern) =>
    pattern.test(message)
  );

  if (hasHarmfulAction) {
    return {
      accepted: false,
      reason: "obvious harmful or jailbreak-like action",
    };
  }

  if (hasInvalidAction) {
    return {
      accepted: false,
      reason: hasGalaTayoAction
        ? "obvious mixed prompt with unrelated action"
        : "obvious unrelated action",
    };
  }

  if (hasGalaTayoAction) {
    return {
      accepted: true,
      reason: "obvious single GalaTayo planning or location action",
    };
  }

  if (isLikelyHarmlessConversationalFiller(normalizedMessage, message)) {
    return {
      accepted: true,
      reason: "harmless conversational filler without requested action",
    };
  }

  return null;
}

async function shouldAcceptAskAiPrompt({
  message,
  requestId,
  context,
}: {
  message: string;
  requestId: string;
  context: InvocationContext;
}): Promise<AskAiPromptGuardResult> {
  const deterministicDecision = getDeterministicAskAiPromptDecision(message);

  if (deterministicDecision) {
    context.log(
      `[AskAI Chatbot] deterministic prompt-guard decision requestId=${requestId} accepted=${deterministicDecision.accepted} reason=${deterministicDecision.reason}`
    );
    return {
      accepted: deterministicDecision.accepted,
    };
  }

  try {
    const decision = await classifyAskAiPromptWithGroq({
      message,
      requestId,
    });

    context.log(
      `[AskAI Chatbot] prompt-guard decision requestId=${requestId} accepted=${decision.accepted} label=${decision.label} mixedIntent=${decision.mixedIntent} secondaryIntentPresent=${decision.secondaryIntentPresent} confidence=${decision.confidence ?? "n/a"} reason=${decision.reason}`
    );

    if (
      !decision.accepted ||
      decision.mixedIntent ||
      decision.secondaryIntentPresent ||
      decision.label === "unrelated" ||
      decision.label === "deceptive" ||
      decision.label === "harmful"
    ) {
      return {
        accepted: false,
      };
    }

    return {
      accepted: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    context.warn(
      `[AskAI Chatbot] prompt-guard unavailable requestId=${requestId} reason=${reason}; rejecting by default`
    );
    return {
      accepted: false,
    };
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

      if (doubleCheck && doubleCheck.allowed && doubleCheck.remaining > 0) {
        context.warn(
          `[AskAI Chatbot] RPC quota block overridden: requestCount=${doubleCheck.requestCount} remaining=${doubleCheck.remaining} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
        );
        const correctedAiUsage = aiUsage;
        correctedAiUsage.allowed = true;
        correctedAiUsage.remaining = doubleCheck.remaining;
        correctedAiUsage.requestCount = doubleCheck.requestCount;
        context.log(
          `[AskAI Chatbot] quota overridden: remaining=${correctedAiUsage.remaining} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
        );
        quotaConsumedUserId = resolvedActor!.id;
        const cancellation = registerAskAiRequest(requestId, {
          actor: resolvedActor!,
          usageType: "chatbot_ai",
        });
        unregisterCancellation = cancellation.unregister;
        const answer = sanitizeChatbotAnswer(
          await generateFromGroq({
            message,
            conversationHistory,
            requestId,
            signal: cancellation.signal,
          })
        );
        context.log(`[AskAI Chatbot] REQUEST COMPLETED requestId=${requestId}`);
        return {
          status: 200,
          headers: JSON_HEADERS,
          jsonBody: {
            ok: true,
            answer,
            sources: [],
            usage: {
              allowed: correctedAiUsage.allowed,
              usageType: correctedAiUsage.usageType,
              dailyLimit: correctedAiUsage.dailyLimit,
              requestCount: correctedAiUsage.requestCount,
              remaining: correctedAiUsage.remaining,
              resetsAt: correctedAiUsage.resetsAt,
            },
            requestId,
          },
        };
      }

      context.log(
        `[AskAI Chatbot] quota blocked: usageType=chatbot_ai remaining=0 actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
      );

      return {
        status: 429,
        headers: JSON_HEADERS,
        jsonBody: {
          ok: false,
          error: "daily_ai_limit_reached",
          message: "You have reached your Chatbot AI daily limit.",
          usage: {
            allowed: aiUsage.allowed,
            usageType: aiUsage.usageType,
            dailyLimit: aiUsage.dailyLimit,
            requestCount: aiUsage.requestCount,
            remaining: aiUsage.remaining,
            resetsAt: aiUsage.resetsAt,
          },
          requestId,
        },
      };
    }

    quotaConsumedUserId = resolvedActor!.id;

    context.log(
      `[AskAI Chatbot] quota consumed: remaining=${aiUsage.remaining} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind}`
    );

    context.log(
      `[AskAI Chatbot] provider=groq requestId=${requestId} MODEL REQUEST STARTED questionLength=${message.length}`
    );

    const cancellation = registerAskAiRequest(requestId, {
      actor: resolvedActor!,
      usageType: "chatbot_ai",
    });
    unregisterCancellation = cancellation.unregister;

    const answer = sanitizeChatbotAnswer(
      await generateFromGroq({
        message,
        conversationHistory,
        requestId,
        signal: cancellation.signal,
      })
    );

    context.log(
      `[AskAI Chatbot] provider=groq requestId=${requestId} MODEL RESPONSE RECEIVED answerLength=${answer.length}`
    );

    context.log(`[AskAI Chatbot] REQUEST COMPLETED requestId=${requestId}`);

    return {
      status: 200,
      headers: JSON_HEADERS,
      jsonBody: {
        ok: true,
        answer,
        sources: [],
        usage: {
          allowed: aiUsage.allowed,
          usageType: aiUsage.usageType,
          dailyLimit: aiUsage.dailyLimit,
          requestCount: aiUsage.requestCount,
          remaining: aiUsage.remaining,
          resetsAt: aiUsage.resetsAt,
        },
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

    if (providerError?.status === 429) {
      return {
        status: 429,
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

    if (providerError) {
      return {
        status: providerError.status >= 500 ? 503 : providerError.status,
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

