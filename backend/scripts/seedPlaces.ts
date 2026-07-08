import * as fs from "fs";
import * as path from "path";
import { getSupabaseAdminClient } from "../src/config/supabaseAdmin";
import {
  CitySeedFile,
  CitySeedImage,
  CitySeedPlace,
  CitySeedTag,
  FINAL_CATEGORY_ID_SET,
  ValidationIssue,
  expectedImageCount,
  resolveBackendRoot,
  validateCitySeedFiles,
} from "./seedDataValidation";

function loadLocalEnv(): void {
  const settingsPath = path.resolve(__dirname, "../local.settings.json");
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const values = parsed.Values as Record<string, string | undefined>;
    if (values) {
      for (const key of Object.keys(values)) {
        const val = values[key];
        if (val !== undefined && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const SCHEMA_PROBE_LIMIT = 1;
const UPSERT_BATCH_SIZE = 100;

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseAdminClient>>;

type ColumnSet = Set<string>;

type TableSchema = {
  table: string;
  columns: ColumnSet;
};

type PlacePayload = {
  slug: string;
  row: Record<string, unknown>;
  id: string | null;
};

type TagPayload = {
  id: string;
  name: string;
  searchTerms: string[];
  row: Record<string, unknown>;
};

type PlaceCategoryPayload = {
  placeId: string;
  categoryId: string;
  row: Record<string, unknown>;
};

type PlaceTagPayload = {
  placeId: string;
  tagId: string;
  strength: number | null;
  notes: string | null;
  row: Record<string, unknown>;
};

type PlaceImagePayload = {
  placeId: string;
  imageSlug: string;
  storageKey: string;
  sortOrder: number;
  isPrimary: boolean;
  altText: string | null;
  status: string;
  row: Record<string, unknown>;
};

type SeedPlan = {
  tags: TagPayload[];
  places: PlacePayload[];
  placeCategories: PlaceCategoryPayload[];
  placeTags: PlaceTagPayload[];
  placeImages: PlaceImagePayload[];
  files: CitySeedFile[];
  validationIssues: ValidationIssue[];
  valid: boolean;
};

type Mode = "dry-run" | "write";

const PLACE_COLUMN_CANDIDATES: string[] = [
  "id",
  "slug",
  "name",
  "category",
  "address",
  "city",
  "latitude",
  "longitude",
  "budget_min",
  "google_maps_url",
  "area",
  "description",
  "best_time_to_visit",
  "visit_duration",
  "good_for",
  "not_ideal_for",
  "crowd_level",
  "indoor_outdoor",
  "weather_fit",
  "parking_info",
  "commute_access",
  "nearby_context",
  "normalized_name",
  "searchable_text",
  "search_keywords",
  "search_aliases",
  "status",
  "average_rating",
  "review_count",
  "price_level",
  "budget_note",
  "updated_at",
  "created_at",
];

const TAG_COLUMN_CANDIDATES: string[] = ["id", "name", "tag_group", "search_terms"];

const PLACE_TAGS_COLUMN_CANDIDATES: string[] = [
  "place_id",
  "tag_id",
  "strength",
  "notes",
];

const PLACE_CATEGORIES_COLUMN_CANDIDATES: string[] = ["place_id", "category_id"];

const PLACE_IMAGES_COLUMN_CANDIDATES: string[] = [
  "id",
  "place_id",
  "image_slug",
  "storage_key",
  "image_url",
  "alt_text",
  "sort_order",
  "is_primary",
  "status",
  "source_url",
  "contributor_note",
];

function parseArgs(argv: string[]): { mode: Mode; help: boolean } {
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
  return { mode, help };
}

function printHelp(): void {
  console.log("Usage: tsx scripts/seedPlaces.ts [--write] [--dry-run] [--help]");
  console.log("");
  console.log("  --write     Actually upsert into Supabase (default: dry-run).");
  console.log("  --dry-run   Validate and print what would happen without writing.");
  console.log("  --help      Show this help.");
  console.log("");
  console.log("This script needs service-role Supabase access (Azure Key Vault).");
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArrayOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

const PRICE_LEVEL_PESO_SYMBOL = "₱";
const PRICE_LEVEL_BUCKET_PREFIX = "galatayo-photos/";

function normalizePriceLevel(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0 && value <= 4) {
      return Math.trunc(value);
    }
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "free") {
    return 0;
  }

  if (trimmed.startsWith(PRICE_LEVEL_PESO_SYMBOL)) {
    const pesoCount = (trimmed.match(/₱/g) ?? []).length;
    if (pesoCount >= 1 && pesoCount <= 4) {
      return pesoCount;
    }
    return null;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 4) {
    return Math.trunc(parsed);
  }

  return null;
}

function normalizeStorageKey(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = typeof value === "string" ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(PRICE_LEVEL_BUCKET_PREFIX)) {
    return trimmed.slice(PRICE_LEVEL_BUCKET_PREFIX.length);
  }

  return trimmed;
}

const VALID_PLACE_STATUSES = new Set([
  "active",
  "inactive",
  "pending",
  "rejected",
]);

function normalizePlaceStatus(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = typeof value === "string" ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (VALID_PLACE_STATUSES.has(lowered)) {
    return lowered;
  }

  return null;
}

function humanizeTagId(tagId: string): string {
  return tagId
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function detectExistingColumns(
  supabase: SupabaseClient,
  table: string,
  candidates: string[]
): Promise<ColumnSet> {
  const found = new Set<string>();
  for (const column of candidates) {
    const { error } = await supabase
      .from(table)
      .select(column)
      .limit(SCHEMA_PROBE_LIMIT);
    if (!error) {
      found.add(column);
    }
  }
  return found;
}

function buildTagRowFromSchema(
  tag: { id: string; name: string; searchTerms: string[] },
  columns: ColumnSet
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (columns.has("id")) {
    row.id = tag.id;
  }
  if (columns.has("name")) {
    row.name = tag.name;
  }
  if (columns.has("tag_group")) {
    row.tag_group = "general";
  }
  if (columns.has("search_terms")) {
    row.search_terms = [tag.id, ...tag.searchTerms];
  }
  return row;
}

function buildPlaceRowFromSchema(
  place: CitySeedPlace,
  columns: ColumnSet,
  now: string
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  const setIf = (column: string, value: unknown): void => {
    if (columns.has(column)) {
      row[column] = value;
    }
  };

  // places.id is auto-generated; we use slug as the conflict key and let
  // Supabase keep the existing id on rerun. We intentionally do not write id.
  setIf("slug", toStringOrNull(place.slug));
  setIf("name", toStringOrNull(place.name));
  setIf("category", toStringOrNull(place.category));
  setIf("address", toStringOrNull(place.address));
  setIf("city", toStringOrNull(place.city));
  setIf("area", toStringOrNull(place.area));
  setIf("description", toStringOrNull(place.description));
  setIf("best_time_to_visit", toStringOrNull(place.best_time_to_visit));
  setIf("visit_duration", toStringOrNull(place.visit_duration));
  setIf("good_for", toStringArrayOrEmpty(place.good_for));
  setIf("not_ideal_for", toStringArrayOrEmpty(place.not_ideal_for));
  setIf("crowd_level", toStringOrNull(place.crowd_level));
  setIf("indoor_outdoor", toStringOrNull(place.indoor_outdoor));
  setIf("weather_fit", toStringOrNull(place.weather_fit));
  setIf("parking_info", toStringOrNull(place.parking_info));
  setIf("commute_access", toStringOrNull(place.commute_access));
  setIf("nearby_context", toStringOrNull(place.nearby_context));
  setIf("normalized_name", toStringOrNull(place.normalized_name));
  setIf("searchable_text", toStringOrNull(place.searchable_text));
  setIf("search_keywords", toStringArrayOrEmpty(place.search_keywords));
  setIf("search_aliases", toStringArrayOrEmpty(place.search_aliases));
  setIf("status", normalizePlaceStatus(place.status) ?? "active");
  setIf("average_rating", toNumberOrNull(place.average_rating));
  setIf("review_count", toNumberOrNull(place.review_count));
  setIf("price_level", normalizePriceLevel(place.price_level));
  setIf("budget_note", toStringOrNull(place.budget_note));
  setIf("budget_min", toNumberOrNull(place.budget_min));
  setIf("google_maps_url", toStringOrNull(place.google_maps_url));
  setIf("latitude", toNumberOrNull(place.latitude));
  setIf("longitude", toNumberOrNull(place.longitude));
  if (columns.has("updated_at")) {
    row.updated_at = now;
  }
  if (columns.has("created_at") && !("created_at" in row)) {
    row.created_at = now;
  }

  return row;
}

function buildPlaceCategoryRow(
  placeId: string,
  categoryId: string,
  columns: ColumnSet
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (columns.has("place_id")) {
    row.place_id = placeId;
  }
  if (columns.has("category_id")) {
    row.category_id = categoryId;
  }
  return row;
}

function buildPlaceTagRow(
  placeId: string,
  tagId: string,
  strength: number | null,
  notes: string | null,
  columns: ColumnSet
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (columns.has("place_id")) {
    row.place_id = placeId;
  }
  if (columns.has("tag_id")) {
    row.tag_id = tagId;
  }
  if (strength !== null && columns.has("strength")) {
    row.strength = strength;
  }
  if (notes !== null && columns.has("notes")) {
    row.notes = notes;
  }
  return row;
}

function buildPlaceImageRow(
  payload: {
    placeId: string;
    image: CitySeedImage;
    storageKey: string;
  },
  columns: ColumnSet,
  now: string
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (columns.has("place_id")) {
    row.place_id = payload.placeId;
  }
  if (columns.has("image_slug")) {
    row.image_slug = payload.image.image_slug;
  }
  if (columns.has("storage_key")) {
    row.storage_key = payload.storageKey;
  }
  if (columns.has("image_url")) {
    const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    row.image_url = publicBaseUrl ? `${publicBaseUrl}/${payload.storageKey}` : null;
  }
  if (columns.has("alt_text")) {
    row.alt_text = payload.image.alt_text ?? null;
  }
  if (columns.has("sort_order")) {
    row.sort_order = payload.image.sort_order;
  }
  if (columns.has("is_primary")) {
    row.is_primary = payload.image.is_primary;
  }
  if (columns.has("status")) {
    row.status = "approved";
  }
  if (columns.has("source_url")) {
    row.source_url = null;
  }
  if (columns.has("contributor_note")) {
    row.contributor_note = "Seeded from city JSON file";
  }
  if (columns.has("updated_at")) {
    row.updated_at = now;
  }
  if (columns.has("created_at") && !("created_at" in row)) {
    row.created_at = now;
  }
  return row;
}

function extractTagSpec(tag: CitySeedTag): { id: string; strength: number | null; notes: string | null } {
  if (typeof tag === "string") {
    return { id: tag.trim(), strength: null, notes: null };
  }
  if (tag && typeof tag === "object") {
    const id = toStringOrNull(tag.id) ?? toStringOrNull(tag.name) ?? "";
    const strength = toNumberOrNull(tag.strength);
    const notes = toStringOrNull(tag.notes);
    return { id: id.trim(), strength, notes };
  }
  return { id: "", strength: null, notes: null };
}

async function buildSeedPlan(
  supabase: SupabaseClient | null,
  backendRoot: string
): Promise<{ plan: SeedPlan; placeColumns: ColumnSet; tagColumns: ColumnSet; placeCategoriesColumns: ColumnSet; placeTagsColumns: ColumnSet; placeImagesColumns: ColumnSet }> {
  const validation = validateCitySeedFiles(backendRoot);

  const placeColumns = supabase
    ? await detectExistingColumns(supabase, "places", PLACE_COLUMN_CANDIDATES)
    : new Set<string>(PLACE_COLUMN_CANDIDATES);
  const tagColumns = supabase
    ? await detectExistingColumns(supabase, "tags", TAG_COLUMN_CANDIDATES)
    : new Set<string>(TAG_COLUMN_CANDIDATES);
  const placeCategoriesColumns = supabase
    ? await detectExistingColumns(supabase, "place_categories", PLACE_CATEGORIES_COLUMN_CANDIDATES)
    : new Set<string>(PLACE_CATEGORIES_COLUMN_CANDIDATES);
  const placeTagsColumns = supabase
    ? await detectExistingColumns(supabase, "place_tags", PLACE_TAGS_COLUMN_CANDIDATES)
    : new Set<string>(PLACE_TAGS_COLUMN_CANDIDATES);
  const placeImagesColumns = supabase
    ? await detectExistingColumns(supabase, "place_images", PLACE_IMAGES_COLUMN_CANDIDATES)
    : new Set<string>(PLACE_IMAGES_COLUMN_CANDIDATES);

  const now = new Date().toISOString();
  const tagMap = new Map<string, { id: string; name: string; searchTerms: string[] }>();
  const placeMap = new Map<string, PlacePayload>();
  const placeCategories: PlaceCategoryPayload[] = [];
  const placeTags: PlaceTagPayload[] = [];
  const placeImages: PlaceImagePayload[] = [];

  for (const file of validation.files) {
    for (const place of file.places) {
      const slug = toStringOrNull(place.slug);
      if (!slug) {
        continue;
      }
      const row = buildPlaceRowFromSchema(place, placeColumns, now);
      const placePayload: PlacePayload = { slug, row, id: null };
      placeMap.set(slug, placePayload);

      if (Array.isArray(place.tags)) {
        for (const tag of place.tags) {
          const { id, strength, notes } = extractTagSpec(tag);
          if (!id) {
            continue;
          }
          if (!tagMap.has(id)) {
            tagMap.set(id, { id, name: humanizeTagId(id), searchTerms: [id] });
          }
          placeTags.push({
            placeId: slug,
            tagId: id,
            strength,
            notes,
            row: buildPlaceTagRow(slug, id, strength, notes, placeTagsColumns),
          });
        }
      }

      if (Array.isArray(place.categories)) {
        for (const category of place.categories) {
          const categoryId =
            typeof category === "string"
              ? category.trim()
              : toStringOrNull((category as { id?: unknown }).id) ??
                toStringOrNull((category as { category_id?: unknown }).category_id) ??
                toStringOrNull((category as { name?: unknown }).name);
          if (!categoryId) {
            continue;
          }
          const trimmedCategoryId = categoryId.trim();
          placeCategories.push({
            placeId: slug,
            categoryId: trimmedCategoryId,
            row: buildPlaceCategoryRow(slug, trimmedCategoryId, placeCategoriesColumns),
          });
        }
      }

      if (Array.isArray(place.images)) {
        for (const image of place.images) {
          if (!image || typeof image !== "object") {
            continue;
          }
          const imageSlug = toStringOrNull(image.image_slug);
          const storageKey = normalizeStorageKey(image.storage_key);
          if (!imageSlug || !storageKey) {
            continue;
          }
          const altText = toStringOrNull(image.alt_text);
          const sortOrder = toNumberOrNull(image.sort_order) ?? 1;
          const isPrimary = image.is_primary === true;
          placeImages.push({
            placeId: slug,
            imageSlug,
            storageKey,
            sortOrder,
            isPrimary,
            altText,
            status: "approved",
            row: buildPlaceImageRow(
              { placeId: slug, image, storageKey },
              placeImagesColumns,
              now
            ),
          });
        }
      }
    }
  }

  const tags: TagPayload[] = [...tagMap.values()].map((tag) => ({
    id: tag.id,
    name: tag.name,
    searchTerms: tag.searchTerms,
    row: buildTagRowFromSchema(tag, tagColumns),
  }));

  const dedupedPlaceCategories: PlaceCategoryPayload[] = [];
  const seenCategories = new Set<string>();
  for (const entry of placeCategories) {
    const key = `${entry.placeId}::${entry.categoryId}`;
    if (seenCategories.has(key)) {
      continue;
    }
    seenCategories.add(key);
    dedupedPlaceCategories.push(entry);
  }

  const dedupedPlaceTags: PlaceTagPayload[] = [];
  const seenTags = new Set<string>();
  for (const entry of placeTags) {
    const key = `${entry.placeId}::${entry.tagId}`;
    if (seenTags.has(key)) {
      continue;
    }
    seenTags.add(key);
    dedupedPlaceTags.push(entry);
  }

  const dedupedPlaceImages: PlaceImagePayload[] = [];
  const seenImageSlugs = new Set<string>();
  for (const entry of placeImages) {
    if (seenImageSlugs.has(entry.imageSlug)) {
      continue;
    }
    seenImageSlugs.add(entry.imageSlug);
    dedupedPlaceImages.push(entry);
  }

  return {
    plan: {
      tags,
      places: [...placeMap.values()],
      placeCategories: dedupedPlaceCategories,
      placeTags: dedupedPlaceTags,
      placeImages: dedupedPlaceImages,
      files: validation.files,
      validationIssues: validation.errors,
      valid: validation.valid,
    },
    placeColumns,
    tagColumns,
    placeCategoriesColumns,
    placeTagsColumns,
    placeImagesColumns,
  };
}

async function fetchExistingCategoryIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .limit(1000);
  if (error) {
    throw new Error(`Failed to fetch categories from Supabase: ${error.message}`);
  }
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ id?: unknown }>) {
    if (typeof row.id === "string" && row.id.trim()) {
      ids.add(row.id.trim());
    }
  }
  return ids;
}

