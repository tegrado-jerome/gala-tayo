import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import {
  AskAiUsageResult,
  consumeAskAiUsage,
  refundAskAiUsage,
} from "../services/askAiUsageService";
import {
  normalizeAskAiMapQuery,
  shouldNormalizeAskAiMapPrompt,
} from "../services/askAiMapQueryNormalizer";
import {
  AskAiMapsServiceError,
  searchAskAiMaps,
} from "../services/askAiMapsHybridService";
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

function buildAiUsagePayload(aiUsage?: AskAiUsageResult) {
  return aiUsage
    ? {
        usage: {
          usageType: aiUsage.usageType,
          dailyLimit: aiUsage.dailyLimit,
          requestCount: aiUsage.requestCount,
          remaining: aiUsage.remaining,
          resetsAt: aiUsage.resetsAt,
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
  aiUsage?: AskAiUsageResult
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

function uniqueQueries(values: Array<string | null | undefined>, limit = 3): string[] {
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

    const aiUsage = await consumeAskAiUsage(user.id, "ask_ai_maps");

    if (!aiUsage.allowed) {
      context.log(
        `[Ask AI Maps] quota blocked: usageType=ask_ai_maps remaining=0 userId=${user.id}`
      );

      return {
        status: 429,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "daily_ai_limit_reached",
          usageType: "ask_ai_maps",
          message: "You have reached your Ask AI Maps daily limit.",
          dailyLimit: aiUsage.dailyLimit,
          requestCount: aiUsage.requestCount,
          remaining: aiUsage.remaining,
          resetsAt: aiUsage.resetsAt,
          requestId,
          places: [],
          sources: [],
        },
      };
    }

    context.log(
      `[Ask AI Maps] quota consumed: remaining=${aiUsage.remaining} userId=${user.id}`
    );

    const shouldNormalize = shouldNormalizeAskAiMapPrompt(query);
    let normalizedQuery:
      | Awaited<ReturnType<typeof normalizeAskAiMapQuery>>
      | null = null;

    if (shouldNormalize) {
      try {
        normalizedQuery = await normalizeAskAiMapQuery(query);
        if (!normalizedQuery.coreSearchQuery) {
          normalizedQuery = null;
        }
      } catch (error) {
        context.log(
          `[Ask AI Maps][${requestId}] normalization skipped: ${error instanceof Error ? error.message : String(error)}`
        );
        normalizedQuery = null;
      }
    }

    const candidateQueries = normalizedQuery
      ? uniqueQueries(
          [
            normalizedQuery.coreSearchQuery,
            ...normalizedQuery.fallbackQueries.slice(0, 2),
          ],
          3
        )
      : [query];

    context.log(
      `[Ask AI Maps][${requestId}] normalization_context ${JSON.stringify({
        rawPrompt: query,
        shouldNormalize,
        normalizedCoreSearchQuery: normalizedQuery?.coreSearchQuery ?? null,
        normalizedLocation: normalizedQuery?.location ?? null,
        candidateQueries,
      })}`
    );

    let lastResult = null as Awaited<ReturnType<typeof searchAskAiMaps>> | null;

    try {
      for (let index = 0; index < candidateQueries.length; index += 1) {
        const candidateQuery = candidateQueries[index];

        context.log(
          `[Ask AI Maps][${requestId}] maps_query_attempt ${JSON.stringify({
            attempt: index + 1,
            actualQuerySentToMaps: candidateQuery,
          })}`
        );

        try {
          const result = await searchAskAiMaps(
            {
              query,
              searchQuery: candidateQuery,
              normalizedQuery,
              selectedChips: getSelectedChips(body.selectedChips),
              nearMe: getBooleanField(body.nearMe),
              openNow: getBooleanField(body.openNow),
              userLocation: getUserLocation(body.userLocation),
            },
            {
              log: (message: string) =>
                logAskAiMaps(context, `[Ask AI Maps][${requestId}] ${message}`),
            }
          );

          lastResult = result;

          if (result.places.length > 0 || !normalizedQuery) {
            break;
          }

          if (index < candidateQueries.length - 1) {
            context.log(
              `[Ask AI Maps][${requestId}] fallback_query_used ${JSON.stringify({
                fromQuery: candidateQuery,
                toNextFallback: candidateQueries[index + 1],
              })}`
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isMissingAreaError = /Please add a city or area/i.test(message);

          context.log(
            `[Ask AI Maps][${requestId}] candidate_query_failed ${JSON.stringify({
              attempt: index + 1,
              query: candidateQuery,
              reason: message,
            })}`
          );

          if (!isMissingAreaError || index >= candidateQueries.length - 1) {
            throw error;
          }
        }
      }

      const result = lastResult;

      if (!result) {
        throw new Error("Ask AI Maps could not load places right now.");
      }

      return {
        status: 200,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: true,
          requestId,
          mode: result.mode,
          query: result.query,
          searchArea: result.searchArea,
          answerText: result.answerText,
          summary: result.summary,
          resultMeta: result.resultMeta,
          places: result.places,
          suggestedSearches: result.suggestedSearches,
          sources: result.sources,
          modelUsed: result.modelUsed ?? null,
          explanationSource: result.explanationSource ?? null,
          ...(result.emptyReason ? { emptyReason: result.emptyReason } : {}),
          ...(result.message ? { message: result.message } : {}),
          latencyMs: result.latencyMs,
          usage: {
            usageType: aiUsage.usageType,
            dailyLimit: aiUsage.dailyLimit,
            requestCount: aiUsage.requestCount,
            remaining: aiUsage.remaining,
            resetsAt: aiUsage.resetsAt,
          },
        },
      };
    } catch (error) {
      context.log(
        `[Ask AI Usage] refunding after provider failure: type=ask_ai_maps userId=${user.id}`
      );
      await refundAskAiUsage({ userId: user.id, usageType: "ask_ai_maps" });

      lastAskAiMapsRequestAtByUser.delete(user.id);
      logAskAiMapsError(context, error, requestLogContext);

      return handleAskAiMapsError(error, requestLogContext, aiUsage);
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
