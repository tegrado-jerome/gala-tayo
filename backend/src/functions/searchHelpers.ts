import { HttpRequest } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getSearchTerms, inferCategoryIdsFromQuery, normalizeSearchText } from "../utils/searchMatching";
import { getMetroManilaLocationKeywordsForCity, inferMetroManilaLocationsFromQuery } from "../utils/metroManilaLocations";
import { findAreaById, findCategoryById, findGoodForById } from "./filters";

export type SearchRequestBody = {
  query?: unknown;
  category?: unknown;
  area?: unknown;
  city?: unknown;
  good_for?: unknown;
  budget?: unknown;
  indoor_outdoor?: unknown;
  weather_fit?: unknown;
  page?: unknown;
  limit?: unknown;
  filters?: unknown;
  exploreAll?: unknown;
  userLocation?: unknown;
  radiusKm?: unknown;
  strictPlaceSearch?: unknown;
  sort?: unknown;
  tags?: unknown;
  price_level?: unknown;
  max_budget?: unknown;
  min_budget?: unknown;
};

export type PlaceRow = Record<string, unknown>;
export type PlaceCategoryJoin = { category_id?: unknown; categories?: unknown };
export type PlaceTagJoin = { strength?: unknown; tags?: unknown };

export type SearchCategoryMetadata = { id: string; name: string };

export type SearchTagMetadata = { id: string; name: string; group: string; strength: number };

export type SearchPlaceResult = {
  id: string;
  slug: string | null;
  name: string | null;
  description: string | null;
  area: string | null;
  city: string | null;
  location: string | null;
  category: string | null;
  categories: SearchCategoryMetadata[];
  rating: number | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  imageAlt: string | null;
  curatedImageUrls: string[];
  address: string | null;
  budget: string | null;
  budgetRange: string | null;
  reason: string | null;
  place_history: string | null;
  best_time_to_visit: string | null;
  visit_duration: string | null;
  good_for: string[];
  parking_info: string | null;
  commute_access: string | null;
  budget_note: string | null;
  budget_min: number | null;
  price_level: number | null;
  google_maps_url: string | null;
  distanceKm: number | null;
  score: number;
  search_terms: string[];
  tags: SearchTagMetadata[];
  matchedCategories: SearchCategoryMetadata[];
  matchedTags: SearchTagMetadata[];
};

export type SearchResponsePayload = {
  searchMode: "broad-discovery" | "supabase";
  searchStatus: SearchResponseStatus;
  searchFeedbackMessage: string | null;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  places: SearchPlaceResult[];
  result: {
    geminiResponse: string;
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    places: SearchPlaceResult[];
  };
};

export type UserLocation = { latitude: number; longitude: number };

export type NearbySearchContext = { userLocation: UserLocation; radiusKm: number };

type HistoryPlaceViewRow = { place_id?: unknown; user_id?: unknown; created_at?: unknown };

export type TrendingSignal = { uniqueViewerCount: number; latestViewedAt: number };

export type SearchContext = {
  searchId: string;
  query: string;
  category: string | null;
  area: string | null;
  good_for: string | null;
  budget: string | null;
  language: "taglish";
  userType: "guest" | "registered";
  createdAt: string;
};

export type SearchResponseStatus = "ok" | "empty_query" | "unsupported_location" | "no_results";

export type BudgetValue = "any" | "free" | "under-300" | "under-500" | "500-1000" | "1000-2000" | "1000-plus" | "2000-plus";

export const VALID_BUDGET_VALUES: BudgetValue[] = ["any", "free", "under-300", "under-500", "500-1000", "1000-2000", "1000-plus", "2000-plus"];

export const DEFAULT_SEARCH_PAGE = 1;
export const STRICT_SEARCH_LIMIT = 10;
export const TRENDING_LOOKBACK_DAYS = 14;
export const TRENDING_HISTORY_LIMIT = 5000;
export const SEARCH_CACHE_TTL_SECONDS = 60 * 5;

export const CATEGORY_TO_DB_CATEGORIES: Record<string, string[]> = {
  food: ["Food"],
  cafe: ["Cafe"],
  mall: ["Mall"],
  park: ["Park"],
  museum: ["Museum"],
  heritage: ["Heritage"],
  activity: ["Activity"],
  hotel: ["Hotel"],
  nightlife: ["Nightlife"],
  cinema: ["Cinema"],
};

