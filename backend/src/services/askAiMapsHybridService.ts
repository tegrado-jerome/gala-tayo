import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import type { NormalizedAskAiMapQuery } from "./askAiMapQueryNormalizer";

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

const GEMINI_MODEL = "gemini-3.1-flash-lite";
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
  const secret = await getSecret("gemini-api-key");
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
  const secret = await getSecret("geoapify-api-key");
  const apiKey = normalizeText(secret);
  if (!apiKey) {
    throw new AskAiMapsServiceError("Geoapify API key is missing.", 500, {
      code: "ASK_AI_MAPS_PROVIDER_ERROR",
      stage: "load_geoapify_key",
    });
  }
  return apiKey;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchJson<T>(url: URL, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AskAiMapsServiceError(`Provider request failed with status ${response.status}.`, 502, {
        code: "ASK_AI_MAPS_PROVIDER_ERROR",
        providerStatus: response.status,
        stage: "provider_fetch",
      });
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
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

async function resolveSearchAreaWithGeoapify(intent: AskAiMapIntent): Promise<GeoapifyResolvedArea | null> {
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
  const payload = await fetchJson<{ features?: GeoapifyGeocodeFeature[] }>(url, GEOAPIFY_TIMEOUT_MS);
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
    '- "whyThisFits": a 2-3 sentence Taglish explanation specific to this place and the user query',
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

async function callGeminiMapsGrounding(
  intent: AskAiMapIntent,
  logger?: AskAiMapsLogger
): Promise<{ candidates: GeminiCandidate[]; suggestedSearches: string[]; invalidJson: boolean }> {
  logger?.log(
    `[AskAiMaps] gemini_called=${true} gemini_model=${GEMINI_MODEL} grounding_enabled=${true}`
  );
  try {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const response = await withTimeout(
      ai.models.generateContent({
        model: `models/${GEMINI_MODEL}`,
        contents: buildGeminiPrompt(intent),
        config: {
          temperature: 0,
          maxOutputTokens: 2000,
          tools: [{ googleMaps: {} }],
        },
      }),
      GEMINI_TIMEOUT_MS,
      "Gemini timed out."
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

      logger?.log(`[AskAiMaps] gemini_grounding_chunks=${chunks.length} grounding_supports=${supports.length}`);

      for (const chunk of chunks) {
        const web = chunk.web as { uri?: string; title?: string } | undefined;
        if (web) {
          groundingChunks.push({ web });
        }
      }
    }

    const rawText = normalizeText((response as { text?: string }).text) ?? "";
    logger?.log(`[AskAiMaps] gemini_raw_text_length=${rawText.length}`);
    const parsed = rawText ? parseJsonObject<GeminiMapsResponse>(rawText) : null;

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

      logger?.log(`[AskAiMaps] gemini_text_places_parsed=${textCandidateMap.size}`);
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

    logger?.log(`[AskAiMaps] gemini_maps_grounding_uris=${mapsChunks.length}`);

    for (const chunk of mapsChunks) {
      const coords = extractCoordinatesFromGoogleMapsUrl(chunk.uri);
      const placeId = extractPlaceIdFromMapsUri(chunk.uri);
      const textDetails = textCandidateMap.get(normalizeKey(chunk.title)) as Record<string, unknown> | undefined;

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
      logger?.log("[AskAiMaps] gemini_no_grounding_uris_falling_back_to_text");
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
    logger?.log(`[AskAiMaps] gemini_candidates_final=${candidates.length}`);

    const suggestedSearches: string[] = [];
    if (parsed) {
      const parsedSearches = Array.isArray(parsed.suggestedSearches)
        ? parsed.suggestedSearches
        : [];
      suggestedSearches.push(...uniqueStrings(parsedSearches.map((value) => normalizeText(value)), 5));
    }

    return { candidates, suggestedSearches, invalidJson: false };
  } catch (error) {
    logger?.log(`[AskAiMaps] gemini_error=${error instanceof Error ? error.message : String(error)}`);
    return { candidates: [], suggestedSearches: [], invalidJson: false };
  }
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
  const hasCoordinates = args.coordinates !== null && args.coordinateConfidence !== "none";
  const displayCategory = args.candidate.categoryHint ?? getDisplayCategoryForIntent(args.intent);
  const whyThisFits =
    args.candidate.whyThisFits ??
    `${args.candidate.name} mukhang relevant sa "${args.intent.rawQuery}" based sa Google Maps grounding details na nakuha para sa area na ito.`;

  const isGeoapifyCoord = args.coordinateSource === "geoapify_coordinate_fill";
  const isGeminiFallback = args.coordinateSource === "gemini_coordinate_fallback";
  const isCardOnly = args.coordinateSource === "none" || args.coordinateConfidence === "none";

  const coordinateStatus: AskAiMapGroundedPlace["coordinateStatus"] =
    isGeoapifyCoord ? "geoapify_coordinate_fill"
    : isGeminiFallback ? "gemini_coordinate_fallback"
    : "missing_coordinates";

  const hasPin = hasCoordinates && !isCardOnly;
  const coordConfidence: CoordinateConfidence = isCardOnly ? "none"
    : isGeoapifyCoord ? args.coordinateConfidence
    : isGeminiFallback ? "medium"
    : "none";

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
      coordinateVerified: isGeoapifyCoord || isGeminiFallback,
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

  if (hasCoordinates && args.coordinates) {
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
  source: "geoapify" | "none";
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

  const uniqueQueries = uniqueStrings(queries, 5);
  const PER_QUERY_TIMEOUT_MS = 2000;
  const MAX_TOTAL_TIME_MS = 4000;
  const startTime = Date.now();

  for (const query of uniqueQueries) {
    if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
      break;
    }

    queriesTried.push(query);

    try {
      const geocodeFeatures = await withTimeout(
        geoapifyGeocodeSearch(query, 3),
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

        const confidence = scoreCoordinateConfidence({
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

        if (confidence === "low") {
          continue;
        }

        return {
          coordinates: coords,
          geoapifyPlaceId,
          confidence,
          queriesTried,
          selectedQuery: query,
          source: "geoapify",
        };
      }
    } catch {
      continue;
    }
  }

  return {
    coordinates: null,
    geoapifyPlaceId: null,
    confidence: "none",
    queriesTried,
    source: "none",
  };
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

  const TOTAL_FILL_TIMEOUT_MS = 6000;
  const fillStartedAt = Date.now();

  const fillTasks = candidates.map(async (candidate) => {
    const key = normalizeKey(`${candidate.name}|${area.label}`);
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
  const cacheKey = normalizeKey(`${candidate.name}|${area.label}`);
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
    const distanceKm = coordinates
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

function buildWhyThisFits(place: AskAiMapGroundedPlace, intent: AskAiMapIntent): string {
  if (place.source?.recommendation === "gemini_map_grounding") {
    const explicit = normalizeText(place.whyThisFits) ?? normalizeText(place.reason);
    if (explicit) {
      return explicit;
    }
    const area = intent.searchAreaText ?? "target area";
    return `${place.name} mukhang relevant sa "${intent.rawQuery}" sa ${area}. May Google Maps listing ito na puwede mong i-check para sa latest details.`;
  }

  if (place.source?.recommendation === "geoapify_fallback") {
    return "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.";
  }

  const area = intent.searchAreaText ?? "target area";
  return `${place.name} mukhang relevant sa "${intent.rawQuery}" sa ${area}. May usable map pin at place details ito, kaya puwede mo agad i-check sa map.`;
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

      const tier = classifyResultTier(intent, name, [], null);
      geocodePlaces.push({
        id: `geoapify:${normalizeText(feature.properties?.place_id) ?? slugify(name)}`,
        name,
        reason: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        whyThisFits: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        category: "Mapped place",
        address,
        lat: coords.latitude,
        lng: coords.longitude,
        latitude: coords.latitude,
        longitude: coords.longitude,
        hasPin: true,
        coordinateStatus: "geoapify_coordinate_fill",
        coordinateConfidence: "medium",
        matchConfidence: tier === "exact" ? "high" : "medium",
        coordinates: {
          lat: coords.latitude,
          lng: coords.longitude,
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
          confidence: "medium" as const,
        },
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
          locationMatched: true,
          categoryMatched: true,
          coordinateVerified: true,
        },
        matchScore: 66,
        distanceKm: Number(getDistanceKm(area.center, coords).toFixed(2)),
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
      return {
        id: `geoapify:${normalizeText(properties.place_id) ?? slugify(name)}`,
        name,
        reason: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        whyThisFits: "Nakita ito as a mapped commercial/place result near the search area, pero limited ang available details from the map source.",
        category: categoryLabel,
        address,
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        hasPin: true,
        coordinateStatus: "geoapify_coordinate_fill" as const,
        coordinateConfidence: "medium" as const,
        matchConfidence: tier === "exact" ? "high" as const : "medium" as const,
        coordinates: {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
          confidence: "medium" as const,
        },
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
        distanceKm: Number(getDistanceKm(area.center, { latitude, longitude }).toFixed(2)),
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
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        hasPin: true,
        coordinateStatus: "geoapify_coordinate_fill" as const,
        coordinateConfidence: "medium" as const,
        matchConfidence: "medium" as const,
        coordinates: {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
          confidence: "medium" as const,
        },
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
        distanceKm: Number(getDistanceKm(area.center, { latitude, longitude }).toFixed(2)),
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

function buildAskAiMapResponse(args: {
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
}): AskAiMapsSearchResult {
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

  const places = args.places.slice(0, counts.max).map((place) => {
    const whyThisFits = buildWhyThisFits(place, args.intent);
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

  const area = await resolveSearchAreaWithGeoapify(intent);
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
  let geoapifyFallbackCount = 0;

  try {
    const geminiStartedAt = Date.now();
    const { candidates, suggestedSearches: geminiSuggested } = await callGeminiMapsGrounding(intent, logger);
    logger?.log(`[AskAI Maps Timing] gemini_duration_ms=${Date.now() - geminiStartedAt} gemini_candidates=${candidates.length}`);

    geminiGroundedCount = candidates.length;
    geminiSuggestedSearches = geminiSuggested;

    if (candidates.length > 0) {
      let fillCache: Map<string, GeoapifyCoordinateFillResult> = new Map();

      try {
        fillCache = await batchGeoapifyCoordinateFill(candidates, intent, area, logger);
      } catch (fillError) {
        logger?.log(`[AskAiMaps] geoapify_batch_fill_error=${fillError instanceof Error ? fillError.message : String(fillError)}`);
      }

      const accepted: AskAiMapGroundedPlace[] = [];
      for (const candidate of candidates) {
        const result = await verifyCandidateWithGeoapify(candidate, intent, area, fillCache, logger);
        if (result.accepted && result.place) {
          accepted.push(result.place);
        }
      }

      verifiedGeminiPlaces = rankVerifiedPlaces(dedupePlaces(accepted), intent);
    }
  } catch (geminiError) {
    logger?.log(
      `[AskAiMaps] gemini_grounding_failed: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}`
    );
  }

  let finalPlaces: AskAiMapGroundedPlace[];
  let mode: AskAiMapsSearchResult["mode"];

  if (verifiedGeminiPlaces.length > 0) {
    finalPlaces = verifiedGeminiPlaces;
    mode = "gemini_grounding_primary_geoapify_coordinates";
  } else {
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
    modelUsed: `models/${GEMINI_MODEL}`,
    explanationSource:
      mode === "gemini_grounding_primary_geoapify_coordinates"
        ? "gemini_maps_grounding" : "backend_template",
  });
}
