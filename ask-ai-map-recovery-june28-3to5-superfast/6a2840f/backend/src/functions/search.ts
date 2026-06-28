import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "crypto";
import { validateJwt } from "../utils/auth";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { generateSearchCacheKey } from "../utils/cacheKey";
import {
  getSearchTerms,
  inferCategoryIdsFromQuery,
  normalizeSearchText,
} from "../utils/searchMatching";
import {
  getMetroManilaLocationKeywordsForCity,
  inferMetroManilaLocationsFromQuery,
} from "../utils/metroManilaLocations";
import {
  METRO_MANILA_AREAS,
  findAreaById,
  findCategoryById,
  findGoodForById,
} from "./filters";

type SearchRequestBody = {
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
};

type PlaceRow = Record<string, unknown>;
type PlaceCategoryJoin = {
  category_id?: unknown;
  categories?: unknown;
};
type PlaceTagJoin = {
  strength?: unknown;
  tags?: unknown;
};

type SearchCategoryMetadata = {
  id: string;
  name: string;
};

type SearchTagMetadata = {
  id: string;
  name: string;
  group: string;
  strength: number;
};

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
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  imageAlt?: string | null;
  curatedImageUrls: string[];
  address: string | null;
  budget: string | null;
  budgetRange: string | null;
  reason: string | null;
  place_history: string | null;
  best_time_to_visit: string | null;
  visit_duration: string | null;
  good_for: string[];
  not_ideal_for: string[];
  crowd_level: string | null;
  indoor_outdoor: string | null;
  weather_fit: string | null;
  parking_info: string | null;
  accessibility_notes: string | null;
  decision_reason: string | null;
  commute_friendly: boolean | null;
  commute_access: string | null;
  nearby_context: string | null;
  budget_notes: string | null;
  verification_status: string | null;
  verification_notes: string | null;
  verification_sources: string[];
  last_verified_at: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  distanceKm?: number | null;
  tags?: SearchTagMetadata[];
  matchedCategories?: SearchCategoryMetadata[];
  matchedTags?: SearchTagMetadata[];
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

type NearbySearchContext = {
  userLocation: UserLocation;
  radiusKm: number;
};

type HistoryPlaceViewRow = {
  place_id?: unknown;
  user_id?: unknown;
  created_at?: unknown;
};

type TrendingSignal = {
  uniqueViewerCount: number;
  latestViewedAt: number;
};

