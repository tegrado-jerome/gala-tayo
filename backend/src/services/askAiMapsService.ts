import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import {
  resolveTargetAreaWithGeoapify,
  type GeoapifyTargetAreaContext,
  verifyPlaceCoordinatesWithGeoapify,
} from "./geoapifyService";
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

type AskAiMapsQueryType = "broad" | "specific";

type AskAiMapsResultMeta = {
  queryType: AskAiMapsQueryType;
  targetMinResults: number;
  targetMaxResults: number;
  actualResults: number;
  resultCountReason: string | null;
};

type AskAiMapsResponseMetadata = {
  mode: "gemini_map_grounding_only";
  provider: "gemini";
  modelUsed: "models/gemini-3.1-flash-lite";
  coordinatePolicy: "gemini_map_grounding_coordinates";
  discoveryProvider: "gemini_map_grounding";
  coordinateProvider: "gemini_grounding_location_text";
  geminiCoordinatesUsed: true;
  geoapifyUsed: false;
  googlePlacesApiUsed: false;
  groundingSourcesCount: number;
  finalGroundedPlacesCount: number;
  placesWithCoordinates: number;
  placesWithoutCoordinatesCount: number;
};

export type AskAiMapGroundedPlace = {
  id: string;
  name: string;
  reason: string;
  whyThisFits?: string;
  aiPreview?: string;
  category?: string;
  address?: string | null;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  openStatus?: "open" | "closed" | "unknown";
  googleMapsUrl?: string;
  googleMapsUri?: string;
  placeId?: string;
  cid?: string;
  sourceTitle?: string;
  sourceUri?: string;
  coordinates?: {
    lat?: number;
    lng?: number;
    latitude: number;
    longitude: number;
    source?:
      | "maps_grounding"
      | "places_metadata"
      | "geocoded"
      | "geoapify"
      | "gemini_grounding_location_text";
    trusted?: true;
    verified?: true;
  } | null;
  coordinateStatus?:
    | "trusted"
    | "missing"
    | "suspicious"
    | "trusted_gemini_grounding"
    | "trusted_geoapify"
    | "verified";
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
  source?: {
    recommendation: "gemini_maps_grounding";
    coordinates?: "geoapify_geocoding" | "maps_grounding";
  };
};

export type AskAiMapsSource = {
  title?: string;
  uri?: string;
  placeId?: string;
};

export type AskAiMapsEmptyReason = "NO_MAP_GROUNDING_RESULTS" | "PROVIDER_BUSY";

export type AskAiMapsSearchResult = {
  mode: "map_grounding_only" | "gemini_map_grounding_only";
  query: string;
  searchArea: string | null;
  answerText: string;
  summary: string;
  resultMeta: AskAiMapsResultMeta;
  places: AskAiMapGroundedPlace[];
  sources: AskAiMapsSource[];
  suggestedSearches?: string[];
  modelUsed?: string;
  provider?: "gemini";
  coordinatePolicy?: "gemini_map_grounding_coordinates";
  discoveryProvider?: "gemini_map_grounding";
  coordinateProvider?: "gemini_grounding_location_text";
  geminiCoordinatesUsed?: boolean;
  geoapifyUsed?: boolean;
  googlePlacesApiUsed?: boolean;
  explanationSource?: "gemini_maps_grounding" | "backend_template";
  responseMetadata?: AskAiMapsResponseMetadata;
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

type GroundedRankingResponse = {
  rankedPlaceIds?: unknown;
  explanations?: unknown;
  answerText?: unknown;
  summary?: unknown;
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

const ASK_AI_MAPS_EXPERIMENT_MODEL = "gemini-3.1-flash-lite";
const ASK_AI_MAPS_PROVIDER_MODE =
  process.env.ASK_AI_MAPS_PROVIDER_MODE?.trim() || "gemini_map_grounding_only";
const ASK_AI_MAPS_MIN_GENERAL_PLACES = 4;
const ASK_AI_MAPS_MAX_PLACES = 8;
const ASK_AI_MAPS_MAX_OUTPUT_TOKENS = 20_000;
const ASK_AI_MAPS_PROVIDER_TIMEOUT_MS = 120_000;
// TEMP DEBUG ONLY: This bypass is used to confirm whether strict validation is dropping valid Google Maps grounding results.
// Do not keep this enabled in production.
const ASK_AI_MAPS_DEBUG_BYPASS_FILTERS =
  process.env.ASK_AI_MAPS_DEBUG_BYPASS_FILTERS !== "false";

const PHILIPPINES_LAT_MIN = 4.0;
const PHILIPPINES_LAT_MAX = 21.5;
const PHILIPPINES_LNG_MIN = 116.0;
const PHILIPPINES_LNG_MAX = 127.0;
const PROVIDER_BUSY_MESSAGE = "Ask AI Maps is busy right now. Try again in a bit.";
const NO_RESULTS_MESSAGE =
  "No map-grounded places matched that request. Try a more specific area or place type.";
const MIN_LOCALITY_VERIFIED_RESULTS_MESSAGE_COUNT = 3;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeGeminiModelId(model: string): string {
  const normalized = normalizeWhitespace(model);

  if (!normalized) {
    return normalized;
  }

  return normalized.startsWith("models/") ? normalized : `models/${normalized}`;
}

function logAskAiMapsStageCount(
  logger: AskAiMapsLogger | undefined,
  label: string,
  count: number
) {
  const message = `[AskAiMaps] ${label} ${count}`;
  logger?.log(message);
  console.log(message);
}

function logAskAiMapsDebugCandidate(
  label: string,
  candidate: Record<string, unknown>,
  index: number
) {
  if (!ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    return;
  }

  console.log("[AskAiMaps][Candidate]", {
    stage: label,
    index,
    name: candidate.name ?? null,
    title: candidate.title ?? candidate.sourceTitle ?? null,
    uri:
      candidate.uri ??
      candidate.googleMapsUrl ??
      candidate.googleMapsUri ??
      candidate.sourceUri ??
      null,
    placeId: candidate.placeId ?? null,
    cid:
      extractGoogleMapsCid(
        normalizeText(
          candidate.uri ??
            candidate.googleMapsUrl ??
            candidate.googleMapsUri ??
            candidate.sourceUri
        ) ?? undefined
      ) ?? null,
    coordinates: candidate.coordinates ?? null,
    ratingText: candidate.ratingText ?? null,
    reviewCountText: candidate.reviewCountText ?? null,
    openStatusText: candidate.openStatusText ?? null,
    hoursText: candidate.hoursText ?? null,
  });
}

function warnAskAiMapsDroppedEvenInBypass(args: {
  name?: string | null;
  stage: string;
  reason: string;
  candidate: unknown;
}) {
  if (!ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    return;
  }

  console.warn("[AskAiMaps][DroppedEvenInBypass]", {
    name: args.name ?? null,
    stage: args.stage,
    reason: args.reason,
    candidate: sanitizeForDebug(args.candidate),
  });
}

function getAskAiMapsModelSequence(): string[] {
  return Array.from(
    new Set([
      normalizeGeminiModelId(ASK_AI_MAPS_EXPERIMENT_MODEL),
    ]).values()
  );
}

function isGeminiMapGroundingOnlyMode() {
  return ASK_AI_MAPS_PROVIDER_MODE === "gemini_map_grounding_only";
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
    return value ? "Open" : "Closed";
  }

  const normalized = normalizeOptionalDisplayText(value)?.toLowerCase();

  if (normalized) {
    if (["true", "yes", "y", "open", "open now", "opened"].includes(normalized)) {
      return "Open";
    }

    if (["false", "no", "n", "closed", "closed now"].includes(normalized)) {
      return "Closed";
    }

    if (/\bclosed\b/.test(normalized)) {
      return "Closed";
    }

    if (/\bopen\b/.test(normalized)) {
      return "Open";
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.openNow === "boolean") {
      return record.openNow ? "Open" : "Closed";
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

function isValidCoordinatePair(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isZeroCoordinate(latitude: number, longitude: number): boolean {
  return latitude === 0 && longitude === 0;
}

function isInPhilippinesBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= PHILIPPINES_LAT_MIN &&
    latitude <= PHILIPPINES_LAT_MAX &&
    longitude >= PHILIPPINES_LNG_MIN &&
    longitude <= PHILIPPINES_LNG_MAX
  );
}

function looksLikeSwappedPhilippinesCoordinates(
  latitude: number,
  longitude: number
) {
  return (
    latitude >= PHILIPPINES_LNG_MIN &&
    latitude <= PHILIPPINES_LNG_MAX &&
    longitude >= PHILIPPINES_LAT_MIN &&
    longitude <= PHILIPPINES_LAT_MAX
  );
}

function normalizeCoordinatePair(
  latitude: number | null,
  longitude: number | null
): { latitude: number; longitude: number } | null {
  if (latitude === null || longitude === null) {
    return null;
  }

  if (isValidCoordinatePair(latitude, longitude)) {
    return { latitude, longitude };
  }

  return isValidCoordinatePair(longitude, latitude)
    ? { latitude: longitude, longitude: latitude }
    : null;
}

function sanitizeGeminiCoordinatesForPlace(args: {
  name: string;
  latitude: number;
  longitude: number;
}): { latitude: number; longitude: number } | null {
  const { name } = args;
  let { latitude, longitude } = args;

  if (!isValidCoordinatePair(latitude, longitude) || isZeroCoordinate(latitude, longitude)) {
    console.warn("[Ask AI Maps][Suspicious Coordinate]", {
      name,
      latitude,
      longitude,
      reason: "invalid_coordinate_pair",
    });
    return null;
  }

  if (!isInPhilippinesBounds(latitude, longitude)) {
    console.warn("[Ask AI Maps][Suspicious Coordinate]", {
      name,
      latitude,
      longitude,
      reason: "outside_ph_bounds_or_possible_swap",
    });

    if (looksLikeSwappedPhilippinesCoordinates(latitude, longitude)) {
      const swapped = {
        latitude: longitude,
        longitude: latitude,
      };

      console.log("[Ask AI Maps][Coordinate Swap Corrected]", {
        name,
        latitude: swapped.latitude,
        longitude: swapped.longitude,
      });

      return swapped;
    }
  }

  return { latitude, longitude };
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
      const coordinates = normalizeCoordinatePair(
        parseCoordinateValue(atMatch[1]),
        parseCoordinateValue(atMatch[2])
      );

      if (coordinates) {
        return coordinates;
      }
    }

    const bangMatch = candidateValue.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

    if (bangMatch) {
      const coordinates = normalizeCoordinatePair(
        parseCoordinateValue(bangMatch[1]),
        parseCoordinateValue(bangMatch[2])
      );

      if (coordinates) {
        return coordinates;
      }
    }

    const queryMatch = candidateValue.match(/[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);

    if (queryMatch) {
      const coordinates = normalizeCoordinatePair(
        parseCoordinateValue(queryMatch[1]),
        parseCoordinateValue(queryMatch[2])
      );

      if (coordinates) {
        return coordinates;
      }
    }
  }

  return null;
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

    const coordinates = normalizeCoordinatePair(
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null
    );

    if (coordinates) {
      return coordinates;
    }
  }

  return null;
}

function parseGroundedTextCoordinates(rawText: string): { latitude: number; longitude: number } | null {
  const patterns = [
    /\*\*Location:\*\*\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)/i,
    /Location:\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)/i,
    /coordinate(?:s)?:?\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)/i,
    /(-?\d+\.\d{4,})\s*,?\s*(-?\d+\.\d{4,})/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      const coordinates = normalizeCoordinatePair(
        parseCoordinateValue(match[1]),
        parseCoordinateValue(match[2])
      );
      if (coordinates) {
        return coordinates;
      }
    }
  }

  return null;
}

