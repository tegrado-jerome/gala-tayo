import * as fs from "fs";
import * as path from "path";
import { getSupabaseAdminClient } from "../src/config/supabaseAdmin";
import { invalidatePlaceDetailCache } from "../src/data/placeDetails";
import { invalidateApprovedPlaceImagesCache } from "../src/services/placeImagesService";

type Mode = "dry-run" | "write";

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
};

type PlaceImageRow = {
  id: string;
  place_id: string;
  image_url: string | null;
  storage_key: string | null;
  status: string;
  sort_order: number | null;
  created_at: string;
};

type ScanResult = {
  row: PlaceImageRow;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  error: string | null;
};

const PLACE_LOOKUP_CHUNK_SIZE = 100;

function loadLocalEnv(): void {
  const settingsPath = path.resolve(__dirname, "../local.settings.json");

  if (!fs.existsSync(settingsPath)) {
    return;
  }

  const raw = fs.readFileSync(settingsPath, "utf-8");
  const parsed = JSON.parse(raw);
  const values = parsed.Values as Record<string, string | undefined>;

  if (!values) {
    return;
  }

  for (const key of Object.keys(values)) {
    const val = values[key];
    if (val !== undefined && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]): { help: boolean; mode: Mode } {
  let mode: Mode = "dry-run";
  let help = false;

  for (const arg of argv) {
    if (arg === "--write" || arg === "--apply") {
      mode = "write";
    } else if (arg === "--dry-run") {
      mode = "dry-run";
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    }
  }

  return { help, mode };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return results;
}

function normalizeUrl(value: string | null): string {
  return (value ?? "").trim();
}

function isProbablyImageContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  const normalized = contentType.toLowerCase();
  return normalized.startsWith("image/") || normalized.includes("octet-stream");
}

