import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { buildApprovedPlaceImagesCacheKey } from "../utils/cacheKey";
import {
  deleteJsonCacheValue,
  getJsonCacheValues,
  setJsonCacheValue,
} from "./redisCacheService";
import { buildImageUrl } from "../utils/r2UrlResolver";

export type ApprovedPlaceImage = {
  id: string;
  place_id: string;
  storage_key: string | null;
  is_primary?: boolean | null;
  sort_order: number | null;
  created_at: string;
  image_url: string | null;
};

const APPROVED_IMAGE_COLUMNS = "id, place_id, storage_key, is_primary, sort_order, created_at";
const APPROVED_IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 6;
const APPROVED_IMAGE_MEMORY_TTL_SECONDS = 5 * 60;

function normalizePlaceId(placeId: string): string {
  return placeId.trim();
}

function deriveImageUrl(image: ApprovedPlaceImage): ApprovedPlaceImage {
  return {
    ...image,
    image_url: buildImageUrl(image.storage_key),
  };
}

/** One MGET for all the places; a place maps to its cached list (possibly empty) or is left out on a miss. */
async function getCachedApprovedPlaceImagesByPlaceIds(placeIds: string[]): Promise<Map<string, ApprovedPlaceImage[]>> {
  const cachedLists = await getJsonCacheValues<ApprovedPlaceImage[]>(placeIds.map(buildApprovedPlaceImagesCacheKey), {
    memoryTtlSeconds: APPROVED_IMAGE_MEMORY_TTL_SECONDS,
  });
  const imagesByPlaceId = new Map<string, ApprovedPlaceImage[]>();
  placeIds.forEach((placeId, index) => {
    const cachedImages = cachedLists[index];
    if (cachedImages) {
      imagesByPlaceId.set(placeId, cachedImages.filter((image) => Boolean(image.storage_key)).map(deriveImageUrl));
    }
  });
  return imagesByPlaceId;
}

async function setCachedApprovedPlaceImages(
  placeId: string,
  images: ApprovedPlaceImage[]
): Promise<void> {
  await setJsonCacheValue(buildApprovedPlaceImagesCacheKey(placeId), images, {
    ttlSeconds: APPROVED_IMAGE_CACHE_TTL_SECONDS,
    memoryTtlSeconds: APPROVED_IMAGE_MEMORY_TTL_SECONDS,
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

  return ((data || []) as ApprovedPlaceImage[])
    .filter((image) => Boolean(image.storage_key))
    .map(deriveImageUrl);
}

export async function invalidateApprovedPlaceImagesCache(placeId: string): Promise<void> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  await deleteJsonCacheValue(buildApprovedPlaceImagesCacheKey(normalizedPlaceId));
}

export async function getApprovedPlaceImages(placeId: string): Promise<ApprovedPlaceImage[]> {
  const normalizedPlaceId = normalizePlaceId(placeId);

  if (!normalizedPlaceId) {
    return [];
  }

  const cachedImages = (await getCachedApprovedPlaceImagesByPlaceIds([normalizedPlaceId])).get(normalizedPlaceId);

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

  const imagesByPlaceId = await getCachedApprovedPlaceImagesByPlaceIds(uniquePlaceIds);
  imagesByPlaceId.forEach((images, placeId) => imagesByPlaceId.set(placeId, images.slice(0, 3)));
  const missedPlaceIds = uniquePlaceIds.filter((placeId) => !imagesByPlaceId.has(placeId));

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
    if (!image.storage_key) {
      continue;
    }

    const existingImages = imagesByPlaceId.get(image.place_id) ?? [];

    if (existingImages.length >= 3) {
      continue;
    }

    const derived = deriveImageUrl(image);
    existingImages.push(derived);
    imagesByPlaceId.set(image.place_id, existingImages);
  }

  await Promise.all(
    missedPlaceIds.map((placeId) =>
      setCachedApprovedPlaceImages(placeId, imagesByPlaceId.get(placeId) ?? [])
    )
  );

  return imagesByPlaceId;
}

/** Approved images, capped at the 3 a place can hold, which is all the upload limit needs. */
export async function countApprovedPlaceImages(placeId: string): Promise<number> {
  const normalizedPlaceId = normalizePlaceId(placeId);
  return normalizedPlaceId ? (await getApprovedPlaceImages(normalizedPlaceId)).length : 0;
}