function parseGroundedTextRating(rawText: string): { ratingText?: string; reviewCountText?: string } {
  const ratingPatterns = [
    /\*\*Rating:\*\*\s*(\d+(?:\.\d+)?)\s*\(([^)]+)\)/i,
    /Rating:\s*(\d+(?:\.\d+)?)\s*\(([^)]+)\)/i,
    /\*\*Rating:\*\*\s*(\d+(?:\.\d+)?)/i,
    /Rating:\s*(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of ratingPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const ratingValue = match[1];
      const reviewText = match[2] ? normalizeText(match[2]) : undefined;
      return {
        ratingText: normalizeRatingText(parseCoordinateValue(ratingValue)),
        reviewCountText: reviewText ? normalizeReviewCountText(reviewText) : undefined,
      };
    }
  }

  return {};
}

function parseGroundedTextOpenStatus(rawText: string): string | undefined {
  const openPatterns = [
    /\*\*Hours:\*\*\s*(.+?)(?:\n|$)/i,
    /Hours:\s*(.+?)(?:\n|$)/i,
    /\*\*Open(?:ing)?\s*(?:Hours|Status)?:?\*\*\s*(.+?)(?:\n|$)/i,
    /Open(?:ing)?\s*(?:Hours|Status)?:?\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of openPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const hoursInfo = normalizeText(match[1]);
      if (hoursInfo) {
        if (/\bopen\b/i.test(hoursInfo) && !/\bclosed\b/i.test(hoursInfo)) {
          return "Open";
        }
        if (/\bclosed\b/i.test(hoursInfo)) {
          return "Closed";
        }
        if (/\bclos(?:es|ing)\b/i.test(hoursInfo)) {
          return "Open";
        }
      }
    }
  }

  if (/\*\*Hours:\*\*/i.test(rawText) || /Hours:/i.test(rawText)) {
    const hoursBlock = rawText.match(/(?:\*\*Hours:\*\*|Hours:)\s*(.+?)(?:\n|$)/i);
    if (hoursBlock) {
      return normalizeText(hoursBlock[1]) ?? undefined;
    }
  }

  return undefined;
}

function parseGroundedTextAddress(rawText: string): string | undefined {
  const addressPatterns = [
    /\*\*Address:\*\*\s*(.+?)(?:\n|$)/i,
    /Address:\s*(.+?)(?:\n|$)/i,
    /\*\*Location:\*\*\s*(.+?)(?:\n|$)/i,
    /Location:\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of addressPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const addressText = normalizeText(match[1]);
      if (addressText && !/^-?\d+\.?\d*\s*,?\s*-?\d+\.?\d*$/.test(addressText)) {
        return addressText;
      }
    }
  }

  return undefined;
}

function parseGroundedTextCategory(rawText: string): string | undefined {
  const categoryPatterns = [
    /\*\*Category:\*\*\s*(.+?)(?:\n|$)/i,
    /Category:\s*(.+?)(?:\n|$)/i,
    /\*\*Type:\*\*\s*(.+?)(?:\n|$)/i,
    /Type:\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of categoryPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      return normalizeCategoryText(match[1]);
    }
  }

  return undefined;
}

