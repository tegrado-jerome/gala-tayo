import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import {
  consumeAskAiUsageForActor,
  refundAskAiUsageForActor,
} from "../services/askAiUsageService";
import {
  normalizeAskAiMapQuery,
  shouldNormalizeAskAiMapPrompt,
} from "../services/askAiMapQueryNormalizer";
import {
  searchAskAiMaps,
} from "../services/askAiMapsHybridService";
import {
  AskAiMapsRequestLogContext,
  buildResponseHeaders,
  getBooleanField,
  getRequestBody,
  getSelectedChips,
  getStringField,
  getUserLocation,
  handleAskAiMapsError,
  logAskAiMapsError,
  uniqueQueries,
} from "./askAiMaps/askAiMapsHelpers";
import { resolveAskAiActor } from "../utils/askAiActor";

function logAskAiMaps(context: InvocationContext, message: string) {
  context.log(message);
}

function getRequestId(request: HttpRequest): string {
  const headerRequestId = request.headers.get("x-request-id")?.trim();
  return headerRequestId || randomUUID();
}

function isGuestIdentityError(message: string): boolean {
  return message === "Missing Ask AI guest identifier.";
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
    const actor = await resolveAskAiActor(request);

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

    const aiUsage = await consumeAskAiUsageForActor(actor, "ask_ai_maps");

    if (!aiUsage.allowed) {
      context.log(
        `[Ask AI Maps] quota blocked: usageType=ask_ai_maps remaining=0 actorId=${actor.id} actorKind=${actor.kind}`
      );

      return {
        status: 429,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "daily_ai_limit_reached",
          message: "You have reached your Ask AI Maps daily limit.",
          usage: {
            allowed: aiUsage.allowed,
            usageType: aiUsage.usageType,
            dailyLimit: aiUsage.dailyLimit,
            requestCount: aiUsage.requestCount,
            remaining: aiUsage.remaining,
            resetsAt: aiUsage.resetsAt,
          },
          requestId,
          places: [],
          sources: [],
        },
      };
    }
    context.log(
      `[Ask AI Maps] quota consumed: remaining=${aiUsage.remaining} actorId=${actor.id} actorKind=${actor.kind}`
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
            allowed: aiUsage.allowed,
            usageType: aiUsage.usageType,
            dailyLimit: aiUsage.dailyLimit,
            requestCount: aiUsage.requestCount,
            remaining: aiUsage.remaining,
            resetsAt: aiUsage.resetsAt,
          },
        },
      };
    } catch (error) {
      context.log("[Ask AI Usage] refunding map usage after provider failure.");
      await refundAskAiUsageForActor({ actor, usageType: "ask_ai_maps" });
      logAskAiMapsError(context, error, requestLogContext);

      return handleAskAiMapsError(error, requestLogContext, aiUsage);
    }
  } catch (error) {
    logAskAiMapsError(context, error, requestLogContext);

    const message = error instanceof Error ? error.message : "Unknown error";
    if (isGuestIdentityError(message)) {
      return {
        status: 400,
        headers: buildResponseHeaders(requestId),
        jsonBody: {
          ok: false,
          error: "ASK_AI_GUEST_ID_REQUIRED",
          message,
          requestId,
          places: [],
          sources: [],
        },
      };
    }

    return handleAskAiMapsError(error, requestLogContext);
  }
}

app.http("askAiMaps", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ask-ai/maps",
  handler: askAiMapsRequest,
});
