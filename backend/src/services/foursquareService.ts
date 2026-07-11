import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";

const FOURSQUARE_BASE_URL = "https://places-api.foursquare.com";
const FOURSQUARE_API_KEY_SECRET_NAME = KEY_VAULT_SECRET_NAMES.FOURSQUARE_API_KEY;
const FOURSQUARE_PLACES_API_VERSION = "2025-06-17";
const FOURSQUARE_SEARCH_FIELDS =
  "fsq_place_id,name,location,categories,distance,latitude,longitude";
const FOURSQUARE_PLACE_FIELDS =
  "fsq_place_id,name,location,categories,latitude,longitude";
const DEFAULT_PHOTO_SIZE = "600x400";

export class FoursquareServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "FoursquareServiceError";
    this.status = status;
  }
}

export type FoursquareSearchParams = {
  query: string;
  ll: string;
  limit?: number;
};

export type NormalizedFoursquarePlace = {
  fsq_id: string;
  name: string;
  location: unknown;
  categories: unknown[];
  distance: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type FoursquarePhoto = {
  id: string;
  prefix: string;
  suffix: string;
  width: number | null;
  height: number | null;
  url: string;
};

export type DownloadedPhoto = {
  buffer: Buffer;
  contentType: string;
  byteLength: number;
};

type FoursquarePlace = {
  fsq_place_id?: string;
  name?: string;
  location?: unknown;
  categories?: unknown[];
  distance?: number;
  latitude?: number;
  longitude?: number;
};

type FoursquareSearchResponse = {
  results?: FoursquarePlace[];
};

type FoursquarePhotoResponseItem = {
  id?: string;
  prefix?: string;
  suffix?: string;
  width?: number;
  height?: number;
};

type FoursquarePhotosResponse =
  | FoursquarePhotoResponseItem[]
  | {
      photos?: FoursquarePhotoResponseItem[];
    };

async function getFoursquareApiKey(): Promise<string> {
  try {
    return await getSecret(FOURSQUARE_API_KEY_SECRET_NAME);
  } catch (error) {
    throw new FoursquareServiceError(
      error instanceof Error
        ? error.message
        : "Failed to retrieve Foursquare API key.",
      500
    );
  }
}

function toSafeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 10;
  const rounded = Math.floor(limit);
  if (rounded <= 0) return 10;
  return Math.min(rounded, 50);
}

function normalizePlace(place: FoursquarePlace): NormalizedFoursquarePlace {
  return {
    fsq_id: place.fsq_place_id ?? "",
    name: place.name ?? "",
    location: place.location ?? {},
    categories: Array.isArray(place.categories) ? place.categories : [],
    distance: typeof place.distance === "number" ? place.distance : null,
    latitude: typeof place.latitude === "number" ? place.latitude : null,
    longitude: typeof place.longitude === "number" ? place.longitude : null,
  };
}

function buildFoursquarePhotoUrl(
  photo: Pick<FoursquarePhotoResponseItem, "prefix" | "suffix">,
  size = DEFAULT_PHOTO_SIZE
): string | null {
  if (!photo.prefix || !photo.suffix) {
    return null;
  }

  return `${photo.prefix}${size}${photo.suffix}`;
}

function normalizePhoto(photo: FoursquarePhotoResponseItem): FoursquarePhoto | null {
  const url = buildFoursquarePhotoUrl(photo);

  if (!url) {
    return null;
  }

  return {
    id: photo.id ?? "",
    prefix: photo.prefix ?? "",
    suffix: photo.suffix ?? "",
    width: typeof photo.width === "number" ? photo.width : null,
    height: typeof photo.height === "number" ? photo.height : null,
    url,
  };
}

