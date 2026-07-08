import * as fs from "fs";
import * as path from "path";

export const CITY_SEED_FILES_GLOB_SUFFIX = ".json";

export const FINAL_CATEGORY_IDS: readonly string[] = [
  "arcade",
  "cafe",
  "chill",
  "cinema",
  "date",
  "family",
  "food",
  "group",
  "heritage",
  "mall",
  "museum",
  "nightlife",
  "park",
  "tourist",
];

export const FINAL_CATEGORY_ID_SET = new Set<string>(FINAL_CATEGORY_IDS);

export type PlaceSeedCity = string;
export type PlaceSlug = string;
export type TagId = string;
export type CategoryId = string;
export type ImageSlug = string;

export type CitySeedImage = {
  image_slug: string;
  storage_key: string;
  alt_text?: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type CitySeedTagObject = {
  id: string;
  name?: string;
  strength?: number | string;
  notes?: string;
  [extra: string]: unknown;
};

export type CitySeedTag = string | CitySeedTagObject;

export type CitySeedPlace = {
  id?: string;
  name?: string;
  slug?: string;
  category?: string;
  address?: string;
  city?: string;
  area?: string;
  latitude?: number | string;
  longitude?: number | string;
  budget_min?: number | string;
  google_maps_url?: string;
  description?: string;
  best_time_to_visit?: string;
  visit_duration?: string;
  good_for?: string[];
  not_ideal_for?: string[];
  crowd_level?: string;
  indoor_outdoor?: string;
  weather_fit?: string;
  parking_info?: string;
  commute_access?: string;
  nearby_context?: string;
  normalized_name?: string;
  searchable_text?: string;
  search_keywords?: string[];
  search_aliases?: string[];
  status?: string;
  average_rating?: number | string | null;
  review_count?: number | string;
  price_level?: number | string | null;
  budget_note?: string;
  categories?: string[];
  tags?: CitySeedTag[];
  images?: CitySeedImage[];
  [extra: string]: unknown;
};

export type CitySeedFileSource = "object" | "array";

export type CitySeedFile = {
  fileName: string;
  filePath: string;
  source: CitySeedFileSource;
  city: PlaceSeedCity | null;
  places: CitySeedPlace[];
};

export type ValidationIssue = {
  file: string;
  place?: string;
  placeIndex?: number;
  field?: string;
  code: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  files: CitySeedFile[];
  uniquePlaceSlugs: Set<string>;
  uniqueImageSlugs: Set<string>;
  uniqueTagIds: Set<string>;
  uniqueCategoryIds: Set<string>;
  totalPlaces: number;
  totalImages: number;
};

export function resolveBackendRoot(): string {
  const candidates: string[] = [];

  if (typeof process !== "undefined" && process.cwd) {
    candidates.push(process.cwd());
  }

  let cursor = __dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(cursor);
    cursor = path.dirname(cursor);
  }

  for (const candidate of candidates) {
    const probe = path.join(candidate, "seed-data", "cities");
    if (fs.existsSync(probe)) {
      return candidate;
    }
  }

  return process.cwd();
}

export function getSeedDataCitiesDir(backendRoot: string): string {
  return path.resolve(backendRoot, "seed-data", "cities");
}

export function listCitySeedFiles(backendRoot?: string): string[] {
  const root = backendRoot ?? resolveBackendRoot();
  const dir = getSeedDataCitiesDir(root);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(CITY_SEED_FILES_GLOB_SUFFIX))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isCaloocanCity(city: string | null | undefined, fileName: string): boolean {
  if (city && /^caloocan$/i.test(city.trim())) {
    return true;
  }
  return /caloocan/i.test(fileName);
}

export function expectedImageCount(place: CitySeedPlace, fileName: string): number {
  if (isCaloocanCity(place.city ?? null, fileName)) {
    return 3;
  }
  return 1;
}

function pushError(
  errors: ValidationIssue[],
  args: {
    file: string;
    place?: string;
    placeIndex?: number;
    field?: string;
    code: string;
    message: string;
  }
): void {
  errors.push({
    file: args.file,
    place: args.place,
    placeIndex: args.placeIndex,
    field: args.field,
    code: args.code,
    message: args.message,
  });
}

