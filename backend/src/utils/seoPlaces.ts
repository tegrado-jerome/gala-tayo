import { isGalaWorthySlug } from "./galaWorthy";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { CATEGORIES } from "../functions/filters";
import { PUBLIC_PLACE_COLUMNS } from "../domain/places";
import { deleteJsonCacheValue, getJsonCacheValue, setJsonCacheValue } from "../services/redisCacheService";
import { buildImageUrl } from "./r2UrlResolver";
import { createBaseSlug } from "./slug";
import goodForTags from "../data/goodForTags.json";
import galaScores from "../data/galaScores.json";
import { hasCuratedPhoto } from "./hdPhotos";
import { DESTINATIONS, getDestinationBySlug, getRegionBySlug, resolveDestination } from "./phDestinations";
import { fetchAllRows } from "./fetchAllRows";

type PlaceRow = Record<string, unknown>;

export type SeoPlaceSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  goodFor: string[];
  budgetMin: number | null;
  areaSlug: string;
  canonicalPath: string;
  imageUrl: string | null;
  updatedAt: string | null;
};

export type SeoAreaSummary = {
  slug: string;
  name: string;
  placeCount: number;
  canonicalPath: string;
};

export type SeoAreaPage = {
  area: SeoAreaSummary;
  places: SeoPlaceSummary[];
};

