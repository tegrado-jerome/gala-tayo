import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import {
  AskAiUsageResult,
  checkAskAiUsage,
  consumeAskAiUsage,
} from "../services/askAiUsageService";
import {
  AskAiMapsServiceError,
  searchAskAiMaps,
} from "../services/askAiMapsService";
import { validateJwt } from "../utils/auth";

const ASK_AI_MAPS_COOLDOWN_MS = 10_000;
const ASK_AI_MAPS_REQUEST_ID_HEADER = "x-ask-ai-maps-request-id";
const lastAskAiMapsRequestAtByUser = new Map<string, number>();
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

type AskAiMapsRequestBody = {
  query?: unknown;
  selectedChips?: unknown;
  nearMe?: unknown;
  openNow?: unknown;
  userLocation?: unknown;
};

type AskAiMapsRequestLogContext = {
  requestId: string;
  startedAt: number;
  query: string | null;
};

function isAuthError(message: string): boolean {
  return (
    message === "Missing Authorization header." ||
    message === "Invalid Authorization header format." ||
    message === "Invalid or expired token."
  );
}

function friendlyProviderMessage(status: number): string {
  if (status === 404) {
    return "No places matched that request right now.";
  }

  if (status === 429 || status === 503) {
    return "Ask AI Map Finder is busy right now. Please try again in a moment.";
  }

  if (status === 504) {
    return "Ask AI Map Finder took too long to respond. Please try again.";
  }

  if (status >= 500) {
    return "Ask AI Map Finder is temporarily unavailable. Please try again later.";
  }

  return "Ask AI Map Finder could not load places right now. Please try again.";
}

function logAskAiMaps(context: InvocationContext, message: string) {
  context.log(message);
}

function isDebugMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

function getRequestId(request: HttpRequest): string {
  const headerRequestId = request.headers.get("x-request-id")?.trim();
  return headerRequestId || randomUUID();
}

function buildResponseHeaders(requestId: string) {
  return {
    ...NO_STORE_HEADERS,
    [ASK_AI_MAPS_REQUEST_ID_HEADER]: requestId,
  };
}

function buildUsagePayload(
  askAi?: AskAiUsageResult,
  liveSearch?: AskAiUsageResult
) {
  return askAi && liveSearch
    ? {
        usage: {
          askAi,
          liveSearch,
        },
      }
    : {};
}

function logAskAiMapsError(
  context: InvocationContext,
  error: unknown,
  meta: AskAiMapsRequestLogContext
) {
  const serviceError = error instanceof AskAiMapsServiceError ? error : null;
  const elapsedMs = Date.now() - meta.startedAt;
  const logPayload = {
    requestId: meta.requestId,
    query: meta.query,
    selectedModel: serviceError?.model ?? null,
    elapsedMs,
    providerStatus: serviceError?.providerStatus ?? null,
    responseStatus: serviceError?.status ?? null,
    errorCode: serviceError?.code ?? null,
    errorStage: serviceError?.stage ?? null,
    errorMessage: error instanceof Error ? error.message : String(error),
    details: serviceError?.details ?? null,
  };

  context.error(`[Ask AI Maps] Request failed ${JSON.stringify(logPayload)}`);

  if (isDebugMode() && error instanceof Error && error.stack) {
    context.error(error.stack);
  }
}

function handleAskAiMapsError(
  error: unknown,
  meta: AskAiMapsRequestLogContext,
  usage?: {
    askAi: AskAiUsageResult;
    liveSearch: AskAiUsageResult;
  }
): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (isAuthError(message)) {
    return {
      status: 401,
      headers: buildResponseHeaders(meta.requestId),
      jsonBody: {
        ok: false,
        error: "ASK_AI_MAPS_UNAUTHORIZED",
        message: "Unauthorized.",
        requestId: meta.requestId,
        places: [],
        sources: [],
        ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
      },
    };
  }

  if (error instanceof AskAiMapsServiceError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;

    return {
      status,
      headers: buildResponseHeaders(meta.requestId),
      jsonBody: {
        ok: false,
        error:
          error.code ||
          (status === 504
            ? "ASK_AI_MAPS_TIMEOUT"
            : status === 429
              ? "ASK_AI_MAPS_RATE_LIMIT"
              : "ASK_AI_MAPS_ERROR"),
        message:
          status === 400
            ? message
            : error.code === "ASK_AI_MAPS_PARSE_ERROR" ||
                error.code === "ASK_AI_MAPS_NORMALIZATION_ERROR"
              ? "Ask AI Map Finder could not process places right now. Please try again."
              : friendlyProviderMessage(status),
        requestId: meta.requestId,
        places: [],
        sources: [],
        ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
      },
    };
  }

  return {
    status: 500,
    headers: buildResponseHeaders(meta.requestId),
    jsonBody: {
      ok: false,
      error: "ASK_AI_MAPS_ERROR",
      message: "Failed to load Ask AI map results.",
      requestId: meta.requestId,
      places: [],
      sources: [],
      ...buildUsagePayload(usage?.askAi, usage?.liveSearch),
    },
  };
}

