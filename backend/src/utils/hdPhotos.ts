import hdPhotoCardKeys from "../data/hdPhotoSlugs.json";

// Places with curated HD photos in R2, mapped to the R2 key of their 800px cover crop
// (mirrors frontend/src/data/placeCardPhotos.json; keys are versioned, so never rebuild them from the slug).
const HD_PHOTO_CARD_KEYS = new Map<string, string>(Object.entries(hdPhotoCardKeys));

export function hasCuratedPhoto(slug: string | null | undefined): boolean {
  return Boolean(slug && HD_PHOTO_CARD_KEYS.has(slug.trim().toLowerCase()));
}

/** R2 key of a place's first HD photo: the 800px card crop or the full photo. Null when the place has none. */
export function hdPhotoKey(slug: string | null | undefined, size: "card" | "full" = "card"): string | null {
  const cardKey = slug ? HD_PHOTO_CARD_KEYS.get(slug.trim().toLowerCase()) : undefined;
  if (!cardKey) return null;
  return size === "card" ? cardKey : cardKey.replace(/-card\.webp$/, ".webp");
}

/** The photo a place shows everywhere outside its own page: the HD card photo, else its approved upload. */
export function placePhotoKey(slug: string | null | undefined, uploadedKey: string | null | undefined): string | null {
  return hdPhotoKey(slug) ?? uploadedKey ?? null;
}