export type SeoListingPage = {
  items: SeoPlaceSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ApprovedImageRow = {
  place_id?: unknown;
  storage_key?: unknown;
};

type SeoPlaceSummaryOptions = {
  onImageLoadError?: (error: unknown) => void;
};

const SEO_PLACE_SELECT = PUBLIC_PLACE_COLUMNS;
const APPROVED_IMAGE_LOOKUP_BATCH_SIZE = 100;
const MAX_APPROVED_IMAGES_PER_PLACE = 3;
const SEO_PLACE_SUMMARIES_CACHE_KEY = "seo:places:summaries:v4";
// SEO data changes about daily (cache clear empties Redis); instances also keep a copy in memory for 10 minutes.
const SEO_PLACE_SUMMARIES_CACHE_TTL_SECONDS = 60 * 60;
const SEO_MEMORY_TTL_SECONDS = 60 * 10;

// Gala-worthy scores (0-100) from the place scoring; unscored places rank after scored ones.
const GALA_SCORES: Record<string, number> = galaScores;
export { hasCuratedPhoto };

export function getGalaScore(slug: string | null | undefined): number {
  return (slug && GALA_SCORES[slug.trim().toLowerCase()]) || 0;
}

/** Lists lead with places that have a photo, then the best-scored, then A-Z so pages stay stable. */
export function compareListingOrder(
  left: { slug: string | null; name: string | null; hasPhoto: boolean },
  right: { slug: string | null; name: string | null; hasPhoto: boolean }
): number {
  return (
    Number(right.hasPhoto) - Number(left.hasPhoto) ||
    getGalaScore(right.slug) - getGalaScore(left.slug) ||
    (left.name ?? "").localeCompare(right.name ?? "")
  );
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function getCategoryLabel(categoryId: string | null): string | null {
  if (!categoryId || categoryId === "all") {
    return null;
  }

  return CATEGORIES.find((category) => category.id === categoryId)?.name ?? categoryId;
}

// Guide slugs map to the tag labels editors use on places (for example "date" covers "Casual Date" and "Date Night").
const GOOD_FOR_TAGS: Record<string, string[]> = goodForTags;

function getGoodForTags(goodFor: string) {
  return GOOD_FOR_TAGS[goodFor] ?? [goodFor];
}

/**
 * The one rule for which listed places an area covers: a region's towns, or the one city, matched on the
 * place's resolved area slug. Home tiles, city chips, area pages, guides and the sitemap all count this way.
 */
export function filterListingPlaces<T extends Pick<SeoPlaceSummary, "areaSlug" | "category" | "goodFor">>(
  places: T[],
  { areaSlug, categoryLabel = null, goodForTags = null }: { areaSlug: string | null; categoryLabel?: string | null; goodForTags?: string[] | null },
): T[] {
  const region = areaSlug ? getRegionBySlug(areaSlug) : null;
  const areaSlugs = areaSlug ? new Set(region ? region.destinations.map((destination) => destination.slug) : [areaSlug]) : null;

  return places.filter((place) =>
    (!areaSlugs || areaSlugs.has(place.areaSlug)) &&
    (!categoryLabel || place.category === categoryLabel) &&
    (!goodForTags || place.goodFor.some((tag) => goodForTags.includes(tag)))
  );
}

export function resolveAreaSlug(city: string | null, area: string | null): { slug: string; name: string } {
  const destination = resolveDestination(city, area);
  if (destination) {
    return { slug: destination.slug, name: destination.name };
  }

  const fallbackSource = [city, area].map((value) => cleanString(value)).find((value): value is string => Boolean(value)) ?? "Metro Manila";
  return {
    slug: createBaseSlug(fallbackSource) || "metro-manila",
    name: fallbackSource,
  };
}

function isPublicPlace(row: PlaceRow): boolean {
  const booleanFlags = ["is_public", "public", "approved"];

  for (const key of booleanFlags) {
    if (key in row && row[key] === false) {
      return false;
    }
  }

  const hiddenStatuses = new Set([
    "pending",
    "draft",
    "private",
    "hidden",
    "deleted",
    "rejected",
    "archived",
    "unlisted",
  ]);

  for (const key of ["status", "approval_status", "publication_status", "visibility"]) {
    const value = cleanString(row[key])?.toLowerCase();
    if (value && hiddenStatuses.has(value)) {
      return false;
    }
  }

  return true;
}

async function getApprovedImageLookup(placeIds: string[]): Promise<Map<string, string>> {
  const uniquePlaceIds = Array.from(new Set(placeIds.map((placeId) => placeId.trim()).filter(Boolean)));

  if (uniquePlaceIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await getSupabaseAdminClient();
  const imagesByPlaceId = new Map<string, string>();

  for (let index = 0; index < uniquePlaceIds.length; index += APPROVED_IMAGE_LOOKUP_BATCH_SIZE) {
    const batchPlaceIds = uniquePlaceIds.slice(index, index + APPROVED_IMAGE_LOOKUP_BATCH_SIZE);
    const { data, error } = await (supabase.from("place_images") as any)
      .select("place_id,storage_key,sort_order,created_at")
      .in("place_id", batchPlaceIds)
      .eq("status", "approved")
      .not("storage_key", "is", null)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(batchPlaceIds.length * MAX_APPROVED_IMAGES_PER_PLACE);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as ApprovedImageRow[]) {
      const placeId = cleanString(row.place_id);
      const storageKey = cleanString(row.storage_key);
      const imageUrl = storageKey ? buildImageUrl(storageKey) : null;

      if (!placeId || !imageUrl || imagesByPlaceId.has(placeId)) {
        continue;
      }

      imagesByPlaceId.set(placeId, imageUrl);
    }
  }

  return imagesByPlaceId;
}

function mapPlaceRowToSeoSummary(row: PlaceRow, imageUrl: string | null): SeoPlaceSummary | null {
  const id = cleanString(row.id);
  const slug = cleanString(row.slug);
  const name = cleanString(row.name);
  const city = cleanString(row.city);
  const area = cleanString(row.area);

  if (!id || !slug || !name) {
    return null;
  }

  const areaMeta = resolveAreaSlug(city, area);

  return {
    id,
    slug,
    name,
    description: cleanString(row.description),
    category: cleanString(row.category),
    address: cleanString(row.address),
    city,
    area,
    goodFor: cleanStringArray(row.good_for),
    budgetMin: cleanNumber(row.budget_min),
    areaSlug: areaMeta.slug,
    canonicalPath: `/places/${encodeURIComponent(areaMeta.slug)}/${encodeURIComponent(slug)}`,
    imageUrl,
    updatedAt: cleanString(row.updated_at),
  };
}

export async function getSeoPlaceSummaries(options: SeoPlaceSummaryOptions = {}): Promise<SeoPlaceSummary[]> {
  const cachedPlaces = await getJsonCacheValue<SeoPlaceSummary[]>(SEO_PLACE_SUMMARIES_CACHE_KEY, { memoryTtlSeconds: SEO_MEMORY_TTL_SECONDS });
  if (cachedPlaces) {
    return cachedPlaces;
  }

  const supabase = await getSupabaseAdminClient();
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    (supabase.from("places") as any)
      .select(SEO_PLACE_SELECT)
      .eq("status", "active")
      .order("name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  ).catch(() => {
    throw new Error("Failed to load places for SEO.");
  });

  const placeRows = ((data ?? []) as PlaceRow[]).filter((row) => isPublicPlace(row) && isGalaWorthySlug(cleanString(row.slug)));
  const placeIds = placeRows
    .map((row) => cleanString(row.id))
    .filter((value): value is string => Boolean(value));
  let imageLookup = new Map<string, string>();
  let shouldCachePlaces = true;

  try {
    imageLookup = await getApprovedImageLookup(placeIds);
  } catch (imageError) {
    if (!options.onImageLoadError) {
      throw imageError;
    }

    shouldCachePlaces = false;
    options.onImageLoadError(imageError);
  }

  const places = placeRows
    .map((row) => mapPlaceRowToSeoSummary(row, imageLookup.get(String(row.id)) ?? null))
    .filter((place): place is SeoPlaceSummary => Boolean(place))
    .sort((left, right) =>
      compareListingOrder(
        { ...left, hasPhoto: Boolean(left.imageUrl) || hasCuratedPhoto(left.slug) },
        { ...right, hasPhoto: Boolean(right.imageUrl) || hasCuratedPhoto(right.slug) }
      )
    );

  if (shouldCachePlaces) {
    await setJsonCacheValue(SEO_PLACE_SUMMARIES_CACHE_KEY, places, { ttlSeconds: SEO_PLACE_SUMMARIES_CACHE_TTL_SECONDS, memoryTtlSeconds: SEO_MEMORY_TTL_SECONDS });
  }

  return places;
}

/**
 * Canonical paths of public places hidden from discovery (not gala-worthy). Their pages stay reachable
 * by link and are noindex, so the build prerenders them instead of letting the host answer 404.
 */
export async function getHiddenPlacePaths(): Promise<string[]> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("places") as any)
    .select(SEO_PLACE_SELECT)
    .eq("status", "active")
    .order("name", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (error) {
    throw new Error("Failed to load hidden places.");
  }

  return ((data ?? []) as PlaceRow[])
    .filter((row) => isPublicPlace(row) && !isGalaWorthySlug(cleanString(row.slug)))
    .map((row) => mapPlaceRowToSeoSummary(row, null)?.canonicalPath)
    .filter((value): value is string => Boolean(value));
}

