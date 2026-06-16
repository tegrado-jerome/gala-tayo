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
} from "./filters";

type SearchRequestBody = {
  query?: unknown;
  category?: unknown;
  area?: unknown;
  budget?: unknown;
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

type SearchPlaceResult = {
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

const CATEGORY_TO_DB_CATEGORIES: Record<string, string[]> = {
  kainan: ["Kainan", "Restaurant", "Food"],
  cafe: ["Cafe"],
  mall: ["Mall"],
  parke: ["Parke", "Park"],
  museum: ["Museum"],
  heritage: ["Heritage"],
  tourist: ["Tourist", "Heritage", "Museum", "Hangout"],
  date: ["Date", "Hangout", "Mall", "Cafe"],
  barkada: ["Hangout", "Mall"],
  family: ["Mall", "Museum", "Heritage", "Hangout"],
  study: ["Study", "Cafe", "Museum"],
  chill: ["Cafe", "Hangout"],
  nightlife: ["Nightlife", "Bar"],
  arcade: ["Arcade", "Games", "Gaming"],
  cinema: ["Cinema", "Movie Theater"],
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
  const categoryText = normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    linkedCategoryIds,
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
  ]);

  return selectedCategoryIds.some((categoryId) =>
    linkedCategoryIds.includes(categoryId) ||
    getMappedDbCategories(categoryId).some((category) =>
      categoryText.includes(normalizeComparableText(category))
    )
  );
}

function rowMatchesArea(row: PlaceRow, areaIds: string[]): boolean {
  const selectedAreaIds = areaIds.filter((areaId) => areaId !== "all");

  if (selectedAreaIds.length === 0) {
    return true;
  }

  const areaText = normalizeComparableText([
    getStringField(row, ["city", "area", "address", "location"]),
  ]);

  return selectedAreaIds.some((areaId) => {
    const selectedArea = findAreaById(areaId);
    const areaName = selectedArea?.name ?? areaId;
    const locationKeywords = getMetroManilaLocationKeywordsForCity(areaId);
    const terms = [areaId, areaName, ...locationKeywords];

    return terms.some((term) => areaText.includes(normalizeComparableText(term)));
  });
}

function getPromptTerms(normalizedQuery: string): string[] {
  return getSearchTerms(normalizedQuery).filter((term) => !/^gm\d+$/i.test(term));
}

