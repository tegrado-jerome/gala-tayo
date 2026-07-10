const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
require("dotenv").config();

const BACKEND_ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BACKEND_ROOT, "reports");
const SQL_REPORT_PATH = path.join(REPORT_DIR, "coordinate-updates.sql");
const LOG_REPORT_PATH = path.join(REPORT_DIR, "coordinate-fix-log.json");
const SEED_CITIES_DIR = path.join(BACKEND_ROOT, "seed-data", "cities");
const GEOAPIFY_ENDPOINT = "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_TIMEOUT_MS = 25000;
const GEOAPIFY_MAX_ATTEMPTS = 3;
const GEOAPIFY_BACKOFF_MS = [1000, 2000, 4000];
const PLACE_DELAY_MS = 400;

function loadLocalEnv() {
  const settingsPath = path.resolve(__dirname, "../local.settings.json");

  if (!fs.existsSync(settingsPath)) {
    return;
  }

  const raw = fs.readFileSync(settingsPath, "utf8");
  const parsed = JSON.parse(raw);
  const values = parsed.Values || {};

  for (const key of Object.keys(values)) {
    if (process.env[key] === undefined && values[key] !== undefined) {
      process.env[key] = values[key];
    }
  }
}

function parseArgs(argv) {
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    }
  }

  return { help };
}

