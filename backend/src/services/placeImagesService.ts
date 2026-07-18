import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import {
  buildApprovedPlaceImagesCacheKey,
  buildApprovedPlaceImagesCountCacheKey,
} from "../utils/cacheKey";
import {
  deleteJsonCacheValue,
  getJsonCacheValue,
  setJsonCacheValue,
} from "./redisCacheService";

export type ApprovedPlaceImage = {
  id: string;
  place_id: string;
  image_url: string;
  storage_key: string | null;
  is_primary?: boolean | null;
  sort_order: number | null;
  created_at: string;
};

const APPROVED_IMAGE_COLUMNS = "id, place_id, image_url, storage_key, is_primary, sort_order, created_at";
const APPROVED_IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 6;
const APPROVED_IMAGE_COUNT_CACHE_TTL_SECONDS = 60 * 60 * 6;

function normalizePlaceId(placeId: string): string {
  return placeId.trim();
}

async function getCachedApprovedPlaceImages(placeId: string): Promise<ApprovedPlaceImage[] | null> {
  const cacheKey = buildApprovedPlaceImagesCacheKey(placeId);
  const cachedImages = await getJsonCacheValue<ApprovedPlaceImage[]>(cacheKey);

  if (!cachedImages) {
    return null;
  }

  return cachedImages.filter((image) => Boolean(image.image_url));
}

async function setCachedApprovedPlaceImages(
  placeId: string,
  images: ApprovedPlaceImage[]
): Promise<void> {
  const cacheKey = buildApprovedPlaceImagesCacheKey(placeId);
  await setJsonCacheValue(cacheKey, images, { ttlSeconds: APPROVED_IMAGE_CACHE_TTL_SECONDS });
  await setJsonCacheValue(buildApprovedPlaceImagesCountCacheKey(placeId), images.length, {
    ttlSeconds: APPROVED_IMAGE_COUNT_CACHE_TTL_SECONDS,
  });
}

async function fetchApprovedPlaceImagesFromDatabase(placeId: string): Promise<ApprovedPlaceImage[]> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select(APPROVED_IMAGE_COLUMNS)
    .eq("place_id", placeId)
    .eq("status", "approved")
    .order("is_primary", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    throw error;
  }

  return ((data || []) as ApprovedPlaceImage[]).filter((image) => Boolean(image.image_url));
}

export async function invalidateApprovedPlaceImagesCache(placeId: string): Promise<void> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  await Promise.all([
    deleteJsonCacheValue(buildApprovedPlaceImagesCacheKey(normalizedPlaceId)),
    deleteJsonCacheValue(buildApprovedPlaceImagesCountCacheKey(normalizedPlaceId)),
  ]);
}

export async function getApprovedPlaceImages(placeId: string): Promise<ApprovedPlaceImage[]> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  if (!normalizedPlaceId) {
    return [];
  }

  const cachedImages = await getCachedApprovedPlaceImages(normalizedPlaceId);

  if (cachedImages) {
    return cachedImages.slice(0, 3);
  }

  const images = await fetchApprovedPlaceImagesFromDatabase(normalizedPlaceId);
  await setCachedApprovedPlaceImages(normalizedPlaceId, images);

  return images;
}

export async function getApprovedPlaceImagesFresh(placeId: string): Promise<ApprovedPlaceImage[]> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  if (!normalizedPlaceId) {
    return [];
  }

  return fetchApprovedPlaceImagesFromDatabase(normalizedPlaceId);
}

export async function getApprovedPlaceImagesByPlaceIds(
  placeIds: string[]
): Promise<Map<string, ApprovedPlaceImage[]>> {
  const uniquePlaceIds = Array.from(
    new Set(placeIds.map((placeId) => placeId.trim()).filter(Boolean))
  );

  if (uniquePlaceIds.length === 0) {
    return new Map<string, ApprovedPlaceImage[]>();
  }

  const imagesByPlaceId = new Map<string, ApprovedPlaceImage[]>();
  const missedPlaceIds: string[] = [];

  for (const placeId of uniquePlaceIds) {
    const cachedImages = await getCachedApprovedPlaceImages(placeId);

    if (cachedImages) {
      imagesByPlaceId.set(placeId, cachedImages.slice(0, 3));
      continue;
    }

    missedPlaceIds.push(placeId);
  }

  if (missedPlaceIds.length === 0) {
    return imagesByPlaceId;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select(APPROVED_IMAGE_COLUMNS)
    .in("place_id", missedPlaceIds)
    .eq("status", "approved")
    .order("is_primary", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  for (const image of (data || []) as ApprovedPlaceImage[]) {
    if (!image.image_url) {
      continue;
    }

    const existingImages = imagesByPlaceId.get(image.place_id) ?? [];

    if (existingImages.length >= 3) {
      continue;
    }

    existingImages.push(image);
    imagesByPlaceId.set(image.place_id, existingImages);
  }

  await Promise.all(
    missedPlaceIds.map((placeId) =>
      setCachedApprovedPlaceImages(placeId, imagesByPlaceId.get(placeId) ?? [])
    )
  );

  return imagesByPlaceId;
}

export async function countApprovedPlaceImages(placeId: string): Promise<number> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  if (!normalizedPlaceId) {
    return 0;
  }

  const cachedCount = await getJsonCacheValue<number>(
    buildApprovedPlaceImagesCountCacheKey(normalizedPlaceId)
  );

  if (typeof cachedCount === "number" && Number.isFinite(cachedCount)) {
    return cachedCount;
  }

  const cachedImages = await getCachedApprovedPlaceImages(normalizedPlaceId);

  if (cachedImages) {
    const count = cachedImages.length;
    await setJsonCacheValue(buildApprovedPlaceImagesCountCacheKey(normalizedPlaceId), count, {
      ttlSeconds: APPROVED_IMAGE_COUNT_CACHE_TTL_SECONDS,
    });
    return count;
  }

  const supabase = await getSupabaseAdminClient();
  const { count, error } = await (supabase.from("place_images") as any)
    .select("id", { count: "exact", head: true })
    .eq("place_id", normalizedPlaceId)
    .eq("status", "approved");

  if (error) {
    throw error;
  }

  const resolvedCount = count ?? 0;
  await setJsonCacheValue(
    buildApprovedPlaceImagesCountCacheKey(normalizedPlaceId),
    resolvedCount,
    {
      ttlSeconds: APPROVED_IMAGE_COUNT_CACHE_TTL_SECONDS,
    }
  );

  return resolvedCount;
}
