import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";
import type { NormalizedAskAiMapQuery } from "./askAiMapQueryNormalizer";
import {
  buildAbortSignal,
  isAskAiRequestCancelledError,
  throwIfAskAiRequestCancelled,
} from "../utils/askAiCancellation";

import { getActiveNormalizedPlaces } from "../domain/places";
import { resolveAreaSlug } from "../utils/seoPlaces";

let GoogleGenAIForMaps = GoogleGenAI;
const DEFAULT_SEARCH_AREA = "Metro Manila, Philippines";

export class AskAiMapsServiceError extends Error {
  status: number;
  code: string;
  providerStatus?: number;
  model?: string;
  stage?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 500,
    options?: {
      code?: string;
      providerStatus?: number;
      model?: string;
      stage?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AskAiMapsServiceError";
    this.status = status;
    this.code = options?.code ?? "ASK_AI_MAPS_ERROR";
    this.providerStatus = options?.providerStatus;
    this.model = options?.model;
    this.stage = options?.stage;
    this.details = options?.details;
  }
}

export type AskAiMapsSearchParams = {
  query: string;
  searchQuery?: string;
  normalizedQuery?: NormalizedAskAiMapQuery | null;
  selectedChips?: string[];
  nearMe?: boolean;
  openNow?: boolean;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  signal?: AbortSignal;
};

type AskAiMapsLogger = {
  log: (message: string) => void;
};

type AskAiMapsQueryType =
  | "broad_discovery"
  | "specific_place"
  | "near_me"
  | "general_discovery";

type CategoryIntent =
  | "mall"
  | "cafe"
  | "restaurant"
  | "samgyup"
  | "park"
  | "cinema"
  | "museum"
  | "hotel"
  | "resort"
  | "tourist_spot"
  | "activity"
  | "bar"
  | "karaoke"
  | "unknown";

type MatchConfidence = "high" | "medium";
type InternalMatchConfidence = MatchConfidence | "low";
type StrictnessLevel = "hard" | "soft" | "broad";
type ResultTier = "exact" | "strong_related" | "nearby_alternative";
type CoordinateConfidence = "high" | "medium" | "low" | "none";

type AskAiMapsResultMeta = {
  queryType: AskAiMapsQueryType;
  targetMinResults: number;
  targetMaxResults: number;
  geminiGroundedCount: number;
  geoapifyCoordinateFilledCount: number;
  geminiCoordinateFallbackCount: number;
  cardOnlyCount: number;
  geoapifyFallbackCount: number;
  returnedCount: number;
  pinCount: number;
  coordinateSource: "mixed";
  resultCountReason: string;
};

export type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
  role?: string;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

export type AskAiMapGroundedPlace = {
  id: string;
  name: string;
  reason: string;
  whyThisFits?: string;
  category?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  hasPin?: boolean;
  coordinateStatus?:
    | "geoapify_coordinate_fill"
    | "gemini_coordinate_fallback"
    | "missing_coordinates";
  coordinateConfidence?: CoordinateConfidence;
  coordinateDebug?: {
    queriesTried: string[];
    selectedQuery?: string;
    source?: string;
    reason?: string;
  };
  matchConfidence?: MatchConfidence;
  coordinates?: {
    lat: number;
    lng: number;
    latitude: number;
    longitude: number;
    source: "geoapify" | "gemini_fallback";
    trusted: true;
    verified: true;
    confidence: "high" | "medium";
  } | null;
  rating?: number | null;
  reviewCount?: number | null;
  openingHoursSummary?: string | null;
  googleMapsUri?: string | null;
  googlePlaceId?: string | null;
  geoapifyPlaceId?: string | null;
  optionalDetails?: {
    categoryText?: string;
    addressText?: string;
    ratingText?: string;
    reviewCountText?: string;
    openStatusText?: string;
    hoursText?: string;
    reviewSignals?: string[];
    openingHoursSummary?: string | null;
  };
  source?: {
    recommendation: "gemini_map_grounding" | "geoapify_fallback";
    coordinates: "geoapify_coordinate_fill" | "gemini_coordinate_fallback" | "geoapify_fallback" | "none";
    details: "gemini_map_grounding" | "geoapify";
  };
  trust?: {
    recommendationSource: "gemini_map_grounding" | "geoapify_fallback";
    detailsSource: "gemini_map_grounding" | "geoapify";
    coordinateSource: "geoapify" | "gemini" | "none";
    hasUsableCoordinates: boolean;
    deduped: boolean;
  };
  verification?: {
    nameMatched: boolean;
    locationMatched: boolean;
    categoryMatched: boolean;
    coordinateVerified: boolean;
  };
  matchScore?: number;
  distanceKm?: number | null;
  exactMatch?: boolean;
  mediumMatch?: boolean;
  isFallback?: boolean;
  resultTier?: ResultTier;
  relevanceSignals?: string[];
  displayCategory?: string;
  rawCategory?: string;
  /** In-app page when this place is also listed on GalaTayo. */
  galatayoPath?: string;
};

export type AskAiMapsSearchResult = {
  mode: "gemini_grounding_primary_geoapify_coordinates" | "geoapify_fallback_only" | "no_verified_results";
  query: string;
  searchArea: string | null;
  answerText: string;
  summary: string;
  resultMeta: AskAiMapsResultMeta;
  places: AskAiMapGroundedPlace[];
  suggestedSearches: string[];
  sources: AskAiMapsSource[];
  modelUsed?: string;
  coordinateSource?: "mixed";
  explanationSource?: "gemini_maps_grounding" | "backend_template";
  emptyReason?: AskAiMapsEmptyReason;
  message?: string;
  latencyMs: number;
};

type AskAiMapIntent = {
  rawQuery: string;
  normalizedQuery: string;
  queryType: AskAiMapsQueryType;
  categoryIntent: CategoryIntent;
  galaIntents: string[];
  searchAreaText: string | null;
  city: string | null;
  province: string | null;
  nearMe: boolean;
  strictCategory: boolean;
  strictness: StrictnessLevel;
  budgetIntent?: "free" | "low_cost" | "free_or_low_cost" | "normal" | "unknown";
  budgetAmount?: number | null;
  budgetPerPerson?: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
};

type GeoapifyCategoryConfig = {
  strict: boolean;
  strictness: StrictnessLevel;
  categories: string[];
  requiredCategoryAny: string[];
  keywordHints?: string[];
  displayCategory?: string;
};

type GeoapifyResolvedArea = {
  label: string;
  center: { latitude: number; longitude: number };
  filter: string;
  bias?: string;
  bbox?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  };
  placeId?: string;
  city?: string | null;
  province?: string | null;
  radiusMeters: number;
};

type GeoapifyGeocodeFeature = {
  bbox?: number[];
  properties?: {
    place_id?: unknown;
    formatted?: unknown;
    lat?: unknown;
    lon?: unknown;
    country_code?: unknown;
    country?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    state_district?: unknown;
    result_type?: unknown;
    rank?: unknown;
    address_line1?: unknown;
  };
};

type GeoapifyPlaceFeature = {
  properties?: {
    place_id?: unknown;
    name?: unknown;
    formatted?: unknown;
    address_line1?: unknown;
    address_line2?: unknown;
    lat?: unknown;
    lon?: unknown;
    categories?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    state_district?: unknown;
  };
};

type GeminiCandidate = {
  name: string;
  googleMapsTitle: string | null;
  googleMapsUri: string | null;
  googlePlaceId: string | null;
  addressHint: string | null;
  cityHint: string | null;
  provinceHint: string | null;
  categoryHint: string | null;
  rating: number | null;
  reviewCount: number | null;
  openingHoursSummary: string | null;
  reviewSignals: string[];
  reasonSignals: string[];
  groundingCoordinates: { latitude: number; longitude: number } | null;
  whyThisFits: string | null;
};

type GeminiMapsResponse = {
  places?: unknown;
  results?: unknown;
  recommendations?: unknown;
  candidates?: unknown;
  suggestedSearches?: unknown;
};

type VerificationResult = {
  accepted: boolean;
  rejectionReason?: string;
  place?: AskAiMapGroundedPlace;
};

const ASK_AI_MAPS_DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];
const ASK_AI_MAPS_DEFAULT_GROQ_WHY_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
];
const GEOAPIFY_GEOCODE_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_PLACES_ENDPOINT = "https://api.geoapify.com/v2/places";
const GEMINI_TIMEOUT_MS = 45_000;
const GEOAPIFY_TIMEOUT_MS = 8_000;
const MAX_CANDIDATES = 8;
const SOFT_STRICT_MIN_RESULTS = 4;
const PHILIPPINES_LAT_MIN = 4;
const PHILIPPINES_LAT_MAX = 21.5;
const PHILIPPINES_LNG_MIN = 116;
const PHILIPPINES_LNG_MAX = 127;

const TAGALOG_SYNONYMS: Record<string, string> = {
  "kainan": "restaurant",
  "kain": "restaurant",
  "pagkainan": "restaurant",
  "kapehan": "cafe",
  "kapihan": "cafe",
  "coffeehan": "cafe",
  "samgyupan": "samgyup",
  "samgy": "samgyup",
  "samg": "samgyup",
  "sinehan": "cinema",
  "sine": "cinema",
  "tambayan": "chill",
  "tambay": "chill",
  "pasyalan": "tourist_spot",
  "galaan": "tourist_spot",
  "pang date": "date",
  "date place": "date",
  "pang barkada": "barkada",
  "barkada": "barkada",
  "pampamilya": "family",
  "pang pamilya": "family",
  "family friendly": "family",
  "mura": "budget",
  "affordable": "budget",
  "budget friendly": "budget",
  "sulit": "worth_it",
  "tahimik": "quiet",
  "cozy": "cozy",
  "aesthetic": "aesthetic",
  "maganda pang picture": "aesthetic",
  "pang picture": "aesthetic",
  "instagrammable": "aesthetic",
  "may parking": "parking",
  "parking": "parking",
  "may wifi": "wifi",
  "wifi": "wifi",
  "aircon": "aircon",
  "malamig": "aircon",
  "pag umuulan": "rainy_day",
  "rainy day": "rainy_day",
  "indoor": "indoor",
  "outdoor": "outdoor",
  "late night": "night_out",
  "gabi": "night_out",
  "inuman": "bar",
  "bar": "bar",
  "karaoke": "karaoke",
  "ktv": "karaoke",
};

const GEOAPIFY_CATEGORY_MAP: Record<Exclude<CategoryIntent, "unknown">, GeoapifyCategoryConfig> = {
  mall: {
    strict: true,
    strictness: "hard",
    categories: ["commercial.shopping_mall"],
    requiredCategoryAny: ["commercial.shopping_mall"],
    displayCategory: "Mall",
  },
  cafe: {
    strict: true,
    strictness: "soft",
    categories: ["catering.cafe", "catering.cafe.coffee_shop"],
    requiredCategoryAny: ["catering.cafe"],
    displayCategory: "Cafe",
  },
  restaurant: {
    strict: true,
    strictness: "soft",
    categories: ["catering.restaurant"],
    requiredCategoryAny: ["catering.restaurant"],
    displayCategory: "Restaurant",
  },
  samgyup: {
    strict: true,
    strictness: "soft",
    categories: ["catering.restaurant"],
    requiredCategoryAny: ["catering.restaurant"],
    keywordHints: [
      "samgyup",
      "samgyupsal",
      "samgyeopsal",
      "korean bbq",
      "kbbq",
      "korean grill",
      "korean restaurant",
      "unli grill",
      "unlimited korean",
      "grill house",
      "seoul grill",
      "romantic baboy",
      "premier the samgyupsal",
      "doyaji",
      "chego",
    ],
    displayCategory: "Samgyup / Korean BBQ",
  },
  park: {
    strict: true,
    strictness: "hard",
    categories: ["leisure.park"],
    requiredCategoryAny: ["leisure.park"],
    displayCategory: "Park",
  },
  cinema: {
    strict: true,
    strictness: "hard",
    categories: ["entertainment.cinema"],
    requiredCategoryAny: ["entertainment.cinema"],
    displayCategory: "Cinema",
  },
  museum: {
    strict: true,
    strictness: "hard",
    categories: ["entertainment.museum"],
    requiredCategoryAny: ["entertainment.museum"],
    displayCategory: "Museum",
  },
  hotel: {
    strict: true,
    strictness: "hard",
    categories: ["accommodation.hotel"],
    requiredCategoryAny: ["accommodation.hotel"],
    displayCategory: "Hotel",
  },
  resort: {
    strict: true,
    strictness: "hard",
    categories: ["accommodation.hotel", "tourism"],
    requiredCategoryAny: ["accommodation", "tourism"],
    displayCategory: "Resort",
  },
  tourist_spot: {
    strict: false,
    strictness: "broad",
    categories: ["tourism.sights", "tourism.attraction", "tourism"],
    requiredCategoryAny: ["tourism"],
    displayCategory: "Tourist Spot",
  },
  activity: {
    strict: false,
    strictness: "broad",
    categories: ["entertainment", "leisure", "tourism"],
    requiredCategoryAny: ["entertainment", "leisure", "tourism"],
    displayCategory: "Activity",
  },
  bar: {
    strict: true,
    strictness: "soft",
    categories: ["catering.bar", "catering.pub"],
    requiredCategoryAny: ["catering.bar", "catering.pub"],
    displayCategory: "Bar",
  },
  karaoke: {
    strict: false,
    strictness: "soft",
    categories: ["entertainment", "catering.bar"],
    requiredCategoryAny: ["entertainment", "catering"],
    displayCategory: "Karaoke",
  },
};

const AMBIGUOUS_PROVINCE_CITY_NAMES = new Set([
  "cavite",
  "cebu",
  "iloilo",
  "tarlac",
  "batangas",
  "laguna",
]);

const CAVITE_EXPANDED_CITY_AREAS = [
  "Bacoor, Cavite, Philippines",
  "Imus, Cavite, Philippines",
  "Dasmariñas, Cavite, Philippines",
  "General Trias, Cavite, Philippines",
  "Tagaytay, Cavite, Philippines",
  "Trece Martires, Cavite, Philippines",
  "Kawit, Cavite, Philippines",
  "Tanza, Cavite, Philippines",
  "Rosario, Cavite, Philippines",
] as const;

type KnownAreaAlias = {
  canonicalLabel: string;
  city?: string | null;
  province?: string | null;
  provinceLevel?: boolean;
  expandedAreas?: readonly string[];
};

const KNOWN_AREA_ALIASES: Record<string, KnownAreaAlias> = {
  "cavite": {
    canonicalLabel: "Cavite Province, Philippines",
    province: "Cavite",
    provinceLevel: true,
    expandedAreas: CAVITE_EXPANDED_CITY_AREAS,
  },
  "laguna": {
    canonicalLabel: "Laguna Province, Philippines",
    province: "Laguna",
    provinceLevel: true,
  },
  "metro manila": {
    canonicalLabel: "Metro Manila, Philippines",
    province: "Metro Manila",
    provinceLevel: true,
  },
  "ncr": {
    canonicalLabel: "Metro Manila, Philippines",
    province: "Metro Manila",
    provinceLevel: true,
  },
  "national capital region": {
    canonicalLabel: "Metro Manila, Philippines",
    province: "Metro Manila",
    provinceLevel: true,
  },
  "paranaque": {
    canonicalLabel: "Parañaque, Metro Manila, Philippines",
    city: "Parañaque",
    province: "Metro Manila",
  },
  "parañaque": {
    canonicalLabel: "Parañaque, Metro Manila, Philippines",
    city: "Parañaque",
    province: "Metro Manila",
  },
  "cavite city": {
    canonicalLabel: "Cavite City, Cavite, Philippines",
    city: "Cavite City",
    province: "Cavite",
  },
  "bacoor": {
    canonicalLabel: "Bacoor, Cavite, Philippines",
    city: "Bacoor",
    province: "Cavite",
  },
  "imus": {
    canonicalLabel: "Imus, Cavite, Philippines",
    city: "Imus",
    province: "Cavite",
  },
  "tagaytay": {
    canonicalLabel: "Tagaytay, Cavite, Philippines",
    city: "Tagaytay",
    province: "Cavite",
  },
  "general trias": {
    canonicalLabel: "General Trias, Cavite, Philippines",
    city: "General Trias",
    province: "Cavite",
  },
  "trece martires": {
    canonicalLabel: "Trece Martires, Cavite, Philippines",
    city: "Trece Martires",
    province: "Cavite",
  },
  "kawit": {
    canonicalLabel: "Kawit, Cavite, Philippines",
    city: "Kawit",
    province: "Cavite",
  },
  "tanza": {
    canonicalLabel: "Tanza, Cavite, Philippines",
    city: "Tanza",
    province: "Cavite",
  },
  "rosario": {
    canonicalLabel: "Rosario, Cavite, Philippines",
    city: "Rosario",
    province: "Cavite",
  },
  "dasma": {
    canonicalLabel: "Dasmariñas, Cavite, Philippines",
    city: "Dasmariñas",
    province: "Cavite",
  },
  "dasmarinas": {
    canonicalLabel: "Dasmariñas, Cavite, Philippines",
    city: "Dasmariñas",
    province: "Cavite",
  },
  "dasmariñas": {
    canonicalLabel: "Dasmariñas, Cavite, Philippines",
    city: "Dasmariñas",
    province: "Cavite",
  },
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized : null;
}

