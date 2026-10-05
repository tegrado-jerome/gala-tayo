import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { validateJwt } from "../utils/auth";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getJsonCacheValue, setJsonCacheValue } from "../services/redisCacheService";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { generateSearchCacheKey } from "../utils/cacheKey";
import { validateSearchQuery, type SearchValidationStatus } from "../utils/searchQueryValidation";
import { findAreaById, findCategoryById, findGoodForById } from "./filters";
import {
  type SearchRequestBody,
  type PlaceRow,
  type SearchPlaceResult,
  type SearchContext,
  type SearchResponseStatus,
  type SearchResponsePayload,
  type BudgetValue,
  type SearchUserContext,
  type NearbySearchContext,
  DEFAULT_SEARCH_PAGE,
  STRICT_SEARCH_LIMIT,
  SEARCH_CACHE_TTL_SECONDS,
  getClientIp,
  getSearchQuery,
  getOptionalFilterId,
  getFiltersPayload,
  getFilterValue,
  getBudgetFilter,
  getPositiveInteger,
  getNearbySearchContext,
  getRowDistanceKm,
} from "./searchHelpers";
import { mapPlaceRowToSearchResult } from "./searchScoring";
import { getActiveNormalizedPlaces } from "../domain/places";
import { getExactLocationLabelForIntent, normalizeSearchText, rankPlaces, type PlaceSearchFilters } from "../domain/placeSearch";
import { buildImageUrl } from "../utils/r2UrlResolver";

export type { SearchPlaceResult } from "./searchHelpers";

type ApprovedSearchImageRow = {
  place_id?: unknown;
  storage_key?: unknown;
};

export async function attachApprovedImagesToSearchResults(
  places: SearchPlaceResult[]
): Promise<SearchPlaceResult[]> {
  const placeIds = places
    .map((place) => place.id?.trim())
    .filter((placeId): placeId is string => Boolean(placeId));

  if (placeIds.length === 0) return places;

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select("place_id, storage_key, sort_order, created_at")
    .in("place_id", placeIds)
    .eq("status", "approved")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error("Failed to load approved place images for search results.");

  const imageUrlsByPlaceId = new Map<string, string[]>();
  for (const row of (data ?? []) as ApprovedSearchImageRow[]) {
    const placeId = typeof row.place_id === "string" ? row.place_id.trim() : "";
    const storageKey = typeof row.storage_key === "string" ? row.storage_key.trim() : "";
    const imageUrl = buildImageUrl(storageKey)?.trim() ?? "";
    if (!placeId || !imageUrl) continue;
    const existingUrls = imageUrlsByPlaceId.get(placeId) ?? [];
    if (existingUrls.includes(imageUrl)) continue;
    existingUrls.push(imageUrl);
    imageUrlsByPlaceId.set(placeId, existingUrls);
  }

  return places.map((place) => {
    const approvedImageUrls = imageUrlsByPlaceId.get(place.id) ?? [];
    const primaryImageUrl = approvedImageUrls[0] ?? null;
    if (!primaryImageUrl) return place;
    return {
      ...place,
      imageUrl: primaryImageUrl,
      thumbnailUrl: primaryImageUrl,
      imageAlt: place.name ? `Photo of ${place.name}` : place.imageAlt ?? null,
      curatedImageUrls: approvedImageUrls,
    };
  });
}

async function resolveUserContext(request: HttpRequest): Promise<SearchUserContext> {
  try {
    const user = await validateJwt(request);
    return { userType: "registered", identifier: user.id, user };
  } catch {
    return { userType: "guest", identifier: getClientIp(request) };
  }
}

function createSearchId(): string {
  return `search_${randomUUID()}`;
}

function normalizeSearchFilter(value: string, emptyValue: string): string | null {
  return value === emptyValue ? null : value;
}