type SearchContext = {
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

type BudgetValue =
  | "any"
  | "free"
  | "under-500"
  | "500-1000"
  | "1000-2000"
  | "2000-plus";

const VALID_BUDGET_VALUES: BudgetValue[] = [
  "any",
  "free",
  "under-500",
  "500-1000",
  "1000-2000",
  "2000-plus",
];

const DEFAULT_SEARCH_PAGE = 1;
const STRICT_SEARCH_LIMIT = 10;
const TRENDING_LOOKBACK_DAYS = 14;
const TRENDING_HISTORY_LIMIT = 5000;

const CATEGORY_TO_DB_CATEGORIES: Record<string, string[]> = {
  kainan: ["Kainan", "Restaurant", "Food"],
  cafe: ["Cafe"],
  mall: ["Mall"],
  parke: ["Parke", "Park"],
  nature: ["Nature", "Parke", "Park", "Garden"],
  museum: ["Museum"],
  heritage: ["Heritage"],
  tourist: ["Tourist", "Heritage", "Museum", "Hangout"],
  activity: ["Activity", "Arcade", "Cinema", "Games", "Hangout"],
  stay: ["Stay", "Hotel", "Accommodation"],
  nightlife: ["Nightlife", "Bar"],
  cinema: ["Cinema", "Movie Theater"],
};

const GOOD_FOR_TERMS: Record<string, string[]> = {
  date: ["date", "dates", "romantic", "couple", "anniversary"],
  barkada: ["barkada", "barkadas", "friends", "group", "hangout"],
  family: ["family", "kids", "child friendly", "all ages"],
  study: ["study", "student", "quiet", "work friendly", "wifi"],
  chill: ["chill", "relax", "tambayan", "low key"],
};

const QUERY_INTENT_SIGNALS = [
  {
    id: "rain-friendly",
    queryPhrases: ["rain", "rainy", "ulan"],
    rowPhrases: ["rain", "rainy", "ulan", "indoor", "covered", "aircon", "air conditioned"],
  },
  {
    id: "commute-friendly",
    queryPhrases: ["commute", "commuter", "sakay", "lrt", "mrt", "jeep", "tricycle", "bus"],
    rowPhrases: [
      "commute",
      "commuter",
      "ride hailing",
      "lrt",
      "mrt",
      "jeep",
      "tricycle",
      "bus",
      "walkable",
      "accessible",
    ],
  },
  {
    id: "drive-friendly",
    queryPhrases: ["parking", "car", "drive", "driving", "roadtrip"],
    rowPhrases: ["parking", "car", "drive", "parking available"],
  },
  {
    id: "study-work",
    queryPhrases: ["study", "work", "wifi", "laptop", "focus", "productive"],
    rowPhrases: ["study", "work", "wifi", "laptop", "focus", "productive", "quiet"],
  },
  {
    id: "quiet-chill",
    queryPhrases: ["quiet", "peaceful", "calm", "tahimik", "relax", "chill"],
    rowPhrases: ["quiet", "peaceful", "calm", "relax", "chill", "not crowded", "less crowded"],
  },
  {
    id: "date",
    queryPhrases: ["date", "romantic", "couple", "anniversary", "jowa"],
    rowPhrases: ["date", "romantic", "couple", "anniversary"],
  },
  {
    id: "family",
    queryPhrases: ["family", "kids", "child", "children", "pamilya"],
    rowPhrases: ["family", "kids", "child", "children", "all ages", "family friendly", "kid friendly"],
  },
  {
    id: "group",
    queryPhrases: ["barkada", "friends", "group", "tropa", "hangout"],
    rowPhrases: ["barkada", "friends", "group", "hangout"],
  },
  {
    id: "night",
    queryPhrases: ["night", "late night", "gabi", "after work"],
    rowPhrases: ["night", "late night", "gabi", "after work"],
  },
  {
    id: "indoor",
    queryPhrases: ["indoor", "aircon", "air conditioned", "covered"],
    rowPhrases: ["indoor", "aircon", "air conditioned", "covered"],
  },
  {
    id: "outdoor",
    queryPhrases: ["outdoor", "outside", "fresh air", "open air"],
    rowPhrases: ["outdoor", "outside", "fresh air", "open air", "park", "garden"],
  },
] as const;

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
  key:
    | "category"
    | "area"
    | "city"
    | "good_for"
    | "budget"
    | "indoor_outdoor"
    | "weather_fit"
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

function getFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function getPositiveInteger(
  value: unknown,
  fallbackValue: number,
  {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
  }: { min?: number; max?: number } = {}
): number {
  const numericValue = getFiniteNumber(value);

  if (numericValue === null) {
    return fallbackValue;
  }

  const roundedValue = Math.floor(numericValue);

  if (!Number.isFinite(roundedValue)) {
    return fallbackValue;
  }

  return Math.min(Math.max(roundedValue, min), max);
}

function isValidLatitude(value: number): boolean {
  return value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return value >= -180 && value <= 180;
}

function getNearbySearchContext(body: SearchRequestBody): NearbySearchContext | null {
  if (!body.userLocation || typeof body.userLocation !== "object") {
    return null;
  }

  const userLocation = body.userLocation as Record<string, unknown>;
  const latitude = getFiniteNumber(userLocation.latitude);
  const longitude = getFiniteNumber(userLocation.longitude);
  const radiusKm = getFiniteNumber(body.radiusKm);

  if (
    latitude === null ||
    longitude === null ||
    radiusKm === null ||
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude) ||
    radiusKm <= 0
  ) {
    return null;
  }

  return {
    userLocation: {
      latitude,
      longitude,
    },
    radiusKm: Math.min(radiusKm, 50),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceKm(
  from: UserLocation,
  to: { latitude: number; longitude: number }
): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getRowDistanceKm(row: PlaceRow, userLocation: UserLocation): number | null {
  const latitude = getNumberField(row, ["latitude", "lat"]);
  const longitude = getNumberField(row, ["longitude", "lng", "lon"]);

  if (
    latitude === null ||
    longitude === null ||
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude)
  ) {
    return null;
  }

  return getDistanceKm(userLocation, { latitude, longitude });
}

function getTrendingCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function getTrendingSignalSortValue(signal: TrendingSignal | undefined): number {
  if (!signal) {
    return -1;
  }

  return signal.uniqueViewerCount * 1_000_000_000_000 + signal.latestViewedAt;
}

async function getTrendingSignalsByPlaceId(): Promise<Map<string, TrendingSignal>> {
  const supabase = await getSupabaseAdminClient();
  const historyTable = supabase.from("history") as ReturnType<typeof supabase.from> & {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean; nullsFirst?: boolean }
          ) => {
            limit: (
              count: number
            ) => Promise<{ data: HistoryPlaceViewRow[] | null; error: unknown }>;
          };
        };
      };
    };
  };

  const cutoffIso = getTrendingCutoffIso(TRENDING_LOOKBACK_DAYS);
  const { data, error } = await historyTable
    .select("place_id,user_id,created_at")
    .eq("type", "place_view")
    .gte("created_at", cutoffIso)
    .order("created_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(TRENDING_HISTORY_LIMIT);

  if (error) {
    throw new Error("Failed to query trending place views.");
  }

  const viewersByPlaceId = new Map<string, Set<string>>();
  const latestViewedAtByPlaceId = new Map<string, number>();

  for (const row of data ?? []) {
    const placeId = typeof row.place_id === "string" ? row.place_id.trim() : "";
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const createdAt =
      typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;

    if (!placeId || !userId || Number.isNaN(createdAt)) {
      continue;
    }

    const viewers = viewersByPlaceId.get(placeId) ?? new Set<string>();
    viewers.add(userId);
    viewersByPlaceId.set(placeId, viewers);

    const previousLatestViewedAt = latestViewedAtByPlaceId.get(placeId) ?? 0;
    latestViewedAtByPlaceId.set(placeId, Math.max(previousLatestViewedAt, createdAt));
  }

  const signalsByPlaceId = new Map<string, TrendingSignal>();

  for (const [placeId, viewers] of viewersByPlaceId.entries()) {
    signalsByPlaceId.set(placeId, {
      uniqueViewerCount: viewers.size,
      latestViewedAt: latestViewedAtByPlaceId.get(placeId) ?? 0,
    });
  }

  return signalsByPlaceId;
}

function roundDistanceKm(distanceKm: number | null): number | null {
  if (distanceKm === null) {
    return null;
  }

  return Math.round(distanceKm * 100) / 100;
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
    return normalizeSearchText(value);
  }

  if (Array.isArray(value)) {
    return normalizeSearchText(value.filter(Boolean).join(" "));
  }

  return "";
}

function getRowIdentityText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, [
      "name",
      "normalized_name",
      "slug",
    ]),
    getStringArrayField(row, ["search_aliases"]),
  ]);
}

function getRowDiscoveryText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, [
      "category",
      "city",
      "area",
      "address",
      "searchable_text",
    ]),
    getStringArrayField(row, ["search_keywords"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
  ]);
}

function getRowIntentText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, [
      "best_time_to_visit",
      "visit_duration",
      "crowd_level",
      "indoor_outdoor",
      "weather_fit",
      "commute_access",
    ]),
    getStringArrayField(row, ["good_for"]),
  ]);
}

function getRowTagText(row: PlaceRow): string {
  return normalizeComparableText(
    getLinkedTags(row).flatMap((tag) => [tag.id, tag.name, ...tag.searchTerms])
  );
}

function getRowPromptText(row: PlaceRow): string {
  return normalizeComparableText([
    getRowIdentityText(row),
    getRowDiscoveryText(row),
    getRowIntentText(row),
    getRowSupportingText(row),
    getRowLowPriorityText(row),
    getRowTagText(row),
  ]);
}

