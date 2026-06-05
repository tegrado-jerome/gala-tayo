import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { validateJwt } from "../utils/auth";
import {
  checkAskAiUsage,
  consumeAskAiUsage,
} from "../services/askAiUsageService";

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
}

function handleAskAiUsageError(error: unknown, action: "check" | "consume"): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";
  const isUnauthorized = isAuthError(message);

  return {
    status: isUnauthorized ? 401 : 500,
    jsonBody: {
      message: isUnauthorized
        ? "Unauthorized."
        : `Failed to ${action} Ask AI usage.`,
      error: message,
    },
  };
}

export async function checkAskAiUsageRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Checking Ask AI usage...");

  try {
    const user = await validateJwt(request);
    const usage = await checkAskAiUsage(user.id);

    return {
      status: 200,
      jsonBody: usage,
    };
  } catch (error) {
    context.error(error);

    return handleAskAiUsageError(error, "check");
  }
}

export async function consumeAskAiUsageRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Consuming Ask AI usage...");

  try {
    const user = await validateJwt(request);
    const usage = await consumeAskAiUsage(user.id);

    if (!usage.allowed) {
      return {
        status: 429,
        jsonBody: usage,
      };
    }

    return {
      status: 200,
      jsonBody: usage,
    };
  } catch (error) {
    context.error(error);

    return handleAskAiUsageError(error, "consume");
  }
}

app.http("askAiUsageCheck", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ask-ai/usage/check",
  handler: checkAskAiUsageRequest,
});

app.http("askAiUsageConsume", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/usage/consume",
  handler: consumeAskAiUsageRequest,
});
