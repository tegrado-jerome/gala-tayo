function sanitizeCachePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    return `search:${sanitizedCategory}:${sanitizedArea}:${sanitizedGoodFor}:${sanitizedBudget}:${sanitizedLanguage}`;
  }

  return `search:${sanitizedQuery}:${sanitizedCategory}:${sanitizedArea}:${sanitizedGoodFor}:${sanitizedBudget}:${sanitizedLanguage}`;
}