function getRowSupportingText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["description", "nearby_context"]),
  ]);
}

function getRowLowPriorityText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["parking_info", "visit_duration"]),
    getStringArrayField(row, ["not_ideal_for"]),
  ]);
}

function countMatchedTerms(text: string, terms: string[]): number {
  if (!text || terms.length === 0) {
    return 0;
  }

  return terms.filter((term) => includesNormalizedPhrase(text, term)).length;
}

function queryMentionsAnyPhrase(text: string, phrases: readonly string[]): boolean {
  if (!text || phrases.length === 0) {
    return false;
  }

  return phrases.some((phrase) => includesNormalizedPhrase(text, phrase));
}

function scoreNotIdealPenalty(row: PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const notIdealFor = getStringArrayField(row, ["not_ideal_for"]);

  if (notIdealFor.length === 0) {
    return 0;
  }

  const matchingPhrases = notIdealFor.filter((phrase) =>
    queryMentionsAnyPhrase(normalizedQuery, [
      phrase,
      ...getSearchTerms(phrase),
    ])
  );

  return matchingPhrases.length > 0 ? Math.min(matchingPhrases.length * 8, 16) : 0;
}

function getStructuredLocationText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["city", "area"]));
}

function getStructuredCategoryText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
  ]);
}

function getStructuredGoodForText(row: PlaceRow): string {
  return normalizeComparableText([
    getStringArrayField(row, ["good_for", "search_keywords"]),
    getStringField(row, ["searchable_text"]),
  ]);
}

function getIndoorOutdoorText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["indoor_outdoor"]));
}

function getWeatherFitText(row: PlaceRow): string {
  return normalizeComparableText(getStringField(row, ["weather_fit"]));
}

function includesNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeComparableText(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLinkedCategoryIds(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;

  if (!Array.isArray(linkedCategories)) {
    return [];
  }

  return linkedCategories
    .map((item) => {
      const categoryId = (item as PlaceCategoryJoin).category_id;
      return typeof categoryId === "string" ? categoryId.trim() : "";
    })
    .filter((categoryId) => categoryId !== "");
}

function getNestedObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getLinkedCategoryNames(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;

  if (!Array.isArray(linkedCategories)) {
    return [];
  }

  return linkedCategories
    .map((item) => {
      const category = getNestedObject((item as PlaceCategoryJoin).categories);
      return getStringField(category ?? {}, ["name"]);
    })
    .filter((name): name is string => Boolean(name));
}

function getLinkedCategories(row: PlaceRow): SearchCategoryMetadata[] {
  const linkedCategories = row.place_categories;

  if (!Array.isArray(linkedCategories)) {
    return [];
  }

  return linkedCategories
    .map((item) => {
      const categoryId = (item as PlaceCategoryJoin).category_id;
      const category = getNestedObject((item as PlaceCategoryJoin).categories);
      const id =
        typeof categoryId === "string" && categoryId.trim()
          ? categoryId.trim()
          : getStringField(category ?? {}, ["id"]);

      if (!id) {
        return null;
      }

      return {
        id,
        name: getStringField(category ?? {}, ["name"]) ?? id,
      };
    })
    .filter((category): category is SearchCategoryMetadata => category !== null);
}

function getLinkedCategorySearchTerms(row: PlaceRow): string[] {
  const linkedCategories = row.place_categories;

  if (!Array.isArray(linkedCategories)) {
    return [];
  }

  return linkedCategories.flatMap((item) => {
    const category = getNestedObject((item as PlaceCategoryJoin).categories);
    return category ? getStringArrayField(category, ["search_terms", "searchTerms"]) : [];
  });
}

function getLinkedTags(row: PlaceRow): {
  id: string;
  name: string | null;
  group: string;
  searchTerms: string[];
  strength: number;
}[] {
  const linkedTags = row.place_tags;

  if (!Array.isArray(linkedTags)) {
    return [];
  }

  return linkedTags
    .map((item) => {
      const placeTag = item as PlaceTagJoin;
      const tag = getNestedObject(placeTag.tags);
      const id = getStringField(tag ?? {}, ["id"]);

      if (!id) {
        return null;
      }

      return {
        id,
        name: getStringField(tag ?? {}, ["name"]),
        group: getStringField(tag ?? {}, ["tag_group", "group"]) ?? "general",
        searchTerms: getStringArrayField(tag ?? {}, ["search_terms", "searchTerms"]),
        strength: Math.min(Math.max(getNumberField(placeTag as PlaceRow, ["strength"]) ?? 3, 1), 5),
      };
    })
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null);
}

