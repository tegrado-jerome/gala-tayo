import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { normalizeSearchText } from "../utils/searchMatching";

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

export type AskAiMapGroundedPlace = {
  id: string;
  name: string;
  reason: string;
  googleMapsUrl?: string;
  googleMapsUri?: string;
  placeId?: string;
  sourceTitle?: string;
  sourceUri?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  categoryText?: string;
  ratingText?: string;
  reviewCountText?: string;
  openStatusText?: string;
  hoursText?: string;
  addressText?: string;
  latitude?: number | null;
  longitude?: number | null;
  optionalDetails?: {
    categoryText?: string;
    ratingText?: string;
    reviewCountText?: string;
    openStatusText?: string;
    hoursText?: string;
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
  category?: unknown;
  categoryText?: unknown;
  reviewCount?: unknown;
  reviewCountText?: unknown;
  openStatus?: unknown;
  openStatusText?: unknown;
  hours?: unknown;
  hoursText?: unknown;
  address?: unknown;
  addressText?: unknown;
  ratingText?: unknown;
  placeId?: unknown;
  googleMapsUri?: unknown;
  googleMapsUrl?: unknown;
  sourceUri?: unknown;
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
  reviewCountText?: string;
  openStatusText?: string;
  hoursText?: string;
  addressText?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
};

function buildGroundingSourceKey(source: GroundingSource): string {
  const placeId = normalizeText(source.placeId);
  if (placeId) {
    return `placeid:${placeId.toLowerCase()}`;
  }

  const uri = normalizeGoogleMapsSourceIdentity(source.uri);
  if (uri) {
    return `uri:${uri}`;
  }

  const nameAddress = normalizePlaceKey(
    `${source.title ?? ""} ${source.addressText ?? source.text ?? ""}`
  );
  return nameAddress ? `nameaddr:${nameAddress}` : "";
}

function mergeGroundingSource(
  left: GroundingSource | undefined,
  right: GroundingSource
): GroundingSource {
  if (!left) {
    return right;
  }

  return {
    title: left.title ?? right.title,
    text: left.text ?? right.text,
    uri: left.uri ?? right.uri,
    placeId: left.placeId ?? right.placeId,
    categoryText: left.categoryText ?? right.categoryText,
    ratingText: left.ratingText ?? right.ratingText,
    reviewCountText: left.reviewCountText ?? right.reviewCountText,
    openStatusText: left.openStatusText ?? right.openStatusText,
    hoursText: left.hoursText ?? right.hoursText,
    addressText: left.addressText ?? right.addressText,
    coordinates: left.coordinates ?? right.coordinates,
  };
}

function mergeGroundingSourceLists(...sourceLists: GroundingSource[][]): GroundingSource[] {
  const merged = new Map<string, GroundingSource>();

  for (const sourceList of sourceLists) {
    for (const source of sourceList) {
      const key = buildGroundingSourceKey(source);

      if (!key) {
        continue;
      }

      merged.set(key, mergeGroundingSource(merged.get(key), source));
    }
  }

  return Array.from(merged.values());
}

type SourceMatchMethod =
  | "sourceUri"
  | "placeId"
  | "name"
  | "fuzzyNameAddress"
  | "none";

type RejectedPlaceDiagnostic = {
  name: string;
  missingFields: string[];
  hadSourceMatch: boolean;
  sourceMatchMethod?: SourceMatchMethod;
};

type AskAiMapsFilterDiagnostics = {
  rawParsedPlaces: number;
  groundingSources: number;
  normalizedPlacesBeforeStrictFilter: number;
  completePlacesAfterStrictFilter: number;
  rejectedBecauseMissing: Record<string, number>;
  rejectedPlaces: RejectedPlaceDiagnostic[];
};

type EnrichedGroundedPlaceCandidate = {
  place: AskAiMapGroundedPlace;
  hadSourceMatch: boolean;
  sourceMatchMethod: SourceMatchMethod;
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

const ASK_AI_MAPS_EXPERIMENT_MODEL = "gemini-3.1-flash-lite";
const ASK_AI_MAPS_MAX_PLACES = 10;
const ASK_AI_MAPS_PROVIDER_TIMEOUT_MS = 20_000;
const PROVIDER_BUSY_MESSAGE = "Ask AI Maps is busy right now. Try again in a bit.";
const NO_RESULTS_MESSAGE =
  "No map-grounded places matched that request. Try a more specific area or place type.";

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

function normalizeRatingText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(1);
  }

  return normalizeOptionalDisplayText(value);
}

function normalizeReviewCountText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return `${Math.round(value).toLocaleString("en-US")} reviews`;
  }

  const normalized = normalizeOptionalDisplayText(value);

  if (!normalized) {
    return undefined;
  }

  if (/\breview/i.test(normalized)) {
    return normalized;
  }

  if (/^\d[\d,]*$/.test(normalized)) {
    return `${normalized} reviews`;
  }

  return normalized;
}

function normalizeHoursText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => normalizeTextNode(entry) ?? normalizeOptionalDisplayText(entry))
      .filter((entry): entry is string => Boolean(entry));

    return entries.length > 0 ? entries.join(" | ") : undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const weekdayDescriptions = getObjectField(record, [
      "weekdayDescriptions",
      "weekday_descriptions",
      "weekdayText",
      "weekday_text",
      "periods",
    ]);
    const text =
      normalizeTextNode(getObjectField(record, ["text", "hoursText", "hours_text"])) ??
      normalizeHoursText(weekdayDescriptions);

    if (text) {
      return text;
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

function normalizeSourceUri(value: unknown): string | undefined {
  return normalizeText(value) ?? undefined;
}

function normalizeGoogleMapsSourceIdentity(value: string | undefined | null): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(normalized);
    } catch {
      return normalized;
    }
  })();

  return decoded.replace(/\/+$/, "");
}

function isWeakGroundedReason(value: string | undefined): boolean {
  const normalized = normalizeText(value)?.toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    "map-grounded",
    "grounded match",
    "requested area",
    "fits your query",
    "matches your search",
    "based on your query",
    "map grounded",
    "google maps recommendation for your request",
    "recommended based on google maps grounding",
  ].some((phrase) => normalized.includes(phrase));
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

function getProviderStatus(error: unknown): number | undefined {
  const status = getErrorStatus(error);
  return status >= 400 ? status : undefined;
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
          reject(
            new AskAiMapsServiceError(message, 504, {
              code: "ASK_AI_MAPS_TIMEOUT",
              stage: "provider_call",
            })
          );
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
  return true;
}

function isAskAiMapsFilterDebugEnabled(): boolean {
  return process.env.DEBUG_ASK_AI_MAPS_FILTER === "true";
}

function logAskAiMapsDiagnostics(
  logger: AskAiMapsLogger | undefined,
  stage: string,
  details: Record<string, unknown>
) {
  logger?.log(`[Ask AI Maps] ${stage} ${JSON.stringify(sanitizeForDebug(details))}`);
}