function validateCategoryUsage(
  plan: SeedPlan,
  existingCategoryIds: Set<string> | null
): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const allowed = FINAL_CATEGORY_ID_SET;

  for (const file of plan.files) {
    file.places.forEach((place, index) => {
      const placeLabel = toStringOrNull(place.slug) ?? toStringOrNull(place.name) ?? `index ${index}`;
      if (!Array.isArray(place.categories)) {
        return;
      }
      for (const category of place.categories) {
        const categoryId =
          typeof category === "string"
            ? category.trim()
            : toStringOrNull((category as { id?: unknown }).id) ??
              toStringOrNull((category as { category_id?: unknown }).category_id) ??
              toStringOrNull((category as { name?: unknown }).name);
        if (!categoryId) {
          continue;
        }
        const trimmed = categoryId.trim();
        if (!allowed.has(trimmed)) {
          issues.push({
            file: file.fileName,
            place: placeLabel,
            placeIndex: index,
            field: "categories",
            code: "category_not_in_final_list",
            message: `Category "${trimmed}" is not in the final 14 GalaTayo categories.`,
          });
          continue;
        }
        if (existingCategoryIds && !existingCategoryIds.has(trimmed)) {
          issues.push({
            file: file.fileName,
            place: placeLabel,
            placeIndex: index,
            field: "categories",
            code: "category_not_in_supabase",
            message: `Category "${trimmed}" is in the final list but does not exist in the Supabase categories table.`,
          });
        }
      }
    });
  }

  return { ok: issues.length === 0, issues };
}

