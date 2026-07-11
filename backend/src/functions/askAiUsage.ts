import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { resolveAskAiActor } from "../utils/askAiActor";
import {
  AskAiUsageTypeInput,
  checkAskAiUsageForActor,
  checkAskAiUsageForActorType,
  consumeAskAiUsageForActor,
  isAskAiUsageTypeInput,
} from "../services/askAiUsageService";

type UsageTypeParseResult =
  | { ok: true; usageType: AskAiUsageTypeInput | null }
  | { ok: false; response: HttpResponseInit };

function handleAskAiUsageError(error: unknown, action: "check" | "consume"): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";
  const isUnauthorized = message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token.";
  const isGuestIdentityError = message === "Missing Ask AI guest identifier.";

  return {
    status: isUnauthorized ? 401 : isGuestIdentityError ? 400 : 500,
    jsonBody: {
      message: isUnauthorized
        ? "Unauthorized."
        : isGuestIdentityError
          ? "Guest Ask AI identifier is required."
        : `Failed to ${action} Ask AI usage.`,
      error: message,
    },
  };
}

function invalidUsageTypeResponse(): HttpResponseInit {
  return {
    status: 400,
    jsonBody: {
      message: "Invalid Ask AI usage type.",
      allowedTypes: ["ask_ai_maps", "chatbot_ai", "ask_ai_total", "live_search", "ai_guide"],
    },
  };
}

function parseUsageType(value: unknown, required: boolean): UsageTypeParseResult {
  if (value === null || value === undefined || value === "") {
    if (required) {
      return { ok: false, response: invalidUsageTypeResponse() };
    }

    return { ok: true, usageType: null };
  }

  if (!isAskAiUsageTypeInput(value)) {
    return { ok: false, response: invalidUsageTypeResponse() };
  }

  return { ok: true, usageType: value };
}

function getCheckUsageType(request: HttpRequest): UsageTypeParseResult {
  return parseUsageType(request.query.get("type"), false);
}

async function getConsumeUsageType(request: HttpRequest): Promise<UsageTypeParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return parseUsageType(null, true);
  }

  const type =
    body &&
    typeof body === "object" &&
    "type" in body
      ? (body as { type?: unknown }).type
      : null;

  return parseUsageType(type, true);
}

export async function checkAskAiUsageRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Checking Ask AI usage...");

  try {
    const actor = await resolveAskAiActor(request);
    const usageTypeResult = getCheckUsageType(request);

    if (usageTypeResult.ok === false) {
      return usageTypeResult.response;
    }

    const usage = usageTypeResult.usageType
      ? await checkAskAiUsageForActorType(actor, usageTypeResult.usageType)
      : await checkAskAiUsageForActor(actor);

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
    const actor = await resolveAskAiActor(request);
    const usageTypeResult = await getConsumeUsageType(request);

    if (usageTypeResult.ok === false) {
      return usageTypeResult.response;
    }

    const currentUsage = await checkAskAiUsageForActorType(actor, usageTypeResult.usageType);

    if (!currentUsage.allowed) {
      return {
        status: 429,
        jsonBody: currentUsage,
      };
    }

    const usage = await consumeAskAiUsageForActor(actor, usageTypeResult.usageType);

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