function toAskAiMapsServiceError(
  error: unknown,
  fallback: {
    status: number;
    code: string;
    message: string;
    stage: string;
    model?: string;
    details?: Record<string, unknown>;
  }
): AskAiMapsServiceError {
  if (error instanceof AskAiMapsServiceError) {
    return error;
  }

  const providerStatus = getProviderStatus(error);

  return new AskAiMapsServiceError(
    error instanceof Error && error.message ? error.message : fallback.message,
    fallback.status,
    {
      code: fallback.code,
      providerStatus,
      model: fallback.model,
      stage: fallback.stage,
      details: fallback.details,
      cause: error,
    }
  );
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

function extractPlaceIdFromGoogleMapsUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  const candidateValues = [
    url,
    (() => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    })(),
  ];

  for (const candidateValue of candidateValues) {
    try {
      const parsed = new URL(candidateValue);
      const fromQuery =
        parsed.searchParams.get("query_place_id") ??
        parsed.searchParams.get("placeid") ??
        parsed.searchParams.get("place_id") ??
        parsed.searchParams.get("ftid") ??
        parsed.searchParams.get("cid");

      if (fromQuery) {
        return fromQuery;
      }
    } catch {
      const match = candidateValue.match(
        /[?&](?:query_place_id|placeid|place_id|ftid|cid)=([^&]+)/i
      );

      if (match?.[1]) {
        return match[1];
      }
    }
  }

  return null;
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

function isBroadDiscoveryQuery({
  query,
  nearMe = false,
  openNow = false,
  userLocation,
}: AskAiMapsSearchParams): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return false;
  }

  if (nearMe || openNow || userLocation) {
    return false;
  }

  const broadCategoryPattern =
    /\b(mall|malls|shopping|samgyup|samgyeop|korean bbq|cafe|cafes|coffee|restaurant|restaurants|kainan|food|tourist|tourist spots|attraction|attractions|museum|museums|park|parks)\b/i;
  const narrowModifierPattern =
    /\b(near me|near|around|closest|open now|wifi|pet[- ]friendly|wheelchair|accessible|quiet|study|small town|sm |up diliman)\b/i;

  if (!broadCategoryPattern.test(normalizedQuery)) {
    return false;
  }

  if (narrowModifierPattern.test(normalizedQuery)) {
    return false;
  }

  return true;
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
  const broadDiscoveryQuery = isBroadDiscoveryQuery({
    query,
    selectedChips,
    nearMe,
    openNow,
    userLocation,
  });
  const quantityInstruction = broadDiscoveryQuery
    ? "Return 6 to 10 grounded places for broad/general discovery queries when enough relevant places are available. If there are many relevant options, return the best 6 to 10. Do not fabricate places to meet the minimum."
    : "For specific or narrow queries, return fewer than 6 if only a few good grounded places exist. If there are only a few relevant options, return only those. Do not fabricate places to meet the minimum.";

