import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getApprovedPlaceImages } from "../services/placeImagesService";

export type PlaceDetail = {
  id: string;
  slug: string;
  name: string;
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
  budget_notes?: string | null;
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

function mapPlaceRowToDetail(row: Record<string, unknown>): PlaceDetail {
  const address = typeof row.address === "string" ? row.address : null;
  const city = typeof row.city === "string" ? row.city : null;
  const area = typeof row.area === "string" ? row.area : null;
  const location = [area || address, city].filter(Boolean).join(", ") || "Metro Manila";
  const description =
    typeof row.description === "string" && row.description.trim()
      ? row.description.trim()
      : "";
  const budgetNotes =
    typeof row.budget_notes === "string" && row.budget_notes.trim()
      ? row.budget_notes.trim()
      : null;
  const websiteUrl =
    typeof row.website_url === "string" && row.website_url.trim()
      ? row.website_url.trim()
      : "";
  const googleMapsUrl =
    typeof row.google_maps_url === "string" && row.google_maps_url.trim()
      ? row.google_maps_url.trim()
      : null;

  return {
    id: String(row.id ?? ""),
    slug: typeof row.slug === "string" ? row.slug : "",
    name: typeof row.name === "string" ? row.name : "Untitled place",
    location,
    address,
    city,
    area,
    description,
    place_history: typeof row.place_history === "string" ? row.place_history : null,
    best_time_to_visit: typeof row.best_time_to_visit === "string" ? row.best_time_to_visit : null,
    visit_duration: typeof row.visit_duration === "string" ? row.visit_duration : null,
    good_for: getStringArray(row.good_for),
    not_ideal_for: getStringArray(row.not_ideal_for),
    crowd_level: typeof row.crowd_level === "string" ? row.crowd_level : null,
    indoor_outdoor: typeof row.indoor_outdoor === "string" ? row.indoor_outdoor : null,
    weather_fit: typeof row.weather_fit === "string" ? row.weather_fit : null,
    parking_info: typeof row.parking_info === "string" ? row.parking_info : null,
    accessibility_notes: typeof row.accessibility_notes === "string" ? row.accessibility_notes : null,
    decision_reason: typeof row.decision_reason === "string" ? row.decision_reason : null,
    commute_friendly: typeof row.commute_friendly === "boolean" ? row.commute_friendly : null,
    commute_access: typeof row.commute_access === "string" ? row.commute_access : null,
    nearby_context: typeof row.nearby_context === "string" ? row.nearby_context : null,
    budget_notes: budgetNotes,
    verification_status: typeof row.verification_status === "string" ? row.verification_status : null,
    verification_notes: typeof row.verification_notes === "string" ? row.verification_notes : null,
    verification_sources: getStringArray(row.verification_sources),
    last_verified_at: typeof row.last_verified_at === "string" ? row.last_verified_at : null,
    website_url: websiteUrl || null,
    google_maps_url: googleMapsUrl,
    category: typeof row.category === "string" ? row.category : "Place",
    entranceFee: budgetNotes ?? "Not specified",
    openHours: "Not available",
    website: websiteUrl,
    latitude: typeof row.latitude === "number" ? row.latitude : 0,
    longitude: typeof row.longitude === "number" ? row.longitude : 0,
    imageUrl: "",
    curatedImageUrls: [],
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_DETAIL_COLUMNS =
  "id,slug,name,category,address,city,area,latitude,longitude,description,place_history,best_time_to_visit,visit_duration,good_for,not_ideal_for,crowd_level,indoor_outdoor,weather_fit,parking_info,accessibility_notes,decision_reason,commute_friendly,commute_access,nearby_context,budget_notes,verification_status,verification_notes,verification_sources,last_verified_at,website_url,google_maps_url";

export async function findPlaceDetailByIdOrSlug(id: string): Promise<PlaceDetail | null> {
  const trimmedId = id.trim();

  if (!trimmedId) {
    return null;
  }

  try {
    const supabase = await getSupabaseAdminClient();
    const { data: slugData, error: slugError } = await supabase
      .from("places")
      .select(PLACE_DETAIL_COLUMNS)
      .eq("slug", trimmedId.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (!slugError && slugData) {
      const detail = mapPlaceRowToDetail(slugData as Record<string, unknown>);
      const images = await getApprovedPlaceImages(detail.id);
      const imageUrls = images.map((image) => image.image_url);
      return {
        ...detail,
        imageUrl: imageUrls[0] ?? "",
        curatedImageUrls: imageUrls,
      };
    }

    if (UUID_PATTERN.test(trimmedId)) {
      const { data: idData, error: idError } = await supabase
        .from("places")
        .select(PLACE_DETAIL_COLUMNS)
        .eq("id", trimmedId)
        .limit(1)
        .maybeSingle();

      if (!idError && idData) {
        const detail = mapPlaceRowToDetail(idData as Record<string, unknown>);
        const images = await getApprovedPlaceImages(detail.id);
        const imageUrls = images.map((image) => image.image_url);
        return {
          ...detail,
          imageUrl: imageUrls[0] ?? "",
          curatedImageUrls: imageUrls,
        };
      }
    }
  } catch {
    // Local development can run without Supabase credentials; fall through to curated details.
  }

  return findPlaceDetailById(trimmedId);
}
