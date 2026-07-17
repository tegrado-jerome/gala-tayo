import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import {
  getApprovedPlaceImages,
  getApprovedPlaceImagesByPlaceIds,
} from "../services/placeImagesService";
import { extractPlaceImageUrls } from "../utils/placeImageFallback";
import {
  buildPlaceDetailCacheKey,
} from "../utils/cacheKey";
import {
  deleteJsonCacheValue,
  getJsonCacheValue,
  setJsonCacheValue,
} from "../services/redisCacheService";
import { PUBLIC_PLACE_COLUMNS, normalizeFaqs } from "../domain/places";

export type DetailCategoryMeta = {
  id: string;
  name: string;
};

export type DetailTagMeta = {
  id: string;
  name: string;
  group: string;
  strength: number;
};

export type PlaceDetail = {
  id: string;
  slug: string;
  name: string;
  faqs?: { question: string; answer: string }[];
  average_rating?: string | number | null;
  rating?: number | null;
  review_count?: number | null;
  location: string;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  description: string;
  place_history?: string | null;
  best_time_to_visit?: string | null;
  visit_duration?: string | null;
  good_for?: string[];
  not_ideal_for?: string[];
  crowd_level?: string | null;
  indoor_outdoor?: string | null;
  weather_fit?: string | null;
  parking_info?: string | null;
  accessibility_notes?: string | null;
  decision_reason?: string | null;
  commute_friendly?: boolean | null;
  commute_access?: string | null;
  nearby_context?: string | null;
  budget_note?: string | null;
  budget_min?: number | null;
  price_level?: number | null;
  status?: string | null;
  verification_status?: string | null;
  verification_notes?: string | null;
  verification_sources?: string[];
  last_verified_at?: string | null;
  website_url?: string | null;
  google_maps_url?: string | null;
  category: string;
  entranceFee: string;
  openHours: string;
  website: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  curatedImageUrls: string[];
  categories?: DetailCategoryMeta[];
  tags?: DetailTagMeta[];
};

export function findPlaceDetailById(id: string): PlaceDetail | null {
  const trimmedId = id.trim().toLowerCase();

  if (!trimmedId) {
    return null;
  }

  return null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

function getFaqArray(value: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      const answer = typeof record.answer === "string" ? record.answer.trim() : "";

      if (!question || !answer) {
        return null;
      }

      return { question, answer };
    })
    .filter((item): item is { question: string; answer: string } => item !== null);
}

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function getPlaceReviewSummary(placeId: string): Promise<{ averageRating: number | null; reviewCount: number }> {
  try {
    const supabase = await getSupabaseAdminClient();
    const { data, error, count } = await (supabase.from("place_reviews") as any)
      .select("rating", { count: "exact" })
      .eq("place_id", placeId);

    if (error) {
      throw error;
    }

    const ratings = ((data || []) as Array<{ rating?: unknown }>)
      .map((entry) => getNullableNumber(entry.rating))
      .filter((rating): rating is number => rating !== null);

    if (ratings.length === 0) {
      return { averageRating: null, reviewCount: count ?? 0 };
    }

    const total = ratings.reduce((sum, rating) => sum + rating, 0);
    return {
      averageRating: Math.round((total / ratings.length) * 10) / 10,
      reviewCount: count ?? ratings.length,
    };
  } catch {
    return { averageRating: null, reviewCount: 0 };
  }
}