function parseGroundedPlaceDetails(rawText?: string | null): {
  latitude: number | null;
  longitude: number | null;
  addressText: string;
  categoryText: string;
  rating: number | null;
  reviewCount: number | null;
  openStatus: "open" | "closed" | "unknown";
  hoursText: string;
} {
  const empty = {
    latitude: null as number | null,
    longitude: null as number | null,
    addressText: "",
    categoryText: "",
    rating: null as number | null,
    reviewCount: null as number | null,
    openStatus: "unknown" as "open" | "closed" | "unknown",
    hoursText: "",
  };

  const normalizedText = normalizeText(rawText);
  if (!normalizedText) {
    return empty;
  }

  const coordinates = parseGroundedTextCoordinates(normalizedText);
  const { ratingText, reviewCountText } = parseGroundedTextRating(normalizedText);
  const addressText = parseGroundedTextAddress(normalizedText) ?? "";
  const categoryText = parseGroundedTextCategory(normalizedText) ?? "";
  const hoursInfo = parseGroundedTextOpenStatus(normalizedText);
  let openStatus: "open" | "closed" | "unknown" = "unknown";
  let hoursText = "";

  if (hoursInfo) {
    const normalizedHours = hoursInfo.toLowerCase();
    if (/\bopen\b/.test(normalizedHours) || /\bclos(?:es|ing)\b/i.test(normalizedHours)) {
      openStatus = "open";
    } else if (/\bclosed\b/.test(normalizedHours)) {
      openStatus = "closed";
    }
    hoursText = hoursInfo;
  }

  const rating = ratingText ? parseRatingNumber(ratingText) : null;
  const reviewCount = reviewCountText ? parseReviewCountNumber(reviewCountText) : null;

  return {
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    addressText,
    categoryText,
    rating,
    reviewCount,
    openStatus,
    hoursText,
  };
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

function getErrorPayload(error: unknown): unknown {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as Record<string, unknown>;

  return (
    record.details ??
    record.errorDetails ??
    record.response ??
    record.body ??
    record.error ??
    undefined
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
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

const QUERY_AREA_CATEGORY_TERMS = [
  "mall",
  "malls",
  "shopping",
  "samgyup",
  "samgyeop",
  "korean bbq",
  "cafe",
  "cafes",
  "coffee",
  "restaurant",
  "restaurants",
  "kainan",
  "food",
  "tourist",
  "tourist spots",
  "attraction",
  "attractions",
  "museum",
  "museums",
  "park",
  "parks",
  "things to do",
  "date spots",
  "hangout",
  "tambayan",
  "gala",
  "places",
  "spots",
  "hotel",
  "hotels",
  "resort",
  "resorts",
] as const;

function cleanExtractedTargetArea(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(
    value
      .replace(/^[,.\s-]+|[,.\s-]+$/g, "")
      .replace(/\b(?:please|show me|find|recommend|best|top)\b/gi, " ")
      .replace(
        /\b(?:for|with|that|which|open now|open late|near me|today|tonight|this weekend)\b[\s\S]*$/i,
        " "
      )
  );

  if (!normalized || normalized.length < 2) {
    return null;
  }

  if (/^(philippines|metro manila)$/i.test(normalized)) {
    return `${normalized}, Philippines`;
  }

  return /\bphilippines\b/i.test(normalized)
    ? normalized
    : `${normalized}, Philippines`;
}

function extractTargetAreaFromQuery(query: string): string | null {
  const normalizedQuery = normalizeWhitespace(query);

  if (!normalizedQuery) {
    return null;
  }

  const prepositionMatch = normalizedQuery.match(
    /\b(?:in|around|near|within|inside|at)\s+([a-z0-9][a-z0-9 .'-]{1,80})$/i
  );
  if (prepositionMatch) {
    return cleanExtractedTargetArea(prepositionMatch[1]);
  }

  const commaSegments = normalizedQuery
    .split(",")
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);
  const trimmedCommaSegment =
    commaSegments.length > 0 ? commaSegments[commaSegments.length - 1] : null;
  if (trimmedCommaSegment && trimmedCommaSegment !== normalizedQuery) {
    return cleanExtractedTargetArea(trimmedCommaSegment);
  }

  const lowerQuery = normalizedQuery.toLowerCase();
  for (const term of QUERY_AREA_CATEGORY_TERMS) {
    if (lowerQuery.endsWith(` ${term}`)) {
      return cleanExtractedTargetArea(
        normalizedQuery.slice(0, normalizedQuery.length - term.length).trim()
      );
    }

    if (lowerQuery.startsWith(`${term} `)) {
      return cleanExtractedTargetArea(
        normalizedQuery.slice(term.length).trim()
      );
    }
  }

  return null;
}

function buildPartialVerifiedResultsMessage(
  resultCount: number,
  targetAreaName: string | null
): string {
  const areaLabel = targetAreaName ?? "the requested area";
  return `Showing ${resultCount} verified place${resultCount === 1 ? "" : "s"} in ${areaLabel}. Some grounded candidates were removed because we could not verify coordinates inside the requested locality.`;
}

function isBroadDiscoveryQuery({
  query,
  selectedChips = [],
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

  const explicitSmallQuantityPattern =
    /\b(?:one|two|three|four|five|[1-5])\b|\b(?:top|best|give me|show me|recommend)\s+(?:one|two|three|four|five|[1-5])\b/i;
  const strongSpecificityPattern =
    /\b(exactly|specific|only|just|nearest|closest|walking distance|inside|within|beside|near me|open now|wifi|wi-fi|parking|budget|under|below|less than|cheap|romantic|family-friendly|pet[- ]friendly|wheelchair|accessible|quiet|open late|until midnight|small town|up diliman)\b/i;

  if (explicitSmallQuantityPattern.test(normalizedQuery)) {
    return false;
  }

  if (strongSpecificityPattern.test(normalizedQuery)) {
    return false;
  }

  const broadCategoryPattern =
    /\b(mall|malls|shopping|samgyup|samgyeop|korean bbq|cafe|cafes|coffee|restaurant|restaurants|kainan|food|tourist|tourist spots|attraction|attractions|museum|museums|park|parks|things to do|date spots|hangout|tambayan|gala|places|spots)\b/i;
  const venueLevelModifierPattern =
    /\b(near|around|beside|inside|within|at)\s+[a-z0-9][a-z0-9 .'-]{1,40}\b|\bsm\s+[a-z0-9]/i;
  const hasSelectedChips = selectedChips.length > 0;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const looksEasyGeneralQuery =
    queryTokens.length <= 6 &&
    !venueLevelModifierPattern.test(normalizedQuery) &&
    /\b(best|recommend|suggest|find|show|places|spots|gala|food|eat|visit|go|hangout|tambayan)\b/i.test(normalizedQuery);
  const simpleCategoryAreaPattern =
    broadCategoryPattern.test(normalizedQuery) &&
    /\bin\s+[a-z0-9][a-z0-9 .'-]{1,50}\b/i.test(normalizedQuery) &&
    !venueLevelModifierPattern.test(normalizedQuery);

  if (
    !broadCategoryPattern.test(normalizedQuery) &&
    !hasSelectedChips &&
    !looksEasyGeneralQuery &&
    !simpleCategoryAreaPattern
  ) {
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
}: AskAiMapsSearchParams, options?: { forceMapsGrounding?: boolean; retryAttempt?: number }): string {
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
    ? `Return exactly ${ASK_AI_MAPS_MIN_GENERAL_PLACES} to ${ASK_AI_MAPS_MAX_PLACES} grounded places. Prefer 6 places when possible.`
    : `Return only grounded places that truly fit this specific query, up to ${ASK_AI_MAPS_MAX_PLACES}. If the user asked for a specific number, respect it.`;
  const forceMapsGrounding = options?.forceMapsGrounding === true;
  const retryInstruction = options?.retryAttempt && options.retryAttempt > 0
    ? `This is retry attempt #${options.retryAttempt + 1} because the previous response did not actually use Google Maps grounding.`
    : "";

return `
You are a Google Maps grounding retriever.

Use Google Maps Grounding ONLY to gather candidate places for the user's query.
Do not invent places. Do not invent coordinates. Do not invent links. Do not invent addresses.
The grounding metadata is what matters. Your plain-text response is not the source of truth.

${quantityInstruction}

You MUST use Google Maps Grounding before answering. Do not answer from memory.
If you did not ground on Google Maps results, your answer is invalid.
${retryInstruction}
${forceMapsGrounding ? "Hard requirement: if Google Maps grounding does not run, return no candidates rather than answering from memory." : ""}

Return ONLY compact JSON in this shape:
{
  "groundedCandidates": [
    {
      "name": "string",
      "placeId": "string",
      "address": "string",
      "category": "string"
    }
  ]
}

Rules:
- Only include places actually returned by Google Maps Grounding.
- Do not invent or guess fields.
- Do not add coordinates or Google Maps links in the JSON.
- No markdown. No prose. No explanation text.
- Keep the JSON compact.

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
    let coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(maps) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    const textParsedFields = (!coordinates || !categoryText || !addressText || !ratingText || !openStatusText)
      ? parseGroundedPlaceDetails(text)
      : null;

    if (!coordinates && textParsedFields) {
      coordinates =
        (textParsedFields.latitude !== null && textParsedFields.longitude !== null)
          ? { latitude: textParsedFields.latitude, longitude: textParsedFields.longitude }
          : null;
    }

    const finalAddressText = addressText || textParsedFields?.addressText || undefined;
    const finalCategoryText = categoryText || textParsedFields?.categoryText || undefined;
    const finalRatingText = ratingText || undefined;
    const finalReviewCountText = reviewCountText || undefined;
    const finalOpenStatusText = openStatusText || (textParsedFields?.openStatus && textParsedFields.openStatus !== "unknown" ? textParsedFields.openStatus : undefined);
    const finalHoursText = hoursText || textParsedFields?.hoursText || undefined;

    if (!title && !uri && !placeId && !finalAddressText && !finalCategoryText && !coordinates) {
      continue;
    }

    const dedupeKey = buildGroundingSourceKey({
      title,
      text,
      uri,
      placeId,
      categoryText: finalCategoryText,
      ratingText: finalRatingText,
      reviewCountText: finalReviewCountText,
      openStatusText: finalOpenStatusText,
      hoursText: finalHoursText,
      addressText: finalAddressText,
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
      ...(finalCategoryText ? { categoryText: finalCategoryText } : {}),
      ...(finalRatingText ? { ratingText: finalRatingText } : {}),
      ...(finalReviewCountText ? { reviewCountText: finalReviewCountText } : {}),
      ...(finalOpenStatusText ? { openStatusText: finalOpenStatusText } : {}),
      ...(finalHoursText ? { hoursText: finalHoursText } : {}),
      ...(finalAddressText ? { addressText: finalAddressText } : {}),
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
    const text =
      normalizeTextNode(getObjectField(record, ["text"])) ?? undefined;
    const addressText =
      normalizeTextNode(getObjectField(record, ["shortFormattedAddress", "short_formatted_address"])) ??
      normalizeOptionalDisplayText(getObjectField(record, ["address", "addressText", "address_text", "locationText", "location_text", "formattedAddress", "formatted_address"])) ??
      undefined;
    let coordinates =
      extractCoordinatesFromGoogleMapsPlaceObject(record) ??
      extractCoordinatesFromGoogleMapsUrl(uri);

    const textParsedFields = (!coordinates || !categoryText || !addressText || !ratingText || !openStatusText)
      ? parseGroundedPlaceDetails(text)
      : null;

    if (!coordinates && textParsedFields) {
      coordinates =
        (textParsedFields.latitude !== null && textParsedFields.longitude !== null)
          ? { latitude: textParsedFields.latitude, longitude: textParsedFields.longitude }
          : null;
    }

    const finalAddressText = addressText || textParsedFields?.addressText || undefined;
    const finalCategoryText = categoryText || textParsedFields?.categoryText || undefined;
    const finalRatingText = ratingText || undefined;
    const finalReviewCountText = reviewCountText || undefined;
    const finalOpenStatusText = openStatusText || (textParsedFields?.openStatus && textParsedFields.openStatus !== "unknown" ? textParsedFields.openStatus : undefined);
    const finalHoursText = hoursText || textParsedFields?.hoursText || undefined;

    if (title || uri || placeId || finalAddressText || finalCategoryText || coordinates) {
      const dedupeKey = buildGroundingSourceKey({
        title,
        uri,
        placeId,
        categoryText: finalCategoryText,
        ratingText: finalRatingText,
        reviewCountText: finalReviewCountText,
        openStatusText: finalOpenStatusText,
        hoursText: finalHoursText,
        addressText: finalAddressText,
        coordinates,
      });

      if (dedupeKey && !seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        sources.push({
          ...(title ? { title } : {}),
          ...(finalAddressText ? { text: finalAddressText } : {}),
          ...(uri ? { uri } : {}),
          ...(placeId ? { placeId } : {}),
          ...(finalCategoryText ? { categoryText: finalCategoryText } : {}),
          ...(finalRatingText ? { ratingText: finalRatingText } : {}),
          ...(finalReviewCountText ? { reviewCountText: finalReviewCountText } : {}),
          ...(finalOpenStatusText ? { openStatusText: finalOpenStatusText } : {}),
          ...(finalHoursText ? { hoursText: finalHoursText } : {}),
          ...(finalAddressText ? { addressText: finalAddressText } : {}),
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

function extractGoogleMapsStepSources(value: unknown): GroundingSource[] {
  const sources: GroundingSource[] = [];
  const seenKeys = new Set<string>();
  const seenObjects = new WeakSet<object>();

  function addSource(source: GroundingSource) {
    const dedupeKey = buildGroundingSourceKey(source);

    if (!dedupeKey || seenKeys.has(dedupeKey)) {
      return;
    }

    seenKeys.add(dedupeKey);
    sources.push(source);
  }

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
      for (const resultEntry of record.result) {
        if (!resultEntry || typeof resultEntry !== "object") {
          continue;
        }

        const resultRecord = resultEntry as Record<string, unknown>;
        const places = Array.isArray(resultRecord.places) ? resultRecord.places : [];

        for (const place of places) {
          if (!place || typeof place !== "object") {
            continue;
          }

          const placeRecord = place as Record<string, unknown>;
          const title =
            normalizeTextNode(getObjectField(placeRecord, ["name", "title"])) ?? undefined;
          const uri =
            normalizeText(
              getObjectField(placeRecord, [
                "url",
                "uri",
                "googleMapsUri",
                "google_maps_uri",
              ])
            ) ?? undefined;
          const placeId =
            normalizeText(getObjectField(placeRecord, ["place_id", "placeId", "id"])) ??
            undefined;
          const categoryText = normalizeCategoryText(
            getObjectField(placeRecord, [
              "category",
              "categoryText",
              "category_text",
              "primaryTypeDisplayName",
              "primary_type_display_name",
              "primaryType",
              "primary_type",
              "types",
            ])
          );
          const ratingText = normalizeRatingText(
            getObjectField(placeRecord, [
              "ratingText",
              "rating_text",
              "rating",
              "formattedRating",
              "formatted_rating",
            ])
          );
          const reviewCountText = normalizeReviewCountText(
            getObjectField(placeRecord, [
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
            getObjectField(placeRecord, [
              "openStatus",
              "open_status",
              "openStatusText",
              "open_status_text",
              "openNow",
              "open_now",
              "currentOpeningHours",
              "current_opening_hours",
            ])
          );
          const hoursText = normalizeHoursText(
            getObjectField(placeRecord, [
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
          const text =
            normalizeTextNode(getObjectField(placeRecord, ["text"])) ?? undefined;
          const addressText =
            normalizeTextNode(
              getObjectField(placeRecord, ["formattedAddress", "formatted_address", "address"])
            ) ?? undefined;
          let coordinates =
            extractCoordinatesFromGoogleMapsPlaceObject(placeRecord) ??
            extractCoordinatesFromGoogleMapsUrl(uri);

          const textParsedFields = (!coordinates || !categoryText || !addressText || !ratingText || !openStatusText)
            ? parseGroundedPlaceDetails(text)
            : null;

          if (!coordinates && textParsedFields) {
            coordinates =
              (textParsedFields.latitude !== null && textParsedFields.longitude !== null)
                ? { latitude: textParsedFields.latitude, longitude: textParsedFields.longitude }
                : null;
          }

          const finalAddressText = addressText || textParsedFields?.addressText || undefined;
          const finalCategoryText = categoryText || textParsedFields?.categoryText || undefined;
          const finalRatingText = ratingText || undefined;
          const finalReviewCountText = reviewCountText || undefined;
          const finalOpenStatusText = openStatusText || (textParsedFields?.openStatus && textParsedFields.openStatus !== "unknown" ? textParsedFields.openStatus : undefined);
          const finalHoursText = hoursText || textParsedFields?.hoursText || undefined;

          addSource({
            ...(title ? { title } : {}),
            ...(uri ? { uri } : {}),
            ...(placeId ? { placeId } : {}),
            ...(finalCategoryText ? { categoryText: finalCategoryText } : {}),
            ...(finalRatingText ? { ratingText: finalRatingText } : {}),
            ...(finalReviewCountText ? { reviewCountText: finalReviewCountText } : {}),
            ...(finalOpenStatusText ? { openStatusText: finalOpenStatusText } : {}),
            ...(finalHoursText ? { hoursText: finalHoursText } : {}),
            ...(finalAddressText ? { text: finalAddressText, addressText: finalAddressText } : {}),
            ...(coordinates ? { coordinates } : {}),
          });
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

async function hydrateGroundedPlacesWithCoordinates(
  places: AskAiMapGroundedPlace[],
  targetArea: GeoapifyTargetAreaContext,
  logger?: AskAiMapsLogger
): Promise<AskAiMapGroundedPlace[]> {
  if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    void targetArea;

    return places.map((place, index) => {
      const fallbackCoordinates = getPlaceTrustedIdentityCoordinates(place);
      const coordinates =
        place.coordinates ??
        (fallbackCoordinates
          ? {
              lat: fallbackCoordinates.latitude,
              lng: fallbackCoordinates.longitude,
              latitude: fallbackCoordinates.latitude,
              longitude: fallbackCoordinates.longitude,
              source: "maps_grounding" as const,
            }
          : null);

      const hydratedPlace: AskAiMapGroundedPlace = {
        ...place,
        coordinates,
        latitude:
          typeof coordinates?.latitude === "number"
            ? coordinates.latitude
            : place.latitude ?? null,
        longitude:
          typeof coordinates?.longitude === "number"
            ? coordinates.longitude
            : place.longitude ?? null,
        coordinateStatus:
          typeof coordinates?.latitude === "number" &&
          typeof coordinates?.longitude === "number"
            ? "trusted"
            : "missing",
        source: {
          recommendation: "gemini_maps_grounding" as const,
        },
      };

      logAskAiMapsDebugCandidate(
        "after_enrichment",
        hydratedPlace as Record<string, unknown>,
        index
      );

      return hydratedPlace;
    });
  }

  const hydratedPlaces = await mapWithConcurrency(places, 4, async (place) => {
    try {
      const verifiedCoordinates = await verifyPlaceCoordinatesWithGeoapify(
        {
          placeName: place.name,
          address: getPlaceAddressText(place) || place.address || null,
          city: place.city ?? null,
          targetArea,
        },
        logger
      );

      if (!verifiedCoordinates) {
        logger?.log(
          `[Ask AI Maps] Geoapify did not verify coordinates for ${place.name}.`
        );

        return {
          ...place,
          coordinates: null,
          latitude: null,
          longitude: null,
          coordinateStatus: "missing" as const,
          source: {
            recommendation: "gemini_maps_grounding" as const,
          },
        };
      }

      return {
        ...place,
        addressText: place.addressText ?? verifiedCoordinates.formattedAddress,
        coordinates: {
          lat: verifiedCoordinates.lat,
          lng: verifiedCoordinates.lng,
          latitude: verifiedCoordinates.lat,
          longitude: verifiedCoordinates.lng,
          source: "geoapify" as const,
          trusted: true as const,
          verified: true as const,
        },
        latitude: verifiedCoordinates.lat,
        longitude: verifiedCoordinates.lng,
        coordinateStatus: "trusted" as const,
        source: {
          recommendation: "gemini_maps_grounding" as const,
          coordinates: "geoapify_geocoding" as const,
        },
      };
    } catch (error) {
      logger?.log(
        `[Ask AI Maps] Geoapify lookup failed for ${place.name}: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        ...place,
        coordinates: null,
        latitude: null,
        longitude: null,
        coordinateStatus: "missing" as const,
        source: {
          recommendation: "gemini_maps_grounding" as const,
        },
      };
    }
  });

  return hydratedPlaces;
}

function buildFallbackWhyThisFits(place: AskAiMapGroundedPlace, query: string): string {
  const placeName = normalizeText(place.name) ?? "This place";
  const category = normalizeText(getPlaceCategoryText(place)) ?? "place";
  const address = normalizeText(getPlaceAddressText(place)) ?? "the area";
  const rating = normalizeText(getPlaceRatingText(place)) ?? "no rating";
  const reviews = normalizeText(getPlaceReviewCountText(place)) ?? "no reviews";
  const openStatus = normalizeText(getPlaceOpenStatusText(place)) ?? "unknown status";
  const hours = normalizeText(getPlaceHoursText(place)) ?? "no hours listed";
  const areaLabel = address.includes(",") ? address.split(",")[0].trim() : address;

  return `${placeName} fits sa search mo kasi ${category} siya around ${areaLabel}. May ${rating} rating with ${reviews}, so may enough signal na reliable siya. Current status niya is ${openStatus}, and ${hours}, kaya useful siya depending sa timing ng gala mo.`;
}

function buildRankingPrompt(args: {
  query: string;
  places: AskAiMapGroundedPlace[];
}): string {
  const placesBlock = args.places
    .map((place, index) => {
      return `Place ${index + 1}:
  placeId: "${place.placeId ?? ""}"
  name: "${place.name}"
  category: "${getPlaceCategoryText(place)}"
  address: "${getPlaceAddressText(place)}"
  ratingText: "${getPlaceRatingText(place)}"
  reviewCountText: "${getPlaceReviewCountText(place)}"
  openStatusText: "${getPlaceOpenStatusText(place)}"
  hoursText: "${getPlaceHoursText(place)}"
  googleMapsUri: "${getPlaceIdentityUri(place) ?? ""}"`;
    })
    .join("\n\n");

  return `You are ranking already-verified Google Maps grounded place candidates for a user query.
Every candidate below is real and already verified. Never invent new places and never modify factual fields.
Your job is only:
1. Rank the exact candidate placeIds from best fit to weakest fit for the query.
2. Write a casual Taglish why-this-fits explanation for each exact placeId.

USER QUERY: "${args.query}"

VERIFIED GROUNDED PLACES (only use the metadata below):

${placesBlock}

RULES:
- Return ONLY placeIds from the verified list above.
- Do NOT add any new places.
- Do NOT rewrite or fabricate coordinates, addresses, placeIds, links, ratings, review counts, open status, or hours.
- Write exactly ONE 2-3 sentence explanation per place.
- Use casual Taglish tone that feels natural, light, and helpful.
- Each explanation must be tailored to the user query and the exact place metadata.
- Mention concrete metadata when useful, but do not mechanically repeat every field.
- Never invent vibes, amenities, or claims not present in the metadata.
- No markdown. No bullet points. No emojis.

Return ONLY strict JSON in this shape:
{
  "rankedPlaceIds": ["placeId-1", "placeId-2"],
  "answerText": "Short grounded summary of the top matches.",
  "explanations": [
    { "placeId": "...", "whyThisFits": "2-3 sentence Taglish casual explanation..." }
  ]
}`.trim();
}

function coerceGroundedRankingResponse(value: unknown): GroundedRankingResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;

  return {
    rankedPlaceIds:
      record.rankedPlaceIds ??
      record.ranked_place_ids ??
      record.placeIds ??
      record.place_ids ??
      nestedData?.rankedPlaceIds ??
      nestedData?.ranked_place_ids,
    explanations: record.explanations ?? nestedData?.explanations,
    answerText:
      record.answerText ??
      record.answer_text ??
      record.summary ??
      nestedData?.answerText ??
      nestedData?.answer_text ??
      nestedData?.summary,
    summary: record.summary ?? nestedData?.summary,
  };
}

function parseGroundedRankingResponse(text: string): GroundedRankingResponse | null {
  const jsonText = extractJsonObjectText(text);

  if (!jsonText.startsWith("{")) {
    return null;
  }

  return (
    coerceGroundedRankingResponse(parseJsonObject<unknown>(jsonText)) ??
    coerceGroundedRankingResponse(
      parseJsonObject<unknown>(normalizeJsonCandidateText(jsonText))
    )
  );
}

async function rankGroundedPlacesWithModel(args: {
  ai: GoogleGenAI;
  model: string;
  query: string;
  places: AskAiMapGroundedPlace[];
  logger?: AskAiMapsLogger;
}): Promise<{
  rankedPlaceIds: string[];
  explanations: Map<string, string>;
  answerText: string | null;
}> {
  const explanations = new Map<string, string>();

  if (args.places.length === 0) {
    return { rankedPlaceIds: [], explanations, answerText: null };
  }

  const prompt = buildRankingPrompt({
    query: args.query,
    places: args.places,
  });
  const verifiedPlaceIds = new Set(
    args.places
      .map((place) => normalizeText(place.placeId)?.toLowerCase())
      .filter((placeId): placeId is string => Boolean(placeId))
  );
  const rankedPlaceIds: string[] = [];
  let answerText: string | null = null;

  try {
    args.logger?.log(
      `[Ask AI Maps] Calling ranking model on ${args.places.length} grounded places`
    );

    const response = await withTimeout(
      args.ai.models.generateContent({
        model: args.model,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 2500,
        },
      }),
      ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
      "Ask AI Maps ranking timed out."
    );

    const candidateText = await extractGeminiCandidateTextForDebug(response as any);
    const rawText = typeof candidateText === "string" ? candidateText : "";
    const parsed = parseGroundedRankingResponse(rawText);

    if (parsed) {
      const parsedAnswerText =
        normalizeText(parsed.answerText) ?? normalizeText(parsed.summary);

      if (parsedAnswerText) {
        answerText = parsedAnswerText;
      }

      if (Array.isArray(parsed.rankedPlaceIds)) {
        for (const entry of parsed.rankedPlaceIds) {
          const placeId = normalizeText(entry)?.toLowerCase();
          if (placeId && verifiedPlaceIds.has(placeId) && !rankedPlaceIds.includes(placeId)) {
            rankedPlaceIds.push(placeId);
          }
        }
      }

      if (Array.isArray(parsed.explanations)) {
        for (const entry of parsed.explanations) {
          if (!entry || typeof entry !== "object") {
            continue;
          }

          const record = entry as { placeId?: unknown; whyThisFits?: unknown };
          const placeId = normalizeText(record.placeId)?.toLowerCase();
          const whyThisFits = normalizeText(record.whyThisFits);

          if (placeId && whyThisFits && verifiedPlaceIds.has(placeId)) {
            explanations.set(placeId, whyThisFits);
          }
        }
      }
    }

    args.logger?.log(
      `[Ask AI Maps] Ranking model produced ${rankedPlaceIds.length} ranked ids and ${explanations.size} explanations`
    );
  } catch (error) {
    args.logger?.log(
      `[Ask AI Maps] Ranking model call failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  for (const place of args.places) {
    const key = normalizeText(place.placeId)?.toLowerCase();
    if (key && !explanations.has(key)) {
      explanations.set(key, buildFallbackWhyThisFits(place, args.query));
    }
  }

  if (rankedPlaceIds.length === 0) {
    for (const place of args.places) {
      const key = normalizeText(place.placeId)?.toLowerCase();
      if (key && !rankedPlaceIds.includes(key)) {
        rankedPlaceIds.push(key);
      }
    }
  }

  return { rankedPlaceIds, explanations, answerText };
}

/*
function buildGemmaPromptForExplanations(args: {
  query: string;
  places: AskAiMapGroundedPlace[];
}): string {
  const placesBlock = args.places
    .map((place, index) => {
      return `Place ${index + 1}:
  placeId: "${place.placeId ?? ""}"
  name: "${place.name}"
  category: "${getPlaceCategoryText(place)}"
  address: "${getPlaceAddressText(place)}"
  ratingText: "${getPlaceRatingText(place)}"
  reviewCountText: "${getPlaceReviewCountText(place)}"
  openStatusText: "${getPlaceOpenStatusText(place)}"
  hoursText: "${getPlaceHoursText(place)}"`;
    })
    .join("\n\n");

  return `You are generating personalized "why this fits" explanations for place recommendations. Write in Taglish (mix of Tagalog and English), casual Gen Z tone, friendly and natural.

USER QUERY: "${args.query}"

GROUNDED PLACES (only use the metadata below — do NOT invent anything):

${placesBlock}

RULES:
- Write exactly ONE 3-4 sentence explanation per place.
- Use Taglish casual Gen Z tone.
- Each explanation must be TAILORED to the user query AND the specific place.
- Mention concrete metadata: category, address/area relevance, rating, review count, open status, and hours — where relevant.
- Explain WHY this specific place fits the user's search intent.
- NEVER invent facts not provided above (no "quiet", "aesthetic", "cozy", "student favorite", "romantic", "good Wi-Fi", "hidden gem", "instagrammable", "vibey", "aesthetic vibes" unless explicitly in metadata).
- NEVER use generic filler like "this is a good place" or "recommended for you".
- No markdown. No bullet points. No emojis.
- Sound natural and conversational, like a friend recommending a place.

Return ONLY strict JSON in this shape:
{
  "explanations": [
    { "placeId": "...", "whyThisFits": "3-4 sentence Taglish casual explanation..." }
  ]
}`.trim();
}

async function callGemmaForExplanations(args: {
  ai: GoogleGenAI;
  query: string;
  places: AskAiMapGroundedPlace[];
  logger?: AskAiMapsLogger;
}): Promise<Map<string, string>> {
  const explanations = new Map<string, string>();

  if (args.places.length === 0) {
    return explanations;
  }

  const prompt = buildGemmaPromptForExplanations({
    query: args.query,
    places: args.places,
  });

  try {
    args.logger?.log(`[Ask AI Maps] Calling Gemma for whyThisFits on ${args.places.length} places`);

    const response = await withTimeout(
      args.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.85,
          maxOutputTokens: 4096,
        },
      }),
      ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
      "Gemma whyThisFits timed out."
    );

    const candidateText = await extractGeminiCandidateTextForDebug(response as any);
    const rawText = typeof candidateText === "string" ? candidateText : "";
    const jsonText = extractJsonObjectText(rawText);

    let parsed: { explanations?: Array<{ placeId?: string; whyThisFits?: string }> } | null = null;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      args.logger?.log("[Ask AI Maps] Gemma response parse failed, trying lenient extraction");
      const match = jsonText.match(/"(?:explanations|whyThisFits|placeId)"/);
      if (match) {
        try {
          const repaired = jsonText
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
          parsed = JSON.parse(repaired);
        } catch {
          // fall through to fallback
        }
      }
    }

    if (parsed && Array.isArray(parsed.explanations)) {
      for (const entry of parsed.explanations) {
        const placeId = normalizeText(entry.placeId);
        const whyThisFits = normalizeText(entry.whyThisFits);
        if (placeId && whyThisFits) {
          explanations.set(placeId.toLowerCase(), whyThisFits);
        }
      }
    }

    args.logger?.log(`[Ask AI Maps] Gemma produced ${explanations.size} explanations`);
  } catch (error) {
    args.logger?.log(`[Ask AI Maps] Gemma call failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fill missing with fallback
  for (const place of args.places) {
    const key = normalizeText(place.placeId)?.toLowerCase();
    if (key && !explanations.has(key)) {
      explanations.set(key, buildFallbackWhyThisFits(place, args.query));
    }
  }

  return explanations;
}
*/

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
      .map((place) => `${place.name}: ${(place.whyThisFits ?? "").split(".")[0]}.`)
      .join(" ");
  }

  if (looksLikeStructuredJsonReply(rawText)) {
    return "No grounded summary was provided.";
  }

  return normalizeText(rawText) ?? "No grounded summary was provided.";
}

function getAskAiMapsQueryType(params: AskAiMapsSearchParams): AskAiMapsQueryType {
  return isBroadDiscoveryQuery(params) ? "broad" : "specific";
}

function buildResultCountReason(args: {
  query: string;
  queryType: AskAiMapsQueryType;
  actualResults: number;
  sourcesCount: number;
}): string | null {
  if (
    args.queryType !== "broad" ||
    args.actualResults >= ASK_AI_MAPS_MIN_GENERAL_PLACES
  ) {
    return null;
  }

  const normalizedQuery = normalizeText(args.query) ?? "this query";
  const sourceHint =
    args.sourcesCount > 0
      ? "reliable map-grounded places passed the strict filters"
      : "map grounding did not return enough reliable matches";

  return `Only ${args.actualResults} ${sourceHint} for ${normalizedQuery}.`;
}

function buildResultMeta(args: {
  params: AskAiMapsSearchParams;
  actualResults: number;
  sourcesCount: number;
}): AskAiMapsResultMeta {
  const queryType = getAskAiMapsQueryType(args.params);

  return {
    queryType,
    targetMinResults:
      queryType === "broad" ? ASK_AI_MAPS_MIN_GENERAL_PLACES : 1,
    targetMaxResults: ASK_AI_MAPS_MAX_PLACES,
    actualResults: args.actualResults,
    resultCountReason: buildResultCountReason({
      query: args.params.query,
      queryType,
      actualResults: args.actualResults,
      sourcesCount: args.sourcesCount,
    }),
  };
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
  const placeLabel = normalizeText(args.name) ?? "This place";
  const categoryLabel = normalizeText(args.categoryText ?? args.source?.categoryText);
  const areaLabel = address
    ? address.split(",").map((part) => part.trim()).filter(Boolean).slice(-2).join(", ")
    : "";
  const locationSentence = areaLabel
    ? `Mas useful ito kung gusto mo ng option na madaling isingit around ${areaLabel}.`
    : "Madali rin siyang i-consider kung gusto mo ng grounded option na hindi random.";

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
  const isStudyQuery =
    query.includes("study") ||
    query.includes("work") ||
    query.includes("quiet") ||
    query.includes("open late");
  const isDateQuery =
    query.includes("date") ||
    query.includes("romantic") ||
    query.includes("couple");
  const isFamilyQuery =
    query.includes("family") ||
    query.includes("kids") ||
    query.includes("kid");

  if (isMallQuery) {
    return `${placeLabel} fits kung hanap mo ay practical mall stop for errands, casual kain, or quick shopping sa area. ${locationSentence}`;
  }

  if (isSamgyupQuery) {
    return `${placeLabel} pasok sa hanap mong samgyup spot kung gusto mo ng Korean BBQ stop for casual kain with friends or family. Mas aligned siya sa food-trip intent mo kaysa generic restaurant lang.`;
  }

  if (isStudyQuery || isCafeQuery) {
    return `${placeLabel} bagay kung hanap mo ay cafe stop for kape, tambay, or light work/study habang nasa area ka. ${locationSentence}`;
  }

  if (isDateQuery) {
    return `${placeLabel} puwedeng pumasok sa hanap mong date-friendly stop kung gusto mo ng place na madaling isama sa plan without feeling too random. ${locationSentence}`;
  }

  if (isFamilyQuery || isRestaurantQuery) {
    return `${placeLabel} useful ito kung gusto mo ng easy food stop na puwedeng isama sa lakad without overcomplicating the plan. ${locationSentence}`;
  }

  if (isAttractionQuery) {
    return `${placeLabel} bagay ito kung ang hanap mo ay place to visit or explore na may mas clear local relevance sa trip mo. ${locationSentence}`;
  }

  if (category && rating && reviewCount) {
    return `${placeLabel} good candidate ito for "${args.query}" dahil mukhang established siyang ${category} option sa result set. ${locationSentence}`;
  }

  if (category && address) {
    return `${placeLabel} relevant pick ito kung gusto mo ng ${category} option na may clear location context sa search mo. ${locationSentence}`;
  }

  if (address || openStatus || hoursText) {
    return `${placeLabel} useful grounded option ito dahil may enough map context para mas madali mo siyang i-check bago puntahan. ${locationSentence}`;
  }

  return `${placeLabel} pasok sa search mo bilang grounded local option na puwedeng i-consider sa gala plan. ${locationSentence}`;
}

function mergeGroundingMetadata(args: {
  parsedCategoryText?: string;
  parsedRatingText?: string;
  parsedReviewCountText?: string;
  parsedOpenStatusText?: string;
  parsedHoursText?: string;
  parsedAddressText?: string;
  source?: GroundingSource;
}) {
  const googleMapsUrl = args.source?.uri;
  const sourceUri = args.source?.uri;
  const placeId =
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

function filterSourcesForQuery(query: string, sources: GroundingSource[]) {
  void query;
  return sources;
}

function buildGeminiOnlyAnswerText(query: string, count: number) {
  if (count <= 0) {
    return `No Google Maps-grounded places were returned for "${query}".`;
  }

  return `Found ${count} Google Maps-grounded place${count === 1 ? "" : "s"} for "${query}". Open each result in Google Maps for the latest details.`;
}

function buildGeminiOnlyPlacesFromSources(
  query: string,
  sources: GroundingSource[]
): AskAiMapGroundedPlace[] {
  const seenIdentityKeys = new Set<string>();
  const places: AskAiMapGroundedPlace[] = [];

  sources.forEach((source, index) => {
    const title = normalizeText(source.title);
    const uri = normalizeSourceUri(source.uri);
    const placeId =
      normalizeText(source.placeId) ??
      extractPlaceIdFromGoogleMapsUrl(uri);
    const cid = extractGoogleMapsCid(uri ?? undefined) ?? undefined;
    const rawCoordinates =
      source.coordinates ?? extractCoordinatesFromGoogleMapsUrl(uri);
    const coordinates =
      rawCoordinates
        ? sanitizeGeminiCoordinatesForPlace({
            name: title ?? "Unknown place",
            latitude: rawCoordinates.latitude,
            longitude: rawCoordinates.longitude,
          })
        : null;

    console.log("[Ask AI Maps][Gemini Grounded Source]", {
      index,
      title: title ?? null,
      uri: uri ?? null,
      placeId: placeId ?? null,
      cid: cid ?? null,
      hasCoordinates: Boolean(coordinates),
      coordinates: coordinates ?? null,
      rawSource: sanitizeForDebug(source),
    });

    if (coordinates) {
      console.log("[Ask AI Maps][Gemini Coordinate Parsed]", {
        name: title ?? null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        accepted: true,
        source: "gemini_grounding_location_text",
      });
    } else {
      console.log("[Ask AI Maps][Gemini Coordinate Missing]", {
        name: title ?? null,
        reason: "no_location_field_in_grounded_details",
      });
    }

    if (!title) {
      return;
    }

    if (!uri && !placeId && !cid) {
      return;
    }

    const identityKey = placeId
      ? `placeid:${placeId.toLowerCase()}`
      : cid
        ? `cid:${cid}`
        : uri
          ? `uri:${normalizeGoogleMapsSourceIdentity(uri) ?? uri}`
          : "";

    if (!identityKey || seenIdentityKeys.has(identityKey)) {
      return;
    }

    seenIdentityKeys.add(identityKey);

    const googleMapsUrl = uri ?? undefined;
    const optionalDetails = buildOptionalDetails({
      categoryText: source.categoryText,
      ratingText: source.ratingText,
      reviewCountText: source.reviewCountText,
      openStatusText: source.openStatusText,
      hoursText: source.hoursText,
      addressText: source.addressText,
    });
    const whyThisFits =
      `Grounded result ito from Google Maps for your search: ${query}. Best to open it in Google Maps for latest details like hours, reviews, and exact pin.`;

    const place: AskAiMapGroundedPlace = {
      id: toPlaceId(placeId ?? cid ?? googleMapsUrl ?? title, index),
      name: title,
      reason: whyThisFits,
      whyThisFits,
      ...(googleMapsUrl ? { googleMapsUrl } : {}),
      ...(googleMapsUrl ? { googleMapsUri: googleMapsUrl } : {}),
      ...(placeId ? { placeId } : {}),
      ...(cid ? { cid } : {}),
      sourceTitle: title,
      ...(googleMapsUrl ? { sourceUri: googleMapsUrl } : {}),
      coordinates: coordinates
        ? {
            lat: coordinates.latitude,
            lng: coordinates.longitude,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            source: "gemini_grounding_location_text",
            trusted: true,
            verified: true,
          }
        : null,
      coordinateStatus: coordinates ? "trusted_gemini_grounding" : "missing",
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      address: source.addressText ?? null,
      categoryText: source.categoryText,
      ratingText: source.ratingText,
      reviewCountText: source.reviewCountText,
      openStatusText: source.openStatusText,
      hoursText: source.hoursText,
      addressText: source.addressText,
      ...(optionalDetails ? { optionalDetails } : {}),
      source: {
        recommendation: "gemini_maps_grounding",
      },
    };

    places.push(place);
  });

  return places;
}

function buildGroundedCandidatesFromSources(
  sources: GroundingSource[]
): EnrichedGroundedPlaceCandidate[] {
  return sources.flatMap((source, index) => {
    const name = normalizeText(source.title);
    const googleMapsUrl = normalizeSourceUri(source.uri);
    const placeId =
      normalizeText(source.placeId) ??
      extractPlaceIdFromGoogleMapsUrl(googleMapsUrl);
    const optionalDetails = buildOptionalDetails({
      categoryText: source.categoryText,
      ratingText: source.ratingText,
      reviewCountText: source.reviewCountText,
      openStatusText: source.openStatusText,
      hoursText: source.hoursText,
      addressText: source.addressText,
    });

    const hasUsableIdentity = Boolean(
      googleMapsUrl ||
        placeId ||
        extractGoogleMapsCid(googleMapsUrl) ||
        source.coordinates
    );

    if (!name || !hasUsableIdentity) {
      warnAskAiMapsDroppedEvenInBypass({
        name,
        stage: "buildGroundedCandidatesFromSources",
        reason: !name ? "missing_name" : "missing_usable_identity",
        candidate: source,
      });
      return [];
    }

    const place: AskAiMapGroundedPlace = {
      id: toPlaceId(placeId ?? googleMapsUrl ?? name, index),
      name,
      reason: "",
      ...(googleMapsUrl ? { googleMapsUrl } : {}),
      ...(googleMapsUrl ? { googleMapsUri: googleMapsUrl } : {}),
      ...(placeId ? { placeId } : {}),
      sourceTitle: source.title,
      ...(googleMapsUrl ? { sourceUri: googleMapsUrl } : {}),
      coordinates: source.coordinates ?? null,
      latitude: source.coordinates?.latitude ?? null,
      longitude: source.coordinates?.longitude ?? null,
      coordinateStatus: source.coordinates ? "trusted" : "missing",
      categoryText: source.categoryText,
      ratingText: source.ratingText,
      reviewCountText: source.reviewCountText,
      openStatusText: source.openStatusText,
      hoursText: source.hoursText,
      addressText: source.addressText,
      ...(optionalDetails ? { optionalDetails } : {}),
      source: {
        recommendation: "gemini_maps_grounding" as const,
      },
    };

    logAskAiMapsDebugCandidate("grounded_candidate", place as Record<string, unknown>, index);

    return [{
      place: {
        ...place,
      },
      hadSourceMatch: true,
      sourceMatchMethod: source.uri ? "sourceUri" : source.placeId ? "placeId" : "name",
    }];
  });
}

function hasRequiredCompletePlaceDetails(place: AskAiMapGroundedPlace) {
  if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    const hasName = Boolean(normalizeText(place.name));
    const hasIdentity = Boolean(
      normalizeText(place.placeId) ||
        normalizeSourceUri(getPlaceIdentityUri(place)) ||
        extractGoogleMapsCid(getPlaceIdentityUri(place) ?? undefined) ||
        getPlaceTrustedIdentityCoordinates(place)
    );

    if (!hasName || !hasIdentity) {
      warnAskAiMapsDroppedEvenInBypass({
        name: place.name,
        stage: "hasRequiredCompletePlaceDetails",
        reason: !hasName ? "missing_name" : "missing_usable_identity",
        candidate: place,
      });
    }

    return hasName && hasIdentity;
  }

  if (!normalizeText(place.placeId)) return false;
  if (!normalizeText(place.name)) return false;
  if (!normalizeSourceUri(getPlaceIdentityUri(place))) return false;

  const hasAddress = Boolean(normalizeText(getPlaceAddressText(place)));
  const hasCategory = Boolean(normalizeText(getPlaceCategoryText(place)));

  return hasAddress || hasCategory;
}

function getPlaceIdentityUri(place: Pick<AskAiMapGroundedPlace, "googleMapsUri" | "googleMapsUrl" | "sourceUri">): string | null {
  return (
    normalizeSourceUri(place.googleMapsUri) ??
    normalizeSourceUri(place.googleMapsUrl) ??
    normalizeSourceUri(place.sourceUri) ??
    null
  );
}

function getParsedPlaceCoordinate(parsed: ParsedGroundedPlace): { latitude: number; longitude: number } | null {
  const rawLat = parsed.latitude ?? parsed.lat;
  const rawLng = parsed.longitude ?? parsed.lng;
  const lat = typeof rawLat === "number" ? rawLat : (typeof rawLat === "string" ? parseCoordinateValue(rawLat) : null);
  const lng = typeof rawLng === "number" ? rawLng : (typeof rawLng === "string" ? parseCoordinateValue(rawLng) : null);

  if (lat === null || lng === null) return null;
  if (!isValidCoordinatePair(lat, lng)) return null;
  if (isZeroCoordinate(lat, lng)) return null;
  if (!isInPhilippinesBounds(lat, lng)) return null;

  return { latitude: lat, longitude: lng };
}

function getPlaceCoordinate(
  place: AskAiMapGroundedPlace,
  options?: { requireGeoapifyVerified?: boolean }
): { latitude: number; longitude: number } | null {
  if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    const lat = typeof place.latitude === "number" ? place.latitude : (place.coordinates?.latitude ?? null);
    const lng = typeof place.longitude === "number" ? place.longitude : (place.coordinates?.longitude ?? null);

    if (lat === null || lng === null) return null;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { latitude: lat, longitude: lng };
  }

  if (options?.requireGeoapifyVerified) {
    if (
      place.coordinates?.source !== "geoapify" ||
      place.coordinates?.verified !== true
    ) {
      return null;
    }
  }

  const lat = typeof place.latitude === "number" ? place.latitude : (place.coordinates?.latitude ?? null);
  const lng = typeof place.longitude === "number" ? place.longitude : (place.coordinates?.longitude ?? null);

  if (lat === null || lng === null) return null;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (isZeroCoordinate(lat, lng)) return null;
  if (!isInPhilippinesBounds(lat, lng)) return null;

  return { latitude: lat, longitude: lng };
}

