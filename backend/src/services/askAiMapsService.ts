import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import {
  attachApprovedImagesToSearchResults,
  findSearchPlaces,
  type SearchPlaceResult,
} from "../functions/search";
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

export type AskAiMapPlacePhoto = {
  url: string;
  attributionHtml?: string;
  width?: number;
  height?: number;
};

export type AskAiMapPlaceHoursRow = {
  day: string;
  hours: string;
};

export type AskAiMapPlace = {
  id: string;
  placeId?: string;
  name: string;
  category?: string;
  rating?: number;
  googleMapsUrl: string;
  photos: AskAiMapPlacePhoto[];
  currentOpenStatus?: string;
  regularOpeningHours?: AskAiMapPlaceHoursRow[];
  address?: string;
  description?: string;
  lat?: number;
  lng?: number;
};

export type AskAiMapsSearchResult = {
  places: AskAiMapPlace[];
  modelUsed?: string;
  fallbackUsed: boolean;
  latencyMs: number;
  message?: string;
  servedFromCooldown?: boolean;
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

type GroundingMapMatch = {
  title: string | null;
  text: string | null;
  uri: string | null;
  placeId: string | null;
};

type AskAiMapsLogger = {
  log: (message: string) => void;
};

type GooglePlacePhoto = {
  name?: unknown;
  widthPx?: unknown;
  heightPx?: unknown;
  authorAttributions?: unknown;
};

type GooglePlaceDetailsResponse = {
  id?: unknown;
  displayName?: {
    text?: unknown;
  };
  googleMapsUri?: unknown;
  formattedAddress?: unknown;
  location?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  rating?: unknown;
  primaryTypeDisplayName?: {
    text?: unknown;
  };
  regularOpeningHours?: {
    weekdayDescriptions?: unknown;
  };
  currentOpeningHours?: {
    openNow?: unknown;
    nextOpenTime?: unknown;
    nextCloseTime?: unknown;
    weekdayDescriptions?: unknown;
  };
  photos?: unknown;
  editorialSummary?: {
    text?: unknown;
  };
};

type EnrichmentCandidate = {
  name: string;
  address: string | null;
  category: string | null;
  rating: number | null;
  openStatus: "Open" | "Closed" | "Unknown";
  budget: string | null;
  aiReason: string | null;
  googleMapsUrl: string | null;
  groundingMatch?: GroundingMapMatch;
};

const ASK_AI_MAPS_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
];

const RETRYABLE_AI_STATUSES = new Set([429, 500, 503, 504]);
const ASK_AI_MAPS_FALLBACK_DELAY_MS = 650;
const ASK_AI_MAPS_PROVIDER_COOLDOWN_MS = 60_000;
const ASK_AI_MAPS_FALLBACK_MESSAGE =
  "Ask AI Maps is busy right now, so we showed regular GalaTayo search results instead.";
const ASK_AI_MAPS_NO_GROUNDED_RESULTS_MESSAGE =
  "We could not lock onto map-grounded matches for that search, so we showed regular GalaTayo places instead.";
const GOOGLE_PLACE_PHOTO_LIMIT = 5;
const GOOGLE_PLACE_RESULT_LIMIT = 8;
const PHILIPPINES_TIME_ZONE = "Asia/Manila";

const METRO_MANILA_CENTER = {
  latitude: 14.5995,
  longitude: 120.9842,
};

let askAiMapsCooldownUntil = 0;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderStatus(status: number): boolean {
  return RETRYABLE_AI_STATUSES.has(status);
}

function isNoGroundedResultsError(error: unknown) {
  return (
    error instanceof AskAiMapsServiceError &&
    error.status === 404 &&
    error.message === "No grounded map results were available."
  );
}

function isAskAiMapsCoolingDown() {
  return Date.now() < askAiMapsCooldownUntil;
}

