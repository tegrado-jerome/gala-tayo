import { randomUUID } from "node:crypto";
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  consumeAskAiUsage,
  refundAskAiUsage,
} from "../services/askAiUsageService";
import {
  GroqChatProviderError,
  generateFromGroq,
  sanitizeChatbotAnswer,
} from "../services/groqChatProvider";
import { validateJwt } from "../utils/auth";

type AskAiRequestBody = {
  question?: unknown;
  placeSlug?: unknown;
  conversationHistory?: unknown;
};

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
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

export async function postAskAiChatbot(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = randomUUID();
  let quotaConsumedUserId: string | null = null;

  try {
    context.log(`[AskAI Chatbot] REQUEST STARTED requestId=${requestId}`);

    const user = await validateJwt(request);
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

    const aiUsage = await consumeAskAiUsage(user.id, "chatbot_ai");

    if (!aiUsage.allowed) {
      context.log(
        `[AskAI Chatbot] quota blocked: usageType=chatbot_ai remaining=0 userId=${user.id}`
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

    quotaConsumedUserId = user.id;

    context.log(
      `[AskAI Chatbot] quota consumed: remaining=${aiUsage.remaining} userId=${user.id}`
    );

    context.log(
      `[AskAI Chatbot] provider=groq requestId=${requestId} MODEL REQUEST STARTED questionLength=${message.length}`
    );

    const answer = sanitizeChatbotAnswer(
      await generateFromGroq({
        message,
        requestId,
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
    if (quotaConsumedUserId) {
      context.log(
        `[AskAI Chatbot] refunding after provider failure: userId=${quotaConsumedUserId}`
      );
      await refundAskAiUsage({
        userId: quotaConsumedUserId,
        usageType: "chatbot_ai",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    context.error(
      `[AskAI Chatbot] REQUEST FAILED requestId=${requestId} reason=${message}`
    );
    context.error(error);

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
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return {
        status: 504,
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
  }
}

app.http("askAiChatbot", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/chatbot",
  handler: postAskAiChatbot,
});
