import {
  METRO_MANILA_LOCATION_KEYWORDS,
  getMetroManilaLocationKeywordsForCity,
} from "./metroManilaLocations";
import { normalizeSearchText } from "./searchMatching";

export type PlaceSeedValidationIssue = {
  index?: number;
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
  "nightlife",
  "heritage",
  "museum",
  "tourist-spot",
  "date-spot",
  "barkada",
  "family",
  "study-spot",
  "shopping",
  "wellness",
  "chill",
]);

const CATEGORY_NAME_TO_ID = new Map([
  ["kainan", "kainan"],
  ["cafe", "cafe"],
  ["mall", "mall"],
  ["parke", "parke"],
  ["park", "parke"],
  ["nightlife", "nightlife"],
  ["heritage", "heritage"],
  ["museum", "museum"],
  ["tourist", "tourist-spot"],
  ["tourist spot", "tourist-spot"],
  ["date", "date-spot"],
  ["date spot", "date-spot"],
  ["barkada", "barkada"],
  ["family", "family"],
  ["study", "study-spot"],
  ["study spot", "study-spot"],
  ["shopping", "shopping"],
  ["wellness", "wellness"],
  ["chill", "chill"],
]);

const KNOWN_TAG_IDS = new Set([
  "indoor",
  "outdoor",
  "airconditioned",
  "rain-friendly",
  "walkable",
  "quiet",
  "relaxing",
  "lively",
  "crowded",
  "photo-friendly",
  "night-friendly",
  "wifi",
  "food-options",
  "shopping-area",
  "parking-friendly",
  "restroom-access",
  "date-friendly",
  "family-friendly",
  "barkada-friendly",
  "solo-friendly",
  "kid-friendly",
  "pet-friendly",
  "budget-friendly",
  "premium",
  "free-entry",
  "study-friendly",
  "coworking",
  "arcade",
  "cinema",
  "tourist-friendly",
  "historical",
  "educational",
  "commuter-friendly",
  "senior-friendly",
  "dessert",
  "bakery",
  "sweets",
  "market",
  "local-food",
  "commute-friendly",
  "terminal-nearby",
  "religious",
  "peaceful",
  "hotel-nearby",
  "staycation",
  "sports-friendly",
  "gym",
  "active",
  "clinic-nearby",
  "dental-care",
  "pharmacy-nearby",
  "hospital-nearby",
  "services-nearby",
]);

const TAG_NAME_TO_ID = new Map(
  [...KNOWN_TAG_IDS].flatMap((tagId) => [
    [tagId, tagId],
    [normalizeSearchText(tagId), tagId],
    [normalizeSearchText(tagId.replace(/-/g, " ")), tagId],
  ])
);

