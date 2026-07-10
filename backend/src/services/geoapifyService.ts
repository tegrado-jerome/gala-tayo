import { getSecret } from "../config/keyVault";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import {
  buildGeoapifyAreaCacheKey,
  buildGeoapifyLookupCacheKey,
} from "../utils/cacheKey";
import {
  getJsonCacheValue,
  setJsonCacheValue,
} from "./redisCacheService";

const GEOAPIFY_GEOCODE_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_TIMEOUT_MS = 6_500;
const GEOAPIFY_CACHE_TABLE = "ask_ai_map_geoapify_cache";
const GEOAPIFY_REDIS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

type GeoapifyLogger = {
  log: (message: string) => void;
};

type GeoapifyLookupInput = {
  placeName: string;
  address?: string | null;
  city?: string | null;
  targetArea?: GeoapifyTargetAreaContext | null;
};

type GeoapifyCacheRow = {
  normalized_key: string;
  place_name: string | null;
  query: string | null;
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  geoapify_place_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GeoapifyFeature = {
  bbox?: unknown;
  properties?: {
    lat?: unknown;
    lon?: unknown;
    country?: unknown;
    country_code?: unknown;
    city?: unknown;
    county?: unknown;
    suburb?: unknown;
    district?: unknown;
    state?: unknown;
    state_district?: unknown;
    region?: unknown;
    formatted?: unknown;
    address_line1?: unknown;
    name?: unknown;
    place_id?: unknown;
  };
};

export type GeoapifyTargetAreaContext = {
  name: string;
  normalizedName: string;
  query: string;
  center: {
    lat: number;
    lng: number;
  };
  bbox?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  };
  city?: string;
  province?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  allowedRadiusKm: number;
};

export type GeoapifyVerifiedCoordinate = {
  lat: number;
  lng: number;
  formattedAddress?: string;
  geoapifyPlaceId?: string;
  normalizedKey: string;
  query: string;
  cacheHit: boolean;
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

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAreaOrCity(input: GeoapifyLookupInput): string {
  const explicitTargetArea = normalizeText(input.targetArea?.name);

  if (explicitTargetArea) {
    return explicitTargetArea;
  }

  const explicitCity = normalizeText(input.city);

  if (explicitCity) {
    return explicitCity;
  }

  const address = normalizeText(input.address);

  if (!address) {
    return "Philippines";
  }

  const parts = address
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== "philippines");

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }

  return parts[0] ?? "Philippines";
}

