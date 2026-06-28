import {
  METRO_MANILA_LOCATION_KEYWORDS,
  getMetroManilaLocationKeywordsForCity,
} from "./metroManilaLocations";
import { normalizeSearchText } from "./searchMatching";

export type PlaceSeedValidationIssue = {
  index?: number;
  place?: string;
  field?: string;
  code: string;
  message: string;
};

export type PlaceSeedValidationResult = {
  valid: boolean;
  errors: PlaceSeedValidationIssue[];
  warnings: PlaceSeedValidationIssue[];
};

export type PlaceSeedValidationOptions = {
  index?: number;
};

type PlaceSeedRecord = Record<string, unknown>;

type NormalizedCategory = {
  id: string;
  name: string;
};

type NormalizedTag = {
  id: string;
  name: string;
  strength?: unknown;
  source?: unknown;
};

const VALID_CATEGORY_IDS = new Set([
  "kainan",
  "cafe",
  "mall",
  "parke",
  "museum",
  "heritage",
  "tourist",
  "date",
  "barkada",
  "family",
  "study",
  "chill",
  "nightlife",
  "arcade",
  "cinema",
]);

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

const REMOVED_CATEGORY_IDS = new Set([
  "tourist-spot",
  "tourist spot",
  "date-spot",
  "date spot",
  "study-spot",
  "study spot",
  "arcade-games",
  "arcade games",
  "shopping",
  "wellness",
  "clinic",
  "dental",
  "pharmacy",
  "hospital",
  "transport",
  "service",
  "services",
  "hotel",
  "hotel-stay",
  "hotel stay",
  "pets",
  "pet-friendly",
  "pet friendly",
  "religious",
  "market",
  "sports",
  "sports-fitness",
  "sports fitness",
  "coworking",
  "dessert",
]);

const EXPERIENCE_TAG_IDS = new Set([
  "indoor",
  "outdoor",
  "airconditioned",
  "rain-friendly",
  "walkable",
  "quiet",
  "chill",
  "lively",
  "crowded",
  "photo-friendly",
  "late-night",
  "rooftop",
  "romantic",
  "scenic",
  "green-space",
  "food-trip",
  "parking-available",
  "date-friendly",
  "family-friendly",
  "barkada-friendly",
  "kid-friendly",
  "budget-friendly",
  "premium",
  "free-entry",
  "study-friendly",
  "tourist-friendly",
  "educational",
  "heritage",
  "activity-based",
  "cultural",
  "live-music",
  "sports-friendly",
  "active",
  "known-place",
  "commute-friendly",
]);

const TAG_NAME_TO_ID = new Map(
  [...EXPERIENCE_TAG_IDS].flatMap((tagId) => [
    [tagId, tagId],
    [normalizeSearchText(tagId), tagId],
    [normalizeSearchText(tagId.replace(/-/g, " ")), tagId],
  ])
);

TAG_NAME_TO_ID.set("rainy day friendly", "rain-friendly");
TAG_NAME_TO_ID.set("rainy-day-friendly", "rain-friendly");
TAG_NAME_TO_ID.set("relaxing", "chill");
TAG_NAME_TO_ID.set("relaxed", "chill");
TAG_NAME_TO_ID.set("cozy", "chill");
TAG_NAME_TO_ID.set("student friendly", "study-friendly");
TAG_NAME_TO_ID.set("student-friendly", "study-friendly");
TAG_NAME_TO_ID.set("commute friendly", "commute-friendly");
TAG_NAME_TO_ID.set("commuter friendly", "commute-friendly");
TAG_NAME_TO_ID.set("commuter-friendly", "commute-friendly");
TAG_NAME_TO_ID.set("food trip", "food-trip");
TAG_NAME_TO_ID.set("food-trip", "food-trip");
TAG_NAME_TO_ID.set("group friendly", "barkada-friendly");
TAG_NAME_TO_ID.set("group-friendly", "barkada-friendly");
TAG_NAME_TO_ID.set("barkada friendly", "barkada-friendly");
TAG_NAME_TO_ID.set("local favorite", "known-place");
TAG_NAME_TO_ID.set("local-favorite", "known-place");
TAG_NAME_TO_ID.set("historic", "heritage");
TAG_NAME_TO_ID.set("mall based", "indoor");
TAG_NAME_TO_ID.set("mall-based", "indoor");
TAG_NAME_TO_ID.set("parking available", "parking-available");
TAG_NAME_TO_ID.set("parking-available", "parking-available");
TAG_NAME_TO_ID.set("parking friendly", "parking-available");
TAG_NAME_TO_ID.set("parking-friendly", "parking-available");
TAG_NAME_TO_ID.set("late night", "late-night");
TAG_NAME_TO_ID.set("late-night", "late-night");

