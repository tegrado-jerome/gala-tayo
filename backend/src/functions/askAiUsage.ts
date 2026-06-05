import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { validateJwt } from "../utils/auth";
import { consumeAskAiUsage } from "../services/askAiUsageService";

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

    const message = error instanceof Error ? error.message : "Unknown error";
    const isUnauthorized =
      message === "Missing Authorization header." ||
      message === "Invalid Authorization header format." ||
      message === "Invalid or expired token.";

    return {
      status: isUnauthorized ? 401 : 500,
      jsonBody: {
        message: isUnauthorized ? "Unauthorized." : "Failed to consume Ask AI usage.",
        error: message,
      },
    };
  }
}

app.http("askAiUsageConsume", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/usage/consume",
  handler: consumeAskAiUsageRequest,
});
