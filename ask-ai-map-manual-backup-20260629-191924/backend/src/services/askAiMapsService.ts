import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { normalizeSearchText } from "../utils/searchMatching";

export class AskAiMapsServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AskAiMapsServiceError";
    this.status = status;
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

export type AskAiMapGroundedPlace = {
  id: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  openStatus?: string;
  address?: string;
  locationText?: string;
  description?: string;
  queryReason?: string;
  subtitle?: string;
  summary?: string;
  googleMapsUrl?: string;
  googleMapsUri?: string;
  placeId?: string;
  reviewSnippets?: string[];
  sourceTitle?: string;
  sourceUri?: string;
  coordinates?: {
    lat?: number;
    lng?: number;
    latitude: number;
    longitude: number;
  };
  reason: string;
  whyThisFits?: string;
  optionalDetails?: {
    categoryText?: string;
    ratingText?: string;
    reviewCountText?: string;
    openStatusText?: string;
    addressText?: string;
    hoursText?: string;
  };
};

export type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

export type AskAiMapsSearchResult = {
  query: string;
  mode: "map_grounding_only";
  answerText: string;
  places: AskAiMapGroundedPlace[];
  sources: AskAiMapsSource[];
  modelUsed?: string;
  emptyReason?: AskAiMapsEmptyReason;
  message?: string;
  latencyMs: number;
};

type ParsedGroundedPlace = {
  name?: unknown;
  reason?: unknown;
  whyThisFits?: unknown;
  subtitle?: unknown;
  description?: unknown;
  summary?: unknown;
  category?: unknown;
  categoryText?: unknown;
  openStatus?: unknown;
  openingHoursText?: unknown;
  openStatusText?: unknown;
  address?: unknown;
  locationText?: unknown;
  addressText?: unknown;
  rating?: unknown;
  ratingText?: unknown;
  reviewCount?: unknown;
  reviewCountText?: unknown;
  hoursText?: unknown;
  googleMapsUri?: unknown;
  googleMapsUrl?: unknown;
  placeId?: unknown;
  reviewSnippets?: unknown;
  coordinates?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
};

type ParsedModelResponse = {
  answerText?: unknown;
  places?: unknown;
  results?: unknown;
  recommendations?: unknown;
  items?: unknown;
  data?: unknown;
};

type ParseModelResponseResult = {
  parsed: ParsedModelResponse | null;
  parseError?: string;
  parsedFrom?: string;
  rawJsonCandidate?: string;
};

type GroundingMetadataLike = {
  groundingChunks?: Array<{
    maps?: {
      title?: string;
      text?: string;
      uri?: string;
      url?: string;
      sourceUri?: string;
      placeId?: string;
      place_id?: string;
    };
  }>;
  grounding_chunks?: Array<{
    maps?: Record<string, unknown>;
    map?: Record<string, unknown>;
    googleMaps?: Record<string, unknown>;
    google_maps?: Record<string, unknown>;
  }>;
};

type GroundingSource = {
  title?: string;
  text?: string;
  uri?: string;
  placeId?: string;
  rating?: number;
  reviewCount?: number;
  categoryText?: string;
  ratingText?: string;
  reviewCountText?: string;
  openStatusText?: string;
  addressText?: string;
  locationText?: string;
  hoursText?: string;
  reviewSnippets?: string[];
  coordinates?: {
    lat?: number;
    lng?: number;
    latitude: number;
    longitude: number;
  };
};

type AskAiMapsLogger = {
  log: (message: string) => void;
};

type StoredPlaceCoordinateCandidate = {
  name: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const ASK_AI_MAPS_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

const ASK_AI_MAPS_MAX_PLACES = 8;
const RETRYABLE_AI_STATUSES = new Set([403, 429, 500, 503, 504]);
const ASK_AI_MAPS_FALLBACK_DELAY_MS = 250;
const ASK_AI_MAPS_PROVIDER_COOLDOWN_MS = 60_000;
const ASK_AI_MAPS_PROVIDER_TIMEOUT_MS = 22_000;
const PROVIDER_BUSY_MESSAGE = "Ask AI Maps is busy right now. Try again in a bit.";
const NO_RESULTS_MESSAGE =
  "No places matched that request. Try a more specific area or place type.";
const RETRYABLE_PROVIDER_MESSAGE_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /quota/i,
  /resource exhausted/i,
  /consumed/i,
  /exceeded/i,
  /limit reached/i,
  /temporar(?:y|ily) unavailable/i,
  /unavailable/i,
  /overloaded/i,
  /try again later/i,
] as const;

let askAiMapsCooldownUntil = 0;
const coordinateCache = new Map<string, { latitude: number; longitude: number }>();
const COORDINATE_CACHE_MAX_SIZE = 200;

function pruneCoordinateCache() {
  if (coordinateCache.size > COORDINATE_CACHE_MAX_SIZE) {
    const keysToDelete = [...coordinateCache.keys()].slice(0, coordinateCache.size - COORDINATE_CACHE_MAX_SIZE);
    for (const key of keysToDelete) {
      coordinateCache.delete(key);
    }
  }
}

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

function normalizeOptionalDisplayText(value: unknown): string | undefined {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  const folded = normalized.toLowerCase();

  if (
    folded === "unknown" ||
    folded === "n/a" ||
    folded === "none" ||
    folded.includes("only if available")
  ) {
    return undefined;
  }

  return normalized;
}

function getObjectField(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeTextNode(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizeText(record.text ?? record.displayName ?? record.label ?? null);
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function normalizeTextList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeTextNode(item))
      .filter((item): item is string => Boolean(item));

    return items.length > 0 ? items : undefined;
  }

  const single = normalizeTextNode(value);
  return single ? [single] : undefined;
}

function normalizeCategoryText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value
      .map((entry) => normalizeTextNode(entry))
      .find(Boolean);

    return first ?? undefined;
  }

  return normalizeTextNode(value) ?? normalizeOptionalDisplayText(value);
}

function normalizeOpenStatusText(value: unknown): string | undefined {
  if (typeof value === "boolean") {
    return value ? "Open now" : "Closed now";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.openNow === "boolean") {
      return record.openNow ? "Open now" : "Closed now";
    }
  }

  return normalizeOptionalDisplayText(value);
}

function normalizeHoursText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => normalizeTextNode(entry))
      .filter((entry): entry is string => Boolean(entry));

    return items[0];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const weekdayDescriptions = normalizeTextList(
      record.weekdayDescriptions ?? record.weekday_descriptions
    );

    if (weekdayDescriptions?.[0]) {
      return weekdayDescriptions[0];
    }
  }

  return normalizeTextNode(value) ?? normalizeOptionalDisplayText(value);
}

function normalizeRatingText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return normalizeOptionalDisplayText(value);
}

function normalizeRatingNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(1));
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Number(parsed.toFixed(1)) : undefined;
  }

  return undefined;
}

function normalizeReviewCountNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");

    if (!digits) {
      return undefined;
    }

    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeReviewCountText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.round(value)} reviews`;
  }

  const text = normalizeOptionalDisplayText(value);

  if (!text) {
    return undefined;
  }

  return /\breviews?\b/i.test(text) ? text : `${text} reviews`;
}

function toResponseCoordinates(coordinates: {
  latitude: number;
  longitude: number;
}): {
  lat: number;
  lng: number;
  latitude: number;
  longitude: number;
} {
  return {
    lat: coordinates.latitude,
    lng: coordinates.longitude,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function isTechnicalFallbackText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return /google maps (?:result|grounding|context)|map-grounded|grounded option|matched your request|returned by google maps/i.test(value);
}

function normalizeUserFacingText(value: unknown): string | undefined {
  const normalized = normalizeOptionalDisplayText(value);

  return normalized && !isTechnicalFallbackText(normalized) ? normalized : undefined;
}

function normalizePlaceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCoordinateValue(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCoordinatesFromGoogleMapsUrl(uri: string | undefined): {
  latitude: number;
  longitude: number;
} | null {
  if (!uri) {
    return null;
  }

  const candidateValues = [
    uri,
    (() => {
      try {
        return decodeURIComponent(uri);
      } catch {
        return uri;
      }
    })(),
  ];

  for (const candidateValue of candidateValues) {
    const atMatch = candidateValue.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);

    if (atMatch) {
      const latitude = parseCoordinateValue(atMatch[1]);
      const longitude = parseCoordinateValue(atMatch[2]);

      if (latitude !== null && longitude !== null) {
        return { latitude, longitude };
      }
    }

    const bangMatch = candidateValue.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

    if (bangMatch) {
      const latitude = parseCoordinateValue(bangMatch[1]);
      const longitude = parseCoordinateValue(bangMatch[2]);

      if (latitude !== null && longitude !== null) {
        return { latitude, longitude };
      }
    }

    const queryMatch = candidateValue.match(/[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);

    if (queryMatch) {
      const latitude = parseCoordinateValue(queryMatch[1]);
      const longitude = parseCoordinateValue(queryMatch[2]);

      if (latitude !== null && longitude !== null) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

function extractCoordinatesFromParsedPlace(
  place: ParsedGroundedPlace
): { latitude: number; longitude: number } | null {
  const nestedCoordinates =
    place.coordinates && typeof place.coordinates === "object"
      ? (place.coordinates as {
          latitude?: unknown;
          longitude?: unknown;
          lat?: unknown;
          lng?: unknown;
        })
      : null;

  const latitude = Number(
    nestedCoordinates?.latitude ?? nestedCoordinates?.lat ?? place.latitude ?? place.lat
  );
  const longitude = Number(
    nestedCoordinates?.longitude ?? nestedCoordinates?.lng ?? place.longitude ?? place.lng
  );

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function extractCoordinatesFromGoogleMapsPlaceObject(
  place: Record<string, unknown>
): { latitude: number; longitude: number } | null {
  const location = getObjectField(place, ["location", "coordinates", "latLng", "lat_lng"]);
  const geometry = getObjectField(place, ["geometry"]);

  const candidates = [location, geometry];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const nestedLocation = getObjectField(record, ["location"]);
    const node =
      nestedLocation && typeof nestedLocation === "object"
        ? (nestedLocation as Record<string, unknown>)
        : record;

    const latitude = Number(
      getObjectField(node, ["latitude", "lat", "_latitude", "x"])
    );
    const longitude = Number(
      getObjectField(node, ["longitude", "lng", "lon", "_longitude", "y"])
    );

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function toPlaceId(value: string, fallbackIndex: number): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return normalized || `ask-ai-map-place-${fallbackIndex + 1}`;
}

function sanitizeJsonText(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObjectText(text: string): string {
  const sanitized = sanitizeJsonText(text);
  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return sanitized;
  }

  return sanitized.slice(firstBrace, lastBrace + 1);
}

function extractJsonArrayText(text: string): string {
  const sanitized = sanitizeJsonText(text);
  const firstBracket = sanitized.indexOf("[");
  const lastBracket = sanitized.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    return sanitized;
  }

  return sanitized.slice(firstBracket, lastBracket + 1);
}

function coerceParsedModelResponse(value: unknown): ParsedModelResponse | null {
  if (Array.isArray(value)) {
    return { places: value };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;

  return {
    answerText:
      record.answerText ??
      record.answer_text ??
      record.answer ??
      record.summary ??
      nestedData?.answerText ??
      nestedData?.answer_text ??
      nestedData?.answer ??
      nestedData?.summary,
    places:
      record.places ??
      record.results ??
      record.recommendations ??
      record.items ??
      nestedData?.places ??
      nestedData?.results ??
      nestedData?.recommendations ??
      nestedData?.items,
  };
}

function parseModelResponseDetailed(text: string): ParseModelResponseResult {
  const sanitized = sanitizeJsonText(text);
  const candidates: Array<{ label: string; json: string }> = [];
  const objectText = extractJsonObjectText(text);
  const arrayText = extractJsonArrayText(text);

  if (sanitized) {
    candidates.push({ label: "sanitized", json: sanitized });
  }
  if (objectText && objectText !== sanitized) {
    candidates.push({ label: "object_slice", json: objectText });
  }
  if (arrayText && arrayText !== sanitized && arrayText !== objectText) {
    candidates.push({ label: "array_slice", json: arrayText });
  }

  let lastError = "No JSON candidate found.";

  for (const candidate of candidates) {
    const trimmed = candidate.json.trim();

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      lastError = `Candidate ${candidate.label} did not start with JSON.`;
      continue;
    }

    try {
      const parsedValue = JSON.parse(trimmed) as unknown;
      const parsed = coerceParsedModelResponse(parsedValue);

      if (parsed) {
        return {
          parsed,
          parsedFrom: candidate.label,
          rawJsonCandidate: trimmed,
        };
      }

      lastError = `Candidate ${candidate.label} parsed but was not coercible.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : `Unknown parse error in ${candidate.label}.`;
    }
  }

  return {
    parsed: null,
    parseError: lastError,
    rawJsonCandidate: candidates[0]?.json,
  };
}

function parseModelResponse(text: string): ParsedModelResponse | null {
  return parseModelResponseDetailed(text).parsed;
}

function getErrorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 502;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new AskAiMapsServiceError(message, 504));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function isAskAiMapsRawDebugEnabled(): boolean {
  return process.env.DEBUG_ASK_AI_MAPS_RAW === "true";
}

function sanitizeForDebug(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function sanitize(node: unknown): unknown {
    if (node === null || node === undefined) return node;

    if (
      typeof node === "string" ||
      typeof node === "number" ||
      typeof node === "boolean"
    ) {
      return node;
    }

    if (typeof node === "bigint") {
      return node.toString();
    }

    if (node instanceof Error) {
      return {
        name: node.name,
        message: node.message,
        stack: node.stack,
      };
    }

    if (typeof node !== "object") return String(node);

    if (seen.has(node as object)) return "[Circular]";
    seen.add(node as object);

    if (Array.isArray(node)) {
      return node.map((item) => sanitize(item));
    }

    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();

      const shouldRedact =
        lowerKey.includes("apikey") ||
        lowerKey === "key" ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("authorization") ||
        lowerKey.includes("accesstoken") ||
        lowerKey.includes("refreshtoken") ||
        lowerKey.includes("password") ||
        lowerKey.includes("credential") ||
        lowerKey.includes("bearer");

      output[key] = shouldRedact ? "[REDACTED]" : sanitize(child);
    }

    return output;
  }

  return sanitize(value);
}

function findCoordinateLikeFields(value: unknown): Array<{ path: string; value: unknown }> {
  const hits: Array<{ path: string; value: unknown }> = [];
  const seen = new WeakSet<object>();

  function walk(node: unknown, path: string) {
    if (node === null || node === undefined) return;
    if (typeof node !== "object") return;

    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();

      const isCoordinateLike =
        lowerKey.includes("lat") ||
        lowerKey.includes("latitude") ||
        lowerKey.includes("lng") ||
        lowerKey.includes("lon") ||
        lowerKey.includes("longitude") ||
        lowerKey.includes("coord") ||
        lowerKey.includes("coordinate") ||
        lowerKey.includes("location") ||
        lowerKey.includes("viewport") ||
        lowerKey.includes("geometry");

      if (isCoordinateLike) {
        hits.push({
          path: childPath,
          value: sanitizeForDebug(child),
        });
      }

      walk(child, childPath);
    }
  }

  walk(value, "");
  return hits;
}

function extractGoogleMapsCid(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("cid");
  } catch {
    const match = url.match(/[?&]cid=(\d+)/);
    return match?.[1] ?? null;
  }
}

function extractLatLngFromGoogleMapsUrl(
  url?: string | null
): { latitude: number; longitude: number } | null {
  if (!url) return null;

  const match = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

async function extractGeminiCandidateTextForDebug(response: any): Promise<unknown> {
  try {
    if (typeof response?.text === "string") return response.text;
    if (typeof response?.text === "function") return await response.text();
  } catch {
    // ignore
  }

  const candidate =
    response?.candidates?.[0] ??
    response?.response?.candidates?.[0] ??
    null;

  const parts = candidate?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part: any) => part?.text)
      .filter(Boolean)
      .join("\n");
  }

  return candidate?.content ?? null;
}

