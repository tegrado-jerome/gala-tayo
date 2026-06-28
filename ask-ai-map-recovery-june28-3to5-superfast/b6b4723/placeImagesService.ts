import { getSupabaseAdminClient } from "../config/supabaseAdmin";

export type ApprovedPlaceImage = {
  id: string;
  place_id: string;
  image_url: string;
  storage_key: string | null;
  sort_order: number | null;
  created_at: string;
};

const APPROVED_IMAGE_COLUMNS = "id, place_id, image_url, storage_key, sort_order, created_at";

export async function getApprovedPlaceImages(placeId: string): Promise<ApprovedPlaceImage[]> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_images") as any)
    .select(APPROVED_IMAGE_COLUMNS)
    .eq("place_id", placeId)
    .eq("status", "approved")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    throw error;
  }

  return ((data || []) as ApprovedPlaceImage[]).filter((image) => Boolean(image.image_url));
}

export async function countApprovedPlaceImages(placeId: string): Promise<number> {
  const supabase = await getSupabaseAdminClient();
  const { count, error } = await (supabase.from("place_images") as any)
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId)
    .eq("status", "approved");

  if (error) {
    throw error;
  }

  return count ?? 0;
}
