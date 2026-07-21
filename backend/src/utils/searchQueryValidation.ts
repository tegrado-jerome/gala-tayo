import { inferMetroManilaLocationsFromQuery } from "./metroManilaLocations";
import { normalizeSearchText } from "./searchMatching";

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

export type SearchValidationStatus =
  | "ok"
  | "empty_query"
  | "unsupported_location";

export type SearchValidationResult = {
  status: SearchValidationStatus;
  message: string | null;
  normalizedQuery: string;
  supportedLocationNames: string[];
  unsupportedLocationKeywords: string[];
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

function getUnsupportedLocationKeywords(normalizedQuery: string): string[] {
  const matches = new Set<string>();

  for (const keyword of UNSUPPORTED_LOCATION_KEYWORDS) {
    if (hasPhraseMatch(normalizedQuery, keyword)) {
      matches.add(normalizeSearchText(keyword));
    }
  }

  return [...matches];
}

export function validateMetroManilaSearchQuery({
  query,
  hasSelectedFilters,
  hasNearbySearch,
  allowBroadDiscovery,
}: {
  query: string;
  hasSelectedFilters: boolean;
  hasNearbySearch: boolean;
  allowBroadDiscovery: boolean;
}): SearchValidationResult {
  const normalizedQuery = normalizeSearchText(query);
  const supportedLocations = inferMetroManilaLocationsFromQuery(normalizedQuery);
  const unsupportedLocationKeywords = getUnsupportedLocationKeywords(normalizedQuery);
  if (allowBroadDiscovery) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
    };
  }

  if (!normalizedQuery && !hasSelectedFilters && !hasNearbySearch) {
    return {
      status: "empty_query",
      message: "Try adding a place, category, or location.",
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
    };
  }

  if (unsupportedLocationKeywords.length > 0) {
    return {
      status: "unsupported_location",
      message: "We currently support Metro Manila only.",
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
    };
  }

  if (!normalizedQuery) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
    };
  }

  if (hasSelectedFilters || hasNearbySearch) {
    return {
      status: "ok",
      message: null,
      normalizedQuery,
      supportedLocationNames: supportedLocations.cityNames,
      unsupportedLocationKeywords,
    };
  }

  return {
    status: "ok",
    message: null,
    normalizedQuery,
    supportedLocationNames: supportedLocations.cityNames,
    unsupportedLocationKeywords,
  };
}
