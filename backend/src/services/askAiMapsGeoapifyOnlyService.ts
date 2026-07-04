import { getSecret } from "../config/keyVault";

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
  selectedChips?: string[];
  nearMe?: boolean;
  openNow?: boolean;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
};

type AskAiMapsQueryType = "broad" | "specific";
type MatchConfidence = "high" | "medium" | "fallback";
type NormalizedIntent =
  | "samgyup_search"
  | "food_search"
  | "mall_search"
  | "cafe_search"
  | "date_spot_search"
  | "activity_search"
  | "tourist_spot_search"
  | "generic_place_search";

type ParsedQuery = {
  rawQuery: string;
  locationText: string | null;
  normalizedIntent: NormalizedIntent;
  keywords: string[];
  requiredKeywords: string[];
  allowedCategories: string[];
  resultLimit: number;
  usesNearMe: boolean;
  placeType: string;
  targetMinResults: number;
  searchPhrases: string[];
  keywordSynonyms: string[];
};

type AskAiMapsResultMeta = {
  queryType: AskAiMapsQueryType;
  targetMinResults: number;
  targetMaxResults: number;
  actualResults: number;
  resultCountReason: string | null;
};

type AskAiMapsLogger = {
  log: (message: string) => void;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
};

export type AskAiMapGroundedPlace = {
  id: string;
  name: string;
  reason: string;
  whyThisFits?: string;
  category?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coordinateStatus?: "trusted" | "missing" | "suspicious";
  matchConfidence?: MatchConfidence;
  coordinates?: {
    lat: number;
    lng: number;
    latitude: number;
    longitude: number;
    source: "geoapify";
    trusted?: true;
    verified?: true;
  } | null;
  optionalDetails?: {
    categoryText?: string;
    addressText?: string;
  };
  source?: {
    recommendation: "geoapify_places";
  };
};

export type AskAiMapsSearchResult = {
  mode: "geoapify_places";
  query: string;
  searchArea: string | null;
  answerText: string;
  summary: string;
  resultMeta: AskAiMapsResultMeta;
  places: AskAiMapGroundedPlace[];
  sources: AskAiMapsSource[];
  modelUsed?: string;
  explanationSource?: "backend_template";
  emptyReason?: AskAiMapsEmptyReason;
  message?: string;
  latencyMs: number;
};

type GeoapifyGeocodeFeature = {
  bbox?: number[];
  properties?: {
    place_id?: unknown;
    formatted?: unknown;
    lat?: unknown;
    lon?: unknown;
    country_code?: unknown;
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
  };
};

type ResolvedSearchArea = {
  label: string;
  center: { latitude: number; longitude: number };
  filter: string;
  bias: string;
  placeId?: string;
  radiusMeters: number;
};

type RankedCandidate = AskAiMapGroundedPlace & {
  matchScore: number;
  distanceKm: number | null;
  exactMatch: boolean;
  mediumMatch: boolean;
  isFallback: boolean;
};

type SearchAttempt = {
  label: string;
  categories: string[];
  filter: string;
  bias: string;
  limit: number;
  name?: string;
};

const GEOAPIFY_GEOCODE_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_PLACES_ENDPOINT = "https://api.geoapify.com/v2/places";
const GEOAPIFY_TIMEOUT_MS = 8_000;
const MAX_RESULT_LIMIT = 8;
const DEFAULT_RESULT_LIMIT = 8;
const RAW_FETCH_LIMIT = 20;
const PHILIPPINES_LAT_MIN = 4.0;
const PHILIPPINES_LAT_MAX = 21.5;
const PHILIPPINES_LNG_MIN = 116.0;
const PHILIPPINES_LNG_MAX = 127.0;

const INTENT_PATTERNS: Array<{ intent: NormalizedIntent; pattern: RegExp }> = [
  { intent: "samgyup_search", pattern: /\b(samgyup|samgyupsal|samgyeopsal|korean bbq|korean grill|unlimited grill)\b/i },
  { intent: "mall_search", pattern: /\b(mall|shopping mall|shopping center|ayala malls|sm city|robinsons|vista mall)\b/i },
  { intent: "cafe_search", pattern: /\b(cafe|coffee|coffee shop|study cafe)\b/i },
  { intent: "date_spot_search", pattern: /\b(date spot|date|romantic|couple)\b/i },
  { intent: "tourist_spot_search", pattern: /\b(tourist|museum|heritage|attraction|sightseeing)\b/i },
  { intent: "activity_search", pattern: /\b(activity|fun|arcade|hike|bowling)\b/i },
  { intent: "food_search", pattern: /\b(food trip|food|kainan|restaurant|eat|bbq)\b/i },
];