export const GOOD_FOR_TERMS: Record<string, string[]> = {
  date: ["date", "dates", "romantic", "couple", "anniversary"],
  barkada: ["barkada", "barkadas", "friends", "group", "hangout"],
  family: ["family", "kids", "child friendly", "all ages"],
  study: ["study", "student", "quiet", "work friendly", "wifi"],
  chill: ["chill", "relax", "tambayan", "low key"],
};

export const QUERY_INTENT_SIGNALS = [
  { id: "rain-friendly", queryPhrases: ["rain", "rainy", "ulan"], rowPhrases: ["rain", "rainy", "ulan", "indoor", "covered", "aircon", "air conditioned"] },
  { id: "commute-friendly", queryPhrases: ["commute", "commuter", "sakay", "lrt", "mrt", "jeep", "tricycle", "bus"], rowPhrases: ["commute", "commuter", "ride hailing", "lrt", "mrt", "jeep", "tricycle", "bus", "walkable", "accessible"] },
  { id: "drive-friendly", queryPhrases: ["parking", "car", "drive", "driving", "roadtrip"], rowPhrases: ["parking", "car", "drive", "parking available"] },
  { id: "study-work", queryPhrases: ["study", "work", "wifi", "laptop", "focus", "productive"], rowPhrases: ["study", "work", "wifi", "laptop", "focus", "productive", "quiet"] },
  { id: "quiet-chill", queryPhrases: ["quiet", "peaceful", "calm", "tahimik", "relax", "chill"], rowPhrases: ["quiet", "peaceful", "calm", "relax", "chill", "not crowded", "less crowded"] },
  { id: "date", queryPhrases: ["date", "romantic", "couple", "anniversary", "jowa"], rowPhrases: ["date", "romantic", "couple", "anniversary"] },
  { id: "family", queryPhrases: ["family", "kids", "child", "children", "pamilya"], rowPhrases: ["family", "kids", "child", "children", "all ages", "family friendly", "kid friendly"] },
  { id: "group", queryPhrases: ["barkada", "friends", "group", "tropa", "hangout"], rowPhrases: ["barkada", "friends", "group", "hangout"] },
  { id: "night", queryPhrases: ["night", "late night", "gabi", "after work"], rowPhrases: ["night", "late night", "gabi", "after work"] },
  { id: "indoor", queryPhrases: ["indoor", "aircon", "air conditioned", "covered"], rowPhrases: ["indoor", "aircon", "air conditioned", "covered"] },
  { id: "outdoor", queryPhrases: ["outdoor", "outside", "fresh air", "open air"], rowPhrases: ["outdoor", "outside", "fresh air", "open air", "park", "garden"] },
] as const;

export type SearchUserContext =
  | { userType: "guest"; identifier: string; user?: undefined }
  | { userType: "registered"; identifier: string; user: { id: string; email?: string } };

export function getClientIp(request: HttpRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "127.0.0.1";
}

export function getSearchQuery(body: SearchRequestBody): string {
  const rawQuery = body.query;
  if (typeof rawQuery !== "string") return "";
  return rawQuery.trim();
}

export function getOptionalFilterId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}

export function getFiltersPayload(body: SearchRequestBody): Record<string, unknown> {
  if (!body.filters || typeof body.filters !== "object") return {};
  return body.filters as Record<string, unknown>;
}

export function getFilterValue(
  body: SearchRequestBody, filters: Record<string, unknown>,
  key: "category" | "area" | "city" | "good_for" | "budget" | "indoor_outdoor" | "weather_fit"
): unknown {
  if (Object.prototype.hasOwnProperty.call(filters, key)) return filters[key];
  return body[key];
}

export function getStringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export function getBudgetFilter(value: unknown): BudgetValue {
  if (typeof value !== "string") return "any";
  const trimmedValue = value.trim();
  return VALID_BUDGET_VALUES.includes(trimmedValue as BudgetValue) ? (trimmedValue as BudgetValue) : "any";
}

export function getFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) return parsedValue;
  }
  return null;
}

export function getPositiveInteger(value: unknown, fallbackValue: number, { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}): number {
  const numericValue = getFiniteNumber(value);
  if (numericValue === null) return fallbackValue;
  const roundedValue = Math.floor(numericValue);
  if (!Number.isFinite(roundedValue)) return fallbackValue;
  return Math.min(Math.max(roundedValue, min), max);
}

export function isValidLatitude(value: number): boolean { return value >= -90 && value <= 90; }

export function isValidLongitude(value: number): boolean { return value >= -180 && value <= 180; }

