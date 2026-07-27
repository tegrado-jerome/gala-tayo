import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { CATEGORIES, METRO_MANILA_AREAS } from "../functions/filters";
import { PUBLIC_PLACE_COLUMNS } from "../domain/places";
import { deleteJsonCacheValue, getJsonCacheValue, setJsonCacheValue } from "../services/redisCacheService";
import { buildImageUrl } from "./r2UrlResolver";
import { createBaseSlug } from "./slug";

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
const SEO_LISTING_PLACE_SELECT = [
  "id",
  "name",
  "slug",
  "category",
  "address",
  "city",
  "area",
  "description",
  "good_for",
  "budget_min",
  "status",
  "updated_at",
].join(",");
const APPROVED_IMAGE_LOOKUP_BATCH_SIZE = 100;
const MAX_APPROVED_IMAGES_PER_PLACE = 3;
const SEO_PLACE_SUMMARIES_CACHE_KEY = "seo:places:summaries:v2";
const SEO_PLACE_SUMMARIES_CACHE_TTL_SECONDS = 60 * 10;
const SEO_LISTING_PAGE_CACHE_PREFIX = "seo:listings:v1";
const SEO_LISTING_PAGE_CACHE_TTL_SECONDS = 60 * 10;

const AREA_NAME_OVERRIDES: Record<string, string> = {
  "las-pinas": "Las Pinas",
  paranaque: "Paranaque",
};

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

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAreaLookup() {
  const lookup = new Map<string, { slug: string; name: string }>();

  for (const area of METRO_MANILA_AREAS) {
    if (area.id === "all") {
      continue;
    }

    lookup.set(normalizeText(area.id), {
      slug: area.id,
      name: AREA_NAME_OVERRIDES[area.id] ?? area.name,
    });
    lookup.set(normalizeText(AREA_NAME_OVERRIDES[area.id] ?? area.name), {
      slug: area.id,
      name: AREA_NAME_OVERRIDES[area.id] ?? area.name,
    });
  }

  return lookup;
}

const areaLookup = buildAreaLookup();

function sanitizeCachePart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
}

function getCategoryLabel(categoryId: string | null): string | null {
  if (!categoryId || categoryId === "all") {
    return null;
  }

  return CATEGORIES.find((category) => category.id === categoryId)?.name ?? categoryId;
}

function getAreaNamesForQuery(areaSlug: string | null): string[] {
  if (!areaSlug) {
    return [];
  }

  const area = METRO_MANILA_AREAS.find((candidate) => candidate.id === areaSlug);
  const areaMeta = areaLookup.get(normalizeText(areaSlug));
  return Array.from(new Set([
    areaSlug,
    area?.name,
    AREA_NAME_OVERRIDES[areaSlug],
    areaMeta?.name,
  ]
    .map((value) => cleanString(value))
    .filter((value): value is string => Boolean(value))));
}

function escapePostgrestString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildLocationOrFilter(areaNames: string[]): string | null {
  if (areaNames.length === 0) {
    return null;
  }

  const values = areaNames.map((value) => `"${escapePostgrestString(value)}"`).join(",");
  return `city.in.(${values}),area.in.(${values})`;
}

function buildSeoListingPageCacheKey(args: {
  areaSlug: string | null;
  category: string | null;
  goodFor: string | null;
  page: number;
  pageSize: number;
}) {
  return [
    SEO_LISTING_PAGE_CACHE_PREFIX,
    `area:${sanitizeCachePart(args.areaSlug)}`,
    `category:${sanitizeCachePart(args.category)}`,
    `goodFor:${sanitizeCachePart(args.goodFor)}`,
    `page:${args.page}`,
    `pageSize:${args.pageSize}`,
  ].join(":");
}