function getLinkedTagMetadata(row: PlaceRow): SearchTagMetadata[] {
  return getLinkedTags(row)
    .map((tag) => ({
      id: tag.id,
      name: tag.name ?? tag.id,
      group: tag.group,
      strength: tag.strength,
    }))
    .sort((left, right) => {
      if (right.strength !== left.strength) {
        return right.strength - left.strength;
      }

      return left.name.localeCompare(right.name);
    });
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

function rowMatchesCategory(row: PlaceRow, categoryIds: string[]): boolean {
  const selectedCategoryIds = categoryIds.filter((categoryId) => categoryId !== "all");

  if (selectedCategoryIds.length === 0) {
    return true;
  }

  const linkedCategoryIds = getLinkedCategoryIds(row);
  const categoryText = getStructuredCategoryText(row);

  return selectedCategoryIds.some((categoryId) =>
    linkedCategoryIds.includes(categoryId) ||
    [categoryId, ...getMappedDbCategories(categoryId)].some((category) =>
      includesNormalizedPhrase(categoryText, category)
    )
  );
}

function rowMatchesArea(row: PlaceRow, areaIds: string[]): boolean {
  const selectedAreaIds = areaIds.filter((areaId) => areaId !== "all");

  if (selectedAreaIds.length === 0) {
    return true;
  }

  const areaText = getStructuredLocationText(row);

  return selectedAreaIds.some((areaId) => {
    const selectedArea = findAreaById(areaId);
    const areaName = selectedArea?.name ?? areaId;
    const locationKeywords = getMetroManilaLocationKeywordsForCity(areaId);
    const terms = [areaId, areaName, ...locationKeywords];

    return terms.some((term) => areaText.includes(normalizeComparableText(term)));
  });
}

function rowMatchesGoodFor(row: PlaceRow, goodForIds: string[]): boolean {
  const selectedGoodForIds = goodForIds.filter((goodForId) => goodForId !== "all");

  if (selectedGoodForIds.length === 0) {
    return true;
  }

  const goodForText = getStructuredGoodForText(row);

  return selectedGoodForIds.some((goodForId) => {
    const terms = [goodForId, ...(GOOD_FOR_TERMS[goodForId] ?? [])];
    return terms.some((term) => includesNormalizedPhrase(goodForText, term));
  });
}

function rowMatchesIndoorOutdoor(row: PlaceRow, filterValue: string | null): boolean {
  if (!filterValue) {
    return true;
  }

  return includesNormalizedPhrase(getIndoorOutdoorText(row), filterValue);
}

function rowMatchesWeatherFit(row: PlaceRow, filterValue: string | null): boolean {
  if (!filterValue) {
    return true;
  }

  return includesNormalizedPhrase(getWeatherFitText(row), filterValue);
}

function inferGoodForIdsFromQuery(normalizedQuery: string): string[] {
  if (!normalizedQuery) {
    return [];
  }

  return Object.entries(GOOD_FOR_TERMS)
    .filter(([goodForId, terms]) =>
      [goodForId, ...terms].some((term) =>
        includesNormalizedPhrase(normalizedQuery, term)
      )
    )
    .map(([goodForId]) => goodForId);
}

function getPromptTerms(normalizedQuery: string): string[] {
  return getSearchTerms(normalizedQuery).filter((term) => !/^gm\d+$/i.test(term));
}

function getMatchedQueryIntentSignals(normalizedQuery: string): (typeof QUERY_INTENT_SIGNALS)[number][] {
  if (!normalizedQuery) {
    return [];
  }

  return QUERY_INTENT_SIGNALS.filter((signal) =>
    queryMentionsAnyPhrase(normalizedQuery, [...signal.queryPhrases, ...signal.rowPhrases])
  );
}

function rowMatchesPrompt(row: PlaceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return false;
  }

  const promptText = getRowPromptText(row);
  const matchedSignals = getMatchedQueryIntentSignals(normalizedQuery);

  if (promptTerms.some((term) => includesNormalizedPhrase(promptText, term))) {
    return true;
  }

  return matchedSignals.some((signal) =>
    queryMentionsAnyPhrase(promptText, signal.rowPhrases)
  );
}

function scoreLocationMatch(row: PlaceRow, areaIds: string[]): number {
  const selectedAreaIds = areaIds.filter((areaId) => areaId !== "all");

  if (selectedAreaIds.length === 0) {
    return 0;
  }

  return rowMatchesArea(row, selectedAreaIds) ? 35 : 0;
}

function scoreCategoryMatch(row: PlaceRow, categoryIds: string[]): number {
  const selectedCategoryIds = categoryIds.filter((categoryId) => categoryId !== "all");

  if (selectedCategoryIds.length === 0) {
    return 0;
  }

  const linkedCategoryIds = getLinkedCategoryIds(row);
  const categoryText = normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    linkedCategoryIds,
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
  ]);

  let bestScore = 0;

  for (const categoryId of selectedCategoryIds) {
    if (linkedCategoryIds.includes(categoryId)) {
      bestScore = Math.max(bestScore, 30);
      continue;
    }

    const selectedCategory = findCategoryById(categoryId);
    const exactTerms = [
      categoryId,
      selectedCategory?.name,
      ...(selectedCategory?.searchTerms ?? []),
    ].filter((term): term is string => Boolean(term));

    if (exactTerms.some((term) => includesNormalizedPhrase(categoryText, term))) {
      bestScore = Math.max(bestScore, 30);
      continue;
    }

    if (
      getMappedDbCategories(categoryId).some((category) =>
        includesNormalizedPhrase(categoryText, category)
      )
    ) {
      bestScore = Math.max(bestScore, 18);
    }
  }

  return bestScore;
}

function scoreGoodForMatch(row: PlaceRow, goodForIds: string[]): number {
  const selectedGoodForIds = goodForIds.filter((goodForId) => goodForId !== "all");

  if (selectedGoodForIds.length === 0) {
    return 0;
  }

  return rowMatchesGoodFor(row, selectedGoodForIds) ? 26 : 0;
}

function getMatchedCategories(
  row: PlaceRow,
  categoryIds: string[]
): SearchCategoryMetadata[] {
  const selectedCategoryIds = categoryIds.filter((categoryId) => categoryId !== "all");
  const linkedCategories = getLinkedCategories(row);

  if (selectedCategoryIds.length === 0) {
    return linkedCategories.slice(0, 2);
  }

  const categoryText = normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    linkedCategories.flatMap((category) => [category.id, category.name]),
    getLinkedCategorySearchTerms(row),
  ]);
  const matchedCategories = linkedCategories.filter((category) =>
    selectedCategoryIds.some((categoryId) => {
      if (category.id === categoryId) {
        return true;
      }

      const selectedCategory = findCategoryById(categoryId);
      const directTerms = [
        categoryId,
        selectedCategory?.name,
        ...(selectedCategory?.searchTerms ?? []),
      ].filter((term): term is string => Boolean(term));

      if (
        directTerms.some((term) => includesNormalizedPhrase(categoryText, term)) &&
        directTerms.some((term) =>
          includesNormalizedPhrase(
            normalizeComparableText([category.id, category.name]),
            term
          )
        )
      ) {
        return true;
      }

      return getMappedDbCategories(categoryId).some((mappedCategory) =>
        includesNormalizedPhrase(
          normalizeComparableText([category.id, category.name]),
          mappedCategory
        )
      );
    })
  );

  return (matchedCategories.length > 0 ? matchedCategories : linkedCategories).slice(0, 2);
}