export function getNearbySearchContext(body: SearchRequestBody): NearbySearchContext | null {
  if (!body.userLocation || typeof body.userLocation !== "object") return null;
  const userLocation = body.userLocation as Record<string, unknown>;
  const latitude = getFiniteNumber(userLocation.latitude);
  const longitude = getFiniteNumber(userLocation.longitude);
  const radiusKm = getFiniteNumber(body.radiusKm);
  if (latitude === null || longitude === null || radiusKm === null || !isValidLatitude(latitude) || !isValidLongitude(longitude) || radiusKm <= 0) return null;
  return { userLocation: { latitude, longitude }, radiusKm: Math.min(radiusKm, 50) };
}

export function toRadians(value: number): number { return (value * Math.PI) / 180; }

export function getDistanceKm(from: UserLocation, to: { latitude: number; longitude: number }): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getRowDistanceKm(row: PlaceRow, userLocation: UserLocation): number | null {
  const latitude = getNumberField(row, ["latitude", "lat"]);
  const longitude = getNumberField(row, ["longitude", "lng", "lon"]);
  if (latitude === null || longitude === null || !isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return getDistanceKm(userLocation, { latitude, longitude });
}

export function getTrendingCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function getTrendingSignalSortValue(signal: TrendingSignal | undefined): number {
  if (!signal) return -1;
  return signal.uniqueViewerCount * 1_000_000_000_000 + signal.latestViewedAt;
}

export async function getTrendingSignalsByPlaceId(): Promise<Map<string, TrendingSignal>> {
  const supabase = await getSupabaseAdminClient();
  const historyTable = supabase.from("history") as any;
  const cutoffIso = getTrendingCutoffIso(TRENDING_LOOKBACK_DAYS);
  const { data, error } = await historyTable
    .select("place_id,user_id,created_at")
    .eq("type", "place_view")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(TRENDING_HISTORY_LIMIT);

  if (error) throw new Error("Failed to query trending place views.");

  const viewersByPlaceId = new Map<string, Set<string>>();
  const latestViewedAtByPlaceId = new Map<string, number>();

  for (const row of data ?? []) {
    const placeId = typeof row.place_id === "string" ? row.place_id.trim() : "";
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
    if (!placeId || !userId || Number.isNaN(createdAt)) continue;
    const viewers = viewersByPlaceId.get(placeId) ?? new Set<string>();
    viewers.add(userId);
    viewersByPlaceId.set(placeId, viewers);
    const previousLatestViewedAt = latestViewedAtByPlaceId.get(placeId) ?? 0;
    latestViewedAtByPlaceId.set(placeId, Math.max(previousLatestViewedAt, createdAt));
  }

  const signalsByPlaceId = new Map<string, TrendingSignal>();
  for (const [placeId, viewers] of viewersByPlaceId.entries()) {
    signalsByPlaceId.set(placeId, { uniqueViewerCount: viewers.size, latestViewedAt: latestViewedAtByPlaceId.get(placeId) ?? 0 });
  }
  return signalsByPlaceId;
}

export function roundDistanceKm(distanceKm: number | null): number | null {
  if (distanceKm === null) return null;
  return Math.round(distanceKm * 100) / 100;
}

export function getStringField(row: PlaceRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function getNumberField(row: PlaceRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue)) return parsedValue;
    }
  }
  return null;
}

export function getStringArrayField(row: PlaceRow, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  }
  return [];
}

export function normalizeComparableText(value: unknown): string {
  if (typeof value === "string") return normalizeSearchText(value);
  if (Array.isArray(value)) return normalizeSearchText(value.filter(Boolean).join(" "));
  return "";
}

export function getRowIdentityText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["name", "slug"]),
    getStringArrayField(row, ["search_terms"]),
  ]);
}

export function getRowDiscoveryText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["category", "city", "area", "address"]),
    getStringArrayField(row, ["search_terms"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
  ]);
}

export function getRowIntentText(row: PlaceRow): string {
  return normalizeComparableText([getStringField(row, ["best_time_to_visit", "visit_duration", "commute_access"]), getStringArrayField(row, ["good_for", "tags", "search_terms"])]);
}

export function getRowTagText(row: PlaceRow): string {
  return normalizeComparableText(getLinkedTags(row).flatMap((tag) => [tag.id, tag.name, ...tag.searchTerms]));
}

export function getRowPromptText(row: PlaceRow): string {
  return normalizeComparableText([getRowIdentityText(row), getRowDiscoveryText(row), getRowIntentText(row), getRowSupportingText(row), getRowLowPriorityText(row), getRowTagText(row)]);
}