async function getPlaceReviewSummaries(
  placeIds: string[]
): Promise<Map<string, { averageRating: number | null; reviewCount: number }>> {
  const uniquePlaceIds = Array.from(
    new Set(placeIds.map((placeId) => placeId.trim()).filter(Boolean))
  );

  if (uniquePlaceIds.length === 0) {
    return new Map<string, { averageRating: number | null; reviewCount: number }>();
  }

  try {
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_reviews") as any)
      .select("place_id, rating")
      .in("place_id", uniquePlaceIds);

    if (error) {
      throw error;
    }

    const ratingTotals = new Map<string, { total: number; count: number }>();

    for (const entry of (data || []) as Array<{ place_id?: unknown; rating?: unknown }>) {
      const placeId = typeof entry.place_id === "string" ? entry.place_id.trim() : "";
      const rating = getNullableNumber(entry.rating);

      if (!placeId || rating === null) {
        continue;
      }

      const current = ratingTotals.get(placeId) ?? { total: 0, count: 0 };
      current.total += rating;
      current.count += 1;
      ratingTotals.set(placeId, current);
    }

    const summaries = new Map<string, { averageRating: number | null; reviewCount: number }>();

    for (const placeId of uniquePlaceIds) {
      const totals = ratingTotals.get(placeId);

      if (!totals || totals.count === 0) {
        summaries.set(placeId, {
          averageRating: null,
          reviewCount: 0,
        });
        continue;
      }

      summaries.set(placeId, {
        averageRating: Math.round((totals.total / totals.count) * 10) / 10,
        reviewCount: totals.count,
      });
    }

    return summaries;
  } catch {
    return new Map<string, { averageRating: number | null; reviewCount: number }>();
  }
}

function mapPlaceRowToDetail(row: Record<string, unknown>): PlaceDetail {
  const address = getNullableString(row.address);
  const city = getNullableString(row.city);
  const area = getNullableString(row.area);
  const location = [area || address, city].filter(Boolean).join(", ") || "Metro Manila";
  const description =
    typeof row.description === "string" && row.description.trim()
      ? row.description.trim()
      : "";
  const budgetNote =
    getNullableString(row.budget_note) ??
    (getNullableNumber(row.budget_min) != null ? `Starting budget around PHP ${getNullableNumber(row.budget_min)}.` : null);
  const websiteUrl =
    getNullableString(row.website_url) ??
    getNullableString(row.official_url) ??
    getNullableString(row.source_url) ??
    "";
  const googleMapsUrl = getNullableString(row.google_maps_url);
  const latitude = getNullableNumber(row.latitude) ?? 0;
  const longitude = getNullableNumber(row.longitude) ?? 0;
  const fallbackImageUrls = extractPlaceImageUrls(row);

  return {
    id: String(row.id ?? ""),
    slug: getNullableString(row.slug) ?? "",
    name: getNullableString(row.name) ?? "Untitled place",
    faqs: getFaqArray(row.faqs),
    average_rating: getNullableString(row.average_rating),
    rating: (getNullableNumber(row.review_count) ?? 0) > 0 ? getNullableNumber(row.average_rating) : null,
    review_count: getNullableNumber(row.review_count) ?? 0,
    location,
    address,
    city,
    area,
    description,
    place_history: getNullableString(row.place_history),
    best_time_to_visit: getNullableString(row.best_time_to_visit),
    visit_duration: getNullableString(row.visit_duration),
    good_for: getStringArray(row.good_for),
    not_ideal_for: getStringArray(row.not_ideal_for),
    crowd_level: getNullableString(row.crowd_level),
    indoor_outdoor: getNullableString(row.indoor_outdoor),
    weather_fit: getNullableString(row.weather_fit),
    parking_info: getNullableString(row.parking_info),
    accessibility_notes: getNullableString(row.accessibility_notes),
    decision_reason: getNullableString(row.decision_reason),
    commute_friendly: typeof row.commute_friendly === "boolean" ? row.commute_friendly : null,
    commute_access: getNullableString(row.commute_access),
    nearby_context: getNullableString(row.nearby_context),
    budget_note: budgetNote,
    budget_min: getNullableNumber(row.budget_min),
    price_level: getNullableNumber(row.price_level),
    status: getNullableString(row.status),
    verification_status: getNullableString(row.verification_status),
    verification_notes: getNullableString(row.verification_notes),
    verification_sources: getStringArray(row.verification_sources),
    last_verified_at: getNullableString(row.last_verified_at),
    website_url: websiteUrl || null,
    google_maps_url: googleMapsUrl,
    category: getNullableString(row.category) ?? "Place",
    entranceFee: budgetNote ?? "Not specified",
    openHours: "Not available",
    website: websiteUrl,
    latitude,
    longitude,
    imageUrl: fallbackImageUrls[0] ?? "",
    curatedImageUrls: fallbackImageUrls,
    categories: getLinkedCategories(row),
    tags: getLinkedTags(row),
  };
}