async function upsertInBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  options: {
    onConflict: string;
    ignoreDuplicates?: boolean;
    returnColumns?: string | null;
  }
): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  const returnColumns =
    options.returnColumns === undefined ? null : options.returnColumns;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }
    const builder = (supabase.from(table) as any).upsert(batch, {
      onConflict: options.onConflict,
      ignoreDuplicates: options.ignoreDuplicates,
    });
    const result = returnColumns
      ? await builder.select(returnColumns)
      : await builder;
    const data = (result as { data?: unknown }).data;
    const error = (result as { error?: unknown }).error;
    if (error) {
      errors.push(
        `[${table}] batch ${i / UPSERT_BATCH_SIZE + 1}: ${(error as { message?: string }).message ?? String(error)}`
      );
    } else {
      upserted += Array.isArray(data) ? data.length : batch.length;
    }
  }

  return { upserted, errors };
}

async function fetchPlaceIdsBySlugs(
  supabase: SupabaseClient,
  slugs: string[]
): Promise<Map<string, string>> {
  if (slugs.length === 0) {
    return new Map();
  }
  const map = new Map<string, string>();
  for (let i = 0; i < slugs.length; i += UPSERT_BATCH_SIZE) {
    const batch = slugs.slice(i, i + UPSERT_BATCH_SIZE);
    const { data, error } = await supabase
      .from("places")
      .select("id, slug")
      .in("slug", batch);
    if (error) {
      throw new Error(`Failed to fetch place ids by slug: ${error.message}`);
    }
    for (const row of (data ?? []) as Array<{ id?: unknown; slug?: unknown }>) {
      if (typeof row.id === "string" && typeof row.slug === "string") {
        map.set(row.slug, row.id);
      }
    }
  }
  return map;
}

