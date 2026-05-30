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
  places: SearchPlaceResult[];
};

type PlaceRow = Record<string, unknown>;

type SearchPlaceResult = {
  id: string;
  slug: string | null;
  name: string | null;
  description: string | null;
  area: string | null;
  city: string | null;
  location: string | null;
  category: string | null;
  categories: unknown;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  curatedImageUrls: string[];
  address: string | null;
  budget: string | null;
  budgetRange: string | null;
  reason: string | null;
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

const CATEGORY_TO_DB_CATEGORIES: Record<string, string[]> = {
  cafe: ["Cafe"],
  mall: ["Mall"],
  museum: ["Museum"],
  heritage: ["Heritage"],
  "date-spot": ["Hangout", "Mall", "Cafe"],
  barkada: ["Hangout", "Mall"],
  family: ["Mall", "Museum", "Heritage", "Hangout"],
  "tourist-spot": ["Heritage", "Museum", "Hangout"],
  "study-spot": ["Cafe", "Museum"],
  chill: ["Cafe", "Hangout"],
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

function getStringField(row: PlaceRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumberField(row: PlaceRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsedValue = Number(value);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function getStringArrayField(row: PlaceRow, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];

    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === "string" && item.trim() !== ""
      );
    }
  }

  return [];
}

function normalizeComparableText(value: unknown): string {
  if (typeof value === "string") {
    return normalizeQuery(value);
  }

  if (Array.isArray(value)) {
    return normalizeQuery(value.filter(Boolean).join(" "));
  }

  return "";
}

function getMappedDbCategories(categoryId: string): string[] {
  if (categoryId === "all") {
    return [];
  }

  const mappedCategories = CATEGORY_TO_DB_CATEGORIES[categoryId];

  if (mappedCategories) {
    return mappedCategories;
  }

  const selectedCategory = findCategoryById(categoryId);

  return selectedCategory?.name ? [selectedCategory.name] : [categoryId];
}

function rowMatchesCategory(row: PlaceRow, categoryId: string): boolean {
  const mappedCategories = getMappedDbCategories(categoryId);

  if (mappedCategories.length === 0) {
    return true;
  }

  const categoryText = normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
  ]);

  return mappedCategories.some((category) =>
    categoryText.includes(normalizeComparableText(category))
  );
}

function rowMatchesArea(row: PlaceRow, areaId: string): boolean {
  if (areaId === "all") {
    return true;
  }

  const selectedArea = findAreaById(areaId);
  const areaName = selectedArea?.name ?? areaId;
  const areaText = normalizeComparableText([
    getStringField(row, ["city", "area", "address", "location"]),
  ]);

  return areaText.includes(normalizeComparableText(areaName));
}

function rowMatchesPrompt(row: PlaceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const promptTerms = normalizedQuery
    .split(" ")
    .filter((term) => term.length >= 3 && !/^gm\d+$/i.test(term));

  if (promptTerms.length === 0) {
    return true;
  }

  const searchableText = normalizeComparableText([
    getStringField(row, ["name", "category", "city", "area", "address", "description"]),
    row.categories,
  ]);

  return promptTerms.some((term) => searchableText.includes(term));
}

function rowMatchesBudget(row: PlaceRow, budget: BudgetValue): boolean {
  if (budget === "any") {
    return true;
  }

  const budgetText = normalizeComparableText(
    getStringField(row, ["budget", "budget_range", "budgetRange", "price_range", "priceRange"])
  );

  if (!budgetText) {
    return true;
  }

  return budgetText.includes(budget);
}

function mapPlaceRowToSearchResult(row: PlaceRow): SearchPlaceResult {
  const imageUrl = getStringField(row, ["imageUrl", "image_url", "photo_url", "photoUrl"]);
  const curatedImageUrls = getStringArrayField(row, [
    "curatedImageUrls",
    "curated_image_urls",
    "photos",
  ]);
  const city = getStringField(row, ["city", "area"]);
  const address = getStringField(row, ["address", "formatted_address"]);
  const fallbackLocation = [address, city].filter(Boolean).join(", ");
  const location = getStringField(row, ["location"]) ?? (fallbackLocation || null);

  return {
    id: String(row.id ?? row.foursquare_id ?? row.slug ?? ""),
    slug: getStringField(row, ["slug"]),
    name: getStringField(row, ["name"]),
    description: getStringField(row, ["description", "reason"]),
    area: getStringField(row, ["area", "city"]),
    city,
    location,
    category: getStringField(row, ["category"]),
    categories: row.categories ?? null,
    latitude: getNumberField(row, ["latitude", "lat"]),
    longitude: getNumberField(row, ["longitude", "lng", "lon"]),
    imageUrl,
    curatedImageUrls,
    address,
    budget: getStringField(row, ["budget"]),
    budgetRange: getStringField(row, ["budgetRange", "budget_range", "priceRange", "price_range"]),
    reason: getStringField(row, ["reason", "description"]),
  };
}