function scoreTagMatch(row: PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const scoreByStrength: Record<number, number> = {
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
  };
  const totalScore = getLinkedTags(row).reduce((score, tag) => {
    const tagTerms = [tag.id, tag.name, ...tag.searchTerms].filter(
      (term): term is string => Boolean(term)
    );
    const isMatch = tagTerms.some((term) =>
      includesNormalizedPhrase(normalizedQuery, term)
    );

    return isMatch ? score + scoreByStrength[tag.strength] : score;
  }, 0);

  return Math.min(totalScore, 25);
}

function scoreIdentityMatch(row: PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return 0;
  }

  const identityText = getRowIdentityText(row);
  const exactIdentityQuery = includesNormalizedPhrase(identityText, normalizedQuery);
  const identityMatches = countMatchedTerms(identityText, promptTerms);

  let score = 0;

  if (exactIdentityQuery) {
    score += 28;
  }

  score += Math.min(identityMatches * 9, 27);

  return Math.min(score, 55);
}

function scoreDiscoveryMatch(row: PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return 0;
  }

  const discoveryText = getRowDiscoveryText(row);
  const discoveryMatches = countMatchedTerms(discoveryText, promptTerms);

  return Math.min(discoveryMatches * 6, 34);
}

function scoreIntentFieldMatch(
  row: PlaceRow,
  normalizedQuery: string,
  {
    selectedIndoorOutdoor,
    selectedWeatherFit,
  }: {
    selectedIndoorOutdoor: string | null;
    selectedWeatherFit: string | null;
  }
): number {
  const promptTerms = getPromptTerms(normalizedQuery);
  const intentText = getRowIntentText(row);
  const promptText = getRowPromptText(row);
  const intentMatches = countMatchedTerms(intentText, promptTerms);
  const matchedSignals = getMatchedQueryIntentSignals(normalizedQuery);

  let score = Math.min(intentMatches * 5, 25);

  if (
    queryMentionsAnyPhrase(normalizedQuery, ["rain", "rainy", "ulan"]) &&
    queryMentionsAnyPhrase(intentText, ["rain", "rainy", "ulan"])
  ) {
    score += 8;
  }

  if (
    queryMentionsAnyPhrase(normalizedQuery, ["commute", "commuter", "sakay", "lrt", "mrt", "jeep", "tricycle"]) &&
    queryMentionsAnyPhrase(intentText, ["commute", "commuter", "ride hailing", "lrt", "mrt", "jeep", "tricycle"])
  ) {
    score += 8;
  }

  if (
    queryMentionsAnyPhrase(normalizedQuery, ["parking", "car", "drive", "driving"]) &&
    queryMentionsAnyPhrase(getRowLowPriorityText(row), ["parking", "car", "drive"])
  ) {
    score += 2;
  }

  if (selectedIndoorOutdoor && rowMatchesIndoorOutdoor(row, selectedIndoorOutdoor)) {
    score += 18;
  }

  if (selectedWeatherFit && rowMatchesWeatherFit(row, selectedWeatherFit)) {
    score += 18;
  }

  if (matchedSignals.length > 0) {
    const signalMatches = matchedSignals.filter((signal) =>
      queryMentionsAnyPhrase(promptText, signal.rowPhrases)
    ).length;

    score += Math.min(signalMatches * 6, 18);
  }

  return Math.min(score, 45);
}

function getMatchedTags(row: PlaceRow, normalizedQuery: string): SearchTagMetadata[] {
  const matchedTags = getLinkedTags(row)
    .filter((tag) => {
      if (!normalizedQuery) {
        return false;
      }

      const tagTerms = [tag.id, tag.name, ...tag.searchTerms].filter(
        (term): term is string => Boolean(term)
      );

      return tagTerms.some((term) => includesNormalizedPhrase(normalizedQuery, term));
    })
    .map((tag) => ({
      id: tag.id,
      name: tag.name ?? tag.id,
      group: tag.group,
      strength: tag.strength,
    }))
    .sort((left, right) => {
      if (right.strength !== left.strength) {
        return right.strength - left.strength;
      }

      return left.name.localeCompare(right.name);
    });

  return matchedTags.length > 0 ? matchedTags : getLinkedTagMetadata(row).slice(0, 4);
}

function getBudgetRangeForFilter(budget: BudgetValue): { min: number; max: number } | null {
  switch (budget) {
    case "free":
      return { min: 0, max: 0 };
    case "under-500":
      return { min: 0, max: 500 };
    case "500-1000":
      return { min: 500, max: 1000 };
    case "1000-2000":
      return { min: 1000, max: 2000 };
    case "2000-plus":
      return { min: 2000, max: Number.POSITIVE_INFINITY };
    default:
      return null;
  }
}

function getBudgetLabelTermsForFilter(budget: BudgetValue): string[] {
  switch (budget) {
    case "free":
      return ["free", "libre", "walang entrance"];
    case "under-500":
      return ["under 500", "below 500", "under ₱500", "under php 500"];
    case "500-1000":
      return ["500 1000", "500 to 1000", "₱500 ₱1 000", "php 500 php 1000"];
    case "1000-2000":
      return ["1000 2000", "1000 to 2000", "₱1 000 ₱2 000", "php 1000 php 2000"];
    case "2000-plus":
      return ["2000", "2000 plus", "₱2 000", "php 2000", "premium"];
    default:
      return [];
  }
}

function getPlaceBudgetRange(row: PlaceRow): { min: number; max: number } | null {
  const min = getNumberField(row, ["budget_min"]);
  const max = getNumberField(row, ["budget_max"]);

  if (min === null && max === null) {
    return null;
  }

  return {
    min: min ?? 0,
    max: max ?? Number.POSITIVE_INFINITY,
  };
}

function rangesOverlap(
  left: { min: number; max: number },
  right: { min: number; max: number }
): boolean {
  return left.min <= right.max && right.min <= left.max;
}

function rangesAreNear(
  left: { min: number; max: number },
  right: { min: number; max: number }
): boolean {
  const finiteLeftMax = Number.isFinite(left.max) ? left.max : left.min;
  const finiteRightMax = Number.isFinite(right.max) ? right.max : right.min;
  const gap =
    left.max < right.min ? right.min - finiteLeftMax : left.min - finiteRightMax;

  return gap >= 0 && gap <= 500;
}