export async function searchFoursquarePlaces({
  query,
  ll,
  limit,
}: FoursquareSearchParams): Promise<NormalizedFoursquarePlace[]> {
  const apiKey = await getFoursquareApiKey();

  if (!apiKey) {
    throw new FoursquareServiceError("Foursquare API key is missing.", 500);
  }

  const url = new URL(`${FOURSQUARE_BASE_URL}/places/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("ll", ll);
  url.searchParams.set("limit", String(toSafeLimit(limit)));
  url.searchParams.set("fields", FOURSQUARE_SEARCH_FIELDS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION,
      },
    });
  } catch (error) {
    throw new FoursquareServiceError(
      error instanceof Error ? error.message : "Foursquare request failed.",
      502
    );
  }

  if (!response.ok) {
    // Avoid echoing sensitive data. Keep message generic but useful.
    throw new FoursquareServiceError(
      `Foursquare request failed with status ${response.status}.`,
      502
    );
  }

  let data: FoursquareSearchResponse;
  try {
    data = (await response.json()) as FoursquareSearchResponse;
  } catch {
    throw new FoursquareServiceError("Failed to parse Foursquare response.", 502);
  }

  const results = Array.isArray(data.results) ? data.results : [];
  return results.map(normalizePlace);
}

export async function getFoursquarePlaceById(
  foursquareId: string
): Promise<NormalizedFoursquarePlace> {
  const apiKey = await getFoursquareApiKey();
  const trimmedId = foursquareId.trim();

  if (!apiKey) {
    throw new FoursquareServiceError("Foursquare API key is missing.", 500);
  }

  if (!trimmedId) {
    throw new FoursquareServiceError("Foursquare place ID is required.", 400);
  }

  const url = new URL(
    `${FOURSQUARE_BASE_URL}/places/${encodeURIComponent(trimmedId)}`
  );
  url.searchParams.set("fields", FOURSQUARE_PLACE_FIELDS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION,
      },
    });
  } catch (error) {
    throw new FoursquareServiceError(
      error instanceof Error ? error.message : "Foursquare request failed.",
      502
    );
  }

  if (!response.ok) {
    throw new FoursquareServiceError(
      `Foursquare request failed with status ${response.status}.`,
      response.status === 404 ? 404 : 502
    );
  }

  let data: FoursquarePlace;
  try {
    data = (await response.json()) as FoursquarePlace;
  } catch {
    throw new FoursquareServiceError("Failed to parse Foursquare response.", 502);
  }

  return normalizePlace(data);
}

export async function getFoursquarePlacePhotos(
  foursquareId: string
): Promise<FoursquarePhoto[]> {
  const apiKey = await getFoursquareApiKey();
  const trimmedId = foursquareId.trim();

  if (!apiKey) {
    throw new FoursquareServiceError("Foursquare API key is missing.", 500);
  }

  if (!trimmedId) {
    throw new FoursquareServiceError("Foursquare place ID is required.", 400);
  }

  const url = new URL(
    `${FOURSQUARE_BASE_URL}/places/${encodeURIComponent(trimmedId)}/photos`
  );

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION,
      },
    });
  } catch (error) {
    throw new FoursquareServiceError(
      error instanceof Error ? error.message : "Foursquare request failed.",
      502
    );
  }

  if (!response.ok) {
    throw new FoursquareServiceError(
      `Foursquare photos request failed with status ${response.status}.`,
      response.status === 404 ? 404 : 502
    );
  }

  let data: FoursquarePhotosResponse;
  try {
    data = (await response.json()) as FoursquarePhotosResponse;
  } catch {
    throw new FoursquareServiceError(
      "Failed to parse Foursquare photos response.",
      502
    );
  }

  const photos = Array.isArray(data)
    ? data
    : Array.isArray(data.photos)
      ? data.photos
      : [];

  return photos
    .map(normalizePhoto)
    .filter((photo): photo is FoursquarePhoto => photo !== null);
}

export async function downloadPhoto(photoUrl: string): Promise<DownloadedPhoto> {
  const trimmedUrl = photoUrl.trim();

  if (!trimmedUrl) {
    throw new FoursquareServiceError("Photo URL is required.", 400);
  }

  let response: Response;
  try {
    response = await fetch(trimmedUrl, {
      method: "GET",
      headers: {
        Accept: "image/*",
      },
    });
  } catch (error) {
    throw new FoursquareServiceError(
      error instanceof Error ? error.message : "Photo download failed.",
      502
    );
  }

  if (!response.ok) {
    throw new FoursquareServiceError(
      `Photo download failed with status ${response.status}.`,
      502
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new FoursquareServiceError(
      "Downloaded photo response was not an image.",
      502
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    contentType,
    byteLength: buffer.byteLength,
  };
}
