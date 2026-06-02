const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const seedPath = path.join(__dirname, "metroManilaPlaceSeeds.json");
const validatorPath = path.join(
  __dirname,
  "..",
  "dist",
  "src",
  "utils",
  "placeSeedValidation.js"
);

const CATEGORY_NAME_TO_ID = new Map([
  ["kainan", "kainan"],
  ["cafe", "cafe"],
  ["mall", "mall"],
  ["parke", "parke"],
  ["park", "parke"],
  ["museum", "museum"],
  ["heritage", "heritage"],
  ["tourist", "tourist"],
  ["date", "date"],
  ["barkada", "barkada"],
  ["family", "family"],
  ["study", "study"],
  ["chill", "chill"],
  ["nightlife", "nightlife"],
  ["arcade", "arcade"],
  ["cinema", "cinema"],
]);

const KNOWN_CATEGORY_IDS = new Set(CATEGORY_NAME_TO_ID.values());

const EXPERIENCE_TAG_IDS = new Set([
  "indoor",
  "outdoor",
  "walkable",
  "commute-friendly",
  "commuter-friendly",
  "budget-friendly",
  "family-friendly",
  "date-friendly",
  "group-friendly",
  "barkada-friendly",
  "quiet",
  "photo-friendly",
  "airconditioned",
  "late-night",
  "food-options",
  "study-friendly",
  "kid-friendly",
  "relaxing",
  "rain-friendly",
  "lively",
  "crowded",
  "solo-friendly",
  "free-entry",
  "paid-entry",
  "tourist-friendly",
  "educational",
  "historical",
  "peaceful",
  "local-experience",
  "activity-friendly",
  "activity-based",
  "culture",
  "art",
  "cultural",
  "scenic",
  "skyline-view",
  "rooftop",
  "reservation-recommended",
  "reservation-required",
  "queue-likely",
]);

const TAG_NAME_TO_ID = new Map(
  [...EXPERIENCE_TAG_IDS].flatMap((tagId) => [
    [tagId, tagId],
    [normalizeText(tagId), tagId],
    [normalizeText(tagId.replace(/-/g, " ")), tagId],
  ])
);

