import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  checkAskAiUsage,
  consumeAskAiUsage,
} from "../services/askAiUsageService";
import {
  AskAiServiceError,
  generateAskAiAnswer,
  planAskAiRequest,
} from "../services/askAiService";
import { validateJwt } from "../utils/auth";

const ASK_AI_COOLDOWN_MS = 10_000;
const ASK_AI_DEBUG = process.env.ASK_AI_DEBUG === "true";
const lastAskAiRequestAtByUser = new Map<string, number>();

type AskAiRequestBody = {
  question?: unknown;
  placeSlug?: unknown;
};

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
}

function friendlyProviderMessage(status: number): string {
  if (status === 429 || status === 503) {
    return "Ask AI is busy right now. Please try again in a moment.";
  }

  if (status >= 500) {
    return "Ask AI is temporarily unavailable. Please try again later.";
  }

  return "Ask AI could not answer that right now. Please try again.";
}

function handleAskAiError(error: unknown): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (isAuthError(message)) {
    return {
      status: 401,
      jsonBody: {
        message: "Unauthorized.",
      },
    };
  }

  if (error instanceof AskAiServiceError) {
    return {
      status: error.status >= 400 && error.status < 500 ? error.status : 502,
      jsonBody: {
        message: friendlyProviderMessage(error.status),
      },
    };
  }

  return {
    status: 500,
    jsonBody: {
      message: "Failed to ask AI.",
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

function checkCooldown(userId: string): HttpResponseInit | null {
  const now = Date.now();
  const lastRequestAt = lastAskAiRequestAtByUser.get(userId) ?? 0;
  const elapsed = now - lastRequestAt;

  if (elapsed < ASK_AI_COOLDOWN_MS) {
    return {
      status: 429,
      jsonBody: {
        message: "Ask AI is busy right now. Please try again in a moment.",
      },
    };
  }

  lastAskAiRequestAtByUser.set(userId, now);
  return null;
}

export async function askAiRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Handling Ask AI request...");

  try {
    const user = await validateJwt(request);
    const body = await getRequestBody(request);
    const question = getStringField(body.question);
    const placeSlug = getStringField(body.placeSlug) ?? undefined;

    if (!question) {
      return {
        status: 400,
        jsonBody: {
          message: "Question is required.",
        },
      };
    }

    const cooldownResponse = checkCooldown(user.id);

    if (cooldownResponse) {
      return cooldownResponse;
    }

    const askAiUsageBefore = await checkAskAiUsage(user.id, "ask_ai_total");

    if (!askAiUsageBefore.allowed) {
      return {
        status: 429,
        jsonBody: {
          message: "Daily Ask AI limit reached.",
          usage: {
            askAi: askAiUsageBefore,
            liveSearch: await checkAskAiUsage(user.id, "live_search"),
          },
        },
      };
    }

    const liveSearchUsageBefore = await checkAskAiUsage(user.id, "live_search");
    const responsePlan = planAskAiRequest(question);
    const liveSearchIntentDetected = responsePlan.intent === "live_current_info";
    const shouldUseLiveSearchTool =
      liveSearchUsageBefore.allowed && responsePlan.groundingEnabled;

    if (ASK_AI_DEBUG) {
      context.log("Ask AI Live Search routing", {
        liveSearchIntentDetected,
        liveSearchQuotaAvailable: liveSearchUsageBefore.allowed,
        sourceBackedProviderPathUsed: shouldUseLiveSearchTool,
        responsePlan,
      });
    }

    const answerResult = await generateAskAiAnswer({
      question,
      placeSlug,
      enableLiveSearch: shouldUseLiveSearchTool,
    });

    context.log("Ask AI source metadata", {
      intent: responsePlan.intent,
      answerFormat: responsePlan.answerFormat,
      groundingEnabled: responsePlan.groundingEnabled,
      sourceStatus: answerResult.sourceStatus,
      webSearchQueriesCount: answerResult.webSearchQueriesCount,
      groundingChunksCount: answerResult.groundingChunksCount,
      groundingSupportsCount: answerResult.groundingSupportsCount,
      modelUsed: answerResult.modelUsed,
      latencyMs: answerResult.latencyMs,
      fallbackUsed: answerResult.fallbackUsed,
      answerRejectedDueToLeakageOrTruncation:
        answerResult.answerRejectedDueToLeakageOrTruncation,
    });

    const askAiUsageAfter = await consumeAskAiUsage(user.id, "ask_ai_total");

    const liveSearchUsageAfter = answerResult.usedLiveSearch
      ? await consumeAskAiUsage(user.id, "live_search")
      : await checkAskAiUsage(user.id, "live_search");

    return {
      status: 200,
      jsonBody: {
        answer: answerResult.answer,
        sources: answerResult.sources,
        usage: {
          askAi: askAiUsageAfter,
          liveSearch: liveSearchUsageAfter,
        },
      },
    };
  } catch (error) {
    context.error(error);

    return handleAskAiError(error);
  }
}

app.http("askAi", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai",
  handler: askAiRequest,
});