function getMissingRequiredPlaceFields(
  place: AskAiMapGroundedPlace,
  options?: { requireCoordinates?: boolean }
): string[] {
  const missingFields: string[] = [];
  const requireCoordinates = options?.requireCoordinates !== false;

  if (!normalizeText(place.placeId)) missingFields.push("placeId");
  if (!normalizeText(place.name)) missingFields.push("name");

  const coords = requireCoordinates
    ? getPlaceCoordinate(place, { requireGeoapifyVerified: true })
    : null;
  if (requireCoordinates && !coords) {
    if (typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      missingFields.push("latitude");
    } else if (!Number.isFinite(place.latitude!) || !Number.isFinite(place.longitude!)) {
      missingFields.push("latitude/longitude (NaN)");
    } else if (isZeroCoordinate(place.latitude!, place.longitude!)) {
      missingFields.push("latitude/longitude (zero)");
    } else if (!isInPhilippinesBounds(place.latitude!, place.longitude!)) {
      missingFields.push("latitude/longitude (outside PH)");
    } else {
      missingFields.push("latitude/longitude (invalid)");
    }
  }

  if (!normalizeText(getPlaceAddressText(place))) missingFields.push("address");
  if (!normalizeText(getPlaceCategoryText(place))) missingFields.push("category");
  if (!normalizeText(getPlaceRatingText(place))) missingFields.push("ratingText");
  if (!normalizeText(getPlaceReviewCountText(place))) missingFields.push("reviewCountText");
  if (!normalizeText(getPlaceOpenStatusText(place))) missingFields.push("openStatusText");
  if (!normalizeText(getPlaceHoursText(place))) missingFields.push("hoursText");

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

function countReasonSentences(reason: string | undefined): number {
  const normalized = normalizeText(reason);

  if (!normalized) {
    return 0;
  }

  return normalized
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function buildReasonIdentity(reason: string | undefined): string {
  return normalizeSearchText(reason)
    .replace(/\b(this place|it|siya|niya|ito|place|spot|option)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  _query: string,
  usedReasonIdentities?: Set<string>
): AskAiMapGroundedPlace {
  const reasonIdentity = buildReasonIdentity(place.reason);

  if (reasonIdentity && usedReasonIdentities?.has(reasonIdentity)) {
    return place;
  }

  if (reasonIdentity) {
    usedReasonIdentities?.add(reasonIdentity);
  }

  return place;
}

function parseRatingNumber(value: string): number | null {
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const rating = Number(match[0]);
  return Number.isFinite(rating) ? rating : null;
}

function parseReviewCountNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/\d+/);
  if (!match) {
    return null;
  }

  const reviewCount = Number(match[0]);
  return Number.isFinite(reviewCount) ? reviewCount : null;
}

function normalizeOpenStatusForResponse(value: string): "open" | "closed" | "unknown" {
  const normalized = value.toLowerCase();

  if (/\bopen\b/.test(normalized)) {
    return "open";
  }

  if (/\bclosed\b/.test(normalized)) {
    return "closed";
  }

  return "unknown";
}

function getPlaceTrustedIdentityCoordinates(
  place: Pick<
    AskAiMapGroundedPlace,
    "googleMapsUri" | "googleMapsUrl" | "sourceUri" | "coordinates"
  >
): { latitude: number; longitude: number } | null {
  if (
    typeof place.coordinates?.latitude === "number" &&
    typeof place.coordinates?.longitude === "number" &&
    isValidCoordinatePair(place.coordinates.latitude, place.coordinates.longitude)
  ) {
    return {
      latitude: place.coordinates.latitude,
      longitude: place.coordinates.longitude,
    };
  }

  return (
    extractCoordinatesFromGoogleMapsUrl(
      getPlaceIdentityUri(place) ?? undefined
    ) ?? null
  );
}

function getCoordinateStatusForPlace(place: AskAiMapGroundedPlace): "trusted" | "missing" | "suspicious" {
  if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS && getPlaceCoordinate(place)) {
    return "trusted";
  }

  if (getPlaceCoordinate(place, { requireGeoapifyVerified: true })) {
    return "trusted";
  }

  if (
    typeof place.coordinates?.latitude === "number" &&
    typeof place.coordinates?.longitude === "number" &&
    isValidCoordinatePair(place.coordinates.latitude, place.coordinates.longitude) &&
    place.coordinates.source === "geoapify" &&
    place.coordinates.verified === true
  ) {
    return "trusted";
  }

  if (
    typeof place.coordinateStatus === "string" &&
    ["trusted", "missing", "suspicious"].includes(place.coordinateStatus)
  ) {
    return place.coordinateStatus as "trusted" | "missing" | "suspicious";
  }

  return "missing";
}

