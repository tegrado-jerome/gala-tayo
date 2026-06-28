import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getApprovedPlaceImages } from "../services/placeImagesService";

export type PlaceDetail = {
  id: string;
  slug: string;
  name: string;
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

function mapPlaceRowToDetail(row: Record<string, unknown>): PlaceDetail {
  const address = getNullableString(row.address);
  const city = getNullableString(row.city);
  const area = getNullableString(row.area);
  const location = [area || address, city].filter(Boolean).join(", ") || "Metro Manila";
  const description =
    typeof row.description === "string" && row.description.trim()
      ? row.description.trim()
      : "";
  const budgetNotes =
    getNullableString(row.budget_notes) ??
    (getNullableNumber(row.budget_min) != null ? `Starting budget around PHP ${getNullableNumber(row.budget_min)}.` : null);
  const websiteUrl =
    getNullableString(row.website_url) ??
    getNullableString(row.official_url) ??
    getNullableString(row.source_url) ??
    "";
  const googleMapsUrl = getNullableString(row.google_maps_url);
  const latitude = getNullableNumber(row.latitude) ?? 0;
  const longitude = getNullableNumber(row.longitude) ?? 0;

  return {
    id: String(row.id ?? ""),
    slug: getNullableString(row.slug) ?? "",
    name: getNullableString(row.name) ?? "Untitled place",
    rating: getNullableNumber(row.rating),
    review_count: null,
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
    budget_notes: budgetNotes,
    verification_status: getNullableString(row.verification_status),
    verification_notes: getNullableString(row.verification_notes),
    verification_sources: getStringArray(row.verification_sources),
    last_verified_at: getNullableString(row.last_verified_at),
    website_url: websiteUrl || null,
    google_maps_url: googleMapsUrl,
    category: getNullableString(row.category) ?? "Place",
    entranceFee: budgetNotes ?? "Not specified",
    openHours: "Not available",
    website: websiteUrl,
    latitude,
    longitude,
    imageUrl: "",
    curatedImageUrls: [],
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_DETAIL_COLUMNS = "*";

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
      const reviewSummary = await getPlaceReviewSummary(detail.id);
      const images = await getApprovedPlaceImages(detail.id);
      const imageUrls = images.map((image) => image.image_url);
      return {
        ...detail,
        rating: reviewSummary.averageRating ?? detail.rating ?? null,
        review_count: reviewSummary.reviewCount > 0 ? reviewSummary.reviewCount : null,
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
        const reviewSummary = await getPlaceReviewSummary(detail.id);
        const images = await getApprovedPlaceImages(detail.id);
        const imageUrls = images.map((image) => image.image_url);
        return {
          ...detail,
          rating: reviewSummary.averageRating ?? detail.rating ?? null,
          review_count: reviewSummary.reviewCount > 0 ? reviewSummary.reviewCount : null,
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