const REJECTED_TAG_TERMS = new Set([
  "churros",
  "mango",
  "mozzarella-sticks",
  "mozzarella sticks",
  "cream-cheese",
  "cream cheese",
  "shawarma",
  "books",
  "parking",
  "gas-station",
  "gas station",
  "mall-grocery",
  "mall grocery",
  "clinic",
  "dental",
  "pharmacy",
  "hospital",
  "service",
  "services",
  "hotel",
  "pet-friendly",
  "market",
  "sports",
  "dessert",
  "coffee",
  "matcha",
  "ramen",
  "pizza",
  "burger",
  "froyo",
  "milk-tea",
]);

const VALID_TAG_SOURCES = new Set(["manual", "seed", "import", "system"]);
const VALID_VERIFICATION_STATUSES = new Set([
  "verified",
  "needs_review",
  "rejected_closed",
  "rejected_duplicate",
  "rejected_wrong_city",
  "rejected_not_gala_relevant",
]);
const VALID_BUDGET_LABELS = new Set([
  "Free",
  "Under ₱500",
  "₱500–₱1,000",
  "₱1,000–₱2,000",
  "₱2,000+",
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHILIPPINES_SAFE_BOUNDS = {
  minLatitude: 14.0,
  maxLatitude: 15.2,
  minLongitude: 120.5,
  maxLongitude: 121.5,
};

const REQUIRED_PLACE_GUIDE_FIELDS = [
  "best_time_to_visit",
  "visit_duration",
  "good_for",
  "not_ideal_for",
  "crowd_level",
  "indoor_outdoor",
  "weather_fit",
  "commute_friendly",
  "commute_access",
  "parking_info",
  "accessibility_notes",
  "nearby_context",
  "decision_reason",
] as const;

const DIRECTORY_TERMS = [
  "clinic",
  "dental",
  "dentist",
  "pharmacy",
  "hospital",
  "transport",
  "terminal",
  "repair",
  "laundry",
  "government office",
  "gas station",
  "pet shop",
  "religious service",
  "hotel stay",
];

const DIRECTORY_WARNING_TERMS = ["errand", "errands", "services nearby"];

const ROBOTIC_PHRASES = [
  "is a place that offers",
  "provides a variety of",
  "perfect for everyone",
  "must visit destination for all",
  "located in the heart of",
  "one of the best places",
];

const CITY_ID_TO_NAME = new Map(
  METRO_MANILA_LOCATION_KEYWORDS.map((location) => [
    location.cityId,
    location.cityName,
  ])
);
const CITY_LOOKUP = new Map<string, string>();

for (const location of METRO_MANILA_LOCATION_KEYWORDS) {
  CITY_LOOKUP.set(normalizeSearchText(location.cityId), location.cityId);
  CITY_LOOKUP.set(normalizeSearchText(location.cityName), location.cityId);

  for (const keyword of getMetroManilaLocationKeywordsForCity(location.cityId)) {
    CITY_LOOKUP.set(normalizeSearchText(keyword), location.cityId);
  }
}

function createResult(): PlaceSeedValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

function addIssue(
  issues: PlaceSeedValidationIssue[],
  issue: PlaceSeedValidationIssue,
  index?: number
): void {
  issues.push({
    ...issue,
    index: issue.index ?? index,
  });
}

function addError(
  result: PlaceSeedValidationResult,
  issue: PlaceSeedValidationIssue,
  index?: number
): void {
  addIssue(result.errors, issue, index);
  result.valid = false;
}

function addWarning(
  result: PlaceSeedValidationResult,
  issue: PlaceSeedValidationIssue,
  index?: number
): void {
  addIssue(result.warnings, issue, index);
}

function isObjectRecord(value: unknown): value is PlaceSeedRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getTrimmedString(record: PlaceSeedRecord, field: string): string | null {
  const value = record[field];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function isPresent(record: PlaceSeedRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidDateString(value: string): boolean {
  const parsedTime = Date.parse(value);
  return Number.isFinite(parsedTime);
}

function getRecordLabel(record: PlaceSeedRecord, index: number): string {
  const slug = getTrimmedString(record, "slug");
  const name = getTrimmedString(record, "name");

  return slug ?? name ?? `index ${index}`;
}

function withPlace(
  issues: PlaceSeedValidationIssue[],
  place: string
): PlaceSeedValidationIssue[] {
  return issues.map((issue) => ({ ...issue, place: issue.place ?? place }));
}

function resolveMetroManilaCityId(record: PlaceSeedRecord): string | null {
  const cityId = getTrimmedString(record, "city_id");
  const city = getTrimmedString(record, "city");

  if (cityId) {
    return CITY_LOOKUP.get(normalizeSearchText(cityId)) ?? null;
  }

  if (city) {
    return CITY_LOOKUP.get(normalizeSearchText(city)) ?? null;
  }

  return null;
}

function getStringArrayValue(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== ""
  );

  return strings.length === value.length ? strings.map((item) => item.trim()) : null;
}

function countSentences(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return 0;
  }

  const matches = normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g);

  if (matches) {
    return matches.length;
  }

  return normalized.length >= 40 ? 1 : 0;
}

function validateIdentityFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const name = getTrimmedString(record, "name");
  const slug = getTrimmedString(record, "slug");
  const address = getTrimmedString(record, "address");
  const area = getTrimmedString(record, "area");

  if (!name) {
    addError(result, {
      field: "name",
      code: "name_required",
      message: "Place name is required and must be a non-empty string.",
    }, index);
  }

  if (!slug) {
    addError(result, {
      field: "slug",
      code: "slug_required",
      message: "Slug is required and must be a non-empty lowercase kebab-case string.",
    }, index);
  } else if (!SLUG_PATTERN.test(slug)) {
    addError(result, {
      field: "slug",
      code: "slug_invalid_format",
      message:
        "Slug must use lowercase letters, numbers, and hyphens only, with no spaces, special characters, leading hyphen, or trailing hyphen.",
    }, index);
  }

  if (!resolveMetroManilaCityId(record)) {
    addError(result, {
      field: isPresent(record, "city_id") ? "city_id" : "city",
      code: "city_not_metro_manila",
      message: "City must be one of GalaTayo's supported Metro Manila LGUs.",
    }, index);
  }

  if (!address && !area) {
    addError(result, {
      field: "address",
      code: "address_or_area_required",
      message: "Address or area is required so cards and details have a useful location label.",
    }, index);
  }
}