async function logAskAiMapsLayer2Debug(args: {
  modelUsed: string;
  query: string;
  selectedChips?: string[];
  nearMe?: boolean;
  openNow?: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
  geminiResponse: unknown;
  extractedSources?: unknown[];
  parsedPlaces?: unknown[];
  finalPlaces?: unknown[];
}) {
  if (!isAskAiMapsRawDebugEnabled()) return;

  const response: any = args.geminiResponse as any;

  const candidate =
    response?.candidates?.[0] ??
    response?.response?.candidates?.[0] ??
    null;

  const groundingMetadata =
    candidate?.groundingMetadata ??
    candidate?.grounding_metadata ??
    response?.candidates?.[0]?.groundingMetadata ??
    response?.response?.candidates?.[0]?.groundingMetadata ??
    response?.candidates?.[0]?.grounding_metadata ??
    response?.response?.candidates?.[0]?.grounding_metadata ??
    null;

  const groundingChunks =
    groundingMetadata?.groundingChunks ??
    groundingMetadata?.grounding_chunks ??
    [];

  const groundingSupports =
    groundingMetadata?.groundingSupports ??
    groundingMetadata?.grounding_supports ??
    [];

  const candidateText = await extractGeminiCandidateTextForDebug(response);

  console.log("========== ASK AI MAPS LAYER 2 DEBUG ==========");

  console.log("[Ask AI Maps Debug] Request Context");
  console.dir(
    sanitizeForDebug({
      timestamp: new Date().toISOString(),
      modelUsed: args.modelUsed,
      query: args.query,
      selectedChips: args.selectedChips ?? [],
      nearMe: Boolean(args.nearMe),
      openNow: Boolean(args.openNow),
      hasUserLocation: Boolean(args.userLocation),
      userLocation: args.userLocation
        ? {
            latitude: args.userLocation.latitude,
            longitude: args.userLocation.longitude,
          }
        : null,
      candidateCount:
        response?.candidates?.length ??
        response?.response?.candidates?.length ??
        null,
    }),
    { depth: null }
  );

  console.log("[Ask AI Maps Debug] Candidate Text");
  console.dir(sanitizeForDebug(candidateText), { depth: null });

  console.log("[Ask AI Maps Debug] Sanitized Raw Gemini Response");
  console.dir(sanitizeForDebug(response), { depth: null });

  console.log("[Ask AI Maps Debug] Grounding Metadata Root");
  console.dir(sanitizeForDebug(groundingMetadata), { depth: null });

  console.log("[Ask AI Maps Debug] Maps Grounding Chunks");
  console.dir(
    Array.isArray(groundingChunks)
      ? groundingChunks.map((chunk: any, index: number) => {
          const maps =
            chunk?.maps ??
            chunk?.map ??
            chunk?.googleMaps ??
            chunk?.google_maps ??
            null;

          return {
            index,
            hasMapsObject: Boolean(maps),
            title: maps?.title ?? null,
            uri: maps?.uri ?? null,
            placeId: maps?.placeId ?? maps?.place_id ?? null,
            possibleCoordinates: findCoordinateLikeFields(maps),
            rawMaps: sanitizeForDebug(maps),
            rawChunk: sanitizeForDebug(chunk),
          };
        })
      : [],
    { depth: null }
  );

  console.log("[Ask AI Maps Debug] Grounding Supports");
  console.dir(
    Array.isArray(groundingSupports)
      ? groundingSupports.map((support: any, index: number) => ({
          index,
          segment: support?.segment ?? null,
          groundingChunkIndices:
            support?.groundingChunkIndices ??
            support?.grounding_chunk_indices ??
            null,
          confidenceScores:
            support?.confidenceScores ??
            support?.confidence_scores ??
            null,
          raw: sanitizeForDebug(support),
        }))
      : [],
    { depth: null }
  );

  console.log("[Ask AI Maps Debug] Extracted Map Sources");
  console.dir(
    Array.isArray(args.extractedSources)
      ? args.extractedSources.map((source: any, index: number) => {
          const uri = source?.uri ?? source?.sourceUri ?? source?.googleMapsUrl ?? null;
          return {
            index,
            title: source?.title ?? source?.sourceTitle ?? null,
            uri,
            placeId: source?.placeId ?? source?.place_id ?? null,
            cid: extractGoogleMapsCid(uri),
            hasDirectLatLngInUrl: Boolean(extractLatLngFromGoogleMapsUrl(uri)),
            directLatLngFromUrl: extractLatLngFromGoogleMapsUrl(uri),
            raw: sanitizeForDebug(source),
          };
        })
      : [],
    { depth: null }
  );

  console.log("[Ask AI Maps Debug] Parsed AI Places Before Enrichment");
  console.dir(
    Array.isArray(args.parsedPlaces)
      ? args.parsedPlaces.map((place: any, index: number) => ({
          index,
          name: place?.name ?? null,
          reason: place?.reason ?? null,
          categoryText: place?.categoryText ?? null,
          openStatusText: place?.openStatusText ?? null,
          addressText: place?.addressText ?? null,
          ratingText: place?.ratingText ?? null,
          raw: sanitizeForDebug(place),
        }))
      : [],
    { depth: null }
  );

  console.log("[Ask AI Maps Debug] Final Places After Enrichment");
  console.dir(
    Array.isArray(args.finalPlaces)
      ? args.finalPlaces.map((place: any, index: number) => {
          const uri = place?.googleMapsUrl ?? place?.sourceUri ?? null;
          return {
            index,
            id: place?.id ?? null,
            name: place?.name ?? null,
            matchedSourceTitle:
              place?.matchedSourceTitle ??
              place?.sourceTitle ??
              null,
            sourceTitle: place?.sourceTitle ?? null,
            sourceUri: place?.sourceUri ?? null,
            googleMapsUrl: place?.googleMapsUrl ?? null,
            placeId: place?.placeId ?? null,
            cid: extractGoogleMapsCid(uri),
            coordinates: place?.coordinates ?? null,
            hasCoordinates: Boolean(
              typeof place?.coordinates?.latitude === "number" &&
                typeof place?.coordinates?.longitude === "number"
            ),
            optionalDetails: place?.optionalDetails ?? null,
            raw: sanitizeForDebug(place),
          };
        })
      : [],
    { depth: null }
  );

  console.log("========== END ASK AI MAPS LAYER 2 DEBUG ==========");
}

function isRetryableProviderError(error: unknown) {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error);

  if (message.toLowerCase().includes("ask ai maps provider timed out")) {
    return false;
  }

  if (RETRYABLE_AI_STATUSES.has(status)) {
    return true;
  }

  if (!message) {
    return false;
  }

  return RETRYABLE_PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isAskAiMapsCoolingDown() {
  return Date.now() < askAiMapsCooldownUntil;
}

function startAskAiMapsCooldown(ms: number) {
  askAiMapsCooldownUntil = Date.now() + ms;
}

function getAmbiguousQueryMessage(
  query: string,
  userLocation?: { latitude: number; longitude: number } | null
): string | null {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return "Query is required.";
  }

  if (/\b(?:in|near|around|at)\s+[a-z]$/i.test(normalizedQuery) && !userLocation) {
    return "Please enter a fuller place or city name, like 'hotel in Pasay'.";
  }

  return null;
}

function buildMapsGroundingPrompt({
  query,
  selectedChips = [],
  nearMe = false,
  openNow = false,
  userLocation,
}: AskAiMapsSearchParams): string {
  const chipText = selectedChips.length > 0 ? selectedChips.join(", ") : "none";
  const locationText =
    nearMe && userLocation
      ? `${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`
      : "not provided";

  return `You are GalaTayo's Ask AI Maps local guide. Use only Google Maps grounding. Do not invent details. Return 5-8 grounded places (never more than 8).

User request:
Query: "${query}"
Chips: [${chipText}]
Near me: ${nearMe ? "yes" : "no"}
Open now: ${openNow ? "yes" : "no"}
User coords: near ${locationText}

Return ONLY this JSON (no prose, no markdown):
{
  "answerText": "One short sentence summarizing the picks.",
  "places": [
    {
      "name": "Place name from grounding",
      "reason": "Short one-line reason tied to the query",
      "whyThisFits": "One sentence explaining why this place fits the user's search. Use casual, helpful tone. Example: A mall option in Tagaytay, good for food, shopping, and casual hangouts.",
      "categoryText": "from grounding or omit",
      "openStatusText": "from grounding or omit",
      "addressText": "from grounding or omit",
      "ratingText": "from grounding or omit",
      "reviewCountText": "from grounding or omit",
      "hoursText": "from grounding or omit",
      "coordinates": { "latitude": 0, "longitude": 0 }
    }
  ]
}

Omit optional fields when not available. Do not use "Google Maps result" or "grounded option" as filler. If no grounded matches: {"answerText":"No strong grounded matches were found.","places":[]}.
`.trim();
}