function ensurePhilippinesSuffix(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "Philippines";
  }

  if (/\bphilippines\b/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}, Philippines`;
}

function buildLookupQuery(input: GeoapifyLookupInput): { query: string; normalizedKey: string } {
  const placeName = normalizeText(input.placeName) ?? "Unknown place";
  const areaOrCity = ensurePhilippinesSuffix(buildAreaOrCity(input));
  const query = `${placeName}, ${areaOrCity}`;
  const normalizedKey = `${placeName}|${areaOrCity}`.trim().toLowerCase();

  return { query, normalizedKey };
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getMatchOverlapScore(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.92;
  }

  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length >= 2));

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

function getDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseFeatureBbox(
  bbox: unknown
): GeoapifyTargetAreaContext["bbox"] | undefined {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return undefined;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox.map((value) => Number(value));

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return undefined;
  }

  return {
    minLat: Math.min(minLat, maxLat),
    minLng: Math.min(minLng, maxLng),
    maxLat: Math.max(minLat, maxLat),
    maxLng: Math.max(minLng, maxLng),
  };
}

function isInsideBbox(
  lat: number,
  lng: number,
  bbox: GeoapifyTargetAreaContext["bbox"] | undefined
): boolean {
  if (!bbox) {
    return false;
  }

  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

function inferAllowedRadiusKm(args: {
  bbox?: GeoapifyTargetAreaContext["bbox"];
  city?: string;
  province?: string;
  region?: string;
}): number {
  if (args.bbox) {
    const diagonalKm = getDistanceKm(
      { lat: args.bbox.minLat, lng: args.bbox.minLng },
      { lat: args.bbox.maxLat, lng: args.bbox.maxLng }
    );
    return Math.min(Math.max(diagonalKm / 2 + 15, 12), 120);
  }

  if (args.region) {
    return 95;
  }

  if (args.province) {
    return 65;
  }

  if (args.city) {
    return 30;
  }

  return 45;
}

function collectAreaTexts(feature: GeoapifyFeature): string[] {
  const properties = feature.properties ?? {};
  return [
    normalizeText(properties.city),
    normalizeText(properties.county),
    normalizeText(properties.state_district),
    normalizeText(properties.state),
    normalizeText(properties.region),
    normalizeText(properties.formatted),
  ].filter((value): value is string => Boolean(value));
}

function matchesTargetAreaByAdmin(
  feature: GeoapifyFeature,
  targetArea: GeoapifyTargetAreaContext
): boolean {
  const featureTexts = collectAreaTexts(feature).map((value) => normalizeForMatch(value));
  const targetTerms = [
    targetArea.name,
    targetArea.city,
    targetArea.province,
    targetArea.region,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeForMatch(value));

  return targetTerms.some(
    (targetTerm) =>
      targetTerm &&
      featureTexts.some(
        (featureText) =>
          featureText === targetTerm ||
          featureText.includes(targetTerm) ||
          targetTerm.includes(featureText)
      )
  );
}

function matchesTargetAreaByLocation(
  lat: number,
  lng: number,
  targetArea: GeoapifyTargetAreaContext
): boolean {
  if (isInsideBbox(lat, lng, targetArea.bbox)) {
    return true;
  }

  return (
    getDistanceKm({ lat, lng }, targetArea.center) <= targetArea.allowedRadiusKm
  );
}

function pickBestGeoapifyMatch(
  features: GeoapifyFeature[],
  input: GeoapifyLookupInput
): Omit<GeoapifyVerifiedCoordinate, "normalizedKey" | "query" | "cacheHit"> | null {
  const targetName = normalizeForMatch(normalizeText(input.placeName));
  const targetAreaText = normalizeForMatch(buildAreaOrCity(input));

  let bestMatch:
    | (Omit<GeoapifyVerifiedCoordinate, "normalizedKey" | "query" | "cacheHit"> & {
        score: number;
      })
    | null = null;

  for (const feature of features) {
    const properties = feature.properties ?? {};
    const lat = Number(properties.lat);
    const lng = Number(properties.lon);

    if (!isValidCoordinate(lat, lng)) {
      continue;
    }

    const countryCode = normalizeForMatch(normalizeText(properties.country_code));
    const country = normalizeForMatch(normalizeText(properties.country));

    if (
      (countryCode && countryCode !== "ph") ||
      (country && country !== "philippines")
    ) {
      continue;
    }

    const resultName = normalizeForMatch(
      normalizeText(properties.name) ??
        normalizeText(properties.address_line1) ??
        normalizeText(properties.formatted)
    );
    const areaText = normalizeForMatch(
      [
        normalizeText(properties.suburb),
        normalizeText(properties.district),
        normalizeText(properties.city),
        normalizeText(properties.county),
        normalizeText(properties.state_district),
        normalizeText(properties.state),
        normalizeText(properties.formatted),
      ]
        .filter(Boolean)
        .join(" ")
    );

    const nameScore = getMatchOverlapScore(targetName, resultName);
    const areaScore = getMatchOverlapScore(targetAreaText, areaText);

    if (nameScore < 0.45 && areaScore < 0.45) {
      continue;
    }

    const hasReasonableNameMatch =
      nameScore >= 0.58 ||
      (nameScore >= 0.42 &&
        (resultName.includes(targetName) || targetName.includes(resultName)));

    if (!hasReasonableNameMatch) {
      continue;
    }

    if (input.targetArea) {
      const matchesAdmin = matchesTargetAreaByAdmin(feature, input.targetArea);
      const matchesLocation = matchesTargetAreaByLocation(lat, lng, input.targetArea);

      if (!matchesAdmin && !matchesLocation) {
        continue;
      }
    }

    const score = nameScore * 0.72 + areaScore * 0.28;

    if (
      score < 0.58 &&
      !(nameScore >= 0.78 && areaScore >= 0.2) &&
      !(nameScore >= 0.58 && areaScore >= 0.5)
    ) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        lat,
        lng,
        formattedAddress: normalizeText(properties.formatted) ?? undefined,
        geoapifyPlaceId: normalizeText(properties.place_id) ?? undefined,
        score,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    lat: bestMatch.lat,
    lng: bestMatch.lng,
    formattedAddress: bestMatch.formattedAddress,
    geoapifyPlaceId: bestMatch.geoapifyPlaceId,
  };
}

async function getGeoapifyApiKey(): Promise<string> {
  const envKey = process.env.GEOAPIFY_API_KEY?.trim();
  return envKey || (await getSecret("geoapify-api-key"));
}

async function readCachedTargetArea(
  cacheKey: string
): Promise<GeoapifyTargetAreaContext | null> {
  const cachedTargetArea = await getJsonCacheValue<GeoapifyTargetAreaContext>(cacheKey);

  return cachedTargetArea ?? null;
}

async function writeCachedTargetArea(
  cacheKey: string,
  targetArea: GeoapifyTargetAreaContext
): Promise<void> {
  await setJsonCacheValue(cacheKey, targetArea, {
    ttlSeconds: GEOAPIFY_REDIS_CACHE_TTL_SECONDS,
  });
}

async function readCachedVerifiedCoordinate(
  normalizedKey: string
): Promise<GeoapifyVerifiedCoordinate | null> {
  const cachedCoordinate = await getJsonCacheValue<GeoapifyVerifiedCoordinate>(
    buildGeoapifyLookupCacheKey(normalizedKey)
  );

  return cachedCoordinate ?? null;
}

async function writeCachedVerifiedCoordinate(
  payload: GeoapifyVerifiedCoordinate
): Promise<void> {
  await setJsonCacheValue(buildGeoapifyLookupCacheKey(payload.normalizedKey), payload, {
    ttlSeconds: GEOAPIFY_REDIS_CACHE_TTL_SECONDS,
  });
}

async function readCachedCoordinate(
  normalizedKey: string,
  logger?: GeoapifyLogger
): Promise<GeoapifyVerifiedCoordinate | null> {
  try {
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from(GEOAPIFY_CACHE_TABLE) as any)
      .select("normalized_key, place_name, query, lat, lng, formatted_address, geoapify_place_id")
      .eq("normalized_key", normalizedKey)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = data as GeoapifyCacheRow | null;

    if (!row || typeof row.lat !== "number" || typeof row.lng !== "number") {
      return null;
    }

    if (!isValidCoordinate(row.lat, row.lng)) {
      return null;
    }

    return {
      lat: row.lat,
      lng: row.lng,
      formattedAddress: row.formatted_address ?? undefined,
      geoapifyPlaceId: row.geoapify_place_id ?? undefined,
      normalizedKey,
      query: row.query ?? "",
      cacheHit: true,
    };
  } catch (error) {
    logger?.log(
      `[Ask AI Maps] Geoapify cache read skipped: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function writeCachedCoordinate(
  payload: GeoapifyVerifiedCoordinate & {
    placeName: string;
  },
  logger?: GeoapifyLogger
): Promise<void> {
  try {
    const supabase = await getSupabaseAdminClient();
    const now = new Date().toISOString();
    const row: GeoapifyCacheRow = {
      normalized_key: payload.normalizedKey,
      place_name: payload.placeName,
      query: payload.query,
      lat: payload.lat,
      lng: payload.lng,
      formatted_address: payload.formattedAddress ?? null,
      geoapify_place_id: payload.geoapifyPlaceId ?? null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await (supabase.from(GEOAPIFY_CACHE_TABLE) as any).upsert(row, {
      onConflict: "normalized_key",
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logger?.log(
      `[Ask AI Maps] Geoapify cache write skipped: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function fetchGeoapifyFeatures(
  query: string,
  apiKey: string,
  limit = 3
): Promise<GeoapifyFeature[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS);

  try {
    const url = new URL(GEOAPIFY_GEOCODE_ENDPOINT);
    url.searchParams.set("text", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geoapify geocoding failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { features?: GeoapifyFeature[] };
    return Array.isArray(payload.features) ? payload.features : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveTargetAreaWithGeoapify(
  targetAreaText: string,
  logger?: GeoapifyLogger
): Promise<GeoapifyTargetAreaContext | null> {
  const normalizedTargetAreaText = normalizeText(targetAreaText);

  if (!normalizedTargetAreaText) {
    return null;
  }

  const cacheKey = buildGeoapifyAreaCacheKey(normalizedTargetAreaText);
  const cachedTargetArea = await readCachedTargetArea(cacheKey);

  if (cachedTargetArea) {
    return cachedTargetArea;
  }

  const query = ensurePhilippinesSuffix(normalizedTargetAreaText);
  const apiKey = await getGeoapifyApiKey();
  const features = await fetchGeoapifyFeatures(query, apiKey, 1);
  const firstFeature = features[0];
  const properties = firstFeature?.properties ?? {};
  const lat = Number(properties.lat);
  const lng = Number(properties.lon);

  if (!firstFeature || !isValidCoordinate(lat, lng)) {
    logger?.log(`[Ask AI Maps] Geoapify could not resolve target area: ${query}`);
    return null;
  }

  const countryCode = normalizeForMatch(normalizeText(properties.country_code));
  const country = normalizeForMatch(normalizeText(properties.country));

  if (
    (countryCode && countryCode !== "ph") ||
    (country && country !== "philippines")
  ) {
    logger?.log(
      `[Ask AI Maps] Geoapify resolved target area outside the Philippines: ${query}`
    );
    return null;
  }

  const city = normalizeText(properties.city) ?? undefined;
  const province =
    normalizeText(properties.county) ??
    normalizeText(properties.state_district) ??
    undefined;
  const region = normalizeText(properties.state) ?? normalizeText(properties.region) ?? undefined;
  const bbox = parseFeatureBbox(firstFeature.bbox);
  const name = ensurePhilippinesSuffix(
    normalizeText(properties.formatted) ?? normalizedTargetAreaText
  );

  const resolvedTargetArea = {
    name,
    normalizedName: normalizeForMatch(name),
    query,
    center: {
      lat,
      lng,
    },
    ...(bbox ? { bbox } : {}),
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(region ? { region } : {}),
    ...(normalizeText(properties.country) ? { country: normalizeText(properties.country)! } : {}),
    ...(normalizeText(properties.country_code)
      ? { countryCode: normalizeText(properties.country_code)! }
      : {}),
    allowedRadiusKm: inferAllowedRadiusKm({
      bbox,
      city,
      province,
      region,
    }),
  };

  await writeCachedTargetArea(cacheKey, resolvedTargetArea);

  return resolvedTargetArea;
}

export async function verifyPlaceCoordinatesWithGeoapify(
  input: GeoapifyLookupInput,
  logger?: GeoapifyLogger
): Promise<GeoapifyVerifiedCoordinate | null> {
  const placeName = normalizeText(input.placeName);

  if (!placeName) {
    return null;
  }

  const { query, normalizedKey } = buildLookupQuery({
    ...input,
    placeName,
  });
  const cached = (await readCachedVerifiedCoordinate(normalizedKey)) ?? (await readCachedCoordinate(normalizedKey, logger));

  if (cached) {
    return cached;
  }

  const apiKey = await getGeoapifyApiKey();
  const features = await fetchGeoapifyFeatures(query, apiKey, 3);
  const match = pickBestGeoapifyMatch(features, input);

  if (!match) {
    return null;
  }

  const result: GeoapifyVerifiedCoordinate = {
    ...match,
    normalizedKey,
    query,
    cacheHit: false,
  };

  await writeCachedVerifiedCoordinate(result);
  await writeCachedCoordinate(
    {
      ...result,
      placeName,
    },
    logger
  );

  return result;
}
