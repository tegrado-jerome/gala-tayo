import { inferMetroManilaLocationsFromQuery } from "./metroManilaLocations";
import { inferCategoryIdsFromQuery, normalizeSearchText } from "./searchMatching";

const SUPPORTED_SCOPE_KEYWORDS = [
  "metro manila",
  "ncr",
  "national capital region",
];

const UNSUPPORTED_LOCATION_KEYWORDS = [
  "cavite",
  "cavite city",
  "bacoor",
  "imus",
  "dasmarinas",
  "dasmarinas",
  "general trias",
  "trece martires",
  "kawit",
  "tanza",
  "rosario cavite",
  "tagaytay",
  "rizal",
  "antipolo",
  "laguna",
  "sta rosa",
  "santa rosa",
  "calamba",
  "nuvali",
  "bulacan",
  "malolos",
  "meycauayan",
  "batangas",
  "lipa",
  "pampanga",
  "angeles",
  "subic",
  "olongapo",
];

const GOOD_FOR_TERMS: Record<string, string[]> = {
  date: ["date", "dates", "romantic", "couple", "anniversary"],
  barkada: ["barkada", "barkadas", "friends", "group", "hangout"],
  family: ["family", "kids", "child friendly", "all ages"],
  study: ["study", "student", "quiet", "work friendly", "wifi"],
  chill: ["chill", "relax", "tambayan", "low key"],
};

export type SearchValidationStatus =
  | "ok"
  | "empty_query"
  | "too_vague"
  | "unsupported_location";

export type SearchValidationResult = {
  status: SearchValidationStatus;
  message: string | null;
  normalizedQuery: string;
  supportedLocationNames: string[];
  unsupportedLocationKeywords: string[];
  hasSupportedLocationContext: boolean;
  hasIntentSignals: boolean;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhraseMatch(normalizedInput: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(
    normalizedInput
  );
}

function inferGoodForIdsFromQuery(normalizedQuery: string): string[] {
  if (!normalizedQuery) {
    return [];
  }

  return Object.entries(GOOD_FOR_TERMS)
    .filter(([goodForId, terms]) =>
      [goodForId, ...terms].some((term) => hasPhraseMatch(normalizedQuery, term))
    )
    .map(([goodForId]) => goodForId);
}

function getUnsupportedLocationKeywords(normalizedQuery: string): string[] {
  const matches = new Set<string>();

  for (const keyword of UNSUPPORTED_LOCATION_KEYWORDS) {
    if (hasPhraseMatch(normalizedQuery, keyword)) {
      matches.add(normalizeSearchText(keyword));
    }
  }

  return [...matches];
}

function mentionsSupportedScope(normalizedQuery: string): boolean {
  return SUPPORTED_SCOPE_KEYWORDS.some((keyword) =>
    hasPhraseMatch(normalizedQuery, keyword)
  );
}

export function validateMetroManilaSearchQuery({
  query,
  hasSelectedFilters,
  hasNearbySearch,
  hasExplicitAreaFilter,
  allowBroadDiscovery,
}: {
  query: string;
  hasSelectedFilters: boolean;
  hasNearbySearch: boolean;
  hasExplicitAreaFilter: boolean;
  allowBroadDiscovery: boolean;
}): SearchValidationResult {
  const normalizedQuery = normalizeSearchText(query);
  const supportedLocations = inferMetroManilaLocationsFromQuery(normalizedQuery);
  const unsupportedLocationKeywords = getUnsupportedLocationKeywords(normalizedQuery);
  const inferredCategoryIds = inferCategoryIdsFromQuery(normalizedQuery);
  const inferredGoodForIds = inferGoodForIdsFromQuery(normalizedQuery);
  const hasIntentSignals =
    inferredCategoryIds.length > 0 || inferredGoodForIds.length > 0;
  const hasSupportedLocationContext =
    hasExplicitAreaFilter ||
    supportedLocations.cityIds.length > 0 ||
    mentionsSupportedScope(normalizedQuery);

  if (allowBroadDiscovery) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  if (!normalizedQuery && !hasSelectedFilters && !hasNearbySearch) {
    return {
      status: "empty_query",
      message: "Try adding a place, city, or vibe.",
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  if (unsupportedLocationKeywords.length > 0) {
    return {
      status: "unsupported_location",
      message: "We currently support Metro Manila only.",
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  if (!normalizedQuery) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  if (hasSelectedFilters || hasNearbySearch) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  if (!hasSupportedLocationContext) {
    return {
      status: "too_vague",
      message: "Try adding a place, city, or vibe.",
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
      hasSupportedLocationContext,
      hasIntentSignals,
    };
  }

  return {
    status: "ok",
    message: null,
    normalizedQuery,
    supportedLocationNames: supportedLocations.cityNames,
    unsupportedLocationKeywords,
    hasSupportedLocationContext,
    hasIntentSignals,
  };
}
