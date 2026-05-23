export function generateSearchCacheKey(normalizedQuery: string): string {
  const sanitizedQuery = normalizedQuery
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `search:${sanitizedQuery}`;
}
