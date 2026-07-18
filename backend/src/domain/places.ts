import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getJsonCacheValue, setJsonCacheValue, deleteJsonCacheValue } from "../services/redisCacheService";

export type PlaceFaq = {
  question: string;
  answer: string;
};

export type PlaceRecord = {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  google_maps_url: string | null;
  description: string | null;
  best_time_to_visit: string | null;
  visit_duration: string | null;
  good_for: string[] | null;
  commute_access: string | null;
  parking_info: string | null;
  budget_min: number | string | null;
  budget_note: string | null;
  price_level: number | string | null;
  faqs: PlaceFaq[] | string | null;
  search_terms: string[] | null;
  tags: string[] | null;
  average_rating: number | string | null;
  review_count: number | string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type NormalizedPlace = Omit<
  PlaceRecord,
  "latitude" | "longitude" | "budget_min" | "price_level" | "faqs" | "average_rating" | "review_count" | "good_for" | "search_terms" | "tags"
> & {
  latitude: number | null;
  longitude: number | null;
  budget_min: number | null;
  price_level: number | null;
  faqs: PlaceFaq[];
  good_for: string[];
  search_terms: string[];
  tags: string[];
  average_rating: number | null;
  review_count: number;
};

export const FINAL_PLACE_CATEGORIES = [
  "Activity",
  "Cafe",
  "Cinema",
  "Food",
  "Heritage",
  "Hotel",
  "Mall",
  "Museum",
  "Nightlife",
  "Park",
] as const;

export const PUBLIC_PLACE_COLUMNS = [
  "id",
  "name",
  "slug",
  "category",
  "address",
  "city",
  "area",
  "latitude",
  "longitude",
  "google_maps_url",
  "description",
  "best_time_to_visit",
  "visit_duration",
  "good_for",
  "commute_access",
  "parking_info",
  "budget_min",
  "budget_note",
  "price_level",
  "faqs",
  "search_terms",
  "tags",
  "average_rating",
  "review_count",
  "status",
  "created_at",
  "updated_at",
].join(",");

const ACTIVE_PLACES_CACHE_KEY = "places:active:normalized:v2";
const ACTIVE_PLACES_CACHE_TTL_SECONDS = 60 * 10;
const ACTIVE_PLACES_DEPLOY_VERSION_KEY = "places:active:deploy-version";

function getDeployVersion(): string {
  return process.env.GALATAYO_DEPLOY_VERSION?.trim() || "local";
}

let deployVersionChecked = false;

export async function clearActivePlacesCache(): Promise<void> {
  deployVersionChecked = false;
  await deleteJsonCacheValue(ACTIVE_PLACES_CACHE_KEY);
  await deleteJsonCacheValue(ACTIVE_PLACES_DEPLOY_VERSION_KEY);
}

async function checkDeployVersion(): Promise<void> {
  if (deployVersionChecked) return;
  const currentVersion = getDeployVersion();
  const cachedVersion = await getJsonCacheValue<string>(ACTIVE_PLACES_DEPLOY_VERSION_KEY);
  if (cachedVersion !== currentVersion) {
    await deleteJsonCacheValue(ACTIVE_PLACES_CACHE_KEY);
    await setJsonCacheValue(ACTIVE_PLACES_DEPLOY_VERSION_KEY, currentVersion, { ttlSeconds: 86400 });
  }
  deployVersionChecked = true;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableInteger(value: unknown): number {
  const parsed = nullableNumber(value);
  return parsed === null ? 0 : Math.max(0, Math.floor(parsed));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
    : [];
}

export function normalizeFaqs(value: unknown, warn?: (message: string) => void): PlaceFaq[] {
  let candidate = value;
  if (typeof value === "string" && value.trim()) {
    try {
      candidate = JSON.parse(value);
    } catch {
      warn?.("Invalid place FAQ JSON string.");
      return [];
    }
  }

  if (!Array.isArray(candidate)) return [];

  return candidate
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const question = nullableString(record.question);
      const answer = nullableString(record.answer);
      return question && answer ? { question, answer } : null;
    })
    .filter((faq): faq is PlaceFaq => faq !== null);
}

export function normalizePlaceRecord(row: Record<string, unknown>, warn?: (message: string) => void): NormalizedPlace {
  return {
    id: String(row.id ?? ""),
    name: nullableString(row.name) ?? "",
    slug: nullableString(row.slug) ?? "",
    category: nullableString(row.category) ?? "",
    address: nullableString(row.address),
    city: nullableString(row.city),
    area: nullableString(row.area),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    google_maps_url: nullableString(row.google_maps_url),
    description: nullableString(row.description),
    best_time_to_visit: nullableString(row.best_time_to_visit),
    visit_duration: nullableString(row.visit_duration),
    good_for: stringArray(row.good_for),
    commute_access: nullableString(row.commute_access),
    parking_info: nullableString(row.parking_info),
    budget_min: nullableNumber(row.budget_min),
    budget_note: nullableString(row.budget_note),
    price_level: nullableNumber(row.price_level),
    faqs: normalizeFaqs(row.faqs, warn),
    search_terms: stringArray(row.search_terms),
    tags: stringArray(row.tags),
    average_rating: nullableNumber(row.average_rating),
    review_count: nullableInteger(row.review_count),
    status: nullableString(row.status) ?? "",
    created_at: nullableString(row.created_at) ?? "",
    updated_at: nullableString(row.updated_at) ?? "",
  };
}

export async function getActiveNormalizedPlaces(): Promise<NormalizedPlace[]> {
  await checkDeployVersion();
  const cachedPlaces = await getJsonCacheValue<NormalizedPlace[]>(ACTIVE_PLACES_CACHE_KEY);
  if (cachedPlaces) return cachedPlaces;

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("places") as any)
    .select(PUBLIC_PLACE_COLUMNS)
    .eq("status", "active")
    .order("name", { ascending: true, nullsFirst: false })
    .limit(1000);

  if (error) throw new Error("Failed to load active places.");

  const places = ((data ?? []) as Array<Record<string, unknown>>).map((row) => normalizePlaceRecord(row));
  await setJsonCacheValue(ACTIVE_PLACES_CACHE_KEY, places, { ttlSeconds: ACTIVE_PLACES_CACHE_TTL_SECONDS });
  return places;
}