function getBooleanField(row: PlaceRow, keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return false;
}

function scoreBudgetMatch(
  row: PlaceRow,
  budget: BudgetValue,
  normalizedQuery: string
): number {
  const selectedBudgetRange = getBudgetRangeForFilter(budget);
  const budgetMin = getNumberField(row, ["budget_min"]);
  void normalizedQuery;

  if (budget === "any" || !selectedBudgetRange || budgetMin === null) {
    return 0;
  }

  return budgetMin >= selectedBudgetRange.min && budgetMin <= selectedBudgetRange.max ? 15 : 0;
}

function scoreSupportingMatch(row: PlaceRow, normalizedQuery: string): number {
  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return 0;
  }

  const supportingText = getRowSupportingText(row);
  const matches = countMatchedTerms(supportingText, promptTerms);

  return Math.min(matches * 3, 10);
}

function scoreLowPriorityMatch(row: PlaceRow, normalizedQuery: string): number {
  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return 0;
  }

  const lowPriorityText = getRowLowPriorityText(row);
  const matches = countMatchedTerms(lowPriorityText, promptTerms);

  return Math.min(matches, 3);
}

function scorePlaceForSearch({
  row,
  normalizedQuery,
  categoryIds,
  areaIds,
  goodForIds,
  budget,
  selectedIndoorOutdoor,
  selectedWeatherFit,
}: {
  row: PlaceRow;
  normalizedQuery: string;
  categoryIds: string[];
  areaIds: string[];
  goodForIds: string[];
  budget: BudgetValue;
  selectedIndoorOutdoor: string | null;
  selectedWeatherFit: string | null;
}): number {
  const structuredScore =
    scoreLocationMatch(row, areaIds) +
    scoreCategoryMatch(row, categoryIds) +
    scoreGoodForMatch(row, goodForIds) +
    scoreBudgetMatch(row, budget, normalizedQuery);
  const identityScore = scoreIdentityMatch(row, normalizedQuery);
  const discoveryScore = scoreDiscoveryMatch(row, normalizedQuery);
  const tagScore = scoreTagMatch(row, normalizedQuery);
  const intentScore = scoreIntentFieldMatch(row, normalizedQuery, {
    selectedIndoorOutdoor,
    selectedWeatherFit,
  });
  const supportingScore = scoreSupportingMatch(row, normalizedQuery);
  const lowPriorityScore = scoreLowPriorityMatch(row, normalizedQuery);
  const penalty = scoreNotIdealPenalty(row, normalizedQuery);
  const coreScore = structuredScore + identityScore + discoveryScore + tagScore + intentScore;

  if (coreScore === 0) {
    return Math.max(Math.min(supportingScore + lowPriorityScore, 3) - penalty, 0);
  }

  return Math.max(coreScore + supportingScore + lowPriorityScore - penalty, 0);
}

function rowMatchesBudget(row: PlaceRow, budget: BudgetValue): boolean {
  if (budget === "any") {
    return true;
  }

  const budgetMin = getNumberField(row, ["budget_min"]);

  if (budgetMin === null) {
    return false;
  }

  switch (budget) {
    case "free":
      return budgetMin === 0;
    case "under-500":
      return budgetMin <= 500;
    case "500-1000":
      return budgetMin >= 500 && budgetMin <= 1000;
    case "1000-2000":
      return budgetMin >= 1000 && budgetMin <= 2000;
    case "2000-plus":
      return budgetMin >= 2000;
    default:
      return true;
  }
}

function mapPlaceRowToSearchResult(
  row: PlaceRow,
  {
    normalizedQuery,
    categoryIds,
    distanceKm,
  }: {
    normalizedQuery: string;
    categoryIds: string[];
    distanceKm?: number | null;
  }
): SearchPlaceResult {
  const city = getStringField(row, ["city", "area"]);
  const address = getStringField(row, ["address", "formatted_address"]);
  const fallbackLocation = [address, city].filter(Boolean).join(", ");
  const location = getStringField(row, ["location"]) ?? (fallbackLocation || null);
  const categories = getLinkedCategories(row);
  const tags = getLinkedTagMetadata(row);

  return {
    id: String(row.id ?? row.foursquare_id ?? row.slug ?? ""),
    slug: getStringField(row, ["slug"]),
    name: getStringField(row, ["name"]),
    description: getStringField(row, ["description", "reason"]),
    area: getStringField(row, ["area", "city"]),
    city,
    location,
    category: getStringField(row, ["category"]),
    categories:
      categories.length > 0
        ? categories
        : getLinkedCategoryIds(row).map((categoryId) => ({
            id: categoryId,
            name: categoryId,
          })),
    latitude: getNumberField(row, ["latitude", "lat"]),
    longitude: getNumberField(row, ["longitude", "lng", "lon"]),
    imageUrl: null,
    thumbnailUrl: null,
    imageAlt: getStringField(row, ["name"]),
    curatedImageUrls: [],
    address,
    budget: getStringField(row, ["budget"]),
    budgetRange: getStringField(row, ["budgetRange", "budget_range", "priceRange", "price_range"]),
    reason: getStringField(row, ["reason", "description"]),
    place_history: getStringField(row, ["place_history"]),
    best_time_to_visit: getStringField(row, ["best_time_to_visit"]),
    visit_duration: getStringField(row, ["visit_duration"]),
    good_for: getStringArrayField(row, ["good_for"]),
    not_ideal_for: getStringArrayField(row, ["not_ideal_for"]),
    crowd_level: getStringField(row, ["crowd_level"]),
    indoor_outdoor: getStringField(row, ["indoor_outdoor"]),
    weather_fit: getStringField(row, ["weather_fit"]),
    parking_info: getStringField(row, ["parking_info"]),
    accessibility_notes: getStringField(row, ["accessibility_notes"]),
    decision_reason: getStringField(row, ["decision_reason"]),
    commute_friendly: typeof row.commute_friendly === "boolean" ? row.commute_friendly : null,
    commute_access: getStringField(row, ["commute_access"]),
    nearby_context: getStringField(row, ["nearby_context"]),
    budget_notes: getStringField(row, ["budget_notes"]),
    verification_status: getStringField(row, ["verification_status"]),
    verification_notes: getStringField(row, ["verification_notes"]),
    verification_sources: getStringArrayField(row, ["verification_sources"]),
    last_verified_at: getStringField(row, ["last_verified_at"]),
    website_url: getStringField(row, ["website_url"]),
    google_maps_url: getStringField(row, ["google_maps_url"]),
    distanceKm: roundDistanceKm(distanceKm ?? null),
    tags,
    matchedCategories: getMatchedCategories(row, categoryIds),
    matchedTags: getMatchedTags(row, normalizedQuery),
  };
}