const VALID_TAG_SOURCES = new Set(["manual", "seed", "import", "system"]);
const VALID_VERIFICATION_STATUSES = new Set([
  "draft",
  "needs-review",
  "verified",
  "rejected",
]);
const VALID_BUDGET_LABELS = new Set(["Free", "Budget", "Mid-range", "Premium"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHILIPPINES_SAFE_BOUNDS = {
  minLatitude: 14.0,
  maxLatitude: 15.2,
  minLongitude: 120.5,
  maxLongitude: 121.5,
};

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
): { latitude: number | null; longitude: number | null } {
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

  return { latitude, longitude };
}

function validateUrlAndSourceFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  for (const field of ["google_maps_url", "source_url", "official_url", "website_url"]) {
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

  const lastVerifiedAt = record.last_verified_at;

  if (
    lastVerifiedAt !== undefined &&
    lastVerifiedAt !== null &&
    lastVerifiedAt !== "" &&
    (typeof lastVerifiedAt !== "string" || !isValidDateString(lastVerifiedAt))
  ) {
    addError(result, {
      field: "last_verified_at",
      code: "last_verified_at_invalid",
      message: "last_verified_at must be a valid date string when provided.",
    }, index);
  }

  const verificationStatus = record.verification_status;

  if (
    verificationStatus !== undefined &&
    verificationStatus !== null &&
    verificationStatus !== "" &&
    (typeof verificationStatus !== "string" ||
      !VALID_VERIFICATION_STATUSES.has(verificationStatus))
  ) {
    addError(result, {
      field: "verification_status",
      code: "verification_status_invalid",
      message:
        "verification_status must be one of draft, needs-review, verified, or rejected.",
    }, index);
  }

  if (!getTrimmedString(record, "source_url")) {
    addWarning(result, {
      field: "source_url",
      code: "source_url_missing",
      message: "source_url is recommended for future data review.",
    }, index);
  }

  if (!getTrimmedString(record, "last_verified_at")) {
    addWarning(result, {
      field: "last_verified_at",
      code: "last_verified_at_missing",
      message: "last_verified_at is recommended so imported place data has freshness metadata.",
    }, index);
  }

  if (!getTrimmedString(record, "verification_status")) {
    addWarning(result, {
      field: "verification_status",
      code: "verification_status_missing",
      message: "verification_status is recommended and should be verified before large imports.",
    }, index);
  } else if (record.verification_status !== "verified") {
    addWarning(result, {
      field: "verification_status",
      code: "verification_status_not_verified",
      message: "verification_status is not verified; review before importing at scale.",
    }, index);
  }

  if (!getTrimmedString(record, "google_maps_url")) {
    addWarning(result, {
      field: "google_maps_url",
      code: "google_maps_url_missing",
      message: "google_maps_url is optional because directions can use coordinates.",
    }, index);
  }
}

function validateDescription(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const description = record.description;

  if (description === undefined || description === null || description === "") {
    addWarning(result, {
      field: "description",
      code: "description_missing",
      message: "Description is recommended for detail pages but does not block seeding.",
    }, index);
    return;
  }

  if (typeof description !== "string") {
    addError(result, {
      field: "description",
      code: "description_invalid",
      message: "Description must be a string when provided.",
    }, index);
    return;
  }

  if (description.trim().length < 20) {
    addWarning(result, {
      field: "description",
      code: "description_too_short",
      message: "Description is shorter than 20 characters; add more useful context if available.",
    }, index);
  }
}

function validateOptionalStringField(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  field: string,
  index?: number,
  requireNonEmpty = false
): void {
  const value = record[field];

  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "string" || (requireNonEmpty && value.trim() === "")) {
    addError(result, {
      field,
      code: `${field}_invalid`,
      message: `${field} must be a${requireNonEmpty ? " non-empty" : ""} string when provided.`,
    }, index);
  }
}

function validateOptionalStringArrayField(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  field: string,
  index?: number
): void {
  const value = record[field];

  if (value === undefined || value === null) {
    return;
  }

  if (!Array.isArray(value)) {
    addError(result, {
      field,
      code: `${field}_invalid`,
      message: `${field} must be an array of non-empty strings when provided.`,
    }, index);
    return;
  }

  value.forEach((item, itemIndex) => {
    if (typeof item !== "string" || item.trim() === "") {
      addError(result, {
        field: `${field}[${itemIndex}]`,
        code: `${field}_item_invalid`,
        message: `${field} items must be non-empty strings.`,
      }, index);
    }
  });
}

function validateEnrichedDetailFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  validateOptionalStringField(record, result, "detail_summary", index, true);
  validateOptionalStringArrayField(record, result, "best_for", index);
  validateOptionalStringArrayField(record, result, "what_to_expect", index);
  validateOptionalStringArrayField(record, result, "tips", index);

  for (const field of ["hours_text", "entrance_fee_text", "best_time_text"]) {
    validateOptionalStringField(record, result, field, index);
  }
}

