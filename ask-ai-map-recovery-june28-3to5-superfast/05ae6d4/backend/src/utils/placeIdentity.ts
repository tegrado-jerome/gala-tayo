import { HttpRequest } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";

type PlaceIdRow = {
  id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlaceUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function getPlaceIdentifier(request: HttpRequest): string | null {
  const placeIdentifier = request.params.id?.trim();
  return placeIdentifier || null;
}

export async function resolvePlaceId(placeIdentifier: string): Promise<string | null> {
  const supabaseAdmin = await getSupabaseAdminClient();

  if (UUID_PATTERN.test(placeIdentifier)) {
    const { data, error } = await supabaseAdmin
      .from("places")
      .select("id")
      .eq("id", placeIdentifier)
      .maybeSingle();

    const place = data as PlaceIdRow | null;
    return error || !place?.id ? null : place.id;
  }

  const { data, error } = await supabaseAdmin
    .from("places")
    .select("id")
    .eq("slug", placeIdentifier.toLowerCase())
    .maybeSingle();

  const place = data as PlaceIdRow | null;
  return error || !place?.id ? null : place.id;
}