function startAskAiMapsCooldown(ms: number) {
  askAiMapsCooldownUntil = Date.now() + ms;
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

function normalizeOptionalInteger(value: unknown): number | undefined {
  const numberValue = normalizeOptionalNumber(value);
  return typeof numberValue === "number" ? Math.round(numberValue) : undefined;
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

function sanitizePlainText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function buildMapsPlainTextPrompt({
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

Use the Google Maps grounding tool to find real places inside Metro Manila, Philippines.
Do not invent places or unsupported facts.
If a field is unavailable, write "Unknown".
Keep the reason short and natural in Taglish.
Prioritize nearby places when near me is enabled.
Prioritize currently open places when open now is enabled.
Return 5 to 8 places.

Format each result exactly like this:
PLACE: <name>
CATEGORY: <category or Unknown>
RATING: <rating or Unknown>
OPEN: <Open / Closed / Unknown>
BUDGET: <budget or Unknown>
ADDRESS: <address or Unknown>
WHY: <one short Taglish sentence>

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

function getGroundingMapsByName(
  groundingMetadata: GroundingMetadataLike | undefined
) {
  const mapEntries = new Map<string, GroundingMapMatch>();

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

function parsePlainTextPlaces(text: string): ParsedModelResponse {
  const normalizedText = sanitizePlainText(text);

  if (!normalizedText) {
    return { places: [] };
  }

  const blocks = normalizedText
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const places = blocks.flatMap((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const record = new Map<string, string>();

    for (const line of lines) {
      const match = line.match(/^([A-Z]+):\s*(.+)$/);

      if (!match) {
        continue;
      }

      record.set(match[1], match[2].trim());
    }

    const name = record.get("PLACE");

    if (!name) {
      return [];
    }

    return [
      {
        name,
        category: record.get("CATEGORY") ?? null,
        rating: record.get("RATING") ?? null,
        openStatus: record.get("OPEN") ?? null,
        budget: record.get("BUDGET") ?? null,
        address: record.get("ADDRESS") ?? null,
        aiReason: record.get("WHY") ?? null,
      },
    ];
  });

  return { places };
}

function getCurrentPhilippinesDayName() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: PHILIPPINES_TIME_ZONE,
  }).format(new Date());
}

function formatGoogleTime(dateTime: string | null) {
  if (!dateTime) {
    return null;
  }

  const parsedDate = new Date(dateTime);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIME_ZONE,
  }).format(parsedDate);
}

function parseWeekdayDescriptions(value: unknown): AskAiMapPlaceHoursRow[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rows = value
    .flatMap((entry) => {
      const line = normalizeText(entry);

      if (!line) {
        return [];
      }

      const [dayPart, ...hoursParts] = line.split(":");
      const day = normalizeText(dayPart);
      const hours = normalizeText(hoursParts.join(":"));

      if (!day || !hours) {
        return [];
      }

      return [
        {
          day,
          hours,
        },
      ];
    })
    .slice(0, 7);

  return rows.length > 0 ? rows : undefined;
}

function getTodayHours(
  regularOpeningHours?: AskAiMapPlaceHoursRow[],
  currentWeekdayDescriptions?: AskAiMapPlaceHoursRow[]
) {
  const today = getCurrentPhilippinesDayName();
  const rows = currentWeekdayDescriptions ?? regularOpeningHours ?? [];
  return rows.find((row) => normalizePlaceKey(row.day) === normalizePlaceKey(today));
}

