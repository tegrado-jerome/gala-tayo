function sanitizeCachePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SEARCH_CACHE_VERSION = "v6";

export function generateSearchCacheKey(
  normalizedQuery: string,
  categoryId = "all",
  areaId = "all",
  goodForId = "all",
  budgetId = "any",
  language = "taglish"
): string {
  const sanitizedQuery = sanitizeCachePart(normalizedQuery);
  const sanitizedCategory = sanitizeCachePart(categoryId) || "all";
  const sanitizedArea = sanitizeCachePart(areaId) || "all";
  const sanitizedGoodFor = sanitizeCachePart(goodForId) || "all";
  const sanitizedBudget = sanitizeCachePart(budgetId) || "any";
  const sanitizedLanguage = sanitizeCachePart(language) || "taglish";

  if (!sanitizedQuery) {
    return `search:${SEARCH_CACHE_VERSION}:${sanitizedCategory}:${sanitizedArea}:${sanitizedGoodFor}:${sanitizedBudget}:${sanitizedLanguage}`;
  }

  return `search:${SEARCH_CACHE_VERSION}:${sanitizedQuery}:${sanitizedCategory}:${sanitizedArea}:${sanitizedGoodFor}:${sanitizedBudget}:${sanitizedLanguage}`;
}

const CACHE_VERSION = "v2";

export function buildPlaceDetailCacheKey(placeIdOrSlug: string): string {
  return `${CACHE_VERSION}:place-detail:${sanitizeCachePart(placeIdOrSlug)}`;
}

export function buildApprovedPlaceImagesCacheKey(placeId: string): string {
  return `${CACHE_VERSION}:approved-place-images:${sanitizeCachePart(placeId)}`;
}

export function buildApprovedPlaceImagesCountCacheKey(placeId: string): string {
  return `${CACHE_VERSION}:approved-place-images-count:${sanitizeCachePart(placeId)}`;
}

export function buildGeoapifyLookupCacheKey(normalizedKey: string): string {
  return `${CACHE_VERSION}:geoapify-lookup:${sanitizeCachePart(normalizedKey)}`;
}

export function buildGeoapifyAreaCacheKey(targetAreaText: string): string {
  return `${CACHE_VERSION}:geoapify-area:${sanitizeCachePart(targetAreaText)}`;
}