function stripAccents(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeParanaqueAlias(rawArea: string): KnownAreaAlias | null {
  const normalized = normalizeKey(rawArea.replace(/\bphilippines\b/gi, ""));
  if (!normalized) {
    return null;
  }

  if (
    /\b(pque|paranaque|para naque)\b/.test(normalized) ||
    /\b(sa paranaque|dito sa paranaque|near paranaque|near para naque)\b/.test(normalized)
  ) {
    return {
      canonicalLabel: "Parañaque, Metro Manila, Philippines",
      city: "Parañaque",
      province: "Metro Manila",
    };
  }

  return null;
}

function resolveKnownAreaAlias(rawArea: string | null | undefined): KnownAreaAlias | null {
  const normalized = rawArea ? normalizeKey(rawArea.replace(/\bphilippines\b/gi, "")) : "";
  if (!normalized) {
    return null;
  }

  const paraqueAlias = normalizeParanaqueAlias(normalized);
  if (paraqueAlias) {
    return paraqueAlias;
  }

  if (KNOWN_AREA_ALIASES[normalized]) {
    return KNOWN_AREA_ALIASES[normalized];
  }

  const keys = Object.keys(KNOWN_AREA_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (new RegExp(`(^|\\s)${escapeRegExp(key)}(\\s|$)`).test(normalized)) {
      return KNOWN_AREA_ALIASES[key];
    }
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function getConfiguredModelList(envName: string, defaultModels: string[]): string[] {
  const configured = normalizeText(process.env[envName])
    ?.split(",")
    .map((item) => normalizeText(item)) ?? [];
  const models = uniqueStrings(configured, Number.MAX_SAFE_INTEGER);
  return models.length > 0 ? models : defaultModels;
}

function parseJsonObject<T>(value: string): T | null {
  const cleaned = value.replace(/^```json/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}

function slugify(value: string): string {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
}

function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function isInPhilippines(latitude: number, longitude: number): boolean {
  return latitude >= PHILIPPINES_LAT_MIN && latitude <= PHILIPPINES_LAT_MAX && longitude >= PHILIPPINES_LNG_MIN && longitude <= PHILIPPINES_LNG_MAX;
}

function getDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCategoryConfig(categoryIntent: CategoryIntent): GeoapifyCategoryConfig | null {
  if (categoryIntent === "unknown") {
    return null;
  }
  return GEOAPIFY_CATEGORY_MAP[categoryIntent];
}

function getTargetCounts(intent: AskAiMapIntent) {
  if (intent.queryType === "specific_place") {
    return { min: 1, max: 8 };
  }
  const normalizedArea = normalizeKey(intent.searchAreaText ?? "");
  if (
    isProvinceLevelArea(intent.searchAreaText ?? "") ||
    normalizedArea.includes("metro manila") ||
    normalizedArea.includes("national capital region")
  ) {
    return { min: 6, max: 8 };
  }
  return { min: 4, max: 8 };
}

function isProvinceLevelArea(rawArea: string): boolean {
  const alias = resolveKnownAreaAlias(rawArea);
  if (alias?.provinceLevel) {
    return true;
  }
  const normalized = normalizeKey(rawArea.replace(/\bphilippines\b/gi, ""));
  return AMBIGUOUS_PROVINCE_CITY_NAMES.has(normalized);
}

function buildAreaResolutionText(rawArea: string): string {
  const cleaned = normalizeText(rawArea) ?? rawArea;
  const alias = resolveKnownAreaAlias(cleaned);
  if (alias) {
    return alias.canonicalLabel;
  }
  if (isProvinceLevelArea(cleaned)) {
    return `${cleaned} Province, Philippines`;
  }
  return /\bphilippines\b/i.test(cleaned) ? cleaned : `${cleaned}, Philippines`;
}

function getExpandedSearchAreas(rawArea: string | null | undefined): string[] {
  const alias = resolveKnownAreaAlias(rawArea);
  return alias?.expandedAreas ? [...alias.expandedAreas] : [];
}

function getKeywordHintsForIntent(intent: AskAiMapIntent): string[] {
  const config = getCategoryConfig(intent.categoryIntent);
  if (!config) {
    return [];
  }
  return config.keywordHints ?? [];
}

function isSoftStrictIntent(intent: AskAiMapIntent): boolean {
  return intent.strictness === "soft";
}

function getDisplayCategoryForIntent(intent: AskAiMapIntent, place?: AskAiMapGroundedPlace): string {
  const config = getCategoryConfig(intent.categoryIntent);
  if (intent.categoryIntent === "samgyup") {
    const haystack = normalizeKey(
      `${place?.name ?? ""} ${place?.category ?? ""} ${place?.rawCategory ?? ""} ${(place?.relevanceSignals ?? []).join(" ")}`
    );
    if (
      haystack.includes("samgyup") ||
      haystack.includes("samgyupsal") ||
      haystack.includes("samgyeopsal") ||
      haystack.includes("korean bbq") ||
      haystack.includes("kbbq") ||
      haystack.includes("korean grill")
    ) {
      return "Samgyup / Korean BBQ";
    }
    return "Korean Restaurant";
  }
  return config?.displayCategory ?? (place?.category ?? "Place");
}

function normalizeTaglishQuery(rawQuery: string): string {
  let normalized = ` ${normalizeKey(rawQuery)} `;
  const entries = Object.entries(TAGALOG_SYNONYMS).sort((left, right) => right[0].length - left[0].length);
  for (const [source, replacement] of entries) {
    const pattern = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    normalized = normalized.replace(pattern, replacement);
  }
  return normalizeWhitespace(normalized);
}

function detectCategoryIntent(normalizedQuery: string): CategoryIntent {
  const checks: Array<[CategoryIntent, RegExp]> = [
    ["samgyup", /\b(samgyup|samgyeopsal|korean bbq|kbbq|korean grill)\b/],
    ["mall", /\b(mall|malls|shopping mall|shopping center)\b/],
    ["cafe", /\b(cafe|coffee shop|coffee)\b/],
    ["restaurant", /\b(restaurant|food place|kainan)\b/],
    ["park", /\b(park|parks)\b/],
    ["cinema", /\b(cinema|movie theater|movies)\b/],
    ["museum", /\b(museum|museums)\b/],
    ["hotel", /\b(hotel|hotels)\b/],
    ["resort", /\b(resort|resorts)\b/],
    ["tourist_spot", /\b(tourist spot|tourist spots|attraction|tourism)\b/],
    ["bar", /\b(bar|pub|inuman)\b/],
    ["karaoke", /\b(karaoke|ktv)\b/],
    ["activity", /\b(activity|activities|fun|arcade|bowling)\b/],
  ];
  for (const [category, pattern] of checks) {
    if (pattern.test(normalizedQuery)) {
      return category;
    }
  }
  return "unknown";
}

function detectGalaIntents(normalizedQuery: string, categoryIntent: CategoryIntent): string[] {
  return uniqueStrings([
    /\bdate\b/.test(normalizedQuery) ? "date" : null,
    /\bfoodtrip\b|\brestaurant\b|\bfood place\b/.test(normalizedQuery) ? "foodtrip" : null,
    /\bbarkada\b/.test(normalizedQuery) ? "barkada" : null,
    /\bfamily\b/.test(normalizedQuery) ? "family" : null,
    /\bchill\b|\bcozy\b|\bquiet\b/.test(normalizedQuery) ? "chill" : null,
    /\bstudy\b|\bwifi\b/.test(normalizedQuery) ? "study" : null,
    /\brainy_day\b/.test(normalizedQuery) ? "rainy_day" : null,
    /\bbudget\b/.test(normalizedQuery) ? "budget" : null,
    /\b(highly rated|well rated|top rated|mataas rating|maganda rating|many reviews|maraming reviews)\b/.test(normalizedQuery) ? "highly-rated" : null,
    /\b(walkable|walking distance|lakarin|kayang lakarin|short walk|nearby|malapit)\b/.test(normalizedQuery) ? "walkable" : null,
    /\baesthetic\b/.test(normalizedQuery) ? "aesthetic" : null,
    /\bindoor\b|\baircon\b/.test(normalizedQuery) ? "indoor" : null,
    /\boutdoor\b/.test(normalizedQuery) ? "outdoor" : null,
    /\bnight_out\b|\bbar\b|\bkaraoke\b/.test(normalizedQuery) ? "night_out" : null,
    categoryIntent === "restaurant" || categoryIntent === "samgyup" ? "foodtrip" : null,
  ]);
}

function extractSearchAreaText(rawQuery: string): string | null {
  const normalized = normalizeWhitespace(rawQuery);
  const patterns = [
    /\b(?:in|sa|around|within|near)\s+([a-zA-Z0-9 .,'-]+)$/i,
    /\b(?:in|sa|around|within|near)\s+([a-zA-Z0-9 .,'-]+?)(?:\s+\b(?:for|na|pang|with)\b|$)/i,
    /,\s*([a-zA-Z0-9 .,'-]+?)(?:\s*,\s*Philippines)?$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const area = normalizeText(match?.[1]);
    if (area && !/\bme\b/i.test(area)) {
      return /\bphilippines\b/i.test(area) ? area : `${area}, Philippines`;
    }
  }
  return null;
}

function extractCoordinatesFromGoogleMapsUrl(uri: string | null | undefined): { latitude: number; longitude: number } | null {
  const normalized = normalizeText(uri);
  if (!normalized) {
    return null;
  }

  const candidates = [
    normalized,
    (() => {
      try {
        return decodeURIComponent(normalized);
      } catch {
        return normalized;
      }
    })(),
  ];

  for (const value of candidates) {
    const atMatch = value.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      const latitude = Number(atMatch[1]);
      const longitude = Number(atMatch[2]);
      if (isFiniteCoordinate(latitude, longitude) && isInPhilippines(latitude, longitude)) {
        return { latitude, longitude };
      }
    }

    const bangMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bangMatch) {
      const latitude = Number(bangMatch[1]);
      const longitude = Number(bangMatch[2]);
      if (isFiniteCoordinate(latitude, longitude) && isInPhilippines(latitude, longitude)) {
        return { latitude, longitude };
      }
    }

    const queryMatch = value.match(/[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
    if (queryMatch) {
      const latitude = Number(queryMatch[1]);
      const longitude = Number(queryMatch[2]);
      if (isFiniteCoordinate(latitude, longitude) && isInPhilippines(latitude, longitude)) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

function extractPlaceIdFromMapsUri(uri: string | null | undefined): string | null {
  const normalized = normalizeText(uri);
  if (!normalized) {
    return null;
  }

  const sharedMatch = normalized.match(/\/place\/share\/([^\s?&]+)/);
  if (sharedMatch?.[1]) {
    return sharedMatch[1];
  }

  const placeMatch = normalized.match(/\/place\/([^/\s?&]+)/);
  if (placeMatch?.[1] && placeMatch[1] !== "share") {
    return placeMatch[1];
  }

  const cidMatch = normalized.match(/[?&]cid=([^&\s]+)/i);
  if (cidMatch?.[1]) {
    return cidMatch[1];
  }

  const ftidMatch = normalized.match(/[?&]ftid=([^&\s]+)/i);
  if (ftidMatch?.[1]) {
    return ftidMatch[1];
  }

  return null;
}

function extractPlaceNameFromUri(uri: string | null | undefined): string | null {
  const normalized = normalizeText(uri);
  if (!normalized) {
    return null;
  }

  const qMatch = normalized.match(/[?&]q=([^&\s]+)/i);
  if (qMatch?.[1]) {
    try {
      return decodeURIComponent(qMatch[1].replace(/\+/g, " "));
    } catch {
      return qMatch[1].replace(/\+/g, " ");
    }
  }

  return null;
}

function extractCandidateCoordinates(record: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const nestedCoordinates = record.coordinates;
  const candidates: Array<Record<string, unknown>> = [];

  if (nestedCoordinates && typeof nestedCoordinates === "object") {
    candidates.push(nestedCoordinates as Record<string, unknown>);
  }

  candidates.push(record);

  for (const candidate of candidates) {
    const latitudeValue = candidate.latitude ?? candidate.lat;
    const longitudeValue = candidate.longitude ?? candidate.lng ?? candidate.lon;
    const latitude = typeof latitudeValue === "number" ? latitudeValue : Number(latitudeValue);
    const longitude = typeof longitudeValue === "number" ? longitudeValue : Number(longitudeValue);

    if (isFiniteCoordinate(latitude, longitude) && isInPhilippines(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function parseAskAiMapIntent(
  rawQuery: string,
  searchQuery: string,
  params: AskAiMapsSearchParams
): AskAiMapIntent {
  const normalizedQuery = normalizeTaglishQuery(searchQuery);
  const categoryIntent = detectCategoryIntent(normalizedQuery);
  const galaIntents = detectGalaIntents(normalizedQuery, categoryIntent);
  const nearMe =
    params.nearMe === true ||
    /\b(near me|nearby|around me|close to me|malapit sakin|malapit sa akin)\b/i.test(rawQuery) ||
    /\b(near me|nearby|around me|close to me|malapit sakin|malapit sa akin)\b/i.test(searchQuery);
  const normalizedLocationText = resolveKnownAreaAlias(params.normalizedQuery?.location ?? null)?.canonicalLabel ?? normalizeText(params.normalizedQuery?.location);
  const rawSearchAreaText =
    extractSearchAreaText(searchQuery) ??
    extractSearchAreaText(rawQuery) ??
    normalizedLocationText ??
    resolveKnownAreaAlias(searchQuery)?.canonicalLabel ??
    resolveKnownAreaAlias(rawQuery)?.canonicalLabel ??
    null;
  const normalizedAreaText = rawSearchAreaText
    ? buildAreaResolutionText(rawSearchAreaText.replace(/\s*,\s*philippines$/i, ""))
    : null;
  const areaAlias = resolveKnownAreaAlias(normalizedAreaText) ?? resolveKnownAreaAlias(rawSearchAreaText);
  let queryType: AskAiMapsQueryType = "general_discovery";

  if (nearMe) {
    queryType = "near_me";
  } else if (
    /\b(places to go|gala spots|san maganda gumala|date ideas|galaan|pasyalan)\b/i.test(searchQuery) ||
    categoryIntent === "tourist_spot" ||
    categoryIntent === "activity" ||
    isProvinceLevelArea(normalizedAreaText ?? "") ||
    /\bmetro manila\b/i.test(normalizedAreaText ?? "")
  ) {
    queryType = "broad_discovery";
  } else if (categoryIntent === "unknown" && searchQuery.split(" ").length <= 4) {
    queryType = "specific_place";
  }

  return {
    rawQuery,
    normalizedQuery,
    queryType,
    categoryIntent,
    galaIntents,
    searchAreaText: normalizedAreaText,
    city: areaAlias?.city ?? (
      normalizedAreaText && !isProvinceLevelArea(normalizedAreaText.split(",")[0] ?? "")
        ? normalizeText(normalizedAreaText.split(",")[0])
        : null
    ),
    province:
      areaAlias?.province ??
      (normalizedAreaText && isProvinceLevelArea(normalizedAreaText.split(",")[0] ?? "")
        ? normalizeText(normalizedAreaText.split(",")[0] ?? null)?.replace(/\bprovince\b/i, "").trim() ?? null
        : null),
    nearMe,
    strictCategory: false,
    strictness: "broad",
    budgetIntent: params.normalizedQuery?.budgetIntent ?? "unknown",
    budgetAmount: params.normalizedQuery?.budgetAmount ?? null,
    budgetPerPerson: params.normalizedQuery?.budgetPerPerson ?? undefined,
    userLocation: params.userLocation ?? null,
  };
}

function hasRequiredCategory(placeCategories: string[] | null | undefined, requiredCategoryAny: string[]): boolean {
  if (!Array.isArray(placeCategories)) {
    return false;
  }
  return requiredCategoryAny.some((required) =>
    placeCategories.some((actual) => actual === required || actual.startsWith(`${required}.`))
  );
}

async function getGeminiApiKey(): Promise<string> {
  const envKey = normalizeText(process.env.GEMINI_API_KEY);
  if (envKey) {
    return envKey;
  }
  const secret = await getSecret(KEY_VAULT_SECRET_NAMES.GEMINI_API_KEY);
  const apiKey = normalizeText(secret);
  if (!apiKey) {
    throw new AskAiMapsServiceError("Gemini API key is missing.", 500, {
      code: "ASK_AI_MAPS_PROVIDER_ERROR",
      stage: "load_gemini_key",
    });
  }
  return apiKey;
}

async function getGeoapifyApiKey(): Promise<string> {
  const envKey = normalizeText(process.env.GEOAPIFY_API_KEY);
  if (envKey) {
    return envKey;
  }
  const secret = await getSecret(KEY_VAULT_SECRET_NAMES.GEOAPIFY_API_KEY);
  const apiKey = normalizeText(secret);
  if (!apiKey) {
    throw new AskAiMapsServiceError("Geoapify API key is missing.", 500, {
      code: "ASK_AI_MAPS_PROVIDER_ERROR",
      stage: "load_geoapify_key",
    });
  }
  return apiKey;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new AskAiMapsServiceError(message, 504, {
          code: "ASK_AI_MAPS_TIMEOUT",
          stage: "provider_timeout",
        })
      );
    }, timeoutMs);
  });
  const abortPromise = new Promise<T>((_, reject) => {
    signal?.addEventListener("abort", () => {
      reject(signal.reason);
    }, { once: true });
  });
  try {
    throwIfAskAiRequestCancelled(signal);
    return await Promise.race([promise, timeoutPromise, abortPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchJson<T>(url: URL, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const abortSignal = buildAbortSignal([timeoutSignal, signal]);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: abortSignal,
    });
    if (!response.ok) {
      throw new AskAiMapsServiceError(`Provider request failed with status ${response.status}.`, 502, {
        code: "ASK_AI_MAPS_PROVIDER_ERROR",
        providerStatus: response.status,
        stage: "provider_fetch",
      });
    }
    return (await response.json()) as T;
  } catch (error) {
    if (signal?.aborted || isAskAiRequestCancelledError(error)) {
      throwIfAskAiRequestCancelled(signal);
    }

    throw error;
  }
}

function parseBbox(rawBbox: number[] | undefined): GeoapifyResolvedArea["bbox"] | undefined {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    return undefined;
  }
  const [minLng, minLat, maxLng, maxLat] = rawBbox.map((value) => Number(value));
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return undefined;
  }
  return {
    minLat: Math.min(minLat, maxLat),
    minLng: Math.min(minLng, maxLng),
    maxLat: Math.max(minLat, maxLat),
    maxLng: Math.max(minLng, maxLng),
  };
}

function getAreaRadiusMeters(args: { bbox?: GeoapifyResolvedArea["bbox"]; provinceLevel: boolean }): number {
  if (args.bbox) {
    const diagonalKm = getDistanceKm(
      { latitude: args.bbox.minLat, longitude: args.bbox.minLng },
      { latitude: args.bbox.maxLat, longitude: args.bbox.maxLng }
    );
    const bufferedKm = diagonalKm / 2 + (args.provinceLevel ? 18 : 8);
    return Math.round(
      Math.min(
        Math.max(bufferedKm, args.provinceLevel ? 50 : 12),
        args.provinceLevel ? 130 : 35
      ) * 1000
    );
  }

  return args.provinceLevel ? 90000 : 20000;
}

async function resolveSearchAreaWithGeoapify(
  intent: AskAiMapIntent,
  signal?: AbortSignal
): Promise<GeoapifyResolvedArea | null> {
  if (intent.nearMe && intent.userLocation) {
    return {
      label: "near you",
      center: {
        latitude: intent.userLocation.latitude,
        longitude: intent.userLocation.longitude,
      },
      filter: `circle:${intent.userLocation.longitude},${intent.userLocation.latitude},12000`,
      bias: `proximity:${intent.userLocation.longitude},${intent.userLocation.latitude}`,
      radiusMeters: 12000,
    };
  }

  if (!intent.searchAreaText) {
    return null;
  }

  const apiKey = await getGeoapifyApiKey();
  const url = new URL(GEOAPIFY_GEOCODE_ENDPOINT);
  url.searchParams.set("text", buildAreaResolutionText(intent.searchAreaText));
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);
  const payload = await fetchJson<{ features?: GeoapifyGeocodeFeature[] }>(url, GEOAPIFY_TIMEOUT_MS, signal);
  const feature = Array.isArray(payload.features) ? payload.features[0] : null;
  const properties = feature?.properties ?? {};
  const latitude = Number(properties.lat);
  const longitude = Number(properties.lon);
  const countryCode = normalizeText(properties.country_code)?.toLowerCase();

  if (!feature || !isFiniteCoordinate(latitude, longitude) || countryCode !== "ph") {
    return null;
  }

  const placeId = normalizeText(properties.place_id) ?? undefined;
  const bbox = parseBbox(feature?.bbox);
  const provinceLevel = Boolean(intent.searchAreaText && isProvinceLevelArea(intent.searchAreaText));
  const radiusMeters = getAreaRadiusMeters({ bbox, provinceLevel });
  return {
    label:
      provinceLevel
        ? `${normalizeText(intent.searchAreaText.split(",")[0]) ?? intent.searchAreaText.split(",")[0]}, Philippines`
        : normalizeText(properties.formatted) ?? intent.searchAreaText,
    center: { latitude, longitude },
    filter:
      placeId
        ? `place:${placeId}`
        : bbox
          ? `rect:${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`
          : `circle:${longitude},${latitude},${radiusMeters}`,
    bias: `proximity:${longitude},${latitude}`,
    bbox,
    placeId,
    city: resolveKnownAreaAlias(intent.searchAreaText)?.city ?? normalizeText(properties.city),
    province:
      resolveKnownAreaAlias(intent.searchAreaText)?.province ??
      normalizeText(properties.county) ??
      normalizeText(properties.state_district) ??
      normalizeText(properties.state),
    radiusMeters,
  };
}

function buildGeminiPrompt(intent: AskAiMapIntent): string {
  const keywordHints = getKeywordHintsForIntent(intent);
  const areaText = intent.searchAreaText ?? "the search area";
  const categoryLabel = intent.categoryIntent === "unknown" ? "places" : intent.categoryIntent.replace(/_/g, " ");

  const lines = [
    `Search Google Maps for ${categoryLabel} in ${areaText}.`,
    `User query: "${intent.rawQuery}"`,
    "",
    "Return a JSON object with a \"places\" array. Each place object must have:",
    '- "name": the full place name from Google Maps',
    '- "whyThisFits": one short Taglish sentence (max 20 words) on why this place fits the user query',
    '- "category": the place category (e.g. Shopping Mall, Cafe, Restaurant)',
    '- "address": the place address',
    '- "rating": the star rating as a number (e.g. 4.2)',
    '- "reviewCount": total review count as a number',
    '- "openingHoursSummary": brief opening hours info if available',
  ];

  if (keywordHints.length > 0) {
    lines.push(`Keyword hints to help identify relevant places: ${keywordHints.join(", ")}`);
  }

  if (intent.categoryIntent === "samgyup") {
    lines.push("For samgyup, return Korean BBQ, samgyupsal, KBBQ, unlimited Korean grill, Korean restaurant with grill, and grill house places.");
  }

  if (intent.galaIntents.length > 0) {
    lines.push(`User gala preferences: ${intent.galaIntents.join(", ")}`);
  }

  lines.push(`Return at most ${MAX_CANDIDATES} places. Only return places you can find in Google Maps.`);

  return lines.join("\n");
}

type GeminiMapsGroundingResult = {
  candidates: GeminiCandidate[];
  suggestedSearches: string[];
  invalidJson: boolean;
  modelUsed: string | null;
};

function getProviderStatusFromError(error: unknown): number | null {
  if (error instanceof AskAiMapsServiceError && typeof error.providerStatus === "number") {
    return error.providerStatus;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status = record.status ?? record.statusCode ?? record.code;
    if (typeof status === "number" && Number.isFinite(status)) {
      return Math.round(status);
    }
    if (typeof status === "string") {
      const parsed = Number(status);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }
  return null;
}

function shouldRotateGeminiModel(error: unknown): boolean {
  const status = getProviderStatusFromError(error);
  return (
    status === null ||
    status === 429 ||
    status >= 500 ||
    (error instanceof AskAiMapsServiceError && error.code === "ASK_AI_MAPS_TIMEOUT")
  );
}

async function callGeminiMapsGroundingWithModel(
  intent: AskAiMapIntent,
  model: string,
  logger?: AskAiMapsLogger,
  signal?: AbortSignal
): Promise<GeminiMapsGroundingResult> {
  logger?.log(
    `[AskAiMaps] gemini_called=${true} gemini_model=${model} grounding_enabled=${true}`
  );
  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAIForMaps({ apiKey });
  throwIfAskAiRequestCancelled(signal);
  const response = await withTimeout(
    ai.models.generateContent({
      model: `models/${model}`,
      contents: buildGeminiPrompt(intent),
      config: {
        temperature: 0,
        maxOutputTokens: 1400,
        tools: [{ googleMaps: {} }],
        abortSignal: signal,
      },
    }),
    GEMINI_TIMEOUT_MS,
    `Gemini timed out on ${model}.`,
    signal
  );

  const candidates: GeminiCandidate[] = [];

  const responseAny = response as unknown as Record<string, unknown>;
  const responseCandidates = Array.isArray(responseAny.candidates) ? responseAny.candidates : [];

  const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> = [];
  let textCandidateMap = new Map<string, Record<string, unknown>>();

  if (responseCandidates.length > 0) {
    const firstCandidate = responseCandidates[0] as Record<string, unknown>;
    const groundingMetadata = firstCandidate.groundingMetadata as Record<string, unknown> | undefined;
    const chunks = Array.isArray(groundingMetadata?.groundingChunks) ? groundingMetadata!.groundingChunks as Array<Record<string, unknown>> : [];
    const supports = Array.isArray(groundingMetadata?.groundingSupports) ? groundingMetadata!.groundingSupports as Array<Record<string, unknown>> : [];

    logger?.log(`[AskAiMaps] gemini_model=${model} gemini_grounding_chunks=${chunks.length} grounding_supports=${supports.length}`);

    for (const chunk of chunks) {
      const web = chunk.web as { uri?: string; title?: string } | undefined;
      if (web) {
        groundingChunks.push({ web });
      }
    }
  }

  const rawText = normalizeText((response as { text?: string }).text) ?? "";
  logger?.log(`[AskAiMaps] gemini_model=${model} gemini_raw_text_length=${rawText.length}`);
  const parsed = rawText ? parseJsonObject<GeminiMapsResponse>(rawText) : null;
  const invalidJson = Boolean(rawText && !parsed);

  if (parsed) {
    const rawPlaces = Array.isArray(parsed.places)
      ? parsed.places
      : Array.isArray(parsed.candidates)
        ? parsed.candidates
        : Array.isArray(parsed.results)
          ? parsed.results
          : Array.isArray(parsed.recommendations)
            ? parsed.recommendations
            : [];

    for (const item of rawPlaces) {
      const record = item as Record<string, unknown>;
      const name =
        normalizeText(record.name) ??
        normalizeText(record.title) ??
        normalizeText(record.googleMapsTitle);
      if (name) {
        textCandidateMap.set(normalizeKey(name), record);
      }
    }

    logger?.log(`[AskAiMaps] gemini_model=${model} gemini_text_places_parsed=${textCandidateMap.size}`);
  }

  const seenUris = new Set<string>();
  const mapsChunks: Array<{ uri: string; title: string }> = [];

  for (const chunk of groundingChunks) {
    const uri = chunk.web?.uri;
    const title = normalizeText(chunk.web?.title);
    if (uri && uri.includes("google.com/maps") && !seenUris.has(uri)) {
      seenUris.add(uri);
      mapsChunks.push({ uri, title: title ?? "" });
    }
  }

  logger?.log(`[AskAiMaps] gemini_model=${model} gemini_maps_grounding_uris=${mapsChunks.length}`);

  for (const chunk of mapsChunks) {
    const coords = extractCoordinatesFromGoogleMapsUrl(chunk.uri);
    const placeId = extractPlaceIdFromMapsUri(chunk.uri);
    // Gemini's JSON names rarely match the Maps title exactly ("Commune" vs "Commune Café + Bar"), so fall back to a fuzzy match.
    const textDetails = (textCandidateMap.get(normalizeKey(chunk.title)) ??
      [...textCandidateMap.entries()].find(([key]) => nameSimilarity(key, chunk.title) >= 0.6)?.[1]) as Record<string, unknown> | undefined;

    const name = chunk.title || extractPlaceNameFromUri(chunk.uri) || "Google Maps Place";

    candidates.push({
      name,
      googleMapsTitle: chunk.title || null,
      googleMapsUri: chunk.uri,
      googlePlaceId: placeId,
      addressHint: textDetails ? (normalizeText(textDetails.address) ?? normalizeText(textDetails.addressHint)) : null,
      cityHint: textDetails ? (normalizeText(textDetails.city) ?? normalizeText(textDetails.cityHint)) : null,
      provinceHint: textDetails ? (normalizeText(textDetails.province) ?? normalizeText(textDetails.provinceHint)) : null,
      categoryHint: textDetails ? (normalizeText(textDetails.category) ?? normalizeText(textDetails.categoryHint)) : null,
      rating: textDetails && typeof textDetails.rating === "number" && Number.isFinite(textDetails.rating) ? textDetails.rating : null,
      reviewCount: textDetails && typeof textDetails.reviewCount === "number" && Number.isFinite(textDetails.reviewCount) ? Math.round(textDetails.reviewCount) : null,
      openingHoursSummary: textDetails ? normalizeText(textDetails.openingHoursSummary) : null,
      reviewSignals: textDetails && Array.isArray(textDetails.reviewSignals)
        ? uniqueStrings((textDetails.reviewSignals as unknown[]).map((v) => normalizeText(v)), 5)
        : [],
      reasonSignals: textDetails && Array.isArray(textDetails.reasonSignals)
        ? uniqueStrings((textDetails.reasonSignals as unknown[]).map((v) => normalizeText(v)), 5)
        : [],
      whyThisFits: textDetails
        ? (normalizeText(textDetails.whyThisFits) ?? normalizeText(textDetails.why_this_fits) ?? normalizeText(textDetails.reason))
        : null,
      groundingCoordinates: coords,
    });
  }

  if (candidates.length === 0 && textCandidateMap.size > 0) {
    logger?.log(`[AskAiMaps] gemini_model=${model} gemini_no_grounding_uris_falling_back_to_text`);
    const sortedNames = Array.from(textCandidateMap.keys()).sort();
    for (const key of sortedNames.slice(0, MAX_CANDIDATES)) {
      const record = textCandidateMap.get(key);
      if (!record) continue;

      const name =
        normalizeText(record.name) ??
        normalizeText(record.title) ??
        normalizeText(record.googleMapsTitle);
      if (!name) continue;

      candidates.push({
        name,
        googleMapsTitle:
          normalizeText(record.googleMapsTitle) ??
          normalizeText(record.google_maps_title) ??
          normalizeText(record.title),
        googleMapsUri:
          normalizeText(record.googleMapsUri) ??
          normalizeText(record.google_maps_uri) ??
          normalizeText(record.googleMapsUrl) ??
          normalizeText(record.url),
        googlePlaceId:
          normalizeText(record.googlePlaceId) ??
          normalizeText(record.google_place_id) ??
          normalizeText(record.placeId),
        addressHint: normalizeText(record.address) ?? normalizeText(record.addressHint),
        cityHint: normalizeText(record.city) ?? normalizeText(record.cityHint),
        provinceHint: normalizeText(record.province) ?? normalizeText(record.provinceHint),
        categoryHint: normalizeText(record.category) ?? normalizeText(record.categoryHint),
        rating: typeof record.rating === "number" && Number.isFinite(record.rating) ? record.rating : null,
        reviewCount: typeof record.reviewCount === "number" && Number.isFinite(record.reviewCount) ? Math.round(record.reviewCount) : null,
        openingHoursSummary: normalizeText(record.openingHoursSummary),
        reviewSignals: [],
        reasonSignals: [],
        whyThisFits:
          normalizeText(record.whyThisFits) ??
          normalizeText(record.why_this_fits) ??
          normalizeText(record.reason),
        groundingCoordinates:
          extractCandidateCoordinates(record) ??
          extractCoordinatesFromGoogleMapsUrl(
            normalizeText(record.googleMapsUri) ??
              normalizeText(record.google_maps_uri) ??
              normalizeText(record.googleMapsUrl) ??
              normalizeText(record.url)
          ),
      });
    }
  }

  candidates.length = Math.min(candidates.length, MAX_CANDIDATES);
  logger?.log(`[AskAiMaps] gemini_model=${model} gemini_candidates_final=${candidates.length} invalid_json=${invalidJson}`);

  const suggestedSearches: string[] = [];
  if (parsed) {
    const parsedSearches = Array.isArray(parsed.suggestedSearches)
      ? parsed.suggestedSearches
      : [];
    suggestedSearches.push(...uniqueStrings(parsedSearches.map((value) => normalizeText(value)), 5));
  }

  return { candidates, suggestedSearches, invalidJson, modelUsed: model };
}

async function callGeminiMapsGrounding(
  intent: AskAiMapIntent,
  logger?: AskAiMapsLogger,
  signal?: AbortSignal
): Promise<GeminiMapsGroundingResult> {
  const modelsToTry = getConfiguredModelList("ASK_AI_MAPS_GEMINI_MODELS", ASK_AI_MAPS_DEFAULT_GEMINI_MODELS);
  logger?.log(`[AskAiMaps] gemini_models_configured=${modelsToTry.join(",")}`);

  for (let index = 0; index < modelsToTry.length; index++) {
    const model = modelsToTry[index];
    try {
      const result = await callGeminiMapsGroundingWithModel(intent, model, logger, signal);
      if (result.invalidJson) {
        logger?.log(`[AskAiMaps] gemini_model=${model} fallbackReason=invalid-json`);
        continue;
      }
      if (result.candidates.length === 0) {
        logger?.log(`[AskAiMaps] gemini_model=${model} fallbackReason=empty-candidates`);
        continue;
      }
      logger?.log(`[AskAiMaps] gemini_model=${model} status=success`);
      return result;
    } catch (error) {
      if (signal?.aborted || isAskAiRequestCancelledError(error)) {
        throwIfAskAiRequestCancelled(signal);
      }

      const reason = error instanceof Error ? error.message : String(error);
      logger?.log(`[AskAiMaps] gemini_model=${model} fallbackReason=provider-error error=${reason}`);

      if (index === modelsToTry.length - 1 || !shouldRotateGeminiModel(error)) {
        break;
      }
    }
  }

  logger?.log("[AskAiMaps] gemini_all_models_failed_or_empty");
  return { candidates: [], suggestedSearches: [], invalidJson: false, modelUsed: null };
}

function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map((entry) => normalizeText(entry)), 12);
}

function nameSimilarity(left: string, right: string): number {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return 0.92;
  }
  const aTokens = new Set(a.split(" ").filter((token) => token.length >= 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length >= 2));
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(aTokens.size || 1, bTokens.size || 1);
}

function locationMatches(
  properties: GeoapifyPlaceFeature["properties"],
  candidate: GeminiCandidate,
  intent: AskAiMapIntent,
  area: GeoapifyResolvedArea,
  latitude: number,
  longitude: number
): boolean {
  const texts = uniqueStrings([
    normalizeText(properties?.formatted),
    normalizeText(properties?.city),
    normalizeText(properties?.county),
    normalizeText(properties?.state),
    normalizeText(properties?.state_district),
    candidate.cityHint,
    candidate.provinceHint,
    intent.city,
    intent.province,
    area.city,
    area.province,
  ]).map((value) => normalizeKey(value));

  const areaTokens = uniqueStrings([area.label, intent.searchAreaText, intent.city, intent.province]).map((value) =>
    normalizeKey(value)
  );

  const adminMatch = areaTokens.some(
    (token) => token && texts.some((text) => text === token || text.includes(token) || token.includes(text))
  );
  const distanceMatch = getDistanceKm(area.center, { latitude, longitude }) <= area.radiusMeters / 1000 + 5;
  return adminMatch || distanceMatch;
}

function categoryMatches(candidate: GeminiCandidate, categories: string[], intent: AskAiMapIntent): boolean {
  const config = getCategoryConfig(intent.categoryIntent);
  if (!config) {
    return true;
  }
  if (intent.strictCategory) {
    if (!hasRequiredCategory(categories, config.requiredCategoryAny)) {
      return false;
    }
  } else if (!hasRequiredCategory(categories, ["tourism", "leisure", "entertainment", "catering", "commercial.shopping_mall"])) {
    return false;
  }

  if (intent.categoryIntent === "samgyup") {
    const haystack = normalizeKey(
      `${candidate.name} ${candidate.googleMapsTitle ?? ""} ${candidate.categoryHint ?? ""} ${categories.join(" ")}`
    );
    return (config.keywordHints ?? []).some((hint) => haystack.includes(normalizeKey(hint)));
  }
  return true;
}

function toCategoryLabel(categories: string[], fallback?: string | null): string {
  const first = categories[0] ?? fallback ?? "Place";
  return first
    .split(".")
    .slice(-1)[0]
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function geoapifyPlacesSearch(args: {
  categories: string[];
  area: GeoapifyResolvedArea;
  limit: number;
  name?: string;
}): Promise<GeoapifyPlaceFeature[]> {
  const apiKey = await getGeoapifyApiKey();
  const url = new URL(GEOAPIFY_PLACES_ENDPOINT);
  url.searchParams.set("categories", args.categories.join(","));
  url.searchParams.set("filter", args.area.filter);
  if (args.area.bias) {
    url.searchParams.set("bias", args.area.bias);
  }
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", apiKey);
  if (args.name) {
    url.searchParams.set("name", args.name);
  }
  const payload = await fetchJson<{ features?: GeoapifyPlaceFeature[] }>(url, GEOAPIFY_TIMEOUT_MS);
  return Array.isArray(payload.features) ? payload.features : [];
}

async function geoapifyGeocodeSearch(query: string, limit = 5): Promise<GeoapifyGeocodeFeature[]> {
  const apiKey = await getGeoapifyApiKey();
  const url = new URL(GEOAPIFY_GEOCODE_ENDPOINT);
  url.searchParams.set("text", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apiKey", apiKey);
  const payload = await fetchJson<{ features?: GeoapifyGeocodeFeature[] }>(url, GEOAPIFY_TIMEOUT_MS);
  return Array.isArray(payload.features) ? payload.features : [];
}

function buildGeminiVerificationQueries(candidate: GeminiCandidate, intent: AskAiMapIntent, area: GeoapifyResolvedArea): string[] {
  return uniqueStrings([
    candidate.name && intent.searchAreaText ? `${candidate.name}, ${intent.searchAreaText}` : null,
    candidate.googleMapsTitle && intent.searchAreaText ? `${candidate.googleMapsTitle}, ${intent.searchAreaText}` : null,
    candidate.name && candidate.addressHint ? `${candidate.name}, ${candidate.addressHint}` : null,
    candidate.name && (candidate.cityHint || candidate.provinceHint)
      ? `${candidate.name}, ${candidate.cityHint ?? ""}, ${candidate.provinceHint ?? ""}, Philippines`
      : null,
    candidate.addressHint,
    candidate.name && area.label ? `${candidate.name}, ${area.label}` : null,
  ], 6);
}

function getGeoapifyLocationText(feature: GeoapifyGeocodeFeature | GeoapifyPlaceFeature): string {
  const properties = feature.properties ?? {};
  return uniqueStrings([
    normalizeText(properties.formatted),
    normalizeText(properties.address_line1),
    normalizeText(properties.city),
    normalizeText(properties.county),
    normalizeText(properties.state),
    normalizeText(properties.state_district),
  ]).join(", ");
}

function getGeoapifyCoordinates(feature: GeoapifyGeocodeFeature | GeoapifyPlaceFeature) {
  const properties = feature.properties ?? {};
  const latitude = Number(properties.lat);
  const longitude = Number(properties.lon);
  if (!isFiniteCoordinate(latitude, longitude) || !isInPhilippines(latitude, longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function getGeoapifyFeatureName(feature: GeoapifyGeocodeFeature | GeoapifyPlaceFeature): string | null {
  const properties = feature.properties ?? {};
  return (
    normalizeText((properties as Record<string, unknown>).name) ??
    normalizeText(properties.address_line1) ??
    normalizeText(properties.formatted)
  );
}

function buildRelevanceSignals(args: {
  intent: AskAiMapIntent;
  candidate: GeminiCandidate | null;
  name: string;
  locationText: string;
  fromGemini: boolean;
  fromGeocode: boolean;
  categories?: string[];
}): string[] {
  const haystack = normalizeKey(
    `${args.name} ${args.locationText} ${args.candidate?.googleMapsTitle ?? ""} ${args.candidate?.categoryHint ?? ""} ${(args.candidate?.reviewSignals ?? []).join(" ")} ${(args.categories ?? []).join(" ")}`
  );
  const signals = uniqueStrings([
    args.fromGemini ? "google_maps_grounded" : null,
    args.fromGeocode ? "geoapify_coordinate_verified" : "geoapify_verified",
    args.intent.searchAreaText ? "inside_target_area" : null,
    haystack.includes("samgyup") || haystack.includes("samgyupsal") || haystack.includes("samgyeopsal")
      ? "name_contains_samgyup"
      : null,
    haystack.includes("korean bbq") || haystack.includes("kbbq") || haystack.includes("korean grill")
      ? "korean_bbq_signal"
      : null,
    hasRequiredCategory(args.categories ?? [], ["catering.restaurant"]) ? "restaurant_category" : null,
  ]);
  return signals;
}

function buildCategorySignalText(args: {
  intent: AskAiMapIntent;
  candidate?: GeminiCandidate | null;
  name: string;
  categories?: string[];
  locationText?: string | null;
}): string {
  return normalizeKey(
    [
      args.name,
      args.locationText ?? "",
      args.candidate?.googleMapsTitle ?? "",
      args.candidate?.categoryHint ?? "",
      ...(args.candidate?.reasonSignals ?? []),
      ...(args.candidate?.reviewSignals ?? []),
      ...(args.categories ?? []),
    ].join(" ")
  );
}

function getCategoryPositiveSignals(intent: AskAiMapIntent): string[] {
  switch (intent.categoryIntent) {
    case "mall":
      return [
        "mall",
        "shopping center",
        "shopping centre",
        "shopping mall",
        "sm",
        "robinsons",
        "vista mall",
        "ayala malls",
        "waltermart",
        "the district",
        "district mall",
        "nomo",
        "somo",
      ];
    case "cafe":
      return ["cafe", "coffee", "coffee shop", "espresso", "brew", "starbucks", "cbtl", "coffee bean"];
    case "restaurant":
      return ["restaurant", "eatery", "food", "grill", "diner", "kitchen", "bistro"];
    case "park":
      return ["park", "playground", "garden"];
    case "museum":
      return ["museum", "gallery", "heritage"];
    case "hotel":
      return ["hotel", "inn", "suites", "resort", "staycation"];
    case "bar":
      return ["bar", "pub", "taproom"];
    case "karaoke":
      return ["karaoke", "ktv", "videoke"];
    case "samgyup":
      return getKeywordHintsForIntent(intent);
    default:
      return [];
  }
}

function getCategoryNegativeSignals(intent: AskAiMapIntent): string[] {
  switch (intent.categoryIntent) {
    case "mall":
      return ["bank", "barangay hall", "city hall", "municipal hall", "repair", "service center", "church", "school", "hospital"];
    case "cafe":
      return ["bank", "barangay hall", "repair", "hardware", "school", "church", "government"];
    case "restaurant":
    case "samgyup":
      return ["bank", "barangay hall", "repair", "government", "church", "school"];
    case "park":
      return ["bank", "repair", "mall", "hotel", "restaurant"];
    case "museum":
      return ["repair", "bank", "barangay hall", "restaurant"];
    case "hotel":
      return ["bank", "repair", "barangay hall", "school"];
    default:
      return [];
  }
}

function scoreCategoryFit(args: {
  intent: AskAiMapIntent;
  candidate?: GeminiCandidate | null;
  name: string;
  categories?: string[];
  locationText?: string | null;
}): { score: number; obviousMismatch: boolean } {
  const config = getCategoryConfig(args.intent.categoryIntent);
  if (!config) {
    return { score: 0.55, obviousMismatch: false };
  }

  const haystack = buildCategorySignalText(args);
  const positiveSignals = getCategoryPositiveSignals(args.intent).map((value) => normalizeKey(value));
  const negativeSignals = getCategoryNegativeSignals(args.intent).map((value) => normalizeKey(value));

  let score = 0;

  if (hasRequiredCategory(args.categories ?? [], config.requiredCategoryAny)) {
    score += 0.55;
  }

  if (positiveSignals.some((signal) => signal && haystack.includes(signal))) {
    score += 0.35;
  }

  if (args.candidate?.googleMapsUri || args.candidate?.googlePlaceId) {
    score += 0.08;
  }

  if (
    args.candidate?.categoryHint &&
    positiveSignals.some((signal) => normalizeKey(args.candidate?.categoryHint ?? "").includes(signal))
  ) {
    score += 0.1;
  }

  const obviousMismatch =
    negativeSignals.some((signal) => signal && haystack.includes(signal)) &&
    !positiveSignals.some((signal) => signal && haystack.includes(signal)) &&
    !hasRequiredCategory(args.categories ?? [], config.requiredCategoryAny);

  return {
    score: Math.max(0, Math.min(1, score)),
    obviousMismatch,
  };
}

function locationLooksRelevantWithoutGeoapify(candidate: GeminiCandidate, intent: AskAiMapIntent, area: GeoapifyResolvedArea): boolean {
  if (candidate.groundingCoordinates) {
    const distanceKm = getDistanceKm(area.center, candidate.groundingCoordinates);
    if (distanceKm <= area.radiusMeters / 1000 + 5) {
      return true;
    }
  }

  const texts = uniqueStrings([
    candidate.addressHint,
    candidate.cityHint,
    candidate.provinceHint,
    area.label,
    intent.searchAreaText,
    intent.city,
    intent.province,
    area.city,
    area.province,
  ]).map((value) => normalizeKey(value));

  const areaTokens = uniqueStrings([area.label, intent.searchAreaText, intent.city, intent.province]).map((value) =>
    normalizeKey(value)
  );

  return areaTokens.some(
    (token) => token && texts.some((text) => text === token || text.includes(token) || token.includes(text))
  );
}

function buildGeminiTrustedPlace(args: {
  candidate: GeminiCandidate;
  intent: AskAiMapIntent;
  area: GeoapifyResolvedArea;
  confidence: MatchConfidence;
  categoryScore: number;
  distanceKm: number | null;
  coordinates: { latitude: number; longitude: number } | null;
  coordinateSource: "geoapify_coordinate_fill" | "gemini_coordinate_fallback" | "none";
  coordinateConfidence: CoordinateConfidence;
  geoapifyPlaceId?: string | null;
  coordinateDebug?: AskAiMapGroundedPlace["coordinateDebug"];
}): AskAiMapGroundedPlace | null {
  // Pin any place with trustworthy coordinates near the search area, not only exact Geoapify hits.
  const maxDistanceKm = Math.max(30, args.area.radiusMeters / 500);
  const hasCoordinates =
    args.coordinates !== null &&
    args.coordinateSource !== "none" &&
    (args.coordinateConfidence === "high" || args.coordinateConfidence === "medium") &&
    getDistanceKm(args.area.center, args.coordinates) <= maxDistanceKm;
  const displayCategory = args.candidate.categoryHint ?? getDisplayCategoryForIntent(args.intent);
  const whyThisFits =
    args.candidate.whyThisFits ??
    `${args.candidate.name} mukhang relevant sa "${args.intent.rawQuery}" based sa Google Maps grounding details na nakuha para sa area na ito.`;

  const isGeoapifyCoord = args.coordinateSource === "geoapify_coordinate_fill";
  const isGeminiFallback = args.coordinateSource === "gemini_coordinate_fallback";
  const isCardOnly = !hasCoordinates;

  const coordinateStatus: AskAiMapGroundedPlace["coordinateStatus"] =
    isCardOnly ? "missing_coordinates"
    : isGeoapifyCoord ? "geoapify_coordinate_fill"
    : "gemini_coordinate_fallback";

  const hasPin = hasCoordinates;
  const coordConfidence: CoordinateConfidence = isCardOnly ? "none" : args.coordinateConfidence;

  const coordSource: "geoapify" | "gemini_fallback" = isGeoapifyCoord ? "geoapify" : "gemini_fallback";

  const sourceCoordinates: "geoapify_coordinate_fill" | "gemini_coordinate_fallback" | "none" =
    isGeoapifyCoord ? "geoapify_coordinate_fill"
    : isGeminiFallback ? "gemini_coordinate_fallback"
    : "none";

  const base: AskAiMapGroundedPlace = {
    id:
      args.candidate.googlePlaceId
        ? `google:${args.candidate.googlePlaceId}`
        : `google:${slugify(args.candidate.name)}:${hasCoordinates ? args.coordinates!.latitude.toFixed(5) : "no-pin"}:${hasCoordinates ? args.coordinates!.longitude.toFixed(5) : "no-pin"}`,
    name: args.candidate.googleMapsTitle ?? args.candidate.name,
    category: displayCategory,
    address: args.candidate.addressHint,
    hasPin,
    coordinateStatus,
    coordinateConfidence: coordConfidence,
    coordinateDebug: args.coordinateDebug,
    matchConfidence: args.confidence,
    rating: args.candidate.rating,
    reviewCount: args.candidate.reviewCount,
    openingHoursSummary: args.candidate.openingHoursSummary,
    googleMapsUri: args.candidate.googleMapsUri,
    googlePlaceId: args.candidate.googlePlaceId,
    geoapifyPlaceId: args.geoapifyPlaceId ?? null,
    reason: whyThisFits,
    whyThisFits,
    optionalDetails: {
      categoryText: displayCategory,
      addressText: args.candidate.addressHint ?? undefined,
      reviewSignals: args.candidate.reviewSignals,
      openingHoursSummary: args.candidate.openingHoursSummary,
    },
    source: {
      recommendation: "gemini_map_grounding",
      coordinates: sourceCoordinates,
      details: "gemini_map_grounding",
    },
    trust: {
      recommendationSource: "gemini_map_grounding",
      detailsSource: "gemini_map_grounding",
      coordinateSource: isGeoapifyCoord ? "geoapify" : isGeminiFallback ? "gemini" : "none",
      hasUsableCoordinates: hasPin,
      deduped: true,
    },
    verification: {
      nameMatched: true,
      locationMatched: hasPin,
      categoryMatched: true,
      coordinateVerified: isGeoapifyCoord,
    },
    matchScore: Number((82 + args.categoryScore * 10 + (args.confidence === "high" ? 8 : 0)).toFixed(1)),
    distanceKm: args.distanceKm,
    exactMatch: args.confidence === "high",
    mediumMatch: args.confidence === "medium",
    isFallback: false,
    resultTier: classifyResultTier(args.intent, args.candidate.name, [], args.candidate),
    relevanceSignals: buildRelevanceSignals({
      intent: args.intent,
      candidate: args.candidate,
      name: args.candidate.name,
      locationText: args.candidate.addressHint ?? args.area.label,
      fromGemini: true,
      fromGeocode: isGeoapifyCoord,
      categories: [],
    }),
    displayCategory,
    rawCategory: args.candidate.categoryHint ?? displayCategory,
  };

  if (hasPin && args.coordinates) {
    base.lat = args.coordinates.latitude;
    base.lng = args.coordinates.longitude;
    base.latitude = args.coordinates.latitude;
    base.longitude = args.coordinates.longitude;
    base.coordinates = {
      lat: args.coordinates.latitude,
      lng: args.coordinates.longitude,
      latitude: args.coordinates.latitude,
      longitude: args.coordinates.longitude,
      source: coordSource,
      trusted: true,
      verified: true,
      confidence: isGeoapifyCoord ? (args.coordinateConfidence === "high" ? "high" : "medium") : "medium",
    };
  } else {
    base.lat = null;
    base.lng = null;
    base.latitude = null;
    base.longitude = null;
    base.coordinates = null;
  }

  return base;
}

function classifyResultTier(intent: AskAiMapIntent, name: string, categories: string[], candidate?: GeminiCandidate | null): ResultTier {
  const haystack = normalizeKey(
    `${name} ${candidate?.googleMapsTitle ?? ""} ${candidate?.categoryHint ?? ""} ${(candidate?.reasonSignals ?? []).join(" ")} ${(candidate?.reviewSignals ?? []).join(" ")} ${categories.join(" ")}`
  );
  const hints = getKeywordHintsForIntent(intent).map((value) => normalizeKey(value));
  if (hints.some((hint) => hint && haystack.includes(hint))) {
    return "exact";
  }
  if (
    intent.categoryIntent === "samgyup" &&
    ["korean bbq", "kbbq", "korean grill", "korean restaurant"].some((hint) => haystack.includes(normalizeKey(hint)))
  ) {
    return "strong_related";
  }
  if (intent.categoryIntent !== "unknown") {
    const categoryKeyword = normalizeKey(intent.categoryIntent.replace(/_/g, " "));
    if (haystack.includes(categoryKeyword)) {
      return isSoftStrictIntent(intent) ? "strong_related" : "exact";
    }
  }
  return isSoftStrictIntent(intent) ? "nearby_alternative" : "strong_related";
}

type GeoapifyCoordinateFillResult = {
  coordinates: { latitude: number; longitude: number } | null;
  geoapifyPlaceId: string | null;
  confidence: CoordinateConfidence;
  queriesTried: string[];
  selectedQuery?: string;
  source: "geoapify" | "galatayo" | "none";
};

function scoreCoordinateConfidence(args: {
  placeName: string;
  geoapifyFeatureName: string | null;
  geoapifyLocationText: string;
  targetCity: string | null;
  targetProvince: string | null;
  targetAreaLabel: string;
  isNamedResult: boolean;
  isAddressResult: boolean;
  isRoadResult: boolean;
  isCityResult: boolean;
}): CoordinateConfidence {
  const placeNameNorm = normalizeKey(args.placeName);
  const featureNameNorm = normalizeKey(args.geoapifyFeatureName ?? "");
  const areaTextNorm = normalizeKey(
    `${args.geoapifyLocationText} ${args.targetCity ?? ""} ${args.targetProvince ?? ""} ${args.targetAreaLabel}`
  );

  if (args.isRoadResult || args.isCityResult) {
    return "low";
  }

  const nameMatchStrong =
    placeNameNorm.length >= 4 &&
    featureNameNorm.length >= 4 &&
    (placeNameNorm === featureNameNorm ||
     featureNameNorm.includes(placeNameNorm) ||
     placeNameNorm.includes(featureNameNorm));

  const nameOverlap = nameSimilarity(placeNameNorm, featureNameNorm);
  const cityMatch =
    (args.targetCity && areaTextNorm.includes(normalizeKey(args.targetCity))) ||
    (args.targetProvince && areaTextNorm.includes(normalizeKey(args.targetProvince)));

  const targetAreaMatch = areaTextNorm.includes(normalizeKey(args.targetAreaLabel.replace(/\s*,\s*philippines$/i, "")));

  if (nameMatchStrong && cityMatch) {
    return "high";
  }
  if (nameMatchStrong && targetAreaMatch) {
    return "high";
  }
  if (args.isNamedResult && nameOverlap >= 0.7 && (cityMatch || targetAreaMatch)) {
    return "high";
  }
  if (args.isNamedResult && nameOverlap >= 0.55 && (cityMatch || targetAreaMatch)) {
    return "medium";
  }
  if (args.isAddressResult && nameOverlap >= 0.55 && (cityMatch || targetAreaMatch)) {
    return "medium";
  }
  if (nameOverlap >= 0.35 && cityMatch) {
    return "medium";
  }

  return "low";
}

function getGeoapifyFeatureResultType(feature: GeoapifyGeocodeFeature): {
  isNamedResult: boolean;
  isAddressResult: boolean;
  isRoadResult: boolean;
  isCityResult: boolean;
} {
  const properties = feature.properties ?? {};
  const resultType = normalizeText(properties.result_type)?.toLowerCase() ?? "";
  const name = normalizeText((properties as Record<string, unknown>).name) ?? normalizeText(properties.address_line1);

  return {
    isNamedResult: Boolean(name && name.length >= 3),
    isAddressResult: resultType.includes("building") || resultType.includes("amenity") || resultType.includes("street") || Boolean(properties.address_line1),
    isRoadResult: resultType === "street" || resultType === "secondary" || resultType === "primary",
    isCityResult: resultType === "city" || resultType === "suburb" || resultType === "district" || resultType === "administrative",
  };
}

async function fillSinglePlaceCoords(
  candidate: GeminiCandidate,
  intent: AskAiMapIntent,
  area: GeoapifyResolvedArea,
  apiKey: string,
): Promise<GeoapifyCoordinateFillResult> {
  const searchAreaName = intent.searchAreaText ?? area.label;
  const candidateAddress = candidate.addressHint;
  const city = intent.city ?? area.city;
  const province = intent.province ?? area.province;

  const queries: string[] = [];
  const queriesTried: string[] = [];

  if (candidateAddress) {
    queries.push(`${candidate.name}, ${candidateAddress}`);
  }

  queries.push(`${candidate.name}, ${searchAreaName}`);

  if (city || province) {
    queries.push(`${candidate.name}, ${city ?? ""}, ${province ?? ""}, Philippines`);
  }

  queries.push(`${candidate.name}, ${area.label}`);
  queries.push(candidate.name);

  // Two well-aimed queries resolve most places; more only burned the time budget and Geoapify rate limit.
  // Geoapify rarely knows small shops by name, but it does know their street address from Gemini.
  const addressOnlyQuery = candidateAddress ? candidateAddress : null;
  const uniqueQueries = uniqueStrings(addressOnlyQuery ? [queries[0], addressOnlyQuery] : queries, 2);
  const maxAddressDistanceKm = Math.max(30, area.radiusMeters / 500);
  const PER_QUERY_TIMEOUT_MS = 1800;
  const MAX_TOTAL_TIME_MS = 3000;
  const startTime = Date.now();

  const candidates: Array<{
    coordinates: { latitude: number; longitude: number };
    geoapifyPlaceId: string | null;
    confidence: "high" | "medium";
    nameOverlap: number;
    distanceKm: number;
    query: string;
  }> = [];

  for (const query of uniqueQueries) {
    if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
      break;
    }

    queriesTried.push(query);

    try {
      const geocodeFeatures = await withTimeout(
        geoapifyGeocodeSearch(query, 5),
        PER_QUERY_TIMEOUT_MS,
        "Geoapify query timed out"
      );

      for (const feature of geocodeFeatures) {
        const coords = getGeoapifyCoordinates(feature);
        if (!coords) continue;

        const locationText = getGeoapifyLocationText(feature);
        const geoapifyPlaceId = normalizeText(feature.properties?.place_id);
        const resultTypes = getGeoapifyFeatureResultType(feature);
        const featureName = getGeoapifyFeatureName(feature);

        const scored = scoreCoordinateConfidence({
          placeName: candidate.name,
          geoapifyFeatureName: featureName,
          geoapifyLocationText: locationText,
          targetCity: city,
          targetProvince: province,
          targetAreaLabel: area.label,
          isNamedResult: resultTypes.isNamedResult,
          isAddressResult: resultTypes.isAddressResult,
          isRoadResult: resultTypes.isRoadResult,
          isCityResult: resultTypes.isCityResult,
        });

        const nameOverlap = nameSimilarity(normalizeKey(candidate.name), normalizeKey(featureName ?? ""));
        const distanceKm = getDistanceKm(
          coords,
          area.center,
        );
        const addressPin = query === addressOnlyQuery && !resultTypes.isCityResult && distanceKm <= maxAddressDistanceKm;
        const confidence = scored === "low" && addressPin ? "medium" : scored;

        if (confidence === "low") {
          continue;
        }

        candidates.push({
          coordinates: coords,
          geoapifyPlaceId,
          confidence: confidence as "high" | "medium",
          nameOverlap,
          distanceKm,
          query,
        });
      }
    } catch {
      continue;
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence === "high" ? -1 : 1;
      }
      if (a.nameOverlap !== b.nameOverlap) {
        return b.nameOverlap - a.nameOverlap;
      }
      return a.distanceKm - b.distanceKm;
    });

    const best = candidates[0];
    return {
      coordinates: best.coordinates,
      geoapifyPlaceId: best.geoapifyPlaceId,
      confidence: best.confidence,
      queriesTried,
      selectedQuery: best.query,
      source: "geoapify",
    };
  }

  return {
    coordinates: null,
    geoapifyPlaceId: null,
    confidence: "none",
    queriesTried,
    source: "none",
  };
}

function getCandidateKey(candidate: GeminiCandidate, area: GeoapifyResolvedArea) {
  return normalizeKey(`${candidate.name}|${area.label}`);
}

type GalaTayoMatch = { coordinates: { latitude: number; longitude: number }; path: string };

/** Gemini candidates that are also GalaTayo places near the search area, keyed like the coordinate fill cache. */
async function matchGalaTayoPlaces(candidates: GeminiCandidate[], area: GeoapifyResolvedArea): Promise<Map<string, GalaTayoMatch>> {
  const maxDistanceKm = Math.max(30, area.radiusMeters / 500);
  const nearby = (await getActiveNormalizedPlaces()).filter(
    (place) =>
      place.latitude != null &&
      place.longitude != null &&
      getDistanceKm(area.center, { latitude: place.latitude, longitude: place.longitude }) <= maxDistanceKm
  );
  const matches = new Map<string, GalaTayoMatch>();
  for (const candidate of candidates) {
    const place = nearby.find((entry) => nameSimilarity(entry.name, candidate.googleMapsTitle ?? candidate.name) >= 0.9);
    if (!place) continue;
    matches.set(getCandidateKey(candidate, area), {
      coordinates: { latitude: place.latitude!, longitude: place.longitude! },
      path: `/places/${encodeURIComponent(resolveAreaSlug(place.city, place.area).slug)}/${encodeURIComponent(place.slug)}`,
    });
  }
  return matches;
}
async function batchGeoapifyCoordinateFill(
  candidates: GeminiCandidate[],
  intent: AskAiMapIntent,
  area: GeoapifyResolvedArea,
  logger?: AskAiMapsLogger
): Promise<Map<string, GeoapifyCoordinateFillResult>> {
  const results = new Map<string, GeoapifyCoordinateFillResult>();
  if (candidates.length === 0) return results;

  let apiKey: string;
  try {
    apiKey = await getGeoapifyApiKey();
  } catch {
    return results;
  }

  const TOTAL_FILL_TIMEOUT_MS = 3500;
  const fillStartedAt = Date.now();

  const fillTasks = candidates.map(async (candidate) => {
    const key = getCandidateKey(candidate, area);
    const result = await fillSinglePlaceCoords(candidate, intent, area, apiKey);
    results.set(key, result);
    return result;
  });

  try {
    await withTimeout(
      Promise.all(fillTasks),
      TOTAL_FILL_TIMEOUT_MS,
      "Geoapify coordinate fill batch timed out"
    );
  } catch {
    logger?.log("[AskAiMaps] coordinate_fill_batch_timeout_or_error");
  }

  const fillDuration = Date.now() - fillStartedAt;
  logger?.log(`[AskAI Maps Timing] geoapify_coordinate_fill_duration_ms=${fillDuration} candidates=${candidates.length} resolved=${results.size}`);

  return results;
}

async function verifyCandidateWithGeoapify(
  candidate: GeminiCandidate,
  intent: AskAiMapIntent,
  area: GeoapifyResolvedArea,
  fillResultCache: Map<string, GeoapifyCoordinateFillResult>,
  logger?: AskAiMapsLogger
): Promise<VerificationResult> {
  const cacheKey = getCandidateKey(candidate, area);
  const fillResult = fillResultCache.get(cacheKey);

  const candidateCategoryScore = scoreCategoryFit({
    intent,
    candidate,
    name: candidate.name,
    categories: [],
    locationText: candidate.addressHint,
  }).score;

  const resolvePlace = (
    coordinates: { latitude: number; longitude: number } | null,
    coordinateSource: "geoapify_coordinate_fill" | "gemini_coordinate_fallback" | "none",
    coordinateConfidence: CoordinateConfidence,
    geoapifyPlaceId?: string | null,
    coordinateDebug?: AskAiMapGroundedPlace["coordinateDebug"]
  ): VerificationResult => {
    const distanceKm = coordinates && coordinateSource === "geoapify_coordinate_fill"
      ? Number(getDistanceKm(area.center, coordinates).toFixed(2))
      : null;

    const trustedPlace = buildGeminiTrustedPlace({
      candidate,
      intent,
      area,
      confidence: candidateCategoryScore >= 0.58 ? "high" : "medium",
      categoryScore: candidateCategoryScore,
      distanceKm,
      coordinates,
      coordinateSource,
      coordinateConfidence,
      geoapifyPlaceId,
      coordinateDebug,
    });

    if (trustedPlace) {
      logger?.log(
        `[AskAiMaps] coord_fill name="${candidate.name}" coordinateSource=${coordinateSource} confidence=${coordinateConfidence} hasPin=${trustedPlace.hasPin}`
      );
      return { accepted: true, place: trustedPlace };
    }

    return { accepted: false, rejectionReason: "failed_to_build_place" };
  };

  if (fillResult && fillResult.confidence !== "none" && fillResult.coordinates) {
    return resolvePlace(
      fillResult.coordinates,
      "geoapify_coordinate_fill",
      fillResult.confidence,
      fillResult.geoapifyPlaceId,
      { queriesTried: fillResult.queriesTried, selectedQuery: fillResult.selectedQuery, source: fillResult.source }
    );
  }

  if (fillResult && fillResult.confidence === "none") {
    if (candidate.groundingCoordinates) {
      return resolvePlace(
        candidate.groundingCoordinates,
        "gemini_coordinate_fallback",
        "medium",
        null,
        { queriesTried: fillResult.queriesTried, source: "gemini_fallback", reason: "geoapify_not_found_using_gemini_coords" }
      );
    }

    return resolvePlace(
      null,
      "none",
      "none",
      null,
      { queriesTried: fillResult.queriesTried, source: "none", reason: "no_coordinates_available" }
    );
  }

  if (candidate.groundingCoordinates) {
    return resolvePlace(
      candidate.groundingCoordinates,
      "gemini_coordinate_fallback",
      "medium",
      null,
      { queriesTried: [], source: "gemini_fallback", reason: "no_geoapify_result_using_gemini" }
    );
  }

  return resolvePlace(
    null,
    "none",
    "none",
    null,
    { queriesTried: [], source: "none", reason: "no_coordinates_available" }
  );
}

function rankVerifiedPlaces(places: AskAiMapGroundedPlace[], intent: AskAiMapIntent): AskAiMapGroundedPlace[] {
  const hints = [intent.categoryIntent, ...intent.galaIntents].map((value) => normalizeKey(value));
  return [...places]
    .map((place) => {
      const haystack = normalizeKey(`${place.name} ${place.category ?? ""} ${place.address ?? ""}`);
      let score = place.matchScore ?? 0;
      for (const hint of hints) {
        if (hint && haystack.includes(hint)) {
          score += 8;
        }
      }
      if (place.matchConfidence === "high") {
        score += 12;
      }
      return { ...place, matchScore: score };
    })
    .sort((left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0));
}

function getPlaceDetailSummary(place: AskAiMapGroundedPlace): string {
  const details = place.optionalDetails ?? {};
  const parts = [
    details.categoryText ?? place.category ?? place.displayCategory ?? null,
    details.addressText ?? place.address ?? null,
    details.openingHoursSummary ?? details.hoursText ?? null,
    typeof place.rating === "number" && Number.isFinite(place.rating)
      ? `${place.rating.toFixed(1)} rating`
      : details.ratingText ?? null,
    typeof place.reviewCount === "number" && Number.isFinite(place.reviewCount)
      ? `${place.reviewCount} reviews`
      : details.reviewCountText ?? null,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

  return parts.slice(0, 3).join(", ");
}

type WhyThisFitsMatchMode = "direct" | "secondary" | "budget-flexible";

type WhyThisFitsInput = {
  originalUserPrompt: string;
  normalizedUserIntent: string;
  placeName: string;
  placeType: string;
  foodActivityIntent: string;
  queryFocus: string;
  constraintSummary: string[];
  budgetAmount: number | null;
  budgetIntent: AskAiMapIntent["budgetIntent"];
  wantsBudget: boolean;
  wantsHighRating: boolean;
  wantsWalkable: boolean;
  wantsNearby: boolean;
  wantsOpenNow: boolean;
  matchMode: WhyThisFitsMatchMode;
};

type AskAiMapPromptConstraints = {
  queryFocus: string;
  constraints: string[];
  wantsBudget: boolean;
  wantsHighRating: boolean;
  wantsWalkable: boolean;
  wantsNearby: boolean;
  wantsOpenNow: boolean;
};

function hasExplicitBudgetIntentValue(value: AskAiMapIntent["budgetIntent"]): boolean {
  return value === "free" || value === "low_cost" || value === "free_or_low_cost";
}

function hasBudgetMention(intent: Pick<AskAiMapIntent, "budgetAmount" | "budgetIntent" | "budgetPerPerson">): boolean {
  return (
    hasExplicitBudgetIntentValue(intent.budgetIntent) ||
    typeof intent.budgetAmount === "number"
  );
}

function hasBudgetTermInText(text: string): boolean {
  return /\b(mura|murang|budget|tipid|affordable|cheap|di mahal|hindi mahal|student budget|sulit|promo|promos|libre|free|walang pera|wlang pera)\b/i.test(text);
}

function hasExplicitBudgetAmountInText(text: string): boolean {
  return /(?:₱|php|peso|pesos)\s*\d{2,5}\b|\b\d{2,5}\s*(?:php|pesos?|per head|per person|per tao)\b|\b(?:under|below|max|maximum|less than|hanggang)\s*(?:₱|php)?\s*\d{2,5}\b/i.test(text);
}

function detectPromptConstraints(intent: AskAiMapIntent): AskAiMapPromptConstraints {
  const rawPrompt = normalizeText(intent.rawQuery) ?? "";
  const normalizedPrompt = normalizeKey(`${intent.rawQuery} ${intent.normalizedQuery} ${intent.galaIntents.join(" ")}`);
  const budgetText = `${intent.rawQuery} ${intent.normalizedQuery}`;
  const normalizedQueryOnly = normalizeKey(intent.normalizedQuery || intent.rawQuery);
  const wantsBudget =
    hasBudgetTermInText(budgetText) ||
    hasExplicitBudgetAmountInText(budgetText) ||
    (hasExplicitBudgetIntentValue(intent.budgetIntent) && hasBudgetTermInText(rawPrompt));
  const wantsHighRating = /\b(highly rated|well rated|top rated|mataas rating|maganda rating|maraming review|maraming reviews|many reviews|good reviews|best|recommended)\b/i.test(normalizedPrompt);
  const wantsWalkable = /\b(walkable|walking distance|kayang lakarin|lakarin|short walk|by foot|on foot)\b/i.test(normalizedPrompt);
  const wantsNearby = wantsWalkable || /\b(near|nearby|malapit|around|within|close to)\b/i.test(normalizedPrompt);
  const wantsOpenNow = /\b(open now|bukas ngayon|currently open|open pa)\b/i.test(normalizedPrompt);
  const activityMatches = [
    rawPrompt.match(/\b(?:eat|eating|kain|kumain|food|craving|places to eat)\s+([a-zA-Z][a-zA-Z0-9 '&-]{2,40})/i)?.[1],
    rawPrompt.match(/\b(?:for|pang|para sa)\s+([a-zA-Z][a-zA-Z0-9 '&-]{2,40})/i)?.[1],
  ]
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value));
  const explicitFocus =
    activityMatches.find((value) => !/\b(budget|mura|highly rated|near|nearby|walk|lakarin|open|now|lang|pero|still|here)\b/i.test(value)) ??
    intent.normalizedQuery.match(/^(.*?)(?:\s+\b(?:in|near|around|within|sa)\b|$)/i)?.[1] ??
    normalizedQueryOnly;
  const queryFocus =
    normalizeText(explicitFocus)?.replace(/\s+/g, " ").slice(0, 80) ||
    getFoodOrActivityIntentLabel(intent);

  return {
    queryFocus,
    constraints: uniqueStrings([
      queryFocus ? `intent=${queryFocus}` : null,
      wantsBudget ? "budget-aware" : null,
      wantsHighRating ? "highly-rated" : null,
      wantsWalkable ? "walkable" : wantsNearby ? "nearby" : null,
      wantsOpenNow ? "open-now" : null,
      ...intent.galaIntents,
    ], 8),
    wantsBudget,
    wantsHighRating,
    wantsWalkable,
    wantsNearby,
    wantsOpenNow,
  };
}

function getFoodOrActivityIntentLabel(intent: AskAiMapIntent): string {
  const explicitIntent = intent.galaIntents
    .map((value) => normalizeText(value))
    .find((value): value is string => Boolean(value));
  if (explicitIntent) {
    return explicitIntent;
  }

  switch (intent.categoryIntent) {
    case "samgyup":
      return "samgyup";
    case "cafe":
      return "cafe stop";
    case "mall":
      return "mall run";
    case "restaurant":
      return "food trip";
    case "park":
      return "park visit";
    case "cinema":
      return "movie time";
    case "museum":
      return "museum visit";
    case "hotel":
      return "staycation";
    case "resort":
      return "resort day";
    case "tourist_spot":
      return "sightseeing";
    case "activity":
      return "activity";
    case "bar":
      return "night out";
    case "karaoke":
      return "karaoke night";
    default:
      return "your search";
  }
}

function getPlaceTypeLabel(intent: AskAiMapIntent): string {
  switch (intent.categoryIntent) {
    case "samgyup":
      return "wings/grill";
    case "cafe":
      return "cafe";
    case "mall":
      return "mall";
    case "restaurant":
      return "food spot";
    case "park":
      return "park";
    case "cinema":
      return "cinema";
    case "museum":
      return "museum";
    case "hotel":
      return "hotel";
    case "resort":
      return "resort";
    case "tourist_spot":
      return "sightseeing spot";
    case "activity":
      return "activity spot";
    case "bar":
      return "bar";
    case "karaoke":
      return "karaoke spot";
    default:
      return "place";
  }
}

function classifyWhyThisFitsMatchMode(place: AskAiMapGroundedPlace, intent: AskAiMapIntent): WhyThisFitsMatchMode {
  if (
    hasBudgetMention(intent) &&
    typeof intent.budgetAmount === "number" &&
    Number.isFinite(intent.budgetAmount) &&
    intent.budgetAmount <= 300
  ) {
    return "budget-flexible";
  }

  return place.matchConfidence === "high" ? "direct" : "secondary";
}

function inferWhyThisFitsBudgetTier(
  intent: Pick<AskAiMapIntent, "budgetAmount" | "budgetIntent" | "budgetPerPerson">
): "within" | "near" | "over" | "unknown" {
  if (!hasBudgetMention(intent)) {
    return "unknown";
  }

  if (intent.budgetIntent === "free") {
    return "within";
  }

  if (typeof intent.budgetAmount !== "number" || !Number.isFinite(intent.budgetAmount)) {
    return "unknown";
  }

  const amount = Math.round(intent.budgetAmount);

  if (amount <= 250) {
    return "over";
  }

  if (amount <= 500) {
    return "near";
  }

  if (amount <= 800) {
    return "within";
  }

  return "within";
}

function buildWhyThisFitsInput(place: AskAiMapGroundedPlace, intent: AskAiMapIntent): WhyThisFitsInput {
  const promptConstraints = detectPromptConstraints(intent);
  return {
    originalUserPrompt: normalizeText(intent.rawQuery) ?? "",
    normalizedUserIntent: normalizeText(intent.normalizedQuery) ?? normalizeText(intent.rawQuery) ?? "",
    placeName: normalizeText(place.name) ?? "This place",
    placeType: getPlaceTypeLabel(intent),
    foodActivityIntent: getFoodOrActivityIntentLabel(intent),
    queryFocus: promptConstraints.queryFocus,
    constraintSummary: promptConstraints.constraints,
    budgetAmount:
      typeof intent.budgetAmount === "number" && Number.isFinite(intent.budgetAmount)
        ? Math.round(intent.budgetAmount)
        : null,
    budgetIntent: intent.budgetIntent ?? "unknown",
    wantsBudget: promptConstraints.wantsBudget,
    wantsHighRating: promptConstraints.wantsHighRating,
    wantsWalkable: promptConstraints.wantsWalkable,
    wantsNearby: promptConstraints.wantsNearby,
    wantsOpenNow: promptConstraints.wantsOpenNow,
    matchMode: classifyWhyThisFitsMatchMode(place, intent),
  };
}

function buildWhyThisFitsBudgetSentence(input: WhyThisFitsInput): string {
  if (
    !hasBudgetMention({
      budgetAmount: input.budgetAmount,
      budgetIntent: input.budgetIntent,
      budgetPerPerson: Boolean(input.budgetAmount),
    })
  ) {
    return "";
  }

  const budgetTier = inferWhyThisFitsBudgetTier({
    budgetAmount: input.budgetAmount,
    budgetIntent: input.budgetIntent,
    budgetPerPerson: Boolean(input.budgetAmount),
  });
  const budgetLabel =
    typeof input.budgetAmount === "number"
      ? `\u20B1${input.budgetAmount}`
      : null;

  if (budgetTier === "within") {
    return budgetLabel
      ? `Budget-wise, likely pasok or practical siya for your ${budgetLabel} budget.`
      : "Budget-wise, likely practical siya for your plan.";
  }

  if (budgetTier === "near") {
    return "Budget-wise, possible siya pero keep a little extra for add-ons.";
  }

  if (budgetTier === "over") {
    return "Budget-wise, baka kailangan mong magdagdag, so better siya if flexible ang budget.";
  }

  return "Budget-wise, treat it as a possible match rather than a guaranteed cheapest pick.";
}

function buildWhyThisFitsFromInput(input: WhyThisFitsInput): string {
  const budgetSentence = buildWhyThisFitsBudgetSentence(input);
  const relatedLabel = input.placeType === "place" ? "related spots" : `related ${input.placeType} spots`;

  if (input.matchMode === "direct") {
    return budgetSentence
      ? `Strong match ito for ${input.foodActivityIntent} since focused siya sa hinahanap mong craving. ${budgetSentence}`
      : `Strong match ito for ${input.foodActivityIntent} since focused siya sa hinahanap mong craving.`;
  }

  if (input.matchMode === "budget-flexible") {
    return budgetSentence
      ? `Good option ito if open ka pa rin sa ${input.foodActivityIntent} pero okay lang sa'yo ang extra budget. ${budgetSentence}`
      : `Good option ito if open ka pa rin sa ${input.foodActivityIntent} pero okay lang sa'yo ang extra budget.`;
  }

  return budgetSentence
    ? `Possible option ito if open ka sa ${relatedLabel}, not strictly ${input.foodActivityIntent} lang. ${budgetSentence}`
    : `Possible option ito if open ka sa ${relatedLabel}, not strictly ${input.foodActivityIntent} lang.`;
}

function formatWhyThisFitsDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
}

function getWhyThisFitsEmoji(intent: AskAiMapIntent): string {
  switch (intent.categoryIntent) {
    case "mall":
      return " 🛍️";
    case "restaurant":
    case "samgyup":
      return " 🍽️";
    case "cafe":
      return " ☕";
    case "park":
      return " 🌿";
    case "cinema":
      return " 🎬";
    case "museum":
      return " 🖼️";
    case "hotel":
    case "resort":
      return " 🧳";
    case "bar":
    case "karaoke":
      return " 🎤";
    case "activity":
    case "tourist_spot":
      return " ✨";
    default:
      return " 📍";
  }
}

function appendWhyThisFitsEmoji(text: string, intent: AskAiMapIntent): string {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) {
    return "";
  }
  if (/\p{Extended_Pictographic}/u.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}${getWhyThisFitsEmoji(intent)}`;
}

function getShortPlaceArea(place: AskAiMapGroundedPlace): string | null {
  const address = normalizeText(place.address ?? place.optionalDetails?.addressText);
  if (!address) {
    return null;
  }

  const parts = address
    .split(",")
    .map((part) => normalizeText(part))
    .filter((part): part is string => Boolean(part));

  const usefulParts = parts.filter((part) => !/^philippines$/i.test(part));
  if (usefulParts.length >= 2) {
    return usefulParts.slice(-2).join(", ");
  }
  return usefulParts[0] ?? null;
}

function getPlaceSpecificEvidenceSentence(place: AskAiMapGroundedPlace): string {
  const category = normalizeText(place.displayCategory ?? place.category ?? place.optionalDetails?.categoryText);
  const area = getShortPlaceArea(place);
  const details = uniqueStrings([category, area], 2);

  if (details.length >= 2) {
    return `Mapped siya as ${details[0]} around ${details[1]}, so connected siya sa hinahanap mong area.`;
  }

  if (details.length === 1) {
    return `Mapped siya as ${details[0]}, so relevant siya as a shortlist result.`;
  }

  return "May usable map result siya, pero limited ang extra details.";
}

function getRatingEvidenceSentence(place: AskAiMapGroundedPlace, input: WhyThisFitsInput): string | null {
  if (!input.wantsHighRating) {
    return null;
  }

  const hasRating = typeof place.rating === "number" && Number.isFinite(place.rating);
  const hasReviews = typeof place.reviewCount === "number" && Number.isFinite(place.reviewCount) && place.reviewCount > 0;

  if (hasRating && hasReviews) {
    return `Rating-wise, promising siya sa Maps with ${place.rating!.toFixed(1)} stars and ${Math.round(place.reviewCount!)} reviews.`;
  }

  if (hasRating) {
    return `Rating-wise, may ${place.rating!.toFixed(1)} stars siya sa Maps, pero check reviews pa rin bago pumunta.`;
  }

  return "Rating-wise, hindi malinaw sa available map data, so treat it as shortlist option muna.";
}

function getAccessEvidenceSentence(place: AskAiMapGroundedPlace, input: WhyThisFitsInput): string | null {
  if (!input.wantsWalkable && !input.wantsNearby) {
    return null;
  }

  const distanceKm = typeof place.distanceKm === "number" && Number.isFinite(place.distanceKm)
    ? place.distanceKm
    : null;

  if (input.wantsWalkable) {
    if (distanceKm !== null && distanceKm <= 1.2) {
      return `Access-wise, mukhang walkable siya at around ${formatWhyThisFitsDistance(distanceKm)} from the search area, pero check actual route and crossings.`;
    }

    if (distanceKm !== null) {
      return `Access-wise, around ${formatWhyThisFitsDistance(distanceKm)} siya from the search area, so check if kaya lakarin or mas okay ang short ride.`;
    }

    return "Access-wise, near siya sa requested search area, pero check map directions muna kung kayang lakarin.";
  }

  if (distanceKm !== null) {
    return `Location-wise, relevant siya sa nearby search mo at around ${formatWhyThisFitsDistance(distanceKm)} from the search area.`;
  }

  return "Location-wise, relevant siya sa requested search area based on the map result.";
}

function getBudgetEvidenceSentence(input: WhyThisFitsInput): string | null {
  if (!input.wantsBudget) {
    return null;
  }

  const budgetLabel = typeof input.budgetAmount === "number" ? `PHP ${input.budgetAmount}` : "budget";
  return `Budget-wise, possible ${budgetLabel} shortlist siya, pero check current prices or promos since wala tayong verified live menu/rate.`;
}

function getOpenNowEvidenceSentence(place: AskAiMapGroundedPlace, input: WhyThisFitsInput): string | null {
  if (!input.wantsOpenNow) {
    return null;
  }

  const hoursText =
    normalizeText(place.openingHoursSummary) ??
    normalizeText(place.optionalDetails?.openingHoursSummary) ??
    normalizeText(place.optionalDetails?.hoursText);

  return hoursText
    ? `Schedule-wise, may map hours info na "${hoursText}", pero verify pa rin before leaving.`
    : "Schedule-wise, check current hours muna since live open status is not clearly verified here.";
}

function getGeneralEvidenceSentence(place: AskAiMapGroundedPlace, input: WhyThisFitsInput): string | null {
  if (input.wantsBudget || input.wantsWalkable || input.wantsNearby || input.wantsOpenNow || input.wantsHighRating) {
    return null;
  }

  if (typeof place.rating === "number" && Number.isFinite(place.rating)) {
    const reviews =
      typeof place.reviewCount === "number" && Number.isFinite(place.reviewCount) && place.reviewCount > 0
        ? ` with ${Math.round(place.reviewCount)} reviews`
        : "";
    return `May visible Maps rating din siya na ${place.rating.toFixed(1)}${reviews}, useful pang-compare sa ibang options.`;
  }

  if (typeof place.distanceKm === "number" && Number.isFinite(place.distanceKm)) {
    return `Distance-wise, around ${formatWhyThisFitsDistance(place.distanceKm)} siya from the search area, useful for comparing nearby options.`;
  }

  return "Good siyang i-check beside the other results para makita mo which one fits your exact lakad better.";
}

function buildGroundedWhyThisFits(place: AskAiMapGroundedPlace, intent: AskAiMapIntent): string {
  const input = buildWhyThisFitsInput(place, intent);
  const placeSpecificEvidence = getPlaceSpecificEvidenceSentence(place);
  const directText =
    input.matchMode === "direct"
      ? `Pasok siya sa ${input.queryFocus || input.foodActivityIntent} search mo based on the map result. ${placeSpecificEvidence}`
      : `Related option siya for ${input.queryFocus || input.foodActivityIntent}, so okay siyang i-check kung flexible ka sa exact place type. ${placeSpecificEvidence}`;
  const prioritySentences = uniqueStrings([
    directText,
    getBudgetEvidenceSentence(input),
    getAccessEvidenceSentence(place, input),
    getOpenNowEvidenceSentence(place, input),
    getRatingEvidenceSentence(place, input),
    getGeneralEvidenceSentence(place, input),
  ], 4);

  return appendWhyThisFitsEmoji(prioritySentences.slice(0, 3).join(" "), intent);
}

function sentenceLooksLikeMetadata(sentence: string, place: AskAiMapGroundedPlace): boolean {
  const normalizedSentence = normalizeKey(sentence);
  if (!normalizedSentence) {
    return true;
  }

  const placeMetadataCandidates = [
    place.address,
    place.category,
    place.displayCategory,
    place.rawCategory,
    place.optionalDetails?.categoryText,
    place.optionalDetails?.addressText,
    place.optionalDetails?.ratingText,
    place.optionalDetails?.reviewCountText,
    place.optionalDetails?.openStatusText,
    place.optionalDetails?.hoursText,
    place.openingHoursSummary,
  ]
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value));

  const directMetadataPatterns = [
    /\b(?:formatted address|coordinates?|latitude|longitude|place id|cid|google maps uri|maps grounding)\b/i,
    /^(?:address|opening hours|hours?|rating|review count|reviews?|open now|closed now)\s*:/i,
    /\b(?:Metro Manila, Philippines|Philippines|Manila|Makati|Pasay|Paranaque|Parañaque|Pasig|Taguig|Quezon City)\b/i,
    /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i,
    /\b(?:AM|PM)\b/i,
    /,\s*\d{4}\b/,
    /\b\d{4}\s+(?:Metro Manila|Philippines)\b/i,
    /@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/,
    /https?:\/\/\S+/i,
  ];

  if (directMetadataPatterns.some((pattern) => pattern.test(sentence))) {
    return true;
  }

  if (placeMetadataCandidates.some((candidate) => candidate && normalizedSentence.includes(normalizeKey(candidate)))) {
    return true;
  }

  const categoryOnlyPhrasePattern =
    /^(?:[a-z&' -]+(?:restaurant|chicken wings restaurant|cafe|coffee shop|food spot|mall|park|museum|hotel|resort|bar|karaoke spot|activity spot))$/i;
  if (categoryOnlyPhrasePattern.test(sentence.trim())) {
    return true;
  }

  return false;
}

function hasUnsupportedExperienceClaims(text: string, place: AskAiMapGroundedPlace): boolean {
  const normalizedText = normalizeKey(text);
  if (!normalizedText) {
    return true;
  }

  const evidenceText = normalizeKey(
    [
      place.name,
      place.category,
      place.displayCategory,
      place.rawCategory,
      place.address,
      place.openingHoursSummary,
      place.optionalDetails?.categoryText,
      place.optionalDetails?.addressText,
      place.optionalDetails?.hoursText,
      ...(place.optionalDetails?.reviewSignals ?? []),
      ...(place.relevanceSignals ?? []),
    ].filter(Boolean).join(" ")
  );

  const unsupportedPatterns: Array<{ pattern: RegExp; evidence: RegExp }> = [
    { pattern: /\b(rich broth|creamy broth|savory broth|authentic broth|masarap na broth|mapapa umay|noodle texture)\b/i, evidence: /\b(broth|noodle texture|review)\b/i },
    { pattern: /\b(generous toppings|loaded toppings|malaki serving|big servings|sulit serving|portion)\b/i, evidence: /\b(topping|serving|portion|review)\b/i },
    { pattern: /\b(cozy seating|cozy seats|modern interior|open kitchen|japanese decor|lively atmosphere|open dining|instagrammable interior|aesthetic interior)\b/i, evidence: /\b(cozy|interior|decor|atmosphere|dining|aesthetic|review)\b/i },
    { pattern: /\b(student budget|presyo na kaya ng student|mababa ang presyo|hindi mahal|cheap menu|affordable menu)\b/i, evidence: /\b(menu|price|promo|budget|affordable|cheap|mura)\b/i },
  ];

  return unsupportedPatterns.some(({ pattern, evidence }) => pattern.test(text) && !evidence.test(evidenceText));
}

function mentionsBudgetOrPrice(text: string): boolean {
  return /\b(budget|price|prices|pricing|presyo|mura|murang|cheap|affordable|promo|promos|rate|rates|student budget|low-cost|low cost|tipid|sulit)\b/i.test(text);
}

function sanitizeWhyThisFits(text: string, place: AskAiMapGroundedPlace, intent: AskAiMapIntent): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);

  const safeSentences = sentences.filter((sentence) => !sentenceLooksLikeMetadata(sentence, place));
  const cleaned = normalizeWhitespace(safeSentences.join(" "));
  if (!cleaned) {
    return "";
  }

  if (sentenceLooksLikeMetadata(cleaned, place)) {
    return "";
  }

  if (hasUnsupportedExperienceClaims(cleaned, place)) {
    return "";
  }

  const promptConstraints = detectPromptConstraints(intent);
  if (!promptConstraints.wantsBudget && mentionsBudgetOrPrice(cleaned)) {
    return "";
  }

  return appendWhyThisFitsEmoji(cleaned, intent);
}

function buildWhyThisFitsFallback(input: WhyThisFitsInput): string {
  const budgetSentence = buildWhyThisFitsBudgetSentence(input);

  if (input.matchMode === "direct") {
    return budgetSentence
      ? `Strong match ito for ${input.foodActivityIntent} since focused siya sa hinahanap mong craving. ${budgetSentence}`
      : `Strong match ito for ${input.foodActivityIntent} since focused siya sa hinahanap mong craving.`;
  }

  if (input.matchMode === "budget-flexible") {
    return budgetSentence
      ? `Good option ito if open ka pa rin sa ${input.foodActivityIntent} pero okay lang sa'yo ang extra budget. ${budgetSentence}`
      : `Good option ito if open ka pa rin sa ${input.foodActivityIntent} pero okay lang sa'yo ang extra budget.`;
  }

  return budgetSentence
    ? `Possible option ito if open ka sa related ${input.placeType} spots, not strictly ${input.foodActivityIntent} lang. ${budgetSentence}`
    : `Possible option ito if open ka sa related ${input.placeType} spots, not strictly ${input.foodActivityIntent} lang.`;
}

function getBudgetAmountLabel(intent: AskAiMapIntent): string | null {
  if (typeof intent.budgetAmount !== "number" || !Number.isFinite(intent.budgetAmount)) {
    return null;
  }

  const amount = Math.round(intent.budgetAmount);
  return intent.budgetPerPerson ? `₱${amount}/head` : `₱${amount}`;
}

function inferBudgetFitTier(
  place: AskAiMapGroundedPlace,
  intent: AskAiMapIntent
): "within" | "near" | "over" | "unknown" {
  if (intent.budgetIntent === "free") {
    return "within";
  }

  if (typeof intent.budgetAmount !== "number" || !Number.isFinite(intent.budgetAmount)) {
    return "unknown";
  }

  const amount = intent.budgetAmount;
  const haystack = normalizeKey(
    `${place.name} ${place.category ?? ""} ${place.displayCategory ?? ""} ${place.rawCategory ?? ""} ${place.address ?? ""} ${place.optionalDetails?.categoryText ?? ""} ${place.optionalDetails?.addressText ?? ""}`
  );
  const directMatch = /wing|wings|chicken wings|buffet|unli|unlimited|restaurant|food|eatery|kainan|diner/i.test(haystack);
  const premiumSignals = /premium|fine dining|hotel|resort|steak|lobster/i.test(haystack);

  if (premiumSignals && amount < 1000) {
    return "over";
  }

  if (intent.budgetIntent === "low_cost" || intent.budgetIntent === "free_or_low_cost") {
    if (amount <= 300) return directMatch ? "near" : "over";
    return directMatch ? "within" : "near";
  }

  if (amount <= 300) {
    return directMatch ? "near" : "over";
  }

  if (amount <= 500) {
    return directMatch ? "within" : "near";
  }

  if (amount <= 800) {
    return directMatch ? "within" : "near";
  }

  return directMatch ? "within" : "unknown";
}

function buildBudgetExplanationSuffixForPlace(
  place: AskAiMapGroundedPlace,
  intent: AskAiMapIntent
): string {
  const budgetMentioned =
    (intent.budgetIntent && intent.budgetIntent !== "unknown") ||
    typeof intent.budgetAmount === "number" ||
    Boolean(intent.budgetPerPerson);

  if (!budgetMentioned) {
    return "";
  }

  const budgetLabel = getBudgetAmountLabel(intent);
  const placeSummary = getPlaceDetailSummary(place);
  const budgetFitTier = inferBudgetFitTier(place, intent);
  const directIntentMatch = /wing|wings|chicken wings|buffet|unli|unlimited/i.test(
    normalizeKey(`${place.name} ${place.category ?? ""} ${place.displayCategory ?? ""} ${place.rawCategory ?? ""} ${place.optionalDetails?.categoryText ?? ""}`)
  );

  if (intent.budgetIntent === "free") {
    const activityText =
      /mall|cafe|park|shopping|tourist/i.test(
        normalizeKey(`${place.name} ${place.category ?? ""} ${place.displayCategory ?? ""}`)
      )
        ? "Window shopping, tambay, and enjoying the aircon are the low-cost parts here."
        : "This is more of a browse-and-check spot, but food or extras can still add up.";

    return ` Budget fit: good for low-cost gala. ${activityText} Food, parking, cinema, and shopping may still cost money.`;
  }

  if (!budgetLabel) {
    return ` Budget fit: not clearly shown on Maps, so this is a possible match, not a guaranteed budget pick.${placeSummary ? ` ${placeSummary}.` : ""}`;
  }

  if (budgetFitTier === "within") {
    return ` Budget fit: likely pasok sa ${budgetLabel}. ${directIntentMatch ? "Direct match siya sa hinahanap mong type of place." : "Relevant siya sa prompt mo."}${placeSummary ? ` ${placeSummary}.` : ""}`;
  }

  if (budgetFitTier === "near") {
    return ` Budget fit: near ${budgetLabel}, pero expect possible dagdag if may drinks, sides, upgrades, or service fees. ${directIntentMatch ? "Good match siya for the craving/activity." : "Relevant pa rin siya as a shortlist option."}${placeSummary ? ` ${placeSummary}.` : ""}`;
  }

  if (budgetFitTier === "over") {
    return ` Budget fit: likely above ${budgetLabel}, so kailangan magdagdag. ${directIntentMatch ? "Good match siya sa intent mo, pero hindi siya pinaka-tipid." : "Relevant pa rin siya, pero not the cheapest pick."}${placeSummary ? ` ${placeSummary}.` : ""}`;
  }

  return ` Budget fit: not clearly shown on Maps, so this is a possible match, not a guaranteed budget pick.${placeSummary ? ` ${placeSummary}.` : ""}`;
}

function buildBudgetExplanationSuffix(intent: AskAiMapIntent): string {
  const budgetMentioned =
    intent.budgetIntent &&
    intent.budgetIntent !== "unknown" ||
    typeof intent.budgetAmount === "number" ||
    Boolean(intent.budgetPerPerson);

  if (!budgetMentioned) {
    return "";
  }

  const amountText =
    typeof intent.budgetAmount === "number" && Number.isFinite(intent.budgetAmount)
      ? `₱${Math.round(intent.budgetAmount)}`
      : null;
  const budgetLabel =
    intent.budgetIntent === "free_or_low_cost"
      ? "budget-friendly"
      : intent.budgetIntent === "low_cost"
        ? "low-cost"
        : intent.budgetIntent === "free"
          ? "free/low-cost"
          : "budget-aware";

  if (intent.budgetIntent === "free") {
    return " Walking around, window shopping, and tambay are usually the low-cost parts, but food, parking, rides, and attractions may still cost money.";
  }

  if (amountText) {
    return ` Budget note: possible match ito, pero check muna current promo/rate if you're targeting ${amountText}${intent.budgetPerPerson ? " per head" : ""}; prices can change.`;
  }

  return ` Budget note: possible match ito, but verify current price/promo first since rates can change.`;
}

function buildWhyThisFits(place: AskAiMapGroundedPlace, intent: AskAiMapIntent): string {
  return buildGroundedWhyThisFits(place, intent);
}

const WHY_THIS_FITS_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const WHY_THIS_FITS_GROQ_TIMEOUT_MS = 10_000;

async function resolveGroqApiKey(): Promise<string> {
  const envApiKey = normalizeText(process.env.GROQ_API_KEY);
  if (envApiKey) return envApiKey;

  const secretValue = normalizeText(await getSecret(KEY_VAULT_SECRET_NAMES.GROQ_API_KEY));
  if (secretValue) return secretValue;

  throw new AskAiMapsServiceError("Groq API key is not configured.", 500, {
    code: "ASK_AI_MAPS_CONFIG_ERROR",
    stage: "resolve_groq_key",
  });
}

type GroqWhyThisFitsMessage = {
  role: "system" | "user";
  content: string;
};

function parseGroqWhyThisFitsResponse(
  answer: string,
  places: AskAiMapGroundedPlace[],
  intent: AskAiMapIntent
): Record<string, string> | null {
  const cleaned = answer.replace(/^```(?:json)?\s*\n?|\n?```$/gi, "").trim();
  const parsed = parseJsonObject<{
    explanations?: Record<string, string> | Array<{ text?: string; explanation?: string } | string>;
  }>(cleaned);
  const result: Record<string, string> = {};

  if (Array.isArray(parsed?.explanations)) {
    for (let i = 0; i < parsed.explanations.length; i++) {
      const item = parsed.explanations[i];
      const text = typeof item === "string" ? item : (item?.text ?? item?.explanation ?? "");
      const normalized = normalizeText(text);
      if (!normalized) continue;
      const sanitized = places[i] ? sanitizeWhyThisFits(normalized, places[i], intent) : "";
      if (sanitized) result[String(i)] = sanitized;
    }
  } else if (parsed?.explanations && typeof parsed.explanations === "object") {
    for (const [key, value] of Object.entries(parsed.explanations)) {
      const index = Number(key);
      const normalized = normalizeText(value);
      if (!Number.isInteger(index) || !places[index] || !normalized) continue;
      const sanitized = sanitizeWhyThisFits(normalized, places[index], intent);
      if (sanitized) result[String(index)] = sanitized;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

async function generateWhyThisFitsBatch(
  places: AskAiMapGroundedPlace[],
  intent: AskAiMapIntent,
  signal?: AbortSignal,
): Promise<Record<string, string> | null> {
  if (places.length === 0) return null;

  try {
    const apiKey = await resolveGroqApiKey();
    throwIfAskAiRequestCancelled(signal);

    const placesList = places
      .map(
        (place, i) => {
          const input = buildWhyThisFitsInput(place, intent);
          const facts = [
            `Category: ${place.displayCategory ?? place.category ?? "N/A"}`,
            `Address: ${place.address ?? "N/A"}`,
            place.distanceKm != null ? `Distance from search area: ${formatWhyThisFitsDistance(place.distanceKm)}` : "Distance from search area: N/A",
            place.rating != null ? `Rating: ${place.rating}` : "Rating: N/A",
            place.reviewCount != null ? `Reviews: ${place.reviewCount}` : "Reviews: N/A",
            `Hours: ${place.openingHoursSummary ?? place.optionalDetails?.openingHoursSummary ?? place.optionalDetails?.hoursText ?? "N/A"}`,
            `Match: ${place.matchConfidence ?? "medium"}`,
            `Prompt constraints: ${input.constraintSummary.join(", ") || "general relevance"}`,
          ];
          return `${i + 1}. "${place.name}" | ${facts.join(" | ")}`;
        },
      )
      .join("\n");
    const promptConstraints = detectPromptConstraints(intent);

    const userPrompt = [
      `User query: "${intent.rawQuery}"`,
      `Search area: ${intent.searchAreaText ?? "N/A"}`,
      `Detected intent focus: ${promptConstraints.queryFocus}`,
      `Detected constraints: ${promptConstraints.constraints.join(", ") || "general relevance"}`,
      "",
      "For each place, write a short 2-3 sentence Taglish explanation that answers why this place fits the user's actual intent and constraints.",
      "Use only the facts listed for each place. Mention rating/reviews only when provided. Mention distance, nearby, or walkability only when distance is provided; if the user asked for walkable and distance is missing, say to check map directions first.",
      "Mention budget, prices, promos, affordability, tipid, or sulit only when Detected constraints includes budget-aware. For budget requests, say it is a possible budget shortlist and tell the user to check current prices/promos because live menu/rate data is not verified.",
      "Do not invent food quality, broth, toppings, serving size, menu prices, student budget, interiors, decor, seating, atmosphere, opening status, or exact walking route unless those facts are listed.",
      "Make each explanation place-specific using the listed category, short area/address clue, distance, rating/reviews, hours, or match signal. Avoid copy-paste wording across places.",
      "Add 1 relevant emoji at the end. Do not repeat the place name, full address, category label, or raw metadata. No markdown. Avoid em dashes.",
      "",
      "Places:",
      placesList,
    ]
      .filter(Boolean)
      .join("\n");

    const modelsToTry = getConfiguredModelList("ASK_AI_MAPS_GROQ_WHY_MODELS", ASK_AI_MAPS_DEFAULT_GROQ_WHY_MODELS);
    console.log(`[AskAiMaps] Groq why-this-fits models configured: ${modelsToTry.join(",")}`);
    let lastFailure = "none";

    for (const model of modelsToTry) {
      throwIfAskAiRequestCancelled(signal);

      try {
        const abortSignal = buildAbortSignal([AbortSignal.timeout(WHY_THIS_FITS_GROQ_TIMEOUT_MS), signal]);
        const response = await fetch(WHY_THIS_FITS_GROQ_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  'Return strict JSON only. No markdown. No code fences. Format: {"explanations": {"0": "explanation for place 0", "1": "explanation for place 1", ...}}',
              },
              {
                role: "user",
                content: userPrompt,
              },
            ] satisfies GroqWhyThisFitsMessage[],
            temperature: 0,
            stream: false,
            max_completion_tokens: 800,
            ...(model.includes("gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          lastFailure = `status-${response.status}`;
          if (response.status === 429 || response.status === 403 || response.status >= 500) {
            console.warn(`[AskAiMaps] Groq why-this-fits model=${model} fallbackReason=${lastFailure}`);
            continue;
          }

          console.warn(`[AskAiMaps] Groq why-this-fits request failed with status ${response.status} on model ${model}`);
          return null;
        }

        const data = (await response.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string } }> }
          | null;
        const answer = normalizeText(data?.choices?.[0]?.message?.content ?? "");
        if (!answer) {
          lastFailure = "empty-response";
          console.warn(`[AskAiMaps] Groq why-this-fits model=${model} fallbackReason=${lastFailure}`);
          continue;
        }

        const parsed = parseGroqWhyThisFitsResponse(answer, places, intent);
        if (parsed) {
          console.log(`[AskAiMaps] Groq why-this-fits model=${model} status=success`);
          return parsed;
        }

        lastFailure = "invalid-or-unusable-json";
        console.warn(`[AskAiMaps] Groq why-this-fits model=${model} fallbackReason=${lastFailure}`);
      } catch (error) {
        if (signal?.aborted || isAskAiRequestCancelledError(error)) {
          throwIfAskAiRequestCancelled(signal);
        }
        lastFailure = error instanceof Error ? error.message : String(error);
        console.warn(`[AskAiMaps] Groq why-this-fits model=${model} fallbackReason=exception error=${lastFailure}`);
      }
    }

    console.warn(`[AskAiMaps] Groq why-this-fits all models failed, lastFailure=${lastFailure}`);
    return null;
  } catch (error) {
    if (signal?.aborted || isAskAiRequestCancelledError(error)) {
      throwIfAskAiRequestCancelled(signal);
    }
    console.warn(
      `[AskAiMaps] Groq why-this-fits generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function buildSuggestedSearches(intent: AskAiMapIntent, searchArea: string | null): string[] {
  const area = searchArea ?? intent.searchAreaText ?? "that area";
  if (intent.categoryIntent === "mall") {
    return [
      `shopping places in ${area}`,
      `supermarkets in ${area}`,
      `cafes in ${area}`,
      `restaurants in ${area}`,
      `tourist spots in ${area}`,
    ];
  }
  return uniqueStrings([
    `${intent.categoryIntent === "unknown" ? "places to go" : `${intent.categoryIntent}s`} in ${area}`,
    `cafes in ${area}`,
    `restaurants in ${area}`,
    `tourist spots in ${area}`,
    `parks in ${area}`,
  ], 5);
}

function dedupePlaces(places: AskAiMapGroundedPlace[]): AskAiMapGroundedPlace[] {
  const byKey = new Map<string, AskAiMapGroundedPlace>();

  for (const place of places) {
    const key = normalizeKey(
      place.googlePlaceId ??
        place.googleMapsUri ??
        `${place.name}|${place.address ?? ""}|${place.latitude ?? ""}|${place.longitude ?? ""}`
    );

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, place);
      continue;
    }

    const existingScore = existing.matchScore ?? 0;
    const nextScore = place.matchScore ?? 0;
    if (nextScore > existingScore) {
      byKey.set(key, {
        ...existing,
        ...place,
        optionalDetails: {
          ...(existing.optionalDetails ?? {}),
          ...(place.optionalDetails ?? {}),
        },
      });
    }
  }

  return Array.from(byKey.values());
}

async function resolveExpandedAreasForSearch(intent: AskAiMapIntent): Promise<GeoapifyResolvedArea[]> {
  const rawAreas = getExpandedSearchAreas(intent.searchAreaText);
  if (rawAreas.length === 0) {
    return [];
  }

  const expandedAreas: GeoapifyResolvedArea[] = [];
  for (const searchAreaText of rawAreas) {
    const areaIntent: AskAiMapIntent = {
      ...intent,
      searchAreaText,
      city: resolveKnownAreaAlias(searchAreaText)?.city ?? normalizeText(searchAreaText.split(",")[0]),
      province: resolveKnownAreaAlias(searchAreaText)?.province ?? intent.province,
    };
    const resolved = await resolveSearchAreaWithGeoapify(areaIntent);
    if (resolved) {
      expandedAreas.push(resolved);
    }
  }

  return expandedAreas;
}

function buildIntentForArea(intent: AskAiMapIntent, searchAreaText: string): AskAiMapIntent {
  const areaAlias = resolveKnownAreaAlias(searchAreaText);
  return {
    ...intent,
    searchAreaText,
    city: areaAlias?.city ?? normalizeText(searchAreaText.split(",")[0]),
    province: areaAlias?.province ?? intent.province,
  };
}

async function collectGeminiVerifiedPlaces(
  intent: AskAiMapIntent,
  area: GeoapifyResolvedArea,
  fillResultCache: Map<string, GeoapifyCoordinateFillResult>,
  logger?: AskAiMapsLogger
): Promise<{
  places: AskAiMapGroundedPlace[];
  candidateCount: number;
  rejectedCount: number;
  suggestedSearches: string[];
}> {
  const geminiStartedAt = Date.now();
  const { candidates, suggestedSearches } = await callGeminiMapsGrounding(intent, logger);
  logger?.log(`[AskAI Maps Timing] gemini_duration_ms=${Date.now() - geminiStartedAt} candidates=${candidates.length}`);

  if (candidates.length === 0) {
    return { places: [], candidateCount: 0, rejectedCount: 0, suggestedSearches };
  }

  const accepted: AskAiMapGroundedPlace[] = [];
  let rejectedCount = 0;

  for (const candidate of candidates) {
    const result = await verifyCandidateWithGeoapify(candidate, intent, area, fillResultCache, logger);
    if (result.accepted && result.place) {
      accepted.push(result.place);
    } else {
      rejectedCount += 1;
    }
  }

  return {
    places: rankVerifiedPlaces(dedupePlaces(accepted), intent),
    candidateCount: candidates.length,
    rejectedCount,
    suggestedSearches,
  };
}

async function searchGeoapifyStrictFallback(intent: AskAiMapIntent, area: GeoapifyResolvedArea): Promise<AskAiMapGroundedPlace[]> {
  const geocodeQueries = uniqueStrings([
    `${intent.rawQuery}, ${area.label}`,
    intent.searchAreaText ? `${intent.rawQuery}, ${intent.searchAreaText}` : null,
    intent.categoryIntent !== "unknown" ? `${intent.categoryIntent} in ${area.label}` : null,
  ], 4);

  const geocodePlaces: AskAiMapGroundedPlace[] = [];
  for (const query of geocodeQueries) {
    const geocodeFeatures = await geoapifyGeocodeSearch(query, 6);
    for (const feature of geocodeFeatures) {
      const name = getGeoapifyFeatureName(feature);
      const coords = getGeoapifyCoordinates(feature);
      const address = getGeoapifyLocationText(feature);
      if (!name || !coords || !locationMatches(feature.properties, {
        name,
        googleMapsTitle: null,
        googleMapsUri: null,
        googlePlaceId: null,
        addressHint: address,
        cityHint: null,
        provinceHint: null,
        categoryHint: null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        reviewSignals: [],
        reasonSignals: [],
        groundingCoordinates: null,
        whyThisFits: null,
      }, intent, area, coords.latitude, coords.longitude)) {
        continue;
      }

      const resultTypes = getGeoapifyFeatureResultType(feature);
      const coordinateConfidence = scoreCoordinateConfidence({
        placeName: intent.rawQuery,
        geoapifyFeatureName: name,
        geoapifyLocationText: address,
        targetCity: intent.city ?? area.city,
        targetProvince: intent.province ?? area.province,
        targetAreaLabel: area.label,
        isNamedResult: resultTypes.isNamedResult,
        isAddressResult: resultTypes.isAddressResult,
        isRoadResult: resultTypes.isRoadResult,
        isCityResult: resultTypes.isCityResult,
      });
      const tier = classifyResultTier(intent, name, [], null);
      const hasPin = coordinateConfidence === "high" && (tier === "exact" || tier === "strong_related");
      geocodePlaces.push({
        id: `geoapify:${normalizeText(feature.properties?.place_id) ?? slugify(name)}`,
        name,
        reason: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        whyThisFits: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        category: "Mapped place",
        address,
        lat: hasPin ? coords.latitude : null,
        lng: hasPin ? coords.longitude : null,
        latitude: hasPin ? coords.latitude : null,
        longitude: hasPin ? coords.longitude : null,
        hasPin,
        coordinateStatus: hasPin ? "geoapify_coordinate_fill" : "missing_coordinates",
        coordinateConfidence: hasPin ? "high" : "none",
        matchConfidence: tier === "exact" ? "high" : "medium",
        coordinates: hasPin ? {
          lat: coords.latitude,
          lng: coords.longitude,
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
          confidence: "high" as const,
        } : null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        googleMapsUri: null,
        googlePlaceId: null,
        geoapifyPlaceId: normalizeText(feature.properties?.place_id),
        optionalDetails: {
          categoryText: "Mapped place",
          addressText: address,
          reviewSignals: [],
          openingHoursSummary: null,
        },
        source: {
          recommendation: "geoapify_fallback",
          coordinates: "geoapify_fallback",
          details: "geoapify",
        },
        verification: {
          nameMatched: true,
          locationMatched: hasPin,
          categoryMatched: true,
          coordinateVerified: hasPin,
        },
        matchScore: 66,
        distanceKm: hasPin ? Number(getDistanceKm(area.center, coords).toFixed(2)) : null,
        exactMatch: tier === "exact",
        mediumMatch: tier !== "exact",
        isFallback: true,
        resultTier: tier,
        relevanceSignals: buildRelevanceSignals({
          intent,
          candidate: null,
          name,
          locationText: address,
          fromGemini: false,
          fromGeocode: true,
          categories: [],
        }),
          displayCategory: "Mapped place",
          rawCategory: "Mapped place",
        });
    }
  }

  const features = await geoapifyPlacesSearch({
    categories: ["commercial.shopping_mall", "catering", "entertainment", "leisure", "tourism", "accommodation"],
    area,
    limit: 16,
  });

  const placeResults = features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const latitude = Number(properties.lat);
      const longitude = Number(properties.lon);
      const categories = normalizeCategories(properties.categories);
      const name = normalizeText(properties.name);
      const address =
        normalizeText(properties.formatted) ??
        normalizeText([properties.address_line1, properties.address_line2].filter(Boolean).join(", "));

      if (!name || !address || !isFiniteCoordinate(latitude, longitude) || !isInPhilippines(latitude, longitude)) {
        return null;
      }
      const tier = classifyResultTier(intent, name, categories, null);
      if (!locationMatches(properties, {
        name,
        googleMapsTitle: null,
        googleMapsUri: null,
        googlePlaceId: null,
        addressHint: address,
        cityHint: null,
        provinceHint: null,
        categoryHint: null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        reviewSignals: [],
        reasonSignals: [],
        whyThisFits: null,
        groundingCoordinates: null,
      }, intent, area, latitude, longitude)) {
        return null;
      }

      const categoryLabel = toCategoryLabel(categories, "Mapped place");
      const hasPin = tier === "exact";
      return {
        id: `geoapify:${normalizeText(properties.place_id) ?? slugify(name)}`,
        name,
        reason: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        whyThisFits: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        category: categoryLabel,
        address,
        lat: hasPin ? latitude : null,
        lng: hasPin ? longitude : null,
        latitude: hasPin ? latitude : null,
        longitude: hasPin ? longitude : null,
        hasPin,
        coordinateStatus: hasPin ? "geoapify_coordinate_fill" as const : "missing_coordinates" as const,
        coordinateConfidence: hasPin ? "high" as const : "none" as const,
        matchConfidence: tier === "exact" ? "high" as const : "medium" as const,
        coordinates: hasPin ? {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
          confidence: "high" as const,
        } : null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        googleMapsUri: null,
        googlePlaceId: null,
        geoapifyPlaceId: normalizeText(properties.place_id),
        optionalDetails: {
          categoryText: categoryLabel,
          addressText: address,
          reviewSignals: [],
          openingHoursSummary: null,
        },
        source: {
          recommendation: "geoapify_fallback" as const,
          coordinates: "geoapify_fallback" as const,
          details: "geoapify" as const,
        },
        verification: {
          nameMatched: true,
          locationMatched: true,
          categoryMatched: true,
          coordinateVerified: true,
        },
        matchScore:
          tier === "exact"
            ? 90
            : tier === "strong_related"
              ? 78
              : 62,
        distanceKm: hasPin ? Number(getDistanceKm(area.center, { latitude, longitude }).toFixed(2)) : null,
        exactMatch: tier === "exact",
        mediumMatch: tier !== "exact",
        isFallback: true,
        resultTier: tier,
        relevanceSignals: buildRelevanceSignals({
          intent,
          candidate: null,
          name,
          locationText: address,
          fromGemini: false,
          fromGeocode: false,
          categories,
        }),
        displayCategory: categoryLabel,
        rawCategory: categoryLabel,
      } satisfies AskAiMapGroundedPlace;
    })
    .filter((place) => place !== null);

  return rankVerifiedPlaces(dedupePlaces([...placeResults, ...geocodePlaces]), intent).slice(0, 8);
}

async function searchGeoapifyBroadFallback(intent: AskAiMapIntent, area: GeoapifyResolvedArea): Promise<AskAiMapGroundedPlace[]> {
  const features = await geoapifyPlacesSearch({
    categories: ["catering.restaurant", "catering.cafe", "entertainment", "leisure", "tourism", "commercial.shopping_mall"],
    area,
    limit: 16,
  });
  return features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const name = normalizeText(properties.name);
      const latitude = Number(properties.lat);
      const longitude = Number(properties.lon);
      const address =
        normalizeText(properties.formatted) ??
        normalizeText([properties.address_line1, properties.address_line2].filter(Boolean).join(", "));
      const categories = normalizeCategories(properties.categories);

      if (!name || !address || !isFiniteCoordinate(latitude, longitude) || !isInPhilippines(latitude, longitude)) {
        return null;
      }
      if (!locationMatches(properties, {
        name,
        googleMapsTitle: null,
        googleMapsUri: null,
        googlePlaceId: null,
        addressHint: address,
        cityHint: null,
        provinceHint: null,
        categoryHint: null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        reviewSignals: [],
        reasonSignals: [],
        whyThisFits: null,
        groundingCoordinates: null,
      }, intent, area, latitude, longitude)) {
        return null;
      }

      return {
        id: `geoapify:${normalizeText(properties.place_id) ?? slugify(name)}`,
        name,
        reason: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        whyThisFits: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        category: toCategoryLabel(categories, "Mapped place"),
        address,
        lat: null,
        lng: null,
        latitude: null,
        longitude: null,
        hasPin: false,
        coordinateStatus: "missing_coordinates" as const,
        coordinateConfidence: "none" as const,
        matchConfidence: "medium" as const,
        coordinates: null,
        rating: null,
        reviewCount: null,
        openingHoursSummary: null,
        googleMapsUri: null,
        googlePlaceId: null,
        geoapifyPlaceId: normalizeText(properties.place_id),
        optionalDetails: {
          categoryText: toCategoryLabel(categories, "Mapped place"),
          addressText: address,
          reviewSignals: [],
          openingHoursSummary: null,
        },
        source: {
          recommendation: "geoapify_fallback" as const,
          coordinates: "geoapify_fallback" as const,
          details: "geoapify" as const,
        },
        verification: {
          nameMatched: true,
          locationMatched: true,
          categoryMatched: true,
          coordinateVerified: true,
        },
        matchScore: 54,
        distanceKm: null,
        exactMatch: false,
        mediumMatch: true,
        isFallback: true,
      } satisfies AskAiMapGroundedPlace;
    })
    .filter((place) => place !== null)
    .slice(0, 8);
}

function buildSources(places: AskAiMapGroundedPlace[]): AskAiMapsSource[] {
  const sources: AskAiMapsSource[] = [];

  const hasGeminiPlaces = places.some(
    (place) => place.source?.recommendation === "gemini_map_grounding"
  );
  const hasGeoapifyCoords = places.some(
    (place) =>
      place.source?.coordinates === "geoapify_coordinate_fill" ||
      place.source?.coordinates === "geoapify_fallback"
  );

  if (hasGeminiPlaces) {
    sources.push({
      title: "Google Maps Grounding via Gemini",
      role: "place_recommendations_and_details",
    });
  }

  if (hasGeoapifyCoords || places.length > 0) {
    sources.push({
      title: "Geoapify Places",
      uri: "https://apidocs.geoapify.com/docs/places/",
      role: "coordinates",
    });
  }

  if (sources.length === 0) {
    sources.push({
      title: "Geoapify Places",
      uri: "https://apidocs.geoapify.com/docs/places/",
      role: "coordinates",
    });
  }

  return sources;
}

async function buildAskAiMapResponse(args: {
  mode: AskAiMapsSearchResult["mode"];
  intent: AskAiMapIntent;
  searchArea: string | null;
  places: AskAiMapGroundedPlace[];
  geminiGroundedCount: number;
  geoapifyCoordinateFilledCount: number;
  geminiCoordinateFallbackCount: number;
  cardOnlyCount: number;
  geoapifyFallbackCount: number;
  suggestedSearches: string[];
  sources: AskAiMapsSource[];
  latencyMs: number;
  modelUsed: string;
  explanationSource: "gemini_maps_grounding" | "backend_template";
  signal?: AbortSignal;
}): Promise<AskAiMapsSearchResult> {
  const counts = getTargetCounts(args.intent);
  const pinCount = args.places.filter((place) => place.hasPin).length;
  const resultMeta: AskAiMapsResultMeta = {
    queryType: args.intent.queryType,
    targetMinResults: counts.min,
    targetMaxResults: counts.max,
    geminiGroundedCount: args.geminiGroundedCount,
    geoapifyCoordinateFilledCount: args.geoapifyCoordinateFilledCount,
    geminiCoordinateFallbackCount: args.geminiCoordinateFallbackCount,
    cardOnlyCount: args.cardOnlyCount,
    geoapifyFallbackCount: args.geoapifyFallbackCount,
    returnedCount: args.places.length,
    pinCount,
    coordinateSource: "mixed",
    resultCountReason:
      args.places.length === 0
        ? "Gemini grounding and Geoapify fallback did not return any usable mapped places."
        : "Places were selected from Gemini Map Grounding. Geoapify supplied coordinates where available; Gemini coordinates or card-only results were used when coordinate fill was unavailable.",
  };

  const placeLabel =
    args.intent.categoryIntent === "unknown"
      ? "places"
      : `${args.intent.categoryIntent.replace(/_/g, " ")}${args.places.length === 1 ? "" : "s"}`;
  const areaLabel = args.searchArea ?? args.intent.searchAreaText ?? "the selected area";

  // Gemini already writes a grounded one-liner per place; a second model call only added ~5 s and Groq quota.
  const groqExplanations =
    args.explanationSource === "gemini_maps_grounding"
      ? null
      : await generateWhyThisFitsBatch(args.places.slice(0, counts.max), args.intent, args.signal);

  const places = args.places.slice(0, counts.max).map((place, index) => {
    const groqExplanation = groqExplanations?.[String(index)] ?? (args.explanationSource === "gemini_maps_grounding" ? place.whyThisFits ?? null : null);
    const sanitizedGroqExplanation =
      groqExplanation && normalizeText(groqExplanation)
        ? sanitizeWhyThisFits(groqExplanation, place, args.intent)
        : "";
    const whyThisFits =
      sanitizedGroqExplanation
        ? sanitizedGroqExplanation
        : buildWhyThisFits(place, args.intent);
    return {
      ...place,
      whyThisFits,
      reason: whyThisFits,
    };
  });

  if (places.length === 0) {
    return {
      mode: "no_verified_results",
      query: args.intent.rawQuery,
      searchArea: args.searchArea,
      answerText: `No usable ${placeLabel} were found in ${areaLabel} from Gemini grounding or Geoapify fallback.`,
      summary: `No usable ${placeLabel} were found in ${areaLabel}.`,
      resultMeta,
      places: [],
      suggestedSearches: args.suggestedSearches,
      sources: args.sources,
      modelUsed: args.modelUsed,
      coordinateSource: "mixed",
      explanationSource: args.explanationSource,
      emptyReason: "NO_MAP_GROUNDING_RESULTS",
      message: "No usable map places were returned by Gemini grounding or Geoapify fallback.",
      latencyMs: args.latencyMs,
    };
  }

  return {
    mode: args.mode,
    query: args.intent.rawQuery,
    searchArea: args.searchArea,
    answerText: `Found ${places.length} ${placeLabel} in ${areaLabel}.`,
    summary: `Showing ${pinCount} pin${pinCount === 1 ? "" : "s"} and ${places.length - pinCount} card${places.length - pinCount === 1 ? "" : "s"}.`,
    resultMeta,
    places,
    suggestedSearches: args.suggestedSearches,
    sources: args.sources,
    modelUsed: args.modelUsed,
    coordinateSource: "mixed",
    explanationSource: args.explanationSource,
    latencyMs: args.latencyMs,
  };
}

function logStructured(logger: AskAiMapsLogger | undefined, label: string, payload: Record<string, unknown>) {
  logger?.log(`[AskAiMaps] ${label} ${JSON.stringify(payload)}`);
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();
  const rawQuery = normalizeText(params.query);
  const searchQuery = normalizeText(params.searchQuery ?? params.query);
  const signal = params.signal;

  if (!rawQuery) {
    throw new AskAiMapsServiceError("Query is required.", 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "validate_query",
    });
  }

  const intent = parseAskAiMapIntent(rawQuery, searchQuery || rawQuery, params);
  if (intent.nearMe && !params.userLocation) {
    throw new AskAiMapsServiceError("This search needs your location so I can find verified nearby places.", 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "validate_near_me",
    });
  }
  // GalaTayo covers the whole Philippines; a search that names no place means Metro Manila.
  if (!intent.nearMe && !intent.searchAreaText) {
    intent.searchAreaText = DEFAULT_SEARCH_AREA;
    intent.queryType = "broad_discovery";
  }

  throwIfAskAiRequestCancelled(signal);
  // Gemini only needs the parsed intent, so it runs while the area is geocoded.
  const geminiStartedAt = Date.now();
  const geminiPromise = callGeminiMapsGrounding(intent, logger, signal).then(
    (result) => ({ result, error: null as unknown }),
    (error: unknown) => ({ result: null, error })
  );
  const area = await resolveSearchAreaWithGeoapify(intent, signal);
  if (!area) {
    logStructured(logger, "missing_area", {
      rawQuery,
      searchQuery,
      normalizedLocation: params.normalizedQuery?.location ?? null,
      resolvedSearchArea: intent.searchAreaText,
      reason: "missing_city_or_area",
    });
    throw new AskAiMapsServiceError("Please add a city or area so I can verify places in the right location.", 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "resolve_location",
    });
  }

  const counts = getTargetCounts(intent);

  logStructured(logger, "request", {
    rawQuery,
    searchQuery,
    normalizedQuery: intent.normalizedQuery,
    normalizedOverrideApplied: searchQuery !== rawQuery,
    normalizedLocation: params.normalizedQuery?.location ?? null,
    parsedIntent: intent,
    searchAreaText: area.label,
    resolvedSearchArea: area.label,
    actualQuerySentToMaps: searchQuery,
    provider: "gemini_geoapify_hybrid_fast",
  });

  let verifiedGeminiPlaces: AskAiMapGroundedPlace[] = [];
  let geminiGroundedCount = 0;
  let geminiSuggestedSearches: string[] = [];
  let geminiModelUsed: string | null = null;
  let geoapifyFallbackCount = 0;

  const gemini = await geminiPromise;
  if (gemini.error) {
    if (isAskAiRequestCancelledError(gemini.error) || signal?.aborted) {
      throwIfAskAiRequestCancelled(signal);
    }
    logger?.log(`[AskAiMaps] gemini_grounding_failed: ${gemini.error instanceof Error ? gemini.error.message : String(gemini.error)}`);
  } else if (gemini.result) {
    const { candidates, suggestedSearches: geminiSuggested, modelUsed } = gemini.result;
    logger?.log(`[AskAI Maps Timing] gemini_duration_ms=${Date.now() - geminiStartedAt} gemini_candidates=${candidates.length}`);

    geminiGroundedCount = candidates.length;
    geminiSuggestedSearches = geminiSuggested;
    geminiModelUsed = modelUsed;

    if (candidates.length > 0) {
      // Places already on GalaTayo have exact coordinates and an in-app page; only the rest need Geoapify.
      const galatayoMatches = await matchGalaTayoPlaces(candidates, area).catch(() => new Map<string, GalaTayoMatch>());
      let fillCache: Map<string, GeoapifyCoordinateFillResult> = new Map();

      try {
        fillCache = await batchGeoapifyCoordinateFill(
          candidates.filter((candidate) => !galatayoMatches.has(getCandidateKey(candidate, area))),
          intent,
          area,
          logger
        );
      } catch (fillError) {
        logger?.log(`[AskAiMaps] geoapify_batch_fill_error=${fillError instanceof Error ? fillError.message : String(fillError)}`);
      }
      for (const [key, match] of galatayoMatches) {
        fillCache.set(key, { coordinates: match.coordinates, geoapifyPlaceId: null, confidence: "high", queriesTried: [], source: "galatayo" });
      }

      const accepted: AskAiMapGroundedPlace[] = [];
      for (const candidate of candidates) {
        const result = await verifyCandidateWithGeoapify(candidate, intent, area, fillCache, logger);
        if (result.accepted && result.place) {
          const match = galatayoMatches.get(getCandidateKey(candidate, area));
          accepted.push(match ? { ...result.place, galatayoPath: match.path } : result.place);
        }
      }

      verifiedGeminiPlaces = rankVerifiedPlaces(dedupePlaces(accepted), intent);
    }
  }

  let finalPlaces: AskAiMapGroundedPlace[];
  let mode: AskAiMapsSearchResult["mode"];

  if (verifiedGeminiPlaces.length > 0) {
    finalPlaces = verifiedGeminiPlaces;
    mode = "gemini_grounding_primary_geoapify_coordinates";
  } else {
    throwIfAskAiRequestCancelled(signal);
    let geoapifyPlaces = await searchGeoapifyStrictFallback(intent, area);
    if (geoapifyPlaces.length < counts.min && isProvinceLevelArea(intent.searchAreaText ?? "")) {
      const expandedAreas = await resolveExpandedAreasForSearch(intent);
      for (const expandedArea of expandedAreas) {
        const expandedIntent = buildIntentForArea(intent, expandedArea.label);
        geoapifyPlaces = dedupePlaces([
          ...geoapifyPlaces,
          ...(await searchGeoapifyStrictFallback(expandedIntent, expandedArea)),
        ]);
      }
    }
    if (geoapifyPlaces.length === 0) {
      geoapifyPlaces = await searchGeoapifyBroadFallback(intent, area);
      if (geoapifyPlaces.length < counts.min && isProvinceLevelArea(intent.searchAreaText ?? "")) {
        const expandedAreas = await resolveExpandedAreasForSearch(intent);
        for (const expandedArea of expandedAreas) {
          const expandedIntent = buildIntentForArea(intent, expandedArea.label);
          geoapifyPlaces = dedupePlaces([
            ...geoapifyPlaces,
            ...(await searchGeoapifyBroadFallback(expandedIntent, expandedArea)),
          ]);
        }
      }
    }

    geoapifyFallbackCount = geoapifyPlaces.length;
    finalPlaces = rankVerifiedPlaces(dedupePlaces(geoapifyPlaces), intent);
    mode = finalPlaces.length > 0 ? "geoapify_fallback_only" : "no_verified_results";
  }

  finalPlaces = rankVerifiedPlaces(dedupePlaces(finalPlaces), intent).slice(0, counts.max);

  const geoapifyCoordinateFilledCount = finalPlaces.filter(
    (place) =>
      place.source?.recommendation === "gemini_map_grounding" &&
      place.source?.coordinates === "geoapify_coordinate_fill"
  ).length;
  const geminiCoordinateFallbackCount = finalPlaces.filter(
    (place) =>
      place.source?.recommendation === "gemini_map_grounding" &&
      place.source?.coordinates === "gemini_coordinate_fallback"
  ).length;
  const cardOnlyCount = finalPlaces.filter(
    (place) =>
      place.source?.recommendation === "gemini_map_grounding" &&
      (place.source?.coordinates === "none" || !place.hasPin)
  ).length;

  const suggestedSearches =
    geminiSuggestedSearches.length > 0
      ? geminiSuggestedSearches
      : buildSuggestedSearches(intent, area.label);
  const sources = buildSources(finalPlaces);
  const totalDuration = Date.now() - startedAt;
  const pinCount = finalPlaces.filter((p) => p.hasPin).length;

  logger?.log(`[AskAI Maps Timing] total_request_duration_ms=${totalDuration}`);

  logger?.log(
    `[AskAI Maps Coordinate Fill] geoapify_filled=${geoapifyCoordinateFilledCount} gemini_fallback=${geminiCoordinateFallbackCount} card_only=${cardOnlyCount} fallback_total=${geoapifyFallbackCount}`
  );

  logger?.log(
    `[AskAI Maps Final Output] returnedCount=${finalPlaces.length} pinCount=${pinCount} cardOnlyCount=${cardOnlyCount} geoapifyCoordinateFilledCount=${geoapifyCoordinateFilledCount} geminiCoordinateFallbackCount=${geminiCoordinateFallbackCount} failedCoordinateCount=${cardOnlyCount}`
  );

  return buildAskAiMapResponse({
    mode,
    intent,
    searchArea: area.label,
    places: finalPlaces,
    geminiGroundedCount,
    geoapifyCoordinateFilledCount,
    geminiCoordinateFallbackCount,
    cardOnlyCount,
    geoapifyFallbackCount,
    suggestedSearches,
    sources,
    latencyMs: totalDuration,
    modelUsed: geminiModelUsed ? `models/${geminiModelUsed}` : `models/${getConfiguredModelList("ASK_AI_MAPS_GEMINI_MODELS", ASK_AI_MAPS_DEFAULT_GEMINI_MODELS)[0]}`,
    explanationSource:
      mode === "gemini_grounding_primary_geoapify_coordinates"
        ? "gemini_maps_grounding" : "backend_template",
    signal,
  });
}

export const askAiMapsModelFallbacksForTest = {
  getConfiguredModelList,
  callGeminiMapsGrounding,
  generateWhyThisFitsBatch,
  setGoogleGenAIConstructor(value: typeof GoogleGenAI | null) {
    GoogleGenAIForMaps = value ?? GoogleGenAI;
  },
};