TAG_NAME_TO_ID.set("rainy-day-friendly", "rain-friendly");
TAG_NAME_TO_ID.set("rainy day friendly", "rain-friendly");
TAG_NAME_TO_ID.set("food-trip", "food-options");
TAG_NAME_TO_ID.set("food trip", "food-options");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function printIssue(issue) {
  const indexText = issue.index === undefined ? "-" : String(issue.index);
  const placeText = issue.place || "-";
  const fieldText = issue.field || "-";
  console.log(
    `  [index=${indexText}] [place=${placeText}] [field=${fieldText}] ${issue.code}: ${issue.message}`
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function getTrimmedString(record, field) {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getNullableString(record, field) {
  return getTrimmedString(record, field);
}

function getStringArray(record, field) {
  if (!Array.isArray(record[field])) {
    return [];
  }

  return record[field]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
}

function getJsonArray(record, field) {
  return Array.isArray(record[field]) ? record[field] : [];
}

function getNullableNumber(record, field) {
  return record[field] === undefined ? null : getNumberOrNull(record[field]);
}

function getNullableBoolean(record, field) {
  return typeof record[field] === "boolean" ? record[field] : null;
}

function getCategoryId(category) {
  if (typeof category === "string") {
    return KNOWN_CATEGORY_IDS.has(category)
      ? category
      : CATEGORY_NAME_TO_ID.get(normalizeText(category)) || null;
  }

  if (!category || typeof category !== "object" || Array.isArray(category)) {
    return null;
  }

  const rawId = getTrimmedString(category, "id") || getTrimmedString(category, "category_id");
  const rawName = getTrimmedString(category, "name") || rawId;

  if (rawId && KNOWN_CATEGORY_IDS.has(rawId)) {
    return rawId;
  }

  return rawName ? CATEGORY_NAME_TO_ID.get(normalizeText(rawName)) || null : null;
}

function getTagId(tag) {
  if (typeof tag === "string") {
    return EXPERIENCE_TAG_IDS.has(tag) ? tag : TAG_NAME_TO_ID.get(normalizeText(tag)) || null;
  }

  if (!tag || typeof tag !== "object" || Array.isArray(tag)) {
    return null;
  }

  const rawId = getTrimmedString(tag, "id") || getTrimmedString(tag, "tag_id");
  const rawName = getTrimmedString(tag, "name") || rawId;

  if (rawId && EXPERIENCE_TAG_IDS.has(rawId)) {
    return rawId;
  }

  return rawName ? TAG_NAME_TO_ID.get(normalizeText(rawName)) || null : null;
}

function getTagStrength(tag) {
  if (!tag || typeof tag !== "object" || Array.isArray(tag)) {
    return 3;
  }

  return getNumberOrNull(tag.strength) || 3;
}

function getTagSource(tag) {
  if (!tag || typeof tag !== "object" || Array.isArray(tag)) {
    return "seed";
  }

  return getTrimmedString(tag, "source") || "seed";
}

function getPrimaryCategory(record) {
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const firstCategoryId = getCategoryId(categories[0]);
  return firstCategoryId || "Place";
}

function getPhotoUrl(record) {
  return (
    getNullableString(record, "photo_url") ||
    getNullableString(record, "image_url") ||
    (Array.isArray(record.photos)
      ? record.photos.find((photo) => typeof photo === "string" && photo.trim())?.trim()
      : null) ||
    null
  );
}

function getPhotos(record) {
  if (!Array.isArray(record.photos)) {
    return null;
  }

  const photos = record.photos
    .filter((photo) => typeof photo === "string" && photo.trim())
    .map((photo) => photo.trim());

  return photos.length > 0 ? photos : null;
}

function toPlaceRow(record) {
  const row = {
    foursquare_id: getNullableString(record, "foursquare_id") || `manual-${record.slug}`,
    name: getTrimmedString(record, "name"),
    slug: getTrimmedString(record, "slug"),
    category: getPrimaryCategory(record),
    address: getNullableString(record, "address") || getNullableString(record, "area"),
    city: getNullableString(record, "city") || getNullableString(record, "city_id"),
    latitude: getNumberOrNull(record.latitude),
    longitude: getNumberOrNull(record.longitude),
    rating: getNullableNumber(record, "rating"),
    hours: record.hours === undefined ? null : record.hours,
    photo_url: getPhotoUrl(record),
    photos: getPhotos(record),
    area: getNullableString(record, "area"),
    description: getNullableString(record, "description"),
    place_history: getNullableString(record, "place_history"),
    detail_summary: getNullableString(record, "detail_summary"),
    best_for: getStringArray(record, "best_for"),
    best_time_to_visit: getNullableString(record, "best_time_to_visit"),
    visit_duration: getNullableString(record, "visit_duration"),
    good_for: getStringArray(record, "good_for"),
    not_ideal_for: getStringArray(record, "not_ideal_for"),
    crowd_level: getNullableString(record, "crowd_level"),
    indoor_outdoor: getNullableString(record, "indoor_outdoor"),
    weather_fit: getNullableString(record, "weather_fit"),
    commute_friendly: getNullableBoolean(record, "commute_friendly"),
    commute_access: getNullableString(record, "commute_access"),
    parking_info: getNullableString(record, "parking_info"),
    accessibility_notes: getNullableString(record, "accessibility_notes"),
    nearby_context: getNullableString(record, "nearby_context"),
    decision_reason: getNullableString(record, "decision_reason"),
    what_to_expect: getStringArray(record, "what_to_expect"),
    tips: getStringArray(record, "tips"),
    hours_text: getNullableString(record, "hours_text"),
    entrance_fee_text: getNullableString(record, "entrance_fee_text"),
    best_time_text: getNullableString(record, "best_time_text"),
    google_maps_url: getNullableString(record, "google_maps_url"),
    source_url: getNullableString(record, "source_url"),
    official_url: getNullableString(record, "official_url"),
    website_url: getNullableString(record, "website_url"),
    data_source: getNullableString(record, "data_source"),
    last_verified_at: getNullableString(record, "last_verified_at"),
    verification_status: getNullableString(record, "verification_status"),
    verification_notes: getNullableString(record, "verification_notes"),
    verification_sources: getJsonArray(record, "verification_sources"),
    budget_min: getNullableNumber(record, "budget_min"),
    budget_max: getNullableNumber(record, "budget_max"),
    budget_currency: getNullableString(record, "budget_currency") || "PHP",
    budget_label: getNullableString(record, "budget_label"),
    budget_notes: getNullableString(record, "budget_notes"),
    is_free: getNullableBoolean(record, "is_free") ?? false,
    is_known_place: getNullableBoolean(record, "is_known_place") ?? false,
    popularity_score: getNullableNumber(record, "popularity_score") ?? 0,
    ranking_priority: getNullableNumber(record, "ranking_priority") ?? 0,
    quality_score: getNullableNumber(record, "quality_score") ?? 0,
  };

  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined)
  );
}

function getCategoryLinks(records, placeBySlug) {
  const links = [];
  const seen = new Set();

  for (const record of records) {
    const place = placeBySlug.get(record.slug);
    const categories = Array.isArray(record.categories) ? record.categories : [];

    for (const category of categories) {
      const categoryId = getCategoryId(category);
      const key = `${place.id}:${categoryId}`;

      if (categoryId && !seen.has(key)) {
        seen.add(key);
        links.push({ place_id: place.id, category_id: categoryId });
      }
    }
  }

  return links;
}

function getTagLinks(records, placeBySlug) {
  const links = [];
  const seen = new Set();

  for (const record of records) {
    const place = placeBySlug.get(record.slug);
    const tags = Array.isArray(record.tags) ? record.tags : [];

    for (const tag of tags) {
      const tagId = getTagId(tag);
      const key = `${place.id}:${tagId}`;

      if (tagId && !seen.has(key)) {
        seen.add(key);
        links.push({
          place_id: place.id,
          tag_id: tagId,
          strength: getTagStrength(tag),
          source: getTagSource(tag),
        });
      }
    }
  }

  return links;
}

function countBy(records, getKey) {
  const counts = new Map();

  for (const record of records) {
    const key = getKey(record);
    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function printCoverage(records) {
  console.log("");
  console.log("Developer coverage summary");

  const byCity = countBy(records, (record) => record.city || record.city_id || "Unknown city");
  console.log("Places per city:");
  if (byCity.length === 0) {
    console.log("  none");
  } else {
    byCity.forEach(([city, count]) => console.log(`  ${city}: ${count}`));
  }

  const categoryCounts = new Map();
  const cityCategoryCounts = new Map();

  for (const record of records) {
    const city = record.city || record.city_id || "Unknown city";
    const categories = Array.isArray(record.categories) ? record.categories : [];

    for (const category of categories) {
      const categoryId = getCategoryId(category);

      if (!categoryId) {
        continue;
      }

      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
      const cityCategoryKey = `${city} / ${categoryId}`;
      cityCategoryCounts.set(cityCategoryKey, (cityCategoryCounts.get(cityCategoryKey) || 0) + 1);
    }
  }

  const byCategory = [...categoryCounts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  console.log("Places per category:");
  if (byCategory.length === 0) {
    console.log("  none");
  } else {
    byCategory.forEach(([category, count]) => console.log(`  ${category}: ${count}`));
  }

  const byCityCategory = [...cityCategoryCounts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  console.log("Categories covered per city:");
  if (byCityCategory.length === 0) {
    console.log("  none");
  } else {
    byCityCategory.forEach(([cityCategory, count]) =>
      console.log(`  ${cityCategory}: ${count}`)
    );
  }
}

async function getKeyVaultSecret(client, secretName) {
  const secret = await client.getSecret(secretName);

  if (!secret.value) {
    throw new Error(`Key Vault secret "${secretName}" has no value.`);
  }

  return secret.value;
}

async function resolveSupabaseCredentials() {
  let supabaseUrl = process.env.SUPABASE_URL;
  let supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyVaultUrl = process.env.KEY_VAULT_URL;

  if ((!supabaseUrl || !supabaseServiceRoleKey) && keyVaultUrl) {
    try {
      const { DefaultAzureCredential } = require("@azure/identity");
      const { SecretClient } = require("@azure/keyvault-secrets");
      const credential = new DefaultAzureCredential();
      const client = new SecretClient(keyVaultUrl, credential);

      if (!supabaseUrl) {
        supabaseUrl = await getKeyVaultSecret(client, "supabase-url");
      }

      if (!supabaseServiceRoleKey) {
        supabaseServiceRoleKey = await getKeyVaultSecret(
          client,
          "supabase-service-role-key"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read Supabase credentials from Key Vault: ${message}`);
    }
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set KEY_VAULT_URL with secrets \"supabase-url\" and \"supabase-service-role-key\"."
    );
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

async function verifyIdsExist(supabase, table, ids, label) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);

  if (uniqueIds.length === 0) {
    return;
  }

  const { data, error } = await supabase.from(table).select("id").in("id", uniqueIds);

  if (error) {
    throw new Error(`Failed to verify ${label}: ${error.message}`);
  }

  const foundIds = new Set((data || []).map((row) => row.id));
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(
      `${label} must already exist in public.${table}: ${missingIds.join(", ")}`
    );
  }
}

async function fetchExistingPlacesBySlug(supabase, slugs) {
  if (slugs.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("places")
    .select("id,slug")
    .in("slug", slugs);

  if (error) {
    throw new Error(`Failed to read existing places: ${error.message}`);
  }

  return new Map((data || []).map((place) => [place.slug, place]));
}

function getMissingColumn(error) {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  const match =
    text.match(/'([^']+)' column/) ||
    text.match(/column "([^"]+)"/) ||
    text.match(/Could not find the '([^']+)'/);

  return match ? match[1] : null;
}

async function upsertPlaces(supabase, rows) {
  let activeRows = rows;
  const skippedColumns = [];

  while (true) {
    const { data, error } = await supabase
      .from("places")
      .upsert(activeRows, { onConflict: "slug" })
      .select("id,name,slug");

    if (!error) {
      return { places: data || [], skippedColumns };
    }

    const missingColumn = getMissingColumn(error);

    if (!missingColumn) {
      throw new Error(`Failed to upsert places: ${error.message}`);
    }

    skippedColumns.push(missingColumn);
    activeRows = activeRows.map((row) => {
      const nextRow = { ...row };
      delete nextRow[missingColumn];
      return nextRow;
    });
  }
}

async function insertMissingLinks(supabase, table, keys, rows) {
  if (rows.length === 0) {
    return { created: 0, existing: 0 };
  }

  const placeIds = [...new Set(rows.map((row) => row.place_id))];
  const { data, error } = await supabase
    .from(table)
    .select(keys.join(","))
    .in("place_id", placeIds);

  if (error) {
    throw new Error(`Failed to read existing ${table}: ${error.message}`);
  }

  const existingKeys = new Set(
    (data || []).map((row) => keys.map((key) => row[key]).join(":"))
  );
  const missingRows = rows.filter(
    (row) => !existingKeys.has(keys.map((key) => row[key]).join(":"))
  );

  if (missingRows.length > 0) {
    const { error: insertError } = await supabase.from(table).insert(missingRows);

    if (insertError) {
      throw new Error(`Failed to insert ${table}: ${insertError.message}`);
    }
  }

  return {
    created: missingRows.length,
    existing: rows.length - missingRows.length,
  };
}

function printImportSummary(summary) {
  console.log("");
  console.log("Metro Manila place seed import summary");
  console.log(`Total seed records: ${summary.totalRecords}`);
  console.log(`Valid records: ${summary.validRecords}`);
  console.log(`Inserted places: ${summary.insertedPlaces}`);
  console.log(`Updated places: ${summary.updatedPlaces}`);
  console.log(
    `Category links: ${summary.categoryLinks.created} created, ${summary.categoryLinks.existing} already existing`
  );
  console.log(
    `Tag links: ${summary.tagLinks.created} created, ${summary.tagLinks.existing} already existing`
  );
  console.log(`Warnings: ${summary.warnings}`);
  console.log(`Errors: ${summary.errors}`);

  if (summary.skippedColumns.length > 0) {
    console.log(
      `Skipped place columns not present in this database schema: ${summary.skippedColumns.join(", ")}`
    );
  }
}

async function main() {
  if (!fs.existsSync(validatorPath)) {
    console.error(
      "Place seed validator build output was not found. Run `npm run build` from backend first."
    );
    process.exit(1);
  }

  const { validatePlaceSeedRecords } = require(validatorPath);
  const seedData = readJson(seedPath);
  const records = Array.isArray(seedData) ? seedData : seedData.places;
  const totalRecords = Array.isArray(records) ? records.length : 0;
  const validation = validatePlaceSeedRecords(records);

  console.log("GM-138 validation summary");
  console.log(`File: ${seedPath}`);
  console.log(`Total records: ${totalRecords}`);
  console.log(`Errors: ${validation.errors.length}`);
  console.log(`Warnings: ${validation.warnings.length}`);
  console.log(`Status: ${validation.valid ? "validation passed" : "validation failed"}`);

  if (validation.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    validation.errors.forEach(printIssue);
  }

  if (validation.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    validation.warnings.forEach(printIssue);
  }

  if (validation.errors.length > 0) {
    printImportSummary({
      totalRecords,
      validRecords: 0,
      insertedPlaces: 0,
      updatedPlaces: 0,
      categoryLinks: { created: 0, existing: 0 },
      tagLinks: { created: 0, existing: 0 },
      warnings: validation.warnings.length,
      errors: validation.errors.length,
      skippedColumns: [],
    });
    process.exit(1);
  }

  if (totalRecords === 0) {
    printImportSummary({
      totalRecords,
      validRecords: 0,
      insertedPlaces: 0,
      updatedPlaces: 0,
      categoryLinks: { created: 0, existing: 0 },
      tagLinks: { created: 0, existing: 0 },
      warnings: validation.warnings.length,
      errors: validation.errors.length,
      skippedColumns: [],
    });
    printCoverage([]);
    console.log("");
    console.log("No records to import. Supabase connection skipped.");
    return;
  }

  const importableRecords = records.filter(
    (record) =>
      record &&
      typeof record === "object" &&
      !Array.isArray(record) &&
      record.verification_status === "verified"
  );

  if (importableRecords.length !== totalRecords) {
    throw new Error(
      `Only verified places can be imported. ${totalRecords - importableRecords.length} non-verified record(s) were blocked.`
    );
  }

  const normalizedRecords = importableRecords.map((record) => ({
    ...record,
    slug: getTrimmedString(record, "slug"),
  }));
  const slugs = normalizedRecords.map((record) => record.slug);
  const placeRows = normalizedRecords.map(toPlaceRow);

  const categoryIds = getCategoryLinks(
    normalizedRecords,
    new Map(normalizedRecords.map((record) => [record.slug, { id: record.slug }]))
  ).map((link) => link.category_id);
  const tagIds = getTagLinks(
    normalizedRecords,
    new Map(normalizedRecords.map((record) => [record.slug, { id: record.slug }]))
  ).map((link) => link.tag_id);

  const { supabaseUrl, supabaseServiceRoleKey } = await resolveSupabaseCredentials();
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  await verifyIdsExist(supabase, "categories", categoryIds, "Category IDs");
  await verifyIdsExist(supabase, "tags", tagIds, "Tag IDs");

  const existingPlaces = await fetchExistingPlacesBySlug(supabase, slugs);
  const { places, skippedColumns } = await upsertPlaces(supabase, placeRows);
  const placeBySlug = new Map(places.map((place) => [place.slug, place]));

  const categoryLinks = getCategoryLinks(normalizedRecords, placeBySlug);
  const tagLinks = getTagLinks(normalizedRecords, placeBySlug);
  const categoryLinkSummary = await insertMissingLinks(
    supabase,
    "place_categories",
    ["place_id", "category_id"],
    categoryLinks
  );
  const tagLinkSummary = await insertMissingLinks(
    supabase,
    "place_tags",
    ["place_id", "tag_id"],
    tagLinks
  );

  printImportSummary({
    totalRecords,
    validRecords: totalRecords,
    insertedPlaces: slugs.filter((slug) => !existingPlaces.has(slug)).length,
    updatedPlaces: slugs.filter((slug) => existingPlaces.has(slug)).length,
    categoryLinks: categoryLinkSummary,
    tagLinks: tagLinkSummary,
    warnings: validation.warnings.length,
    errors: validation.errors.length,
    skippedColumns,
  });
  printCoverage(normalizedRecords);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Metro Manila seed import failed: ${message}`);
  process.exit(1);
});