function buildAiPreview(place: AskAiMapGroundedPlace): string {
  const explicitPreview = normalizeText(place.aiPreview);

  if (explicitPreview) {
    return explicitPreview.slice(0, 140);
  }

  const whyThisFits = normalizeText(place.whyThisFits) ?? "";
  if (whyThisFits) {
    const [firstSentence] = whyThisFits
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    return (firstSentence || `${place.name} is a map-grounded match.`).slice(0, 140);
  }

  const reason = normalizeText(place.reason) ?? "";
  const [firstSentence] = reason
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (firstSentence || `${place.name} is a map-grounded match.`).slice(0, 140);
}

function serializePlaceForResponse(place: AskAiMapGroundedPlace): AskAiMapGroundedPlace {
  const coordinateStatus = getCoordinateStatusForPlace(place);
  const normalizedCoordinates = ASK_AI_MAPS_DEBUG_BYPASS_FILTERS
    ? getPlaceCoordinate(place)
    : getPlaceCoordinate(place, {
        requireGeoapifyVerified: true,
      });
  const coordinates =
    normalizedCoordinates
      ? {
          lat: normalizedCoordinates.latitude,
          lng: normalizedCoordinates.longitude,
          latitude: normalizedCoordinates.latitude,
          longitude: normalizedCoordinates.longitude,
          source: ASK_AI_MAPS_DEBUG_BYPASS_FILTERS
            ? (place.coordinates?.source ?? "maps_grounding")
            : ("geoapify" as const),
          ...(ASK_AI_MAPS_DEBUG_BYPASS_FILTERS
            ? {}
            : {
                trusted: true as const,
                verified: true as const,
              }),
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
  const rating = optionalDetails.ratingText
    ? parseRatingNumber(optionalDetails.ratingText)
    : null;
  const reviewCount = optionalDetails.reviewCountText
    ? parseReviewCountNumber(optionalDetails.reviewCountText)
    : null;
  const openStatus = normalizeOpenStatusForResponse(optionalDetails.openStatusText);
  const reason = normalizeText(place.reason) ?? "";
  const whyThisFits = normalizeText(place.whyThisFits) ?? reason;

  return {
    ...place,
    reason,
    whyThisFits,
    aiPreview: buildAiPreview({ ...place, reason, whyThisFits }),
    googleMapsUrl: googleMapsUri,
    googleMapsUri,
    placeId: place.placeId ?? "",
    cid: place.cid ?? "",
    sourceTitle: place.sourceTitle ?? "",
    sourceUri: place.sourceUri ?? "",
    coordinates,
    categoryText: optionalDetails.categoryText,
    ratingText: optionalDetails.ratingText,
    reviewCountText: optionalDetails.reviewCountText,
    openStatusText: optionalDetails.openStatusText,
    hoursText: optionalDetails.hoursText,
    addressText: optionalDetails.addressText,
    category: optionalDetails.categoryText,
    address: optionalDetails.addressText || null,
    rating,
    reviewCount,
    openStatus,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    coordinateStatus: coordinates ? coordinateStatus : "missing",
    optionalDetails,
    source: coordinates
      ? {
          recommendation: "gemini_maps_grounding" as const,
          coordinates:
            coordinates.source === "maps_grounding"
              ? ("maps_grounding" as const)
              : ("geoapify_geocoding" as const),
        }
      : {
          recommendation: "gemini_maps_grounding" as const,
        },
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
  if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
    void query;

    const finalPlaces = candidates
      .filter((candidate, index) => {
        const keep = hasRequiredCompletePlaceDetails(candidate.place);

        if (!keep) {
          warnAskAiMapsDroppedEvenInBypass({
            name: candidate.place.name,
            stage: "rankAndFilterGroundedPlaces",
            reason: "failed_minimal_identity_check",
            candidate: candidate.place,
          });
          return false;
        }

        logAskAiMapsDebugCandidate(
          "after_coordinate_handling",
          candidate.place as Record<string, unknown>,
          index
        );
        return true;
      })
      .map((candidate) => candidate.place)
      .slice(0, ASK_AI_MAPS_MAX_PLACES * 3);

    const diagnostics = buildAskAiMapsFilterDiagnostics({
      rawParsedPlaces: rawParsedPlacesCount,
      groundingSources: groundingSourcesCount,
      candidates,
      finalPlaces,
    });

    return {
      finalPlaces,
      diagnostics,
    };
  }

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

  const usedReasonIdentities = new Set<string>();
  const finalPlaces = dedupedCandidates
    .filter((candidate) => hasRequiredCompletePlaceDetails(candidate.place))
    .sort((left, right) => compareGroundedPlaceCandidates(left, right, query))
    .map((candidate) =>
      cleanupFinalPlaceReason(candidate.place, query, usedReasonIdentities)
    )
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

    if (!source) {
      continue;
    }

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
      source,
    });
    const genericOrMissingReason = isWeakGroundedReason(
      normalizeOptionalDisplayText(candidate.reason) ?? undefined
    );
    const reason =
      !genericOrMissingReason && normalizeOptionalDisplayText(candidate.reason)
        ? normalizeOptionalDisplayText(candidate.reason)!
        : "";
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
      reason: "",
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