function resolvePlaceImageConflict(
  columns: ColumnSet
): { conflict: string; supportsImageSlug: boolean } {
  if (columns.has("image_slug")) {
    return { conflict: "image_slug", supportsImageSlug: true };
  }
  if (columns.has("place_id") && columns.has("sort_order")) {
    return { conflict: "place_id,sort_order", supportsImageSlug: false };
  }
  return { conflict: "id", supportsImageSlug: false };
}

function buildPlaceRowsWithIds(
  plan: SeedPlan,
  placeIdMap: Map<string, string>
): Record<string, unknown>[] {
  return plan.places.map((place) => {
    const placeId = placeIdMap.get(place.slug) ?? place.id ?? place.slug;
    return { ...place.row };
  });
}

function printPlanSummary(
  plan: SeedPlan,
  options: {
    mode: Mode;
    fileCount: number;
    categoryIssues: ValidationIssue[];
    schemas: {
      places: ColumnSet;
      tags: ColumnSet;
      placeCategories: ColumnSet;
      placeTags: ColumnSet;
      placeImages: ColumnSet;
    };
  }
): void {
  const {
    mode,
    fileCount,
    categoryIssues,
    schemas,
  } = options;

  const lines: string[] = [];
  lines.push("== GalaTayo place seed plan ==");
  lines.push(`Mode: ${mode === "write" ? "WRITE" : "DRY RUN"}`);
  lines.push(`City JSON files read: ${fileCount}`);
  lines.push(`Places to upsert: ${plan.places.length}`);
  lines.push(`Unique tags to upsert: ${plan.tags.length}`);
  lines.push(`place_categories rows: ${plan.placeCategories.length}`);
  lines.push(`place_tags rows: ${plan.placeTags.length}`);
  lines.push(`place_images rows: ${plan.placeImages.length}`);
  lines.push("");
  lines.push("Detected columns:");
  lines.push(`  places: ${[...schemas.places].sort().join(", ") || "(none)"}`);
  lines.push(`  tags: ${[...schemas.tags].sort().join(", ") || "(none)"}`);
  lines.push(`  place_categories: ${[...schemas.placeCategories].sort().join(", ") || "(none)"}`);
  lines.push(`  place_tags: ${[...schemas.placeTags].sort().join(", ") || "(none)"}`);
  lines.push(`  place_images: ${[...schemas.placeImages].sort().join(", ") || "(none)"}`);
  console.log(lines.join("\n"));

  if (plan.validationIssues.length > 0) {
    console.log("\n-- Validation issues (block seed) --");
    for (const issue of plan.validationIssues) {
      const placeLabel = issue.place ? ` place=${issue.place}` : "";
      console.log(`  - [${issue.file}] ${issue.code}${placeLabel}: ${issue.message}`);
    }
  }

  if (categoryIssues.length > 0) {
    console.log("\n-- Category validation issues (block seed) --");
    for (const issue of categoryIssues) {
      const placeLabel = issue.place ? ` place=${issue.place}` : "";
      console.log(`  - [${issue.file}] ${issue.code}${placeLabel}: ${issue.message}`);
    }
  }
}