export async function clearSeoPlaceSummariesCache(): Promise<void> {
  await deleteJsonCacheValue(SEO_PLACE_SUMMARIES_CACHE_KEY);
}

export async function getSeoAreaSummaries(places?: SeoPlaceSummary[]): Promise<SeoAreaSummary[]> {
  const resolvedPlaces = places ?? (await getSeoPlaceSummaries());
  const counts = new Map<string, SeoAreaSummary>();

  for (const destination of DESTINATIONS) {
    counts.set(destination.slug, {
      slug: destination.slug,
      name: destination.name,
      placeCount: 0,
      canonicalPath: `/places/${encodeURIComponent(destination.slug)}`,
    });
  }

  for (const place of resolvedPlaces) {
    const existing = counts.get(place.areaSlug);

    if (existing) {
      existing.placeCount += 1;
      continue;
    }

    counts.set(place.areaSlug, {
      slug: place.areaSlug,
      name: resolveAreaSlug(place.city, place.area).name,
      placeCount: 1,
      canonicalPath: `/places/${encodeURIComponent(place.areaSlug)}`,
    });
  }

  return [...counts.values()].sort((left, right) => right.placeCount - left.placeCount || left.name.localeCompare(right.name));
}

export async function getSeoAreaPage(areaSlug: string): Promise<SeoAreaPage | null> {
  const normalizedAreaSlug = cleanString(areaSlug)?.toLowerCase();

  if (!normalizedAreaSlug) {
    return null;
  }

  const region = getRegionBySlug(normalizedAreaSlug);
  const places = filterListingPlaces(await getSeoPlaceSummaries(), { areaSlug: normalizedAreaSlug });
  const areaName = getDestinationBySlug(normalizedAreaSlug)?.name ?? region?.name ?? (places[0] ? resolveAreaSlug(places[0].city, places[0].area).name : null);

  if (!areaName) {
    return null;
  }

  return {
    area: {
      slug: normalizedAreaSlug,
      name: areaName,
      placeCount: places.length,
      canonicalPath: `/places/${encodeURIComponent(normalizedAreaSlug)}`,
    },
    places,
  };
}

export async function getSeoListingPage({
  areaSlug,
  category,
  goodFor,
  page,
  pageSize,
}: {
  areaSlug?: string | null;
  category?: string | null;
  goodFor?: string | null;
  page: number;
  pageSize: number;
}): Promise<SeoListingPage> {
  const normalizedAreaSlug = cleanString(areaSlug)?.toLowerCase() ?? null;
  const normalizedGoodFor = cleanString(goodFor)?.toLowerCase() ?? null;
  const safePageSize = Math.min(Math.max(Math.floor(pageSize), 1), 50);
  const matches = filterListingPlaces(await getSeoPlaceSummaries(), {
    areaSlug: normalizedAreaSlug,
    categoryLabel: getCategoryLabel(cleanString(category)?.toLowerCase() ?? null),
    goodForTags: normalizedGoodFor ? getGoodForTags(normalizedGoodFor) : null,
  });

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(Math.floor(page), 1), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    items: matches.slice(startIndex, startIndex + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}