function buildGeminiMapGroundingOnlyPrompt(query: string): string {
  return `You are GalaTayo's Ask AI Maps assistant.
Use Google Maps grounding for this exact raw user query: "${query}"

Task:
- Find real places relevant to the query.
- Prefer places supported by Google Maps grounding metadata.
- Return only places that are supported by grounding metadata.
- Do not invent place names.
- Do not invent coordinates.
- Do not invent ratings, reviews, hours, or addresses.
- Use grounding sources as the source of truth.
- Coordinates are optional.

Return a short summary only. The app will read the grounding metadata directly for the place cards.`;
}

async function generateGeminiMapGroundingOnlyResponse({
  ai,
  model,
  params,
  logger,
}: {
  ai: GoogleGenAI;
  model: string;
  params: AskAiMapsSearchParams;
  logger?: AskAiMapsLogger;
}): Promise<Omit<AskAiMapsSearchResult, "latencyMs">> {
  console.log("[Ask AI Maps][Mode]", "gemini_map_grounding_only");
  console.log("[Ask AI Maps][Geoapify Disabled]", true);

  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: buildGeminiMapGroundingOnlyPrompt(params.query),
      config: {
        temperature: 0.2,
        maxOutputTokens: ASK_AI_MAPS_MAX_OUTPUT_TOKENS,
        tools: [{ googleMaps: {} }],
        toolConfig: {
          includeServerSideToolInvocations: true,
        },
      },
    }),
    ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
    "Ask AI Maps provider timed out."
  );

  logger?.log(`[Ask AI Maps] Model succeeded: ${model}`);

  const groundingMetadata =
    ((response as any)?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.response?.candidates?.[0]?.groundingMetadata ??
      (response as any)?.candidates?.[0]?.grounding_metadata ??
      (response as any)?.response?.candidates?.[0]?.grounding_metadata) as
      | GroundingMetadataLike
      | undefined;
  const metadataSources = extractGroundingSources(groundingMetadata);
  const stepSources = extractGoogleMapsStepSources(response);
  const looseSources = extractLooseGoogleMapsSources(response);
  const groundingSources = filterSourcesForQuery(
    params.query,
    mergeGroundingSourceLists(
      mergeGroundingSourceLists(metadataSources, stepSources),
      looseSources
    )
  );

  console.log("[Ask AI Maps][Grounding Sources Count]", groundingSources.length);

  const extractedPlaces = buildGeminiOnlyPlacesFromSources(params.query, groundingSources)
    .map(serializePlaceForResponse)
    .slice(0, ASK_AI_MAPS_MAX_PLACES);
  const placesWithCoordinates = extractedPlaces.filter((place) =>
    Boolean(getPlaceCoordinate(place))
  );
  const placesWithoutCoordinates = extractedPlaces.filter(
    (place) => !getPlaceCoordinate(place)
  );

  console.log("[Ask AI Maps][Extracted Grounded Places Count]", extractedPlaces.length);
  console.log("[Ask AI Maps][Places With Coordinates]", placesWithCoordinates.length);
  console.log("[Ask AI Maps][Places Without Coordinates]", placesWithoutCoordinates.length);

  const candidateText = await extractGeminiCandidateTextForDebug(response as any);
  const rawText = typeof candidateText === "string" ? candidateText.trim() : "";
  const answerText = rawText || buildGeminiOnlyAnswerText(params.query, extractedPlaces.length);
  const responseMetadata: AskAiMapsResponseMetadata = {
    mode: "gemini_map_grounding_only",
    provider: "gemini",
    modelUsed: "models/gemini-3.1-flash-lite",
    coordinatePolicy: "gemini_map_grounding_coordinates",
    discoveryProvider: "gemini_map_grounding",
    coordinateProvider: "gemini_grounding_location_text",
    geminiCoordinatesUsed: true,
    geoapifyUsed: false,
    googlePlacesApiUsed: false,
    groundingSourcesCount: groundingSources.length,
    finalGroundedPlacesCount: extractedPlaces.length,
    placesWithCoordinates: placesWithCoordinates.length,
    placesWithoutCoordinatesCount: placesWithoutCoordinates.length,
  };

  return {
    mode: "gemini_map_grounding_only",
    provider: "gemini",
    modelUsed: "models/gemini-3.1-flash-lite",
    coordinatePolicy: "gemini_map_grounding_coordinates",
    discoveryProvider: "gemini_map_grounding",
    coordinateProvider: "gemini_grounding_location_text",
    geminiCoordinatesUsed: true,
    geoapifyUsed: false,
    googlePlacesApiUsed: false,
    responseMetadata,
    query: params.query,
    searchArea: null,
    answerText,
    summary: answerText,
    resultMeta: {
      queryType: "broad",
      targetMinResults: ASK_AI_MAPS_MIN_GENERAL_PLACES,
      targetMaxResults: ASK_AI_MAPS_MAX_PLACES,
      actualResults: extractedPlaces.length,
      resultCountReason: null,
    },
    places: extractedPlaces,
    sources: mapSourcesForResponse(groundingSources),
    suggestedSearches: [],
    explanationSource: "backend_template",
    ...(extractedPlaces.length === 0
      ? {
          emptyReason: "NO_MAP_GROUNDING_RESULTS" as const,
          message: NO_RESULTS_MESSAGE,
        }
      : {}),
  };
}

function isOutputTokenBudgetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /max(?:imum)? output tokens|maxOutputTokens|token budget|too large|invalid/i.test(message);
}

async function generateMapsResponse({
  ai,
  model,
  params,
  logger,
}: {
  ai: GoogleGenAI;
  model: string;
  params: AskAiMapsSearchParams;
  logger?: AskAiMapsLogger;
}): Promise<Omit<AskAiMapsSearchResult, "latencyMs" | "modelUsed">> {
  const extractedTargetArea = extractTargetAreaFromQuery(params.query);
  const targetArea = extractedTargetArea
    ? await resolveTargetAreaWithGeoapify(extractedTargetArea, logger)
    : null;

  if (!targetArea) {
    throw new AskAiMapsServiceError(
      "Please include a locality like 'malls in Cavite' so Ask AI Maps can verify results in the right area.",
      400,
      {
        code: "ASK_AI_MAPS_TARGET_AREA_REQUIRED",
        model,
        stage: "resolve_target_area",
        details: {
          query: params.query,
          extractedTargetArea,
        },
      }
    );
  }

  logger?.log(
    `[Ask AI Maps] Resolved target area ${JSON.stringify({
      name: targetArea.name,
      center: targetArea.center,
      bbox: targetArea.bbox ?? null,
      city: targetArea.city ?? null,
      province: targetArea.province ?? null,
      region: targetArea.region ?? null,
      allowedRadiusKm: targetArea.allowedRadiusKm,
    })}`
  );

  logAskAiMapsDiagnostics(logger, "before_provider_call", {
    model,
    query: params.query,
    timeoutMs: ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
  });

  let response: unknown = null;
  let rawText = "";
  let sources: GroundingSource[] = [];
  let attemptUsed = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    attemptUsed = attempt;
    const prompt = buildMapsGroundingPrompt(params, {
      forceMapsGrounding: attempt > 0,
      retryAttempt: attempt,
    });

    response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.25,
          maxOutputTokens: ASK_AI_MAPS_MAX_OUTPUT_TOKENS,
          tools: [{ googleMaps: {} }],
          toolConfig: {
            includeServerSideToolInvocations: true,
          },
        },
      }),
      ASK_AI_MAPS_PROVIDER_TIMEOUT_MS,
      "Ask AI Maps provider timed out."
    );

    console.log("ASK AI MAP MODEL:", model);
    console.log(JSON.stringify((response as any)?.candidates?.[0] ?? null, null, 2));

    logger?.log(`[Ask AI Maps] Model succeeded: ${model} (attempt ${attempt + 1})`);
    logAskAiMapsDiagnostics(logger, "after_provider_response", {
      model,
      attempt: attempt + 1,
      hasCandidates: Boolean((response as any)?.candidates?.length),
      outputTokenBudgetUsed: ASK_AI_MAPS_MAX_OUTPUT_TOKENS,
    });

    const candidateText = await extractGeminiCandidateTextForDebug(response as any);
    rawText = typeof candidateText === "string" ? candidateText : "";
    const groundingMetadata =
      ((response as any)?.candidates?.[0]?.groundingMetadata ??
        (response as any)?.response?.candidates?.[0]?.groundingMetadata ??
        (response as any)?.candidates?.[0]?.grounding_metadata ??
        (response as any)?.response?.candidates?.[0]?.grounding_metadata) as
        | GroundingMetadataLike
        | undefined;
    const metadataSources = extractGroundingSources(groundingMetadata);
    const stepSources = extractGoogleMapsStepSources(response);
    const looseSources = extractLooseGoogleMapsSources(response);
    const mergedSources = mergeGroundingSourceLists(
      mergeGroundingSourceLists(metadataSources, stepSources),
      looseSources
    );
    sources = filterSourcesForQuery(params.query, mergedSources);
    logAskAiMapsStageCount(
      logger,
      "Google grounding sources count:",
      sources.length
    );
    if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
      sources.forEach((source, index) =>
        logAskAiMapsDebugCandidate(
          "grounding_source",
          source as Record<string, unknown>,
          index
        )
      );
    }

    logAskAiMapsDiagnostics(logger, "after_extracting_grounding_sources", {
      model,
      attempt: attempt + 1,
      metadataSources: metadataSources.length,
      stepSources: stepSources.length,
      looseSources: looseSources.length,
      mergedSources: mergedSources.length,
      finalSources: sources.length,
    });

    if (sources.length > 0) {
      break;
    }

    logger?.log(
      `[Ask AI Maps] No grounding sources were returned on attempt ${attempt + 1}.`
    );
  }

  if (sources.length === 0) {
    throw new AskAiMapsServiceError(
      "Ask AI Maps did not return any verified Google Maps grounding sources.",
      502,
      {
        code: "ASK_AI_MAPS_NO_GROUNDING",
        model,
        stage: "grounding_required",
        details: {
          attempts: attemptUsed + 1,
          query: params.query,
        },
      }
    );
  }

  logAskAiMapsDiagnostics(logger, "after_parsing_model_json", {
    model,
    parsedPlaces: 0,
    hasParsedAnswerText: false,
    looksStructuredJson: looksLikeStructuredJsonReply(rawText),
  });

  const groundedCandidates = buildGroundedCandidatesFromSources(sources);
  logAskAiMapsStageCount(
    logger,
    "Extracted candidates count:",
    groundedCandidates.length
  );
  const groundedResult = rankAndFilterGroundedPlaces(
    groundedCandidates,
    0,
    sources.length,
    params.query
  );
  const hydratedPlaces = await hydrateGroundedPlacesWithCoordinates(
    groundedResult.finalPlaces,
    targetArea,
    logger
  );
  logAskAiMapsStageCount(
    logger,
    "After enrichment count:",
    hydratedPlaces.length
  );
  const places = ASK_AI_MAPS_DEBUG_BYPASS_FILTERS
    ? hydratedPlaces.filter((place, index) => {
        const keep = hasRequiredCompletePlaceDetails(place);

        if (!keep) {
          warnAskAiMapsDroppedEvenInBypass({
            name: place.name,
            stage: "final_place_filter",
            reason: "failed_minimal_identity_check",
            candidate: place,
          });
          return false;
        }

        logAskAiMapsDebugCandidate(
          "after_coordinate_handling",
          place as Record<string, unknown>,
          index
        );
        return true;
      })
    : hydratedPlaces.filter(
        (place) =>
          hasRequiredCompletePlaceDetails(place) &&
          Boolean(getPlaceCoordinate(place, { requireGeoapifyVerified: true }))
      );
  logAskAiMapsStageCount(
    logger,
    "After coordinate handling count:",
    places.length
  );
  logAskAiMapsDiagnostics(logger, "after_normalization", {
    model,
    normalizedPlacesBeforeStrictFilter:
      groundedResult.diagnostics.normalizedPlacesBeforeStrictFilter,
    finalPlaces: places.length,
    droppedAfterHydrationStrictCheck: hydratedPlaces.length - places.length,
  });

  logAskAiMapsFilterDiagnostics(groundedResult.diagnostics, logger);
  logAskAiMapsDiagnostics(logger, "after_strict_filtering", {
    model,
    rawParsedPlaces: groundedResult.diagnostics.rawParsedPlaces,
    groundingSources: groundedResult.diagnostics.groundingSources,
    normalizedPlacesBeforeStrictFilter:
      groundedResult.diagnostics.normalizedPlacesBeforeStrictFilter,
    completePlacesAfterStrictFilter:
      groundedResult.diagnostics.completePlacesAfterStrictFilter,
    rejectedBecauseMissing: groundedResult.diagnostics.rejectedBecauseMissing,
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
    parsedPlaces: [],
    finalPlaces: places,
  });

  logger?.log(`[Ask AI Maps] Map grounding sources: ${sources.length}`);
  logger?.log(`[Ask AI Maps] Parsed places: 0`);
  logger?.log(`[Ask AI Maps] Final displayed places: ${places.length}`);
  logger?.log(
    `[Ask AI Maps] Places with coordinates: ${places.filter((place) => place.coordinates).length}`
  );
  logger?.log(
    `[Ask AI Maps] Dropped after hydration strict check: ${hydratedPlaces.length - places.length}`
  );

  const rankingResult =
    places.length > 0
      ? await rankGroundedPlacesWithModel({
          ai,
          model,
          query: params.query,
          places,
          logger,
        })
      : {
          rankedPlaceIds: [] as string[],
          explanations: new Map<string, string>(),
          answerText: "",
        };
  const placeById = new Map(
    places
      .map((place) => {
        const placeId = normalizeText(place.placeId)?.toLowerCase();
        return placeId ? ([placeId, place] as const) : null;
      })
      .filter((entry): entry is readonly [string, AskAiMapGroundedPlace] => entry !== null)
  );
  const rankedPlaces = rankingResult.rankedPlaceIds
    .map((placeId) => placeById.get(placeId) ?? null)
    .filter((place): place is AskAiMapGroundedPlace => place !== null);
  const rankedPlaceKeys = new Set(
    rankedPlaces
      .map((place) => normalizeText(place.placeId)?.toLowerCase())
      .filter((placeId): placeId is string => Boolean(placeId))
  );
  const orderedPlaces =
    rankedPlaces.length > 0
      ? [
          ...rankedPlaces,
          ...places.filter((place) => {
            const placeId = normalizeText(place.placeId)?.toLowerCase();
            return !placeId || !rankedPlaceKeys.has(placeId);
          }),
        ]
      : places;
  const placesWithExplanations = orderedPlaces.map((place) => {
    const placeKey = normalizeText(place.placeId)?.toLowerCase() ?? "";
    const whyThisFits =
      rankingResult.explanations.get(placeKey) ??
      buildFallbackWhyThisFits(place, params.query);
    return {
      ...place,
      whyThisFits,
      reason: whyThisFits,
    };
  });

  const answerText =
    rankingResult.answerText ??
    buildAnswerText(null, placesWithExplanations, "");

  const responsePlaces = placesWithExplanations
    .map(serializePlaceForResponse)
    .filter((place) => {
      if (ASK_AI_MAPS_DEBUG_BYPASS_FILTERS) {
        const keep = hasRequiredCompletePlaceDetails(place);

        if (!keep) {
          warnAskAiMapsDroppedEvenInBypass({
            name: place.name,
            stage: "serialize_response_places",
            reason: "failed_minimal_identity_check",
            candidate: place,
          });
        }

        return keep;
      }

      return Boolean(getPlaceCoordinate(place, { requireGeoapifyVerified: true }));
    })
    .slice(0, ASK_AI_MAPS_MAX_PLACES);

  if (
    !ASK_AI_MAPS_DEBUG_BYPASS_FILTERS &&
    responsePlaces.some((place) => !getPlaceCoordinate(place, { requireGeoapifyVerified: true }))
  ) {
    throw new AskAiMapsServiceError(
      "Ask AI Maps produced places without grounded coordinates.",
      500,
      {
        code: "ASK_AI_MAPS_NORMALIZATION_ERROR",
        model,
        stage: "final_coordinate_validation",
      }
    );
  }

  logger?.log(
    `[Ask AI Maps] Final coordinate summary ${JSON.stringify(
      responsePlaces.map((place) => ({
        name: place.name,
        source: place.coordinates?.source ?? null,
        coordinateStatus: place.coordinateStatus ?? null,
        rawLat: place.coordinates?.latitude ?? place.latitude ?? null,
        rawLng: place.coordinates?.longitude ?? place.longitude ?? null,
        finalLat: place.coordinates?.latitude ?? null,
        finalLng: place.coordinates?.longitude ?? null,
      }))
    )}`
  );
  logAskAiMapsStageCount(
    logger,
    "Final places returned to frontend count:",
    responsePlaces.length
  );
  const resultMeta = buildResultMeta({
    params,
    actualResults: responsePlaces.length,
    sourcesCount: sources.length,
  });

  return {
    mode: "map_grounding_only",
    query: params.query,
    searchArea: targetArea.name,
    answerText,
    summary: answerText,
    resultMeta,
    places: responsePlaces,
    sources: mapSourcesForResponse(sources),
    ...(responsePlaces.length === 0
      ? {
          emptyReason: "NO_MAP_GROUNDING_RESULTS" as const,
          message: NO_RESULTS_MESSAGE,
        }
      : responsePlaces.length < MIN_LOCALITY_VERIFIED_RESULTS_MESSAGE_COUNT
        ? {
            message: buildPartialVerifiedResultsMessage(
              responsePlaces.length,
              targetArea.name
            ),
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

  if (isGeminiMapGroundingOnlyMode()) {
    const result = await generateGeminiMapGroundingOnlyResponse({
      ai,
      model: "models/gemini-3.1-flash-lite",
      params,
      logger,
    });

    return {
      ...result,
      latencyMs: Date.now() - startedAt,
    };
  }

  const modelSequence = getAskAiMapsModelSequence();
  const attemptedModels: Array<{
    model: string;
    status: "success" | "no_grounded_places" | "failed";
    errorCode?: string;
    providerStatus?: number;
  }> = [];
  let lastServiceError: AskAiMapsServiceError | null = null;

  logger?.log(`[Ask AI Maps] Model sequence: ${modelSequence.join(", ")}`);

  for (const modelUsed of modelSequence) {
    try {
      const result = await generateMapsResponse({
        ai,
        model: modelUsed,
        params,
        logger,
      });

      attemptedModels.push({
        model: modelUsed,
        status: result.places.length === 0 ? "no_grounded_places" : "success",
      });

      logAskAiMapsDiagnostics(logger, "attempted_models", {
        modelUsed,
        attemptedModels,
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

      lastServiceError = serviceError;
      attemptedModels.push({
        model: modelUsed,
        status: "failed",
        errorCode: serviceError.code,
        providerStatus: serviceError.providerStatus,
      });

      logAskAiMapsDiagnostics(logger, "provider_error", {
        model: modelUsed,
        status: serviceError.status,
        providerStatus: serviceError.providerStatus,
        code: serviceError.code,
        stage: serviceError.stage,
        message: serviceError.message,
        rawProviderMessage: getErrorMessage(error),
        rawProviderPayload: sanitizeForDebug(getErrorPayload(error)),
      });

      lastServiceError = new AskAiMapsServiceError(serviceError.message, serviceError.status, {
        code: serviceError.code,
        providerStatus: serviceError.providerStatus,
        model: serviceError.model,
        stage: serviceError.stage,
        details: {
          ...(serviceError.details ?? {}),
          rawProviderMessage: getErrorMessage(error),
          rawProviderPayload: sanitizeForDebug(getErrorPayload(error)),
        },
        cause: error,
      });
    }
  }

  const serviceError =
    lastServiceError ??
    new AskAiMapsServiceError("Gemini Maps request failed.", 502, {
      code: "ASK_AI_MAPS_PROVIDER_ERROR",
      stage: "provider_call",
    });

  logAskAiMapsDiagnostics(logger, "attempted_models", {
    modelUsed: serviceError.model ?? null,
    attemptedModels,
  });

  throw new AskAiMapsServiceError(
    serviceError.code === "ASK_AI_MAPS_PARSE_ERROR" ||
    serviceError.code === "ASK_AI_MAPS_NORMALIZATION_ERROR"
      ? "Ask AI Maps could not process places right now. Please try again."
      : serviceError.code === "ASK_AI_MAPS_NO_GROUNDING"
        ? "Ask AI Maps ran, but Gemini did not return usable Google Maps-grounded places for this request."
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
      providerStatus: serviceError.providerStatus,
      model: serviceError.model,
      stage: serviceError.stage ?? "provider_call",
      details: {
        ...(serviceError.details ?? {}),
        attemptedModels,
        modelUsed: serviceError.model ?? null,
      },
      cause: serviceError,
    }
  );
}
