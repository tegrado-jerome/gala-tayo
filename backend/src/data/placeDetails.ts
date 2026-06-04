import { getSupabaseAdminClient } from "../config/supabaseAdmin";

export type PlaceDetail = {
  id: string;
  slug?: string | null;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  description: string;
  detail_summary?: string | null;
  best_for?: string[];
  what_to_expect?: string[];
  tips?: string[];
  hours_text?: string | null;
  entrance_fee_text?: string | null;
  best_time_text?: string | null;
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

export const PLACE_DETAILS: PlaceDetail[] = [
  {
    id: "bonifacio-high-street",
    name: "Bonifacio High Street",
    location: "BGC, Taguig, Metro Manila",
    rating: 4.6,
    reviewCount: 1248,
    description:
      "Open-air lifestyle strip in BGC with shopping, dining, and public art, ideal for relaxed walks and meetups.",
    detail_summary:
      "A walkable BGC favorite for relaxed meetups, casual dining, shopping, and people-watching without needing a fixed itinerary.",
    best_for: ["Barkada walks", "Date nights", "Dining before or after errands"],
    what_to_expect: ["Open-air pedestrian areas", "Restaurants and cafes", "Public art and retail shops"],
    tips: ["Go late afternoon for cooler walks.", "Expect heavier crowds on weekends."],
    hours_text: "Open daily; shop and restaurant hours vary",
    entrance_fee_text: "Free entry",
    best_time_text: "Late afternoon to evening",
    website_url: "https://www.bgc.com.ph",
    google_maps_url: "https://www.google.com/maps/search/?api=1&query=Bonifacio+High+Street+BGC+Taguig",
    category: "Hangout",
    entranceFee: "Free",
    openHours: "Open daily; shop and restaurant hours vary",
    website: "https://www.bgc.com.ph",
    latitude: 14.5509,
    longitude: 121.051,
    imageUrl:
      "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
    curatedImageUrls: [
      "/images/places/bonifacio-high-street/bonifacio-high-street-1.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-2.webp",
      "/images/places/bonifacio-high-street/bonifacio-high-street-3.webp",
    ],
  },
  {
    id: "intramuros",
    name: "Intramuros",
    location: "Manila, Metro Manila",
    rating: 4.5,
    reviewCount: 920,
    description:
      "Historic walled city featuring Spanish-era landmarks, museums, churches, and cobblestone streets.",
    detail_summary:
      "A heritage district for history walks, old Manila architecture, museums, churches, and slow photo-friendly wandering.",
    best_for: ["Heritage trips", "Tourists", "Photo walks"],
    what_to_expect: ["Spanish-era landmarks", "Museums and churches", "Cobblestone streets"],
    tips: ["Wear comfortable shoes.", "Bring water and sun protection for daytime walks."],
    hours_text: "Open daily; attraction schedules vary",
    entrance_fee_text: "Some attractions are ticketed",
    best_time_text: "Morning or late afternoon",
    website_url: "https://intramuros.gov.ph",
    google_maps_url: "https://www.google.com/maps/search/?api=1&query=Intramuros+Manila",
    category: "Heritage",
    entranceFee: "Some attractions ticketed",
    openHours: "Open daily; attraction schedules vary",
    website: "https://intramuros.gov.ph",
    latitude: 14.5896,
    longitude: 120.9751,
    imageUrl: "/images/places/intramuros/intramuros-1.webp",
    curatedImageUrls: [
      "/images/places/intramuros/intramuros-1.webp",
      "/images/places/intramuros/intramuros-2.webp",
      "/images/places/intramuros/intramuros-3.webp",
    ],
  },
];

export function findPlaceDetailById(id: string): PlaceDetail | null {
  const trimmedId = id.trim().toLowerCase();

  if (!trimmedId) {
    return null;
  }

  return PLACE_DETAILS.find((place) => place.id === trimmedId) ?? null;
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
      : typeof row.detail_summary === "string" && row.detail_summary.trim()
        ? row.detail_summary.trim()
        : "";
  const hoursText =
    typeof row.hours_text === "string" && row.hours_text.trim()
      ? row.hours_text.trim()
      : "Hours not available";
  const entranceFeeText =
    typeof row.entrance_fee_text === "string" && row.entrance_fee_text.trim()
      ? row.entrance_fee_text.trim()
      : typeof row.budget_label === "string" && row.budget_label.trim()
        ? row.budget_label.trim()
        : "Not specified";
  const websiteUrl =
    typeof row.website_url === "string" && row.website_url.trim()
      ? row.website_url.trim()
      : typeof row.official_url === "string" && row.official_url.trim()
        ? row.official_url.trim()
        : "";
  const googleMapsUrl =
    typeof row.google_maps_url === "string" && row.google_maps_url.trim()
      ? row.google_maps_url.trim()
      : null;

  return {
    id: String(row.slug ?? row.id ?? ""),
    slug: typeof row.slug === "string" ? row.slug : null,
    name: typeof row.name === "string" ? row.name : "Untitled place",
    location,
    rating: typeof row.rating === "number" ? row.rating : 0,
    reviewCount: 0,
    description,
    detail_summary: typeof row.detail_summary === "string" ? row.detail_summary : null,
    best_for: getStringArray(row.best_for),
    what_to_expect: getStringArray(row.what_to_expect),
    tips: getStringArray(row.tips),
    hours_text: typeof row.hours_text === "string" ? row.hours_text : null,
    entrance_fee_text: typeof row.entrance_fee_text === "string" ? row.entrance_fee_text : null,
    best_time_text: typeof row.best_time_text === "string" ? row.best_time_text : null,
    website_url: websiteUrl || null,
    google_maps_url: googleMapsUrl,
    category: typeof row.category === "string" ? row.category : "Place",
    entranceFee: entranceFeeText,
    openHours: hoursText,
    website: websiteUrl,
    latitude: typeof row.latitude === "number" ? row.latitude : 0,
    longitude: typeof row.longitude === "number" ? row.longitude : 0,
    imageUrl: typeof row.photo_url === "string" ? row.photo_url : "",
    curatedImageUrls: getStringArray(row.photos),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_DETAIL_COLUMNS =
  "id,slug,name,category,address,city,area,latitude,longitude,rating,photo_url,photos,description,detail_summary,best_for,what_to_expect,tips,hours_text,entrance_fee_text,best_time_text,website_url,google_maps_url,official_url,budget_label";

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
      return mapPlaceRowToDetail(slugData as Record<string, unknown>);
    }

    if (UUID_PATTERN.test(trimmedId)) {
      const { data: idData, error: idError } = await supabase
        .from("places")
        .select(PLACE_DETAIL_COLUMNS)
        .eq("id", trimmedId)
        .limit(1)
        .maybeSingle();

      if (!idError && idData) {
        return mapPlaceRowToDetail(idData as Record<string, unknown>);
      }
    }
  } catch {
    // Local development can run without Supabase credentials; fall through to curated details.
  }

  return findPlaceDetailById(trimmedId);
}