function buildPlaceCandidateContext(places: SearchPlaceResult[]): string {
  if (places.length === 0) {
    return "No matching Supabase places were found for this search.";
  }

  return places
    .map((place, index) => {
      const location = place.location ?? place.city ?? place.area ?? "Metro Manila";
      const category = place.category ?? "Place";

      return `${index + 1}. ${place.name ?? "Unnamed place"} — ${category} — ${location}`;
    })
    .join("\n");
}

function constrainPromptToPlaces(
  prompt: string,
  places: SearchPlaceResult[]
): string {
  return `${prompt}

Supabase place candidates for this search:
${buildPlaceCandidateContext(places)}

Only recommend or discuss places from the Supabase place candidates above. If no candidates are available, say that no matching places were found yet and suggest adjusting the filters.`;
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

async function findSearchPlaces({
  normalizedQuery,
  categoryId,
  areaId,
  budget,
}: {
  normalizedQuery: string;
  categoryId: string;
  areaId: string;
  budget: BudgetValue;
}): Promise<SearchPlaceResult[]> {
  const supabase = await getSupabaseAdminClient();
  const placesTable = supabase.from("places") as ReturnType<
    typeof supabase.from
  > & {
    select: (columns: string) => {
      order: (
        column: string,
        options?: { ascending?: boolean; nullsFirst?: boolean }
      ) => unknown;
      limit: (count: number) => Promise<{ data: PlaceRow[] | null; error: unknown }>;
      ilike: (column: string, pattern: string) => unknown;
      or: (filters: string) => unknown;
    };
  };

  let queryBuilder = placesTable.select("*") as {
    order: (
      column: string,
      options?: { ascending?: boolean; nullsFirst?: boolean }
    ) => typeof queryBuilder;
    limit: (count: number) => Promise<{ data: PlaceRow[] | null; error: unknown }>;
    ilike: (column: string, pattern: string) => typeof queryBuilder;
    or: (filters: string) => typeof queryBuilder;
  };

  const orderedQuery = queryBuilder.order("rating", {
    ascending: false,
    nullsFirst: false,
  });
  const { data, error } = await orderedQuery.limit(30);

  if (error) {
    throw new Error("Failed to query search places.");
  }

  return (data ?? [])
    .filter((row) => rowMatchesArea(row, areaId))
    .filter((row) => rowMatchesCategory(row, categoryId))
    .filter((row) => rowMatchesBudget(row, budget))
    .filter((row) => {
      const hasSelectedFilters =
        categoryId !== "all" || areaId !== "all" || budget !== "any";

      return hasSelectedFilters || rowMatchesPrompt(row, normalizedQuery);
    })
    .slice(0, 10)
    .map(mapPlaceRowToSearchResult);
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
      const places = await findSearchPlaces({
        normalizedQuery,
        categoryId,
        areaId,
        budget,
      });
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
          places,
          result: {
            geminiResponse: "",
            places,
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
      const cachedSearchResult = cachedResult as Partial<CachedSearchResult>;
      const cachedPlaces = (
        cachedSearchResult.places ??
        (await findSearchPlaces({
          normalizedQuery,
          categoryId,
          areaId,
          budget,
        }))
      ).slice(0, 10);

      return {
        status: 200,
        jsonBody: {
          message: "Search result served from cache.",
          searchId,
          userType,
          cacheHit: true,
          cacheKey,
          searchContext,
          places: cachedPlaces,
          result: {
            geminiResponse: cachedSearchResult.geminiResponse ?? "",
            places: cachedPlaces,
          },
          remaining: rateLimitResult.remaining,
          limit: rateLimitResult.limit,
          resetAt: rateLimitResult.resetAt,
        },
      };
    }

    const places = await findSearchPlaces({
      normalizedQuery,
      categoryId,
      areaId,
      budget,
    });
    const geminiPrompt = constrainPromptToPlaces(
      buildGeminiPrompt({
        userPrompt:
          normalizedQuery || "Recommend places based on the selected filters.",
        userType,
        categoryName: selectedCategory?.name,
        categorySearchTerms: selectedCategory?.searchTerms,
        areaName: selectedArea?.name,
      }),
      places
    );

    const geminiResponse = await generateGeminiResponse({
      prompt: geminiPrompt,
    });
    const resultToCache: CachedSearchResult = {
      geminiResponse,
      places,
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
          places,
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