function buildRichMapsGroundingPrompt(params: AskAiMapsSearchParams): string {
  const { query, selectedChips = [], nearMe = false, openNow = false, userLocation } = params;
  const chipText = selectedChips.length > 0 ? selectedChips.join(", ") : "none";
  const locationText =
    nearMe && userLocation
      ? `${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`
      : "not provided";

  return `You are GalaTayo's map assistant. Use Google Maps grounding to find real places.

Return only valid JSON. Do not wrap it in markdown. Do not add extra commentary outside the JSON.
Prioritize factual map data first. Do not invent facts.
Return 4-8 places when possible. Never more than 8.

User request:
- Query: "${query}"
- Chips: [${chipText}]
- Near me: ${nearMe ? "yes" : "no"}
- Open now: ${openNow ? "yes" : "no"}
- User coords: near ${locationText}

Use this exact shape:
{
  "answerText": "One short summary sentence for the overall result.",
  "places": [
    {
      "name": "Place name from grounding",
      "reason": "One short query-aware sentence about why it is relevant.",
      "whyThisFits": "One short query-aware sentence. Keep it useful and non-repetitive.",
      "categoryText": "from grounding or omit",
      "openStatusText": "from grounding or omit",
      "addressText": "from grounding or omit",
      "ratingText": "from grounding or omit",
      "reviewCountText": "from grounding or omit",
      "hoursText": "from grounding or omit",
      "googleMapsUri": "grounded Google Maps URL or omit",
      "placeId": "grounded place id or omit",
      "coordinates": { "latitude": 0, "longitude": 0 }
    }
  ]
}

Rules:
- Use only fields that are clearly supported by grounded data.
- Do not add AI Take, Best for, Know before going, caveats, or other extra sections.
- Do not use filler like "grounded option", "returned by Google Maps", or "appears relevant".
- If there are no strong grounded matches, return {"answerText":"No strong grounded matches were found.","places":[]}.
`.trim();
}

async function getGoogleApiKey(): Promise<string> {
  try {
    const envApiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GOOGLE_GENAI_API_KEY?.trim();
    const apiKey = envApiKey || (await getSecret("gemini-api-key"));

    if (!apiKey) {
      throw new AskAiMapsServiceError("Google API key is missing.", 500);
    }

    return apiKey;
  } catch (error) {
    if (error instanceof AskAiMapsServiceError) {
      throw error;
    }

    throw new AskAiMapsServiceError(
      error instanceof Error ? error.message : "Failed to retrieve Google API key.",
      500
    );
  }
}

function extractGroundingSources(
  groundingMetadata: GroundingMetadataLike | undefined
): GroundingSource[] {
  const seenKeys = new Set<string>();
  const sources: GroundingSource[] = [];
  const chunks = [
    ...(Array.isArray(groundingMetadata?.groundingChunks) ? groundingMetadata.groundingChunks : []),
    ...(Array.isArray(groundingMetadata?.grounding_chunks) ? groundingMetadata.grounding_chunks : []),
  ];

  for (const chunk of chunks) {
    const chunkRecord = chunk as Record<string, unknown>;
    const maps = (
      chunkRecord.maps ??
      chunkRecord.map ??
      chunkRecord.googleMaps ??
      chunkRecord.google_maps
    ) as Record<string, unknown> | undefined;

    if (!maps || typeof maps !== "object") {
      continue;
    }

    const normalizedSource = sourceFromGoogleMapsPlace(maps);

    if (normalizedSource) {
      addGroundingSource(sources, seenKeys, normalizedSource);
      continue;
    }

    const title = normalizeText(getObjectField(maps, ["title", "name"])) ?? undefined;
    const text =
      normalizeText(getObjectField(maps, ["text", "address", "formattedAddress", "formatted_address"])) ??
      undefined;
    const uri =
      normalizeText(getObjectField(maps, ["uri", "url", "sourceUri", "source_uri", "googleMapsUri", "google_maps_uri"])) ??
      undefined;
    const placeId =
      normalizeText(getObjectField(maps, ["placeId", "place_id", "id"])) ??
      undefined;

    if (!title && !uri && !placeId) {
      continue;
    }

    addGroundingSource(sources, seenKeys, {
      ...(title ? { title } : {}),
      ...(text ? { text } : {}),
      ...(uri ? { uri } : {}),
      ...(placeId ? { placeId } : {}),
    });
  }

  return sources;
}

function mergeGroundingSourceFields(existing: GroundingSource, incoming: GroundingSource): GroundingSource {
  return {
    ...existing,
    ...incoming,
    title: existing.title ?? incoming.title,
    text: existing.text ?? incoming.text,
    uri: existing.uri ?? incoming.uri,
    placeId: existing.placeId ?? incoming.placeId,
    rating: existing.rating ?? incoming.rating,
    reviewCount: existing.reviewCount ?? incoming.reviewCount,
    categoryText: existing.categoryText ?? incoming.categoryText,
    ratingText: existing.ratingText ?? incoming.ratingText,
    reviewCountText: existing.reviewCountText ?? incoming.reviewCountText,
    openStatusText: existing.openStatusText ?? incoming.openStatusText,
    addressText: existing.addressText ?? incoming.addressText,
    locationText: existing.locationText ?? incoming.locationText,
    hoursText: existing.hoursText ?? incoming.hoursText,
    coordinates: existing.coordinates ?? incoming.coordinates,
    reviewSnippets:
      existing.reviewSnippets && existing.reviewSnippets.length > 0
        ? existing.reviewSnippets
        : incoming.reviewSnippets,
  };
}

function addGroundingSource(
  sources: GroundingSource[],
  seenKeys: Set<string>,
  source: GroundingSource
) {
  const dedupeKey = normalizePlaceKey(
    `${source.placeId ?? ""} ${source.uri ?? ""} ${source.title ?? ""}`
  );

  if (!dedupeKey) {
    return;
  }

  const existingIndex = sources.findIndex((candidate) =>
    normalizePlaceKey(
      `${candidate.placeId ?? ""} ${candidate.uri ?? ""} ${candidate.title ?? ""}`
    ) === dedupeKey
  );

  if (existingIndex >= 0) {
    sources[existingIndex] = mergeGroundingSourceFields(sources[existingIndex], source);
    seenKeys.add(dedupeKey);
    return;
  }

  seenKeys.add(dedupeKey);
  sources.push(source);
}