type PlaceCategoryJoin = {
  category_id?: unknown;
  categories?: unknown;
};

type PlaceTagJoin = {
  strength?: unknown;
  tags?: unknown;
};

function getNestedObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getStringField(value: unknown, keys: string[]): string | null {
  const obj = getNestedObject(value);
  if (!obj) return null;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return null;
}

function getNumberField(value: unknown, keys: string[]): number | null {
  const obj = getNestedObject(value);
  if (!obj) return null;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      return val;
    }
    if (typeof val === "string" && val.trim()) {
      const parsed = Number(val);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getLinkedCategories(row: Record<string, unknown>): DetailCategoryMeta[] {
  const linkedCategories = row.place_categories;
  if (!Array.isArray(linkedCategories)) {
    return [];
  }
  return linkedCategories
    .map((item: unknown) => {
      const join = item as PlaceCategoryJoin;
      const categoryId = join.category_id;
      const category = getNestedObject(join.categories);
      const id =
        typeof categoryId === "string" && categoryId.trim()
          ? categoryId.trim()
          : getStringField(category, ["id"]);
      if (!id) return null;
      return {
        id,
        name: getStringField(category, ["name"]) ?? id,
      };
    })
    .filter((cat): cat is DetailCategoryMeta => cat !== null);
}

function getLinkedTags(row: Record<string, unknown>): DetailTagMeta[] {
  const linkedTags = row.place_tags;
  if (!Array.isArray(linkedTags)) {
    return [];
  }
  return linkedTags
    .map((item: unknown) => {
      const join = item as PlaceTagJoin;
      const tag = getNestedObject(join.tags);
      const id = getStringField(tag, ["id"]);
      if (!id) return null;
      return {
        id,
        name: getStringField(tag, ["name"]) ?? id,
        group: getStringField(tag, ["tag_group", "group"]) ?? "general",
        strength: Math.min(Math.max(getNumberField(join, ["strength"]) ?? 3, 1), 5),
      };
    })
    .filter((tag): tag is DetailTagMeta => tag !== null)
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      return a.name.localeCompare(b.name);
    });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_DETAIL_COLUMNS = PUBLIC_PLACE_COLUMNS;
const PLACE_DETAIL_CACHE_TTL_SECONDS = 60 * 15;

function normalizePlaceLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

async function readCachedPlaceDetail(lookupKey: string): Promise<PlaceDetail | null> {
  const cachedDetail = await getJsonCacheValue<PlaceDetail>(buildPlaceDetailCacheKey(lookupKey));
  return cachedDetail ?? null;
}

async function writeCachedPlaceDetail(detail: PlaceDetail): Promise<void> {
  const cachePayload = detail;
  await Promise.all([
    setJsonCacheValue(buildPlaceDetailCacheKey(detail.id), cachePayload, {
      ttlSeconds: PLACE_DETAIL_CACHE_TTL_SECONDS,
    }),
    setJsonCacheValue(buildPlaceDetailCacheKey(detail.slug), cachePayload, {
      ttlSeconds: PLACE_DETAIL_CACHE_TTL_SECONDS,
    }),
  ]);
}

export async function invalidatePlaceDetailCache(
  placeId: string,
  slug?: string | null
): Promise<void> {
  const keys = [buildPlaceDetailCacheKey(placeId)];

  if (slug?.trim()) {
    keys.push(buildPlaceDetailCacheKey(slug));
  }

  await Promise.all(keys.map((key) => deleteJsonCacheValue(key)));
}

