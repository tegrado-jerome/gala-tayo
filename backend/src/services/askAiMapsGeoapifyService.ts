import { GoogleGenAI } from "@google/genai";
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

type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

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
  emptyReason?: AskAiMapsEmptyReason;
  message?: string;
  latencyMs: number;
};

type SearchIntent =
  | "food_search"
  | "mall_search"
  | "cafe_search"
  | "date_spot_search"
  | "activity_search"
  | "tourist_spot_search"
  | "generic_place_search";

type BudgetLevel = "cheap" | "mid" | "premium" | "unknown";

type ParsedSearchPlan = {
  intent: SearchIntent;
  locationText: string | null;
  usesNearMe: boolean;
  placeType: string;
  keywords: string[];
  geoapifyCategories: string[];
  vibeTags: string[];
  budgetLevel: BudgetLevel;
  resultLimit: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
};

type GeoapifyGeocodeFeature = {
  bbox?: number[];
  properties?: {
    place_id?: unknown;
    formatted?: unknown;
    lat?: unknown;
    lon?: unknown;
    country?: unknown;
    country_code?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
  };
};

type ResolvedSearchArea = {
  label: string;
  center: { latitude: number; longitude: number };
  filter: string;
  bias: string;
  placeId?: string;
  bbox?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  };
  radiusMeters: number;
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

type RankedGeoapifyPlace = AskAiMapGroundedPlace & {
  matchScore: number;
  distanceKm: number | null;
};

type SearchAttempt = {
  label: string;
  categories: string[];
  name?: string;
  filter: string;
  bias: string;
  limit: number;
};

type ExplanationPayload = {
  explanations?: Array<{
    id?: unknown;
    whyThisFits?: unknown;
  }>;
};

const GEMINI_MODEL = "models/gemini-3.1-flash-lite";
const GEOAPIFY_GEOCODE_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_PLACES_ENDPOINT = "https://api.geoapify.com/v2/places";
const PROVIDER_TIMEOUT_MS = 20_000;
const GEOAPIFY_TIMEOUT_MS = 8_000;
const MAX_RESULT_LIMIT = 8;
const DEFAULT_RESULT_LIMIT = 8;
const RAW_FETCH_LIMIT = 20;
const PHILIPPINES_LAT_MIN = 4.0;
const PHILIPPINES_LAT_MAX = 21.5;
const PHILIPPINES_LNG_MIN = 116.0;
const PHILIPPINES_LNG_MAX = 127.0;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "around",
  "at",
  "for",
  "good",
  "in",
  "inside",
  "me",
  "near",
  "nearby",
  "of",
  "on",
  "or",
  "place",
  "places",
  "sa",
  "spot",
  "spots",
  "the",
  "to",
  "with",
]);

const SEARCH_INTENTS = new Set<SearchIntent>([
  "food_search",
  "mall_search",
  "cafe_search",
  "date_spot_search",
  "activity_search",
  "tourist_spot_search",
  "generic_place_search",
]);

const BUDGET_LEVELS = new Set<BudgetLevel>(["cheap", "mid", "premium", "unknown"]);

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  samgyup: ["samgyupsal", "korean barbecue", "korean bbq"],
  samgyupsal: ["samgyup", "korean barbecue", "korean bbq"],
  cinema: ["movie theater", "movies"],
  studying: ["study", "coffee shop", "coworking"],
  study: ["studying", "coffee shop", "coworking"],
  cheap: ["budget", "affordable", "sulit"],
  date: ["romantic", "couple", "sunset"],
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

function clampResultLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_RESULT_LIMIT, Math.round(parsed)));
}