const INTENT_SYNONYMS: Record<NormalizedIntent, string[]> = {
  samgyup_search: [
    "samgyup",
    "samgyupsal",
    "samgyeopsal",
    "korean bbq",
    "korean grill",
    "bbq",
    "unlimited grill",
  ],
  cafe_search: ["cafe", "coffee", "coffee shop", "study cafe"],
  mall_search: ["mall", "shopping mall", "shopping center", "ayala malls", "sm city", "robinsons", "vista mall"],
  date_spot_search: ["date spot", "romantic", "couple", "sunset"],
  food_search: ["food", "food trip", "kainan", "restaurant"],
  activity_search: ["activity", "fun", "arcade", "bowling"],
  tourist_spot_search: ["tourist", "attraction", "museum", "heritage"],
  generic_place_search: ["place", "spot"],
};

const INTENT_CATEGORIES: Record<NormalizedIntent, string[]> = {
  samgyup_search: ["catering.restaurant"],
  food_search: ["catering.restaurant", "catering.fast_food"],
  mall_search: ["commercial.shopping_mall"],
  cafe_search: ["catering.cafe", "catering.cafe.coffee", "catering.cafe.coffee_shop"],
  date_spot_search: ["leisure.park", "tourism.attraction", "catering.cafe", "catering.restaurant", "entertainment.cinema"],
  activity_search: ["entertainment", "leisure", "national_park"],
  tourist_spot_search: ["tourism.attraction", "entertainment.museum", "leisure.park", "national_park"],
  generic_place_search: ["tourism.attraction", "catering.cafe", "leisure.park"],
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

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 12): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

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

function clampResultLimit(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_RESULT_LIMIT, Math.round(value!)));
}