function sourceFromGoogleMapsPlace(value: unknown): GroundingSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const place = value as Record<string, unknown>;
  const title =
    normalizeTextNode(getObjectField(place, ["title", "displayName", "display_name", "name"])) ??
    undefined;
  const uri =
    normalizeText(getObjectField(place, [
      "uri",
      "url",
      "sourceUri",
      "source_uri",
      "googleMapsUri",
      "google_maps_uri",
      "googleMapsUrl",
      "google_maps_url",
    ])) ??
    undefined;
  const placeId =
    normalizeText(getObjectField(place, ["placeId", "place_id", "id"])) ??
    undefined;
  const text =
    normalizeTextNode(getObjectField(place, ["text"])) ??
    normalizeText(getObjectField(place, ["address", "formattedAddress", "formatted_address"])) ??
    undefined;
  const rating = normalizeRatingNumber(getObjectField(place, ["rating", "ratingText", "rating_text"]));
  const reviewCount = normalizeReviewCountNumber(getObjectField(place, ["reviewCount", "review_count", "userRatingCount", "user_rating_count"]));
  const ratingText = normalizeRatingText(getObjectField(place, ["rating", "ratingText", "rating_text"]));
  const reviewCountText = normalizeReviewCountText(getObjectField(place, ["reviewCount", "review_count", "userRatingCount", "user_rating_count"]));
  const categoryText = normalizeCategoryText(getObjectField(place, [
    "category",
    "categoryText",
    "category_text",
    "primaryTypeDisplayName",
    "primary_type_display_name",
    "primaryType",
    "primary_type",
    "types",
  ]));
  const openStatusText = normalizeOpenStatusText(getObjectField(place, [
    "openStatus",
    "open_status",
    "openStatusText",
    "open_status_text",
    "openNow",
    "open_now",
    "currentOpeningHours",
    "current_opening_hours",
  ]));
  const hoursText = normalizeHoursText(getObjectField(place, [
    "openingHoursText",
    "opening_hours_text",
    "hoursText",
    "hours_text",
    "regularOpeningHours",
    "regular_opening_hours",
    "currentOpeningHours",
    "current_opening_hours",
  ]));
  const addressText =
    normalizeTextNode(getObjectField(place, ["shortFormattedAddress", "short_formatted_address"])) ??
    normalizeOptionalDisplayText(getObjectField(place, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
    text;
  const locationText =
    normalizeTextNode(getObjectField(place, ["locationText", "location_text", "shortFormattedAddress", "short_formatted_address"])) ??
    addressText;
  const reviewSnippetsValue = getObjectField(place, ["reviewSnippets", "review_snippets"]);
  const coordinates =
    extractCoordinatesFromGoogleMapsPlaceObject(place) ??
    extractCoordinatesFromGoogleMapsUrl(uri);
  const reviewSnippets = Array.isArray(reviewSnippetsValue)
    ? reviewSnippetsValue
        .map((snippet) => snippet && typeof snippet === "object"
          ? normalizeOptionalDisplayText(getObjectField(snippet as Record<string, unknown>, ["title", "text"]))
          : normalizeOptionalDisplayText(snippet))
        .filter((snippet): snippet is string => Boolean(snippet))
    : undefined;

  if (!title && !uri && !placeId) {
    return null;
  }

  return {
    ...(title ? { title } : {}),
    ...(text ? { text } : {}),
    ...(uri ? { uri } : {}),
    ...(placeId ? { placeId } : {}),
    ...(typeof rating === "number" ? { rating } : {}),
    ...(typeof reviewCount === "number" ? { reviewCount } : {}),
    ...(categoryText ? { categoryText } : {}),
    ...(ratingText ? { ratingText } : {}),
    ...(reviewCountText ? { reviewCountText } : {}),
    ...(openStatusText ? { openStatusText } : {}),
    ...(addressText ? { addressText } : {}),
    ...(locationText ? { locationText } : {}),
    ...(hoursText ? { hoursText } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(reviewSnippets && reviewSnippets.length > 0 ? { reviewSnippets } : {}),
  };
}

function looksLikeGoogleMapsPlaceObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Boolean(
    getObjectField(record, [
      "placeId",
      "place_id",
      "id",
      "googleMapsUri",
      "google_maps_uri",
      "googleMapsUrl",
      "google_maps_url",
      "formattedAddress",
      "formatted_address",
      "displayName",
      "display_name",
      "primaryType",
      "primary_type",
      "userRatingCount",
      "user_rating_count",
    ])
  );
}

function extractGoogleMapsResultSources(value: unknown): GroundingSource[] {
  const sources: GroundingSource[] = [];
  const seenKeys = new Set<string>();
  const seenObjects = new WeakSet<object>();

  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (seenObjects.has(node as object)) {
      return;
    }

    seenObjects.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;

    if (record.type === "google_maps_result" && Array.isArray(record.result)) {
      for (const result of record.result) {
        const places = result && typeof result === "object"
          ? (result as Record<string, unknown>).places
          : null;

        if (Array.isArray(places)) {
          for (const place of places) {
            const source = sourceFromGoogleMapsPlace(place);

            if (source) {
              addGroundingSource(sources, seenKeys, source);
            }
          }
        }
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  }

  visit(value);
  return sources;
}

function extractLooseGoogleMapsSources(value: unknown): GroundingSource[] {
  const sources: GroundingSource[] = [];
  const seenKeys = new Set<string>();
  const seenObjects = new WeakSet<object>();

  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (seenObjects.has(node as object)) {
      return;
    }

    seenObjects.add(node as object);

    if (looksLikeGoogleMapsPlaceObject(node)) {
      const source = sourceFromGoogleMapsPlace(node);

      if (source) {
        addGroundingSource(sources, seenKeys, source);
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    for (const child of Object.values(node as Record<string, unknown>)) {
      visit(child);
    }
  }

  visit(value);
  return sources;
}

function mergeGroundingSources(...sourceGroups: GroundingSource[][]): GroundingSource[] {
  const merged: GroundingSource[] = [];
  const seenKeys = new Set<string>();

  for (const group of sourceGroups) {
    for (const source of group) {
      addGroundingSource(merged, seenKeys, source);
    }
  }

  return merged;
}

function getOverlapScore(left: string, right: string) {
  const leftTokens = new Set(normalizePlaceKey(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizePlaceKey(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function findBestGroundingSource(
  placeName: string,
  sources: GroundingSource[]
): GroundingSource | undefined {
  const normalizedPlaceName = normalizePlaceKey(placeName);

  if (!normalizedPlaceName) {
    return undefined;
  }

  let bestSource: GroundingSource | undefined;
  let bestScore = 0;

  for (const source of sources) {
    const title = source.title;

    if (!title) {
      continue;
    }

    const normalizedTitle = normalizePlaceKey(title);

    if (!normalizedTitle) {
      continue;
    }

    if (normalizedTitle === normalizedPlaceName) {
      return source;
    }

    const score =
      normalizedTitle.includes(normalizedPlaceName) ||
      normalizedPlaceName.includes(normalizedTitle)
        ? 0.95
        : getOverlapScore(placeName, title);

    if (score > bestScore) {
      bestScore = score;
      bestSource = source;
    }
  }

  return bestScore >= 0.5 ? bestSource : undefined;
}

function getAddressMatchScore(
  groundedAddress: string | undefined,
  candidate: StoredPlaceCoordinateCandidate
) {
  const left = normalizePlaceKey(groundedAddress ?? "");
  const right = normalizePlaceKey([candidate.address ?? "", candidate.city ?? ""].join(" "));

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.9;
  }

  return getOverlapScore(left, right);
}

async function findStoredPlaceCoordinateCandidate(
  place: AskAiMapGroundedPlace,
  logger?: AskAiMapsLogger
): Promise<StoredPlaceCoordinateCandidate | null> {
  const trimmedName = normalizeText(place.name);

  if (!trimmedName) {
    return null;
  }

  const cacheKey = normalizePlaceKey(trimmedName);
  const cached = coordinateCache.get(cacheKey);

  if (cached) {
    logger?.log(`[Ask AI Maps] Cache hit for coordinates: ${trimmedName}`);
    return { name: trimmedName, address: null, city: null, ...cached };
  }

  const supabase = await getSupabaseAdminClient();
  const queryValue = `%${trimmedName}%`;
  const { data, error } = await supabase
    .from("places")
    .select("name,address,city,latitude,longitude")
    .ilike("name", queryValue)
    .limit(8);

  if (error) {
    logger?.log(`[Ask AI Maps] Coordinate lookup failed for "${trimmedName}": ${error.message}`);
    return null;
  }

  const candidates = Array.isArray(data) ? (data as StoredPlaceCoordinateCandidate[]) : [];
  let bestCandidate: StoredPlaceCoordinateCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (
      typeof candidate.latitude !== "number" ||
      typeof candidate.longitude !== "number"
    ) {
      continue;
    }

    const nameScore = getOverlapScore(trimmedName, candidate.name ?? "");
    const addressScore = getAddressMatchScore(place.optionalDetails?.addressText, candidate);
    const totalScore = nameScore * 0.75 + addressScore * 0.25;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestCandidate = candidate;
    }
  }

  const result = bestScore >= 0.72 ? bestCandidate : null;

  if (result) {
    coordinateCache.set(cacheKey, { latitude: result.latitude!, longitude: result.longitude! });
    pruneCoordinateCache();
  }

  return result;
}

async function hydrateGroundedPlacesWithCoordinates(
  places: AskAiMapGroundedPlace[],
  logger?: AskAiMapsLogger
): Promise<AskAiMapGroundedPlace[]> {
  const hydratedPlaces = await Promise.all(
    places.map(async (place) => {
      if (place.coordinates) {
        return place;
      }

      const candidate = await findStoredPlaceCoordinateCandidate(place, logger);

      if (!candidate) {
        return place;
      }

      logger?.log(`[Ask AI Maps] Hydrated coordinates from places table for: ${place.name}`);

      return {
        ...place,
        coordinates: {
          latitude: candidate.latitude!,
          longitude: candidate.longitude!,
        },
      };
    })
  );

  return hydratedPlaces;
}

function isProbablyJsonLine(line: string) {
  const trimmed = line.trim();

  return (
    trimmed === "{" ||
    trimmed === "}" ||
    trimmed === "[" ||
    trimmed === "]" ||
    trimmed === "```" ||
    trimmed.startsWith("```json") ||
    /^[\[\]{},"]+$/.test(trimmed) ||
    /^"[^"]+"\s*:/.test(trimmed)
  );
}

function extractNaturalAnswerText(rawText: string): string | undefined {
  const beforeFence = rawText.includes("```") ? rawText.split("```")[0] : rawText;
  const beforeJsonBlock = beforeFence.split(/\n\s*[{[]/)[0] ?? beforeFence;
  const cleaned = beforeJsonBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isProbablyJsonLine(line))
    .join(" ");

  const normalized = normalizeOptionalDisplayText(cleaned);
  return normalized ?? undefined;
}

function splitIntoCandidateSentences(rawText: string): string[] {
  return rawText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => normalizeOptionalDisplayText(segment))
    .filter((segment): segment is string => Boolean(segment));
}

function sentenceMentionsPlace(sentence: string, placeName: string): boolean {
  const normalizedSentence = normalizePlaceKey(sentence);
  const normalizedPlaceName = normalizePlaceKey(placeName);

  if (!normalizedSentence || !normalizedPlaceName) {
    return false;
  }

  if (normalizedSentence.includes(normalizedPlaceName)) {
    return true;
  }

  const placeTokens = normalizedPlaceName.split(" ").filter((token) => token.length > 2);

  if (placeTokens.length === 0) {
    return false;
  }

  const overlap = placeTokens.filter((token) => normalizedSentence.includes(token)).length;
  return overlap >= Math.min(2, placeTokens.length);
}

function extractPlaceMentionSummary(rawText: string, placeName: string): string | undefined {
  const naturalAnswer = extractNaturalAnswerText(rawText) ?? rawText;
  const candidates = splitIntoCandidateSentences(naturalAnswer).filter((sentence) =>
    sentenceMentionsPlace(sentence, placeName)
  );

  if (candidates.length === 0) {
    return undefined;
  }

  const summary = normalizeWhitespace(candidates.slice(0, 2).join(" "));
  return summary || undefined;
}

function isGenericGeneratedCopy(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.toLowerCase();
  return [
    "google maps result",
    "map-grounded option",
    "grounded from google maps",
    "returned by google maps",
    "relevant option for this",
    "detailed ai context is limited right now",
    "grounded recommendation for your request",
    "matches your search",
    "useful option for this search",
  ].some((phrase) => normalized.includes(phrase));
}

function chooseBestPlaceCopy(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeOptionalDisplayText(candidate);

    if (normalized && !isGenericGeneratedCopy(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function buildNeutralPlaceLine(placeName: string): string {
  return `${placeName} is one of the places found for this search.`;
}

function buildWhyThisFits(name: string, query: string, categoryText?: string): string {
  const area = extractAreaFromQuery(query);
  const normalizedQuery = query.toLowerCase();
  const areaSuffix = area ? ` in ${area}` : "";

  if (/\bmalls?\b/.test(normalizedQuery)) {
    return `A mall option${areaSuffix}, good for food, shopping, and casual hangouts.`;
  }

  if (/\bsamgyup|samgyeop|korean\b/.test(normalizedQuery)) {
    return `A Korean restaurant option${areaSuffix} that fits your samgyup search.`;
  }

  if (/\bcoffee|cafe\b/.test(normalizedQuery)) {
    return `A coffee spot${areaSuffix} for a quick drink or casual meetup.`;
  }

  if (/\brestaurant|kainan|food\b/.test(normalizedQuery)) {
    return `A restaurant option${areaSuffix} for good food in the area.`;
  }

  const placeType = categoryText?.toLowerCase() || "place";
  return `A ${placeType} option${areaSuffix} that matches your search.`;
}

function buildSourceWhyRecommended(source: GroundingSource, mentionSummary?: string): string[] | undefined {
  const items = [
    chooseBestPlaceCopy(mentionSummary),
    source.categoryText ? `Listed as ${source.categoryText.toLowerCase()}.` : undefined,
    source.addressText ? `Located in ${source.addressText}.` : undefined,
    source.ratingText
      ? `Has a ${source.ratingText} rating${source.reviewCountText ? ` with ${source.reviewCountText}` : ""}.`
      : undefined,
    source.openStatusText ? `${source.openStatusText}${source.hoursText ? ` - ${source.hoursText}` : ""}.` : undefined,
  ]
    .map((item) => normalizeOptionalDisplayText(item))
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? items.slice(0, 3) : undefined;
}

function buildAnswerText(
  parsed: ParsedModelResponse | null,
  places: AskAiMapGroundedPlace[],
  rawText: string,
  query?: string
) {
  const naturalAnswer = extractNaturalAnswerText(rawText);
  if (naturalAnswer) {
    return naturalAnswer;
  }

  const parsedAnswer = normalizeOptionalDisplayText(parsed?.answerText);

  if (parsedAnswer) {
    return parsedAnswer;
  }

  if (places.length > 0) {
    return `Here are some ${normalizeWhitespace(query ?? "matching place")} options to check on the map.`;
  }

  return normalizeText(rawText) ?? "No grounded summary was provided.";
}

function normalizeGroundedPlaces(
  parsed: ParsedModelResponse | null,
  sources: GroundingSource[],
  rawText: string,
  query: string
): AskAiMapGroundedPlace[] {
  if (!Array.isArray(parsed?.places)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const normalizedPlaces: AskAiMapGroundedPlace[] = [];

  for (const [index, rawPlace] of parsed.places.entries()) {
    if (!rawPlace || typeof rawPlace !== "object") {
      continue;
    }

    const candidate = rawPlace as ParsedGroundedPlace;
    const candidateRecord = rawPlace as Record<string, unknown>;
    const name = normalizeText(
      getObjectField(candidateRecord, ["name", "title", "placeName", "place_name"])
    );

    if (!name) {
      continue;
    }

    const source = findBestGroundingSource(name, sources);
    const mentionSummary = extractPlaceMentionSummary(rawText, name);
    const sourceSnippet =
      normalizeOptionalDisplayText(source?.reviewSnippets?.[0]) ??
      normalizeOptionalDisplayText(source?.text) ??
      undefined;
    const subtitle = chooseBestPlaceCopy(
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["subtitle", "subTitle", "sub_title"])),
      mentionSummary,
      sourceSnippet
    );
    const description = chooseBestPlaceCopy(
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["description", "desc"])),
      mentionSummary,
      sourceSnippet
    );
    const summary = chooseBestPlaceCopy(
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["summary", "cardSummary", "card_summary"])),
      mentionSummary,
      sourceSnippet
    );
    const categoryText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["categoryText", "category_text", "category"])) ??
      source?.categoryText;
    const rating =
      normalizeRatingNumber(getObjectField(candidateRecord, ["rating", "ratingText", "rating_text"])) ??
      source?.rating;
    const whyThisFits =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["whyThisFits", "why_this_fits"])) ??
      buildWhyThisFits(name, query, categoryText);
    const reason = chooseBestPlaceCopy(
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["reason", "reasonText", "reason_text"])),
      description,
      summary,
      whyThisFits,
      subtitle
    ) ?? whyThisFits;
    const ratingText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["ratingText", "rating_text", "rating"])) ??
      source?.ratingText;
    const reviewCount =
      normalizeReviewCountNumber(getObjectField(candidateRecord, ["reviewCount", "review_count", "reviewCountText", "review_count_text", "userRatingCount", "user_rating_count"])) ??
      source?.reviewCount;
    const reviewCountText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["reviewCountText", "review_count_text", "reviewCount", "review_count"])) ??
      source?.reviewCountText;
    const openStatusText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["openStatusText", "open_status_text", "openStatus", "open_status"])) ??
      source?.openStatusText;
    const addressText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["addressText", "address_text", "address", "locationText", "location_text"])) ??
      normalizeOptionalDisplayText(source?.addressText) ??
      normalizeOptionalDisplayText(source?.text);
    const locationText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["locationText", "location_text", "addressText", "address_text"])) ??
      normalizeOptionalDisplayText(source?.locationText) ??
      addressText;
    const hoursText =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["hoursText", "hours_text", "openingHoursText", "opening_hours_text"])) ??
      source?.hoursText;
    const googleMapsUrl =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["googleMapsUrl", "google_maps_url", "googleMapsUri", "google_maps_uri"])) ??
      source?.uri;
    const googleMapsUri =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["googleMapsUri", "google_maps_uri", "googleMapsUrl", "google_maps_url"])) ??
      googleMapsUrl;
    const placeId =
      normalizeOptionalDisplayText(getObjectField(candidateRecord, ["placeId", "place_id"])) ??
      source?.placeId;
    const parsedReviewSnippets = normalizeStringArray(
      getObjectField(candidateRecord, ["reviewSnippets", "review_snippets"])
    );
    const reviewSnippets = parsedReviewSnippets ?? source?.reviewSnippets?.filter((snippet) => Boolean(normalizeOptionalDisplayText(snippet)));
    const coordinates =
      extractCoordinatesFromParsedPlace(candidate) ??
      extractCoordinatesFromGoogleMapsUrl(googleMapsUrl ?? googleMapsUri ?? source?.uri);
    const dedupeKey = normalizePlaceKey(`${placeId ?? ""} ${googleMapsUrl ?? ""} ${name}`);

    if (!dedupeKey || seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    normalizedPlaces.push({
      id: toPlaceId(placeId ?? googleMapsUrl ?? name, index),
      name,
      ...(typeof rating === "number" ? { rating } : {}),
      ...(typeof reviewCount === "number" ? { reviewCount } : {}),
      ...(categoryText ? { category: categoryText } : {}),
      ...(openStatusText ? { openStatus: openStatusText } : {}),
      ...(addressText ? { address: addressText } : {}),
      ...(locationText ? { locationText } : {}),
      ...(description ? { description } : {}),
      queryReason: whyThisFits,
      reason,
      whyThisFits,
      ...(subtitle ? { subtitle } : {}),
      ...(summary ? { summary } : {}),
      ...(googleMapsUrl ? { googleMapsUrl } : {}),
      ...(googleMapsUri ? { googleMapsUri } : {}),
      ...(placeId ? { placeId } : {}),
      ...(reviewSnippets && reviewSnippets.length > 0 ? { reviewSnippets } : {}),
      ...(source?.title ? { sourceTitle: source.title } : {}),
      ...(source?.uri ? { sourceUri: source.uri } : {}),
      ...(coordinates ? { coordinates: toResponseCoordinates(coordinates) } : {}),
      ...(categoryText || ratingText || reviewCountText || openStatusText || addressText || hoursText
        ? {
            optionalDetails: {
              ...(categoryText ? { categoryText } : {}),
              ...(ratingText ? { ratingText } : {}),
              ...(reviewCountText ? { reviewCountText } : {}),
              ...(openStatusText ? { openStatusText } : {}),
              ...(addressText ? { addressText } : {}),
              ...(hoursText ? { hoursText } : {}),
            },
          }
        : {}),
    });
  }

  return normalizedPlaces.slice(0, ASK_AI_MAPS_MAX_PLACES);
}

