import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { METRO_MANILA_AREAS } from "../functions/filters";
import { PUBLIC_PLACE_COLUMNS } from "../domain/places";
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

type ApprovedImageRow = {
  place_id?: unknown;
  image_url?: unknown;
};

const SEO_PLACE_SELECT = PUBLIC_PLACE_COLUMNS;

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
  if (placeIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select("place_id,image_url,sort_order,created_at")
    .in("place_id", placeIds)
    .eq("status", "approved")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Failed to load approved place images.");
  }

  const imagesByPlaceId = new Map<string, string>();

  for (const row of (data ?? []) as ApprovedImageRow[]) {
    const placeId = cleanString(row.place_id);
    const imageUrl = cleanString(row.image_url);

    if (!placeId || !imageUrl || imagesByPlaceId.has(placeId)) {
      continue;
    }

    imagesByPlaceId.set(placeId, imageUrl);
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

export async function getSeoPlaceSummaries(): Promise<SeoPlaceSummary[]> {
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
  const imageLookup = await getApprovedImageLookup(placeIds);

  return placeRows
    .map((row) => mapPlaceRowToSeoSummary(row, imageLookup.get(String(row.id)) ?? null))
    .filter((place): place is SeoPlaceSummary => Boolean(place))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getSeoAreaSummaries(): Promise<SeoAreaSummary[]> {
  const places = await getSeoPlaceSummaries();
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

  for (const place of places) {
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