return `
You are GalaTayo Ask AI Map, a grounded place recommendation assistant.

Use Google Maps Grounding only.

Return JSON only. No markdown.

${quantityInstruction}
Prefer rich grounded places with category, rating, reviews, address, hours, and coordinates.
Quality still matters, but do not over-limit broad discovery searches to only a few results.
Do not include weak places if richer grounded places are available.

Only use information supported by Google Maps Grounding. Never invent missing place details.

A place is valid if it has:
- name
- reason
- either googleMapsUri or placeId

Each place should include this shape:
{
  "answerText": "A short grounded summary of the recommendations.",
  "places": [
    {
      "placeId": "string",
      "name": "Place name",
      "address": "string",
      "category": "string",
      "ratingText": "string",
      "reviewCountText": "string",
      "openStatusText": "string",
      "hoursText": "string",
      "googleMapsUri": "string",
      "latitude": null,
      "longitude": null,
      "reason": "string"
    }
  ]
}

If a text field is unavailable, use an empty string.
If latitude/longitude are unavailable, use null.

The reason must be 1 short Taglish sentence explaining why this place fits the user query.

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
      throw new AskAiMapsServiceError("Google API key is missing.", 500, {
        code: "ASK_AI_MAPS_CONFIG_ERROR",
        stage: "load_api_key",
      });
    }

    return apiKey;
  } catch (error) {
    if (error instanceof AskAiMapsServiceError) {
      throw error;
    }

    throw new AskAiMapsServiceError(
      error instanceof Error ? error.message : "Failed to retrieve Google API key.",
      500,
      {
        code: "ASK_AI_MAPS_CONFIG_ERROR",
        stage: "load_api_key",
        cause: error,
      }
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
    const ratingText = normalizeRatingText(
      getObjectField(maps, ["ratingText", "rating_text", "rating", "formattedRating", "formatted_rating"])
    );
    const reviewCountText = normalizeReviewCountText(
      getObjectField(maps, [
        "reviewCountText",
        "review_count_text",
        "userRatingCountText",
        "user_rating_count_text",
        "userRatingCount",
        "user_rating_count",
        "reviewCount",
        "review_count",
      ])
    );
    const openStatusText = normalizeOpenStatusText(
      getObjectField(maps, ["openStatus", "open_status", "openStatusText", "open_status_text", "openNow", "open_now", "currentOpeningHours", "current_opening_hours"])
    );
    const hoursText = normalizeHoursText(
      getObjectField(maps, [
        "hoursText",
        "hours_text",
        "openingHours",
        "opening_hours",
        "currentOpeningHours",
        "current_opening_hours",
        "regularOpeningHours",
        "regular_opening_hours",
        "weekdayDescriptions",
        "weekday_descriptions",
      ])
    );
    const addressText =
      normalizeTextNode(getObjectField(maps, ["shortFormattedAddress", "short_formatted_address"])) ??
      normalizeOptionalDisplayText(getObjectField(maps, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
      text;
    const coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(maps) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    if (!title && !uri && !placeId && !addressText && !categoryText && !coordinates) {
      continue;
    }

    const dedupeKey = buildGroundingSourceKey({
      title,
      text,
      uri,
      placeId,
      categoryText,
      ratingText,
      reviewCountText,
      openStatusText,
      hoursText,
      addressText,
      coordinates,
    });

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
      ...(reviewCountText ? { reviewCountText } : {}),
      ...(openStatusText ? { openStatusText } : {}),
      ...(hoursText ? { hoursText } : {}),
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
    const ratingText = normalizeRatingText(
      getObjectField(record, ["ratingText", "rating_text", "rating", "formattedRating", "formatted_rating"])
    );
    const reviewCountText = normalizeReviewCountText(
      getObjectField(record, [
        "reviewCountText",
        "review_count_text",
        "userRatingCountText",
        "user_rating_count_text",
        "userRatingCount",
        "user_rating_count",
        "reviewCount",
        "review_count",
      ])
    );
    const openStatusText = normalizeOpenStatusText(
      getObjectField(record, ["openStatus", "open_status", "openStatusText", "open_status_text", "openNow", "open_now", "currentOpeningHours", "current_opening_hours"])
    );
    const hoursText = normalizeHoursText(
      getObjectField(record, [
        "hoursText",
        "hours_text",
        "openingHours",
        "opening_hours",
        "currentOpeningHours",
        "current_opening_hours",
        "regularOpeningHours",
        "regular_opening_hours",
        "weekdayDescriptions",
        "weekday_descriptions",
      ])
    );
    const addressText =
      normalizeTextNode(getObjectField(record, ["shortFormattedAddress", "short_formatted_address"])) ??
      normalizeOptionalDisplayText(getObjectField(record, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
      undefined;
    const coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(record) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    if (title || uri || placeId || addressText || categoryText || coordinates) {
      const dedupeKey = buildGroundingSourceKey({
        title,
        uri,
        placeId,
        categoryText,
        ratingText,
        reviewCountText,
        openStatusText,
        hoursText,
        addressText,
        coordinates,
      });

      if (dedupeKey && !seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        sources.push({
          ...(title ? { title } : {}),
          ...(addressText ? { text: addressText } : {}),
          ...(uri ? { uri } : {}),
          ...(placeId ? { placeId } : {}),
          ...(categoryText ? { categoryText } : {}),
          ...(ratingText ? { ratingText } : {}),
          ...(reviewCountText ? { reviewCountText } : {}),
          ...(openStatusText ? { openStatusText } : {}),
          ...(hoursText ? { hoursText } : {}),
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

function getSourceAddressMatchScore(
  leftAddress: string | undefined,
  rightAddress: string | undefined
) {
  const left = normalizePlaceKey(leftAddress ?? "");
  const right = normalizePlaceKey(rightAddress ?? "");

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

function findMatchingGroundingSource(args: {
  parsedName?: string | null;
  parsedAddress?: string | null;
  parsedSourceUri?: string | null;
  parsedPlaceId?: string | null;
  sources: GroundingSource[];
}): { source?: GroundingSource; method: SourceMatchMethod } {
  const normalizedParsedName = normalizePlaceKey(args.parsedName ?? "");
  const normalizedParsedAddress = normalizeText(args.parsedAddress);
  const normalizedParsedSourceUri = normalizeGoogleMapsSourceIdentity(args.parsedSourceUri);
  const normalizedParsedPlaceId = normalizeText(args.parsedPlaceId);

  if (normalizedParsedPlaceId) {
    const sourceByPlaceId = args.sources.find(
      (source) => source.placeId === normalizedParsedPlaceId
    );

    if (sourceByPlaceId) {
      return { source: sourceByPlaceId, method: "placeId" };
    }
  }

  if (normalizedParsedSourceUri) {
    const sourceByUri = args.sources.find(
      (source) => normalizeGoogleMapsSourceIdentity(source.uri) === normalizedParsedSourceUri
    );

    if (sourceByUri) {
      return { source: sourceByUri, method: "sourceUri" };
    }
  }

  if (normalizedParsedName) {
    const sourceByExactName = args.sources.find((source) => {
      const normalizedTitle = normalizePlaceKey(source.title ?? "");
      return normalizedTitle && normalizedTitle === normalizedParsedName;
    });

    if (sourceByExactName) {
      return { source: sourceByExactName, method: "name" };
    }

    const sourceByPartialName = args.sources.find((source) => {
      const normalizedTitle = normalizePlaceKey(source.title ?? "");
      return (
        normalizedTitle &&
        (normalizedTitle.includes(normalizedParsedName) ||
          normalizedParsedName.includes(normalizedTitle))
      );
    });

    if (sourceByPartialName) {
      return { source: sourceByPartialName, method: "fuzzyNameAddress" };
    }
  }

  if (!normalizedParsedName) {
    return { method: "none" };
  }

  let bestSource: GroundingSource | undefined;
  let bestScore = 0;

  for (const source of args.sources) {
    const normalizedTitle = normalizePlaceKey(source.title ?? "");

    if (!normalizedTitle) {
      continue;
    }

    const nameScore =
      normalizedTitle.includes(normalizedParsedName) ||
      normalizedParsedName.includes(normalizedTitle)
        ? 0.95
        : getOverlapScore(normalizedParsedName, normalizedTitle);
    const addressScore = getSourceAddressMatchScore(
      normalizedParsedAddress ?? undefined,
      source.addressText ?? source.text
    );
    const totalScore = nameScore * 0.75 + addressScore * 0.25;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSource = source;
    }
  }

  return bestScore >= 0.72
    ? { source: bestSource, method: "fuzzyNameAddress" }
    : { method: "none" };
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
  categoryText?: string;
  addressText?: string;
  ratingText?: string;
  reviewCountText?: string;
  openStatusText?: string;
  hoursText?: string;
}) {
  const query = normalizeText(args.query)?.toLowerCase() ?? "";
  const category = normalizeText(args.categoryText ?? args.source?.categoryText)?.toLowerCase();
  const rating = normalizeText(args.ratingText ?? args.source?.ratingText);
  const reviewCount = normalizeText(
    args.reviewCountText ?? args.source?.reviewCountText
  );
  const openStatus = normalizeText(
    args.openStatusText ?? args.source?.openStatusText
  );
  const hoursText = normalizeText(args.hoursText ?? args.source?.hoursText);
  const address = normalizeText(
    args.addressText ?? args.source?.addressText ?? args.source?.text
  );

  const isMallQuery =
    query.includes("mall") ||
    query.includes("shopping") ||
    Boolean(category && /(mall|shopping center|shopping mall)/i.test(category));
  const isSamgyupQuery =
    query.includes("samgyup") ||
    query.includes("samgyeop") ||
    query.includes("korean bbq") ||
    Boolean(category && /(korean|bbq|barbecue)/i.test(category));
  const isCafeQuery =
    query.includes("cafe") ||
    query.includes("coffee") ||
    query.includes("study") ||
    Boolean(category && /(cafe|coffee)/i.test(category));
  const isRestaurantQuery =
    query.includes("restaurant") ||
    query.includes("food") ||
    query.includes("kainan") ||
    query.includes("eat") ||
    Boolean(category && /(restaurant|eatery|diner|food)/i.test(category));
  const isAttractionQuery =
    query.includes("attraction") ||
    query.includes("museum") ||
    query.includes("park") ||
    query.includes("tourist") ||
    query.includes("visit") ||
    Boolean(category && /(museum|park|attraction|landmark|tourist)/i.test(category));
  const areaLabel = address
    ? address.split(",").map((part) => part.trim()).filter(Boolean).slice(-2).join(", ")
    : "";

  if (isMallQuery) {
    return areaLabel
      ? `Good mall option for shopping, food, and indoor tambayan around ${areaLabel}. ${openStatus || hoursText ? `${openStatus ?? hoursText} based on Google Maps.` : "Useful map details are available if you want to compare options."}`
      : "Good mall option for shopping, food, and indoor tambayan around this part of Cavite.";
  }

  if (isSamgyupQuery) {
    return "Good Korean BBQ option if you're craving samgyup nearby. Dine-in or map details are included when available.";
  }

  if (isCafeQuery) {
    return "Good cafe pick if you want a place to chill, study, or get coffee nearby. Helpful map details are included when available.";
  }

  if (isRestaurantQuery) {
    return "Good food spot to consider based on the area and your search. Helpful map details are shown when available.";
  }

  if (isAttractionQuery) {
    return "Nice place to check out if you're looking for something to visit nearby. Helpful map details are shown when available.";
  }

  if (category && rating && reviewCount) {
    return `Good ${category} option to check nearby. Google Maps shows ${rating} and ${reviewCount}${openStatus ? `, with ${openStatus.toLowerCase()} details` : ""}.`;
  }

  if (category && address) {
    return `Good ${category} option to check around ${address}. Useful Google Maps details are included when available.`;
  }

  if (address) {
    return `Good nearby place to consider around ${address}. Helpful map details are included when available.`;
  }

  return "Relevant place to consider based on your search and location.";
}

function mergeGroundingMetadata(args: {
  parsedCategoryText?: string;
  parsedRatingText?: string;
  parsedReviewCountText?: string;
  parsedOpenStatusText?: string;
  parsedHoursText?: string;
  parsedAddressText?: string;
  parsedCoordinates?: { latitude: number; longitude: number } | null;
  parsedGoogleMapsUrl?: string;
  parsedSourceUri?: string;
  parsedPlaceId?: string;
  source?: GroundingSource;
}) {
  const googleMapsUrl =
    args.parsedGoogleMapsUrl ?? args.parsedSourceUri ?? args.source?.uri;
  const sourceUri = args.parsedSourceUri ?? args.source?.uri ?? args.parsedGoogleMapsUrl;
  const placeId =
    args.parsedPlaceId ??
    args.source?.placeId ??
    extractPlaceIdFromGoogleMapsUrl(googleMapsUrl ?? sourceUri);
  const categoryText = args.parsedCategoryText ?? args.source?.categoryText;
  const ratingText = args.parsedRatingText ?? args.source?.ratingText;
  const reviewCountText =
    args.parsedReviewCountText ?? args.source?.reviewCountText;
  const openStatusText =
    args.parsedOpenStatusText ?? args.source?.openStatusText;
  const hoursText = args.parsedHoursText ?? args.source?.hoursText;
  const addressText =
    args.parsedAddressText ??
    args.source?.addressText ??
    normalizeOptionalDisplayText(args.source?.text);
  const coordinates =
    args.parsedCoordinates ??
    args.source?.coordinates ??
    extractCoordinatesFromGoogleMapsUrl(googleMapsUrl ?? sourceUri ?? args.source?.uri);

  return {
    googleMapsUrl,
    sourceUri,
    placeId,
    categoryText,
    ratingText,
    reviewCountText,
    openStatusText,
    hoursText,
    addressText,
    coordinates,
  };
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

function hasRequiredCompletePlaceDetails(place: AskAiMapGroundedPlace) {
  return getMissingRequiredPlaceFields(place).length === 0;
}

function getPlaceIdentityUri(place: Pick<AskAiMapGroundedPlace, "googleMapsUri" | "googleMapsUrl" | "sourceUri">): string | null {
  return (
    normalizeSourceUri(place.googleMapsUri) ??
    normalizeSourceUri(place.googleMapsUrl) ??
    normalizeSourceUri(place.sourceUri) ??
    null
  );
}

function getMissingRequiredPlaceFields(place: AskAiMapGroundedPlace): string[] {
  const missingFields: string[] = [];

  if (!normalizeText(place.name)) missingFields.push("name");
  if (!normalizeText(place.reason)) {
    missingFields.push("reason");
  }
  if (!(normalizeText(place.placeId) || getPlaceIdentityUri(place))) {
    missingFields.push("googleMapsUri/placeId");
  }

  return missingFields;
}

function normalizePlaceName(value: string | undefined): string {
  const normalized = normalizeText(value)?.toLowerCase() ?? "";

  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(branch|city branch|store|mall branch)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCanonicalPlaceId(placeId: string | undefined): string | null {
  const normalized = normalizeText(placeId);
  return normalized ? normalized.toLowerCase() : null;
}

function getPlaceAddressText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.addressText) ??
    normalizeText(place.optionalDetails?.addressText) ??
    ""
  );
}

function getPlaceCategoryText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.categoryText) ??
    normalizeText(place.optionalDetails?.categoryText) ??
    ""
  );
}

function getPlaceRatingText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.ratingText) ??
    normalizeText(place.optionalDetails?.ratingText) ??
    ""
  );
}

function getPlaceReviewCountText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.reviewCountText) ??
    normalizeText(place.optionalDetails?.reviewCountText) ??
    ""
  );
}

function getPlaceOpenStatusText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.openStatusText) ??
    normalizeText(place.optionalDetails?.openStatusText) ??
    ""
  );
}

function getPlaceHoursText(place: AskAiMapGroundedPlace): string {
  return (
    normalizeText(place.hoursText) ??
    normalizeText(place.optionalDetails?.hoursText) ??
    ""
  );
}

function isGenericMapReason(reason: string | undefined): boolean {
  return isWeakGroundedReason(reason);
}

function getPlaceRichnessScore(place: AskAiMapGroundedPlace) {
  let score = 0;

  if (place.name) score += 5;
  if (place.googleMapsUri || place.googleMapsUrl) score += 5;
  if (place.placeId) score += 5;

  if (getPlaceCategoryText(place)) score += 5;
  if (getPlaceRatingText(place)) score += 7;
  if (getPlaceReviewCountText(place)) score += 7;
  if (getPlaceOpenStatusText(place)) score += 6;
  if (getPlaceHoursText(place)) score += 6;
  if (getPlaceAddressText(place)) score += 7;
  if (
    typeof place.latitude === "number" &&
    typeof place.longitude === "number"
  ) {
    score += 10;
  }
  if (
    typeof place.coordinates?.latitude === "number" &&
    typeof place.coordinates?.longitude === "number"
  ) {
    score += 10;
  }

  if (place.reason && !isGenericMapReason(place.reason)) score += 8;

  return score;
}

function getPlaceQueryRelevanceScore(
  place: AskAiMapGroundedPlace,
  query: string
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const name = normalizeSearchText(place.name);
  const category = normalizeSearchText(getPlaceCategoryText(place));
  const address = normalizeSearchText(getPlaceAddressText(place));
  const reason = normalizeSearchText(place.reason);
  let score = 0;

  const queryTokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  for (const token of queryTokens) {
    if (name.includes(token)) score += 5;
    if (category.includes(token)) score += 6;
    if (address.includes(token)) score += 4;
    if (reason.includes(token)) score += 2;
  }

  return score;
}

function compareGroundedPlaceCandidates(
  left: EnrichedGroundedPlaceCandidate,
  right: EnrichedGroundedPlaceCandidate,
  query: string
) {
  const relevanceDelta =
    getPlaceQueryRelevanceScore(right.place, query) -
    getPlaceQueryRelevanceScore(left.place, query);

  if (relevanceDelta !== 0) {
    return relevanceDelta;
  }

  const scoreDelta =
    getPlaceRichnessScore(right.place) - getPlaceRichnessScore(left.place);

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const leftHasSourceMatch = left.hadSourceMatch ? 1 : 0;
  const rightHasSourceMatch = right.hadSourceMatch ? 1 : 0;
  const sourceMatchDelta = rightHasSourceMatch - leftHasSourceMatch;

  if (sourceMatchDelta !== 0) {
    return sourceMatchDelta;
  }

  const leftGenericReason = isGenericMapReason(left.place.reason) ? 1 : 0;
  const rightGenericReason = isGenericMapReason(right.place.reason) ? 1 : 0;
  const genericReasonDelta = leftGenericReason - rightGenericReason;

  if (genericReasonDelta !== 0) {
    return genericReasonDelta;
  }

  return left.place.name.localeCompare(right.place.name);
}

function chooseBetterReason(
  leftReason: string | undefined,
  rightReason: string | undefined
): string | undefined {
  const left = normalizeText(leftReason) ?? undefined;
  const right = normalizeText(rightReason) ?? undefined;

  if (!left) return right;
  if (!right) return left;

  const leftGeneric = isGenericMapReason(left);
  const rightGeneric = isGenericMapReason(right);

  if (leftGeneric !== rightGeneric) {
    return leftGeneric ? right : left;
  }

  return right.length > left.length ? right : left;
}

function chooseBetterMapsUri(
  leftUri: string | undefined,
  rightUri: string | undefined
): string | undefined {
  const left = normalizeText(leftUri) ?? undefined;
  const right = normalizeText(rightUri) ?? undefined;

  if (!left) return right;
  if (!right) return left;

  const leftCid = extractGoogleMapsCid(left);
  const rightCid = extractGoogleMapsCid(right);

  if (leftCid && !rightCid) return left;
  if (rightCid && !leftCid) return right;

  return right.length > left.length ? right : left;
}

function chooseBetterPlaceId(
  leftPlaceId: string | undefined,
  rightPlaceId: string | undefined
): string | undefined {
  const left = normalizeText(leftPlaceId) ?? undefined;
  const right = normalizeText(rightPlaceId) ?? undefined;

  if (!left) return right;
  if (!right) return left;

  const leftCanonical = /places\//i.test(left);
  const rightCanonical = /places\//i.test(right);

  if (leftCanonical && !rightCanonical) return left;
  if (rightCanonical && !leftCanonical) return right;

  return right.length > left.length ? right : left;
}

function mergeOptionalDetails(
  richer: AskAiMapGroundedPlace,
  weaker: AskAiMapGroundedPlace
) {
  return buildOptionalDetails({
    categoryText: getPlaceCategoryText(richer) || getPlaceCategoryText(weaker) || undefined,
    ratingText: getPlaceRatingText(richer) || getPlaceRatingText(weaker) || undefined,
    reviewCountText:
      getPlaceReviewCountText(richer) || getPlaceReviewCountText(weaker) || undefined,
    openStatusText:
      getPlaceOpenStatusText(richer) || getPlaceOpenStatusText(weaker) || undefined,
    hoursText: getPlaceHoursText(richer) || getPlaceHoursText(weaker) || undefined,
    addressText: getPlaceAddressText(richer) || getPlaceAddressText(weaker) || undefined,
  });
}

function mergeDuplicatePlaces(
  richerCandidate: EnrichedGroundedPlaceCandidate,
  weakerCandidate: EnrichedGroundedPlaceCandidate
): EnrichedGroundedPlaceCandidate {
  const richerPlace = richerCandidate.place;
  const weakerPlace = weakerCandidate.place;
  const betterUri = chooseBetterMapsUri(
    getPlaceIdentityUri(richerPlace) ?? undefined,
    getPlaceIdentityUri(weakerPlace) ?? undefined
  );
  const betterPlaceId = chooseBetterPlaceId(richerPlace.placeId, weakerPlace.placeId);
  const coordinates =
    richerPlace.coordinates ??
    weakerPlace.coordinates ??
    (typeof richerPlace.latitude === "number" &&
    typeof richerPlace.longitude === "number"
      ? { latitude: richerPlace.latitude, longitude: richerPlace.longitude }
      : typeof weakerPlace.latitude === "number" &&
          typeof weakerPlace.longitude === "number"
        ? { latitude: weakerPlace.latitude, longitude: weakerPlace.longitude }
        : null);

  return {
    place: {
      ...richerPlace,
      reason: chooseBetterReason(richerPlace.reason, weakerPlace.reason) ?? richerPlace.reason,
      googleMapsUrl: betterUri ?? richerPlace.googleMapsUrl ?? weakerPlace.googleMapsUrl,
      googleMapsUri: betterUri ?? richerPlace.googleMapsUri ?? weakerPlace.googleMapsUri,
      placeId: betterPlaceId ?? richerPlace.placeId ?? weakerPlace.placeId,
      sourceTitle: richerPlace.sourceTitle ?? weakerPlace.sourceTitle,
      sourceUri: richerPlace.sourceUri ?? weakerPlace.sourceUri,
      coordinates,
      optionalDetails: mergeOptionalDetails(richerPlace, weakerPlace),
      categoryText: getPlaceCategoryText(richerPlace) || getPlaceCategoryText(weakerPlace) || undefined,
      ratingText: getPlaceRatingText(richerPlace) || getPlaceRatingText(weakerPlace) || undefined,
      reviewCountText:
        getPlaceReviewCountText(richerPlace) || getPlaceReviewCountText(weakerPlace) || undefined,
      openStatusText:
        getPlaceOpenStatusText(richerPlace) || getPlaceOpenStatusText(weakerPlace) || undefined,
      hoursText: getPlaceHoursText(richerPlace) || getPlaceHoursText(weakerPlace) || undefined,
      addressText: getPlaceAddressText(richerPlace) || getPlaceAddressText(weakerPlace) || undefined,
      latitude:
        coordinates?.latitude ??
        richerPlace.latitude ??
        weakerPlace.latitude ??
        null,
      longitude:
        coordinates?.longitude ??
        richerPlace.longitude ??
        weakerPlace.longitude ??
        null,
    },
    hadSourceMatch: richerCandidate.hadSourceMatch || weakerCandidate.hadSourceMatch,
    sourceMatchMethod:
      richerCandidate.sourceMatchMethod !== "none"
        ? richerCandidate.sourceMatchMethod
        : weakerCandidate.sourceMatchMethod,
  };
}

function arePlaceAddressesNearby(leftAddress: string, rightAddress: string) {
  if (!leftAddress || !rightAddress) {
    return false;
  }

  const left = normalizePlaceKey(leftAddress);
  const right = normalizePlaceKey(rightAddress);

  return (
    left === right ||
    left.includes(right) ||
    right.includes(left) ||
    getOverlapScore(left, right) >= 0.7
  );
}

function buildDuplicateIdentityKeys(place: AskAiMapGroundedPlace): string[] {
  const keys: string[] = [];
  const identityUri = getPlaceIdentityUri(place);
  const cid = extractGoogleMapsCid(identityUri ?? undefined);
  const placeId = getCanonicalPlaceId(place.placeId);
  const normalizedName = normalizePlaceName(place.name);
  const normalizedAddress = normalizePlaceKey(getPlaceAddressText(place));

  if (identityUri) keys.push(`uri:${identityUri}`);
  if (cid) keys.push(`cid:${cid}`);
  if (placeId) keys.push(`placeid:${placeId}`);
  if (normalizedName && normalizedAddress) {
    keys.push(`nameaddr:${normalizedName}|${normalizedAddress}`);
  }
  if (normalizedName) {
    keys.push(`name:${normalizedName}`);
  }

  return keys;
}

function buildOptionalDetails(details: {
  categoryText?: string;
  ratingText?: string;
  reviewCountText?: string;
  openStatusText?: string;
  hoursText?: string;
  addressText?: string;
}) {
  const optionalDetails = {
    ...(details.categoryText ? { categoryText: details.categoryText } : {}),
    ...(details.ratingText ? { ratingText: details.ratingText } : {}),
    ...(details.reviewCountText ? { reviewCountText: details.reviewCountText } : {}),
    ...(details.openStatusText ? { openStatusText: details.openStatusText } : {}),
    ...(details.hoursText ? { hoursText: details.hoursText } : {}),
    ...(details.addressText ? { addressText: details.addressText } : {}),
  };

  return Object.keys(optionalDetails).length > 0 ? optionalDetails : undefined;
}

function cleanupFinalPlaceReason(
  place: AskAiMapGroundedPlace,
  query: string
): AskAiMapGroundedPlace {
  if (!isGenericMapReason(place.reason)) {
    return place;
  }

  return {
    ...place,
    reason: buildGroundedPlaceReason({
      query,
      name: place.name,
      categoryText: getPlaceCategoryText(place) || undefined,
      ratingText: getPlaceRatingText(place) || undefined,
      reviewCountText: getPlaceReviewCountText(place) || undefined,
      openStatusText: getPlaceOpenStatusText(place) || undefined,
      hoursText: getPlaceHoursText(place) || undefined,
      addressText: getPlaceAddressText(place) || undefined,
    }),
  };
}

function serializePlaceForResponse(place: AskAiMapGroundedPlace): AskAiMapGroundedPlace {
  const coordinates =
    typeof place.coordinates?.latitude === "number" &&
    typeof place.coordinates?.longitude === "number"
      ? {
          latitude: place.coordinates.latitude,
          longitude: place.coordinates.longitude,
        }
      : null;
  const googleMapsUri = getPlaceIdentityUri(place) ?? "";
  const optionalDetails = {
    categoryText: place.optionalDetails?.categoryText ?? "",
    ratingText: place.optionalDetails?.ratingText ?? "",
    reviewCountText: place.optionalDetails?.reviewCountText ?? "",
    openStatusText: place.optionalDetails?.openStatusText ?? "",
    hoursText: place.optionalDetails?.hoursText ?? "",
    addressText: place.optionalDetails?.addressText ?? "",
  };

  return {
    ...place,
    googleMapsUrl: googleMapsUri,
    googleMapsUri,
    placeId: place.placeId ?? "",
    sourceTitle: place.sourceTitle ?? "",
    sourceUri: place.sourceUri ?? "",
    coordinates,
    categoryText: optionalDetails.categoryText,
    ratingText: optionalDetails.ratingText,
    reviewCountText: optionalDetails.reviewCountText,
    openStatusText: optionalDetails.openStatusText,
    hoursText: optionalDetails.hoursText,
    addressText: optionalDetails.addressText,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    optionalDetails,
  };
}

function buildAskAiMapsFilterDiagnostics(args: {
  rawParsedPlaces: number;
  groundingSources: number;
  candidates: EnrichedGroundedPlaceCandidate[];
  finalPlaces: AskAiMapGroundedPlace[];
}): AskAiMapsFilterDiagnostics {
  const rejectedBecauseMissing: Record<string, number> = {};
  const rejectedPlaces: RejectedPlaceDiagnostic[] = [];

  for (const candidate of args.candidates) {
    const missingFields = getMissingRequiredPlaceFields(candidate.place);

    if (missingFields.length === 0) {
      continue;
    }

    for (const field of missingFields) {
      rejectedBecauseMissing[field] = (rejectedBecauseMissing[field] ?? 0) + 1;
    }

    rejectedPlaces.push({
      name: candidate.place.name,
      missingFields,
      hadSourceMatch: candidate.hadSourceMatch,
      sourceMatchMethod: candidate.sourceMatchMethod,
    });
  }

  return {
    rawParsedPlaces: args.rawParsedPlaces,
    groundingSources: args.groundingSources,
    normalizedPlacesBeforeStrictFilter: args.candidates.length,
    completePlacesAfterStrictFilter: args.finalPlaces.length,
    rejectedBecauseMissing,
    rejectedPlaces,
  };
}

function logAskAiMapsFilterDiagnostics(
  diagnostics: AskAiMapsFilterDiagnostics,
  logger?: AskAiMapsLogger
) {
  if (!isAskAiMapsRawDebugEnabled() && !isAskAiMapsFilterDebugEnabled()) {
    return;
  }

  const serializedDiagnostics = JSON.stringify(diagnostics, null, 2);
  logger?.log(`[Ask AI Maps] Filter diagnostics:\n${serializedDiagnostics}`);
  console.log("[Ask AI Maps] Filter diagnostics");
  console.dir(diagnostics, { depth: null });
}

function rankAndFilterGroundedPlaces(
  candidates: EnrichedGroundedPlaceCandidate[],
  rawParsedPlacesCount: number,
  groundingSourcesCount: number,
  query: string
) {
  const dedupedCandidates: EnrichedGroundedPlaceCandidate[] = [];
  const keyToIndex = new Map<string, number>();

  for (const candidate of candidates) {
    const identityKeys = buildDuplicateIdentityKeys(candidate.place);
    const matchingIndices = new Set<number>();

    for (const key of identityKeys) {
      const existingIndex = keyToIndex.get(key);
      if (typeof existingIndex === "number") {
        matchingIndices.add(existingIndex);
      }
    }

    if (matchingIndices.size === 0) {
      const nextIndex = dedupedCandidates.length;
      dedupedCandidates.push(candidate);
      for (const key of identityKeys) {
        keyToIndex.set(key, nextIndex);
      }
      continue;
    }

    const [firstMatchIndex] = Array.from(matchingIndices.values());
    const existing = dedupedCandidates[firstMatchIndex];
    const keepCandidate =
      getPlaceRichnessScore(candidate.place) > getPlaceRichnessScore(existing.place)
        ? candidate
        : existing;
    const mergeFrom = keepCandidate === candidate ? existing : candidate;
    const merged = mergeDuplicatePlaces(keepCandidate, mergeFrom);
    dedupedCandidates[firstMatchIndex] = merged;

    for (const key of buildDuplicateIdentityKeys(merged.place)) {
      keyToIndex.set(key, firstMatchIndex);
    }
  }

  const finalPlaces = dedupedCandidates
    .filter((candidate) => hasRequiredCompletePlaceDetails(candidate.place))
    .sort((left, right) => compareGroundedPlaceCandidates(left, right, query))
    .map((candidate) => cleanupFinalPlaceReason(candidate.place, query))
    .slice(0, ASK_AI_MAPS_MAX_PLACES);

  const diagnostics = buildAskAiMapsFilterDiagnostics({
    rawParsedPlaces: rawParsedPlacesCount,
    groundingSources: groundingSourcesCount,
    candidates: dedupedCandidates,
    finalPlaces,
  });

  return {
    finalPlaces,
    diagnostics,
  };
}

function normalizeGroundedPlaces(
  parsed: ParsedModelResponse | null,
  sources: GroundingSource[],
  query: string
): {
  places: AskAiMapGroundedPlace[];
  diagnostics: AskAiMapsFilterDiagnostics;
} {
  const normalizedPlaces: EnrichedGroundedPlaceCandidate[] = [];
  const rawPlaces = Array.isArray(parsed?.places) ? parsed.places : [];

  for (const [index, rawPlace] of rawPlaces.entries()) {
    if (!rawPlace || typeof rawPlace !== "object") {
      continue;
    }

    const candidate = rawPlace as ParsedGroundedPlace;
    const name = normalizeText(candidate.name);
    const parsedPlaceId = normalizeText(candidate.placeId);
    const parsedGoogleMapsUrl = normalizeSourceUri(
      candidate.googleMapsUri ?? candidate.googleMapsUrl
    );
    const parsedSourceUri = normalizeSourceUri(candidate.sourceUri);
    const parsedAddressText = normalizeOptionalDisplayText(
      candidate.addressText ?? candidate.address
    );

    if (!name) {
      continue;
    }

    const sourceMatch = findMatchingGroundingSource({
      parsedName: name,
      parsedAddress: parsedAddressText,
      parsedSourceUri: parsedSourceUri ?? parsedGoogleMapsUrl ?? null,
      parsedPlaceId,
      sources,
    });
    const source = sourceMatch.source;
    const mergedMetadata = mergeGroundingMetadata({
      parsedCategoryText: normalizeCategoryText(
        candidate.categoryText ?? candidate.category
      ),
      parsedRatingText: normalizeRatingText(candidate.ratingText),
      parsedReviewCountText: normalizeReviewCountText(
        candidate.reviewCountText ?? candidate.reviewCount
      ),
      parsedOpenStatusText: normalizeOpenStatusText(
        candidate.openStatusText ?? candidate.openStatus
      ),
      parsedHoursText: normalizeHoursText(candidate.hoursText ?? candidate.hours),
      parsedAddressText,
      parsedCoordinates: extractCoordinatesFromParsedPlace(candidate),
      parsedGoogleMapsUrl,
      parsedSourceUri,
      parsedPlaceId,
      source,
    });
    const genericOrMissingReason = isWeakGroundedReason(
      normalizeOptionalDisplayText(candidate.reason) ?? undefined
    );
    const reason =
      !genericOrMissingReason && normalizeOptionalDisplayText(candidate.reason)
        ? normalizeOptionalDisplayText(candidate.reason)!
        : buildGroundedPlaceReason({
            query,
            name,
            source,
            categoryText: mergedMetadata.categoryText,
            ratingText: mergedMetadata.ratingText,
            reviewCountText: mergedMetadata.reviewCountText,
            openStatusText: mergedMetadata.openStatusText,
            hoursText: mergedMetadata.hoursText,
            addressText: mergedMetadata.addressText,
          });
    const place: AskAiMapGroundedPlace = {
      id: toPlaceId(
        mergedMetadata.placeId ??
          mergedMetadata.googleMapsUrl ??
          mergedMetadata.sourceUri ??
          name,
        index
      ),
      name,
      reason,
      ...(mergedMetadata.googleMapsUrl
        ? {
            googleMapsUrl: mergedMetadata.googleMapsUrl,
            googleMapsUri: mergedMetadata.googleMapsUrl,
          }
        : {}),
      ...(mergedMetadata.placeId ? { placeId: mergedMetadata.placeId } : {}),
      ...(source?.title ? { sourceTitle: source.title } : {}),
      ...(mergedMetadata.sourceUri ? { sourceUri: mergedMetadata.sourceUri } : {}),
      ...(mergedMetadata.coordinates ? { coordinates: mergedMetadata.coordinates } : {}),
      ...(buildOptionalDetails({
        categoryText: mergedMetadata.categoryText,
        ratingText: mergedMetadata.ratingText,
        reviewCountText: mergedMetadata.reviewCountText,
        openStatusText: mergedMetadata.openStatusText,
        hoursText: mergedMetadata.hoursText,
        addressText: mergedMetadata.addressText,
      })
        ? {
            optionalDetails: buildOptionalDetails({
              categoryText: mergedMetadata.categoryText,
              ratingText: mergedMetadata.ratingText,
              reviewCountText: mergedMetadata.reviewCountText,
              openStatusText: mergedMetadata.openStatusText,
              hoursText: mergedMetadata.hoursText,
              addressText: mergedMetadata.addressText,
            }),
          }
        : {}),
    };

    normalizedPlaces.push({
      place,
      hadSourceMatch: Boolean(source),
      sourceMatchMethod: source ? sourceMatch.method : "none",
    });
  }

  for (const [index, source] of sources.entries()) {
    const name = normalizeText(source.title);

    if (!name) {
      continue;
    }

    const sourceUri = source.uri;
    const googleMapsUrl = source.uri;
    const placeId = source.placeId ?? extractPlaceIdFromGoogleMapsUrl(sourceUri);
    const place: AskAiMapGroundedPlace = {
      id: toPlaceId(
        placeId ?? sourceUri ?? source.title,
        rawPlaces.length + index
      ),
      name,
      reason: buildGroundedPlaceReason({ query, name, source }),
      ...(googleMapsUrl ? { googleMapsUrl } : {}),
      ...(googleMapsUrl ? { googleMapsUri: googleMapsUrl } : {}),
      ...(placeId ? { placeId } : {}),
      ...(source.title ? { sourceTitle: source.title } : {}),
      ...(sourceUri ? { sourceUri } : {}),
      ...(source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(sourceUri)
        ? {
            coordinates: source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(sourceUri)!,
          }
        : {}),
      ...(buildOptionalDetails({
        categoryText: source.categoryText,
        ratingText: source.ratingText,
        reviewCountText: source.reviewCountText,
        openStatusText: source.openStatusText,
        hoursText: source.hoursText,
        addressText: source.addressText,
      })
        ? {
            optionalDetails: buildOptionalDetails({
              categoryText: source.categoryText,
              ratingText: source.ratingText,
              reviewCountText: source.reviewCountText,
              openStatusText: source.openStatusText,
              hoursText: source.hoursText,
              addressText: source.addressText,
            }),
          }
        : {}),
    };

    normalizedPlaces.push({
      place,
      hadSourceMatch: true,
      sourceMatchMethod: sourceUri ? "sourceUri" : placeId ? "placeId" : "name",
    });
  }

  const rankedResult = rankAndFilterGroundedPlaces(
    normalizedPlaces,
    rawPlaces.length,
    sources.length,
    query
  );

  return {
    places: rankedResult.finalPlaces,
    diagnostics: rankedResult.diagnostics,
  };
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
  logAskAiMapsDiagnostics(logger, "before_provider_call", {
    model,
    query: params.query,
    timeoutMs: ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
  });

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

  console.log("ASK AI MAP MODEL:", model);
  console.log(JSON.stringify((response as any)?.candidates?.[0] ?? null, null, 2));

  logger?.log(`[Ask AI Maps] Model succeeded: ${model}`);
  logAskAiMapsDiagnostics(logger, "after_provider_response", {
    model,
    hasCandidates: Boolean((response as any)?.candidates?.length),
  });

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
  const mergedSources = mergeGroundingSourceLists(metadataSources, looseSources);
  const sources = filterSourcesForQuery(params.query, mergedSources);
  logAskAiMapsDiagnostics(logger, "after_extracting_grounding_sources", {
    model,
    metadataSources: metadataSources.length,
    looseSources: looseSources.length,
    mergedSources: mergedSources.length,
    finalSources: sources.length,
  });

  let parsed: ParsedModelResponse | null;

  try {
    parsed = parseModelResponse(rawText);
  } catch (error) {
    throw new AskAiMapsServiceError(
      "Ask AI Maps could not parse the provider response.",
      500,
      {
        code: "ASK_AI_MAPS_PARSE_ERROR",
        providerStatus: getProviderStatus(error),
        model,
        stage: "parse_model_json",
        details: {
          rawTextLength: rawText.length,
          looksStructuredJson: looksLikeStructuredJsonReply(rawText),
        },
        cause: error,
      }
    );
  }

  const parsedPlaces = Array.isArray(parsed?.places) ? parsed.places : [];
  logAskAiMapsDiagnostics(logger, "after_parsing_model_json", {
    model,
    parsedPlaces: parsedPlaces.length,
    hasParsedAnswerText: Boolean(normalizeOptionalDisplayText(parsed?.answerText)),
    looksStructuredJson: looksLikeStructuredJsonReply(rawText),
  });

  let normalizedResult: {
    places: AskAiMapGroundedPlace[];
    diagnostics: AskAiMapsFilterDiagnostics;
  };

  try {
    normalizedResult = normalizeGroundedPlaces(parsed, sources, params.query);
  } catch (error) {
    throw new AskAiMapsServiceError(
      "Ask AI Maps could not normalize the provider response.",
      500,
      {
        code: "ASK_AI_MAPS_NORMALIZATION_ERROR",
        providerStatus: getProviderStatus(error),
        model,
        stage: "normalization",
        details: {
          parsedPlaces: parsedPlaces.length,
          sources: sources.length,
        },
        cause: error,
      }
    );
  }

  const places = await hydrateGroundedPlacesWithCoordinates(
    normalizedResult.places,
    logger
  );
  logAskAiMapsDiagnostics(logger, "after_normalization", {
    model,
    normalizedPlacesBeforeStrictFilter:
      normalizedResult.diagnostics.normalizedPlacesBeforeStrictFilter,
    finalPlaces: places.length,
  });

  const answerText = buildAnswerText(parsed, places, rawText);
  logAskAiMapsFilterDiagnostics(normalizedResult.diagnostics, logger);
  logAskAiMapsDiagnostics(logger, "after_strict_filtering", {
    model,
    rawParsedPlaces: normalizedResult.diagnostics.rawParsedPlaces,
    groundingSources: normalizedResult.diagnostics.groundingSources,
    normalizedPlacesBeforeStrictFilter:
      normalizedResult.diagnostics.normalizedPlacesBeforeStrictFilter,
    completePlacesAfterStrictFilter:
      normalizedResult.diagnostics.completePlacesAfterStrictFilter,
    rejectedBecauseMissing: normalizedResult.diagnostics.rejectedBecauseMissing,
  });

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

  const responsePlaces = places.map(serializePlaceForResponse);

  return {
    mode: "map_grounding_only",
    answerText,
    places: responsePlaces,
    sources: mapSourcesForResponse(sources),
    ...(responsePlaces.length === 0
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
    throw new AskAiMapsServiceError(ambiguousQueryMessage, 400, {
      code: "ASK_AI_MAPS_BAD_REQUEST",
      stage: "validate_query",
    });
  }

  const apiKey = await getGoogleApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildMapsGroundingPrompt(params);
  const modelUsed = ASK_AI_MAPS_EXPERIMENT_MODEL;

  logger?.log(`[Ask AI Maps] Experiment model locked: ${modelUsed}`);

  try {
    const result = await generateMapsResponse({
      ai,
      model: modelUsed,
      prompt,
      params,
      logger,
    });

    logAskAiMapsDiagnostics(logger, "attempted_models", {
      modelUsed,
      attemptedModels: [{ model: modelUsed, status: result.places.length === 0 ? "no_grounded_places" : "success" }],
    });

    return {
      ...result,
      modelUsed,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const serviceError = toAskAiMapsServiceError(error, {
      status: getErrorStatus(error),
      code: "ASK_AI_MAPS_PROVIDER_ERROR",
      message: "Gemini Maps request failed.",
      stage: "provider_call",
      model: modelUsed,
    });

    logAskAiMapsDiagnostics(logger, "provider_error", {
      model: modelUsed,
      status: serviceError.status,
      providerStatus: serviceError.providerStatus,
      code: serviceError.code,
      stage: serviceError.stage,
      message: serviceError.message,
    });

    throw new AskAiMapsServiceError(
      serviceError.code === "ASK_AI_MAPS_PARSE_ERROR" ||
      serviceError.code === "ASK_AI_MAPS_NORMALIZATION_ERROR"
        ? "Ask AI Maps could not process places right now. Please try again."
        : serviceError.status === 429
          ? PROVIDER_BUSY_MESSAGE
          : "Ask AI Maps could not load places right now.",
      serviceError.status,
      {
        code:
          serviceError.status === 429
            ? "ASK_AI_MAPS_RATE_LIMIT"
            : serviceError.code === "ASK_AI_MAPS_ERROR"
              ? "ASK_AI_MAPS_PROVIDER_ERROR"
              : serviceError.code,
        providerStatus: serviceError.providerStatus ?? getProviderStatus(error),
        model: modelUsed,
        stage: serviceError.stage ?? "provider_call",
        details: {
          ...(serviceError.details ?? {}),
          modelUsed,
        },
        cause: error,
      }
    );
  }
}