function pushWarning(
  warnings: ValidationIssue[],
  args: {
    file: string;
    place?: string;
    placeIndex?: number;
    field?: string;
    code: string;
    message: string;
  }
): void {
  warnings.push({
    file: args.file,
    place: args.place,
    placeIndex: args.placeIndex,
    field: args.field,
    code: args.code,
    message: args.message,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractTagId(tag: CitySeedTag): string | null {
  if (typeof tag === "string") {
    return tag.trim() || null;
  }
  if (tag && typeof tag === "object") {
    if (isNonEmptyString(tag.id)) {
      return tag.id.trim();
    }
    if (isNonEmptyString(tag.name)) {
      return tag.name.trim();
    }
  }
  return null;
}

function extractCategoryId(category: unknown): string | null {
  if (typeof category === "string") {
    return category.trim() || null;
  }
  if (category && typeof category === "object") {
    const record = category as Record<string, unknown>;
    if (isNonEmptyString(record.id)) {
      return record.id.trim();
    }
    if (isNonEmptyString(record.category_id)) {
      return record.category_id.trim();
    }
    if (isNonEmptyString(record.name)) {
      return record.name.trim();
    }
  }
  return null;
}

function getPlaceLabel(place: CitySeedPlace, index: number): string {
  if (isNonEmptyString(place.slug)) {
    return place.slug;
  }
  if (isNonEmptyString(place.name)) {
    return place.name;
  }
  return `index ${index}`;
}

function validatePlaceShape(
  place: CitySeedPlace,
  fileName: string,
  index: number,
  errors: ValidationIssue[]
): void {
  const placeLabel = getPlaceLabel(place, index);

  if (!isNonEmptyString(place.slug)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "slug",
      code: "slug_required",
      message: "Place slug is required and must be a non-empty string.",
    });
  }

  if (!isNonEmptyString(place.name)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "name",
      code: "name_required",
      message: "Place name is required and must be a non-empty string.",
    });
  }

  if (!isNonEmptyString(place.city)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "city",
      code: "city_required",
      message: "Place city is required and must be a non-empty string.",
    });
  }

  if (!Array.isArray(place.categories)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "categories",
      code: "categories_required",
      message: "Place categories must be an array (use [] for empty).",
    });
  }

  if (!Array.isArray(place.tags)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "tags",
      code: "tags_required",
      message: "Place tags must be an array (use [] for empty).",
    });
  }

  if (!Array.isArray(place.images)) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "images",
      code: "images_required",
      message: "Place images must be an array (use [] for empty).",
    });
  }
}

