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
  reason: string;
  googleMapsUrl?: string;
  placeId?: string;
  sourceTitle?: string;
  sourceUri?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  optionalDetails?: {
    categoryText?: string;
    ratingText?: string;
    openStatusText?: string;
    addressText?: string;
  };
};

export type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

export type AskAiMapsSearchResult = {
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
  categoryText?: unknown;
  openStatusText?: unknown;
  addressText?: unknown;
  ratingText?: unknown;
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
  categoryText?: string;
  ratingText?: string;
  openStatusText?: string;
  addressText?: string;
  coordinates?: {
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
  "gemini-3.1-flash-lite",
] as const;

const ASK_AI_MAPS_MAX_PLACES = 8;
const FALLBACK_QUOTA_STATUSES = new Set([429]);
const ASK_AI_MAPS_FALLBACK_DELAY_MS = 650;
const ASK_AI_MAPS_PROVIDER_TIMEOUT_MS = 18_000;
const PROVIDER_BUSY_MESSAGE = "Ask AI Maps is busy right now. Try again in a bit.";
const NO_RESULTS_MESSAGE =
  "No map-grounded places matched that request. Try a more specific area or place type.";
const FALLBACK_QUOTA_MESSAGE_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /quota/i,
  /resource exhausted/i,
  /consumed/i,
  /exceeded/i,
  /daily limit/i,
  /limit reached/i,
] as const;

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

function normalizeJsonCandidateText(text: string): string {
  return sanitizeJsonText(text)
    .replace(/^\s*json\s*/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractJsonObjectText(text: string): string {
  const sanitized = normalizeJsonCandidateText(text);
  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return sanitized;
  }

  return sanitized.slice(firstBrace, lastBrace + 1);
}

function extractJsonArrayText(text: string): string {
  const sanitized = normalizeJsonCandidateText(text);
  const firstBracket = sanitized.indexOf("[");
  const lastBracket = sanitized.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    return sanitized;
  }

  return sanitized.slice(firstBracket, lastBracket + 1);
}

