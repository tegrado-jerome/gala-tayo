import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";

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

export type AskAiMapPlace = {
  id: string;
  name: string;
  category: string | null;
  rating: number | null;
  openStatus: "Open" | "Closed" | "Unknown";
  budget: string | null;
  address: string | null;
  aiReason: string;
  googleMapsUrl: string | null;
  photoUrl: string | null;
  latitude: number;
  longitude: number;
};

export type AskAiMapsSearchResult = {
  places: AskAiMapPlace[];
  modelUsed: string;
  fallbackUsed: boolean;
  latencyMs: number;
};

type ParsedModelResponse = {
  places?: Array<{
    name?: unknown;
    category?: unknown;
    rating?: unknown;
    openStatus?: unknown;
    budget?: unknown;
    address?: unknown;
    aiReason?: unknown;
    googleMapsUrl?: unknown;
    photoUrl?: unknown;
  }>;
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

const ASK_AI_MAP_MODELS = [
  "gemini-2.5-flash",
  "gemini-2-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const METRO_MANILA_CENTER = {
  latitude: 14.5995,
  longitude: 120.9842,
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized ? normalized : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeOpenStatus(value: unknown): "Open" | "Closed" | "Unknown" {
  const normalized = normalizeText(value)?.toLowerCase() ?? "";

  if (normalized === "open") return "Open";
  if (normalized === "closed") return "Closed";
  return "Unknown";
}

function normalizePlaceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

function buildMapsPrompt({
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
You are GalaTayo's Ask AI Map Finder.

Use Google Maps grounding to find place recommendations inside Metro Manila, Philippines.
Prefer real places that match the user's vibe and can be opened in Google Maps.
Do not invent missing facts. If a field is unavailable, return null.
Keep aiReason short, natural, and specific, in 1 sentence of Taglish.
If near me is enabled, prioritize places near the provided coordinates.
If open now is enabled, prioritize places that appear open right now.
Return only JSON that matches the requested schema.

User query: ${query}
Selected chips: ${chipText}
Near me: ${nearMe ? "yes" : "no"}
Open now: ${openNow ? "yes" : "no"}
User coordinates: ${locationText}

Return 5 to 8 places with:
- name
- category
- rating
- openStatus ("Open", "Closed", or "Unknown")
- budget
- address
- aiReason
- googleMapsUrl
- photoUrl
`.trim();
}

async function getGeminiApiKey(): Promise<string> {
  try {
    const envApiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GOOGLE_GENAI_API_KEY?.trim();
    const apiKey = envApiKey || (await getSecret("gemini-api-key"));

    if (!apiKey) {
      throw new AskAiMapsServiceError("Gemini API key is missing.", 500);
    }

    return apiKey;
  } catch (error) {
    if (error instanceof AskAiMapsServiceError) {
      throw error;
    }

    throw new AskAiMapsServiceError(
      error instanceof Error ? error.message : "Failed to retrieve Gemini API key.",
      500
    );
  }
}

function getGroundingMapsByName(groundingMetadata: GroundingMetadataLike | undefined) {
  const mapEntries = new Map<
    string,
    {
      title: string | null;
      text: string | null;
      uri: string | null;
      placeId: string | null;
    }
  >();

  for (const chunk of groundingMetadata?.groundingChunks ?? []) {
    const maps = chunk?.maps;
    const title = normalizeText(maps?.title);

    if (!title) {
      continue;
    }

    mapEntries.set(normalizePlaceKey(title), {
      title,
      text: normalizeText(maps?.text),
      uri: normalizeText(maps?.uri),
      placeId: normalizeText(maps?.placeId),
    });
  }

  return mapEntries;
}

async function geocodePlace({
  name,
  address,
}: {
  name: string;
  address: string | null;
}): Promise<{ latitude: number; longitude: number } | null> {
  const queries = [
    [name, address, "Metro Manila", "Philippines"].filter(Boolean).join(", "),
    [name, "Metro Manila", "Philippines"].filter(Boolean).join(", "),
  ];

  for (const query of queries) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "ph");
      url.searchParams.set("q", query);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "GalaTayo Ask AI Map Finder/1.0",
        },
      });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as Array<{
        lat?: string;
        lon?: string;
      }>;
      const firstResult = body[0];

      if (!firstResult?.lat || !firstResult?.lon) {
        continue;
      }

      const latitude = Number(firstResult.lat);
      const longitude = Number(firstResult.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      return { latitude, longitude };
    } catch {
      continue;
    }
  }

  return null;
}

function calculateDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function normalizePlaces({
  parsed,
  groundingMetadata,
  userLocation,
}: {
  parsed: ParsedModelResponse;
  groundingMetadata?: GroundingMetadataLike;
  userLocation?: { latitude: number; longitude: number } | null;
}): Promise<AskAiMapPlace[]> {
  const groundingMapsByName = getGroundingMapsByName(groundingMetadata);
  const seenKeys = new Set<string>();
  const rawPlaces = Array.isArray(parsed.places) ? parsed.places : [];

  const enrichedPlaces = await Promise.all(
    rawPlaces.map(async (rawPlace, index) => {
      const name = normalizeText(rawPlace?.name);

      if (!name) {
        return null;
      }

      const groundingMatch = groundingMapsByName.get(normalizePlaceKey(name));
      const address = normalizeText(rawPlace?.address) ?? groundingMatch?.text ?? null;
      const googleMapsUrl = normalizeText(rawPlace?.googleMapsUrl) ?? groundingMatch?.uri ?? null;
      const key = normalizePlaceKey(googleMapsUrl || `${name} ${address || ""}`);

      if (!key || seenKeys.has(key)) {
        return null;
      }

      seenKeys.add(key);

      const coordinates =
        (await geocodePlace({
          name,
          address,
        })) ?? null;

      if (!coordinates) {
        return null;
      }

      return {
        id: toPlaceId(groundingMatch?.placeId || googleMapsUrl || name, index),
        name,
        category: normalizeText(rawPlace?.category),
        rating: normalizeOptionalNumber(rawPlace?.rating),
        openStatus: normalizeOpenStatus(rawPlace?.openStatus),
        budget: normalizeText(rawPlace?.budget),
        address,
        aiReason:
          normalizeText(rawPlace?.aiReason) ??
          normalizeText(groundingMatch?.text) ??
          "Mukhang swak ito sa vibe ng hanap mo.",
        googleMapsUrl,
        photoUrl: normalizeText(rawPlace?.photoUrl),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      } satisfies AskAiMapPlace;
    })
  );

  const validPlaces = enrichedPlaces.filter((place): place is AskAiMapPlace => place !== null);

  if (userLocation) {
    validPlaces.sort((leftPlace, rightPlace) => {
      const leftDistance = calculateDistanceKm(userLocation, {
        latitude: leftPlace.latitude,
        longitude: leftPlace.longitude,
      });
      const rightDistance = calculateDistanceKm(userLocation, {
        latitude: rightPlace.latitude,
        longitude: rightPlace.longitude,
      });

      return leftDistance - rightDistance;
    });
  }

  return validPlaces.slice(0, 8);
}

async function generateMapsResponse({
  ai,
  model,
  prompt,
  userLocation,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
  userLocation?: { latitude: number; longitude: number } | null;
}): Promise<AskAiMapPlace[]> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.35,
      maxOutputTokens: 2200,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          places: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: ["string", "null"] },
                rating: { type: ["number", "null"] },
                openStatus: { type: ["string", "null"] },
                budget: { type: ["string", "null"] },
                address: { type: ["string", "null"] },
                aiReason: { type: ["string", "null"] },
                googleMapsUrl: { type: ["string", "null"] },
                photoUrl: { type: ["string", "null"] },
              },
              required: ["name", "aiReason"],
            },
          },
        },
        required: ["places"],
      },
      tools: [{ googleMaps: {} }],
    },
  });

  const parsed = JSON.parse(sanitizeJsonText(response.text ?? "{}")) as ParsedModelResponse;
  const places = await normalizePlaces({
    parsed,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata as GroundingMetadataLike | undefined,
    userLocation,
  });

  if (places.length === 0) {
    throw new AskAiMapsServiceError("No grounded map results were available.", 404);
  }

  return places;
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();
  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildMapsPrompt(params);
  let lastError: unknown = null;

  for (const [index, model] of ASK_AI_MAP_MODELS.entries()) {
    try {
      const places = await generateMapsResponse({
        ai,
        model,
        prompt,
        userLocation: params.userLocation ?? METRO_MANILA_CENTER,
      });

      return {
        places,
        modelUsed: model,
        fallbackUsed: index > 0,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new AskAiMapsServiceError(
    lastError instanceof Error ? lastError.message : "Gemini Maps request failed.",
    getErrorStatus(lastError)
  );
}
