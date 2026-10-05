import galaWorthy from "../data/galaWorthy.json";

// Places that are not gala-worthy stay reachable by link but are left out of discovery
// (lists, search, AI picks, sitemap). The list comes from the gala-worthy scoring in data/galaWorthy.json.
const hiddenSlugs = new Set<string>((galaWorthy as { hidden: string[] }).hidden.map((slug) => slug.trim().toLowerCase()));

export function isGalaWorthySlug(slug: string | null | undefined): boolean {
  return !slug || !hiddenSlugs.has(slug.trim().toLowerCase());
}

/** PostgREST filter value for `.not("slug", "in", value)`, or null when nothing is hidden. */
export function hiddenSlugFilter(): string | null {
  return hiddenSlugs.size > 0 ? `(${[...hiddenSlugs].map((slug) => `"${slug}"`).join(",")})` : null;
}
