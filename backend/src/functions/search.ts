import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { validateJwt } from "../utils/auth";
import {
  buildGeminiPrompt,
  GeminiUserType,
} from "../utils/geminiPrompt";
import {
  checkGuestRateLimit,
  checkRegisteredUserRateLimit,
} from "../utils/rateLimit";
import { generateSearchCacheKey } from "../utils/cacheKey";
import { normalizeQuery } from "../utils/queryNormalizer";
import { getCache, setCache } from "../services/redisCacheService";
import {
  GeminiServiceError,
  generateGeminiResponse,
} from "../services/geminiService";
import { findAreaById, findCategoryById } from "./filters";
import { PLACE_DETAILS } from "../data/placeDetails";

type SearchRequestBody = {
  query?: unknown;
  category?: unknown;
  area?: unknown;
  budget?: unknown;
  filters?: unknown;
  exploreAll?: unknown;
};

type CachedSearchResult = {
  geminiResponse: string;
  places?: typeof PLACE_DETAILS;
};

type BudgetValue =
  | "any"
  | "under-500"
  | "500-1000"
  | "1000-2000"
  | "2000-plus";

const VALID_BUDGET_VALUES: BudgetValue[] = [
  "any",
  "under-500",
  "500-1000",
  "1000-2000",
  "2000-plus",
];

type SearchUserContext =
  | {
      userType: "guest";
      identifier: string;
      user?: undefined;
    }
  | {
      userType: "registered";
      identifier: string;
      user: {
        id: string;
        email?: string;
      };
    };

function getClientIp(request: HttpRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "127.0.0.1";
}

function getGeminiErrorMessage(status: number): string {
  switch (status) {
    case 403:
      return "Gemini API request was denied.";
    case 429:
      return "Gemini API rate limit reached.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Gemini API is currently unavailable.";
    default:
      return "Failed to generate Gemini response.";
  }
}

function getSearchQuery(body: SearchRequestBody): string {
  const rawQuery = body.query;

  if (typeof rawQuery !== "string") {
    return "";
  }

  return rawQuery.trim();
}

function getOptionalFilterId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function getFiltersPayload(body: SearchRequestBody): Record<string, unknown> {
  if (!body.filters || typeof body.filters !== "object") {
    return {};
  }

  return body.filters as Record<string, unknown>;
}

function getFilterValue(
  body: SearchRequestBody,
  filters: Record<string, unknown>,
  key: "category" | "area" | "budget"
): unknown {
  if (Object.prototype.hasOwnProperty.call(filters, key)) {
    return filters[key];
  }

  return body[key];
}

function getBudgetFilter(value: unknown): BudgetValue {
  if (typeof value !== "string") {
    return "any";
  }

  const trimmedValue = value.trim();

  return VALID_BUDGET_VALUES.includes(trimmedValue as BudgetValue)
    ? (trimmedValue as BudgetValue)
    : "any";
}

async function resolveUserContext(
  request: HttpRequest
): Promise<SearchUserContext> {
  try {
    const user = await validateJwt(request);

    return {
      userType: "registered",
      identifier: user.id,
      user,
    };
  } catch {
    return {
      userType: "guest",
      identifier: getClientIp(request),
    };
  }
}

function checkSearchRateLimit(userContext: SearchUserContext) {
  if (userContext.userType === "registered") {
    return checkRegisteredUserRateLimit(userContext.identifier);
  }

  return checkGuestRateLimit(userContext.identifier);
}

function buildRateLimitExceededResponse(
  userContext: SearchUserContext,
  rateLimitResult: ReturnType<typeof checkGuestRateLimit>
): HttpResponseInit {
  return {
    status: 429,
    jsonBody: {
      message:
        userContext.userType === "registered"
          ? "Registered user daily limit reached."
          : "Guest daily limit reached.",
      userType: userContext.userType,
      promptLogin:
        userContext.userType === "guest" ? rateLimitResult.promptLogin : false,
      remaining: rateLimitResult.remaining,
      limit: rateLimitResult.limit,
      resetAt: rateLimitResult.resetAt,
    },
  };
}