function rowMatchesPrompt(row: PlaceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const promptTerms = getPromptTerms(normalizedQuery);

  if (promptTerms.length === 0) {
    return false;
  }

  const searchableText = normalizeComparableText([
    getStringField(row, ["name", "category", "city", "area", "address", "description"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
    getLinkedTags(row).flatMap((tag) => [tag.id, tag.name, ...tag.searchTerms]),
  ]);

  return promptTerms.some((term) => searchableText.includes(term));
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
  let score = 0;
  const selectedBudgetRange = getBudgetRangeForFilter(budget);
  const placeBudgetRange = getPlaceBudgetRange(row);

  if (budget !== "free" && selectedBudgetRange && placeBudgetRange) {
    if (rangesOverlap(selectedBudgetRange, placeBudgetRange)) {
      score = Math.max(score, 15);
    } else if (rangesAreNear(selectedBudgetRange, placeBudgetRange)) {
      score = Math.max(score, 5);
    }
  }

  const budgetLabel = normalizeComparableText(getStringField(row, ["budget_label"]));
  const mentionsFree = ["free", "libre", "walang entrance"].some((term) =>
    includesNormalizedPhrase(normalizedQuery, term)
  );
  const mentionsBudget = ["budget", "mura", "cheap", "tipid", "affordable"].some(
    (term) => includesNormalizedPhrase(normalizedQuery, term)
  );
  const mentionsPremium = ["premium", "fancy", "upscale", "luxury"].some((term) =>
    includesNormalizedPhrase(normalizedQuery, term)
  );

  if (mentionsFree && getBooleanField(row, ["is_free"])) {
    score = Math.max(score, 15);
  }

  if (budget === "free" && getBooleanField(row, ["is_free"])) {
    score = Math.max(score, 18);
  }

  if (mentionsBudget && budgetLabel === "budget") {
    score = Math.max(score, 10);
  }

  if (mentionsPremium && budgetLabel === "premium") {
    score = Math.max(score, 10);
  }

  return score;
}

function scoreKeywordMatch(row: PlaceRow, normalizedQuery: string): number {
  const promptTerms = getPromptTerms(normalizedQuery);
  const nameText = normalizeComparableText(getStringField(row, ["name"]));
  const slugText = normalizeComparableText(getStringField(row, ["slug"]));
  const categoryText = normalizeComparableText([
    getStringField(row, ["category"]),
    row.categories,
    getLinkedCategoryIds(row),
    getLinkedCategoryNames(row),
    getLinkedCategorySearchTerms(row),
  ]);
  const locationText = normalizeComparableText([
    getStringField(row, ["city", "area", "address", "location"]),
  ]);
  const descriptionText = normalizeComparableText(
    getStringField(row, ["description", "reason"])
  );
  const searchableText = normalizeComparableText([
    nameText,
    slugText,
    categoryText,
    locationText,
    descriptionText,
    getLinkedTags(row).flatMap((tag) => [tag.id, tag.name, ...tag.searchTerms]),
  ]);

  if (promptTerms.length === 0) {
    return 0;
  }

  const matchedTerms = promptTerms.filter((term) => searchableText.includes(term));
  const exactQueryInName = Boolean(
    normalizedQuery && includesNormalizedPhrase(nameText, normalizedQuery)
  );
  const partialNameMatch = promptTerms.some((term) => nameText.includes(term));

  if (exactQueryInName) {
    return 20;
  }

  let score = partialNameMatch ? 10 : 0;
  score += Math.min(matchedTerms.length * 3, 8);

  return Math.min(score, 20);
}

function scorePlaceForSearch({
  row,
  normalizedQuery,
  categoryIds,
  areaIds,
  budget,
}: {
  row: PlaceRow;
  normalizedQuery: string;
  categoryIds: string[];
  areaIds: string[];
  budget: BudgetValue;
}): number {
  return (
    scoreLocationMatch(row, areaIds) +
    scoreCategoryMatch(row, categoryIds) +
    scoreTagMatch(row, normalizedQuery) +
    scoreBudgetMatch(row, budget, normalizedQuery) +
    scoreKeywordMatch(row, normalizedQuery)
  );
}

function rowMatchesBudget(row: PlaceRow, budget: BudgetValue): boolean {
  if (budget === "any") {
    return true;
  }

  const selectedBudgetRange = getBudgetRangeForFilter(budget);
  const placeBudgetRange = getPlaceBudgetRange(row);

  if (budget === "free") {
    if (getBooleanField(row, ["is_free"])) {
      return true;
    }

    const freeBudgetText = normalizeComparableText(
      getStringField(row, [
        "budget",
        "budget_label",
        "budget_range",
        "budgetRange",
        "price_range",
        "priceRange",
        "budget_notes",
      ])
    );

    return ["free", "libre", "walang entrance"].some((term) =>
      includesNormalizedPhrase(freeBudgetText, term)
    );
  }

  if (selectedBudgetRange && placeBudgetRange) {
    return (
      rangesOverlap(selectedBudgetRange, placeBudgetRange) ||
      rangesAreNear(selectedBudgetRange, placeBudgetRange)
    );
  }

  const budgetText = normalizeComparableText(
    getStringField(row, [
      "budget",
      "budget_label",
      "budget_range",
      "budgetRange",
      "price_range",
      "priceRange",
    ])
  );

  if (!budgetText) {
    return true;
  }

  return budgetText.includes(budget);
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
  categoryIds,
  areaIds,
  budget,
  requirePromptMatch,
  nearbySearch,
}: {
  normalizedQuery: string;
  categoryIds: string[];
  areaIds: string[];
  budget: BudgetValue;
  requirePromptMatch: boolean;
  nearbySearch: NearbySearchContext | null;
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

  const rankedRows = (data ?? [])
    .filter((row) => rowMatchesArea(row, areaIds))
    .filter((row) => rowMatchesCategory(row, categoryIds))
    .filter((row) => rowMatchesBudget(row, budget))
    .filter((row) => !requirePromptMatch || rowMatchesPrompt(row, normalizedQuery))
    .map((row) => ({
      row,
      score: scorePlaceForSearch({
        row,
        normalizedQuery,
        categoryIds,
        areaIds,
        budget,
      }),
      distanceKm: nearbySearch
        ? getRowDistanceKm(row, nearbySearch.userLocation)
        : null,
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
      getOptionalFilterId(getFilterValue(body, filters, "area")) ?? "all";
    const budget = getBudgetFilter(getFilterValue(body, filters, "budget"));
    const shouldExploreAll = body.exploreAll === true;
    const normalizedQuery = normalizeSearchText(query);
    const nearbySearch = getNearbySearchContext(body);
    const selectedCategory = findCategoryById(categoryId);
    const selectedArea = findAreaById(areaId);
    const inferredCategoryIds = inferCategoryIdsFromQuery(normalizedQuery);
    const inferredLocations = inferMetroManilaLocationsFromQuery(normalizedQuery);
    const discoveryCategoryIds =
      categoryId !== "all" ? [categoryId] : inferredCategoryIds;
    const discoveryAreaIds =
      areaId !== "all" ? [areaId] : inferredLocations.cityIds.slice(0, 1);
    const hasSelectedFilters =
      categoryId !== "all" || areaId !== "all" || budget !== "any";
    const hasNearbySearch = Boolean(nearbySearch);
    const shouldRequirePromptMatch =
      !hasSelectedFilters &&
      !hasNearbySearch &&
      Boolean(normalizedQuery) &&
      discoveryCategoryIds.length === 0 &&
      discoveryAreaIds.length === 0;
    const isBroadDiscoverySearch =
      shouldExploreAll &&
      !normalizedQuery &&
      categoryId === "all" &&
      areaId === "all" &&
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

    const cacheKey = generateSearchCacheKey(
      normalizedQuery,
      categoryId,
      areaId,
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
      budget,
      requirePromptMatch: isBroadDiscoverySearch ? false : shouldRequirePromptMatch,
      nearbySearch,
    });

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
        places,
        result: {
          geminiResponse: "",
          places,
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
