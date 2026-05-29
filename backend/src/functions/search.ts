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

type SearchRequestBody = {
  query?: unknown;
  category?: unknown;
  area?: unknown;
};

type CachedSearchResult = {
  geminiResponse: string;
};

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

function getSearchQuery(body: SearchRequestBody): string | null {
  const rawQuery = body.query;

  if (typeof rawQuery !== "string") {
    return null;
  }

  return rawQuery.trim() === "" ? null : rawQuery;
}

function getOptionalFilterId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
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
    const query = getSearchQuery(body);

    if (!query) {
      return {
        status: 400,
        jsonBody: {
          message: "Query is required.",
        },
      };
    }

    const userContext = await resolveUserContext(request);
    const rateLimitResult = checkSearchRateLimit(userContext);

    if (!rateLimitResult.allowed) {
      return buildRateLimitExceededResponse(userContext, rateLimitResult);
    }

    const normalizedQuery = normalizeQuery(query);
    const categoryId = getOptionalFilterId(body.category) ?? "all";
    const areaId = getOptionalFilterId(body.area) ?? "all";
    const selectedCategory = findCategoryById(categoryId);
    const selectedArea = findAreaById(areaId);

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

    const cacheKey = generateSearchCacheKey(normalizedQuery, categoryId, areaId);
    const userType: GeminiUserType = userContext.userType;
    const cachedResult = await getCache(cacheKey);

    if (cachedResult) {
      return {
        status: 200,
        jsonBody: {
          message: "Search result served from cache.",
          userType,
          cacheHit: true,
          result: cachedResult,
          remaining: rateLimitResult.remaining,
          limit: rateLimitResult.limit,
          resetAt: rateLimitResult.resetAt,
        },
      };
    }

    const geminiPrompt = buildGeminiPrompt({
      userPrompt: normalizedQuery,
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