function validateImages(
  place: CitySeedPlace,
  fileName: string,
  index: number,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): { imageCount: number; imageSlugs: string[] } {
  const placeLabel = getPlaceLabel(place, index);
  const images = Array.isArray(place.images) ? place.images : [];
  const imageSlugs: string[] = [];
  const expected = expectedImageCount(place, fileName);

  if (images.length !== expected) {
    pushError(errors, {
      file: fileName,
      place: placeLabel,
      placeIndex: index,
      field: "images",
      code: "images_count_invalid",
      message: `Expected exactly ${expected} image(s) for this place, found ${images.length}.`,
    });
  }

  const seenSortOrders = new Set<number>();

  images.forEach((image, imageIndex) => {
    if (!image || typeof image !== "object") {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}]`,
        code: "image_invalid",
        message: "Image must be an object.",
      });
      return;
    }

    const expectedSortOrder = imageIndex + 1;
    const expectedImageSlug = isNonEmptyString(place.slug)
      ? `${place.slug}-${expectedSortOrder}`
      : null;
    const expectedStorageKey = isNonEmptyString(place.slug)
      ? `galatayo-photos/places/${place.slug}/${place.slug}-${expectedSortOrder}.webp`
      : null;

    if (typeof image.sort_order !== "number" || !Number.isFinite(image.sort_order)) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].sort_order`,
        code: "image_sort_order_invalid",
        message: `Image sort_order must be a number, starting at 1 in array order.`,
      });
    } else if (image.sort_order !== expectedSortOrder) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].sort_order`,
        code: "image_sort_order_out_of_sequence",
        message: `Image sort_order must be sequential starting at 1. Expected ${expectedSortOrder}, got ${image.sort_order}.`,
      });
    } else if (seenSortOrders.has(image.sort_order)) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].sort_order`,
        code: "image_sort_order_duplicate",
        message: `Image sort_order ${image.sort_order} is duplicated within the same place.`,
      });
    } else {
      seenSortOrders.add(image.sort_order);
    }

    if (expectedImageSlug && image.image_slug !== expectedImageSlug) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].image_slug`,
        code: "image_slug_invalid",
        message: `Image image_slug must be "${expectedImageSlug}", got "${String(image.image_slug)}".`,
      });
    }

    if (expectedStorageKey && image.storage_key !== expectedStorageKey) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].storage_key`,
        code: "image_storage_key_invalid",
        message: `Image storage_key must be "${expectedStorageKey}", got "${String(image.storage_key)}".`,
      });
    } else if (
      typeof image.storage_key === "string" &&
      !image.storage_key.endsWith(".webp")
    ) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].storage_key`,
        code: "image_storage_key_extension_invalid",
        message: `Image storage_key must use .webp extension: "${image.storage_key}".`,
      });
    }

    if (expectedSortOrder === 1 && image.is_primary !== true) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].is_primary`,
        code: "image_is_primary_invalid",
        message: `First image (sort_order 1) must have is_primary set to true.`,
      });
    } else if (expectedSortOrder > 1 && image.is_primary !== false) {
      pushError(errors, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].is_primary`,
        code: "image_is_primary_invalid",
        message: `Image ${expectedSortOrder} (sort_order > 1) must have is_primary set to false.`,
      });
    }

    if (isNonEmptyString(image.image_slug)) {
      imageSlugs.push(image.image_slug);
    } else {
      pushWarning(warnings, {
        file: fileName,
        place: placeLabel,
        placeIndex: index,
        field: `images[${imageIndex}].image_slug`,
        code: "image_slug_missing",
        message: "Image is missing a non-empty image_slug.",
      });
    }
  });

  return { imageCount: images.length, imageSlugs };
}

function parseCitySeedFile(
  filePath: string,
  fileName: string
): {
  file: CitySeedFile | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    pushError(errors, {
      file: fileName,
      code: "file_unreadable",
      message: `Failed to read city seed file: ${(err as Error).message}`,
    });
    return { file: null, errors, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    pushError(errors, {
      file: fileName,
      code: "file_invalid_json",
      message: `Failed to parse city seed JSON: ${(err as Error).message}`,
    });
    return { file: null, errors, warnings };
  }

  if (Array.isArray(parsed)) {
    const places: CitySeedPlace[] = [];
    parsed.forEach((entry, index) => {
      const record = asRecord(entry);
      if (!record) {
        pushError(errors, {
          file: fileName,
          placeIndex: index,
          code: "place_invalid",
          message: `Place entry at index ${index} must be an object.`,
        });
        return;
      }
      places.push(record as CitySeedPlace);
    });
    return {
      file: {
        fileName,
        filePath,
        source: "array",
        city: null,
        places,
      },
      errors,
      warnings,
    };
  }

  const root = asRecord(parsed);
  if (!root) {
    pushError(errors, {
      file: fileName,
      code: "file_root_invalid",
      message: "City seed file root must be an object or an array of place objects.",
    });
    return { file: null, errors, warnings };
  }

  const city = isNonEmptyString(root.city) ? root.city : null;
  const rawPlaces = root.places;
  const places: CitySeedPlace[] = [];

  if (!Array.isArray(rawPlaces)) {
    pushError(errors, {
      file: fileName,
      code: "places_array_missing",
      message: "City seed object form must include a 'places' array.",
    });
  } else {
    rawPlaces.forEach((entry, index) => {
      const record = asRecord(entry);
      if (!record) {
        pushError(errors, {
          file: fileName,
          placeIndex: index,
          code: "place_invalid",
          message: `Place entry at index ${index} must be an object.`,
        });
        return;
      }
      places.push(record as CitySeedPlace);
    });
  }

  return {
    file: {
      fileName,
      filePath,
      source: "object",
      city,
      places,
    },
    errors,
    warnings,
  };
}

export function validateCitySeedFiles(backendRoot?: string): ValidationResult {
  const root = backendRoot ?? resolveBackendRoot();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const files: CitySeedFile[] = [];
  const uniquePlaceSlugs = new Set<string>();
  const uniqueImageSlugs = new Set<string>();
  const uniqueTagIds = new Set<string>();
  const uniqueCategoryIds = new Set<string>();

  const filePaths = listCitySeedFiles(root);

  const slugFirstSeen = new Map<string, { file: string; place: string; index: number }>();
  const imageSlugFirstSeen = new Map<string, { file: string; place: string; imageSlug: string }>();
  const cityNameByFile = new Map<string, string | null>();

  let totalPlaces = 0;
  let totalImages = 0;

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const { file, errors: fileErrors, warnings: fileWarnings } = parseCitySeedFile(filePath, fileName);
    errors.push(...fileErrors);
    warnings.push(...fileWarnings);
    if (!file) {
      continue;
    }

    files.push(file);
    cityNameByFile.set(fileName, file.city);

    file.places.forEach((place, index) => {
      totalPlaces += 1;
      const placeLabel = getPlaceLabel(place, index);
      validatePlaceShape(place, fileName, index, errors);

      if (isNonEmptyString(place.slug)) {
        const slug = place.slug;
        if (uniquePlaceSlugs.has(slug)) {
          const first = slugFirstSeen.get(slug);
          pushError(errors, {
            file: fileName,
            place: placeLabel,
            placeIndex: index,
            field: "slug",
            code: "duplicate_place_slug",
            message: `Duplicate place slug "${slug}" (already seen in ${first?.file ?? "another file"} at place ${first?.place ?? "?"}).`,
          });
        } else {
          uniquePlaceSlugs.add(slug);
          slugFirstSeen.set(slug, { file: fileName, place: placeLabel, index });
        }
      }

      if (Array.isArray(place.categories)) {
        place.categories.forEach((category) => {
          const id = extractCategoryId(category);
          if (id) {
            uniqueCategoryIds.add(id);
          }
        });
      }

      if (Array.isArray(place.tags)) {
        place.tags.forEach((tag) => {
          const id = extractTagId(tag);
          if (id) {
            uniqueTagIds.add(id);
          }
        });
      }

      if (Array.isArray(place.images)) {
        const { imageSlugs, imageCount } = validateImages(place, fileName, index, errors, warnings);
        totalImages += imageCount;
        imageSlugs.forEach((imageSlug) => {
          if (uniqueImageSlugs.has(imageSlug)) {
            const first = imageSlugFirstSeen.get(imageSlug);
            pushError(errors, {
              file: fileName,
              place: placeLabel,
              placeIndex: index,
              field: "images.image_slug",
              code: "duplicate_image_slug",
              message: `Duplicate image_slug "${imageSlug}" (already seen in ${first?.file ?? "another file"} at place ${first?.place ?? "?"}).`,
            });
          } else {
            uniqueImageSlugs.add(imageSlug);
            imageSlugFirstSeen.set(imageSlug, {
              file: fileName,
              place: placeLabel,
              imageSlug,
            });
          }
        });
      } else {
        const expected = expectedImageCount(place, fileName);
        pushError(errors, {
          file: fileName,
          place: placeLabel,
          placeIndex: index,
          field: "images",
          code: "images_required",
          message: `Place is missing images array (expected ${expected} image(s)).`,
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    files,
    uniquePlaceSlugs,
    uniqueImageSlugs,
    uniqueTagIds,
    uniqueCategoryIds,
    totalPlaces,
    totalImages,
  };
}

export function printValidationSummary(result: ValidationResult): void {
  const fileNames = result.files.map((file) => file.fileName);
  const categoriesUsed = [...result.uniqueCategoryIds].sort();
  const finalCategorySet = FINAL_CATEGORY_ID_SET;
  const extraCategoryIds = categoriesUsed.filter((id) => !finalCategorySet.has(id));
  const validCategoryIds = categoriesUsed.filter((id) => finalCategorySet.has(id));

  const lines: string[] = [];
  lines.push("== GalaTayo city seed validation ==");
  lines.push(`Mode: ${result.valid ? "PASSED" : "FAILED"}`);
  lines.push(`Files read: ${fileNames.length}`);
  lines.push(`Files: ${fileNames.join(", ") || "(none)"}`);
  lines.push(`Total places: ${result.totalPlaces}`);
  lines.push(`Unique place slugs: ${result.uniquePlaceSlugs.size}`);
  lines.push(`Total images: ${result.totalImages}`);
  lines.push(`Unique image slugs: ${result.uniqueImageSlugs.size}`);
  lines.push(`Unique tag IDs: ${result.uniqueTagIds.size}`);
  lines.push(`Unique category IDs: ${result.uniqueCategoryIds.size}`);
  lines.push(`Valid category IDs used: ${validCategoryIds.length ? validCategoryIds.join(", ") : "(none)"}`);
  if (extraCategoryIds.length > 0) {
    lines.push(`Invalid category IDs used: ${extraCategoryIds.join(", ")}`);
  }
  lines.push(`Errors: ${result.errors.length}`);
  lines.push(`Warnings: ${result.warnings.length}`);

  console.log(lines.join("\n"));

  if (result.errors.length > 0) {
    console.log("\n-- Validation errors --");
    const byFile = new Map<string, ValidationIssue[]>();
    for (const err of result.errors) {
      const list = byFile.get(err.file) ?? [];
      list.push(err);
      byFile.set(err.file, list);
    }
    for (const [file, fileErrors] of byFile) {
      console.log(`\n[${file}]`);
      for (const err of fileErrors) {
        const placeLabel = err.place ? ` place=${err.place}` : "";
        const fieldLabel = err.field ? ` field=${err.field}` : "";
        console.log(`  - ${err.code}${placeLabel}${fieldLabel}: ${err.message}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n-- Validation warnings --");
    for (const warn of result.warnings) {
      const placeLabel = warn.place ? ` place=${warn.place}` : "";
      const fieldLabel = warn.field ? ` field=${warn.field}` : "";
      console.log(`  - [${warn.file}] ${warn.code}${placeLabel}${fieldLabel}: ${warn.message}`);
    }
  }
}
