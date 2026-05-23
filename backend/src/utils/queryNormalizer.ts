export function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