async function run(): Promise<void> {
  loadLocalEnv();
  const { mode, help } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const backendRoot = resolveBackendRoot();

  console.log("== GalaTayo place seed ==");
  console.log(`Mode: ${mode === "write" ? "WRITE" : "DRY RUN"}`);
  console.log(`Backend root: ${backendRoot}`);

  let supabase: SupabaseClient | null = null;
  let existingCategoryIds: Set<string> | null = null;
  if (mode === "write") {
    supabase = await getSupabaseAdminClient();
    console.log("Supabase admin client: connected (write mode).");
  } else {
    try {
      supabase = await getSupabaseAdminClient();
      console.log("Supabase admin client: connected (dry-run: read-only checks).");
    } catch (err) {
      console.log(
        `Supabase admin client: not available in dry-run (${(err as Error).message}). Using candidate-only schema.`
      );
      supabase = null;
    }
  }

  const { plan, placeColumns, tagColumns, placeCategoriesColumns, placeTagsColumns, placeImagesColumns } =
    await buildSeedPlan(supabase, backendRoot);

  const categoryCheck = validateCategoryUsage(plan, existingCategoryIds);

  printPlanSummary(plan, {
    mode,
    fileCount: plan.files.length,
    categoryIssues: categoryCheck.issues,
    schemas: {
      places: placeColumns,
      tags: tagColumns,
      placeCategories: placeCategoriesColumns,
      placeTags: placeTagsColumns,
      placeImages: placeImagesColumns,
    },
  });

  if (!plan.valid || !categoryCheck.ok) {
    console.log("\nSeed aborted: validation errors must be fixed before writing.");
    if (mode === "dry-run") {
      console.log("DRY RUN: no database writes were performed.");
    }
    process.exitCode = 1;
    return;
  }

  if (mode === "dry-run") {
    if (supabase) {
      try {
        existingCategoryIds = await fetchExistingCategoryIds(supabase);
        const recheck = validateCategoryUsage(plan, existingCategoryIds);
        if (!recheck.ok) {
          console.log("\nDRY RUN: Supabase category check found new issues:");
          for (const issue of recheck.issues) {
            const placeLabel = issue.place ? ` place=${issue.place}` : "";
            console.log(`  - [${issue.file}] ${issue.code}${placeLabel}: ${issue.message}`);
          }
          console.log("\nDRY RUN: no database writes were performed.");
          process.exitCode = 1;
          return;
        }
        console.log(`\nDRY RUN: Supabase has ${existingCategoryIds.size} categories that match the final list.`);
      } catch (err) {
        console.warn(
          `\nDRY RUN: could not reach Supabase to verify categories (${(err as Error).message}). Skipping Supabase category cross-check.`
        );
      }
    } else {
      console.log("\nDRY RUN: skipped Supabase category cross-check (no client).");
    }

    console.log("\nDRY RUN: no database writes were performed.");
    console.log(
      `Re-run with --write (or npm run seed:places:write) to actually upsert ${plan.places.length} places, ${plan.tags.length} tags, ${plan.placeCategories.length} place_categories, ${plan.placeTags.length} place_tags, ${plan.placeImages.length} place_images.`
    );
    return;
  }

  if (!supabase) {
    throw new Error("Supabase client is not initialized but write mode was requested.");
  }

  existingCategoryIds = await fetchExistingCategoryIds(supabase);
  const liveCategoryCheck = validateCategoryUsage(plan, existingCategoryIds);
  if (!liveCategoryCheck.ok) {
    console.log("\nSeed aborted: live Supabase category check failed.");
    for (const issue of liveCategoryCheck.issues) {
      const placeLabel = issue.place ? ` place=${issue.place}` : "";
      console.log(`  - [${issue.file}] ${issue.code}${placeLabel}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!tagColumns.has("id")) {
    console.log(
      "\nSeed aborted: tags table does not have an 'id' column. Cannot upsert tags."
    );
    process.exitCode = 1;
    return;
  }
  if (!placeColumns.has("slug")) {
    console.log(
      "\nSeed aborted: places table does not have a 'slug' column. Cannot upsert places."
    );
    process.exitCode = 1;
    return;
  }
  if (!placeCategoriesColumns.has("place_id") || !placeCategoriesColumns.has("category_id")) {
    console.log(
      "\nSeed aborted: place_categories table is missing place_id/category_id columns."
    );
    process.exitCode = 1;
    return;
  }
  if (!placeTagsColumns.has("place_id") || !placeTagsColumns.has("tag_id")) {
    console.log(
      "\nSeed aborted: place_tags table is missing place_id/tag_id columns."
    );
    process.exitCode = 1;
    return;
  }
  if (!placeImagesColumns.has("place_id") || !placeImagesColumns.has("storage_key")) {
    console.log(
      "\nSeed aborted: place_images table is missing place_id/storage_key columns."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nUpserting tags...");
  const tagsResult = await upsertInBatches(supabase, "tags", plan.tags.map((t) => t.row), {
    onConflict: "id",
    returnColumns: "id",
  });
  console.log(`  Upserted: ${tagsResult.upserted}`);
  if (tagsResult.errors.length > 0) {
    console.log("  Errors:");
    for (const err of tagsResult.errors) console.log(`    - ${err}`);
    if (tagsResult.upserted === 0) {
      process.exitCode = 1;
      return;
    }
  }

  console.log("\nUpserting places...");
  const placeRows = buildPlaceRowsWithIds(plan, new Map());
  const placesResult = await upsertInBatches(supabase, "places", placeRows, {
    onConflict: "slug",
    returnColumns: "id",
  });
  console.log(`  Upserted: ${placesResult.upserted}`);
  if (placesResult.errors.length > 0) {
    console.log("  Errors:");
    for (const err of placesResult.errors) console.log(`    - ${err}`);
    console.log("\nSeed aborted: places upsert had errors. No further tables will be written.");
    process.exitCode = 1;
    return;
  }

  console.log("\nFetching place ids by slug...");
  const placeSlugs = plan.places.map((p) => p.slug);
  const placeIdMap = await fetchPlaceIdsBySlugs(supabase, placeSlugs);
  console.log(`  Resolved ${placeIdMap.size} / ${placeSlugs.length} place ids.`);

  const missingSlugs = placeSlugs.filter((slug) => !placeIdMap.has(slug));
  if (missingSlugs.length > 0) {
    console.log(
      `\nSeed aborted: ${missingSlugs.length} place slug(s) could not be resolved to ids:`
    );
    for (const slug of missingSlugs.slice(0, 10)) {
      console.log(`  - ${slug}`);
    }
    if (missingSlugs.length > 10) {
      console.log(`  ... and ${missingSlugs.length - 10} more.`);
    }
    process.exitCode = 1;
    return;
  }

  const placeCategoryRows = plan.placeCategories.map((entry) => ({
    ...entry.row,
    place_id: placeIdMap.get(entry.placeId) ?? entry.placeId,
  }));
  console.log("\nUpserting place_categories...");
  const placeCategoriesResult = await upsertInBatches(
    supabase,
    "place_categories",
    placeCategoryRows,
    { onConflict: "place_id,category_id", returnColumns: null }
  );
  console.log(`  Upserted: ${placeCategoriesResult.upserted}`);
  if (placeCategoriesResult.errors.length > 0) {
    console.log("  Errors:");
    for (const err of placeCategoriesResult.errors) console.log(`    - ${err}`);
  }

  const placeTagRows = plan.placeTags.map((entry) => ({
    ...entry.row,
    place_id: placeIdMap.get(entry.placeId) ?? entry.placeId,
  }));
  console.log("\nUpserting place_tags...");
  const placeTagsResult = await upsertInBatches(supabase, "place_tags", placeTagRows, {
    onConflict: "place_id,tag_id",
    returnColumns: null,
  });
  console.log(`  Upserted: ${placeTagsResult.upserted}`);
  if (placeTagsResult.errors.length > 0) {
    console.log("  Errors:");
    for (const err of placeTagsResult.errors) console.log(`    - ${err}`);
  }

  const placeImageRows = plan.placeImages.map((entry) => ({
    ...entry.row,
    place_id: placeIdMap.get(entry.placeId) ?? entry.placeId,
  }));
  const imageConflict = resolvePlaceImageConflict(placeImagesColumns);
  console.log(
    `\nUpserting place_images (conflict target: ${imageConflict.conflict}, supports image_slug: ${imageConflict.supportsImageSlug})...`
  );
  if (!imageConflict.supportsImageSlug) {
    console.log(
      "  Note: place_images table does not have an image_slug column. Falling back to (place_id, sort_order) or id conflict target."
    );
  }
  const placeImagesResult = await upsertInBatches(supabase, "place_images", placeImageRows, {
    onConflict: imageConflict.conflict,
    returnColumns: "id",
  });
  console.log(`  Upserted: ${placeImagesResult.upserted}`);
  if (placeImagesResult.errors.length > 0) {
    console.log("  Errors:");
    for (const err of placeImagesResult.errors) console.log(`    - ${err}`);
  }

  console.log("\n== Seed finished ==");
  console.log(`Tags upserted: ${tagsResult.upserted}`);
  console.log(`Places upserted: ${placesResult.upserted}`);
  console.log(`place_categories upserted: ${placeCategoriesResult.upserted}`);
  console.log(`place_tags upserted: ${placeTagsResult.upserted}`);
  console.log(`place_images upserted: ${placeImagesResult.upserted}`);

  if (
    tagsResult.errors.length > 0 ||
    placesResult.errors.length > 0 ||
    placeCategoriesResult.errors.length > 0 ||
    placeTagsResult.errors.length > 0 ||
    placeImagesResult.errors.length > 0
  ) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
