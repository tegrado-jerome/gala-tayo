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
  type AskAiPromptGuardDecision,
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
import {
  ASK_AI_SCOPE_REJECTION_MESSAGE,
  evaluateAskAiStrictPgGuard,
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
  const hasInvalidActions = decision.invalidActions.length > 0;
  const hasRejectedAction = decision.actions.some((action) => !action.isAllowed);

  if (
    !decision.accepted ||
    hasInvalidActions ||
    hasRejectedAction ||
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
  try {
    const normalizedMessage = normalizeAskAiPromptForGuard(message);
    const decision = await classifyAskAiPromptWithGroq({
      message: normalizedMessage,
      requestId,
    });

    context.log(
      `[AskAI Chatbot] prompt-guard decision requestId=${requestId} accepted=${decision.accepted} label=${decision.label} fillerOnly=${decision.fillerOnly} actions=${decision.actions.length} invalidActions=${decision.invalidActions.length} mixedIntent=${decision.mixedIntent} secondaryIntentPresent=${decision.secondaryIntentPresent} confidence=${decision.confidence ?? "n/a"} reason=${decision.reason}`
    );

    return evaluateAskAiPromptGuardDecision(decision);
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

    const strictPgGuard = evaluateAskAiStrictPgGuard(message);

    if (!strictPgGuard.accepted) {
      context.log(
        `[AskAI Chatbot] strict-pg rejected requestId=${requestId} actorId=${resolvedActor!.id} actorKind=${resolvedActor!.kind} pattern=${strictPgGuard.blockedPattern ?? "n/a"}`
      );
      return buildScopeRejectionResponse(requestId);
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