export async function search(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing AI search request...");

  try {
    const body = (await request.json()) as SearchRequestBody;
    const filters = getFiltersPayload(body);
    const query = getSearchQuery(body);
    const categoryId =
      getOptionalFilterId(getFilterValue(body, filters, "category")) ?? "all";
    const areaId =
      getOptionalFilterId(getFilterValue(body, filters, "area")) ?? "all";
    const budget = getBudgetFilter(getFilterValue(body, filters, "budget"));
    const shouldExploreAll = body.exploreAll === true;
    const normalizedQuery = normalizeQuery(query);
    const selectedCategory = findCategoryById(categoryId);
    const selectedArea = findAreaById(areaId);
    const hasSelectedFilters =
      categoryId !== "all" || areaId !== "all" || budget !== "any";
    const isBroadDiscoverySearch =
      shouldExploreAll &&
      !normalizedQuery &&
      categoryId === "all" &&
      areaId === "all" &&
      budget === "any";

    if (!normalizedQuery && !hasSelectedFilters && !isBroadDiscoverySearch) {
      return {
        status: 400,
        jsonBody: {
          message: "Type what you're looking for or choose at least one filter.",
        },
      };
    }

    if (categoryId !== "all" && !selectedCategory) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid category filter.",
        },
      };
    }

    if (areaId !== "all" && !selectedArea) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid area filter.",
        },
      };
    }

    const cacheKey = generateSearchCacheKey(
      normalizedQuery,
      categoryId,
      areaId,
      budget
    );
    const userContext = await resolveUserContext(request);
    const userType: GeminiUserType = userContext.userType;

    if (isBroadDiscoverySearch) {
      return {
        status: 200,
        jsonBody: {
          message: "Broad discovery places served from curated defaults.",
          userType,
          cacheHit: false,
          cacheKey,
          searchMode: "broad-discovery",
          searchContext: {
            query: normalizedQuery,
            category: categoryId,
            area: areaId,
            budget,
          },
          result: {
            geminiResponse: "",
            places: PLACE_DETAILS.slice(0, 10),
          },
        },
      };
    }

    const rateLimitResult = checkSearchRateLimit(userContext);

    if (!rateLimitResult.allowed) {
      return buildRateLimitExceededResponse(userContext, rateLimitResult);
    }

    const cachedResult = await getCache(cacheKey);

    if (cachedResult) {
      return {
        status: 200,
        jsonBody: {
          message: "Search result served from cache.",
          userType,
          cacheHit: true,
          cacheKey,
          searchContext: {
            query: normalizedQuery,
            category: categoryId,
            area: areaId,
            budget,
          },
          result: cachedResult,
          remaining: rateLimitResult.remaining,
          limit: rateLimitResult.limit,
          resetAt: rateLimitResult.resetAt,
        },
      };
    }

    const geminiPrompt = buildGeminiPrompt({
      userPrompt:
        normalizedQuery || "Recommend places based on the selected filters.",
      userType,
      categoryName: selectedCategory?.name,
      categorySearchTerms: selectedCategory?.searchTerms,
      areaName: selectedArea?.name,
    });

    const geminiResponse = await generateGeminiResponse({
      prompt: geminiPrompt,
    });
    const resultToCache: CachedSearchResult = {
      geminiResponse,
    };

    await setCache(cacheKey, resultToCache);

    return {
      status: 200,
        jsonBody: {
          message: "Search processed successfully.",
          userType,
          cacheHit: false,
          cacheKey,
          searchContext: {
            query: normalizedQuery,
            category: categoryId,
            area: areaId,
            budget,
          },
          result: resultToCache,
          remaining: rateLimitResult.remaining,
        limit: rateLimitResult.limit,
        resetAt: rateLimitResult.resetAt,
      },
    };
  } catch (error) {
    context.error(error);

    if (error instanceof GeminiServiceError) {
      return {
        status: error.status,
        jsonBody: {
          message: getGeminiErrorMessage(error.status),
          error: error.message,
        },
      };
    }

    return {
      status: 400,
      jsonBody: {
        message: "Invalid request body.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("search", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "search",
  handler: search,
});
