import { normalizeImageUrl } from "./r2UrlResolver";

type PlaceImageRecord = Record<string, unknown>;

const DIRECT_IMAGE_KEYS = [
  "imageUrl",
  "photo_url",
  "photoUrl",
  "thumbnail_url",
  "thumbnailUrl",
  "src",
  "url",
] as const;

function pushImageUrl(candidate: unknown, seen: Set<string>, results: string[]) {
  if (typeof candidate !== "string") {
    return;
  }

  const normalizedUrl = normalizeImageUrl(candidate);
  if (!normalizedUrl || seen.has(normalizedUrl)) {
    return;
  }

  seen.add(normalizedUrl);
  results.push(normalizedUrl);
}

function collectNestedImageUrls(value: unknown, seen: Set<string>, results: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    pushImageUrl(value, seen, results);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedImageUrls(item, seen, results);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as PlaceImageRecord;

  for (const key of DIRECT_IMAGE_KEYS) {
    pushImageUrl(record[key], seen, results);
  }
}

export function extractPlaceImageUrls(record: PlaceImageRecord): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const key of DIRECT_IMAGE_KEYS) {
    pushImageUrl(record[key], seen, results);
  }

  collectNestedImageUrls(record.photos, seen, results);
  collectNestedImageUrls(record.curatedImageUrls, seen, results);

  return results;
}
