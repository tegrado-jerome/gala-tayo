import { findCategoryById } from "./filters";
import * as Helpers from "./searchHelpers";
import { extractPlaceImageUrls } from "../utils/placeImageFallback";

export function getMatchedCategories(row: Helpers.PlaceRow, categoryIds: string[]): Helpers.SearchCategoryMetadata[] {
  const selectedCategoryIds = categoryIds.filter((id) => id !== "all");
  const linkedCats = Helpers.getLinkedCategories(row);
  if (selectedCategoryIds.length === 0) return linkedCats.slice(0, 2);
  const categoryText = Helpers.normalizeComparableText([Helpers.getStringField(row, ["category"]), row.categories, linkedCats.flatMap((c) => [c.id, c.name]), Helpers.getLinkedCategorySearchTerms(row)]);
  const matched = linkedCats.filter((cat) =>
    selectedCategoryIds.some((categoryId) => {
      if (cat.id === categoryId) return true;
      const selectedCategory = findCategoryById(categoryId);
      const directTerms = [categoryId, selectedCategory?.name, ...(selectedCategory?.searchTerms ?? [])].filter((t): t is string => Boolean(t));
      if (directTerms.some((t) => Helpers.includesNormalizedPhrase(categoryText, t)) && directTerms.some((t) => Helpers.includesNormalizedPhrase(Helpers.normalizeComparableText([cat.id, cat.name]), t))) return true;
      return Helpers.getMappedDbCategories(categoryId).some((mapped) => Helpers.includesNormalizedPhrase(Helpers.normalizeComparableText([cat.id, cat.name]), mapped));
    })
  );
  return (matched.length > 0 ? matched : linkedCats).slice(0, 2);
}

export function getMatchedTags(row: Helpers.PlaceRow, normalizedQuery: string): Helpers.SearchTagMetadata[] {
  const matchedTags = Helpers.getLinkedTags(row).filter((tag) => {
    if (!normalizedQuery) return false;
    const tagTerms = [tag.id, tag.name, ...tag.searchTerms].filter((t): t is string => Boolean(t));
    return tagTerms.some((t) => Helpers.includesNormalizedPhrase(normalizedQuery, t));
  }).map((tag) => ({ id: tag.id, name: tag.name ?? tag.id, group: tag.group, strength: tag.strength }))
    .sort((left, right) => { if (right.strength !== left.strength) return right.strength - left.strength; return left.name.localeCompare(right.name); });
  return matchedTags.length > 0 ? matchedTags : Helpers.getLinkedTagMetadata(row).slice(0, 4);
}

export function mapPlaceRowToSearchResult(row: Helpers.PlaceRow, { normalizedQuery, categoryIds, distanceKm, score, }: { normalizedQuery: string; categoryIds: string[]; distanceKm?: number | null; score?: number }): Helpers.SearchPlaceResult {
  const city = Helpers.getStringField(row, ["city", "area"]);
  const address = Helpers.getStringField(row, ["address", "formatted_address"]);
  const fallbackLocation = [address, city].filter(Boolean).join(", ");
  const location = Helpers.getStringField(row, ["location"]) ?? (fallbackLocation || null);
  const categories = Helpers.getLinkedCategories(row);
  const tags = Helpers.getLinkedTagMetadata(row);
  const fallbackImageUrls = extractPlaceImageUrls(row);
  return {
    id: String(row.id ?? row.slug ?? ""),
    slug: Helpers.getStringField(row, ["slug"]),
    name: Helpers.getStringField(row, ["name"]),
    description: Helpers.getStringField(row, ["description", "reason"]),
    area: Helpers.getStringField(row, ["area", "city"]),
    city,
    location,
    category: Helpers.getStringField(row, ["category"]),
    categories: categories.length > 0 ? categories : Helpers.getLinkedCategoryIds(row).map((cid) => ({ id: cid, name: cid })),
    rating: Helpers.getNumberField(row, ["average_rating"]),
    reviewCount: Helpers.getNumberField(row, ["review_count"]),
    latitude: Helpers.getNumberField(row, ["latitude", "lat"]),
    longitude: Helpers.getNumberField(row, ["longitude", "lng", "lon"]),
    imageUrl: fallbackImageUrls[0] ?? null,
    thumbnailUrl: fallbackImageUrls[0] ?? null,
    imageAlt: Helpers.getStringField(row, ["name"]),
    curatedImageUrls: fallbackImageUrls,
    address,
    budget: Helpers.getStringField(row, ["budget"]),
    budgetRange: Helpers.getStringField(row, ["budgetRange", "budget_range", "priceRange", "price_range"]),
    reason: Helpers.getStringField(row, ["reason", "description"]),
    place_history: Helpers.getStringField(row, ["place_history"]),
    best_time_to_visit: Helpers.getStringField(row, ["best_time_to_visit"]),
    visit_duration: Helpers.getStringField(row, ["visit_duration"]),
    good_for: Helpers.getStringArrayField(row, ["good_for"]),
    parking_info: Helpers.getStringField(row, ["parking_info"]),
    commute_access: Helpers.getStringField(row, ["commute_access"]),
    budget_note: Helpers.getStringField(row, ["budget_note"]),
    budget_min: Helpers.getNumberField(row, ["budget_min"]),
    price_level: Helpers.getNumberField(row, ["price_level"]),
    google_maps_url: Helpers.getStringField(row, ["google_maps_url"]),
    distanceKm: Helpers.roundDistanceKm(distanceKm ?? null),
    score: score ?? 0,
    search_terms: Helpers.getStringArrayField(row, ["search_terms"]),
    tags: tags.length > 0 ? tags : Helpers.getStringArrayField(row, ["tags"]).map((tag) => ({ id: tag, name: tag, group: "semantic", strength: 3 })),
    matchedCategories: getMatchedCategories(row, categoryIds),
    matchedTags: getMatchedTags(row, normalizedQuery),
  };
}