function buildSearchContext({
  searchId, query, categoryId, areaId, goodForId, budget, userType, createdAt,
}: {
  searchId: string; query: string; categoryId: string; areaId: string; goodForId: string; budget: BudgetValue; userType: SearchContext["userType"]; createdAt: string;
}): SearchContext {
  return {
    searchId, query,
    category: normalizeSearchFilter(categoryId, "all"),
    area: normalizeSearchFilter(areaId, "all"),
    good_for: normalizeSearchFilter(goodForId, "all"),
    budget: normalizeSearchFilter(budget, "any"),
    language: "taglish", userType, createdAt,
  };
}

function buildSearchResponseCacheKey(args: {
  baseKey: string; page: number; limit: number;
}): string {
  return [
    args.baseKey,
    `page:${args.page}`,
    `limit:${args.limit}`,
  ].join(":");
}

function buildSearchResponsePayload(args: {
  searchMode: "broad-discovery" | "supabase"; searchStatus: SearchResponseStatus; searchFeedbackMessage: string | null; page: number; limit: number; totalCount: number; totalPages: number; places: SearchPlaceResult[];
}): SearchResponsePayload {
  return {
    searchMode: args.searchMode,
    searchStatus: args.searchStatus,
    searchFeedbackMessage: args.searchFeedbackMessage,
    page: args.page, limit: args.limit,
    totalCount: args.totalCount, totalPages: args.totalPages,
    places: args.places,
    result: { geminiResponse: "", page: args.page, limit: args.limit, totalCount: args.totalCount, totalPages: args.totalPages, places: args.places },
  };
}

function formatNoResultsMessage(args: {
  query: string;
  areaId: string;
  fallbackMessage?: string | null;
}): string | null {
  if (args.areaId !== "all") return args.fallbackMessage ?? null;

  const exactLocationLabel = getExactLocationLabelForIntent(args.query);
  if (!exactLocationLabel) return args.fallbackMessage ?? null;

  return `No places found in ${exactLocationLabel} for this search.`;
}

async function storeSearchContext({ searchContext, userContext, cacheKey, context, }: {
  searchContext: SearchContext; userContext: SearchUserContext; cacheKey: string; context: InvocationContext;
}): Promise<void> {
  try {
    const supabase = await getSupabaseAdminClient();
    const searchContexts = supabase.from("search_contexts") as any;
    const { error } = await searchContexts.insert({
      search_id: searchContext.searchId, query: searchContext.query,
      category: searchContext.category, area: searchContext.area,
      budget: searchContext.budget, language: searchContext.language,
      user_type: searchContext.userType,
      user_id: userContext.userType === "registered" ? userContext.user.id : null,
      cache_key: cacheKey, created_at: searchContext.createdAt,
    });
    if (error) context.warn("Failed to store search context.", error);
  } catch (error) {
    context.warn("Failed to store search context.", error);
  }
}

function logSearchAnalyticsEvent(context: InvocationContext, { searchId, status, query, areaId, categoryId, goodForId, budget, totalCount, unsupportedLocations, }: {
  searchId: string; status: SearchValidationStatus | "no_results" | "ok"; query: string; areaId: string; categoryId: string; goodForId: string; budget: BudgetValue; totalCount?: number; unsupportedLocations?: string[];
}) {
  context.log("search.analytics", { searchId, status, query, areaId, categoryId, goodForId, budget, totalCount: totalCount ?? null, unsupportedLocations: unsupportedLocations ?? [] });
}