function buildCurrentOpenStatus(details: GooglePlaceDetailsResponse): string | undefined {
  const currentHours =
    details.currentOpeningHours && typeof details.currentOpeningHours === "object"
      ? details.currentOpeningHours
      : null;
  const regularHours = parseWeekdayDescriptions(
    details.regularOpeningHours?.weekdayDescriptions
  );
  const currentWeekdayDescriptions = parseWeekdayDescriptions(
    currentHours?.weekdayDescriptions
  );
  const todayHours = getTodayHours(regularHours, currentWeekdayDescriptions);
  const openNow = currentHours?.openNow === true;

  if (openNow) {
    const closeTime = formatGoogleTime(normalizeText(currentHours?.nextCloseTime));

    if (closeTime) {
      return `Open until ${closeTime}`;
    }

    if (todayHours?.hours) {
      return `Open today · ${todayHours.hours}`;
    }

    return "Open now";
  }

  if (currentHours?.openNow === false) {
    const openTime = formatGoogleTime(normalizeText(currentHours?.nextOpenTime));

    if (openTime) {
      return `Opens at ${openTime}`;
    }

    return "Closed";
  }

  if (todayHours?.hours) {
    return todayHours.hours.toLowerCase() === "closed" ? "Closed" : todayHours.hours;
  }

  return undefined;
}

function getPhotoAttributionHtml(photo: GooglePlacePhoto): string | undefined {
  if (!Array.isArray(photo.authorAttributions)) {
    return undefined;
  }

  const links = photo.authorAttributions
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const author = entry as { displayName?: unknown; uri?: unknown };
      const label = normalizeText(author.displayName);
      const uri = normalizeText(author.uri);

      if (!label) {
        return [];
      }

      if (uri) {
        return [`<a href="${uri}" target="_blank" rel="noreferrer">${label}</a>`];
      }

      return [label];
    })
    .filter(Boolean);

  return links.length > 0 ? links.join(" · ") : undefined;
}