function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isInPhilippines(latitude: number, longitude: number): boolean {
  return (
    latitude >= PHILIPPINES_LAT_MIN &&
    latitude <= PHILIPPINES_LAT_MAX &&
    longitude >= PHILIPPINES_LNG_MIN &&
    longitude <= PHILIPPINES_LNG_MAX
  );
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function buildPlaceId(name: string, latitude: number, longitude: number, rawPlaceId?: string | null): string {
  const normalizedPlaceId = normalizeText(rawPlaceId);
  if (normalizedPlaceId) {
    return `geoapify:${normalizedPlaceId}`;
  }

  return `geoapify:${slugify(name)}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
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

function extractLocationText(query: string): string | null {
  const normalized = normalizeWhitespace(query);
  const patterns = [
    /\b(?:in|sa|around|near|at)\s+([a-zA-Z0-9 .,'-]+?)(?:\s+\b(?:good for|with|na|that|where)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const locationText = normalizeText(match?.[1]);
    if (locationText && !/\bme\b/i.test(locationText)) {
      return locationText;
    }
  }

  return null;
}

function detectIntent(query: string): NormalizedIntent {
  for (const item of INTENT_PATTERNS) {
    if (item.pattern.test(query)) {
      return item.intent;
    }
  }

  return "generic_place_search";
}

function extractKeywords(query: string, locationText: string | null): string[] {
  const normalized = normalizeToken(query);
  const locationToken = locationText ? normalizeToken(locationText) : "";
  const stopwords = new Set([
    "a", "an", "and", "around", "at", "for", "food", "good", "in", "inside", "malls", "me", "near",
    "nearby", "of", "on", "or", "places", "sa", "spot", "spots", "the", "to", "with",
  ]);

  return uniqueStrings(
    normalized
      .split(" ")
      .filter((token) => token.length >= 2 && !stopwords.has(token) && (!locationToken || !locationToken.split(" ").includes(token))),
    10
  );
}

function buildParsedQuery(params: AskAiMapsSearchParams): ParsedQuery {
  const rawQuery = normalizeText(params.query) ?? "";
  const locationText = extractLocationText(rawQuery);
  const normalizedIntent = detectIntent(rawQuery);
  const keywords = extractKeywords(rawQuery, locationText);
  const keywordSynonyms = uniqueStrings([
    ...INTENT_SYNONYMS[normalizedIntent],
    ...keywords.flatMap((keyword) => INTENT_SYNONYMS[normalizedIntent].filter((item) => item.includes(keyword) || keyword.includes(item))),
  ], 16);
  const requiredKeywords =
    normalizedIntent === "samgyup_search"
      ? uniqueStrings(["samgyup", "samgyupsal", "samgyeopsal", "korean bbq", "korean grill", "unlimited grill"])
      : uniqueStrings(keywordSynonyms.slice(0, 6));
  const allowedCategories = INTENT_CATEGORIES[normalizedIntent];
  const usesNearMe =
    params.nearMe === true ||
    /\b(near me|nearby|around me|close to me|malapit sakin|malapit sa akin)\b/i.test(rawQuery);
  const placeType =
    normalizedIntent === "samgyup_search"
      ? "samgyup"
      : normalizedIntent === "mall_search"
        ? "mall"
        : normalizedIntent === "cafe_search"
          ? "cafe"
          : normalizedIntent === "date_spot_search"
            ? "date spot"
            : normalizedIntent === "food_search"
              ? "food place"
              : "place";

  return {
    rawQuery,
    locationText,
    normalizedIntent,
    keywords,
    requiredKeywords,
    allowedCategories,
    resultLimit: clampResultLimit(DEFAULT_RESULT_LIMIT),
    usesNearMe,
    placeType,
    targetMinResults: normalizedIntent === "samgyup_search" ? 3 : 4,
    searchPhrases: uniqueStrings([
      `${placeType} ${keywords.join(" ")}`.trim(),
      ...requiredKeywords,
      ...keywordSynonyms,
    ], 10),
    keywordSynonyms,
  };
}

function buildAreaFromCoordinates(args: {
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): ResolvedSearchArea {
  return {
    label: args.label,
    center: { latitude: args.latitude, longitude: args.longitude },
    filter: `circle:${args.longitude},${args.latitude},${args.radiusMeters}`,
    bias: `proximity:${args.longitude},${args.latitude}`,
    radiusMeters: args.radiusMeters,
  };
}

async function resolveSearchArea(args: {
  parsedQuery: ParsedQuery;
  params: AskAiMapsSearchParams;
}): Promise<{ area: ResolvedSearchArea | null; geocodingCalled: boolean }> {
  if (args.parsedQuery.locationText) {
    const apiKey = await getGeoapifyApiKey();
    const url = new URL(GEOAPIFY_GEOCODE_ENDPOINT);
    url.searchParams.set("text", `${args.parsedQuery.locationText}, Philippines`);
    url.searchParams.set("limit", "1");
    url.searchParams.set("apiKey", apiKey);

    const payload = await fetchJson<{ features?: GeoapifyGeocodeFeature[] }>(url, GEOAPIFY_TIMEOUT_MS);
    const feature = Array.isArray(payload.features) ? payload.features[0] : null;
    const properties = feature?.properties ?? {};
    const latitude = Number(properties.lat);
    const longitude = Number(properties.lon);
    const countryCode = normalizeText(properties.country_code)?.toLowerCase();

    if (!feature || !isFiniteCoordinate(latitude, longitude) || countryCode !== "ph") {
      throw new AskAiMapsServiceError("We couldn't resolve that location yet. Try a more specific area.", 400, {
        code: "ASK_AI_MAPS_BAD_REQUEST",
        stage: "resolve_location",
      });
    }

    const placeId = normalizeText(properties.place_id) ?? undefined;
    const label = normalizeText(properties.formatted) ?? `${args.parsedQuery.locationText}, Philippines`;
    return {
      area: placeId
        ? {
            label,
            center: { latitude, longitude },
            filter: `place:${placeId}`,
            bias: `proximity:${longitude},${latitude}`,
            placeId,
            radiusMeters: 20_000,
          }
        : buildAreaFromCoordinates({
            label,
            latitude,
            longitude,
            radiusMeters: 18_000,
          }),
      geocodingCalled: true,
    };
  }

  if ((args.parsedQuery.usesNearMe || args.params.nearMe) && args.params.userLocation) {
    return {
      area: buildAreaFromCoordinates({
        label: "near you",
        latitude: args.params.userLocation.latitude,
        longitude: args.params.userLocation.longitude,
        radiusMeters: 12_000,
      }),
      geocodingCalled: false,
    };
  }

  if (args.params.userLocation) {
    return {
      area: buildAreaFromCoordinates({
        label: "your current area",
        latitude: args.params.userLocation.latitude,
        longitude: args.params.userLocation.longitude,
        radiusMeters: 12_000,
      }),
      geocodingCalled: false,
    };
  }

  return { area: null, geocodingCalled: false };
}

function buildSearchAttempts(parsedQuery: ParsedQuery, area: ResolvedSearchArea): SearchAttempt[] {
  const attempts: SearchAttempt[] = [];

  for (const phrase of parsedQuery.searchPhrases.slice(0, 3)) {
    attempts.push({
      label: "exact_keyword_category",
      categories: parsedQuery.allowedCategories,
      name: phrase,
      filter: area.filter,
      bias: area.bias,
      limit: RAW_FETCH_LIMIT,
    });
  }

  attempts.push({
    label: "broader_category_only",
    categories: parsedQuery.allowedCategories,
    filter: area.filter,
    bias: area.bias,
    limit: RAW_FETCH_LIMIT,
  });

  if (area.filter.startsWith("circle:")) {
    attempts.push({
      label: "nearby_radius_search",
      categories: parsedQuery.allowedCategories,
      filter: `circle:${area.center.longitude},${area.center.latitude},${Math.max(area.radiusMeters, 20_000)}`,
      bias: area.bias,
      limit: RAW_FETCH_LIMIT,
    });
  }

  return attempts;
}

async function searchGeoapifyPlaces(args: {
  parsedQuery: ParsedQuery;
  area: ResolvedSearchArea;
  logger?: AskAiMapsLogger;
}): Promise<{ features: GeoapifyPlaceFeature[]; rawCount: number }> {
  const apiKey = await getGeoapifyApiKey();
  const attempts = buildSearchAttempts(args.parsedQuery, args.area);
  const merged = new Map<string, GeoapifyPlaceFeature>();
  let rawCount = 0;

  for (const attempt of attempts) {
    const url = new URL(GEOAPIFY_PLACES_ENDPOINT);
    url.searchParams.set("categories", attempt.categories.join(","));
    url.searchParams.set("filter", attempt.filter);
    url.searchParams.set("bias", attempt.bias);
    url.searchParams.set("limit", String(attempt.limit));
    url.searchParams.set("lang", "en");
    url.searchParams.set("apiKey", apiKey);
    if (attempt.name) {
      url.searchParams.set("name", attempt.name);
    }

    args.logger?.log(`[AskAiMaps] geoapifyPlacesCalled ${JSON.stringify({
      label: attempt.label,
      categories: attempt.categories,
      name: attempt.name ?? null,
    })}`);

    const payload = await fetchJson<{ features?: GeoapifyPlaceFeature[] }>(url, GEOAPIFY_TIMEOUT_MS);
    const features = Array.isArray(payload.features) ? payload.features : [];
    rawCount += features.length;

    for (const feature of features) {
      const properties = feature.properties ?? {};
      const key =
        normalizeText(properties.place_id) ??
        `${normalizeText(properties.name) ?? "unknown"}:${properties.lat}:${properties.lon}`;
      if (!merged.has(key)) {
        merged.set(key, feature);
      }
    }
  }

  return { features: Array.from(merged.values()), rawCount };
}

function categoriesToText(rawCategories: unknown): string {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return "Place";
  }

  const first = normalizeText(rawCategories[0]);
  if (!first) {
    return "Place";
  }

  return first
    .split(".")
    .slice(-1)[0]
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function countPhraseMatches(haystack: string, phrases: string[]): number {
  return phrases.reduce((count, phrase) => count + (haystack.includes(normalizeToken(phrase)) ? 1 : 0), 0);
}

function buildDeterministicReason(place: RankedCandidate, parsedQuery: ParsedQuery, areaLabel: string): string {
  if (place.matchConfidence === "high") {
    return `Strong match ito sa hanap mong ${parsedQuery.placeType} around ${areaLabel} kasi mismong name niya may direct ${parsedQuery.requiredKeywords[0] ?? parsedQuery.placeType} cue. May trusted Geoapify coordinates din, so safe siyang ipakita sa map.`;
  }

  if (place.matchConfidence === "medium") {
    return `Related option ito for your ${parsedQuery.placeType} search around ${areaLabel}. Hindi exact name match, pero pasok siya sa category o keyword intent kaya puwede siyang fallback choice.`;
  }

  return `Fallback result ito near ${areaLabel}. Pinakita lang siya dahil kulang ang exact ${parsedQuery.placeType} matches, so better i-check muna bago puntahan.`;
}

function rankGeoapifyPlaces(args: {
  features: GeoapifyPlaceFeature[];
  parsedQuery: ParsedQuery;
  area: ResolvedSearchArea;
}): {
  places: RankedCandidate[];
  exactKeywordMatchesCount: number;
  mediumMatchesCount: number;
  fallbackMatchesCount: number;
} {
  const areaText = normalizeToken(args.area.label);
  const places = args.features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const name = normalizeText(properties.name);
      const address =
        normalizeText(properties.formatted) ??
        normalizeText([properties.address_line1, properties.address_line2].filter(Boolean).join(", "));
      const latitude = Number(properties.lat);
      const longitude = Number(properties.lon);
      const categories = Array.isArray(properties.categories) ? uniqueStrings(properties.categories as string[]) : [];

      if (!name || !address || !isFiniteCoordinate(latitude, longitude) || !isInPhilippines(latitude, longitude)) {
        return null;
      }

      const nameText = normalizeToken(name);
      const addressText = normalizeToken(address);
      const categoryText = normalizeToken(categories.join(" "));
      const haystack = `${nameText} ${addressText} ${categoryText}`.trim();
      const exactNameMatches = countPhraseMatches(nameText, args.parsedQuery.requiredKeywords);
      const synonymNameMatches = countPhraseMatches(nameText, args.parsedQuery.keywordSynonyms);
      const addressMatches = countPhraseMatches(addressText, args.parsedQuery.keywordSynonyms);
      const categoryMatches = categories.some((category) =>
        args.parsedQuery.allowedCategories.some((allowedCategory) => category.startsWith(allowedCategory))
      ) ? 1 : 0;
      const distanceKm = getDistanceKm(args.area.center, { latitude, longitude });
      const inArea = haystack.includes(areaText);

      const exactMatch = exactNameMatches > 0 || (args.parsedQuery.normalizedIntent === "samgyup_search" && synonymNameMatches > 0);
      const mediumMatch =
        !exactMatch &&
        (synonymNameMatches > 0 || addressMatches > 0 || categoryMatches > 0);
      const fallbackOnly =
        args.parsedQuery.normalizedIntent === "samgyup_search" &&
        !exactMatch &&
        !(mediumMatch && (addressMatches > 0 || categoryText.includes("korean") || categoryText.includes("bbq")));

      if (args.parsedQuery.normalizedIntent === "samgyup_search" && fallbackOnly && !categoryMatches) {
        return null;
      }

      let matchScore = 0;
      matchScore += exactNameMatches * 60;
      matchScore += synonymNameMatches * 28;
      matchScore += addressMatches * 12;
      matchScore += categoryMatches * 20;
      matchScore += inArea ? 10 : 0;
      matchScore += Math.max(0, 18 - Math.min(distanceKm, 18));
      if (fallbackOnly) {
        matchScore -= 40;
      }
      if (args.parsedQuery.normalizedIntent === "samgyup_search" && !exactMatch && !mediumMatch) {
        matchScore -= 25;
      }

      const matchConfidence: MatchConfidence =
        exactMatch ? "high" : mediumMatch ? "medium" : "fallback";
      const categoryLabel = categoriesToText(properties.categories);
      const candidate: RankedCandidate = {
        id: buildPlaceId(name, latitude, longitude, normalizeText(properties.place_id)),
        name,
        reason: "",
        whyThisFits: "",
        category: categoryLabel,
        address,
        latitude,
        longitude,
        coordinateStatus: "trusted",
        matchConfidence,
        coordinates: {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          source: "geoapify",
          trusted: true,
          verified: true,
        },
        optionalDetails: {
          categoryText: categoryLabel,
          addressText: address,
        },
        source: {
          recommendation: "geoapify_places",
        },
        matchScore,
        distanceKm,
        exactMatch,
        mediumMatch,
        isFallback: matchConfidence === "fallback",
      };

      return candidate;
    })
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort((left, right) => right.matchScore - left.matchScore || (left.distanceKm ?? 999) - (right.distanceKm ?? 999));

  return {
    places,
    exactKeywordMatchesCount: places.filter((place) => place.matchConfidence === "high").length,
    mediumMatchesCount: places.filter((place) => place.matchConfidence === "medium").length,
    fallbackMatchesCount: places.filter((place) => place.matchConfidence === "fallback").length,
  };
}

function getQueryType(parsedQuery: ParsedQuery): AskAiMapsQueryType {
  return parsedQuery.keywords.length >= 3 || parsedQuery.requiredKeywords.length >= 2 ? "specific" : "broad";
}

function buildResultMeta(args: { parsedQuery: ParsedQuery; actualResults: number }): AskAiMapsResultMeta {
  return {
    queryType: getQueryType(args.parsedQuery),
    targetMinResults: args.parsedQuery.targetMinResults,
    targetMaxResults: args.parsedQuery.resultLimit,
    actualResults: args.actualResults,
    resultCountReason:
      args.actualResults === 0
        ? "No Geoapify places matched the parsed search intent."
        : args.actualResults < args.parsedQuery.targetMinResults
          ? "Geoapify returned fewer strong matches than the target minimum."
          : null,
  };
}

function buildAnswerText(count: number, areaLabel: string | null, parsedQuery: ParsedQuery): string {
  if (count === 0) {
    return "Wala akong nahanap na mabilis at solid Geoapify matches for that prompt yet.";
  }

  const areaPart = areaLabel ? ` around ${areaLabel}` : "";
  return `Found ${count} ${parsedQuery.placeType}${count === 1 ? "" : " places"}${areaPart} using Geoapify only.`;
}

function logStructured(logger: AskAiMapsLogger | undefined, label: string, payload: Record<string, unknown>) {
  logger?.log(`[AskAiMaps] ${label} ${JSON.stringify(payload)}`);
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();
  const parsedQuery = buildParsedQuery(params);

  logStructured(logger, "search_logs", {
    parsedQuery,
    extractedLocationText: parsedQuery.locationText,
    normalizedIntent: parsedQuery.normalizedIntent,
    keywordSynonyms: parsedQuery.keywordSynonyms,
    geminiCalled: false,
  });

  const resolvedAreaResult = await resolveSearchArea({
    parsedQuery,
    params,
  });

  logStructured(logger, "search_logs", {
    geoapifyGeocodingCalled: resolvedAreaResult.geocodingCalled,
  });

  if (!resolvedAreaResult.area) {
    throw new AskAiMapsServiceError("Please add a city or area so I can search Geoapify properly.", 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "resolve_location",
    });
  }

  const geoapifyResult = await searchGeoapifyPlaces({
    parsedQuery,
    area: resolvedAreaResult.area,
    logger,
  });

  const ranked = rankGeoapifyPlaces({
    features: geoapifyResult.features,
    parsedQuery,
    area: resolvedAreaResult.area,
  });

  const places = ranked.places
    .slice(0, parsedQuery.resultLimit)
    .map((place) => {
      const whyThisFits = buildDeterministicReason(place, parsedQuery, resolvedAreaResult.area.label);
      return {
        ...place,
        whyThisFits,
        reason: whyThisFits,
      };
    });

  logStructured(logger, "search_logs", {
    geoapifyRawCount: geoapifyResult.rawCount,
    exactKeywordMatchesCount: ranked.exactKeywordMatchesCount,
    mediumMatchesCount: ranked.mediumMatchesCount,
    fallbackMatchesCount: ranked.fallbackMatchesCount,
    finalPlacesCount: places.length,
    geminiCalled: false,
  });

  return {
    mode: "geoapify_places",
    query: parsedQuery.rawQuery,
    searchArea: resolvedAreaResult.area.label,
    answerText: buildAnswerText(places.length, resolvedAreaResult.area.label, parsedQuery),
    summary: buildAnswerText(places.length, resolvedAreaResult.area.label, parsedQuery),
    resultMeta: buildResultMeta({
      parsedQuery,
      actualResults: places.length,
    }),
    places,
    sources: [
      {
        title: "Geoapify Places",
        uri: "https://apidocs.geoapify.com/docs/places/",
        ...(resolvedAreaResult.area.placeId ? { placeId: resolvedAreaResult.area.placeId } : {}),
      },
    ],
    modelUsed: "none",
    explanationSource: "backend_template",
    ...(places.length === 0
      ? {
          emptyReason: "NO_MAP_GROUNDING_RESULTS" as const,
          message: "No Geoapify places matched that request. Try a nearby area or a broader place type.",
        }
      : {}),
    latencyMs: Date.now() - startedAt,
  };
}