export async function findSearchPlaces({
  normalizedQuery, nearbySearch, explicitFilters,
}: {
  normalizedQuery: string; nearbySearch: NearbySearchContext | null; explicitFilters: PlaceSearchFilters;
}): Promise<SearchPlaceResult[]> {
  const rankedRows = rankPlaces(await getActiveNormalizedPlaces(), normalizedQuery, explicitFilters)
    .map(({ place, score }) => {
      const row = place as unknown as PlaceRow;
      return { row, score, distanceKm: nearbySearch ? getRowDistanceKm(row, nearbySearch.userLocation) : null };
    });

  const hasNearbyMatches = nearbySearch
    ? rankedRows.some(({ distanceKm }) => distanceKm !== null && distanceKm <= nearbySearch.radiusKm)
    : false;

  return rankedRows
    .sort((left, right) => {
      if (nearbySearch && hasNearbyMatches) {
        const leftIsNearby = left.distanceKm !== null && left.distanceKm <= nearbySearch.radiusKm;
        const rightIsNearby = right.distanceKm !== null && right.distanceKm <= nearbySearch.radiusKm;
        if (leftIsNearby !== rightIsNearby) return leftIsNearby ? -1 : 1;
        if (leftIsNearby && rightIsNearby && left.distanceKm !== right.distanceKm) {
          if (left.distanceKm === null) return 1;
          if (right.distanceKm === null) return -1;
          return left.distanceKm - right.distanceKm;
        }
      }
      if (right.score !== left.score) return right.score - left.score;
      if (nearbySearch && left.distanceKm !== null && right.distanceKm !== null && left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }
      return String(left.row.name ?? "").localeCompare(String(right.row.name ?? ""));
    })
    .map(({ row, distanceKm, score }) =>
      mapPlaceRowToSearchResult(row, { normalizedQuery, categoryIds: [], distanceKm, score })
    );
}