function resolveAreaSlug(city: string | null, area: string | null): { slug: string; name: string } {
  const candidates = [city, area]
    .map((value) => cleanString(value))
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const match = areaLookup.get(normalizeText(candidate));
    if (match) {
      return match;
    }
  }

  const fallbackSource = candidates[0] ?? "Metro Manila";
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
  const cachedPlaces = await getJsonCacheValue<SeoPlaceSummary[]>(SEO_PLACE_SUMMARIES_CACHE_KEY);
  if (cachedPlaces) {
    return cachedPlaces;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("places") as any)
    .select(SEO_PLACE_SELECT)
    .eq("status", "active")
    .order("name", { ascending: true, nullsFirst: false })
    .limit(1000);

  if (error) {
    throw new Error("Failed to load places for SEO.");
  }

  const placeRows = ((data ?? []) as PlaceRow[]).filter(isPublicPlace);
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
    .sort((left, right) => left.name.localeCompare(right.name));

  if (shouldCachePlaces) {
    await setJsonCacheValue(SEO_PLACE_SUMMARIES_CACHE_KEY, places, { ttlSeconds: SEO_PLACE_SUMMARIES_CACHE_TTL_SECONDS });
  }

  return places;
}

export async function clearSeoPlaceSummariesCache(): Promise<void> {
  await deleteJsonCacheValue(SEO_PLACE_SUMMARIES_CACHE_KEY);
}

export async function getSeoAreaSummaries(places?: SeoPlaceSummary[]): Promise<SeoAreaSummary[]> {
  const resolvedPlaces = places ?? (await getSeoPlaceSummaries());
  const counts = new Map<string, SeoAreaSummary>();

  for (const area of METRO_MANILA_AREAS) {
    if (area.id === "all") {
      continue;
    }

    counts.set(area.id, {
      slug: area.id,
      name: AREA_NAME_OVERRIDES[area.id] ?? area.name,
      placeCount: 0,
      canonicalPath: `/places/${encodeURIComponent(area.id)}`,
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

  const areaMeta = areaLookup.get(normalizeText(normalizedAreaSlug));
  if (!areaMeta) {
    return null;
  }

  const places = (await getSeoPlaceSummaries()).filter((place) => place.areaSlug === normalizedAreaSlug);

  return {
    area: {
      slug: normalizedAreaSlug,
      name: areaMeta.name,
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
  const normalizedCategory = cleanString(category)?.toLowerCase() ?? null;
  const normalizedGoodFor = cleanString(goodFor)?.toLowerCase() ?? null;
  const safePageSize = Math.min(Math.max(Math.floor(pageSize), 1), 50);
  const safeRequestedPage = Math.max(Math.floor(page), 1);
  const cacheKey = buildSeoListingPageCacheKey({
    areaSlug: normalizedAreaSlug,
    category: normalizedCategory,
    goodFor: normalizedGoodFor,
    page: safeRequestedPage,
    pageSize: safePageSize,
  });
  const cachedPage = await getJsonCacheValue<SeoListingPage>(cacheKey);
  if (cachedPage) {
    return cachedPage;
  }

  const supabase = await getSupabaseAdminClient();
  const categoryLabel = getCategoryLabel(normalizedCategory);
  const locationOrFilter = buildLocationOrFilter(getAreaNamesForQuery(normalizedAreaSlug));

  const buildListingQuery = () => {
    let query = (supabase.from("places") as any)
      .select(SEO_LISTING_PLACE_SELECT, { count: "exact" })
      .eq("status", "active");

    if (categoryLabel) {
      query = query.eq("category", categoryLabel);
    }

    if (locationOrFilter) {
      query = query.or(locationOrFilter);
    }

    if (normalizedGoodFor) {
      query = query.contains("good_for", [normalizedGoodFor]);
    }

    return query;
  }

  const countResult = await buildListingQuery().limit(1);
  if (countResult.error) {
    throw new Error("Failed to load listing places.");
  }

  const total = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(safeRequestedPage, totalPages);
  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = startIndex + safePageSize - 1;
  const { data, error } = await buildListingQuery()
    .order("name", { ascending: true, nullsFirst: false })
    .range(startIndex, endIndex);

  if (error) {
    throw new Error("Failed to load listing places.");
  }

  const placeRows = ((data ?? []) as PlaceRow[]).filter(isPublicPlace);
  const placeIds = placeRows
    .map((row) => cleanString(row.id))
    .filter((value): value is string => Boolean(value));
  const imageLookup = await getApprovedImageLookup(placeIds);
  const items = placeRows
    .map((row) => mapPlaceRowToSeoSummary(row, imageLookup.get(String(row.id)) ?? null))
    .filter((place): place is SeoPlaceSummary => Boolean(place));

  const payload = {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };

  await setJsonCacheValue(cacheKey, payload, { ttlSeconds: SEO_LISTING_PAGE_CACHE_TTL_SECONDS });
  return payload;
}
