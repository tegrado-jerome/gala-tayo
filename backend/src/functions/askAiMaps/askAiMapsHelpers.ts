import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { AskAiUsageResult } from "../../services/askAiUsageService";
import { AskAiMapsServiceError } from "../../services/askAiMapsHybridService";
import { isAskAiRequestCancelledError } from "../../utils/askAiCancellation";

const ASK_AI_MAPS_REQUEST_ID_HEADER = "x-ask-ai-maps-request-id";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

export type AskAiMapsRequestBody = {
  query?: unknown;
  selectedChips?: unknown;
  nearMe?: unknown;
  openNow?: unknown;
  userLocation?: unknown;
};

export type AskAiMapsRequestLogContext = {
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
    return "Please try again in a moment.";
  }

  if (status === 504) {
    return "Ask AI Map Finder took too long to respond. Please try again.";
  }

  if (status >= 500) {
    return "Ask AI Map Finder is temporarily unavailable. Please try again later.";
  }

  return "Ask AI Map Finder could not load places right now. Please try again.";
}

function isDebugMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function buildResponseHeaders(requestId: string) {
  return {
    ...NO_STORE_HEADERS,
    [ASK_AI_MAPS_REQUEST_ID_HEADER]: requestId,
  };
}

function buildAiUsagePayload(aiUsage?: AskAiUsageResult) {
  return aiUsage
    ? {
        usage: {
          allowed: aiUsage.allowed,
          usageType: aiUsage.usageType,
          dailyLimit: aiUsage.dailyLimit,
          requestCount: aiUsage.requestCount,
          remaining: aiUsage.remaining,
          resetsAt: aiUsage.resetsAt,
        },
      }
    : {};
}

export function logAskAiMapsError(
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

export function handleAskAiMapsError(
  error: unknown,
  meta: AskAiMapsRequestLogContext,
  aiUsage?: AskAiUsageResult
): HttpResponseInit {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (isAskAiRequestCancelledError(error)) {
    return {
      status: 499,
      headers: buildResponseHeaders(meta.requestId),
      jsonBody: {
        ok: false,
        error: "ASK_AI_REQUEST_CANCELLED",
        message: "Ask AI Maps request was cancelled.",
        requestId: meta.requestId,
        places: [],
        sources: [],
        ...buildAiUsagePayload(aiUsage),
      },
    };
  }

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
        ...buildAiUsagePayload(aiUsage),
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
              : error.code === "ASK_AI_MAPS_NO_GROUNDING"
                ? "Ask AI Map Finder ran, but Gemini did not return usable Google Maps-grounded places for that request."
                : friendlyProviderMessage(status),
        requestId: meta.requestId,
        places: [],
        sources: [],
        ...buildAiUsagePayload(aiUsage),
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
      ...buildAiUsagePayload(aiUsage),
    },
  };
}

export async function getRequestBody(request: HttpRequest): Promise<AskAiMapsRequestBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as AskAiMapsRequestBody) : {};
  } catch {
    return {};
  }
}

export function getStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getBooleanField(value: unknown): boolean {
  return value === true;
}

export function getSelectedChips(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function getUserLocation(value: unknown): { latitude: number; longitude: number } | null {
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

export function uniqueQueries(values: Array<string | null | undefined>, limit = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const query = typeof value === "string" ? value.trim() : "";

    if (!query) {
      continue;
    }

    const key = query.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(query);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
