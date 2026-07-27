import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const TARGET_ACCOUNT_ID = "1c0ea6ff-3bd2-4de9-8846-8b9c8cd06883";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedbackMetadata = {
  part: number;
  source_index_start: number;
  source_index_end: number;
  place_count: number;
  total_source_place_count: number;
  account_id: string;
};

type ReviewData = {
  id: string;
  submitted_by: string;
  rating: number;
  comment: string | null;
};

type CommentData = {
  id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment: string;
  status: string;
  deleted_at: string | null;
};

type FeedbackEntry = {
  source_index: number;
  place_id: string;
  place_name: string;
  category: string;
  city: string;
  review: ReviewData;
  place_comment: CommentData;
};

type FeedbackFile = {
  metadata: FeedbackMetadata;
  entries: FeedbackEntry[];
};

type CliOptions = {
  dryRun: boolean;
  resolveConflicts: boolean;
  part: "1" | "2" | "all";
};

type ValidationCounts = {
  part1Count: number;
  part2Count: number;
  combinedCount: number;
  sourceIndexRange: string;
  uniquePlaceIds: number;
  uniqueReviewIds: number;
  uniqueCommentIds: number;
  matchedPlaces: number;
  missingPlaces: string[];
  inactivePlaces: string[];
  nameMismatches: { placeId: string; jsonName: string; dbName: string }[];
  invalidRatings: { sourceIndex: number; rating: unknown }[];
  invalidReviewComments: { sourceIndex: number }[];
  invalidParentCommentIds: { sourceIndex: number }[];
  invalidStatuses: { sourceIndex: number; status: string }[];
  invalidDeletedAt: { sourceIndex: number; deletedAt: unknown }[];
  accountValid: boolean;
  accountDetails: string;
  existingSeedConflicts: string[];
  duplicateExistingReviews: string[];
  duplicateExistingParentComments: string[];
};

type PlannedOperation = {
  reviewsToInsert: number;
  reviewsToUpdate: number;
  reviewsUnchanged: number;
  commentsToInsert: number;
  commentsToUpdate: number;
  commentsUnchanged: number;
  commentConflicts: {
    placeId: string;
    placeName: string;
    existingCommentId: string;
    incomingCommentId: string;
    existingCommentText: string;
  }[];
};

type SeedSummary = {
  part1SourceEntries: number;
  part2SourceEntries: number;
  totalSourceEntries: number;
  matchedActivePlaces: number;
  reviewsInserted: number;
  reviewsUpdated: number;
  reviewsUnchanged: number;
  commentsInserted: number;
  commentsUpdated: number;
  commentsUnchanged: number;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  failedRows: number;
  aggregateMismatches: string[];
  duplicateTargetAccountReviews: string[];
  duplicateTargetAccountActiveParentComments: string[];
  targetAccountReviewsWithNonNullComments: string[];
  targetAccountCommentsWithNonNullParentCommentId: string[];
  targetAccountCommentsWithNonActiveStatus: string[];
  targetAccountCommentsWithNonNullDeletedAt: string[];
  seededRowsLinkedToWrongAccount: string[];
  seededRowsLinkedToWrongPlace: string[];
  seededCommentsWithWrongText: string[];
  seededRatingsWithWrongValue: string[];
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    resolveConflicts: false,
    part: "all",
  };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--resolve-conflicts") options.resolveConflicts = true;
    else if (arg.startsWith("--part=")) {
      const value = arg.split("=")[1];
      if (value === "1" || value === "2" || value === "all") options.part = value;
    }
  }
  return options;
}

function getSeedDirectory(): string {
  return __dirname;
}

function loadFeedbackFile(filePath: string, label: string): FeedbackFile {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as FeedbackFile;
  console.log(`  Loaded ${label}: ${data.metadata.place_count} entries (indexes ${data.metadata.source_index_start}–${data.metadata.source_index_end})`);
  return data;
}

function getAllEntries(part1: FeedbackFile, part2: FeedbackFile): FeedbackEntry[] {
  return [...part1.entries, ...part2.entries];
}

function getSelectedEntries(
  all: FeedbackEntry[],
  part: "1" | "2" | "all"
): FeedbackEntry[] {
  if (part === "1") return all.filter((e) => e.source_index >= 0 && e.source_index <= 274);
  if (part === "2") return all.filter((e) => e.source_index >= 275 && e.source_index <= 549);
  return all;
}

function validateUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const IN_CHUNK_SIZE = 50;

async function chunkedInQuery(
  supabase: ReturnType<typeof createClient>,
  table: string,
  selectColumns: string,
  column: string,
  values: string[],
  extraFilters?: Record<string, unknown>
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK_SIZE) {
    const chunk = values.slice(i, i + IN_CHUNK_SIZE);
    let query = (supabase.from(table) as any).select(selectColumns).in(column, chunk);
    if (extraFilters) {
      for (const [key, value] of Object.entries(extraFilters)) {
        query = query.eq(key, value);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data) results.push(...data);
  }
  return results;
}

