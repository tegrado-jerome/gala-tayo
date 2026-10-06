import hdPhotoSlugs from "../data/hdPhotoSlugs.json";

// Places with curated HD photos in R2 (mirrors the keys of frontend/src/data/placeCardPhotos.json).
const HD_PHOTO_SLUGS = new Set<string>(hdPhotoSlugs);

export function hasCuratedPhoto(slug: string | null | undefined): boolean {
  return Boolean(slug && HD_PHOTO_SLUGS.has(slug.trim().toLowerCase()));
}

/** R2 key of a place's first HD photo: the 800px card crop or the full photo. Null when the place has none. */
export function hdPhotoKey(slug: string | null | undefined, size: "card" | "full" = "card"): string | null {
  if (!slug || !hasCuratedPhoto(slug)) return null;
  const clean = slug.trim().toLowerCase();
  return `places/${clean}/hd/${clean}-1${size === "card" ? "-card" : ""}.webp`;
}

/** The photo a place shows everywhere outside its own page: the HD card photo, else its approved upload. */
export function placePhotoKey(slug: string | null | undefined, uploadedKey: string | null | undefined): string | null {
  return hdPhotoKey(slug) ?? uploadedKey ?? null;
}