function queryIncludes(query: string, pattern: RegExp) {
  return pattern.test(query.toLowerCase());
}

function extractAreaFromQuery(query: string): string | undefined {
  const normalized = normalizeWhitespace(query).replace(/[?.!,]+$/g, "");
  const match = normalized.match(/\b(?:in|near|around|at)\s+([a-z0-9\s,-]+)$/i);
  const area = normalizeText(match?.[1]);
  return area ?? undefined;
}

function inferFallbackBestFor(query: string): string[] | undefined {
  const normalizedQuery = query.toLowerCase();
  const tags: string[] = [];

  if (/\bmalls?\b/.test(normalizedQuery)) {
    tags.push("Shopping", "Food", "Hangout");
  }

  if (/\bsamgyup|samgyeop|korean\b/.test(normalizedQuery)) {
    tags.push("Korean food", "Group meals", "Dinner");
  }

  if (/\bcoffee|cafe\b/.test(normalizedQuery)) {
    tags.push("Coffee", "Casual meetup");
  }

  return tags.length > 0 ? [...new Set(tags)] : undefined;
}

function buildGroundingFallbackSubtitle(query: string): string {
  const area = extractAreaFromQuery(query);
  const normalizedQuery = query.toLowerCase();

  if (/\bmalls?\b/.test(normalizedQuery)) {
    return area
      ? `Relevant mall option for this ${area} search.`
      : "Relevant mall option for this search.";
  }

  if (/\bsamgyup|samgyeop|korean\b/.test(normalizedQuery)) {
    return area
      ? `Relevant Korean food option for this ${area} search.`
      : "Relevant Korean food option for this search.";
  }

  return area
    ? `Relevant option for this ${area} search.`
    : "Relevant option for this search.";
}

