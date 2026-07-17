import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { createBaseSlug } from "../utils/slug";

type SeedPlaceRaw = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  category?: unknown;
  address?: unknown;
  city?: unknown;
  area?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  google_maps_url?: unknown;
  description?: unknown;
  best_time_to_visit?: unknown;
  visit_duration?: unknown;
  good_for?: unknown;
  commute_access?: unknown;
  parking_info?: unknown;
  budget_min?: unknown;
  budget_note?: unknown;
  price_level?: unknown;
  faqs?: unknown;
  search_terms?: unknown;
  tags?: unknown;
  average_rating?: unknown;
  review_count?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type SeedPlaceFaq = {
  question: string;
  answer: string;
};

export type SeedPlaceInsertRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string;
  city: string;
  area: string | null;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  description: string | null;
  best_time_to_visit: string | null;
  visit_duration: string | null;
  good_for: string[];
  commute_access: string | null;
  parking_info: string | null;
  budget_min: number | null;
  budget_note: string | null;
  price_level: number | null;
  faqs: SeedPlaceFaq[];
  search_terms: string[];
  tags: string[];
  average_rating: number | null;
  review_count: number | null;
  status: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SeedPlacesOptions = {
  filePath?: string;
  batchSize?: number;
  dryRun?: boolean;
};

export type SeedPlacesResult = {
  totalRows: number;
  processedRows: number;
  batchSize: number;
  dryRun: boolean;
  sourceFile: string;
};

function loadSeedEnv() {
  dotenv.config();
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
}

function getString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getString(item))
    .filter((item): item is string => Boolean(item));
}

function getFaqArray(value: unknown): SeedPlaceFaq[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const question = getString(record.question);
      const answer = getString(record.answer);

      if (!question || !answer) {
        return null;
      }

      return { question, answer };
    })
    .filter((item): item is SeedPlaceFaq => Boolean(item));
}

export function mapGalatayoSeedPlace(raw: SeedPlaceRaw): SeedPlaceInsertRow {
  const id = getString(raw.id);
  const name = getString(raw.name);
  const city = getString(raw.city);
  const latitude = getNumber(raw.latitude);
  const longitude = getNumber(raw.longitude);

  if (!id) {
    throw new Error("Seed place is missing an id.");
  }

  if (!name) {
    throw new Error(`Seed place ${id} is missing a name.`);
  }

  if (!city) {
    throw new Error(`Seed place ${id} is missing a city.`);
  }

  if (latitude === null || longitude === null) {
    throw new Error(`Seed place ${id} is missing valid coordinates.`);
  }

  const slug =
    getString(raw.slug) ??
    createBaseSlug(name, city);

  if (!slug) {
    throw new Error(`Seed place ${id} could not produce a valid slug.`);
  }

  return {
    id,
    name,
    slug,
    category: getString(raw.category) ?? "Place",
    address: getString(raw.address) ?? "",
    city,
    area: getString(raw.area),
    latitude,
    longitude,
    google_maps_url: getString(raw.google_maps_url),
    description: getString(raw.description),
    best_time_to_visit: getString(raw.best_time_to_visit),
    visit_duration: getString(raw.visit_duration),
    good_for: getStringArray(raw.good_for),
    commute_access: getString(raw.commute_access),
    parking_info: getString(raw.parking_info),
    budget_min: getNumber(raw.budget_min),
    budget_note: getString(raw.budget_note) ?? null,
    price_level: getNumber(raw.price_level),
    faqs: getFaqArray(raw.faqs),
    search_terms: getStringArray(raw.search_terms),
    tags: getStringArray(raw.tags),
    average_rating: getNumber(raw.average_rating),
    review_count: getNumber(raw.review_count),
    status: getString(raw.status),
    created_at: getString(raw.created_at) ?? undefined,
    updated_at: getString(raw.updated_at) ?? undefined,
  };
}

async function readSeedPlaces(filePath: string) {
  const rawContent = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(rawContent) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Seed file must contain a JSON array.");
  }

  return parsed.map((item) => mapGalatayoSeedPlace(item as SeedPlaceRaw));
}

async function getSeedSupabaseClient() {
  loadSeedEnv();

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (supabaseUrl && supabaseServiceRoleKey) {
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return getSupabaseAdminClient();
}

function getResolvedSeedFilePath(filePath?: string) {
  return path.resolve(
    process.cwd(),
    filePath ?? path.join("scripts", "galatayo_places_seed_557_rebuilt.json")
  );
}

function chunkRows<T>(rows: T[], batchSize: number) {
  const batches: T[][] = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }

  return batches;
}

export async function seedGalatayoPlaces(options: SeedPlacesOptions = {}): Promise<SeedPlacesResult> {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 100));
  const sourceFile = getResolvedSeedFilePath(options.filePath);
  const rows = await readSeedPlaces(sourceFile);

  if (!options.dryRun && rows.length > 0) {
    const supabase = await getSeedSupabaseClient();

    for (const batch of chunkRows(rows, batchSize)) {
      const { error } = await (supabase.from("places") as any).upsert(batch, {
        onConflict: "id",
      });

      if (error) {
        throw new Error(`Failed to seed places: ${error.message}`);
      }
    }
  }

  return {
    totalRows: rows.length,
    processedRows: rows.length,
    batchSize,
    dryRun: Boolean(options.dryRun),
    sourceFile,
  };
}