function buildGooglePhotoUrl(photoName: string, apiKey: string) {
  const encodedPhotoName = photoName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://places.googleapis.com/v1/${encodedPhotoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${encodeURIComponent(
    apiKey
  )}`;
}

function normalizePlacePhotos(photos: unknown, apiKey: string): AskAiMapPlacePhoto[] {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const photo = entry as GooglePlacePhoto;
      const photoName = normalizeText(photo.name);

      if (!photoName) {
        return [];
      }

      return [
        {
          url: buildGooglePhotoUrl(photoName, apiKey),
          attributionHtml: getPhotoAttributionHtml(photo),
          width: normalizeOptionalInteger(photo.widthPx),
          height: normalizeOptionalInteger(photo.heightPx),
        },
      ];
    })
    .slice(0, GOOGLE_PLACE_PHOTO_LIMIT);
}

function getDescriptionPhraseForCategory(category: string | null) {
  const normalizedCategory = normalizePlaceKey(category || "");

  if (normalizedCategory.includes("mall") || normalizedCategory.includes("shopping")) {
    return "It works well for indoor gala plans, shopping breaks, and casual food stops.";
  }

  if (normalizedCategory.includes("museum")) {
    return "It is a strong pick for slow walking, exhibits, and learning-focused hangouts.";
  }

  if (normalizedCategory.includes("cafe")) {
    return "It suits coffee dates, chill catch-ups, and low-pressure tambay time.";
  }

  if (
    normalizedCategory.includes("restaurant") ||
    normalizedCategory.includes("food") ||
    normalizedCategory.includes("dining")
  ) {
    return "It is best when your plan revolves around food, conversation, and a relaxed meal stop.";
  }

  if (normalizedCategory.includes("park") || normalizedCategory.includes("garden")) {
    return "It fits easy walks, fresh-air plans, and slower outdoor hangouts.";
  }

  return "It can work well for casual gala plans depending on the vibe you want.";
}

function getIndoorOutdoorSentence(category: string | null) {
  const normalizedCategory = normalizePlaceKey(category || "");

  if (
    normalizedCategory.includes("mall") ||
    normalizedCategory.includes("museum") ||
    normalizedCategory.includes("cafe") ||
    normalizedCategory.includes("restaurant")
  ) {
    return "Most of the experience is typically indoors, so it can still work when the weather is hot or rainy.";
  }

  if (normalizedCategory.includes("park") || normalizedCategory.includes("garden")) {
    return "This kind of stop is usually better when the weather is clear because much of the experience is outdoors.";
  }

  return "The experience can vary by time of day, so it helps to check the map listing before heading out.";
}

function buildPlaceDescription({
  name,
  category,
  address,
  currentOpenStatus,
  editorialSummary,
  aiReason,
}: {
  name: string;
  category: string | null;
  address: string | null;
  currentOpenStatus?: string;
  editorialSummary?: string | null;
  aiReason?: string | null;
}) {
  const sentences: string[] = [];
  const normalizedSummary = normalizeText(editorialSummary);
  const normalizedReason = normalizeText(aiReason);
  const normalizedAddress = normalizeText(address);
  const categoryLabel = normalizeText(category) ?? "place";

  if (normalizedSummary) {
    sentences.push(normalizedSummary.replace(/\.+$/, "."));
  } else {
    sentences.push(`${name} is a ${categoryLabel.toLowerCase()} option in Metro Manila.`);
  }

  sentences.push(getDescriptionPhraseForCategory(category));

  if (normalizedReason) {
    sentences.push(
      `It stands out for GalaTayo users because ${normalizedReason.charAt(0).toLowerCase()}${normalizedReason.slice(
        1
      ).replace(/\.+$/, "")}.`
    );
  } else {
    sentences.push("It is a practical stop when you want a grounded place that is easy to continue from on the map.");
  }

  if (normalizedAddress) {
    sentences.push(`You can find it around ${normalizedAddress}.`);
  }

  if (currentOpenStatus) {
    sentences.push(`Current hours show ${currentOpenStatus.toLowerCase()}.`);
  }

  sentences.push(getIndoorOutdoorSentence(category));
  sentences.push("It is also useful as a map anchor if you want to keep the rest of your gala nearby.");

  const uniqueSentences: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const normalizedSentence = normalizePlaceKey(sentence);

    if (!normalizedSentence || seen.has(normalizedSentence)) {
      continue;
    }

    seen.add(normalizedSentence);
    uniqueSentences.push(sentence.replace(/\s+/g, " ").trim());
  }

  return uniqueSentences.slice(0, 6).join(" ");
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

async function fetchGooglePlaceDetailsById(
  placeId: string,
  apiKey: string
): Promise<GooglePlaceDetailsResponse | null> {
  const normalizedPlaceId = normalizeText(placeId);

  if (!normalizedPlaceId) {
    return null;
  }

  const resourceName = normalizedPlaceId.startsWith("places/")
    ? normalizedPlaceId
    : `places/${normalizedPlaceId}`;
  const url = new URL(`https://places.googleapis.com/v1/${resourceName}`);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,googleMapsUri,formattedAddress,location,rating,primaryTypeDisplayName,regularOpeningHours,currentOpeningHours,photos,editorialSummary",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GooglePlaceDetailsResponse;
}