function uniqueStrings(values: unknown[], limit = 12): string[] {
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

function stripCodeFences(value: string): string {
  return value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseJsonObject<T>(value: string): T | null {
  const normalized = stripCodeFences(value);

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(normalized.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
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

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(prompt: string): string[] {
  return uniqueStrings(
    normalizeToken(prompt)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
    10
  );
}

function inferBudgetLevel(prompt: string): BudgetLevel {
  const normalized = prompt.toLowerCase();
  if (/\b(cheap|budget|mura|murang|affordable|sulit)\b/.test(normalized)) {
    return "cheap";
  }

  if (/\b(premium|sosyal|luxury|fancy|upscale)\b/.test(normalized)) {
    return "premium";
  }

  if (/\b(mid|sakto|moderate)\b/.test(normalized)) {
    return "mid";
  }

  return "unknown";
}

function inferVibeTags(prompt: string): string[] {
  const normalized = prompt.toLowerCase();
  const tags: string[] = [];

  if (/\b(date|romantic|couple)\b/.test(normalized)) tags.push("date");
  if (/\b(chill|relax|tambay)\b/.test(normalized)) tags.push("chill");
  if (/\b(study|studying|work)\b/.test(normalized)) tags.push("study");
  if (/\b(barkada|friends|group)\b/.test(normalized)) tags.push("barkada");
  if (/\b(family|kids)\b/.test(normalized)) tags.push("family");

  return uniqueStrings(tags);
}

function extractLocationText(prompt: string): string | null {
  const normalized = normalizeWhitespace(prompt);
  const patterns = [
    /\b(?:in|around|near|at|within|sa)\s+([a-zA-Z0-9 .,'-]+?)(?:\s+\b(?:good for|with|for|na|that|where)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const location = normalizeText(match?.[1]);
    if (location && !/\bme\b/i.test(location)) {
      return location;
    }
  }

  return null;
}

function inferIntent(prompt: string): SearchIntent {
  const normalized = prompt.toLowerCase();

  if (/\b(cafe|coffee)\b/.test(normalized)) return "cafe_search";
  if (/\b(mall|malls)\b/.test(normalized)) return "mall_search";
  if (/\b(date|romantic|couple)\b/.test(normalized)) return "date_spot_search";
  if (/\b(tourist|tourism|sightseeing|attraction|museum|heritage)\b/.test(normalized)) {
    return "tourist_spot_search";
  }
  if (/\b(activity|activities|fun|bowling|arcade|hike|hiking)\b/.test(normalized)) {
    return "activity_search";
  }
  if (/\b(food|kainan|eat|eats|restaurant|samgyup|samgyupsal|bbq)\b/.test(normalized)) {
    return "food_search";
  }

  return "generic_place_search";
}

function inferPlaceType(prompt: string, intent: SearchIntent): string {
  const normalized = prompt.toLowerCase();

  if (/\bsamgyup|samgyupsal\b/.test(normalized)) return "samgyupsal";
  if (/\bcinema|movie\b/.test(normalized)) return "cinema";
  if (/\bcafe|coffee\b/.test(normalized)) return "cafe";
  if (/\bmall\b/.test(normalized)) return "mall";
  if (/\bpark\b/.test(normalized)) return "park";

  switch (intent) {
    case "food_search":
      return "restaurant";
    case "mall_search":
      return "mall";
    case "cafe_search":
      return "cafe";
    case "date_spot_search":
      return "date spot";
    case "activity_search":
      return "activity";
    case "tourist_spot_search":
      return "tourist spot";
    default:
      return "place";
  }
}

function mapCategories(intent: SearchIntent, keywords: string[], prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  if (/\bcinema|movie\b/.test(normalized)) {
    return uniqueStrings(["entertainment.cinema", "commercial.shopping_mall"]);
  }

  switch (intent) {
    case "food_search":
      return uniqueStrings(["catering.restaurant", "catering.fast_food"]);
    case "mall_search":
      return uniqueStrings(["commercial.shopping_mall"]);
    case "cafe_search":
      return uniqueStrings([
        "catering.cafe",
        "catering.cafe.coffee",
        "catering.cafe.coffee_shop",
      ]);
    case "date_spot_search":
      return uniqueStrings([
        "leisure.park",
        "tourism.attraction",
        "catering.restaurant",
        "catering.cafe",
        "entertainment.cinema",
      ]);
    case "activity_search":
      return uniqueStrings(["entertainment", "leisure", "national_park"]);
    case "tourist_spot_search":
      return uniqueStrings([
        "tourism.attraction",
        "entertainment.museum",
        "leisure.park",
        "national_park",
      ]);
    default:
      if (keywords.some((keyword) => keyword.includes("park"))) return ["leisure.park"];
      if (keywords.some((keyword) => keyword.includes("museum"))) return ["entertainment.museum"];
      if (keywords.some((keyword) => keyword.includes("food"))) return ["catering.restaurant"];
      return uniqueStrings(["tourism.attraction", "catering.cafe", "leisure.park"]);
  }
}

function fallbackKeywordParsing(prompt: string, params: AskAiMapsSearchParams): ParsedSearchPlan {
  const intent = inferIntent(prompt);
  const keywords = extractKeywords(prompt);
  const locationText = extractLocationText(prompt);
  const usesNearMe =
    params.nearMe === true ||
    /\b(near me|nearby|around me|close to me|malapit sakin|malapit sa akin)\b/i.test(prompt);
  const geoapifyCategories = mapCategories(intent, keywords, prompt);
  const plan: ParsedSearchPlan = {
    intent,
    locationText,
    usesNearMe,
    placeType: inferPlaceType(prompt, intent),
    keywords,
    geoapifyCategories,
    vibeTags: inferVibeTags(prompt),
    budgetLevel: inferBudgetLevel(prompt),
    resultLimit: DEFAULT_RESULT_LIMIT,
    needsClarification: !locationText && !usesNearMe && !params.userLocation,
    clarificationQuestion:
      !locationText && !usesNearMe && !params.userLocation
        ? "Anong area ang gusto mong i-search?"
        : null,
  };

  return plan;
}

function sanitizePlan(raw: unknown, fallbackPlan: ParsedSearchPlan): ParsedSearchPlan {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intent = normalizeText(candidate.intent);
  const locationText = normalizeText(candidate.locationText);
  const placeType = normalizeText(candidate.placeType) ?? fallbackPlan.placeType;
  const budgetLevel = normalizeText(candidate.budgetLevel)?.toLowerCase() as BudgetLevel | undefined;
  const parsedPlan: ParsedSearchPlan = {
    intent: SEARCH_INTENTS.has(intent as SearchIntent)
      ? (intent as SearchIntent)
      : fallbackPlan.intent,
    locationText,
    usesNearMe: candidate.usesNearMe === true || fallbackPlan.usesNearMe,
    placeType,
    keywords: Array.isArray(candidate.keywords)
      ? uniqueStrings(candidate.keywords, 10)
      : fallbackPlan.keywords,
    geoapifyCategories: Array.isArray(candidate.geoapifyCategories)
      ? uniqueStrings(candidate.geoapifyCategories, 8)
      : fallbackPlan.geoapifyCategories,
    vibeTags: Array.isArray(candidate.vibeTags)
      ? uniqueStrings(candidate.vibeTags, 8)
      : fallbackPlan.vibeTags,
    budgetLevel: budgetLevel && BUDGET_LEVELS.has(budgetLevel) ? budgetLevel : fallbackPlan.budgetLevel,
    resultLimit: clampResultLimit(candidate.resultLimit),
    needsClarification: candidate.needsClarification === true,
    clarificationQuestion: normalizeText(candidate.clarificationQuestion),
  };

  if (parsedPlan.geoapifyCategories.length === 0) {
    parsedPlan.geoapifyCategories = fallbackPlan.geoapifyCategories;
  }

  if (parsedPlan.keywords.length === 0) {
    parsedPlan.keywords = fallbackPlan.keywords;
  }

  if (!parsedPlan.placeType) {
    parsedPlan.placeType = fallbackPlan.placeType;
  }

  return parsedPlan;
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

async function runGeminiJsonPrompt<T>(args: {
  ai: GoogleGenAI;
  prompt: string;
  logger?: AskAiMapsLogger;
  stage: string;
}): Promise<{ rawText: string; parsed: T | null }> {
  const response = await withTimeout(
    args.ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: args.prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      } as never,
    }),
    PROVIDER_TIMEOUT_MS,
    "Gemini timed out."
  );

  const rawText = normalizeText((response as { text?: string }).text) ?? "";
  args.logger?.log(`[AskAiMaps] ${args.stage} rawGeminiLength=${rawText.length}`);
  return {
    rawText,
    parsed: rawText ? parseJsonObject<T>(rawText) : null,
  };
}

function buildIntentParserPrompt(prompt: string): string {
  return [
    "You are an intent parser for a maps search product.",
    "Return strict JSON only. No markdown. No prose. No code fences.",
    "Never return places, coordinates, ratings, hours, addresses, or recommendations.",
    "Only return a search plan using this exact schema:",
    '{',
    '  "intent": "food_search | mall_search | cafe_search | date_spot_search | activity_search | tourist_spot_search | generic_place_search",',
    '  "locationText": "string or null",',
    '  "usesNearMe": true,',
    '  "placeType": "string",',
    '  "keywords": ["string"],',
    '  "geoapifyCategories": ["string"],',
    '  "vibeTags": ["string"],',
    '  "budgetLevel": "cheap | mid | premium | unknown",',
    '  "resultLimit": 8,',
    '  "needsClarification": false,',
    '  "clarificationQuestion": null',
    "}",
    "If the user did not specify a location and did not say near me, set needsClarification true.",
    `User prompt: ${JSON.stringify(prompt)}`,
  ].join("\n");
}

async function parsePromptWithGemini(
  prompt: string,
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<{ plan: ParsedSearchPlan; modelUsed: string | null }> {
  const fallbackPlan = fallbackKeywordParsing(prompt, params);

  try {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const { parsed } = await runGeminiJsonPrompt<ParsedSearchPlan>({
      ai,
      prompt: buildIntentParserPrompt(prompt),
      logger,
      stage: "intent_parser",
    });

    return {
      plan: sanitizePlan(parsed, fallbackPlan),
      modelUsed: GEMINI_MODEL,
    };
  } catch (error) {
    logger?.log(
      `[AskAiMaps] intent_parser_fallback=${error instanceof Error ? error.message : String(error)}`
    );
    return {
      plan: fallbackPlan,
      modelUsed: null,
    };
  }
}

async function fetchJson<T>(url: URL, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
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

function parseBbox(rawBbox: number[] | undefined): ResolvedSearchArea["bbox"] | undefined {
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

function buildAreaFromCoordinates(args: {
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): ResolvedSearchArea {
  return {
    label: args.label,
    center: {
      latitude: args.latitude,
      longitude: args.longitude,
    },
    filter: `circle:${args.longitude},${args.latitude},${args.radiusMeters}`,
    bias: `proximity:${args.longitude},${args.latitude}`,
    radiusMeters: args.radiusMeters,
  };
}

async function resolveSearchArea(args: {
  plan: ParsedSearchPlan;
  params: AskAiMapsSearchParams;
  logger?: AskAiMapsLogger;
}): Promise<{ area: ResolvedSearchArea | null; geocodingCalled: boolean }> {
  const { plan, params, logger } = args;

  if (plan.locationText) {
    const apiKey = await getGeoapifyApiKey();
    const url = new URL(GEOAPIFY_GEOCODE_ENDPOINT);
    url.searchParams.set("text", `${plan.locationText}, Philippines`);
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
    const formatted = normalizeText(properties.formatted) ?? `${plan.locationText}, Philippines`;
    const bbox = parseBbox(feature?.bbox);
    const area =
      placeId
        ? {
            label: formatted,
            center: { latitude, longitude },
            filter: `place:${placeId}`,
            bias: `proximity:${longitude},${latitude}`,
            placeId,
            bbox,
            radiusMeters: 20_000,
          }
        : buildAreaFromCoordinates({
            label: formatted,
            latitude,
            longitude,
            radiusMeters: bbox ? 18_000 : 15_000,
          });

    logger?.log(`[AskAiMaps] resolvedArea=${JSON.stringify(area)}`);
    return { area, geocodingCalled: true };
  }

  if ((plan.usesNearMe || params.nearMe) && params.userLocation) {
    return {
      area: buildAreaFromCoordinates({
        label: "near you",
        latitude: params.userLocation.latitude,
        longitude: params.userLocation.longitude,
        radiusMeters: 12_000,
      }),
      geocodingCalled: false,
    };
  }

  if (params.userLocation) {
    return {
      area: buildAreaFromCoordinates({
        label: "your current area",
        latitude: params.userLocation.latitude,
        longitude: params.userLocation.longitude,
        radiusMeters: 12_000,
      }),
      geocodingCalled: false,
    };
  }

  return {
    area: null,
    geocodingCalled: false,
  };
}

function getSynonymKeywords(keywords: string[]): string[] {
  const synonyms: string[] = [];

  for (const keyword of keywords) {
    for (const synonym of KEYWORD_SYNONYMS[keyword.toLowerCase()] ?? []) {
      synonyms.push(synonym);
    }
  }

  return uniqueStrings(synonyms, 6);
}

function buildSearchAttempts(plan: ParsedSearchPlan, area: ResolvedSearchArea): SearchAttempt[] {
  const exactName = normalizeText([plan.placeType, ...plan.keywords].join(" ").trim()) ?? undefined;
  const synonymKeywords = getSynonymKeywords(plan.keywords);
  const attempts: SearchAttempt[] = [];

  if (exactName) {
    attempts.push({
      label: "exact_keyword_category",
      categories: plan.geoapifyCategories,
      name: exactName,
      filter: area.filter,
      bias: area.bias,
      limit: RAW_FETCH_LIMIT,
    });
  }

  for (const synonym of synonymKeywords.slice(0, 2)) {
    attempts.push({
      label: "synonym_keyword_category",
      categories: plan.geoapifyCategories,
      name: synonym,
      filter: area.filter,
      bias: area.bias,
      limit: RAW_FETCH_LIMIT,
    });
  }

  attempts.push({
    label: "broader_category_only",
    categories: plan.geoapifyCategories,
    filter: area.filter,
    bias: area.bias,
    limit: RAW_FETCH_LIMIT,
  });

  if (area.filter.startsWith("circle:")) {
    attempts.push({
      label: "nearby_radius_search",
      categories: plan.geoapifyCategories,
      filter: `circle:${area.center.longitude},${area.center.latitude},${Math.max(area.radiusMeters, 20_000)}`,
      bias: area.bias,
      limit: RAW_FETCH_LIMIT,
    });
  }

  return attempts;
}

async function searchGeoapifyPlaces(args: {
  area: ResolvedSearchArea;
  plan: ParsedSearchPlan;
  logger?: AskAiMapsLogger;
}): Promise<{ features: GeoapifyPlaceFeature[]; rawCount: number; placesCalled: number }> {
  const apiKey = await getGeoapifyApiKey();
  const attempts = buildSearchAttempts(args.plan, args.area);
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

    args.logger?.log(
      `[AskAiMaps] geoapifyPlacesCalled ${JSON.stringify({
        label: attempt.label,
        categories: attempt.categories,
        name: attempt.name ?? null,
      })}`
    );

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

  return {
    features: Array.from(merged.values()),
    rawCount,
    placesCalled: attempts.length,
  };
}

function categoriesToText(rawCategories: unknown): string {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return "Place";
  }

  const first = normalizeText(rawCategories[0]);
  if (!first) {
    return "Place";
  }

  const normalized = first
    .split(".")
    .slice(-1)[0]
    .replace(/_/g, " ");

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rankGeoapifyPlaces(args: {
  features: GeoapifyPlaceFeature[];
  area: ResolvedSearchArea;
  plan: ParsedSearchPlan;
  query: string;
}): RankedGeoapifyPlace[] {
  const targetAreaText = normalizeToken(args.area.label);

  return args.features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const name = normalizeText(properties.name);
      const address =
        normalizeText(properties.formatted) ??
        normalizeText([properties.address_line1, properties.address_line2].filter(Boolean).join(", "));
      const latitude = Number(properties.lat);
      const longitude = Number(properties.lon);
      const categories = Array.isArray(properties.categories)
        ? uniqueStrings(properties.categories)
        : [];

      if (!name || !address || !isFiniteCoordinate(latitude, longitude) || !isInPhilippines(latitude, longitude)) {
        return null;
      }

      const haystack = normalizeToken(`${name} ${address} ${categories.join(" ")}`);
      let keywordScore = 0;
      for (const keyword of args.plan.keywords) {
        if (haystack.includes(normalizeToken(keyword))) {
          keywordScore += 18;
        }
      }

      if (args.plan.placeType && haystack.includes(normalizeToken(args.plan.placeType))) {
        keywordScore += 16;
      }

      const categoryScore = categories.some((category) =>
        args.plan.geoapifyCategories.some((expected) => category.startsWith(expected))
      )
        ? 30
        : 10;

      const distanceKm = getDistanceKm(args.area.center, { latitude, longitude });
      const distanceScore = Math.max(0, 25 - Math.min(distanceKm, 25));
      const areaScore = haystack.includes(targetAreaText) ? 12 : 0;
      const completenessScore = 15;
      const totalScore = keywordScore + categoryScore + distanceScore + areaScore + completenessScore;

      const rankedPlace: RankedGeoapifyPlace = {
        id: buildPlaceId(name, latitude, longitude, normalizeText(properties.place_id)),
        name,
        reason: "",
        whyThisFits: "",
        category: categoriesToText(properties.categories),
        address,
        latitude,
        longitude,
        coordinateStatus: "trusted" as const,
        coordinates: {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
        },
        optionalDetails: {
          categoryText: categoriesToText(properties.categories),
          addressText: address,
        },
        source: {
          recommendation: "geoapify_places" as const,
        },
        matchScore: totalScore,
        distanceKm,
      };

      return rankedPlace;
    })
    .filter((place): place is RankedGeoapifyPlace => place !== null)
    .sort((left, right) => right.matchScore - left.matchScore || (left.distanceKm ?? 999) - (right.distanceKm ?? 999));
}

function buildFallbackWhyThisFits(place: AskAiMapGroundedPlace, plan: ParsedSearchPlan): string {
  const category = place.optionalDetails?.categoryText ?? place.category ?? "place";
  const area = plan.locationText ?? (plan.usesNearMe ? "near you" : "that area");
  const focus = plan.keywords[0] ?? plan.placeType ?? "trip";
  return `${place.name} mukhang swak for your ${focus} search. Pasok din siya sa ${category.toLowerCase()} results around ${area}.`;
}

function buildExplanationsPrompt(args: {
  prompt: string;
  places: AskAiMapGroundedPlace[];
  plan: ParsedSearchPlan;
}): string {
  return [
    "You explain why already-selected places fit a user prompt.",
    "Return strict JSON only. No markdown. No prose outside JSON.",
    "Do not invent place names, coordinates, ratings, hours, review counts, or addresses.",
    "Use only the provided places and IDs.",
    "Schema:",
    '{ "explanations": [ { "id": "same Geoapify place id", "whyThisFits": "2-3 Taglish sentences" } ] }',
    `Original user prompt: ${JSON.stringify(args.prompt)}`,
    `Matched keywords: ${JSON.stringify(args.plan.keywords)}`,
    `Matched categories: ${JSON.stringify(args.plan.geoapifyCategories)}`,
    `Selected places: ${JSON.stringify(
      args.places.map((place) => ({
        id: place.id,
        name: place.name,
        category: place.optionalDetails?.categoryText ?? place.category ?? null,
        address: place.optionalDetails?.addressText ?? place.address ?? null,
      }))
    )}`,
  ].join("\n");
}

async function explainPlaces(args: {
  prompt: string;
  places: AskAiMapGroundedPlace[];
  plan: ParsedSearchPlan;
  logger?: AskAiMapsLogger;
}): Promise<{ explanations: Map<string, string>; modelUsed: string | null }> {
  if (args.places.length === 0) {
    return { explanations: new Map(), modelUsed: null };
  }

  try {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const { parsed } = await runGeminiJsonPrompt<ExplanationPayload>({
      ai,
      prompt: buildExplanationsPrompt(args),
      logger: args.logger,
      stage: "explanation_generator",
    });

    const validIds = new Set(args.places.map((place) => place.id));
    const explanations = new Map<string, string>();

    for (const item of parsed?.explanations ?? []) {
      const id = normalizeText(item.id);
      const whyThisFits = normalizeText(item.whyThisFits);
      if (!id || !whyThisFits || !validIds.has(id)) {
        continue;
      }

      explanations.set(id, whyThisFits);
    }

    return { explanations, modelUsed: GEMINI_MODEL };
  } catch (error) {
    args.logger?.log(
      `[AskAiMaps] explanation_fallback=${error instanceof Error ? error.message : String(error)}`
    );
    return { explanations: new Map(), modelUsed: null };
  }
}

function getQueryType(plan: ParsedSearchPlan): AskAiMapsQueryType {
  if (plan.keywords.length >= 3 || plan.placeType.split(" ").length >= 2) {
    return "specific";
  }

  return "broad";
}

function buildResultMeta(args: {
  plan: ParsedSearchPlan;
  actualResults: number;
}): AskAiMapsResultMeta {
  return {
    queryType: getQueryType(args.plan),
    targetMinResults: 4,
    targetMaxResults: args.plan.resultLimit,
    actualResults: args.actualResults,
    resultCountReason:
      args.actualResults === 0
        ? "No Geoapify places matched the validated search plan."
        : args.actualResults < args.plan.resultLimit
          ? "Geoapify returned fewer verified matches than requested."
          : null,
  };
}

function buildAnswerText(resultCount: number, areaLabel: string | null, plan: ParsedSearchPlan): string {
  if (resultCount === 0) {
    return "Wala akong nahanap na solid Geoapify matches for that prompt yet.";
  }

  const areaPart = areaLabel ? ` around ${areaLabel}` : "";
  const typePart = plan.placeType || "places";
  return `Found ${resultCount} ${typePart}${resultCount === 1 ? "" : "s"}${areaPart} using Geoapify as the place source.`;
}

function logStructured(logger: AskAiMapsLogger | undefined, label: string, payload: Record<string, unknown>) {
  logger?.log(`[AskAiMaps] ${label} ${JSON.stringify(payload)}`);
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();
  const rawUserPrompt = normalizeText(params.query);

  if (!rawUserPrompt) {
    throw new AskAiMapsServiceError("Query is required.", 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "validate_query",
    });
  }

  const parseResult = await parsePromptWithGemini(rawUserPrompt, params, logger);
  const parsedSearchPlan = parseResult.plan;

  logStructured(logger, "search_logs", {
    rawUserPrompt,
    parsedSearchPlan,
  });

  const resolvedAreaResult = await resolveSearchArea({
    plan: parsedSearchPlan,
    params,
    logger,
  });

  logStructured(logger, "search_logs", {
    geoapifyGeocodingCalled: resolvedAreaResult.geocodingCalled,
  });

  if (!resolvedAreaResult.area) {
    throw new AskAiMapsServiceError(
      parsedSearchPlan.clarificationQuestion ?? "Please add a city or area so I can search Geoapify properly.",
      400,
      {
        code: "ASK_AI_MAPS_BAD_REQUEST",
        stage: "resolve_location",
      }
    );
  }

  const geoapifyResult = await searchGeoapifyPlaces({
    area: resolvedAreaResult.area,
    plan: parsedSearchPlan,
    logger,
  });

  logStructured(logger, "search_logs", {
    geoapifyPlacesCalled: geoapifyResult.placesCalled,
    rawGeoapifyCount: geoapifyResult.rawCount,
  });

  const rankedPlaces = rankGeoapifyPlaces({
    features: geoapifyResult.features,
    area: resolvedAreaResult.area,
    plan: parsedSearchPlan,
    query: rawUserPrompt,
  }).slice(0, parsedSearchPlan.resultLimit);

  const explanationResult = await explainPlaces({
    prompt: rawUserPrompt,
    places: rankedPlaces,
    plan: parsedSearchPlan,
    logger,
  });

  logStructured(logger, "search_logs", {
    finalGeoapifyCount: rankedPlaces.length,
    explanationGenerationCalled: rankedPlaces.length > 0,
  });

  const places = rankedPlaces.map((place) => {
    const whyThisFits =
      explanationResult.explanations.get(place.id) ?? buildFallbackWhyThisFits(place, parsedSearchPlan);

    return {
      ...place,
      whyThisFits,
      reason: whyThisFits,
    };
  });

  return {
    mode: "geoapify_places",
    query: rawUserPrompt,
    searchArea: resolvedAreaResult.area.label,
    answerText: buildAnswerText(places.length, resolvedAreaResult.area.label, parsedSearchPlan),
    summary: buildAnswerText(places.length, resolvedAreaResult.area.label, parsedSearchPlan),
    resultMeta: buildResultMeta({
      plan: parsedSearchPlan,
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
    modelUsed: parseResult.modelUsed ?? explanationResult.modelUsed ?? undefined,
    ...(places.length === 0
      ? {
          emptyReason: "NO_MAP_GROUNDING_RESULTS" as const,
          message: "No Geoapify places matched that request. Try a nearby area or a broader place type.",
        }
      : {}),
    latencyMs: Date.now() - startedAt,
  };
}