type ApprovedSearchImageRow = {
  place_id?: unknown;
  image_url?: unknown;
};

export async function attachApprovedImagesToSearchResults(
  places: SearchPlaceResult[]
): Promise<SearchPlaceResult[]> {
  const placeIds = places
    .map((place) => place.id?.trim())
    .filter((placeId): placeId is string => Boolean(placeId));

  if (placeIds.length === 0) {
    return places;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select("place_id, image_url, sort_order, created_at")
    .in("place_id", placeIds)
    .eq("status", "approved")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Failed to load approved place images for search results.");
  }

  const imageUrlsByPlaceId = new Map<string, string[]>();

  for (const row of (data ?? []) as ApprovedSearchImageRow[]) {
    const placeId = typeof row.place_id === "string" ? row.place_id.trim() : "";
    const imageUrl = typeof row.image_url === "string" ? row.image_url.trim() : "";

    if (!placeId || !imageUrl) {
      continue;
    }

    const existingUrls = imageUrlsByPlaceId.get(placeId) ?? [];

    if (existingUrls.includes(imageUrl)) {
      continue;
    }

    existingUrls.push(imageUrl);
    imageUrlsByPlaceId.set(placeId, existingUrls);
  }

  return places.map((place) => {
    const approvedImageUrls = imageUrlsByPlaceId.get(place.id) ?? [];
    const primaryImageUrl = approvedImageUrls[0] ?? null;

    if (!primaryImageUrl) {
      return place;
    }

    return {
      ...place,
      imageUrl: primaryImageUrl,
      thumbnailUrl: primaryImageUrl,
      imageAlt: place.name ? `Photo of ${place.name}` : place.imageAlt ?? null,
      curatedImageUrls: approvedImageUrls,
    };
  });
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
  goodForId,
  budget,
  userType,
  createdAt,
}: {
  searchId: string;
  query: string;
  categoryId: string;
  areaId: string;
  goodForId: string;
  budget: BudgetValue;
  userType: SearchContext["userType"];
  createdAt: string;
}): SearchContext {
  return {
    searchId,
    query,
    category: normalizeSearchFilter(categoryId, "all"),
    area: normalizeSearchFilter(areaId, "all"),
    good_for: normalizeSearchFilter(goodForId, "all"),
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

export async function findSearchPlaces({
  normalizedQuery,
  categoryIds,
  areaIds,
  goodForIds,
  budget,
  selectedIndoorOutdoor,
  selectedWeatherFit,
  requirePromptMatch,
  nearbySearch,
  prioritizeTrending,
}: {
  normalizedQuery: string;
  categoryIds: string[];
  areaIds: string[];
  goodForIds: string[];
  budget: BudgetValue;
  selectedIndoorOutdoor: string | null;
  selectedWeatherFit: string | null;
  requirePromptMatch: boolean;
  nearbySearch: NearbySearchContext | null;
  prioritizeTrending: boolean;
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

  let queryBuilder = placesTable.select(
    "*,place_categories(category_id,categories(id,name,search_terms)),place_tags(strength,tags(id,name,tag_group,search_terms))"
  ) as {
    order: (
      column: string,
      options?: { ascending?: boolean; nullsFirst?: boolean }
    ) => typeof queryBuilder;
    limit: (count: number) => Promise<{ data: PlaceRow[] | null; error: unknown }>;
    ilike: (column: string, pattern: string) => typeof queryBuilder;
    or: (filters: string) => typeof queryBuilder;
  };

  const orderedQuery = queryBuilder.order("name", {
    ascending: true,
    nullsFirst: false,
  });
  const { data, error } = await orderedQuery.limit(1000);

  if (error) {
    throw new Error("Failed to query search places.");
  }

  let trendingSignalsByPlaceId = new Map<string, TrendingSignal>();

  if (prioritizeTrending) {
    try {
      trendingSignalsByPlaceId = await getTrendingSignalsByPlaceId();
    } catch {
      trendingSignalsByPlaceId = new Map<string, TrendingSignal>();
    }
  }

  const rankedRows = (data ?? [])
    .filter((row) => rowMatchesArea(row, areaIds))
    .filter((row) => rowMatchesCategory(row, categoryIds))
    .filter((row) => rowMatchesGoodFor(row, goodForIds))
    .filter((row) => rowMatchesBudget(row, budget))
    .filter((row) => rowMatchesIndoorOutdoor(row, selectedIndoorOutdoor))
    .filter((row) => rowMatchesWeatherFit(row, selectedWeatherFit))
    .filter((row) => !requirePromptMatch || rowMatchesPrompt(row, normalizedQuery))
    .map((row) => ({
      row,
      score: scorePlaceForSearch({
        row,
        normalizedQuery,
        categoryIds,
        areaIds,
        goodForIds,
        budget,
        selectedIndoorOutdoor,
        selectedWeatherFit,
      }),
      distanceKm: nearbySearch
        ? getRowDistanceKm(row, nearbySearch.userLocation)
        : null,
      trendingSignal:
        prioritizeTrending
          ? trendingSignalsByPlaceId.get(getStringField(row, ["id"]) ?? "")
          : undefined,
    }));

  const hasNearbyMatches = nearbySearch
    ? rankedRows.some(
        ({ distanceKm }) => distanceKm !== null && distanceKm <= nearbySearch.radiusKm
      )
    : false;

  return rankedRows
    .sort((left, right) => {
      if (nearbySearch && hasNearbyMatches) {
        const leftIsNearby =
          left.distanceKm !== null && left.distanceKm <= nearbySearch.radiusKm;
        const rightIsNearby =
          right.distanceKm !== null && right.distanceKm <= nearbySearch.radiusKm;

        if (leftIsNearby !== rightIsNearby) {
          return leftIsNearby ? -1 : 1;
        }

        if (leftIsNearby && rightIsNearby && left.distanceKm !== right.distanceKm) {
          if (left.distanceKm === null) {
            return 1;
          }

          if (right.distanceKm === null) {
            return -1;
          }

          return left.distanceKm - right.distanceKm;
        }
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (prioritizeTrending) {
        const trendDelta =
          getTrendingSignalSortValue(right.trendingSignal) -
          getTrendingSignalSortValue(left.trendingSignal);

        if (trendDelta !== 0) {
          return trendDelta;
        }
      }

      if (
        nearbySearch &&
        left.distanceKm !== null &&
        right.distanceKm !== null &&
        left.distanceKm !== right.distanceKm
      ) {
        return left.distanceKm - right.distanceKm;
      }

      return (getStringField(left.row, ["name"]) ?? "").localeCompare(
        getStringField(right.row, ["name"]) ?? ""
      );
    })
    .map(({ row, distanceKm }) =>
      mapPlaceRowToSearchResult(row, {
        normalizedQuery,
        categoryIds,
        distanceKm,
      })
    );
}

export async function search(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing Supabase search request...");

  try {
    const body = (await request.json()) as SearchRequestBody;
    const filters = getFiltersPayload(body);
    const query = getSearchQuery(body);
    const categoryId =
      getOptionalFilterId(getFilterValue(body, filters, "category")) ?? "all";
    const areaId =
      getOptionalFilterId(
        getFilterValue(body, filters, "city") ?? getFilterValue(body, filters, "area")
      ) ?? "all";
    const goodForId =
      getOptionalFilterId(getFilterValue(body, filters, "good_for")) ?? "all";
    const budget = getBudgetFilter(getFilterValue(body, filters, "budget"));
    const indoorOutdoorFilter =
      getOptionalFilterId(getFilterValue(body, filters, "indoor_outdoor")) ?? null;
    const weatherFitFilter =
      getOptionalFilterId(getFilterValue(body, filters, "weather_fit")) ?? null;
    const page = getPositiveInteger(body.page, DEFAULT_SEARCH_PAGE, {
      min: 1,
    });
    const limit = STRICT_SEARCH_LIMIT;
    const shouldExploreAll = body.exploreAll === true;
    const normalizedQuery = normalizeSearchText(query);
    const nearbySearch = getNearbySearchContext(body);
    const selectedCategory = findCategoryById(categoryId);
    const selectedArea = findAreaById(areaId);
    const selectedGoodFor = findGoodForById(goodForId);
    const inferredCategoryIds = inferCategoryIdsFromQuery(normalizedQuery);
    const inferredLocations = inferMetroManilaLocationsFromQuery(normalizedQuery);
    const inferredGoodForIds = inferGoodForIdsFromQuery(normalizedQuery);
    const discoveryCategoryIds =
      categoryId !== "all" ? [categoryId] : inferredCategoryIds;
    const discoveryAreaIds =
      areaId !== "all" ? [areaId] : inferredLocations.cityIds.slice(0, 1);
    const discoveryGoodForIds =
      goodForId !== "all" ? [goodForId] : inferredGoodForIds;
    const hasSelectedFilters =
      categoryId !== "all" ||
      areaId !== "all" ||
      goodForId !== "all" ||
      budget !== "any" ||
      Boolean(indoorOutdoorFilter) ||
      Boolean(weatherFitFilter);
    const hasNearbySearch = Boolean(nearbySearch);
    const shouldRequirePromptMatch =
      !hasSelectedFilters &&
      !hasNearbySearch &&
      Boolean(normalizedQuery) &&
      discoveryCategoryIds.length === 0 &&
      discoveryAreaIds.length === 0 &&
      discoveryGoodForIds.length === 0;
    const isBroadDiscoverySearch =
      shouldExploreAll &&
      !normalizedQuery &&
      categoryId === "all" &&
      areaId === "all" &&
      goodForId === "all" &&
      budget === "any";

    if (!normalizedQuery && !hasSelectedFilters && !hasNearbySearch && !isBroadDiscoverySearch) {
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

    if (goodForId !== "all" && !selectedGoodFor) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid good_for filter.",
        },
      };
    }

    const cacheKey = generateSearchCacheKey(
      normalizedQuery,
      categoryId,
      areaId,
      goodForId,
      budget
    );
    const userContext = await resolveUserContext(request);
    const userType = userContext.userType;

    const searchId = createSearchId();
    const searchContext = buildSearchContext({
      searchId,
      query,
      categoryId,
      areaId,
      goodForId,
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

    const places = await findSearchPlaces({
      normalizedQuery,
      categoryIds: discoveryCategoryIds,
      areaIds: discoveryAreaIds,
      goodForIds: discoveryGoodForIds,
      budget,
      selectedIndoorOutdoor: indoorOutdoorFilter,
      selectedWeatherFit: weatherFitFilter,
      requirePromptMatch: isBroadDiscoverySearch ? false : shouldRequirePromptMatch,
      nearbySearch,
      prioritizeTrending: isBroadDiscoverySearch,
    });
    const totalCount = places.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    const pageStartIndex = (safePage - 1) * limit;
    const paginatedPlaces = await attachApprovedImagesToSearchResults(
      places.slice(pageStartIndex, pageStartIndex + limit)
    );

    return {
      status: 200,
      jsonBody: {
        message: "Search processed successfully.",
        searchId,
        userType,
        cacheHit: false,
        cacheKey,
        searchMode: isBroadDiscoverySearch ? "broad-discovery" : "supabase",
        searchContext,
        page: safePage,
        limit,
        totalCount,
        totalPages,
        places: paginatedPlaces,
        result: {
          geminiResponse: "",
          page: safePage,
          limit,
          totalCount,
          totalPages,
          places: paginatedPlaces,
        },
      },
    };
  } catch (error) {
    context.error(error);

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