function buildFallbackReason(source: GroundingSource, query: string): string {
  const subtitle = buildGroundingFallbackSubtitle(query);
  return subtitle.endsWith(".") ? subtitle : `${subtitle}.`;
}

function buildFallbackWhyRecommended(source: GroundingSource, query: string): string[] | undefined {
  const items = [
    source.categoryText ? `${source.categoryText} result from Google Maps.` : null,
    source.addressText ? `Located at ${source.addressText}.` : null,
    source.ratingText
      ? `Rated ${source.ratingText}${source.reviewCountText ? ` with ${source.reviewCountText}.` : " on Google Maps."}`
      : null,
    source.openStatusText ? `${source.openStatusText}${source.hoursText ? ` · ${source.hoursText}` : ""}.` : null,
  ].filter((item): item is string => Boolean(item));

  if (items.length > 0) {
    return items.slice(0, 3);
  }

  if (queryIncludes(query, /\bmalls?\b/)) {
    return ["Useful if you want a shopping option grounded from Google Maps."];
  }

  return undefined;
}

function buildGroundingWhyRecommended(source: GroundingSource): string[] {
  const items = ["It matches the place type and area in your search."];

  if (source.categoryText) {
    items.push(`Grounded as a ${source.categoryText.toLowerCase()} result.`);
  }

  if (source.addressText) {
    items.push(`It is listed in ${source.addressText}.`);
  }

  return items.slice(0, 3);
}

function buildPlacesFromGroundingSources(
  sources: GroundingSource[],
  query: string,
  rawText: string
): AskAiMapGroundedPlace[] {
  return sources
    .flatMap((source, index): AskAiMapGroundedPlace[] => {
      const name = normalizeText(source.title);

      if (!name) {
        return [];
      }

      const coordinates = source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(source.uri);
      const mentionSummary = extractPlaceMentionSummary(rawText, name);
      const sourceSnippet =
        normalizeOptionalDisplayText(source.text) ??
        normalizeOptionalDisplayText(source.reviewSnippets?.[0]) ??
        undefined;
      const reason =
        chooseBestPlaceCopy(mentionSummary, sourceSnippet, buildWhyThisFits(name, query, source.categoryText)) ??
        buildWhyThisFits(name, query, source.categoryText);
      const subtitle = chooseBestPlaceCopy(mentionSummary, sourceSnippet);
      const description = chooseBestPlaceCopy(sourceSnippet, mentionSummary);
      const whyThisFits = buildWhyThisFits(name, query, source.categoryText);
      const reviewSnippets = source.reviewSnippets?.filter((snippet) => Boolean(normalizeOptionalDisplayText(snippet)));

      return [{
        id: toPlaceId(source.placeId ?? source.uri ?? name, index),
        name,
        ...(typeof source.rating === "number" ? { rating: source.rating } : {}),
        ...(typeof source.reviewCount === "number" ? { reviewCount: source.reviewCount } : {}),
        ...(source.categoryText ? { category: source.categoryText } : {}),
        ...(source.openStatusText ? { openStatus: source.openStatusText } : {}),
        ...(source.addressText ? { address: source.addressText } : {}),
        ...(source.locationText ?? source.addressText ?? source.text ? { locationText: source.locationText ?? source.addressText ?? source.text } : {}),
        ...(description ? { description } : {}),
        queryReason: whyThisFits,
        reason,
        whyThisFits,
        ...(subtitle ? { subtitle } : {}),
        googleMapsUrl: source.uri,
        googleMapsUri: source.uri,
        placeId: source.placeId,
        ...(reviewSnippets && reviewSnippets.length > 0 ? { reviewSnippets } : {}),
        sourceTitle: source.title,
        sourceUri: source.uri,
        ...(coordinates ? { coordinates: toResponseCoordinates(coordinates) } : {}),
        ...(source.categoryText || source.ratingText || source.reviewCountText || source.openStatusText || source.addressText || source.hoursText || source.text
          ? {
              optionalDetails: {
                ...(source.categoryText ? { categoryText: source.categoryText } : {}),
                ...(source.ratingText ? { ratingText: source.ratingText } : {}),
                ...(source.reviewCountText ? { reviewCountText: source.reviewCountText } : {}),
                ...(source.openStatusText ? { openStatusText: source.openStatusText } : {}),
                ...(source.addressText ?? source.text ? { addressText: source.addressText ?? source.text } : {}),
                ...(source.hoursText ? { hoursText: source.hoursText } : {}),
              },
            }
          : {}),
      }];
    })
    .slice(0, ASK_AI_MAPS_MAX_PLACES);
}

function mapSourcesForResponse(sources: GroundingSource[]): AskAiMapsSource[] {
  return sources.map((source) => ({
    ...(source.title ? { title: source.title } : {}),
    ...(source.uri ? { uri: source.uri } : {}),
    ...(source.placeId ? { placeId: source.placeId } : {}),
  }));
}