export function getRowSupportingText(row: PlaceRow): string {
  return normalizeComparableText([getStringField(row, ["description"])]);
}

export function getRowLowPriorityText(row: PlaceRow): string {
  return normalizeComparableText([getStringField(row, ["parking_info", "visit_duration"])]);
}

export function countMatchedTerms(text: string, terms: string[]): number {
  if (!text || terms.length === 0) return 0;
  return terms.filter((term) => includesNormalizedPhrase(text, term)).length;
}

export function queryMentionsAnyPhrase(text: string, phrases: readonly string[]): boolean {
  if (!text || phrases.length === 0) return false;
  return phrases.some((phrase) => includesNormalizedPhrase(text, phrase));
}

export function includesNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeComparableText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(text);
}

export function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function getLinkedCategoryIds(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;
  if (!Array.isArray(linkedCategories)) return [];
  return linkedCategories.map((item) => { const categoryId = (item as PlaceCategoryJoin).category_id; return typeof categoryId === "string" ? categoryId.trim() : ""; }).filter((id) => id !== "");
}

export function getNestedObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export function getLinkedCategoryNames(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;
  if (!Array.isArray(linkedCategories)) return [];
  return linkedCategories.map((item) => { const category = getNestedObject((item as PlaceCategoryJoin).categories); return getStringField(category ?? {}, ["name"]); }).filter((name): name is string => Boolean(name));
}

export function getLinkedCategories(row: PlaceRow): SearchCategoryMetadata[] {
  const linkedCategories = row.place_categories;
  if (!Array.isArray(linkedCategories)) return [];
  return linkedCategories.map((item) => {
    const categoryId = (item as PlaceCategoryJoin).category_id;
    const category = getNestedObject((item as PlaceCategoryJoin).categories);
    const id = typeof categoryId === "string" && categoryId.trim() ? categoryId.trim() : getStringField(category ?? {}, ["id"]);
    if (!id) return null;
    return { id, name: getStringField(category ?? {}, ["name"]) ?? id };
  }).filter((cat): cat is SearchCategoryMetadata => cat !== null);
}

export function getLinkedCategorySearchTerms(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;
  if (!Array.isArray(linkedCategories)) return [];
  return linkedCategories.flatMap((item) => { const category = getNestedObject((item as PlaceCategoryJoin).categories); return category ? getStringArrayField(category, ["search_terms", "searchTerms"]) : []; });
}

export function getLinkedTags(row: PlaceRow): { id: string; name: string | null; group: string; searchTerms: string[]; strength: number }[] {
  const linkedTags = row.place_tags;
  if (!Array.isArray(linkedTags)) return [];
  return linkedTags.map((item) => {
    const placeTag = item as PlaceTagJoin;
    const tag = getNestedObject(placeTag.tags);
    const id = getStringField(tag ?? {}, ["id"]);
    if (!id) return null;
    return { id, name: getStringField(tag ?? {}, ["name"]), group: getStringField(tag ?? {}, ["tag_group", "group"]) ?? "general", searchTerms: getStringArrayField(tag ?? {}, ["search_terms", "searchTerms"]), strength: Math.min(Math.max(getNumberField(placeTag as PlaceRow, ["strength"]) ?? 3, 1), 5) };
  }).filter((tag): tag is NonNullable<typeof tag> => tag !== null);
}

export function getLinkedTagMetadata(row: PlaceRow): SearchTagMetadata[] {
  return getLinkedTags(row).map((tag) => ({ id: tag.id, name: tag.name ?? tag.id, group: tag.group, strength: tag.strength })).sort((left, right) => { if (right.strength !== left.strength) return right.strength - left.strength; return left.name.localeCompare(right.name); });
}

export function getStructuredLocationText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["city", "area"]));
}

export function getStructuredCategoryText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
  ]);
}

export function getStructuredGoodForText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringArrayField(row, ["good_for", "search_terms", "tags"]),
  ]);
}

export function getIndoorOutdoorText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["indoor_outdoor"]));
}

export function getWeatherFitText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["weather_fit"]));
}

export function getMappedDbCategories(categoryId: string): string[] {
  if (categoryId === "all") return [];
  const mappedCategories = CATEGORY_TO_DB_CATEGORIES[categoryId];
  if (mappedCategories) return mappedCategories;
  const selectedCategory = findCategoryById(categoryId);
  return selectedCategory?.name ? [selectedCategory.name] : [categoryId];
}