export async function findPlaceDetailsByIds(placeIds: string[]): Promise<Map<string, PlaceDetail>> {
  const uniquePlaceIds = Array.from(
    new Set(placeIds.map((placeId) => placeId.trim()).filter(Boolean))
  );

  if (uniquePlaceIds.length === 0) {
    return new Map<string, PlaceDetail>();
  }

  const detailsById = new Map<string, PlaceDetail>();
  const missingPlaceIds: string[] = [];

  for (const placeId of uniquePlaceIds) {
    const cachedDetail = await readCachedPlaceDetail(placeId);

    if (cachedDetail) {
      detailsById.set(placeId, cachedDetail);
      continue;
    }

    missingPlaceIds.push(placeId);
  }

  try {
    if (missingPlaceIds.length === 0) {
      return detailsById;
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("places") as any)
      .select(PLACE_DETAIL_COLUMNS)
      .in("id", missingPlaceIds)
      .eq("status", "active");

    if (error) {
      throw error;
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    const resolvedPlaceIds = rows
      .map((row) => getNullableString(row.id))
      .filter((placeId): placeId is string => Boolean(placeId));
    const [reviewSummaries, imagesByPlaceId] = await Promise.all([
      getPlaceReviewSummaries(resolvedPlaceIds),
      getApprovedPlaceImagesByPlaceIds(resolvedPlaceIds),
    ]);
    const loadedDetailsById = new Map<string, PlaceDetail>();

    for (const row of rows) {
      const detail = mapPlaceRowToDetail(row);
      const reviewSummary = reviewSummaries.get(detail.id);
      const images = imagesByPlaceId.get(detail.id) ?? [];
      const imageUrls = images.map((image) => image.image_url);
      const resolvedImageUrls = imageUrls.length > 0 ? imageUrls : detail.curatedImageUrls;

      loadedDetailsById.set(detail.id, {
        ...detail,
        rating: reviewSummary?.averageRating ?? detail.rating ?? null,
        review_count:
          reviewSummary && reviewSummary.reviewCount > 0
            ? reviewSummary.reviewCount
            : null,
        imageUrl: resolvedImageUrls[0] ?? "",
        curatedImageUrls: resolvedImageUrls,
      });
    }

    await Promise.all(
      Array.from(loadedDetailsById.values()).map((detail) => writeCachedPlaceDetail(detail))
    );

    return loadedDetailsById;
  } catch {
    return detailsById;
  }
}

export async function findPlaceDetailsBySlugs(slugs: string[]): Promise<Map<string, PlaceDetail>> {
  const uniqueSlugs = Array.from(
    new Set(slugs.map((slug) => normalizePlaceLookupKey(slug)).filter(Boolean))
  );

  if (uniqueSlugs.length === 0) {
    return new Map<string, PlaceDetail>();
  }

  const detailsBySlug = new Map<string, PlaceDetail>();
  const missingSlugs: string[] = [];

  for (const slug of uniqueSlugs) {
    const cachedDetail = await readCachedPlaceDetail(slug);

    if (cachedDetail) {
      detailsBySlug.set(slug, cachedDetail);
      continue;
    }

    missingSlugs.push(slug);
  }

  try {
    if (missingSlugs.length === 0) {
      return detailsBySlug;
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("places") as any)
      .select(PLACE_DETAIL_COLUMNS)
      .in("slug", missingSlugs)
      .eq("status", "active");

    if (error) {
      throw error;
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    const resolvedPlaceIds = rows
      .map((row) => getNullableString(row.id))
      .filter((placeId): placeId is string => Boolean(placeId));
    const [reviewSummaries, imagesByPlaceId] = await Promise.all([
      getPlaceReviewSummaries(resolvedPlaceIds),
      getApprovedPlaceImagesByPlaceIds(resolvedPlaceIds),
    ]);
    const loadedDetailsBySlug = new Map<string, PlaceDetail>();

    for (const row of rows) {
      const detail = mapPlaceRowToDetail(row);
      const reviewSummary = reviewSummaries.get(detail.id);
      const images = imagesByPlaceId.get(detail.id) ?? [];
      const imageUrls = images.map((image) => image.image_url);
      const resolvedImageUrls = imageUrls.length > 0 ? imageUrls : detail.curatedImageUrls;
      const resolvedDetail = {
        ...detail,
        rating: reviewSummary?.averageRating ?? detail.rating ?? null,
        review_count:
          reviewSummary && reviewSummary.reviewCount > 0
            ? reviewSummary.reviewCount
            : null,
        imageUrl: resolvedImageUrls[0] ?? "",
        curatedImageUrls: resolvedImageUrls,
      };

      loadedDetailsBySlug.set(detail.slug, resolvedDetail);
      detailsBySlug.set(detail.slug, resolvedDetail);
    }

    await Promise.all(
      Array.from(loadedDetailsBySlug.values()).map((detail) => writeCachedPlaceDetail(detail))
    );

    return detailsBySlug;
  } catch {
    return detailsBySlug;
  }
}

export async function findPlaceDetailByIdOrSlug(id: string): Promise<PlaceDetail | null> {
  const trimmedId = id.trim();

  if (!trimmedId) {
    return null;
  }

  const normalizedLookupKey = normalizePlaceLookupKey(trimmedId);
  const cachedDetail = await readCachedPlaceDetail(normalizedLookupKey);

  if (cachedDetail) {
    return cachedDetail;
  }

  try {
    const supabase = await getSupabaseAdminClient();
    const { data: slugData, error: slugError } = await supabase
      .from("places")
      .select(PLACE_DETAIL_COLUMNS)
      .eq("slug", trimmedId.toLowerCase())
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!slugError && slugData) {
      const detail = mapPlaceRowToDetail(slugData as Record<string, unknown>);
      const reviewSummary = await getPlaceReviewSummary(detail.id);
      const images = await getApprovedPlaceImages(detail.id);
      const imageUrls = images.map((image) => image.image_url);
      const resolvedImageUrls = imageUrls.length > 0 ? imageUrls : detail.curatedImageUrls;
      const resolvedDetail = {
        ...detail,
        rating: reviewSummary.averageRating ?? detail.rating ?? null,
        review_count: reviewSummary.reviewCount > 0 ? reviewSummary.reviewCount : null,
        imageUrl: resolvedImageUrls[0] ?? "",
        curatedImageUrls: resolvedImageUrls,
      };
      await writeCachedPlaceDetail(resolvedDetail);
      return resolvedDetail;
    }

    if (UUID_PATTERN.test(trimmedId)) {
      const cachedById = await readCachedPlaceDetail(trimmedId);

      if (cachedById) {
        return cachedById;
      }

      const { data: idData, error: idError } = await supabase
        .from("places")
        .select(PLACE_DETAIL_COLUMNS)
        .eq("id", trimmedId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!idError && idData) {
        const detail = mapPlaceRowToDetail(idData as Record<string, unknown>);
        const reviewSummary = await getPlaceReviewSummary(detail.id);
        const images = await getApprovedPlaceImages(detail.id);
        const imageUrls = images.map((image) => image.image_url);
        const resolvedImageUrls = imageUrls.length > 0 ? imageUrls : detail.curatedImageUrls;
        const resolvedDetail = {
          ...detail,
          rating: reviewSummary.averageRating ?? detail.rating ?? null,
          review_count: reviewSummary.reviewCount > 0 ? reviewSummary.reviewCount : null,
          imageUrl: resolvedImageUrls[0] ?? "",
          curatedImageUrls: resolvedImageUrls,
        };
        await writeCachedPlaceDetail(resolvedDetail);
        return resolvedDetail;
      }
    }
  } catch {
    // Local development can run without Supabase credentials; fall through to curated details.
  }

  return findPlaceDetailById(trimmedId);
}