function parseJsonObject<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractJsonStringField(text: string, fieldName: string): string | null {
  const match = text.match(
    new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s")
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function parseModelResponseLenient(text: string): ParsedModelResponse | null {
  const normalizedText = normalizeJsonCandidateText(text);
  const answerText =
    extractJsonStringField(normalizedText, "answerText") ??
    extractJsonStringField(normalizedText, "answer_text") ??
    extractJsonStringField(normalizedText, "answer") ??
    extractJsonStringField(normalizedText, "summary");
  const placesMatch = normalizedText.match(/"(places|results|recommendations|items)"\s*:\s*(\[[\s\S]*?\])/);
  const parsedPlaces = placesMatch?.[1]
    ? parseJsonObject<unknown[]>(normalizeJsonCandidateText(placesMatch[2]))
    : null;

  if (!answerText && !parsedPlaces) {
    return null;
  }

  return {
    ...(answerText ? { answerText } : {}),
    ...(parsedPlaces ? { places: parsedPlaces } : {}),
  };
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

function parseModelResponse(text: string): ParsedModelResponse | null {
  const jsonText = extractJsonObjectText(text);
  const jsonArrayText = extractJsonArrayText(text);

  if (!jsonText.startsWith("{")) {
    return (
      coerceParsedModelResponse(parseJsonObject<unknown>(jsonArrayText)) ??
      parseModelResponseLenient(text)
    );
  }

  const directParse = coerceParsedModelResponse(parseJsonObject<unknown>(jsonText));

  if (directParse) {
    return directParse;
  }

  return (
    coerceParsedModelResponse(parseJsonObject<unknown>(normalizeJsonCandidateText(jsonText))) ??
    coerceParsedModelResponse(parseJsonObject<unknown>(jsonArrayText)) ??
    parseModelResponseLenient(jsonText) ??
    parseModelResponseLenient(text)
  );
}

function looksLikeStructuredJsonReply(text: string): boolean {
  const normalized = normalizeJsonCandidateText(text);

  return (
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    (/\"answertext\"\s*:/i.test(normalized) && /\"places\"\s*:/i.test(normalized))
  );
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

function isQuotaOrRateLimitProviderError(error: unknown) {
  const status = getErrorStatus(error);

  if (FALLBACK_QUOTA_STATUSES.has(status)) {
    return true;
  }

  const message = getErrorMessage(error);

  if (!message) {
    return false;
  }

  return FALLBACK_QUOTA_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
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

  return `
You are GalaTayo's Ask AI Maps local guide.

Use only the Google Maps grounding tool for this answer.
Do not call or rely on Google Places API data.
Do not invent missing details.
Do not include photo URLs.
Do not promise exact hours, ratings, phone numbers, websites, coordinates, or other details unless the grounded answer explicitly provides them.
Return 6 to 8 recommendations when possible.
Never return more than 8 places.
Keep reasons short, natural, and useful.
The answer must be based on Google Maps grounding.

Return valid JSON only in this exact shape:
{
  "answerText": "A short grounded summary of the overall recommendations.",
  "places": [
    {
      "name": "Place name",
      "reason": "Short reason",
      "categoryText": "Optional category if obvious from the grounded answer",
      "openStatusText": "Optional open or closed text only if available from the grounded answer",
      "addressText": "Optional address text only if available from the grounded answer",
      "ratingText": "Optional rating text only if available from the grounded answer",
      "coordinates": {
        "latitude": 14.5995,
        "longitude": 120.9842
      }
    }
  ]
}

Include the "coordinates" object only when the grounded Google Maps result clearly resolves the place coordinates. Otherwise omit it.

If there are no solid grounded matches, return:
{
  "answerText": "No strong grounded matches were found.",
  "places": []
}

User query: ${query}
Selected chips: ${chipText}
Near me: ${nearMe ? "yes" : "no"}
Open now: ${openNow ? "yes" : "no"}
User coordinates: ${locationText}
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

    const title =
      normalizeTextNode(getObjectField(maps, ["title", "name", "displayName", "display_name"])) ??
      undefined;
    const text =
      normalizeTextNode(getObjectField(maps, ["text"])) ??
      normalizeText(getObjectField(maps, ["address", "formattedAddress", "formatted_address"])) ??
      undefined;
    const uri =
      normalizeText(getObjectField(maps, ["uri", "url", "sourceUri", "source_uri", "googleMapsUri", "google_maps_uri", "googleMapsUrl", "google_maps_url"])) ??
      undefined;
    const placeId =
      normalizeText(getObjectField(maps, ["placeId", "place_id", "id"])) ??
      undefined;
    const categoryText = normalizeCategoryText(
      getObjectField(maps, ["category", "categoryText", "category_text", "primaryTypeDisplayName", "primary_type_display_name", "primaryType", "primary_type", "types"])
    );
    const ratingText = normalizeOptionalDisplayText(
      getObjectField(maps, ["ratingText", "rating_text", "rating"])
    );
    const openStatusText = normalizeOpenStatusText(
      getObjectField(maps, ["openStatus", "open_status", "openStatusText", "open_status_text", "openNow", "open_now", "currentOpeningHours", "current_opening_hours"])
    );
    const addressText =
      normalizeTextNode(getObjectField(maps, ["shortFormattedAddress", "short_formatted_address"])) ??
      normalizeOptionalDisplayText(getObjectField(maps, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
      text;
    const coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(maps) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    if (!title && !uri && !placeId) {
      continue;
    }

    const dedupeKey = normalizePlaceKey(`${placeId ?? ""} ${uri ?? ""} ${title ?? ""}`);

    if (!dedupeKey || seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    sources.push({
      ...(title ? { title } : {}),
      ...(text ? { text } : {}),
      ...(uri ? { uri } : {}),
      ...(placeId ? { placeId } : {}),
      ...(categoryText ? { categoryText } : {}),
      ...(ratingText ? { ratingText } : {}),
      ...(openStatusText ? { openStatusText } : {}),
      ...(addressText ? { addressText } : {}),
      ...(coordinates ? { coordinates } : {}),
    });
  }

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

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const title =
      normalizeTextNode(getObjectField(record, ["title", "name", "displayName", "display_name"])) ??
      undefined;
    const uri =
      normalizeText(getObjectField(record, ["uri", "url", "sourceUri", "source_uri", "googleMapsUri", "google_maps_uri", "googleMapsUrl", "google_maps_url"])) ??
      undefined;
    const placeId =
      normalizeText(getObjectField(record, ["placeId", "place_id", "id"])) ??
      undefined;
    const categoryText = normalizeCategoryText(
      getObjectField(record, ["category", "categoryText", "category_text", "primaryTypeDisplayName", "primary_type_display_name", "primaryType", "primary_type", "types"])
    );
    const ratingText = normalizeOptionalDisplayText(
      getObjectField(record, ["ratingText", "rating_text", "rating"])
    );
    const openStatusText = normalizeOpenStatusText(
      getObjectField(record, ["openStatus", "open_status", "openStatusText", "open_status_text", "openNow", "open_now", "currentOpeningHours", "current_opening_hours"])
    );
    const addressText =
      normalizeTextNode(getObjectField(record, ["shortFormattedAddress", "short_formatted_address"])) ??
      normalizeOptionalDisplayText(getObjectField(record, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
      undefined;
    const coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(record) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    if (title && (uri || placeId || addressText || categoryText || coordinates)) {
      const dedupeKey = normalizePlaceKey(`${placeId ?? ""} ${uri ?? ""} ${title}`);

      if (dedupeKey && !seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        sources.push({
          title,
          ...(addressText ? { text: addressText } : {}),
          ...(uri ? { uri } : {}),
          ...(placeId ? { placeId } : {}),
          ...(categoryText ? { categoryText } : {}),
          ...(ratingText ? { ratingText } : {}),
          ...(openStatusText ? { openStatusText } : {}),
          ...(addressText ? { addressText } : {}),
          ...(coordinates ? { coordinates } : {}),
        });
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  }

  visit(value);
  return sources;
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
  place: AskAiMapGroundedPlace
): Promise<StoredPlaceCoordinateCandidate | null> {
  const trimmedName = normalizeText(place.name);

  if (!trimmedName) {
    return null;
  }

  const supabase = await getSupabaseAdminClient();
  const queryValue = `%${trimmedName}%`;
  const { data, error } = await supabase
    .from("places")
    .select("name,address,city,latitude,longitude")
    .ilike("name", queryValue)
    .limit(8);

  if (error) {
    throw new AskAiMapsServiceError("Failed to enrich Ask AI Maps coordinates.", 500);
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

  return bestScore >= 0.72 ? bestCandidate : null;
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

      const candidate = await findStoredPlaceCoordinateCandidate(place);

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

function buildAnswerText(
  parsed: ParsedModelResponse | null,
  places: AskAiMapGroundedPlace[],
  rawText: string
) {
  const parsedAnswer = normalizeOptionalDisplayText(parsed?.answerText);

  if (parsedAnswer) {
    return parsedAnswer;
  }

  if (places.length > 0) {
    return places
      .slice(0, 2)
      .map((place) => `${place.name}: ${place.reason}`)
      .join(" ");
  }

  if (looksLikeStructuredJsonReply(rawText)) {
    return "No grounded summary was provided.";
  }

  return normalizeText(rawText) ?? "No grounded summary was provided.";
}

function buildGroundedPlaceReason(args: {
  query: string;
  name: string;
  source?: GroundingSource;
}) {
  const category = args.source?.categoryText;
  const address = args.source?.addressText ?? args.source?.text;

  if (category && address) {
    return `${args.name} matches your search for "${args.query}" as a ${category} around ${address}.`;
  }

  if (address) {
    return `${args.name} is a map-grounded match for "${args.query}" around ${address}.`;
  }

  if (category) {
    return `${args.name} is a map-grounded ${category} match for "${args.query}".`;
  }

  return `${args.name} is a map-grounded match for "${args.query}".`;
}

const CAVITE_LOCATION_HINTS = [
  "cavite",
  "cavite city",
  "imus",
  "bacoor",
  "dasmarinas",
  "dasmariñas",
  "tagaytay",
  "general trias",
  "gen trias",
  "kawit",
  "silang",
  "trece",
  "trece martires",
  "tanza",
  "carmona",
] as const;

function filterSourcesForQuery(query: string, sources: GroundingSource[]) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery.includes("cavite")) {
    return sources;
  }

  const matchingSources = sources.filter((source) => {
    const haystack = normalizePlaceKey(
      [source.title ?? "", source.addressText ?? "", source.text ?? ""].join(" ")
    );

    return CAVITE_LOCATION_HINTS.some((hint) => haystack.includes(normalizePlaceKey(hint)));
  });

  if (matchingSources.length >= Math.min(3, sources.length)) {
    return matchingSources;
  }

  return sources;
}

function normalizeGroundedPlaces(
  parsed: ParsedModelResponse | null,
  sources: GroundingSource[],
  query: string
): AskAiMapGroundedPlace[] {
  const seenKeys = new Set<string>();
  const normalizedPlaces: AskAiMapGroundedPlace[] = [];
  const rawPlaces = Array.isArray(parsed?.places) ? parsed.places : [];

  for (const [index, rawPlace] of rawPlaces.entries()) {
    if (!rawPlace || typeof rawPlace !== "object") {
      continue;
    }

    const candidate = rawPlace as ParsedGroundedPlace;
    const name = normalizeText(candidate.name);
    const source = name ? findBestGroundingSource(name, sources) : undefined;

    if (!name) {
      continue;
    }

    const reason =
      normalizeOptionalDisplayText(candidate.reason) ??
      buildGroundedPlaceReason({ query, name, source });
    const googleMapsUrl = source?.uri;
    const placeId = source?.placeId;
    const categoryText =
      normalizeOptionalDisplayText(candidate.categoryText) ?? source?.categoryText;
    const ratingText =
      normalizeOptionalDisplayText(candidate.ratingText) ?? source?.ratingText;
    const openStatusText =
      normalizeOptionalDisplayText(candidate.openStatusText) ?? source?.openStatusText;
    const addressText =
      normalizeOptionalDisplayText(candidate.addressText) ??
      source?.addressText ??
      normalizeOptionalDisplayText(source?.text);
    const coordinates =
      extractCoordinatesFromParsedPlace(candidate) ??
      source?.coordinates ??
      extractCoordinatesFromGoogleMapsUrl(googleMapsUrl ?? source?.uri);
    const dedupeKey = normalizePlaceKey(`${placeId ?? ""} ${googleMapsUrl ?? ""} ${name}`);

    if (!dedupeKey || seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    normalizedPlaces.push({
      id: toPlaceId(placeId ?? googleMapsUrl ?? name, index),
      name,
      reason,
      ...(googleMapsUrl ? { googleMapsUrl } : {}),
      ...(placeId ? { placeId } : {}),
      ...(source?.title ? { sourceTitle: source.title } : {}),
      ...(source?.uri ? { sourceUri: source.uri } : {}),
      ...(coordinates ? { coordinates } : {}),
      ...(categoryText || ratingText || openStatusText || addressText
        ? {
            optionalDetails: {
              ...(categoryText ? { categoryText } : {}),
              ...(ratingText ? { ratingText } : {}),
              ...(openStatusText ? { openStatusText } : {}),
              ...(addressText ? { addressText } : {}),
            },
          }
        : {}),
    });
  }

  if (normalizedPlaces.length === 0 && sources.length > 0) {
    for (const [index, source] of sources.entries()) {
      const name = normalizeText(source.title);

      if (!name) {
        continue;
      }

      const dedupeKey = normalizePlaceKey(`${source.placeId ?? ""} ${source.uri ?? ""} ${name}`);

      if (!dedupeKey || seenKeys.has(dedupeKey)) {
        continue;
      }

      seenKeys.add(dedupeKey);
      normalizedPlaces.push({
        id: toPlaceId(source.title, index),
        name,
        reason: buildGroundedPlaceReason({ query, name: source.title, source }),
        ...(source.uri ? { googleMapsUrl: source.uri } : {}),
        ...(source.placeId ? { placeId: source.placeId } : {}),
        ...(source.title ? { sourceTitle: source.title } : {}),
        ...(source.uri ? { sourceUri: source.uri } : {}),
        ...(source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(source.uri)
          ? {
              coordinates:
                source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(source.uri)!,
            }
          : {}),
        ...(source.categoryText || source.ratingText || source.openStatusText || source.addressText
          ? {
              optionalDetails: {
                ...(source.categoryText ? { categoryText: source.categoryText } : {}),
                ...(source.ratingText ? { ratingText: source.ratingText } : {}),
                ...(source.openStatusText ? { openStatusText: source.openStatusText } : {}),
                ...(source.addressText ? { addressText: source.addressText } : {}),
              },
            }
          : {}),
      });
    }
  }

  return normalizedPlaces.slice(0, ASK_AI_MAPS_MAX_PLACES);
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
        temperature: 0.25,
        maxOutputTokens: 1800,
        tools: [{ googleMaps: {} }],
      },
    }),
    ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
    "Ask AI Maps provider timed out."
  );

  logger?.log(`[Ask AI Maps] Model succeeded: ${model}`);

  const candidateText = await extractGeminiCandidateTextForDebug(response as any);
  const rawText = typeof candidateText === "string" ? candidateText : "";
  const groundingMetadata =
    ((response as any)?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.response?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.candidates?.[0]?.grounding_metadata ??
      (response as any)?.response?.candidates?.[0]?.grounding_metadata) as
      | GroundingMetadataLike
      | undefined;
  const metadataSources = extractGroundingSources(groundingMetadata);
  const looseSources = extractLooseGoogleMapsSources(response);
  const sources = filterSourcesForQuery(
    params.query,
    metadataSources.length > 0 ? metadataSources : looseSources
  );
  const parsed = parseModelResponse(rawText);
  const parsedPlaces = Array.isArray(parsed?.places) ? parsed.places : [];
  const normalizedPlaces = normalizeGroundedPlaces(parsed, sources, params.query);
  const places = await hydrateGroundedPlacesWithCoordinates(normalizedPlaces, logger);
  const answerText = buildAnswerText(parsed, places, rawText);

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

  return {
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

  const apiKey = await getGoogleApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildMapsGroundingPrompt(params);
  let lastQuotaError: unknown = null;
  let sawQuotaOrRateLimitFailure = false;

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

      if (!isQuotaOrRateLimitProviderError(error)) {
        throw new AskAiMapsServiceError(
          error instanceof Error ? error.message : "Gemini Maps request failed.",
          status
        );
      }

      logger?.log(`[Ask AI Maps] Model quota/rate-limited with status: ${status} (${model})`);
      sawQuotaOrRateLimitFailure = true;
      lastQuotaError = error;

      if (index < ASK_AI_MAPS_MODELS.length - 1) {
        await sleep(ASK_AI_MAPS_FALLBACK_DELAY_MS);
      }
    }
  }

  if (sawQuotaOrRateLimitFailure) {
    return {
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
    lastQuotaError instanceof Error
      ? lastQuotaError.message
      : "Gemini Maps request failed.",
    getErrorStatus(lastQuotaError)
  );
}