export async function search(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "search", 30, 60);
  if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

  context.log("Processing Supabase search request...");

  try {
    const body = (await request.json()) as SearchRequestBody;
    const filters = getFiltersPayload(body);
    const query = getSearchQuery(body);
    const categoryId = getOptionalFilterId(getFilterValue(body, filters, "category")) ?? "all";
    const areaId = getOptionalFilterId(getFilterValue(body, filters, "city") ?? getFilterValue(body, filters, "area")) ?? "all";
    const goodForId = getOptionalFilterId(getFilterValue(body, filters, "good_for")) ?? "all";
    const budget = getBudgetFilter(getFilterValue(body, filters, "budget"));
    const page = getPositiveInteger(body.page, DEFAULT_SEARCH_PAGE, { min: 1 });
    const limit = Math.min(getPositiveInteger(body.limit, STRICT_SEARCH_LIMIT, { min: 1 }), 50);
    const normalizedQuery = normalizeSearchText(query);
    const nearbySearch = getNearbySearchContext(body);
    const selectedCategory = findCategoryById(categoryId);
    const selectedArea = findAreaById(areaId);
    const selectedGoodFor = findGoodForById(goodForId);
    const hasSelectedFilters = categoryId !== "all" || areaId !== "all" || goodForId !== "all" || budget !== "any";
    const hasNearbySearch = Boolean(nearbySearch);
    const isBroadDiscoverySearch = false;
    const queryValidation = validateSearchQuery({ query, hasSelectedFilters, hasNearbySearch, allowBroadDiscovery: isBroadDiscoverySearch });

    if (categoryId !== "all" && !selectedCategory) return { status: 400, jsonBody: { message: "Invalid category filter." } };
    if (areaId !== "all" && !selectedArea) return { status: 400, jsonBody: { message: "Invalid area filter." } };
    if (goodForId !== "all" && !selectedGoodFor) return { status: 400, jsonBody: { message: "Invalid good_for filter." } };

    const effectiveCategoryId = categoryId;
    const effectiveAreaId = areaId;
    const effectiveGoodFor = goodForId;
    const effectiveBudget = budget;
    const cacheKey = generateSearchCacheKey(normalizedQuery, effectiveCategoryId, effectiveAreaId, effectiveGoodFor, effectiveBudget);
    const canUseSharedCache = !nearbySearch;
    const responseCacheKey = buildSearchResponseCacheKey({ baseKey: cacheKey, page, limit });
    const userContext = await resolveUserContext(request);
    const userType = userContext.userType;
    const searchId = createSearchId();
    const searchContext = buildSearchContext({
      searchId,
      query,
      categoryId: effectiveCategoryId,
      areaId: effectiveAreaId,
      goodForId: effectiveGoodFor,
      budget: effectiveBudget,
      userType,
      createdAt: new Date().toISOString(),
    });

    if (canUseSharedCache) {
      const cachedPayload = await getJsonCacheValue<SearchResponsePayload>(responseCacheKey);
      if (cachedPayload) {
        await storeSearchContext({ searchContext, userContext, cacheKey: responseCacheKey, context });
        return {
          status: 200,
          jsonBody: { message: "Search processed successfully.", searchId, userType, cacheHit: true, cacheKey: responseCacheKey, searchMode: cachedPayload.searchMode, searchStatus: cachedPayload.searchStatus, searchFeedbackMessage: cachedPayload.searchFeedbackMessage, searchContext, page: cachedPayload.page, limit: cachedPayload.limit, totalCount: cachedPayload.totalCount, totalPages: cachedPayload.totalPages, places: cachedPayload.places, result: cachedPayload.result },
        };
      }
    }

    await storeSearchContext({ searchContext, userContext, cacheKey: responseCacheKey, context });

    if (queryValidation.status !== "ok") {
      logSearchAnalyticsEvent(context, {
        searchId,
        status: queryValidation.status,
        query,
        areaId: effectiveAreaId,
        categoryId: effectiveCategoryId,
        goodForId: effectiveGoodFor,
        budget: effectiveBudget,
        unsupportedLocations: queryValidation.unsupportedLocationKeywords,
      });
      const searchStatus: SearchResponseStatus = queryValidation.status;
      return {
        status: 200,
        jsonBody: { message: queryValidation.message ?? "No places found.", searchId, userType, cacheHit: false, cacheKey: responseCacheKey, searchMode: "supabase", searchStatus, searchFeedbackMessage: queryValidation.message, searchContext, page: 1, limit, totalCount: 0, totalPages: 1, places: [], result: { geminiResponse: "", page: 1, limit, totalCount: 0, totalPages: 1, places: [] } },
      };
    }

    const places = await findSearchPlaces({
      normalizedQuery,
      nearbySearch,
      explicitFilters: {
        category: effectiveCategoryId,
        city: effectiveAreaId,
        good_for: effectiveGoodFor,
        budget: effectiveBudget,
      },
    });
    const totalCount = places.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    const pageStartIndex = (safePage - 1) * limit;
    const paginatedPlaces = await attachApprovedImagesToSearchResults(places.slice(pageStartIndex, pageStartIndex + limit));
    const searchStatus: SearchResponseStatus = totalCount === 0 ? "no_results" : "ok";
    const searchFeedbackMessage =
          searchStatus === "no_results"
        ? formatNoResultsMessage({
            query,
            areaId: effectiveAreaId,
            fallbackMessage: "No places found. Try another category, location, or budget.",
          })
        : null;
    const responsePayload = buildSearchResponsePayload({
      searchMode: isBroadDiscoverySearch ? "broad-discovery" : "supabase",
      searchStatus,
      searchFeedbackMessage,
      page: safePage,
      limit,
      totalCount,
      totalPages,
      places: paginatedPlaces,
    });

    logSearchAnalyticsEvent(context, {
      searchId,
      status: searchStatus,
      query,
      areaId: effectiveAreaId,
      categoryId: effectiveCategoryId,
      goodForId: effectiveGoodFor,
      budget: effectiveBudget,
      totalCount,
    });

    if (canUseSharedCache) {
      await setJsonCacheValue(responseCacheKey, responsePayload, { ttlSeconds: SEARCH_CACHE_TTL_SECONDS });
    }

    return {
      status: 200,
      jsonBody: { message: "Search processed successfully.", searchId, userType, cacheHit: false, cacheKey: responseCacheKey, searchMode: responsePayload.searchMode, searchStatus: responsePayload.searchStatus, searchFeedbackMessage: responsePayload.searchFeedbackMessage, searchContext, page: responsePayload.page, limit: responsePayload.limit, totalCount: responsePayload.totalCount, totalPages: responsePayload.totalPages, places: responsePayload.places, result: responsePayload.result },
    };
  } catch (error) {
    context.error(error);
    return { status: 400, jsonBody: { message: "Invalid request body.", error: error instanceof Error ? error.message : "Unknown error" } };
  }
}

app.http("search", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "search",
  handler: search,
});