async function generateMapsResponse({
  ai,
  model,
  prompt,
  params,
  logger,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
  params: AskAiMapsSearchParams;
  logger?: AskAiMapsLogger;
}): Promise<Omit<AskAiMapsSearchResult, "latencyMs" | "modelUsed">> {
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 900,
        tools: [{ googleMaps: {} }],
      },
    }),
    ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
    "Ask AI Maps provider timed out."
  );

  logger?.log(`[Ask AI Maps] Model succeeded: ${model}`);

  const candidateText = await extractGeminiCandidateTextForDebug(response as any);
  const rawText = typeof candidateText === "string" ? candidateText : "";
  const parseResult = parseModelResponseDetailed(rawText);
  const groundingMetadata =
    ((response as any)?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.response?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.candidates?.[0]?.grounding_metadata ??
      (response as any)?.response?.candidates?.[0]?.grounding_metadata) as
      | GroundingMetadataLike
      | undefined;
  const groundingSources = extractGroundingSources(groundingMetadata);
  const sources = mergeGroundingSources(
    groundingSources,
    extractGoogleMapsResultSources((response as any)?.automaticFunctionCallingHistory),
    extractGoogleMapsResultSources(response),
    extractLooseGoogleMapsSources((response as any)?.automaticFunctionCallingHistory),
    extractLooseGoogleMapsSources(response)
  );
  const parsed = parseResult.parsed;
  const parsedPlaces = Array.isArray(parsed?.places) ? parsed.places : [];
  const normalizedPlaces = normalizeGroundedPlaces(parsed, sources, rawText, params.query);
  const usedParsedPlaces = normalizedPlaces.length > 0;
  const groundingCandidates =
    usedParsedPlaces || sources.length === 0 ? [] : buildPlacesFromGroundingSources(sources, params.query, rawText);
  const usedGroundingCandidates = !usedParsedPlaces && groundingCandidates.length > 0;
  const places = await hydrateGroundedPlacesWithCoordinates(
    usedParsedPlaces ? normalizedPlaces : groundingCandidates,
    logger
  );
  const noResultsReason =
    places.length > 0
      ? null
      : parsed == null
        ? "PARSE_RETURNED_NULL_AND_NO_USABLE_GROUNDING_CANDIDATES"
        : parsedPlaces.length === 0
          ? "PARSED_RESPONSE_CONTAINED_NO_PLACES_AND_NO_USABLE_GROUNDING_CANDIDATES"
          : normalizedPlaces.length === 0 && sources.length === 0
            ? "NORMALIZATION_REMOVED_PARSED_PLACES_AND_GROUNDING_WAS_EMPTY"
            : normalizedPlaces.length === 0 && groundingCandidates.length === 0
              ? "NORMALIZATION_REMOVED_PARSED_PLACES_AND_GROUNDING_CANDIDATES_WERE_EMPTY"
              : "NO_USABLE_PLACES_AFTER_HYDRATION";
  const answerText = buildAnswerText(parsed, places, rawText, params.query);

  logger?.log(
    `[Ask AI Maps] Raw text preview: ${rawText.slice(0, 700).replace(/\s+/g, " ")}`
  );
  logger?.log(
    `[Ask AI Maps] Parse result: ${JSON.stringify({
      parsedFrom: parseResult.parsedFrom ?? null,
      parseError: parseResult.parseError ?? null,
      parsedPlaces: parsedPlaces.length,
      normalizedPlaces: normalizedPlaces.length,
      sources: sources.length,
      usedParsedPlaces,
      usedGroundingCandidates,
      groundingSourceCount: sources.length,
      finalPlaceCount: places.length,
      noResultsReason,
    })}`
  );
  logger?.log(
    `[Ask AI Maps] Grounding metadata preview: ${JSON.stringify(sanitizeForDebug(groundingMetadata)).slice(0, 1000)}`
  );
  logger?.log(
    `[Ask AI Maps] Normalized places preview: ${JSON.stringify(
      normalizedPlaces.map((place) => ({
        name: place.name,
        subtitle: place.subtitle ?? null,
        reason: place.reason,
        whyThisFits: place.whyThisFits ?? null,
        optionalDetails: place.optionalDetails ?? null,
      }))
    ).slice(0, 1000)}`
  );
  logger?.log(
    `[Ask AI Maps] Grounding candidate preview: ${JSON.stringify(
      groundingCandidates.map((place) => ({
        name: place.name,
        subtitle: place.subtitle ?? null,
        reason: place.reason,
        whyThisFits: place.whyThisFits ?? null,
        optionalDetails: place.optionalDetails ?? null,
      }))
    ).slice(0, 1000)}`
  );
  if (!parsed) {
    logger?.log("[Ask AI Maps] Fallback reason: parseModelResponse returned null.");
  } else if (parsedPlaces.length === 0) {
    logger?.log("[Ask AI Maps] Fallback reason: parsed response had no places array.");
  } else if (normalizedPlaces.length === 0) {
    logger?.log("[Ask AI Maps] Fallback reason: parsed places existed but none survived normalization.");
  }
  if (usedGroundingCandidates) {
    logger?.log("[Ask AI Maps] Recovery path: grounding candidates used because parsed places were unavailable.");
  }
  if (noResultsReason) {
    logger?.log(`[Ask AI Maps] No-results reason: ${noResultsReason}`);
  }

  await logAskAiMapsLayer2Debug({
    modelUsed: model,
    query: params.query,
    selectedChips: params.selectedChips,
    nearMe: params.nearMe,
    openNow: params.openNow,
    userLocation: params.userLocation ?? null,
    geminiResponse: response,
    extractedSources: sources,
    parsedPlaces,
    finalPlaces: places,
  });

  logger?.log(`[Ask AI Maps] Map grounding sources: ${sources.length}`);
  logger?.log(
    `[Ask AI Maps] Parsed places: ${Array.isArray(parsed?.places) ? parsed.places.length : 0}`
  );
  logger?.log(`[Ask AI Maps] Final displayed places: ${places.length}`);
  logger?.log(
    `[Ask AI Maps] Places with coordinates: ${places.filter((place) => place.coordinates).length}`
  );
  logger?.log(
    `[Ask AI Maps] Final response payload: ${JSON.stringify({
      answerText,
      placeCount: places.length,
      usedParsedPlaces,
      usedGroundingCandidates,
      groundingSourceCount: sources.length,
      finalPlaceCount: places.length,
      noResultsReason,
      firstPlace: places[0]
        ? {
            name: places[0].name,
            subtitle: places[0].subtitle ?? null,
            reason: places[0].reason,
            whyThisFits: places[0].whyThisFits ?? null,
          }
        : null,
    })}`
  );

  return {
    query: params.query,
    mode: "map_grounding_only",
    answerText,
    places,
    sources: mapSourcesForResponse(sources),
    ...(places.length === 0
      ? {
          emptyReason: "NO_MAP_GROUNDING_RESULTS" as const,
          message: NO_RESULTS_MESSAGE,
        }
      : {}),
  };
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();
  const ambiguousQueryMessage = getAmbiguousQueryMessage(
    params.query,
    params.userLocation ?? null
  );

  if (ambiguousQueryMessage) {
    throw new AskAiMapsServiceError(ambiguousQueryMessage, 400);
  }

  if (isAskAiMapsCoolingDown()) {
    logger?.log("[Ask AI Maps] Cooldown active");
    return {
      query: params.query,
      mode: "map_grounding_only",
      answerText: PROVIDER_BUSY_MESSAGE,
      places: [],
      sources: [],
      emptyReason: "PROVIDER_BUSY",
      message: PROVIDER_BUSY_MESSAGE,
      latencyMs: Date.now() - startedAt,
    };
  }

  const apiKey = await getGoogleApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildRichMapsGroundingPrompt(params);
  let lastRetryableError: unknown = null;
  let sawRetryableProviderFailure = false;

  for (const [index, model] of ASK_AI_MAPS_MODELS.entries()) {
    logger?.log(`[Ask AI Maps] Trying model: ${model}`);

    try {
      const result = await generateMapsResponse({
        ai,
        model,
        prompt,
        params,
        logger,
      });

      return {
        ...result,
        modelUsed: model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const status = getErrorStatus(error);

      if (!isRetryableProviderError(error)) {
        throw new AskAiMapsServiceError(
          error instanceof Error ? error.message : "Gemini Maps request failed.",
          status
        );
      }

      logger?.log(`[Ask AI Maps] Model failed with status: ${status} (${model})`);
      sawRetryableProviderFailure = true;
      lastRetryableError = error;

      if (index < ASK_AI_MAPS_MODELS.length - 1) {
        await sleep(ASK_AI_MAPS_FALLBACK_DELAY_MS);
      }
    }
  }

  if (sawRetryableProviderFailure) {
    startAskAiMapsCooldown(ASK_AI_MAPS_PROVIDER_COOLDOWN_MS);
    logger?.log("[Ask AI Maps] Cooldown active");

    return {
      query: params.query,
      mode: "map_grounding_only",
      answerText: PROVIDER_BUSY_MESSAGE,
      places: [],
      sources: [],
      emptyReason: "PROVIDER_BUSY",
      message: PROVIDER_BUSY_MESSAGE,
      latencyMs: Date.now() - startedAt,
    };
  }

  throw new AskAiMapsServiceError(
    lastRetryableError instanceof Error
      ? lastRetryableError.message
      : "Gemini Maps request failed.",
    getErrorStatus(lastRetryableError)
  );
}