async function searchGooglePlaceDetailsByText(
  candidate: EnrichmentCandidate,
  apiKey: string
): Promise<GooglePlaceDetailsResponse | null> {
  const query = [candidate.name, candidate.address, "Metro Manila", "Philippines"]
    .filter(Boolean)
    .join(", ");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.googleMapsUri,places.formattedAddress,places.location,places.rating,places.primaryTypeDisplayName,places.regularOpeningHours,places.currentOpeningHours,places.photos,places.editorialSummary",
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 1,
      regionCode: "PH",
      languageCode: "en",
      locationBias: {
        circle: {
          center: {
            latitude: METRO_MANILA_CENTER.latitude,
            longitude: METRO_MANILA_CENTER.longitude,
          },
          radius: 35000,
        },
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { places?: GooglePlaceDetailsResponse[] };
  return Array.isArray(body.places) ? body.places[0] ?? null : null;
}

async function enrichCandidatePlace(
  candidate: EnrichmentCandidate,
  fallbackIndex: number,
  apiKey: string
): Promise<AskAiMapPlace | null> {
  const details =
    (candidate.groundingMatch?.placeId
      ? await fetchGooglePlaceDetailsById(candidate.groundingMatch.placeId, apiKey)
      : null) ?? (await searchGooglePlaceDetailsByText(candidate, apiKey));

  if (!details) {
    return null;
  }

  const googleMapsUrl =
    normalizeText(details.googleMapsUri) ??
    candidate.googleMapsUrl ??
    candidate.groundingMatch?.uri ??
    null;
  const photos = normalizePlacePhotos(details.photos, apiKey);
  const lat = normalizeOptionalNumber(details.location?.latitude);
  const lng = normalizeOptionalNumber(details.location?.longitude);

  if (!googleMapsUrl || photos.length === 0 || lat === null || lng === null) {
    return null;
  }

  const regularOpeningHours = parseWeekdayDescriptions(
    details.regularOpeningHours?.weekdayDescriptions
  );
  const currentOpenStatus = buildCurrentOpenStatus(details);
  const category =
    normalizeText(details.primaryTypeDisplayName?.text) ?? candidate.category ?? undefined;
  const address = normalizeText(details.formattedAddress) ?? candidate.address ?? undefined;
  const rating = normalizeOptionalNumber(details.rating) ?? candidate.rating ?? undefined;
  const description = buildPlaceDescription({
    name: normalizeText(details.displayName?.text) ?? candidate.name,
    category: category ?? null,
    address: address ?? null,
    currentOpenStatus,
    editorialSummary: normalizeText(details.editorialSummary?.text),
    aiReason: candidate.aiReason,
  });
  const placeId = normalizeText(details.id) ?? candidate.groundingMatch?.placeId ?? undefined;
  const name = normalizeText(details.displayName?.text) ?? candidate.name;

  return {
    id: toPlaceId(placeId || googleMapsUrl || name, fallbackIndex),
    placeId: placeId ?? undefined,
    name,
    ...(category ? { category } : {}),
    ...(typeof rating === "number" ? { rating } : {}),
    googleMapsUrl,
    photos,
    ...(currentOpenStatus ? { currentOpenStatus } : {}),
    ...(regularOpeningHours ? { regularOpeningHours } : {}),
    ...(address ? { address } : {}),
    ...(description ? { description } : {}),
    lat,
    lng,
  };
}

async function normalizePlaces({
  parsed,
  groundingMetadata,
  userLocation,
  apiKey,
}: {
  parsed: ParsedModelResponse;
  groundingMetadata?: GroundingMetadataLike;
  userLocation?: { latitude: number; longitude: number } | null;
  apiKey: string;
}): Promise<AskAiMapPlace[]> {
  const groundingMapsByName = getGroundingMapsByName(groundingMetadata);
  const rawPlaces = Array.isArray(parsed.places) ? parsed.places : [];
  const seenRawKeys = new Set<string>();
  const candidates: EnrichmentCandidate[] = [];

  for (const rawPlace of rawPlaces) {
    const name = normalizeText(rawPlace?.name);

    if (!name) {
      continue;
    }

    const groundingMatch = groundingMapsByName.get(normalizePlaceKey(name));
    const address = normalizeText(rawPlace?.address) ?? groundingMatch?.text ?? null;
    const googleMapsUrl = normalizeText(rawPlace?.googleMapsUrl) ?? groundingMatch?.uri ?? null;
    const rawKey = normalizePlaceKey(
      groundingMatch?.placeId || googleMapsUrl || `${name} ${address || ""}`
    );

    if (!rawKey || seenRawKeys.has(rawKey)) {
      continue;
    }

    seenRawKeys.add(rawKey);
    candidates.push({
      name,
      address,
      category: normalizeText(rawPlace?.category),
      rating: normalizeOptionalNumber(rawPlace?.rating),
      openStatus: normalizeOpenStatus(rawPlace?.openStatus),
      budget: normalizeText(rawPlace?.budget),
      aiReason:
        normalizeText(rawPlace?.aiReason) ??
        normalizeText(groundingMatch?.text) ??
        "Mukhang swak ito sa vibe ng hanap mo.",
      googleMapsUrl,
      groundingMatch,
    });
  }

  const enrichedPlaces = (
    await Promise.all(
      candidates.map((candidate, index) => enrichCandidatePlace(candidate, index, apiKey))
    )
  ).filter((place): place is AskAiMapPlace => place !== null);

  const seenPlaceKeys = new Set<string>();
  const deduplicatedPlaces = enrichedPlaces.filter((place) => {
    const key = normalizePlaceKey(place.googleMapsUrl || `${place.name} ${place.address || ""}`);

    if (!key || seenPlaceKeys.has(key)) {
      return false;
    }

    seenPlaceKeys.add(key);
    return true;
  });

  if (userLocation) {
    deduplicatedPlaces.sort((leftPlace, rightPlace) => {
      const leftDistance = calculateDistanceKm(userLocation, {
        latitude: leftPlace.lat ?? METRO_MANILA_CENTER.latitude,
        longitude: leftPlace.lng ?? METRO_MANILA_CENTER.longitude,
      });
      const rightDistance = calculateDistanceKm(userLocation, {
        latitude: rightPlace.lat ?? METRO_MANILA_CENTER.latitude,
        longitude: rightPlace.lng ?? METRO_MANILA_CENTER.longitude,
      });

      return leftDistance - rightDistance;
    });
  }

  return deduplicatedPlaces.slice(0, GOOGLE_PLACE_RESULT_LIMIT);
}

async function generateMapsResponse({
  ai,
  model,
  prompt,
  userLocation,
  apiKey,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
  userLocation?: { latitude: number; longitude: number } | null;
  apiKey: string;
}): Promise<AskAiMapPlace[]> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.35,
      maxOutputTokens: 2200,
      tools: [{ googleMaps: {} }],
    },
  });

  const parsed = parsePlainTextPlaces(response.text ?? "");
  const places = await normalizePlaces({
    parsed,
    groundingMetadata:
      response.candidates?.[0]?.groundingMetadata as
        | GroundingMetadataLike
        | undefined,
    userLocation,
    apiKey,
  });

  if (places.length === 0) {
    throw new AskAiMapsServiceError("No grounded map results were available.", 404);
  }

  return places;
}