function tryLoadLocalSettings(): void {
  try {
    const settingsPath = path.resolve(__dirname, "..", "local.settings.json");
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { Values?: Record<string, string> };
    if (parsed.Values) {
      for (const [key, value] of Object.entries(parsed.Values)) {
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    /* local.settings.json not available */
  }
}

async function createSupabaseClient() {
  tryLoadLocalSettings();

  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment or local.settings.json"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validateCombinedDataset(
  entries: FeedbackEntry[],
  options: CliOptions
): ValidationCounts {
  const counts: ValidationCounts = {
    part1Count: 0,
    part2Count: 0,
    combinedCount: 0,
    sourceIndexRange: "",
    uniquePlaceIds: 0,
    uniqueReviewIds: 0,
    uniqueCommentIds: 0,
    matchedPlaces: 0,
    missingPlaces: [],
    inactivePlaces: [],
    nameMismatches: [],
    invalidRatings: [],
    invalidReviewComments: [],
    invalidParentCommentIds: [],
    invalidStatuses: [],
    invalidDeletedAt: [],
    accountValid: false,
    accountDetails: "Not checked yet",
    existingSeedConflicts: [],
    duplicateExistingReviews: [],
    duplicateExistingParentComments: [],
  };

  const part1Entries = entries.filter((e) => e.source_index >= 0 && e.source_index <= 274);
  const part2Entries = entries.filter((e) => e.source_index >= 275 && e.source_index <= 549);

  counts.part1Count = part1Entries.length;
  counts.part2Count = part2Entries.length;
  counts.combinedCount = entries.length;

  if (entries.length === 0) {
    return counts;
  }

  const indexes = entries.map((e) => e.source_index).sort((a, b) => a - b);
  counts.sourceIndexRange = `${indexes[0]}–${indexes[indexes.length - 1]}`;

  const placeIds = new Set(entries.map((e) => e.place_id));
  counts.uniquePlaceIds = placeIds.size;

  const reviewIds = new Set(entries.map((e) => e.review.id));
  counts.uniqueReviewIds = reviewIds.size;

  const commentIds = new Set(entries.map((e) => e.place_comment.id));
  counts.uniqueCommentIds = commentIds.size;

  return counts;
}

async function validateAll(
  supabase: ReturnType<typeof createClient>,
  part1: FeedbackFile,
  part2: FeedbackFile,
  allEntries: FeedbackEntry[],
  selectedEntries: FeedbackEntry[],
  options: CliOptions
): Promise<ValidationCounts> {
  const counts = validateCombinedDataset(selectedEntries, options);

  console.log("\n==================================================");
  console.log("  DATASET VALIDATION REPORT");
  console.log("==================================================");

  let allPassed = true;

  if (options.part === "all" || options.part === "1") {
    const p1Expected = options.part === "1" ? selectedEntries.length : 275;
    if (counts.part1Count !== p1Expected) {
      console.log(`  FAIL: Part 1 has ${counts.part1Count} entries, expected ${p1Expected}`);
      allPassed = false;
    } else {
      console.log(`  PASS: Part 1 has ${counts.part1Count} entries`);
    }

    const p1Indexes = selectedEntries.filter((e) => e.source_index >= 0 && e.source_index <= 274).map((e) => e.source_index).sort((a, b) => a - b);
    if (p1Indexes.length > 0) {
      const expectedStart = options.part === "1" ? 0 : 0;
      const expectedEnd = options.part === "1" ? selectedEntries.length - 1 : 274;
      if (p1Indexes[0] !== expectedStart || p1Indexes[p1Indexes.length - 1] !== expectedEnd) {
        console.log(`  FAIL: Part 1 source indexes are ${p1Indexes[0]}–${p1Indexes[p1Indexes.length - 1]}, expected ${expectedStart}–${expectedEnd}`);
        allPassed = false;
      } else {
        console.log(`  PASS: Part 1 source indexes ${p1Indexes[0]}–${p1Indexes[p1Indexes.length - 1]}`);
      }
    }
  }

  if (options.part === "all" || options.part === "2") {
    const p2Expected = options.part === "2" ? selectedEntries.length : 275;
    if (counts.part2Count !== p2Expected) {
      console.log(`  FAIL: Part 2 has ${counts.part2Count} entries, expected ${p2Expected}`);
      allPassed = false;
    } else {
      console.log(`  PASS: Part 2 has ${counts.part2Count} entries`);
    }

    const offset = options.part === "2" ? 275 : 275;
    const p2Indexes = selectedEntries.filter((e) => e.source_index >= 275 && e.source_index <= 549).map((e) => e.source_index).sort((a, b) => a - b);
    if (p2Indexes.length > 0) {
      const expectedStart = options.part === "2" ? selectedEntries[0].source_index : 275;
      const expectedEnd = options.part === "2" ? selectedEntries[selectedEntries.length - 1].source_index : 549;
      if (p2Indexes[0] !== expectedStart || p2Indexes[p2Indexes.length - 1] !== expectedEnd) {
        console.log(`  FAIL: Part 2 source indexes are ${p2Indexes[0]}–${p2Indexes[p2Indexes.length - 1]}, expected ${expectedStart}–${expectedEnd}`);
        allPassed = false;
      } else {
        console.log(`  PASS: Part 2 source indexes ${p2Indexes[0]}–${p2Indexes[p2Indexes.length - 1]}`);
      }
    }
  }

  if (options.part === "all") {
    if (counts.combinedCount !== 550) {
      console.log(`  FAIL: Combined dataset has ${counts.combinedCount} entries, expected 550`);
      allPassed = false;
    } else {
      console.log(`  PASS: Combined dataset has ${counts.combinedCount} entries`);
    }

    const indexes = selectedEntries.map((e) => e.source_index).sort((a, b) => a - b);
    const expectedFullRange = Array.from({ length: 550 }, (_, i) => i);
    const isCompleteSeq = indexes.length === 550 && indexes.every((v, i) => v === expectedFullRange[i]);
    if (!isCompleteSeq) {
      console.log("  FAIL: Combined source indexes are not the complete sequence 0–549");
      allPassed = false;
    } else {
      console.log("  PASS: Combined source indexes are the complete sequence 0–549");
    }
  }

  const allIndexes = selectedEntries.map((e) => e.source_index).sort((a, b) => a - b);
  const missingIndexes: number[] = [];
  if (allIndexes.length > 0) {
    for (let i = allIndexes[0]; i <= allIndexes[allIndexes.length - 1]; i++) {
      if (!allIndexes.includes(i)) missingIndexes.push(i);
    }
  }
  if (missingIndexes.length > 0) {
    console.log(`  FAIL: Missing source indexes: ${missingIndexes.join(", ")}`);
    allPassed = false;
  } else {
    console.log("  PASS: No missing source indexes");
  }

  const seenIndexes = new Set<number>();
  const duplicatedIndexes: number[] = [];
  for (const idx of allIndexes) {
    if (seenIndexes.has(idx)) duplicatedIndexes.push(idx);
    seenIndexes.add(idx);
  }
  if (duplicatedIndexes.length > 0) {
    console.log(`  FAIL: Duplicated source indexes: ${duplicatedIndexes.join(", ")}`);
    allPassed = false;
  } else {
    console.log("  PASS: No duplicated source indexes");
  }

  let invalidUuidPlaces = 0;
  for (const entry of selectedEntries) {
    if (!validateUuid(entry.place_id)) {
      console.log(`  FAIL: Invalid place_id UUID at index ${entry.source_index}: ${entry.place_id}`);
      invalidUuidPlaces++;
      allPassed = false;
    }
  }
  if (invalidUuidPlaces === 0) console.log("  PASS: All place_id values are valid UUIDs");

  const placeIds = new Map<string, FeedbackEntry[]>();
  for (const entry of selectedEntries) {
    const existing = placeIds.get(entry.place_id) || [];
    existing.push(entry);
    placeIds.set(entry.place_id, existing);
  }
  let duplicatePlaces = 0;
  for (const [pid, entries] of placeIds) {
    if (entries.length > 1) {
      console.log(`  FAIL: Duplicate place_id ${pid} appears ${entries.length} times at indexes ${entries.map((e) => e.source_index).join(", ")}`);
      duplicatePlaces++;
      allPassed = false;
    }
  }
  if (duplicatePlaces === 0) {
    console.log(`  PASS: All ${counts.uniquePlaceIds} place_id values are unique`);
  }

  let invalidUuidReviews = 0;
  for (const entry of selectedEntries) {
    if (!validateUuid(entry.review.id)) {
      console.log(`  FAIL: Invalid review ID at index ${entry.source_index}: ${entry.review.id}`);
      invalidUuidReviews++;
      allPassed = false;
    }
  }
  if (invalidUuidReviews === 0) console.log("  PASS: All review IDs are valid UUIDs");

  const reviewIds = new Set<string>();
  let duplicateReviewIds = 0;
  for (const entry of selectedEntries) {
    if (reviewIds.has(entry.review.id)) {
      console.log(`  FAIL: Duplicate review ID ${entry.review.id} at index ${entry.source_index}`);
      duplicateReviewIds++;
      allPassed = false;
    }
    reviewIds.add(entry.review.id);
  }
  if (duplicateReviewIds === 0) console.log(`  PASS: All ${counts.uniqueReviewIds} review IDs are unique`);

  let invalidUuidComments = 0;
  for (const entry of selectedEntries) {
    if (!validateUuid(entry.place_comment.id)) {
      console.log(`  FAIL: Invalid comment ID at index ${entry.source_index}: ${entry.place_comment.id}`);
      invalidUuidComments++;
      allPassed = false;
    }
  }
  if (invalidUuidComments === 0) console.log("  PASS: All comment IDs are valid UUIDs");

  const commentIds = new Set<string>();
  let duplicateCommentIds = 0;
  for (const entry of selectedEntries) {
    if (commentIds.has(entry.place_comment.id)) {
      console.log(`  FAIL: Duplicate comment ID ${entry.place_comment.id} at index ${entry.source_index}`);
      duplicateCommentIds++;
      allPassed = false;
    }
    commentIds.add(entry.place_comment.id);
  }
  if (duplicateCommentIds === 0) console.log(`  PASS: All ${counts.uniqueCommentIds} comment IDs are unique`);

  let idOverlap = false;
  for (const entry of selectedEntries) {
    if (reviewIds.has(entry.place_comment.id) || commentIds.has(entry.review.id)) {
      console.log(`  FAIL: ID overlap at index ${entry.source_index}: review ID ${entry.review.id}, comment ID ${entry.place_comment.id}`);
      idOverlap = true;
      allPassed = false;
    }
  }
  if (!idOverlap) console.log("  PASS: No review ID overlaps with a comment ID");

  for (const entry of selectedEntries) {
    const rating = entry.review.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      counts.invalidRatings.push({ sourceIndex: entry.source_index, rating });
      console.log(`  FAIL: Invalid rating at index ${entry.source_index}: ${rating} (expected integer 1–5)`);
      allPassed = false;
    }
  }
  if (counts.invalidRatings.length === 0) console.log("  PASS: All ratings are valid integers 1–5");

  for (const entry of selectedEntries) {
    if (entry.review.comment !== null && entry.review.comment !== undefined) {
      counts.invalidReviewComments.push({ sourceIndex: entry.source_index });
      console.log(`  FAIL: Review comment is not null at index ${entry.source_index}: "${String(entry.review.comment).substring(0, 50)}"`);
      allPassed = false;
    }
  }
  if (counts.invalidReviewComments.length === 0) console.log("  PASS: All review comments are null");

  for (const entry of selectedEntries) {
    if (!isNonEmptyString(entry.place_comment.comment)) {
      console.log(`  FAIL: Empty comment text at index ${entry.source_index}`);
      allPassed = false;
    }
  }

  for (const entry of selectedEntries) {
    if (entry.place_comment.parent_comment_id !== null) {
      counts.invalidParentCommentIds.push({ sourceIndex: entry.source_index });
      console.log(`  FAIL: Parent comment ID is not null at index ${entry.source_index}: ${entry.place_comment.parent_comment_id}`);
      allPassed = false;
    }
  }
  if (counts.invalidParentCommentIds.length === 0) console.log("  PASS: All parent_comment_id values are null");

  for (const entry of selectedEntries) {
    if (entry.place_comment.status !== "active") {
      counts.invalidStatuses.push({ sourceIndex: entry.source_index, status: entry.place_comment.status });
      console.log(`  FAIL: Invalid comment status at index ${entry.source_index}: "${entry.place_comment.status}" (expected "active")`);
      allPassed = false;
    }
  }
  if (counts.invalidStatuses.length === 0) console.log("  PASS: All comment statuses are 'active'");

  for (const entry of selectedEntries) {
    if (entry.place_comment.deleted_at !== null) {
      counts.invalidDeletedAt.push({ sourceIndex: entry.source_index, deletedAt: entry.place_comment.deleted_at });
      console.log(`  FAIL: Non-null deleted_at at index ${entry.source_index}: ${entry.place_comment.deleted_at}`);
      allPassed = false;
    }
  }
  if (counts.invalidDeletedAt.length === 0) console.log("  PASS: All deleted_at values are null");

  if (options.part === "all") {
    const p1PlaceIds = new Set(part1.entries.map((e) => e.place_id));
    const p2PlaceIds = new Set(part2.entries.map((e) => e.place_id));
    const overlap = new Set<string>();
    for (const pid of p1PlaceIds) {
      if (p2PlaceIds.has(pid)) overlap.add(pid);
    }
    if (overlap.size > 0) {
      console.log(`  FAIL: ${overlap.size} place_id values appear in both files: ${Array.from(overlap).join(", ")}`);
      allPassed = false;
    } else {
      console.log("  PASS: No place appears in both files");
    }
  }

  if (part1.metadata.place_count !== part1.entries.length) {
    console.log(`  FAIL: Part 1 metadata place_count (${part1.metadata.place_count}) != actual entries (${part1.entries.length})`);
    allPassed = false;
  } else {
    console.log(`  PASS: Part 1 metadata place_count matches entries (${part1.metadata.place_count})`);
  }

  if (part2.metadata.place_count !== part2.entries.length) {
    console.log(`  FAIL: Part 2 metadata place_count (${part2.metadata.place_count}) != actual entries (${part2.entries.length})`);
    allPassed = false;
  } else {
    console.log(`  PASS: Part 2 metadata place_count matches entries (${part2.metadata.place_count})`);
  }

  if (part1.metadata.source_index_start !== 0 || part1.metadata.source_index_end !== 274) {
    console.log(`  FAIL: Part 1 metadata source range ${part1.metadata.source_index_start}–${part1.metadata.source_index_end} != expected 0–274`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 1 metadata source range is 0–274");
  }

  if (part2.metadata.source_index_start !== 275 || part2.metadata.source_index_end !== 549) {
    console.log(`  FAIL: Part 2 metadata source range ${part2.metadata.source_index_start}–${part2.metadata.source_index_end} != expected 275–549`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 2 metadata source range is 275–549");
  }

  if (part1.metadata.total_source_place_count !== 550) {
    console.log(`  FAIL: Part 1 total_source_place_count is ${part1.metadata.total_source_place_count}, expected 550`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 1 total_source_place_count is 550");
  }

  if (part2.metadata.total_source_place_count !== 550) {
    console.log(`  FAIL: Part 2 total_source_place_count is ${part2.metadata.total_source_place_count}, expected 550`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 2 total_source_place_count is 550");
  }

  for (const entry of selectedEntries) {
    if (entry.review.submitted_by !== TARGET_ACCOUNT_ID) {
      console.log(`  FAIL: Review submitted_by at index ${entry.source_index} is ${entry.review.submitted_by}, expected ${TARGET_ACCOUNT_ID}`);
      allPassed = false;
    }
    if (entry.place_comment.user_id !== TARGET_ACCOUNT_ID) {
      console.log(`  FAIL: Comment user_id at index ${entry.source_index} is ${entry.place_comment.user_id}, expected ${TARGET_ACCOUNT_ID}`);
      allPassed = false;
    }
  }

  if (part1.metadata.account_id !== TARGET_ACCOUNT_ID) {
    console.log(`  FAIL: Part 1 metadata account_id is ${part1.metadata.account_id}, expected ${TARGET_ACCOUNT_ID}`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 1 metadata account_id matches target");
  }

  if (part2.metadata.account_id !== TARGET_ACCOUNT_ID) {
    console.log(`  FAIL: Part 2 metadata account_id is ${part2.metadata.account_id}, expected ${TARGET_ACCOUNT_ID}`);
    allPassed = false;
  } else {
    console.log("  PASS: Part 2 metadata account_id matches target");
  }

  const seenPlaceIds = new Set<string>();
  for (const entry of selectedEntries) {
    if (seenPlaceIds.has(entry.place_id)) {
      console.log(`  FAIL: Duplicate place_id ${entry.place_id} at index ${entry.source_index}`);
      allPassed = false;
    }
    seenPlaceIds.add(entry.place_id);
  }

  console.log("\n  --- Database Validation ---");

  const placeIdList = Array.from(seenPlaceIds);
  let dbError = false;

  try {
    let placesData: any[] = [];
    try {
      placesData = await chunkedInQuery(supabase, "places", "id, name, status", "id", placeIdList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL: Database error querying places: ${msg}`);
      allPassed = false;
      dbError = true;
    }

    if (!dbError) {
      const placesMap = new Map<string, { name: string; status: string }>();
      for (const row of placesData || []) {
        placesMap.set(row.id, { name: row.name, status: row.status });
      }

      for (const pid of placeIdList) {
        if (!placesMap.has(pid)) {
          counts.missingPlaces.push(pid);
        }
      }
      if (counts.missingPlaces.length > 0) {
        console.log(`  FAIL: ${counts.missingPlaces.length} place(s) not found in database`);
        for (const pid of counts.missingPlaces) {
          const entry = selectedEntries.find((e) => e.place_id === pid);
          console.log(`    Missing: ${pid} (index ${entry?.source_index}, name: "${entry?.place_name}")`);
        }
        allPassed = false;
      } else {
        console.log(`  PASS: All ${placeIdList.length} places exist in the database`);
      }

      for (const pid of placeIdList) {
        const place = placesMap.get(pid);
        if (place && place.status !== "active") {
          counts.inactivePlaces.push(pid);
        }
      }
      if (counts.inactivePlaces.length > 0) {
        console.log(`  FAIL: ${counts.inactivePlaces.length} place(s) have status other than "active"`);
        for (const pid of counts.inactivePlaces) {
          const entry = selectedEntries.find((e) => e.place_id === pid);
          const place = placesMap.get(pid);
          console.log(`    Inactive: ${pid} (index ${entry?.source_index}, name: "${entry?.place_name}", status: "${place?.status}")`);
        }
        allPassed = false;
      } else {
        console.log("  PASS: All matched places have status = active");
      }

      for (const entry of selectedEntries) {
        const place = placesMap.get(entry.place_id);
        if (place && place.name !== entry.place_name) {
          counts.nameMismatches.push({
            placeId: entry.place_id,
            jsonName: entry.place_name,
            dbName: place.name,
          });
        }
      }
      if (counts.nameMismatches.length > 0) {
        console.log(`  FAIL: ${counts.nameMismatches.length} place name mismatch(es)`);
        for (const m of counts.nameMismatches) {
          console.log(`    Name mismatch: ${m.placeId} — JSON: "${m.jsonName}" vs DB: "${m.dbName}"`);
        }
        allPassed = false;
      } else {
        console.log("  PASS: All JSON place names match the database");
      }

      counts.matchedPlaces = placeIdList.length - counts.missingPlaces.length;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL: Database error during places validation: ${msg}`);
    allPassed = false;
    dbError = true;
  }

  if (!dbError) {
    try {
      const { data: userData, error: userError } = await (supabase.from("users") as any)
        .select("id")
        .eq("id", TARGET_ACCOUNT_ID)
        .maybeSingle();

      if (userError) {
        counts.accountValid = false;
        counts.accountDetails = `DB error: ${userError.message}`;
        console.log(`  FAIL: Database error checking users table: ${userError.message}`);
        allPassed = false;
      } else if (!userData) {
        counts.accountValid = false;
        counts.accountDetails = "Target account not found in users table";
        console.log("  FAIL: Target account not found in users table");
        allPassed = false;
      } else {
        let profileOk = false;
        const { data: profileData, error: profileError } = await (supabase.from("profiles") as any)
          .select("user_id")
          .eq("user_id", TARGET_ACCOUNT_ID)
          .maybeSingle();

        if (profileError) {
          counts.accountDetails = `Users OK, profiles error: ${profileError.message}`;
          console.log(`  WARN: Profiles check error: ${profileError.message}`);
        } else if (profileData) {
          profileOk = true;
          counts.accountDetails = "Account exists in users and profiles tables";
        } else {
          counts.accountDetails = "Account exists in users but NOT in profiles table";
          console.log("  WARN: Target account not found in profiles table");
        }

        try {
          const { data: authData, error: authError } = await (supabase.rpc as any)("get_claim", {
            uid: TARGET_ACCOUNT_ID,
            claim: "role",
          }).maybeSingle();
          if (authError) {
            if (authError.message?.includes("function") || authError.message?.includes("not found")) {
            } else {
              console.log(`  WARN: Auth claim check: ${authError.message}`);
            }
          } else {
            counts.accountDetails += "; confirmed in auth.users";
          }
        } catch {
        }

        counts.accountValid = true;
        console.log(`  PASS: ${counts.accountDetails}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      counts.accountValid = false;
      counts.accountDetails = `Error: ${msg}`;
      console.log(`  FAIL: Account validation error: ${msg}`);
      allPassed = false;
    }

    try {
      let existingReviews: any[] = [];
      try {
        existingReviews = await chunkedInQuery(
          supabase, "place_reviews", "id, place_id, submitted_by, rating, comment",
          "place_id", placeIdList, { submitted_by: TARGET_ACCOUNT_ID }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  WARN: Could not query existing reviews: ${msg}`);
      }

      if (existingReviews.length > 0 || !dbError) {
        const existingMap = new Map<string, typeof existingReviews[0]>();
        for (const r of existingReviews || []) {
          if (existingMap.has(r.place_id)) {
            counts.duplicateExistingReviews.push(
              `place_id=${r.place_id}: existing IDs ${existingMap.get(r.place_id)!.id} and ${r.id}`
            );
          }
          existingMap.set(r.place_id, r);
        }
        if (counts.duplicateExistingReviews.length > 0) {
          console.log(`  FAIL: ${counts.duplicateExistingReviews.length} existing duplicate target-account review(s) for the same place`);
          for (const d of counts.duplicateExistingReviews) {
            console.log(`    ${d}`);
          }
          allPassed = false;
        } else {
          console.log("  PASS: No duplicate target-account reviews exist in the database");
        }
      }

      let existingComments: any[] = [];
      try {
        existingComments = await chunkedInQuery(
          supabase, "place_comments", "id, place_id, user_id, parent_comment_id, comment, status, deleted_at",
          "place_id", placeIdList, { user_id: TARGET_ACCOUNT_ID }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  WARN: Could not query existing comments: ${msg}`);
      }

      if (existingComments.length > 0) {
        const activeTopLevel = new Map<string, any[]>();
        for (const c of existingComments) {
          if (
            c.parent_comment_id === null &&
            c.deleted_at === null &&
            c.status === "visible"
          ) {
            const list = activeTopLevel.get(c.place_id) || [];
            list.push(c);
            activeTopLevel.set(c.place_id, list);
          }
        }
        for (const [pid, comments] of activeTopLevel) {
          if (comments.length > 1) {
            counts.duplicateExistingParentComments.push(
              `place_id=${pid}: ${comments.length} active top-level comments (IDs: ${comments.map((c) => c.id).join(", ")})`
            );
          }
        }
        if (counts.duplicateExistingParentComments.length > 0) {
          console.log(`  FAIL: ${counts.duplicateExistingParentComments.length} existing duplicate target-account active top-level comment(s) for the same place`);
          for (const d of counts.duplicateExistingParentComments) {
            console.log(`    ${d}`);
          }
          allPassed = false;
        } else {
          console.log("  PASS: No duplicate target-account active top-level comments exist in the database");
        }
      } else {
        console.log("  PASS: No duplicate target-account active top-level comments exist in the database");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  WARN: Could not check existing seed conflicts: ${msg}`);
    }
  }

  if (!allPassed) {
    console.log("\n==================================================");
    console.log("  VALIDATION FAILED — aborting");
    console.log("==================================================\n");
  } else {
    console.log("\n==================================================");
    console.log("  VALIDATION PASSED");
    console.log("==================================================\n");
  }

  counts.accountValid = counts.accountValid && !dbError;
  return counts;
}

async function planOperations(
  supabase: ReturnType<typeof createClient>,
  entries: FeedbackEntry[],
  options: CliOptions
): Promise<PlannedOperation> {
  const plan: PlannedOperation = {
    reviewsToInsert: 0,
    reviewsToUpdate: 0,
    reviewsUnchanged: 0,
    commentsToInsert: 0,
    commentsToUpdate: 0,
    commentsUnchanged: 0,
    commentConflicts: [],
  };

  const placeIdList = entries.map((e) => e.place_id);

  const existingReviews = await chunkedInQuery(
    supabase, "place_reviews", "id, place_id, rating, comment",
    "place_id", placeIdList, { submitted_by: TARGET_ACCOUNT_ID }
  );

  const reviewsByPlace = new Map<string, { id: string; rating: number; comment: string | null }>();
  for (const r of existingReviews || []) {
    reviewsByPlace.set(r.place_id, r);
  }

  for (const entry of entries) {
    const existing = reviewsByPlace.get(entry.place_id);
    if (!existing) {
      plan.reviewsToInsert++;
    } else if (existing.id === entry.review.id && existing.rating === entry.review.rating) {
      plan.reviewsUnchanged++;
    } else {
      plan.reviewsToUpdate++;
    }
  }

  const existingComments = await chunkedInQuery(
    supabase, "place_comments", "id, place_id, user_id, parent_comment_id, comment, status, deleted_at",
    "place_id", placeIdList, { user_id: TARGET_ACCOUNT_ID }
  );

  const commentById = new Map<string, typeof existingComments[0]>();
  for (const c of existingComments || []) {
    commentById.set(c.id, c);
  }

  const activeTopLevelByPlace = new Map<string, typeof existingComments[0][]>();
  for (const c of existingComments || []) {
    if (
      c.parent_comment_id === null &&
      c.deleted_at === null &&
      c.status === "visible"
    ) {
      const list = activeTopLevelByPlace.get(c.place_id) || [];
      list.push(c);
      activeTopLevelByPlace.set(c.place_id, list);
    }
  }

  for (const entry of entries) {
    const exactExisting = commentById.get(entry.place_comment.id);

    if (exactExisting) {
      if (
        exactExisting.comment === entry.place_comment.comment &&
        exactExisting.status === "visible" &&
        exactExisting.deleted_at === null &&
        exactExisting.parent_comment_id === null
      ) {
        plan.commentsUnchanged++;
      } else {
        plan.commentsToUpdate++;
      }
      continue;
    }

    const existingForPlace = activeTopLevelByPlace.get(entry.place_id);

    if (existingForPlace && existingForPlace.length > 0) {
      const firstExisting = existingForPlace[0];
      if (existingForPlace.length === 1) {
        if (options.resolveConflicts) {
          plan.commentConflicts.push({
            placeId: entry.place_id,
            placeName: entry.place_name,
            existingCommentId: firstExisting.id,
            incomingCommentId: entry.place_comment.id,
            existingCommentText: firstExisting.comment,
          });
          plan.commentsToUpdate++;
        } else {
          plan.commentConflicts.push({
            placeId: entry.place_id,
            placeName: entry.place_name,
            existingCommentId: firstExisting.id,
            incomingCommentId: entry.place_comment.id,
            existingCommentText: firstExisting.comment,
          });
        }
      } else {
        plan.commentConflicts.push({
          placeId: entry.place_id,
          placeName: entry.place_name,
          existingCommentId: existingForPlace.map((c) => c.id).join(", "),
          incomingCommentId: entry.place_comment.id,
          existingCommentText: `${existingForPlace.length} active top-level comments from target account`,
        });
      }
    } else {
      plan.commentsToInsert++;
    }
  }

  return plan;
}

function printPlannedOperations(
  plan: PlannedOperation,
  counts: ValidationCounts,
  options: CliOptions
): void {
  console.log("\n==================================================");
  console.log("  PLANNED OPERATIONS");
  console.log("==================================================");
  console.log(`  Reviews to insert:   ${plan.reviewsToInsert}`);
  console.log(`  Reviews to update:   ${plan.reviewsToUpdate}`);
  console.log(`  Reviews unchanged:   ${plan.reviewsUnchanged}`);
  console.log(`  Comments to insert:  ${plan.commentsToInsert}`);
  console.log(`  Comments to update:  ${plan.commentsToUpdate}`);
  console.log(`  Comments unchanged:  ${plan.commentsUnchanged}`);
  console.log(`  Comment conflicts:   ${plan.commentConflicts.length}`);
  console.log(`  Missing places:      ${counts.missingPlaces.length}`);
  console.log(`  Inactive places:     ${counts.inactivePlaces.length}`);
  console.log(`  Name mismatches:     ${counts.nameMismatches.length}`);
  console.log(`  Duplicate reviews:   ${counts.duplicateExistingReviews.length}`);
  console.log(`  Duplicate comments:  ${counts.duplicateExistingParentComments.length}`);
  console.log(`  Dry run:             ${options.dryRun}`);
  console.log(`  Resolve conflicts:   ${options.resolveConflicts}`);
  console.log("==================================================\n");

  if (plan.commentConflicts.length > 0) {
    console.log("  COMMENT CONFLICTS:");
    for (const c of plan.commentConflicts) {
      console.log(`    Place: ${c.placeName} (${c.placeId})`);
      console.log(`      Existing ID: ${c.existingCommentId}`);
      console.log(`      Incoming ID: ${c.incomingCommentId}`);
      console.log(`      Existing text: "${c.existingCommentText.substring(0, 100)}..."`);
      if (options.resolveConflicts) {
        console.log(`      -> Will update existing comment with JSON text`);
      } else {
        console.log(`      -> ABORTING: Use --resolve-conflicts to update existing`);
      }
    }
    console.log("");
  }
}

async function seedPlaceFeedback(
  supabase: ReturnType<typeof createClient>,
  entries: FeedbackEntry[],
  plan: PlannedOperation,
  options: CliOptions
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    part1SourceEntries: entries.filter((e) => e.source_index >= 0 && e.source_index <= 274).length,
    part2SourceEntries: entries.filter((e) => e.source_index >= 275 && e.source_index <= 549).length,
    totalSourceEntries: entries.length,
    matchedActivePlaces: entries.length,
    reviewsInserted: 0,
    reviewsUpdated: 0,
    reviewsUnchanged: 0,
    commentsInserted: 0,
    commentsUpdated: 0,
    commentsUnchanged: 0,
    resolvedConflicts: 0,
    unresolvedConflicts: 0,
    failedRows: 0,
    aggregateMismatches: [],
    duplicateTargetAccountReviews: [],
    duplicateTargetAccountActiveParentComments: [],
    targetAccountReviewsWithNonNullComments: [],
    targetAccountCommentsWithNonNullParentCommentId: [],
    targetAccountCommentsWithNonActiveStatus: [],
    targetAccountCommentsWithNonNullDeletedAt: [],
    seededRowsLinkedToWrongAccount: [],
    seededRowsLinkedToWrongPlace: [],
    seededCommentsWithWrongText: [],
    seededRatingsWithWrongValue: [],
  };

  const affectedPlaceIds = Array.from(new Set(entries.map((e) => e.place_id)));

  const now = new Date().toISOString();

  const reviewRows = entries.map((entry) => ({
    id: entry.review.id,
    place_id: entry.place_id,
    submitted_by: TARGET_ACCOUNT_ID,
    rating: entry.review.rating,
    comment: null,
    created_at: now,
    updated_at: now,
  }));

  const CHUNK_SIZE = 100;
  let reviewInsertError: string | null = null;

  for (let i = 0; i < reviewRows.length; i += CHUNK_SIZE) {
    const chunk = reviewRows.slice(i, i + CHUNK_SIZE);
    const { error } = await (supabase.from("place_reviews") as any)
      .upsert(chunk, { onConflict: "place_id,submitted_by", ignoreDuplicates: false })
      .select("id, place_id");

    if (error) {
      reviewInsertError = `Reviews chunk ${i / CHUNK_SIZE}: ${error.message}`;
      console.error(`    Error inserting/updating reviews chunk ${i / CHUNK_SIZE}: ${error.message}`);
      summary.reviewsInserted = 0;
      summary.reviewsUpdated = 0;
      summary.reviewsUnchanged = 0;
      summary.failedRows += chunk.length;
      break;
    }
  }

  if (!reviewInsertError) {
    summary.reviewsInserted = plan.reviewsToInsert;
    summary.reviewsUpdated = plan.reviewsToUpdate;
    summary.reviewsUnchanged = plan.reviewsUnchanged;
    console.log(`  Reviews: ${summary.reviewsInserted} inserted, ${summary.reviewsUpdated} updated, ${summary.reviewsUnchanged} unchanged`);
  }

  let commentInsertError: string | null = null;

  const existingComments = await chunkedInQuery(
    supabase, "place_comments", "id, place_id, user_id, parent_comment_id, comment, status, deleted_at",
    "place_id", affectedPlaceIds, { user_id: TARGET_ACCOUNT_ID }
  );

  const commentById = new Map<string, any>();
  for (const c of existingComments || []) {
    commentById.set(c.id, c);
  }

  const activeTopLevelByPlace = new Map<string, any[]>();
  for (const c of existingComments || []) {
    if (
      c.parent_comment_id === null &&
      c.deleted_at === null &&
      c.status === "visible"
    ) {
      const list = activeTopLevelByPlace.get(c.place_id) || [];
      list.push(c);
      activeTopLevelByPlace.set(c.place_id, list);
    }
  }

  const insertCommentRows: any[] = [];
  const updateCommentRows: { id: string; row: any }[] = [];
  const resolveCommentRows: { existingId: string; row: any }[] = [];

  for (const entry of entries) {
    const exactExisting = commentById.get(entry.place_comment.id);

    const commentRow = {
      id: entry.place_comment.id,
      place_id: entry.place_id,
      user_id: TARGET_ACCOUNT_ID,
      parent_comment_id: null,
      comment: entry.place_comment.comment,
      status: "visible",
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };

    if (exactExisting) {
      if (
        exactExisting.comment === entry.place_comment.comment &&
        exactExisting.status === "visible" &&
        exactExisting.deleted_at === null &&
        exactExisting.parent_comment_id === null
      ) {
        continue;
      }
      updateCommentRows.push({ id: entry.place_comment.id, row: commentRow });
      continue;
    }

    const existingForPlace = activeTopLevelByPlace.get(entry.place_id);

    if (existingForPlace && existingForPlace.length === 1 && options.resolveConflicts) {
      resolveCommentRows.push({ existingId: existingForPlace[0].id, row: commentRow });
      continue;
    }

    if (existingForPlace && existingForPlace.length > 0) {
      if (!options.resolveConflicts) {
        summary.unresolvedConflicts++;
        continue;
      }
    }

    insertCommentRows.push(commentRow);
  }

  for (let i = 0; i < insertCommentRows.length; i += CHUNK_SIZE) {
    const chunk = insertCommentRows.slice(i, i + CHUNK_SIZE);
    const { error } = await (supabase.from("place_comments") as any)
      .insert(chunk)
      .select("id");

    if (error) {
      commentInsertError = `Comments insert chunk ${i / CHUNK_SIZE}: ${error.message}`;
      console.error(`    Error inserting comments chunk ${i / CHUNK_SIZE}: ${error.message}`);
      summary.failedRows += chunk.length;
      break;
    }
  }

  for (const { id, row } of updateCommentRows) {
    const { error } = await (supabase.from("place_comments") as any)
      .update({
        comment: row.comment,
        parent_comment_id: null,
        status: "visible",
        deleted_at: null,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      commentInsertError = `Comments update id=${id}: ${error.message}`;
      console.error(`    Error updating comment ${id}: ${error.message}`);
      summary.failedRows++;
      break;
    }
  }

  for (const { existingId, row } of resolveCommentRows) {
    const { error } = await (supabase.from("place_comments") as any)
      .update({
        comment: row.comment,
        parent_comment_id: null,
        status: "visible",
        deleted_at: null,
        updated_at: now,
      })
      .eq("id", existingId)
      .eq("user_id", TARGET_ACCOUNT_ID);

    if (error) {
      commentInsertError = `Comments resolve id=${existingId}: ${error.message}`;
      console.error(`    Error resolving comment ${existingId}: ${error.message}`);
      summary.failedRows++;
      break;
    }
    summary.resolvedConflicts++;
  }

  if (!commentInsertError) {
    summary.commentsInserted = insertCommentRows.length;
    summary.commentsUpdated = updateCommentRows.length + resolveCommentRows.length;
    summary.commentsUnchanged = plan.commentsUnchanged;
    console.log(`  Comments: ${summary.commentsInserted} inserted, ${summary.commentsUpdated} updated, ${summary.commentsUnchanged} unchanged`);
  }

  if (reviewInsertError || commentInsertError) {
    console.error("\n  ERRORS DETECTED — seed incomplete");
    if (reviewInsertError) console.error(`  Review error: ${reviewInsertError}`);
    if (commentInsertError) console.error(`  Comment error: ${commentInsertError}`);
    console.error("  The seed is idempotent — you can re-run after fixing the issue.\n");

    summary.failedRows = Math.max(summary.failedRows, 1);
    return summary;
  }

  console.log("\n  Updating rating aggregates...");

  for (let i = 0; i < affectedPlaceIds.length; i += CHUNK_SIZE) {
    const chunk = affectedPlaceIds.slice(i, i + CHUNK_SIZE);

    const { data: reviewData, error: reviewError } = await (supabase.from("place_reviews") as any)
      .select("place_id, rating")
      .in("place_id", chunk);

    if (reviewError) {
      console.error(`    Error fetching reviews for aggregates: ${reviewError.message}`);
      summary.aggregateMismatches.push(`Could not recompute aggregates for chunk ${i / CHUNK_SIZE}`);
      continue;
    }

    const aggregates = new Map<string, { total: number; count: number }>();
    for (const r of reviewData || []) {
      const agg = aggregates.get(r.place_id) || { total: 0, count: 0 };
      agg.total += r.rating;
      agg.count += 1;
      aggregates.set(r.place_id, agg);
    }

    for (const pid of chunk) {
      const agg = aggregates.get(pid);
      const reviewCount = agg?.count || 0;
      const averageRating =
        reviewCount > 0 ? Math.round((agg!.total / reviewCount) * 10) / 10 : null;

      const { error: updateError } = await (supabase.from("places") as any)
        .update({
          review_count: reviewCount,
          average_rating: averageRating,
          updated_at: now,
        })
        .eq("id", pid);

      if (updateError) {
        console.error(`    Error updating aggregate for place ${pid}: ${updateError.message}`);
        summary.aggregateMismatches.push(`Could not update aggregate for ${pid}`);
      }
    }
  }

  console.log("  Rating aggregates updated.\n");

  console.log("  Running post-seed validation...\n");
  await runPostSeedValidation(supabase, entries, summary);

  return summary;
}

async function runPostSeedValidation(
  supabase: ReturnType<typeof createClient>,
  entries: FeedbackEntry[],
  summary: SeedSummary
): Promise<void> {
  const placeIdList = entries.map((e) => e.place_id);
  const expectedReviewIds = new Set(entries.map((e) => e.review.id));
  const expectedCommentIds = new Set(entries.map((e) => e.place_comment.id));
  const entryByPlaceId = new Map(entries.map((e) => [e.place_id, e]));

  const seededReviews = await chunkedInQuery(
    supabase, "place_reviews", "id, place_id, submitted_by, rating, comment",
    "place_id", placeIdList, { submitted_by: TARGET_ACCOUNT_ID }
  );

  if (seededReviews.length > 0) {
    const reviewByPlace = new Map<string, any[]>();
    for (const r of seededReviews) {
      const list = reviewByPlace.get(r.place_id) || [];
      list.push(r);
      reviewByPlace.set(r.place_id, list);
    }

    for (const [pid, reviews] of reviewByPlace) {
      if (reviews.length > 1) {
        summary.duplicateTargetAccountReviews.push(
          `place_id=${pid}: ${reviews.length} reviews (IDs: ${reviews.map((r) => r.id).join(", ")})`
        );
      }
    }

    for (const r of seededReviews) {
      if (r.comment !== null) {
        summary.targetAccountReviewsWithNonNullComments.push(
          `review_id=${r.id}, place_id=${r.place_id}: comment="${String(r.comment).substring(0, 50)}"`
        );
      }

      if (r.submitted_by !== TARGET_ACCOUNT_ID) {
        summary.seededRowsLinkedToWrongAccount.push(
          `review_id=${r.id}, place_id=${r.place_id}: submitted_by=${r.submitted_by}`
        );
      }

      const entry = entryByPlaceId.get(r.place_id);
      if (entry && entry.place_id !== r.place_id) {
        summary.seededRowsLinkedToWrongPlace.push(
          `review_id=${r.id}: expected place_id=${entry.place_id}, got ${r.place_id}`
        );
      }

      if (entry && r.rating !== entry.review.rating) {
        summary.seededRatingsWithWrongValue.push(
          `review_id=${r.id}, place_id=${r.place_id}: expected rating=${entry.review.rating}, got ${r.rating}`
        );
      }
    }

    const seededReviewCount = seededReviews.length;
  }

  const seededComments = await chunkedInQuery(
    supabase, "place_comments", "id, place_id, user_id, parent_comment_id, comment, status, deleted_at",
    "place_id", placeIdList, { user_id: TARGET_ACCOUNT_ID }
  );

  if (seededComments.length > 0) {
    const commentByPlace = new Map<string, any[]>();
    for (const c of seededComments) {
      const list = commentByPlace.get(c.place_id) || [];
      list.push(c);
      commentByPlace.set(c.place_id, list);
    }

    const seededCommentsById = new Map(seededComments.map((c: any) => [c.id, c]));
    const resolvedCommentIds = new Set<string>();
    for (const entry of entries) {
      const jsonId = entry.place_comment.id;
      let foundComment = seededCommentsById.get(jsonId);
      if (!foundComment) {
        const placeComments = commentByPlace.get(entry.place_id) || [];
        const resolved = placeComments.find(
          (c: any) => c.parent_comment_id === null && c.deleted_at === null && c.status === "visible"
        );
        if (resolved) {
          foundComment = resolved;
          resolvedCommentIds.add(resolved.id);
        }
      }
      if (!foundComment) continue;

      if (foundComment.parent_comment_id !== null) {
        summary.targetAccountCommentsWithNonNullParentCommentId.push(
          `comment_id=${foundComment.id}, place_id=${foundComment.place_id}: parent_comment_id=${foundComment.parent_comment_id}`
        );
      }

      if (foundComment.status !== "visible") {
        summary.targetAccountCommentsWithNonActiveStatus.push(
          `comment_id=${foundComment.id}, place_id=${foundComment.place_id}: status=${foundComment.status}`
        );
      }

      if (foundComment.deleted_at !== null) {
        summary.targetAccountCommentsWithNonNullDeletedAt.push(
          `comment_id=${foundComment.id}, place_id=${foundComment.place_id}: deleted_at=${foundComment.deleted_at}`
        );
      }

      if (foundComment.user_id !== TARGET_ACCOUNT_ID) {
        summary.seededRowsLinkedToWrongAccount.push(
          `comment_id=${foundComment.id}, place_id=${foundComment.place_id}: user_id=${foundComment.user_id}`
        );
      }

      if (foundComment.comment !== entry.place_comment.comment) {
        summary.seededCommentsWithWrongText.push(
          `comment_id=${foundComment.id}, place_id=${foundComment.place_id}: text mismatch`
        );
      }

      if (entry.place_id !== foundComment.place_id) {
        summary.seededRowsLinkedToWrongPlace.push(
          `comment_id=${foundComment.id}: expected place_id=${entry.place_id}, got ${foundComment.place_id}`
        );
      }
    }

    const allSeededCommentIds = new Set([...expectedCommentIds, ...resolvedCommentIds]);
    for (const [pid, comments] of commentByPlace) {
      const activeTopLevel = comments.filter(
        (c: any) =>
          allSeededCommentIds.has(c.id) &&
          c.parent_comment_id === null &&
          c.deleted_at === null &&
          c.status === "visible"
      );
      if (activeTopLevel.length > 1) {
        summary.duplicateTargetAccountActiveParentComments.push(
          `place_id=${pid}: ${activeTopLevel.length} active top-level comments (IDs: ${activeTopLevel.map((c: any) => c.id).join(", ")})`
        );
      }
    }

    const seededCommentCount = seededComments.length;
  }
}

function printSeedSummary(summary: SeedSummary, plan: PlannedOperation, exitCode: number): void {
  console.log("\n==================================================");
  console.log("  SEED SUMMARY");
  console.log("==================================================");
  console.log(`  Part 1 source entries:                     ${summary.part1SourceEntries}`);
  console.log(`  Part 2 source entries:                     ${summary.part2SourceEntries}`);
  console.log(`  Total source entries:                      ${summary.totalSourceEntries}`);
  console.log(`  Matched active places:                     ${summary.matchedActivePlaces}`);
  console.log(`  Reviews inserted:                          ${summary.reviewsInserted}`);
  console.log(`  Reviews updated:                           ${summary.reviewsUpdated}`);
  console.log(`  Reviews unchanged:                         ${summary.reviewsUnchanged}`);
  console.log(`  Comments inserted:                         ${summary.commentsInserted}`);
  console.log(`  Comments updated:                          ${summary.commentsUpdated}`);
  console.log(`  Comments unchanged:                        ${summary.commentsUnchanged}`);
  console.log(`  Resolved conflicts:                        ${summary.resolvedConflicts}`);
  console.log(`  Unresolved conflicts:                      ${summary.unresolvedConflicts}`);
  console.log(`  Failed rows:                               ${summary.failedRows}`);
  console.log(`  Aggregate mismatches:                      ${summary.aggregateMismatches.length}`);
  console.log(`  Duplicate target-account reviews:          ${summary.duplicateTargetAccountReviews.length}`);
  console.log(`  Duplicate target-account comments:         ${summary.duplicateTargetAccountActiveParentComments.length}`);
  console.log(`  Reviews with non-null comments:            ${summary.targetAccountReviewsWithNonNullComments.length}`);
  console.log(`  Comments with non-null parent_comment_id:  ${summary.targetAccountCommentsWithNonNullParentCommentId.length}`);
  console.log(`  Comments with non-active status:           ${summary.targetAccountCommentsWithNonActiveStatus.length}`);
  console.log(`  Comments with non-null deleted_at:         ${summary.targetAccountCommentsWithNonNullDeletedAt.length}`);
  console.log(`  Wrong account links:                       ${summary.seededRowsLinkedToWrongAccount.length}`);
  console.log(`  Wrong place links:                         ${summary.seededRowsLinkedToWrongPlace.length}`);
  console.log(`  Comment text mismatches:                   ${summary.seededCommentsWithWrongText.length}`);
  console.log(`  Rating value mismatches:                   ${summary.seededRatingsWithWrongValue.length}`);

  if (
    summary.failedRows === 0 &&
    summary.unresolvedConflicts === 0 &&
    summary.aggregateMismatches.length === 0 &&
    summary.duplicateTargetAccountReviews.length === 0 &&
    summary.duplicateTargetAccountActiveParentComments.length === 0 &&
    summary.targetAccountReviewsWithNonNullComments.length === 0 &&
    summary.targetAccountCommentsWithNonNullParentCommentId.length === 0 &&
    summary.targetAccountCommentsWithNonActiveStatus.length === 0 &&
    summary.targetAccountCommentsWithNonNullDeletedAt.length === 0 &&
    summary.seededRowsLinkedToWrongAccount.length === 0 &&
    summary.seededRowsLinkedToWrongPlace.length === 0 &&
    summary.seededCommentsWithWrongText.length === 0 &&
    summary.seededRatingsWithWrongValue.length === 0
  ) {
    console.log("\n  RESULT: SUCCESS — All feedback seeded correctly.");
  } else {
    console.log("\n  RESULT: FAILED — See details above.");
  }

  console.log("==================================================\n");

  if (summary.aggregateMismatches.length > 0) {
    console.log("  Aggregate mismatches:");
    for (const m of summary.aggregateMismatches) {
      console.log(`    ${m}`);
    }
  }

  if (summary.seededCommentsWithWrongText.length > 0) {
    console.log("  Comment text mismatches (first 5 shown):");
    for (const m of summary.seededCommentsWithWrongText.slice(0, 5)) {
      console.log(`    ${m}`);
    }
  }

  process.exit(exitCode);
}

async function main(): Promise<void> {
  const options = parseCliOptions();

  console.log("==================================================");
  console.log("  GalaTayo Place Feedback Seed");
  console.log("==================================================");
  console.log(`  Dry run:             ${options.dryRun}`);
  console.log(`  Resolve conflicts:   ${options.resolveConflicts}`);
  console.log(`  Part:                ${options.part}`);
  console.log("==================================================\n");

  const seedDir = getSeedDirectory();

  const part1Path = path.join(seedDir, "galatayo-place-feedback-part-1.json");
  const part2Path = path.join(seedDir, "galatayo-place-feedback-part-2.json");

  console.log("  Loading JSON files...\n");
  const part1 = loadFeedbackFile(part1Path, "part 1");
  const part2 = loadFeedbackFile(part2Path, "part 2");

  const allEntries = getAllEntries(part1, part2);
  const selectedEntries = getSelectedEntries(allEntries, options.part);

  console.log(`\n  Selected ${selectedEntries.length} entries for processing (part=${options.part})`);

  const supabase = await createSupabaseClient();

  const counts = await validateAll(supabase, part1, part2, allEntries, selectedEntries, options);

  if (
    counts.invalidRatings.length > 0 ||
    counts.invalidReviewComments.length > 0 ||
    counts.invalidParentCommentIds.length > 0 ||
    counts.invalidStatuses.length > 0 ||
    counts.invalidDeletedAt.length > 0 ||
    counts.missingPlaces.length > 0 ||
    counts.inactivePlaces.length > 0 ||
    counts.nameMismatches.length > 0 ||
    !counts.accountValid ||
    counts.combinedCount === 0
  ) {
    console.log("  Aborting due to validation failures.\n");
    process.exit(1);
  }

  const plan = await planOperations(supabase, selectedEntries, options);

  printPlannedOperations(plan, counts, options);

  if (options.dryRun) {
    console.log("  DRY RUN — no changes made.");
    const drySummary: SeedSummary = {
      part1SourceEntries: selectedEntries.filter((e) => e.source_index >= 0 && e.source_index <= 274).length,
      part2SourceEntries: selectedEntries.filter((e) => e.source_index >= 275 && e.source_index <= 549).length,
      totalSourceEntries: selectedEntries.length,
      matchedActivePlaces: counts.matchedPlaces,
      reviewsInserted: 0,
      reviewsUpdated: 0,
      reviewsUnchanged: 0,
      commentsInserted: 0,
      commentsUpdated: 0,
      commentsUnchanged: 0,
      resolvedConflicts: 0,
      unresolvedConflicts: options.resolveConflicts ? 0 : plan.commentConflicts.length,
      failedRows: 0,
      aggregateMismatches: [],
      duplicateTargetAccountReviews: counts.duplicateExistingReviews,
      duplicateTargetAccountActiveParentComments: counts.duplicateExistingParentComments,
      targetAccountReviewsWithNonNullComments: [],
      targetAccountCommentsWithNonNullParentCommentId: [],
      targetAccountCommentsWithNonActiveStatus: [],
      targetAccountCommentsWithNonNullDeletedAt: [],
      seededRowsLinkedToWrongAccount: [],
      seededRowsLinkedToWrongPlace: [],
      seededCommentsWithWrongText: [],
      seededRatingsWithWrongValue: [],
    };
    printSeedSummary(drySummary, plan, plan.commentConflicts.length > 0 && !options.resolveConflicts ? 1 : 0);
    return;
  }

  if (plan.commentConflicts.length > 0 && !options.resolveConflicts) {
    console.log("  ABORTING due to unresolved comment conflicts.");
    console.log("  Use --resolve-conflicts to update existing comments.\n");
    process.exit(1);
  }

  const hasDuplicateReviews = counts.duplicateExistingReviews.length > 0;
  const hasDuplicateComments = counts.duplicateExistingParentComments.length > 0;
  if (hasDuplicateReviews && hasDuplicateComments) {
    console.log("  ABORTING due to existing duplicate reviews and comments.");
    console.log("  These must be resolved in the database before seeding.\n");
    process.exit(1);
  }
  if (hasDuplicateReviews) {
    console.log("  ABORTING due to existing duplicate reviews.");
    console.log("  Resolve duplicates in the place_reviews table first.\n");
    process.exit(1);
  }
  if (hasDuplicateComments) {
    console.log("  ABORTING due to existing duplicate active top-level comments.");
    console.log("  Resolve duplicates in the place_comments table first.\n");
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("  EXECUTING SEED");
  console.log("==================================================\n");

  const summary = await seedPlaceFeedback(supabase, selectedEntries, plan, options);

  const hasErrors =
    summary.failedRows > 0 ||
    summary.unresolvedConflicts > 0 ||
    summary.aggregateMismatches.length > 0 ||
    summary.duplicateTargetAccountReviews.length > 0 ||
    summary.duplicateTargetAccountActiveParentComments.length > 0 ||
    summary.targetAccountReviewsWithNonNullComments.length > 0 ||
    summary.targetAccountCommentsWithNonNullParentCommentId.length > 0 ||
    summary.targetAccountCommentsWithNonActiveStatus.length > 0 ||
    summary.targetAccountCommentsWithNonNullDeletedAt.length > 0 ||
    summary.seededRowsLinkedToWrongAccount.length > 0 ||
    summary.seededRowsLinkedToWrongPlace.length > 0 ||
    summary.seededCommentsWithWrongText.length > 0 ||
    summary.seededRatingsWithWrongValue.length > 0;

  printSeedSummary(summary, plan, hasErrors ? 1 : 0);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