async function checkImageUrl(url: string): Promise<{ ok: boolean; status: number | null; contentType: string | null; error: string | null }> {
  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      status: null,
      contentType: null,
      error: "Non-http image URL.",
    };
  }

  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(12_000)
    : undefined;

  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal,
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        signal,
      });
    }

    const contentType = response.headers.get("content-type");
    const ok = response.ok && isProbablyImageContentType(contentType);

    return {
      ok,
      status: response.status,
      contentType,
      error: ok ? null : `Unexpected response ${response.status}${contentType ? ` (${contentType})` : ""}.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentType: null,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

async function getPlacesByIds(placeIds: string[]): Promise<Map<string, PlaceRow>> {
  const uniquePlaceIds = Array.from(new Set(placeIds.map((placeId) => placeId.trim()).filter(Boolean)));

  if (uniquePlaceIds.length === 0) {
    return new Map<string, PlaceRow>();
  }

  const supabase = await getSupabaseAdminClient();
  const placesById = new Map<string, PlaceRow>();

  for (let index = 0; index < uniquePlaceIds.length; index += PLACE_LOOKUP_CHUNK_SIZE) {
    const chunk = uniquePlaceIds.slice(index, index + PLACE_LOOKUP_CHUNK_SIZE);
    const { data, error } = await (supabase.from("places") as any)
      .select("id, name, slug")
      .in("id", chunk);

    if (error) {
      throw error;
    }

    for (const place of (data || []) as PlaceRow[]) {
      placesById.set(place.id, place);
    }
  }

  return placesById;
}

function groupByPlace(results: ScanResult[]) {
  const byPlace = new Map<
    string,
    {
      placeId: string;
      name: string;
      slug: string;
      total: number;
      broken: ScanResult[];
      validCount: number;
    }
  >();

  for (const result of results) {
    const placeId = result.row.place_id;
    const current = byPlace.get(placeId) ?? {
      placeId,
      name: "Unknown place",
      slug: "",
      total: 0,
      broken: [],
      validCount: 0,
    };

    current.total += 1;
    if (result.ok) {
      current.validCount += 1;
    } else {
      current.broken.push(result);
    }

    byPlace.set(placeId, current);
  }

  return byPlace;
}

async function run(): Promise<void> {
  loadLocalEnv();

  const { help, mode } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log("Usage: tsx scripts/scanBrokenPlaceImages.ts [--write] [--dry-run] [--help]");
    console.log("");
    console.log("  --dry-run   Scan and report broken approved image URLs without writing.");
    console.log("  --write     Reject broken approved image rows in Supabase.");
    console.log("  --help      Show this help.");
    return;
  }

  const supabase = await getSupabaseAdminClient();
  console.log("Supabase admin client: connected.");
  console.log(`Mode: ${mode === "write" ? "WRITE" : "DRY RUN"}`);
  console.log("");

  const [{ data: placeData, error: placeError }, { data: imageData, error: imageError }] = await Promise.all([
    (supabase.from("places") as any).select("id, name, slug").order("name", { ascending: true, nullsFirst: false }),
    (supabase.from("place_images") as any)
      .select("id, place_id, image_url, storage_key, status, sort_order, created_at")
      .eq("status", "approved")
      .order("place_id", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (placeError) {
    throw placeError;
  }

  if (imageError) {
    throw imageError;
  }

  const places = (placeData || []) as PlaceRow[];
  const images = (imageData || []) as PlaceImageRow[];

  if (images.length === 0) {
    console.log("No approved place images found.");
    return;
  }

  const placesById = await getPlacesByIds(images.map((row) => row.place_id));

  const results = await mapWithConcurrency(images, 8, async (row) => {
    const imageUrl = normalizeUrl(row.image_url);
    const check = await checkImageUrl(imageUrl);
    const result: ScanResult = {
      row,
      ok: check.ok,
      status: check.status,
      contentType: check.contentType,
      error: check.error,
    };
    return result;
  });

  const grouped = groupByPlace(results);
  for (const [placeId, bucket] of grouped.entries()) {
    const place = placesById.get(placeId);
    bucket.name = place?.name ?? bucket.name;
    bucket.slug = place?.slug ?? bucket.slug;
  }

  const brokenPlaces = Array.from(grouped.values()).filter((bucket) => bucket.broken.length > 0);
  const emptyAfterCleanup = brokenPlaces.filter((bucket) => bucket.validCount === 0);
  const brokenRows = brokenPlaces.flatMap((bucket) => bucket.broken);

  console.log(`Places scanned: ${places.length}`);
  console.log(`Approved image rows scanned: ${results.length}`);
  console.log(`Places with broken approved images: ${brokenPlaces.length}`);
  console.log(`Places that would have no approved images left: ${emptyAfterCleanup.length}`);
  console.log("");

  if (brokenPlaces.length === 0) {
    console.log("No broken approved place images were found.");
    return;
  }

  console.log("Broken places:");
  for (const bucket of brokenPlaces) {
    const label = `${bucket.name}${bucket.slug ? ` (${bucket.slug})` : ""}`;
    console.log(`- ${label}: ${bucket.validCount}/${bucket.total} approved image(s) still valid`);
    for (const broken of bucket.broken) {
      console.log(`  - ${broken.row.id}: ${broken.row.image_url ?? "(missing url)"}${broken.error ? ` -> ${broken.error}` : ""}`);
    }
  }

  console.log("");
  console.log("Places with zero approved images after cleanup:");
  if (emptyAfterCleanup.length === 0) {
    console.log("  (none)");
  } else {
    for (const bucket of emptyAfterCleanup) {
      const label = `${bucket.name}${bucket.slug ? ` (${bucket.slug})` : ""}`;
      console.log(`- ${label}`);
    }
  }

  if (mode === "dry-run") {
    console.log("");
    console.log("DRY RUN: no database writes were performed.");
    console.log("Re-run with --write to reject the broken image rows.");
    return;
  }

  console.log("");
  console.log("Rejecting broken approved image rows...");

  const now = new Date().toISOString();
  let rejectedCount = 0;

  for (const broken of brokenRows) {
    const { error } = await (supabase.from("place_images") as any)
      .update({
        status: "rejected",
        image_url: null,
        storage_key: null,
        rejection_reason: "Rejected by broken image scan.",
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", broken.row.id);

    if (error) {
      console.error(`  Failed to reject ${broken.row.id}: ${error.message ?? "unknown error"}`);
      continue;
    }

    rejectedCount += 1;

    try {
      await Promise.all([
        invalidateApprovedPlaceImagesCache(broken.row.place_id),
        invalidatePlaceDetailCache(broken.row.place_id, placesById.get(broken.row.place_id)?.slug ?? null),
      ]);
    } catch (error) {
      console.warn(`  Failed to invalidate caches for ${broken.row.place_id}:`, error);
    }
  }

  console.log("");
  console.log(`Rejected ${rejectedCount} broken approved image row(s).`);
  if (rejectedCount !== brokenRows.length) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Broken place image scan failed:", error);
  process.exit(1);
});
