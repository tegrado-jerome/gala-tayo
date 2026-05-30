import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { validateJwt } from "../utils/auth";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
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

type SearchContext = {
  searchId: string;
  query: string;
  category: string | null;
  area: string | null;
  budget: string | null;
  language: "taglish";
  userType: "guest" | "registered";
  createdAt: string;
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

function createSearchId(): string {
  return `search_${randomUUID()}`;
}

function normalizeSearchFilter(value: string, emptyValue: string): string | null {
  return value === emptyValue ? null : value;
}

function buildSearchContext({
  searchId,
  query,
  categoryId,
  areaId,
  budget,
  userType,
  createdAt,
}: {
  searchId: string;
  query: string;
  categoryId: string;
  areaId: string;
  budget: BudgetValue;
  userType: SearchContext["userType"];
  createdAt: string;
}): SearchContext {
  return {
    searchId,
    query,
    category: normalizeSearchFilter(categoryId, "all"),
    area: normalizeSearchFilter(areaId, "all"),
    budget: normalizeSearchFilter(budget, "any"),
    language: "taglish",
    userType,
    createdAt,
  };
}

async function storeSearchContext({
  searchContext,
  userContext,
  cacheKey,
  context,
}: {
  searchContext: SearchContext;
  userContext: SearchUserContext;
  cacheKey: string;
  context: InvocationContext;
}): Promise<void> {
  try {
    const supabase = await getSupabaseAdminClient();
    const searchContexts = supabase.from("search_contexts") as ReturnType<
      typeof supabase.from
    > & {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
    const { error } = await searchContexts.insert({
      search_id: searchContext.searchId,
      query: searchContext.query,
      category: searchContext.category,
      area: searchContext.area,
      budget: searchContext.budget,
      language: searchContext.language,
      user_type: searchContext.userType,
      user_id: userContext.userType === "registered" ? userContext.user.id : null,
      cache_key: cacheKey,
      created_at: searchContext.createdAt,
    });

    if (error) {
      context.warn("Failed to store search context.", error);
    }
  } catch (error) {
    context.warn("Failed to store search context.", error);
  }
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
      const searchId = createSearchId();
      const searchContext = buildSearchContext({
        searchId,
        query,
        categoryId,
        areaId,
        budget,
        userType,
        createdAt: new Date().toISOString(),
      });

      await storeSearchContext({
        searchContext,
        userContext,
        cacheKey,
        context,
      });

      return {
        status: 200,
        jsonBody: {
          message: "Broad discovery places served from curated defaults.",
          searchId,
          userType,
          cacheHit: false,
          cacheKey,
          searchMode: "broad-discovery",
          searchContext,
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

    const searchId = createSearchId();
    const searchContext = buildSearchContext({
      searchId,
      query,
      categoryId,
      areaId,
      budget,
      userType,
      createdAt: new Date().toISOString(),
    });

    await storeSearchContext({
      searchContext,
      userContext,
      cacheKey,
      context,
    });

    const cachedResult = await getCache(cacheKey);

    if (cachedResult) {
      return {
        status: 200,
        jsonBody: {
          message: "Search result served from cache.",
          searchId,
          userType,
          cacheHit: true,
          cacheKey,
          searchContext,
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
          searchId,
          userType,
          cacheHit: false,
          cacheKey,
          searchContext,
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