function validateCoordinates(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const latitude = parseNumberValue(record.latitude);
  const longitude = parseNumberValue(record.longitude);

  if (latitude === null) {
    addError(result, {
      field: "latitude",
      code: "latitude_required",
      message: "Latitude is required and must be a valid number.",
    }, index);
  } else if (
    latitude < PHILIPPINES_SAFE_BOUNDS.minLatitude ||
    latitude > PHILIPPINES_SAFE_BOUNDS.maxLatitude
  ) {
    addError(result, {
      field: "latitude",
      code: "latitude_out_of_bounds",
      message: "Latitude must be between 14.0 and 15.2 for Metro Manila seed data.",
    }, index);
  }

  if (longitude === null) {
    addError(result, {
      field: "longitude",
      code: "longitude_required",
      message: "Longitude is required and must be a valid number.",
    }, index);
  } else if (
    longitude < PHILIPPINES_SAFE_BOUNDS.minLongitude ||
    longitude > PHILIPPINES_SAFE_BOUNDS.maxLongitude
  ) {
    addError(result, {
      field: "longitude",
      code: "longitude_out_of_bounds",
      message: "Longitude must be between 120.5 and 121.5 for Metro Manila seed data.",
    }, index);
  }
}

function validateRequiredUrl(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  field: string,
  index?: number
): void {
  const value = getTrimmedString(record, field);

  if (!value) {
    addError(result, {
      field,
      code: `${field}_required`,
      message: `${field} is required and must be a non-empty URL.`,
    }, index);
    return;
  }

  if (!isValidUrl(value)) {
    addError(result, {
      field,
      code: "url_invalid",
      message: `${field} must be a valid http or https URL.`,
    }, index);
  }
}

function validateVerificationFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  validateRequiredUrl(record, result, "google_maps_url", index);

  const verificationStatus = getTrimmedString(record, "verification_status");
  if (!verificationStatus) {
    addError(result, {
      field: "verification_status",
      code: "verification_status_required",
      message: "verification_status is required.",
    }, index);
  } else if (!VALID_VERIFICATION_STATUSES.has(verificationStatus)) {
    addError(result, {
      field: "verification_status",
      code: "verification_status_invalid",
      message:
        "verification_status must be one of verified, needs_review, rejected_closed, rejected_duplicate, rejected_wrong_city, or rejected_not_gala_relevant.",
    }, index);
  } else if (verificationStatus !== "verified") {
    addError(result, {
      field: "verification_status",
      code: "verification_status_blocks_import",
      message: `Only verification_status "verified" can be imported; "${verificationStatus}" is blocked.`,
    }, index);
  }

  if (!getTrimmedString(record, "verification_notes")) {
    addError(result, {
      field: "verification_notes",
      code: "verification_notes_required",
      message: "verification_notes is required and must explain the verification decision.",
    }, index);
  }

  const sources = getStringArrayValue(record.verification_sources);
  if (!sources || sources.length === 0) {
    addError(result, {
      field: "verification_sources",
      code: "verification_sources_required",
      message: "verification_sources is required and must be a non-empty array of source labels or URLs.",
    }, index);
  }

  const lastVerifiedAt = getTrimmedString(record, "last_verified_at");
  if (!lastVerifiedAt) {
    addError(result, {
      field: "last_verified_at",
      code: "last_verified_at_required",
      message: "last_verified_at is required.",
    }, index);
  } else if (!isValidDateString(lastVerifiedAt)) {
    addError(result, {
      field: "last_verified_at",
      code: "last_verified_at_invalid",
      message: "last_verified_at must be a valid date string.",
    }, index);
  }
}

function validateSentenceText(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  field: "description" | "place_history",
  index?: number
): void {
  const value = getTrimmedString(record, field);

  if (!value) {
    addError(result, {
      field,
      code: `${field}_required`,
      message: `${field} is required and should be 3 to 5 human, local, SEO-friendly sentences.`,
    }, index);
    return;
  }

  const sentenceCount = countSentences(value);
  if (sentenceCount < 3 || sentenceCount > 5) {
    addError(result, {
      field,
      code: `${field}_sentence_count_invalid`,
      message: `${field} should be 3 to 5 sentences; found ${sentenceCount}.`,
    }, index);
  }

  const normalized = normalizeSearchText(value);
  const roboticPhrase = ROBOTIC_PHRASES.find((phrase) =>
    normalized.includes(normalizeSearchText(phrase))
  );

  if (roboticPhrase) {
    addWarning(result, {
      field,
      code: `${field}_robotic_tone`,
      message: `${field} sounds generic or robotic because it includes "${roboticPhrase}".`,
    }, index);
  }
}

function validateRequiredGuideFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  for (const field of REQUIRED_PLACE_GUIDE_FIELDS) {
    const value = record[field];

    if (value === undefined || value === null || value === "") {
      addError(result, {
        field,
        code: `${field}_required`,
        message: `${field} is required for GalaTayo place-guide seed data.`,
      }, index);
      continue;
    }

    if (field === "good_for" || field === "not_ideal_for") {
      const values = getStringArrayValue(value);
      if (!values || values.length === 0) {
        addError(result, {
          field,
          code: `${field}_invalid`,
          message: `${field} must be a non-empty array of strings.`,
        }, index);
      }
      continue;
    }

    if (field === "commute_friendly") {
      if (typeof value !== "boolean") {
        addError(result, {
          field,
          code: `${field}_invalid`,
          message: `${field} must be a boolean.`,
        }, index);
      }
      continue;
    }

    if (typeof value !== "string" || value.trim() === "") {
      addError(result, {
        field,
        code: `${field}_invalid`,
        message: `${field} must be a non-empty string.`,
      }, index);
    }
  }

  validateSentenceText(record, result, "description", index);
  validateSentenceText(record, result, "place_history", index);
}

function validateBudgetFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const budgetMin = parseNumberValue(record.budget_min);
  const budgetMax = record.budget_max === null ? null : parseNumberValue(record.budget_max);

  if (!isPresent(record, "budget_min") || budgetMin === null || budgetMin < 0) {
    addError(result, {
      field: "budget_min",
      code: "budget_min_required",
      message:
        "budget_min is required and must be a number greater than or equal to 0. Use the starting budget, not a strict maximum.",
    }, index);
  }

  if (isPresent(record, "budget_max") && record.budget_max !== null) {
    if (budgetMax === null || budgetMax < 0) {
      addError(result, {
        field: "budget_max",
        code: "budget_max_invalid",
        message: "budget_max must be null or a number greater than or equal to 0.",
      }, index);
    }
  }

  if (budgetMin !== null && budgetMax !== null && budgetMax < budgetMin) {
    addError(result, {
      field: "budget_max",
      code: "budget_range_invalid",
      message: "budget_max must be greater than or equal to budget_min when provided.",
    }, index);
  }

  const budgetLabel = getTrimmedString(record, "budget_label");
  if (!budgetLabel) {
    addError(result, {
      field: "budget_label",
      code: "budget_label_required",
      message: "budget_label is required.",
    }, index);
  } else if (!VALID_BUDGET_LABELS.has(budgetLabel)) {
    addError(result, {
      field: "budget_label",
      code: "budget_label_invalid",
      message:
        "budget_label must be one of Free, Under ₱500, ₱500–₱1,000, ₱1,000–₱2,000, or ₱2,000+.",
    }, index);
  }

  if (!getTrimmedString(record, "budget_notes")) {
    addError(result, {
      field: "budget_notes",
      code: "budget_notes_required",
      message:
        "budget_notes is required and should explain that budget_min is a starting budget, not strict max spending.",
    }, index);
  }

  if (
    isPresent(record, "budget_currency") &&
    record.budget_currency !== undefined &&
    record.budget_currency !== null &&
    record.budget_currency !== "PHP"
  ) {
    addError(result, {
      field: "budget_currency",
      code: "budget_currency_invalid",
      message: "budget_currency must be PHP when provided.",
    }, index);
  }
}