function printHelp() {
  console.log("Usage: tsx scripts/fixPlaceCoordinates.cjs");
  console.log("");
  console.log("Generates:");
  console.log("  - backend/reports/coordinate-updates.sql");
  console.log("  - backend/reports/coordinate-fix-log.json");
  console.log("");
  console.log("This script does not update Supabase directly.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeForMatch(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlapScore(left, right) {
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

function isValidCoordinate(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function buildQuery(place, useFallback) {
  const parts = useFallback
    ? [place.name, place.city, "Metro Manila", "Philippines"]
    : [place.name, place.address, place.city, "Metro Manila", "Philippines"];

  return parts.map(normalizeText).filter(Boolean).join(", ");
}

function getFeatureSummary(feature) {
  const properties = feature && feature.properties ? feature.properties : {};
  return {
    name: normalizeText(properties.name) ?? normalizeText(properties.address_line1) ?? normalizeText(properties.formatted),
    formatted: normalizeText(properties.formatted),
    place_id: normalizeText(properties.place_id),
    lat: Number(properties.lat),
    lng: Number(properties.lon),
    country: normalizeText(properties.country),
    country_code: normalizeText(properties.country_code),
    city: normalizeText(properties.city),
    county: normalizeText(properties.county),
    suburb: normalizeText(properties.suburb),
    district: normalizeText(properties.district),
    state_district: normalizeText(properties.state_district),
    state: normalizeText(properties.state),
  };
}

function pickBestFeature(features, place) {
  const targetName = normalizeForMatch(place.name);
  const targetArea = normalizeForMatch([place.city, place.area].filter(Boolean).join(" "));

  let best = null;

  for (const feature of features) {
    const summary = getFeatureSummary(feature);

    if (!isValidCoordinate(summary.lat, summary.lng)) {
      continue;
    }

    const countryCode = normalizeForMatch(summary.country_code);
    const country = normalizeForMatch(summary.country);
    if ((countryCode && countryCode !== "ph") || (country && country !== "philippines")) {
      continue;
    }

    const resultName = normalizeForMatch(summary.name);
    const resultArea = normalizeForMatch(
      [
        summary.suburb,
        summary.district,
        summary.city,
        summary.county,
        summary.state_district,
        summary.state,
        summary.formatted,
      ]
        .filter(Boolean)
        .join(" ")
    );

    const nameScore = overlapScore(targetName, resultName);
    const areaScore = overlapScore(targetArea, resultArea);
    const score = nameScore * 0.75 + areaScore * 0.25;

    if (nameScore < 0.45 && areaScore < 0.45) {
      continue;
    }

    if (score < 0.58 && !(nameScore >= 0.78 && areaScore >= 0.2)) {
      continue;
    }

    if (!best || score > best.score) {
      best = {
        score,
        summary,
      };
    }
  }

  return best;
}

async function getGeoapifyApiKey() {
  const envKey = normalizeText(process.env.GEOAPIFY_API_KEY);
  if (envKey) {
    return envKey;
  }

  const { getSecret } = await import("../src/config/keyVault.ts");
  return getSecret("geoapify-api-key");
}

async function getSupabaseClient() {
  const { getSupabaseAdminClient } = await import("../src/config/supabaseAdmin.ts");
  return getSupabaseAdminClient();
}

async function fetchGeoapifyFeatures(query, apiKey, limit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS);

  try {
    const url = new URL(GEOAPIFY_ENDPOINT);
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
      throw new Error(`Geoapify geocoding failed with status ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload.features) ? payload.features : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableGeoapifyError(error) {
  if (!error) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  const message = String(error.message || error);
  return /abort|timed? out|timeout|network|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    message
  );
}

async function fetchGeoapifyFeaturesWithRetry(query, apiKey, limit) {
  let lastError = null;

  for (let attempt = 1; attempt <= GEOAPIFY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchGeoapifyFeatures(query, apiKey, limit);
    } catch (error) {
      lastError = error;

      if (attempt >= GEOAPIFY_MAX_ATTEMPTS || !isRetryableGeoapifyError(error)) {
        throw error;
      }

      const backoff = GEOAPIFY_BACKOFF_MS[attempt - 1] ?? GEOAPIFY_BACKOFF_MS.at(-1) ?? 4000;
      console.warn(
        `Geoapify request failed for "${query}" on attempt ${attempt}/${GEOAPIFY_MAX_ATTEMPTS}: ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${backoff}ms.`
      );
      await sleep(backoff);
    }
  }

  throw lastError || new Error("Geoapify request failed unexpectedly.");
}

function buildGeoapifyResult(summary, query) {
  return {
    query,
    formatted_address: summary.formatted,
    place_id: summary.place_id,
    name: summary.name,
    latitude: summary.lat,
    longitude: summary.lng,
    city: summary.city,
    county: summary.county,
    suburb: summary.suburb,
    district: summary.district,
    state_district: summary.state_district,
    state: summary.state,
    country: summary.country,
    country_code: summary.country_code,
  };
}

async function resolveCoordinate(place, apiKey) {
  const attempts = [buildQuery(place, false), buildQuery(place, true)].filter(Boolean);
  let lastError = null;

  for (const query of attempts) {
    try {
      const features = await fetchGeoapifyFeaturesWithRetry(query, apiKey, 5);
      const best = pickBestFeature(features, place);

      if (best) {
        return {
          query,
          feature: best.summary,
          score: best.score,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatSqlNumber(value) {
  return Number(value).toString();
}

function createLogEntry(place, result, status) {
  return {
    place_id: place.id,
    slug: place.slug,
    name: place.name,
    old_latitude: place.latitude,
    old_longitude: place.longitude,
    new_latitude: result ? result.feature.lat : null,
    new_longitude: result ? result.feature.lng : null,
    geoapify_query: result ? result.query : null,
    geoapify_formatted_address: result ? result.feature.formatted : null,
    geoapify_result: result ? buildGeoapifyResult(result.feature, result.query) : null,
    status,
  };
}

async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const output = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        output.push(fullPath);
      }
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
}

function extractPlacesFromSeedJson(data) {
  if (Array.isArray(data)) {
    return { rootType: "array", places: data };
  }

  if (data && typeof data === "object" && Array.isArray(data.places)) {
    return { rootType: "object", places: data.places };
  }

  return { rootType: null, places: [] };
}

function updateSeedPlaceRecord(place, updatesBySlug) {
  if (!place || typeof place !== "object") {
    return false;
  }

  const slug = normalizeText(place.slug);
  if (!slug || !updatesBySlug.has(slug)) {
    return false;
  }

  const update = updatesBySlug.get(slug);
  if (!update) {
    return false;
  }

  const nextLatitude = update.latitude;
  const nextLongitude = update.longitude;
  let changed = false;

  if (place.latitude !== nextLatitude) {
    place.latitude = nextLatitude;
    changed = true;
  }

  if (place.longitude !== nextLongitude) {
    place.longitude = nextLongitude;
    changed = true;
  }

  return changed;
}

async function syncSeedJsonFiles(updates) {
  const seedFiles = collectJsonFiles(SEED_CITIES_DIR);
  if (seedFiles.length === 0) {
    return { touchedFiles: 0, updatedPlaces: 0, skipped: true };
  }

  const updatesBySlug = new Map(
    updates.map((item) => [
      normalizeText(item.slug),
      { latitude: item.latitude, longitude: item.longitude },
    ])
  );

  let touchedFiles = 0;
  let updatedPlaces = 0;

  for (const filePath of seedFiles) {
    const data = await readJsonFile(filePath);
    const { rootType, places } = extractPlacesFromSeedJson(data);

    if (!rootType || places.length === 0) {
      continue;
    }

    let fileChanged = false;
    for (const place of places) {
      if (updateSeedPlaceRecord(place, updatesBySlug)) {
        fileChanged = true;
        updatedPlaces += 1;
      }
    }

    if (fileChanged) {
      touchedFiles += 1;
      await writeJsonFile(filePath, data);
    }
  }

  return { touchedFiles, updatedPlaces, skipped: false };
}

async function main() {
  loadLocalEnv();

  const { help } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }

  const supabase = await getSupabaseClient();
  const apiKey = await getGeoapifyApiKey();

  await fsp.mkdir(REPORT_DIR, { recursive: true });

  const { data, error } = await supabase
    .from("places")
    .select("id, name, slug, address, city, area, latitude, longitude, google_maps_url")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active places: ${error.message}`);
  }

  const places = Array.isArray(data) ? data : [];
  const sqlStatements = [];
  const logEntries = [];
  const seedUpdates = [];
  let updatedCount = 0;
  let skippedCount = 0;
  let failedRequests = 0;

  console.log(`Loaded ${places.length} active place(s).`);

  for (let index = 0; index < places.length; index += 1) {
    const place = places[index];
    const identifier = place.slug || place.name || place.id;
    console.log(`[${index + 1}/${places.length}] Resolving: ${identifier}`);

    try {
      const resolved = await resolveCoordinate(place, apiKey);
      const newLatitude = resolved ? resolved.feature.lat : null;
      const newLongitude = resolved ? resolved.feature.lng : null;
      const hasChanged =
        resolved &&
        (place.latitude !== newLatitude || place.longitude !== newLongitude);

      if (hasChanged) {
        sqlStatements.push(
          `UPDATE places SET latitude = ${formatSqlNumber(newLatitude)}, longitude = ${formatSqlNumber(newLongitude)}, updated_at = now() WHERE id = ${sqlLiteral(place.id)};`
        );
        seedUpdates.push({
          slug: place.slug,
          latitude: newLatitude,
          longitude: newLongitude,
        });
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }

      logEntries.push(
        createLogEntry(place, resolved, hasChanged ? "updated" : "skipped")
      );
    } catch (error) {
      failedRequests += 1;
      skippedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Geoapify failed for ${identifier}: ${message}. Marking place as skipped and continuing.`
      );
      logEntries.push({
        ...createLogEntry(place, null, "skipped"),
        failure_reason: message,
      });
    }

    if (index < places.length - 1) {
      await sleep(PLACE_DELAY_MS);
    }
  }

  const sqlHeader = [
    "-- Auto-generated by backend/scripts/fixPlaceCoordinates.cjs",
    `-- Generated at: ${new Date().toISOString()}`,
    "",
  ].join("\n");
  await fsp.writeFile(SQL_REPORT_PATH, `${sqlHeader}${sqlStatements.join("\n")}\n`, "utf8");

  const logPayload = {
    generated_at: new Date().toISOString(),
    total_places: places.length,
    updated_places: updatedCount,
    skipped_places: skippedCount,
    failed_requests: failedRequests,
    places: logEntries,
  };
  await writeJsonFile(LOG_REPORT_PATH, logPayload);

  const seedSync = await syncSeedJsonFiles(seedUpdates);

  console.log(`Wrote SQL report: ${path.relative(BACKEND_ROOT, SQL_REPORT_PATH)}`);
  console.log(`Wrote log report: ${path.relative(BACKEND_ROOT, LOG_REPORT_PATH)}`);
  console.log(`Queued SQL updates: ${sqlStatements.length}`);
  console.log(`Summary: total=${places.length}, updated=${updatedCount}, skipped=${skippedCount}, failed requests=${failedRequests}`);

  if (seedSync.skipped) {
    console.log("Seed sync skipped: no backend/seed-data/cities directory found.");
  } else {
    console.log(
      `Seed sync updated ${seedSync.updatedPlaces} place record(s) across ${seedSync.touchedFiles} file(s).`
    );
  }

  if (sqlStatements.length === 0) {
    console.log("No coordinate updates were generated.");
  }
}

main().catch((err) => {
  console.error("Coordinate fix script failed:", err);
  process.exit(1);
});
