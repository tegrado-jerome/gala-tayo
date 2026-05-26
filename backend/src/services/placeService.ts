import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import {
  getFoursquarePlaceById,
  NormalizedFoursquarePlace,
} from "./foursquareService";
import { createBaseSlug } from "../utils/slug";

export type StoredPlace = {
  id: string;
  foursquare_id: string | null;
  name: string | null;
  slug: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  hours: unknown;
  photo_url: string | null;
  photos: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export type PlaceLookupResult =
  | {
      source: "supabase";
      place: StoredPlace;
    }
  | {
      source: "foursquare";
      place: NormalizedFoursquarePlace;
    };

export class PlaceServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "PlaceServiceError";
    this.status = status;
  }
}

export async function findPlaceByFoursquareId(
  foursquareId: string
): Promise<StoredPlace | null> {
  const trimmedId = foursquareId.trim();

  if (!trimmedId) {
    return null;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("places")
    .select(
      "id,foursquare_id,name,slug,category,address,city,latitude,longitude,rating,hours,photo_url,photos,created_at,updated_at"
    )
    .eq("foursquare_id", trimmedId)
    .maybeSingle();

  if (error) {
    throw new PlaceServiceError("Failed to query place by Foursquare ID.", 500);
  }

  return (data as StoredPlace | null) ?? null;
}

export async function findPlaceByNameAndCity(
  name: string,
  city: string
): Promise<StoredPlace | null> {
  const trimmedName = name.trim();
  const trimmedCity = city.trim();

  if (!trimmedName || !trimmedCity) {
    return null;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("places")
    .select(
      "id,foursquare_id,name,slug,category,address,city,latitude,longitude,rating,hours,photo_url,photos,created_at,updated_at"
    )
    .ilike("name", trimmedName)
    .ilike("city", trimmedCity)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new PlaceServiceError("Failed to query place by name and city.", 500);
  }

  return (data as StoredPlace | null) ?? null;
}

async function slugExists(slug: string): Promise<boolean> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("places")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new PlaceServiceError("Failed to query place by slug.", 500);
  }

  return Boolean(data);
}

export async function generateUniqueSlug(
  name: string,
  city?: string
): Promise<string> {
  const baseSlug = createBaseSlug(name, city);

  if (!baseSlug) {
    throw new PlaceServiceError("Place name must create a valid slug.", 400);
  }

  let candidateSlug = baseSlug;
  let suffix = 2;

  while (await slugExists(candidateSlug)) {
    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidateSlug;
}

export async function lookupPlaceByFoursquareId(
  foursquareId: string
): Promise<PlaceLookupResult> {
  const storedPlace = await findPlaceByFoursquareId(foursquareId);

  if (storedPlace) {
    return {
      source: "supabase",
      place: storedPlace,
    };
  }

  return {
    source: "foursquare",
    place: await getFoursquarePlaceById(foursquareId),
  };
}