function normalizeCategory(value: unknown): NormalizedCategory | null {
  if (typeof value === "string") {
    const normalizedValue = normalizeSearchText(value);
    const id = VALID_CATEGORY_IDS.has(value)
      ? value
      : CATEGORY_NAME_TO_ID.get(normalizedValue);

    return id ? { id, name: value } : null;
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  const id = getTrimmedString(value, "id") ?? getTrimmedString(value, "category_id");
  const name = getTrimmedString(value, "name") ?? id;
  const normalizedName = name ? normalizeSearchText(name) : "";
  const resolvedId =
    id && VALID_CATEGORY_IDS.has(id) ? id : CATEGORY_NAME_TO_ID.get(normalizedName);

  return resolvedId ? { id: resolvedId, name: name ?? resolvedId } : null;
}

function validateCategories(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const categories = record.categories;

  if (!Array.isArray(categories) || categories.length === 0) {
    addError(result, {
      field: "categories",
      code: "categories_required",
      message: "Every place must have at least one category from the final 15 GalaTayo categories.",
    }, index);
    return;
  }

  const seenCategoryIds = new Set<string>();

  categories.forEach((category, categoryIndex) => {
    const rawCategory =
      typeof category === "string"
        ? category
        : isObjectRecord(category)
          ? getTrimmedString(category, "id") ??
            getTrimmedString(category, "category_id") ??
            getTrimmedString(category, "name")
          : null;

    if (rawCategory && REMOVED_CATEGORY_IDS.has(normalizeSearchText(rawCategory))) {
      addError(result, {
        field: `categories[${categoryIndex}]`,
        code: "category_removed",
        message: `Category "${rawCategory}" was removed from GalaTayo and is not allowed in new seed data.`,
      }, index);
      return;
    }

    const normalizedCategory = normalizeCategory(category);

    if (!normalizedCategory) {
      addError(result, {
        field: `categories[${categoryIndex}]`,
        code: "category_unknown",
        message:
          "Category must be one of kainan, cafe, mall, parke, museum, heritage, tourist, date, barkada, family, study, chill, nightlife, arcade, or cinema.",
      }, index);
      return;
    }

    if (seenCategoryIds.has(normalizedCategory.id)) {
      addError(result, {
        field: `categories[${categoryIndex}]`,
        code: "category_duplicate",
        message: `Duplicate category "${normalizedCategory.id}" within the same place record.`,
      }, index);
    }

    seenCategoryIds.add(normalizedCategory.id);
  });
}

function normalizeTag(value: unknown): NormalizedTag | null {
  if (typeof value === "string") {
    const normalizedValue = normalizeSearchText(value);
    const id = EXPERIENCE_TAG_IDS.has(value) ? value : TAG_NAME_TO_ID.get(normalizedValue);

    return id ? { id, name: value } : null;
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  const rawId = getTrimmedString(value, "id") ?? getTrimmedString(value, "tag_id");
  const rawName = getTrimmedString(value, "name") ?? rawId;
  const normalizedName = rawName ? normalizeSearchText(rawName) : "";
  const id =
    rawId && EXPERIENCE_TAG_IDS.has(rawId) ? rawId : TAG_NAME_TO_ID.get(normalizedName);

  return id
    ? {
        id,
        name: rawName ?? id,
        strength: value.strength,
        source: value.source,
      }
    : null;
}

function validateTags(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const tags = record.tags;

  if (!Array.isArray(tags) || tags.length === 0) {
    addError(result, {
      field: "tags",
      code: "tags_required",
      message: "tags must be a non-empty array of approved experience-based GalaTayo tags.",
    }, index);
    return;
  }

  const seenTagIds = new Set<string>();

  tags.forEach((tag, tagIndex) => {
    const rawTag =
      typeof tag === "string"
        ? tag
        : isObjectRecord(tag)
          ? getTrimmedString(tag, "id") ??
            getTrimmedString(tag, "tag_id") ??
            getTrimmedString(tag, "name")
          : null;
    const normalizedRawTag = rawTag ? normalizeSearchText(rawTag) : "";

    if (rawTag && REJECTED_TAG_TERMS.has(normalizedRawTag)) {
      addError(result, {
        field: `tags[${tagIndex}]`,
        code: "tag_not_experience_based",
        message: `Tag "${rawTag}" is not allowed. Tags must describe user experience; put parking in parking_info and avoid products, menu items, services, or place names.`,
      }, index);
      return;
    }

    if (isObjectRecord(tag)) {
      if (tag.slug !== undefined) {
        addError(result, {
          field: `tags[${tagIndex}].slug`,
          code: "tag_slug_not_allowed",
          message: "Tags must use id, not slug.",
        }, index);
      }

      if (tag.strength !== undefined) {
        const strength = parseNumberValue(tag.strength);

        if (
          strength === null ||
          !Number.isInteger(strength) ||
          strength < 1 ||
          strength > 5
        ) {
          addError(result, {
            field: `tags[${tagIndex}].strength`,
            code: "tag_strength_invalid",
            message: "Tag strength must be an integer from 1 to 5 when provided.",
          }, index);
        }
      }

      if (
        tag.source !== undefined &&
        (typeof tag.source !== "string" || !VALID_TAG_SOURCES.has(tag.source))
      ) {
        addError(result, {
          field: `tags[${tagIndex}].source`,
          code: "tag_source_invalid",
          message: "Tag source must be one of manual, seed, import, or system when provided.",
        }, index);
      }
    }

    const normalizedTag = normalizeTag(tag);

    if (!normalizedTag) {
      addError(result, {
        field: `tags[${tagIndex}]`,
        code: "tag_unknown",
        message:
          "Tag must be an approved GalaTayo tag such as indoor, outdoor, airconditioned, rain-friendly, free-entry, kid-friendly, date-friendly, family-friendly, barkada-friendly, study-friendly, quiet, photo-friendly, walkable, commute-friendly, parking-available, live-music, budget-friendly, premium, romantic, scenic, rooftop, green-space, or sports-friendly.",
      }, index);
      return;
    }

    if (seenTagIds.has(normalizedTag.id)) {
      addWarning(result, {
        field: `tags[${tagIndex}]`,
        code: "tag_duplicate",
        message: `Duplicate tag "${normalizedTag.id}" within the same place record.`,
      }, index);
    }

    seenTagIds.add(normalizedTag.id);
  });
}

function validateGalaRelevance(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  if (record.is_gala_relevant === false) {
    addError(result, {
      field: "is_gala_relevant",
      code: "not_gala_relevant",
      message: "Seed records marked is_gala_relevant=false cannot be imported.",
    }, index);
  }

  const combinedText = normalizeSearchText([
    getTrimmedString(record, "name"),
    getTrimmedString(record, "category"),
    getTrimmedString(record, "description"),
    getTrimmedString(record, "decision_reason"),
  ].filter(Boolean).join(" "));

  const directoryTerm = DIRECTORY_TERMS.find((term) =>
    combinedText.includes(normalizeSearchText(term))
  );

  if (directoryTerm) {
    addError(result, {
      field: "gala_relevance",
      code: "directory_like_place",
      message: `Seed record looks directory-like because it mentions "${directoryTerm}". GalaTayo seed data should focus on gala-worthy places.`,
    }, index);
  }

  const directoryWarningTerm = DIRECTORY_WARNING_TERMS.find((term) =>
    combinedText.includes(normalizeSearchText(term))
  );

  if (directoryWarningTerm) {
    addWarning(result, {
      field: "gala_relevance",
      code: "directory_like_place",
      message: `Seed record mentions "${directoryWarningTerm}". Confirm this is still a gala-worthy place rather than a practical errand-only listing.`,
    }, index);
  }
}

function validateOptionalUrlFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  for (const field of ["source_url", "official_url", "website_url"]) {
    const value = record[field];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (typeof value !== "string" || !isValidUrl(value)) {
      addError(result, {
        field,
        code: "url_invalid",
        message: `${field} must be a valid http or https URL when provided.`,
      }, index);
    }
  }
}

function validateRankingSignals(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  if (isPresent(record, "is_known_place") && typeof record.is_known_place !== "boolean") {
    addError(result, {
      field: "is_known_place",
      code: "is_known_place_invalid",
      message: "is_known_place must be a boolean when provided.",
    }, index);
  }

  for (const field of ["popularity_score", "ranking_priority", "quality_score"]) {
    if (!isPresent(record, field) || record[field] === null || record[field] === undefined) {
      continue;
    }

    const score = parseNumberValue(record[field]);

    if (score === null || score < 0 || score > 100) {
      addError(result, {
        field,
        code: "ranking_score_invalid",
        message: `${field} must be a number between 0 and 100 when provided.`,
      }, index);
    }
  }
}

export function validatePlaceSeedRecord(
  record: unknown,
  options: PlaceSeedValidationOptions = {}
): PlaceSeedValidationResult {
  const result = createResult();
  const index = options.index;

  if (!isObjectRecord(record)) {
    addError(result, {
      code: "record_invalid",
      message: "Seed record must be an object.",
    }, index);
    return result;
  }

  validateIdentityFields(record, result, index);
  validateCoordinates(record, result, index);
  validateVerificationFields(record, result, index);
  validateOptionalUrlFields(record, result, index);
  validateRequiredGuideFields(record, result, index);
  validateBudgetFields(record, result, index);
  validateCategories(record, result, index);
  validateTags(record, result, index);
  validateGalaRelevance(record, result, index);
  validateRankingSignals(record, result, index);

  return result;
}

function getNameCityKey(record: PlaceSeedRecord): string | null {
  const name = getTrimmedString(record, "name");
  const cityId = resolveMetroManilaCityId(record);

  return name && cityId ? `${normalizeSearchText(name)}|${cityId}` : null;
}

function getCoordinateKey(record: PlaceSeedRecord): string | null {
  const latitude = parseNumberValue(record.latitude);
  const longitude = parseNumberValue(record.longitude);

  return latitude !== null && longitude !== null
    ? `${latitude.toFixed(6)},${longitude.toFixed(6)}`
    : null;
}

function areCoordinatesVeryClose(
  left: PlaceSeedRecord,
  right: PlaceSeedRecord
): boolean {
  const leftLatitude = parseNumberValue(left.latitude);
  const leftLongitude = parseNumberValue(left.longitude);
  const rightLatitude = parseNumberValue(right.latitude);
  const rightLongitude = parseNumberValue(right.longitude);

  if (
    leftLatitude === null ||
    leftLongitude === null ||
    rightLatitude === null ||
    rightLongitude === null
  ) {
    return false;
  }

  return (
    Math.abs(leftLatitude - rightLatitude) <= 0.0005 &&
    Math.abs(leftLongitude - rightLongitude) <= 0.0005
  );
}

export function validatePlaceSeedRecords(records: unknown): PlaceSeedValidationResult {
  const result = createResult();

  if (!Array.isArray(records)) {
    addError(result, {
      code: "records_invalid",
      message: "Seed data must be an array of place records.",
    });
    return result;
  }

  const seenSlugs = new Map<string, number>();
  const seenNameCityKeys = new Map<string, number>();
  const seenCoordinateKeys = new Map<string, number>();

  records.forEach((record, index) => {
    const recordResult = validatePlaceSeedRecord(record, { index });

    if (isObjectRecord(record)) {
      const place = getRecordLabel(record, index);
      result.errors.push(...withPlace(recordResult.errors, place));
      result.warnings.push(...withPlace(recordResult.warnings, place));
    } else {
      result.errors.push(...recordResult.errors);
      result.warnings.push(...recordResult.warnings);
    }

    if (!recordResult.valid) {
      result.valid = false;
    }

    if (!isObjectRecord(record)) {
      return;
    }

    const slug = getTrimmedString(record, "slug");

    if (slug) {
      const previousIndex = seenSlugs.get(slug);

      if (previousIndex !== undefined) {
        addError(result, {
          index,
          place: getRecordLabel(record, index),
          field: "slug",
          code: "duplicate_slug",
          message: `Duplicate slug "${slug}" also appears at index ${previousIndex}.`,
        });
      } else {
        seenSlugs.set(slug, index);
      }
    }

    const nameCityKey = getNameCityKey(record);

    if (nameCityKey) {
      const previousIndex = seenNameCityKeys.get(nameCityKey);

      if (previousIndex !== undefined) {
        addWarning(result, {
          index,
          place: getRecordLabel(record, index),
          field: "name",
          code: "duplicate_name_city",
          message: `Same name and city also appear at index ${previousIndex}; confirm this is not a duplicate place.`,
        });
      } else {
        seenNameCityKeys.set(nameCityKey, index);
      }
    }

    const coordinateKey = getCoordinateKey(record);

    if (coordinateKey) {
      const previousIndex = seenCoordinateKeys.get(coordinateKey);

      if (previousIndex !== undefined) {
        addWarning(result, {
          index,
          place: getRecordLabel(record, index),
          field: "coordinates",
          code: "duplicate_coordinates",
          message: `Exact coordinates also appear at index ${previousIndex}; confirm these are distinct places.`,
        });
      } else {
        seenCoordinateKeys.set(coordinateKey, index);
      }
    }

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previousRecord = records[previousIndex];

      if (
        isObjectRecord(previousRecord) &&
        getCoordinateKey(record) !== getCoordinateKey(previousRecord) &&
        areCoordinatesVeryClose(record, previousRecord)
      ) {
        addWarning(result, {
          index,
          place: getRecordLabel(record, index),
          field: "coordinates",
          code: "coordinates_very_close",
          message: `Coordinates are very close to index ${previousIndex}; confirm this is not a duplicate place.`,
        });
        break;
      }
    }
  });

  result.valid = result.errors.length === 0;
  return result;
}

export function getSupportedMetroManilaCityNames(): string[] {
  return [...CITY_ID_TO_NAME.values()];
}
