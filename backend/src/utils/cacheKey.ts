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
  areaId = "all"
): string {
  const sanitizedQuery = sanitizeCachePart(normalizedQuery) || "empty";
  const sanitizedCategory = sanitizeCachePart(categoryId) || "all";
  const sanitizedArea = sanitizeCachePart(areaId) || "all";

  return `search:${sanitizedQuery}:category:${sanitizedCategory}:area:${sanitizedArea}`;
}
