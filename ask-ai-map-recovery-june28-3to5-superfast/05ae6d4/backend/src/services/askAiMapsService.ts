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
};

type ParsedModelResponse = {
  answerText?: unknown;
  places?: unknown;
};

type GroundingMetadataLike = {
  groundingChunks?: Array<{
    maps?: {
      title?: string;
      text?: string;
      uri?: string;
      placeId?: string;
    };
  }>;
};

type GroundingSource = {
  title?: string;
  text?: string;
  uri?: string;
  placeId?: string;
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

const RETRYABLE_AI_STATUSES = new Set([403, 429, 500, 503, 504]);
const ASK_AI_MAPS_FALLBACK_DELAY_MS = 650;
const ASK_AI_MAPS_PROVIDER_COOLDOWN_MS = 60_000;
const PROVIDER_BUSY_MESSAGE = "Ask AI Maps is busy right now. Try again in a bit.";
const NO_RESULTS_MESSAGE =
  "No map-grounded places matched that request. Try a more specific area or place type.";
const DEBUG_ASK_AI_MAPS_RAW =
  process.env.DEBUG_ASK_AI_MAPS_RAW?.trim().toLowerCase() === "true";
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

function parseModelResponse(text: string): ParsedModelResponse | null {
  const jsonText = extractJsonObjectText(text);

  if (!jsonText.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(jsonText) as ParsedModelResponse;
  } catch {
    return null;
  }
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

function sanitizeDebugLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDebugLogValue(entry, seen));
  }

  if (!value || typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => [
    key,
    /(?:api[-_]?key|authorization|token|secret)/i.test(key)
      ? "[REDACTED]"
      : sanitizeDebugLogValue(entryValue, seen),
  ]);

  return Object.fromEntries(sanitizedEntries);
}

function stringifyDebugLogValue(value: unknown): string {
  try {
    return JSON.stringify(sanitizeDebugLogValue(value), null, 2);
  } catch (error) {
    return JSON.stringify({
      error: "Failed to serialize debug value.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function logMapsGroundingDebugResponse(
  response: unknown,
  groundingMetadata: GroundingMetadataLike | undefined,
  logger?: AskAiMapsLogger
) {
  if (!DEBUG_ASK_AI_MAPS_RAW || !logger) {
    return;
  }

  logger.log(`[Ask AI Maps][debug] Raw Gemini Maps response: ${stringifyDebugLogValue(response)}`);

  const chunkSummaries = (groundingMetadata?.groundingChunks ?? []).map((chunk, index) => {
    const rawMaps = chunk?.maps;

    return {
      index,
      title: normalizeText(rawMaps?.title),
      uri: normalizeText(rawMaps?.uri),
      placeId: normalizeText(rawMaps?.placeId),
      maps: sanitizeDebugLogValue(rawMaps),
    };
  });

  logger.log(
    `[Ask AI Maps][debug] Grounding chunk summary: ${stringifyDebugLogValue(chunkSummaries)}`
  );
}

function isRetryableProviderError(error: unknown) {
  const status = getErrorStatus(error);

  if (RETRYABLE_AI_STATUSES.has(status)) {
    return true;
  }

  const message = getErrorMessage(error);

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

  return `
You are GalaTayo's Ask AI Maps local guide.

Use only the Google Maps grounding tool for this answer.
Do not call or rely on Google Places API data.
Do not invent missing details.
Do not include photo URLs.
Do not promise exact hours, ratings, phone numbers, websites, coordinates, or other details unless the grounded answer explicitly provides them.
Return 5 to 8 recommendations when possible.
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
      "ratingText": "Optional rating text only if available from the grounded answer"
    }
  ]
}

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

  for (const chunk of groundingMetadata?.groundingChunks ?? []) {
    const maps = chunk?.maps;
    const title = normalizeText(maps?.title) ?? undefined;
    const text = normalizeText(maps?.text) ?? undefined;
    const uri = normalizeText(maps?.uri) ?? undefined;
    const placeId = normalizeText(maps?.placeId) ?? undefined;

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
    });
  }

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

  return normalizeText(rawText) ?? "No grounded summary was provided.";
}

function normalizeGroundedPlaces(
  parsed: ParsedModelResponse | null,
  sources: GroundingSource[]
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
    const name = normalizeText(candidate.name);

    if (!name) {
      continue;
    }

    const reason =
      normalizeOptionalDisplayText(candidate.reason) ??
      "Grounded Google Maps recommendation for your request.";
    const source = findBestGroundingSource(name, sources);
    const googleMapsUrl = source?.uri;
    const placeId = source?.placeId;
    const categoryText = normalizeOptionalDisplayText(candidate.categoryText);
    const ratingText = normalizeOptionalDisplayText(candidate.ratingText);
    const openStatusText = normalizeOptionalDisplayText(candidate.openStatusText);
    const addressText =
      normalizeOptionalDisplayText(candidate.addressText) ??
      normalizeOptionalDisplayText(source?.text);
    const coordinates = extractCoordinatesFromGoogleMapsUrl(googleMapsUrl ?? source?.uri);
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

  return normalizedPlaces.slice(0, 8);
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
  logger,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
  logger?: AskAiMapsLogger;
}): Promise<Omit<AskAiMapsSearchResult, "latencyMs" | "modelUsed">> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.25,
      maxOutputTokens: 1800,
      tools: [{ googleMaps: {} }],
    },
  });

  logger?.log(`[Ask AI Maps] Model succeeded: ${model}`);

  const rawText = response.text ?? "";
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata as
    | GroundingMetadataLike
    | undefined;
  logMapsGroundingDebugResponse(response, groundingMetadata, logger);
  const sources = extractGroundingSources(groundingMetadata);
  const parsed = parseModelResponse(rawText);
  const normalizedPlaces = normalizeGroundedPlaces(parsed, sources);
  const places = await hydrateGroundedPlacesWithCoordinates(normalizedPlaces, logger);
  const answerText = buildAnswerText(parsed, places, rawText);

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

  if (isAskAiMapsCoolingDown()) {
    logger?.log("[Ask AI Maps] Cooldown active");
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

  const apiKey = await getGoogleApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildMapsGroundingPrompt(params);
  let lastRetryableError: unknown = null;
  let sawRetryableProviderFailure = false;

  for (const [index, model] of ASK_AI_MAPS_MODELS.entries()) {
    logger?.log(`[Ask AI Maps] Trying model: ${model}`);

    try {
      const result = await generateMapsResponse({
        ai,
        model,
        prompt,
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