async function getRequestBody(request: HttpRequest): Promise<AskAiMapsRequestBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as AskAiMapsRequestBody) : {};
  } catch {
    return {};
  }
}

function getStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBooleanField(value: unknown): boolean {
  return value === true;
}

function getSelectedChips(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function getUserLocation(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { latitude?: unknown; longitude?: unknown };
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function checkCooldown(userId: string, requestId: string): HttpResponseInit | null {
  const now = Date.now();
  const lastRequestAt = lastAskAiMapsRequestAtByUser.get(userId) ?? 0;
  const elapsed = now - lastRequestAt;

  if (elapsed < ASK_AI_MAPS_COOLDOWN_MS) {
    return {
      status: 429,
      headers: buildResponseHeaders(requestId),
      jsonBody: {
        ok: false,
        error: "ASK_AI_MAPS_COOLDOWN",
        message: "Ask AI Map Finder is busy right now. Please try again in a moment.",
        requestId,
        places: [],
        sources: [],
      },
    };
  }

  lastAskAiMapsRequestAtByUser.set(userId, now);
  return null;
}

export async function askAiMapsRequest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = getRequestId(request);
  const startedAt = Date.now();
  const body = await getRequestBody(request);
  const query = getStringField(body.query);
  const requestLogContext: AskAiMapsRequestLogContext = {
    requestId,
    startedAt,
    query,
  };

  try {
    const user = await validateJwt(request);

    if (!query) {
      return {
        status: 400,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "ASK_AI_MAPS_BAD_REQUEST",
          message: "Query is required.",
          requestId,
          places: [],
          sources: [],
        },
      };
    }

    const cooldownResponse = checkCooldown(user.id, requestId);

    if (cooldownResponse) {
      return cooldownResponse;
    }

    const [askAiUsageBefore, liveSearchUsageBefore] = await Promise.all([
      checkAskAiUsage(user.id, "ask_ai_total"),
      checkAskAiUsage(user.id, "live_search"),
    ]);

    if (!askAiUsageBefore.allowed) {
      return {
        status: 429,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "ASK_AI_MAPS_DAILY_LIMIT",
          message: "Daily Ask AI limit reached.",
          requestId,
          places: [],
          sources: [],
          usage: { askAi: askAiUsageBefore, liveSearch: liveSearchUsageBefore },
        },
      };
    }

    if (!liveSearchUsageBefore.allowed) {
      return {
        status: 429,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "ASK_AI_MAPS_LIVE_SEARCH_LIMIT",
          message: "Daily Ask AI live search limit reached.",
          requestId,
          places: [],
          sources: [],
          usage: { askAi: askAiUsageBefore, liveSearch: liveSearchUsageBefore },
        },
      };
    }

    try {
      const result = await searchAskAiMaps({
        query,
        selectedChips: getSelectedChips(body.selectedChips),
        nearMe: getBooleanField(body.nearMe),
        openNow: getBooleanField(body.openNow),
        userLocation: getUserLocation(body.userLocation),
      }, {
        log: (message: string) => logAskAiMaps(context, `[Ask AI Maps][${requestId}] ${message}`),
      });

      const [askAiUsageAfter, liveSearchUsageAfter] = await Promise.all([
        consumeAskAiUsage(user.id, "ask_ai_total"),
        consumeAskAiUsage(user.id, "live_search"),
      ]);

      return {
        status: 200,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: true,
          requestId,
          mode: result.mode,
          answerText: result.answerText,
          places: result.places,
          sources: result.sources,
          modelUsed: result.modelUsed ?? null,
          ...(result.emptyReason ? { emptyReason: result.emptyReason } : {}),
          ...(result.message ? { message: result.message } : {}),
          latencyMs: result.latencyMs,
          usage: {
            askAi: askAiUsageAfter,
            liveSearch: liveSearchUsageAfter,
          },
        },
      };
    } catch (error) {
      lastAskAiMapsRequestAtByUser.delete(user.id);
      logAskAiMapsError(context, error, requestLogContext);

      return handleAskAiMapsError(error, requestLogContext, {
        askAi: askAiUsageBefore,
        liveSearch: liveSearchUsageBefore,
      });
    }
  } catch (error) {
    logAskAiMapsError(context, error, requestLogContext);
    return handleAskAiMapsError(error, requestLogContext);
  }
}

app.http("askAiMaps", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/maps",
  handler: askAiMapsRequest,
});