function mapSearchResultToAskAiMapPlace(
  place: SearchPlaceResult,
  fallbackIndex: number
): AskAiMapPlace | null {
  if (
    !place.id ||
    !place.name ||
    !place.google_maps_url ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return null;
  }

  const firstPhoto =
    place.imageUrl?.trim() ||
    place.thumbnailUrl?.trim() ||
    place.curatedImageUrls[0]?.trim() ||
    null;

  if (!firstPhoto) {
    return null;
  }

  const description = buildPlaceDescription({
    name: place.name,
    category: place.category,
    address: place.address,
    currentOpenStatus: undefined,
    editorialSummary: place.description,
    aiReason:
      place.reason?.trim() ||
      place.description?.trim() ||
      `Manual GalaTayo match #${fallbackIndex + 1} for your map search.`,
  });

  return {
    id: place.id,
    name: place.name,
    ...(place.category ? { category: place.category } : {}),
    googleMapsUrl: place.google_maps_url,
    photos: [
      {
        url: firstPhoto,
      },
    ],
    ...(place.address ? { address: place.address } : {}),
    ...(description ? { description } : {}),
    lat: place.latitude as number,
    lng: place.longitude as number,
  };
}

async function buildFallbackSearchResults({
  query,
}: {
  query: string;
}): Promise<AskAiMapPlace[]> {
  const normalizedQuery = normalizeSearchText(query);
  const places = await findSearchPlaces({
    normalizedQuery,
    categoryIds: [],
    areaIds: [],
    goodForIds: [],
    budget: "any",
    selectedIndoorOutdoor: null,
    selectedWeatherFit: null,
    requirePromptMatch: false,
    nearbySearch: null,
    prioritizeTrending: false,
  });
  const placesWithImages = await attachApprovedImagesToSearchResults(
    places.slice(0, GOOGLE_PLACE_RESULT_LIMIT)
  );
  const seenKeys = new Set<string>();

  return placesWithImages
    .map((place, index) => mapSearchResultToAskAiMapPlace(place, index))
    .filter((place): place is AskAiMapPlace => {
      if (!place) {
        return false;
      }

      const key = normalizePlaceKey(place.googleMapsUrl || `${place.name} ${place.address || ""}`);

      if (!key || seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
}

async function buildFallbackResult({
  query,
  startedAt,
  servedFromCooldown,
  message,
}: {
  query: string;
  startedAt: number;
  servedFromCooldown: boolean;
  message?: string;
}): Promise<AskAiMapsSearchResult> {
  const places = await buildFallbackSearchResults({ query });

  return {
    places,
    fallbackUsed: true,
    latencyMs: Date.now() - startedAt,
    message: message ?? ASK_AI_MAPS_FALLBACK_MESSAGE,
    servedFromCooldown,
  };
}

export async function searchAskAiMaps(
  params: AskAiMapsSearchParams,
  logger?: AskAiMapsLogger
): Promise<AskAiMapsSearchResult> {
  const startedAt = Date.now();

  if (isAskAiMapsCoolingDown()) {
    logger?.log("[Ask AI Maps] Cooldown active. Returning fallback response.");
    return buildFallbackResult({
      query: params.query,
      startedAt,
      servedFromCooldown: true,
    });
  }

  const apiKey = await getGoogleApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildMapsPlainTextPrompt(params);
  let sawRetryableProviderFailure = false;
  let lastRetryableError: unknown = null;

  for (const [index, model] of ASK_AI_MAPS_MODELS.entries()) {
    const isFallbackModel = index > 0;
    logger?.log(
      `[Ask AI Maps] ${isFallbackModel ? "Trying fallback model" : "Trying model"}: ${model}`
    );

    try {
      const places = await generateMapsResponse({
        ai,
        model,
        prompt,
        userLocation: params.userLocation ?? METRO_MANILA_CENTER,
        apiKey,
      });

      logger?.log(`[Ask AI Maps] Success with model: ${model}`);

      return {
        places,
        modelUsed: model,
        fallbackUsed: isFallbackModel,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const status = getErrorStatus(error);
      logger?.log(`[Ask AI Maps] Failed model: ${model} { status: ${status} }`);

      if (isNoGroundedResultsError(error)) {
        logger?.log(
          `[Ask AI Maps] No grounded places survived normalization for model ${model}. Returning fallback search results.`
        );
        return buildFallbackResult({
          query: params.query,
          startedAt,
          servedFromCooldown: false,
          message: ASK_AI_MAPS_NO_GROUNDED_RESULTS_MESSAGE,
        });
      }

      if (!isRetryableProviderStatus(status)) {
        throw new AskAiMapsServiceError(
          error instanceof Error ? error.message : "Gemini Maps request failed.",
          status
        );
      }

      sawRetryableProviderFailure = true;
      lastRetryableError = error;

      if (index < ASK_AI_MAPS_MODELS.length - 1) {
        await sleep(ASK_AI_MAPS_FALLBACK_DELAY_MS);
      }
    }
  }

  if (sawRetryableProviderFailure) {
    startAskAiMapsCooldown(ASK_AI_MAPS_PROVIDER_COOLDOWN_MS);
    logger?.log(
      `[Ask AI Maps] All models failed. Starting cooldown for ${ASK_AI_MAPS_PROVIDER_COOLDOWN_MS}ms.`
    );
    return buildFallbackResult({
      query: params.query,
      startedAt,
      servedFromCooldown: false,
    });
  }

  throw new AskAiMapsServiceError(
    lastRetryableError instanceof Error
      ? lastRetryableError.message
      : "Gemini Maps request failed.",
    getErrorStatus(lastRetryableError)
  );
}
