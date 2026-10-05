import { inferMetroManilaLocationsFromQuery } from "./metroManilaLocations";
import { inferProvincialDestinationsFromQuery } from "./phDestinations";
import { normalizeSearchText } from "./searchMatching";

// "unsupported_location" stays in the union so older clients keep compiling; nationwide search never returns it.
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

/** Metro Manila cities and landmarks first, then destinations elsewhere in the Philippines. */
export function inferSupportedLocationNames(query: string): string[] {
  const metroManilaNames = inferMetroManilaLocationsFromQuery(query).cityNames;
  const provincialNames = inferProvincialDestinationsFromQuery(query).map(({ destination }) => destination.name);
  return [...new Set([...metroManilaNames, ...provincialNames])];
}

export function validateSearchQuery({
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
  const isEmpty = !allowBroadDiscovery && !normalizedQuery && !hasSelectedFilters && !hasNearbySearch;

  return {
    status: isEmpty ? "empty_query" : "ok",
    message: isEmpty ? "Try adding a place, category, or location." : null,
    normalizedQuery,
    supportedLocationNames: inferSupportedLocationNames(normalizedQuery),
    unsupportedLocationKeywords: [],
  };
}