function validateBudgetFields(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const hasAnyBudgetField = [
    "budget_min",
    "budget_max",
    "budget_currency",
    "budget_label",
    "is_free",
  ].some((field) => isPresent(record, field));
  const budgetMin = record.budget_min === null ? null : parseNumberValue(record.budget_min);
  const budgetMax = record.budget_max === null ? null : parseNumberValue(record.budget_max);

  if (!hasAnyBudgetField) {
    addWarning(result, {
      field: "budget",
      code: "budget_fields_missing",
      message: "Budget fields are recommended for budget-aware ranking and filters.",
    }, index);
    return;
  }

  if (isPresent(record, "budget_min") && record.budget_min !== null) {
    if (budgetMin === null || budgetMin < 0) {
      addError(result, {
        field: "budget_min",
        code: "budget_min_invalid",
        message: "budget_min must be null or a number greater than or equal to 0.",
      }, index);
    }
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

  if (
    budgetMin !== null &&
    budgetMax !== null &&
    Number.isFinite(budgetMin) &&
    Number.isFinite(budgetMax) &&
    budgetMax < budgetMin
  ) {
    addError(result, {
      field: "budget_max",
      code: "budget_range_invalid",
      message: "budget_max must be greater than or equal to budget_min.",
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

  if (
    isPresent(record, "budget_label") &&
    record.budget_label !== undefined &&
    record.budget_label !== null &&
    !VALID_BUDGET_LABELS.has(String(record.budget_label))
  ) {
    addError(result, {
      field: "budget_label",
      code: "budget_label_invalid",
      message: "budget_label must be one of Free, Budget, Mid-range, or Premium.",
    }, index);
  }

  if (isPresent(record, "is_free") && typeof record.is_free !== "boolean") {
    addError(result, {
      field: "is_free",
      code: "is_free_invalid",
      message: "is_free must be a boolean when provided.",
    }, index);
  }

  if (record.is_free === true && budgetMin !== null && budgetMin > 0) {
    addWarning(result, {
      field: "budget_min",
      code: "free_place_budget_min_positive",
      message: "is_free is true, so budget_min should usually be 0.",
    }, index);
  }

  if (record.budget_label === "Free" && record.is_free === false) {
    addWarning(result, {
      field: "is_free",
      code: "free_label_is_free_false",
      message: "budget_label is Free but is_free is false.",
    }, index);
  }
}

function validateRankingSignals(
  record: PlaceSeedRecord,
  result: PlaceSeedValidationResult,
  index?: number
): void {
  const rankingFields = [
    "is_known_place",
    "popularity_score",
    "ranking_priority",
    "quality_score",
  ];

  if (!rankingFields.every((field) => isPresent(record, field))) {
    addWarning(result, {
      field: "ranking",
      code: "ranking_signals_missing",
      message: "Ranking signals are recommended; database defaults can fill missing values.",
    }, index);
  }

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
      message: "categories must be a non-empty array of known GalaTayo category IDs or names.",
    }, index);
    return;
  }

  const seenCategoryIds = new Set<string>();

  categories.forEach((category, categoryIndex) => {
    const normalizedCategory = normalizeCategory(category);

    if (!normalizedCategory) {
      addError(result, {
        field: `categories[${categoryIndex}]`,
        code: "category_unknown",
        message: "Category must exist in the known GalaTayo category list.",
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
    const id = KNOWN_TAG_IDS.has(value) ? value : TAG_NAME_TO_ID.get(normalizedValue);

    return id ? { id, name: value } : null;
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  const rawId = getTrimmedString(value, "id") ?? getTrimmedString(value, "tag_id");
  const rawName = getTrimmedString(value, "name") ?? rawId;
  const normalizedName = rawName ? normalizeSearchText(rawName) : "";
  const id =
    rawId && KNOWN_TAG_IDS.has(rawId) ? rawId : TAG_NAME_TO_ID.get(normalizedName);

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
      message: "tags must be a non-empty array of known GalaTayo tag IDs, names, or tag objects.",
    }, index);
    return;
  }

  const seenTagIds = new Set<string>();

  tags.forEach((tag, tagIndex) => {
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
        message: "Tag must exist in the known GalaTayo tag list.",
      }, index);
      return;
    }

    if (seenTagIds.has(normalizedTag.id)) {
      addError(result, {
        field: `tags[${tagIndex}]`,
        code: "tag_duplicate",
        message: `Duplicate tag "${normalizedTag.id}" within the same place record.`,
      }, index);
    }

    seenTagIds.add(normalizedTag.id);
  });
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
  validateUrlAndSourceFields(record, result, index);
  validateDescription(record, result, index);
  validateEnrichedDetailFields(record, result, index);
  validateBudgetFields(record, result, index);
  validateRankingSignals(record, result, index);
  validateCategories(record, result, index);
  validateTags(record, result, index);

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
    result.errors.push(...recordResult.errors);
    result.warnings.push(...recordResult.warnings);

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
