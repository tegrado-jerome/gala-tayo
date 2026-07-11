import { getMetroManilaLocationKeywordsForCity } from "../utils/metroManilaLocations";
import { getSearchTerms } from "../utils/searchMatching";
import { findAreaById, findCategoryById, findGoodForById } from "./filters";
import * as Helpers from "./searchHelpers";

export { Helpers };

// ---- Filter matching functions ----

export function rowMatchesCategory(row: Helpers.PlaceRow, categoryIds: string[]): boolean {
  const selectedCategoryIds = categoryIds.filter((id) => id !== "all");
  if (selectedCategoryIds.length === 0) return true;
  const linkedCatIds = Helpers.getLinkedCategoryIds(row);
  const categoryText = Helpers.getStructuredCategoryText(row);
  return selectedCategoryIds.some((categoryId) =>
    linkedCatIds.includes(categoryId) ||
    [categoryId, ...Helpers.getMappedDbCategories(categoryId)].some((cat) =>
      Helpers.includesNormalizedPhrase(categoryText, cat)
    )
  );
}

export function rowMatchesArea(row: Helpers.PlaceRow, areaIds: string[]): boolean {
  const selectedAreaIds = areaIds.filter((id) => id !== "all");
  if (selectedAreaIds.length === 0) return true;
  const areaText = Helpers.getStructuredLocationText(row);
  return selectedAreaIds.some((areaId) => {
    const selectedArea = findAreaById(areaId);
    const areaName = selectedArea?.name ?? areaId;
    const locationKeywords = getMetroManilaLocationKeywordsForCity(areaId);
    const terms = [areaId, areaName, ...locationKeywords];
    return terms.some((term) => areaText.includes(Helpers.normalizeComparableText(term)));
  });
}

export function rowMatchesGoodFor(row: Helpers.PlaceRow, goodForIds: string[]): boolean {
  const selectedGoodForIds = goodForIds.filter((id) => id !== "all");
  if (selectedGoodForIds.length === 0) return true;
  const goodForText = Helpers.getStructuredGoodForText(row);
  return selectedGoodForIds.some((goodForId) => {
    const terms = [goodForId, ...(Helpers.GOOD_FOR_TERMS[goodForId] ?? [])];
    return terms.some((term) => Helpers.includesNormalizedPhrase(goodForText, term));
  });
}

export function rowMatchesIndoorOutdoor(row: Helpers.PlaceRow, filterValue: string | null): boolean {
  if (!filterValue) return true;
  return Helpers.includesNormalizedPhrase(Helpers.getIndoorOutdoorText(row), filterValue);
}

export function rowMatchesWeatherFit(row: Helpers.PlaceRow, filterValue: string | null): boolean {
  if (!filterValue) return true;
  return Helpers.includesNormalizedPhrase(Helpers.getWeatherFitText(row), filterValue);
}

export function rowMatchesBudget(row: Helpers.PlaceRow, budget: Helpers.BudgetValue): boolean {
  if (budget === "any") return true;
  const budgetMin = Helpers.getNumberField(row, ["budget_min"]);
  if (budgetMin === null) return false;
  switch (budget) {
    case "free": return budgetMin === 0;
    case "under-500": return budgetMin <= 500;
    case "500-1000": return budgetMin >= 500 && budgetMin <= 1000;
    case "1000-2000": return budgetMin >= 1000 && budgetMin <= 2000;
    case "2000-plus": return budgetMin >= 2000;
    default: return true;
  }
}

export function inferGoodForIdsFromQuery(normalizedQuery: string): string[] {
  if (!normalizedQuery) return [];
  return Object.entries(Helpers.GOOD_FOR_TERMS)
    .filter(([_, terms]) => [_, ...terms].some((term) => Helpers.includesNormalizedPhrase(normalizedQuery, term)))
    .map(([goodForId]) => goodForId);
}

export function getPromptTerms(normalizedQuery: string): string[] {
  return getSearchTerms(normalizedQuery).filter((term) => !/^gm\d+$/i.test(term));
}

export function getMatchedQueryIntentSignals(normalizedQuery: string): (typeof Helpers.QUERY_INTENT_SIGNALS)[number][] {
  if (!normalizedQuery) return [];
  return Helpers.QUERY_INTENT_SIGNALS.filter((signal) =>
    Helpers.queryMentionsAnyPhrase(normalizedQuery, [...signal.queryPhrases, ...signal.rowPhrases])
  );
}

export function rowMatchesPrompt(row: Helpers.PlaceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return false;
  const promptText = Helpers.getRowPromptText(row);
  const matchedSignals = getMatchedQueryIntentSignals(normalizedQuery);
  if (promptTerms.some((term) => Helpers.includesNormalizedPhrase(promptText, term))) return true;
  return matchedSignals.some((signal) => Helpers.queryMentionsAnyPhrase(promptText, signal.rowPhrases));
}

export function rowMatchesStrictPlaceQuery(row: Helpers.PlaceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return false;
  const strictText = Helpers.normalizeComparableText([
    Helpers.getRowIdentityText(row), Helpers.getRowDiscoveryText(row), Helpers.getRowTagText(row),
    Helpers.getStructuredLocationText(row), Helpers.getStructuredCategoryText(row),
  ]);
  return promptTerms.every((term) => Helpers.includesNormalizedPhrase(strictText, term));
}

export function scoreLocationMatch(row: Helpers.PlaceRow, areaIds: string[]): number {
  const selectedAreaIds = areaIds.filter((id) => id !== "all");
  if (selectedAreaIds.length === 0) return 0;
  return rowMatchesArea(row, selectedAreaIds) ? 35 : 0;
}

export function scoreCategoryMatch(row: Helpers.PlaceRow, categoryIds: string[]): number {
  const selectedCategoryIds = categoryIds.filter((id) => id !== "all");
  if (selectedCategoryIds.length === 0) return 0;
  const linkedCategoryIds = Helpers.getLinkedCategoryIds(row);
  const categoryText = Helpers.normalizeComparableText([Helpers.getStringField(row, ["category"]), row.categories, linkedCategoryIds, Helpers.getLinkedCategoryNames(row), Helpers.getLinkedCategorySearchTerms(row)]);
  let bestScore = 0;
  for (const categoryId of selectedCategoryIds) {
    if (linkedCategoryIds.includes(categoryId)) { bestScore = Math.max(bestScore, 30); continue; }
    const selectedCategory = findCategoryById(categoryId);
    const exactTerms = [categoryId, selectedCategory?.name, ...(selectedCategory?.searchTerms ?? [])].filter((t): t is string => Boolean(t));
    if (exactTerms.some((term) => Helpers.includesNormalizedPhrase(categoryText, term))) { bestScore = Math.max(bestScore, 30); continue; }
    if (Helpers.getMappedDbCategories(categoryId).some((cat) => Helpers.includesNormalizedPhrase(categoryText, cat))) bestScore = Math.max(bestScore, 18);
  }
  return bestScore;
}

export function scoreGoodForMatch(row: Helpers.PlaceRow, goodForIds: string[]): number {
  const selectedGoodForIds = goodForIds.filter((id) => id !== "all");
  if (selectedGoodForIds.length === 0) return 0;
  return rowMatchesGoodFor(row, selectedGoodForIds) ? 26 : 0;
}

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

export function scoreTagMatch(row: Helpers.PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const scoreByStrength: Record<number, number> = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
  const totalScore = Helpers.getLinkedTags(row).reduce((score, tag) => {
    const tagTerms = [tag.id, tag.name, ...tag.searchTerms].filter((t): t is string => Boolean(t));
    return tagTerms.some((t) => Helpers.includesNormalizedPhrase(normalizedQuery, t)) ? score + scoreByStrength[tag.strength] : score;
  }, 0);
  return Math.min(totalScore, 25);
}

export function scoreNotIdealPenalty(row: Helpers.PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const notIdealFor = Helpers.getStringArrayField(row, ["not_ideal_for"]);
  if (notIdealFor.length === 0) return 0;
  const matchingPhrases = notIdealFor.filter((phrase) => Helpers.queryMentionsAnyPhrase(normalizedQuery, [phrase, ...getSearchTerms(phrase)]));
  return matchingPhrases.length > 0 ? Math.min(matchingPhrases.length * 8, 16) : 0;
}

export function scoreIdentityMatch(row: Helpers.PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return 0;
  const identityText = Helpers.getRowIdentityText(row);
  const exactIdentityQuery = Helpers.includesNormalizedPhrase(identityText, normalizedQuery);
  const identityMatches = Helpers.countMatchedTerms(identityText, promptTerms);
  let score = 0;
  if (exactIdentityQuery) score += 28;
  score += Math.min(identityMatches * 9, 27);
  return Math.min(score, 55);
}

export function scoreDiscoveryMatch(row: Helpers.PlaceRow, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return 0;
  const discoveryText = Helpers.getRowDiscoveryText(row);
  const discoveryMatches = Helpers.countMatchedTerms(discoveryText, promptTerms);
  return Math.min(discoveryMatches * 6, 34);
}

export function scoreIntentFieldMatch(row: Helpers.PlaceRow, normalizedQuery: string, { selectedIndoorOutdoor, selectedWeatherFit }: { selectedIndoorOutdoor: string | null; selectedWeatherFit: string | null }): number {
  const promptTerms = getPromptTerms(normalizedQuery);
  const intentText = Helpers.getRowIntentText(row);
  const promptText = Helpers.getRowPromptText(row);
  const intentMatches = Helpers.countMatchedTerms(intentText, promptTerms);
  const matchedSignals = getMatchedQueryIntentSignals(normalizedQuery);
  let score = Math.min(intentMatches * 5, 25);
  if (Helpers.queryMentionsAnyPhrase(normalizedQuery, ["rain", "rainy", "ulan"]) && Helpers.queryMentionsAnyPhrase(intentText, ["rain", "rainy", "ulan"])) score += 8;
  if (Helpers.queryMentionsAnyPhrase(normalizedQuery, ["commute", "commuter", "sakay", "lrt", "mrt", "jeep", "tricycle"]) && Helpers.queryMentionsAnyPhrase(intentText, ["commute", "commuter", "ride hailing", "lrt", "mrt", "jeep", "tricycle"])) score += 8;
  if (Helpers.queryMentionsAnyPhrase(normalizedQuery, ["parking", "car", "drive", "driving"]) && Helpers.queryMentionsAnyPhrase(Helpers.getRowLowPriorityText(row), ["parking", "car", "drive"])) score += 2;
  if (selectedIndoorOutdoor && rowMatchesIndoorOutdoor(row, selectedIndoorOutdoor)) score += 18;
  if (selectedWeatherFit && rowMatchesWeatherFit(row, selectedWeatherFit)) score += 18;
  if (matchedSignals.length > 0) score += Math.min(matchedSignals.filter((s) => Helpers.queryMentionsAnyPhrase(promptText, s.rowPhrases)).length * 6, 18);
  return Math.min(score, 45);
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

export function getBudgetRangeForFilter(budget: Helpers.BudgetValue): { min: number; max: number } | null {
  switch (budget) {
    case "free": return { min: 0, max: 0 };
    case "under-500": return { min: 0, max: 500 };
    case "500-1000": return { min: 500, max: 1000 };
    case "1000-2000": return { min: 1000, max: 2000 };
    case "2000-plus": return { min: 2000, max: Number.POSITIVE_INFINITY };
    default: return null;
  }
}

export function getBudgetLabelTermsForFilter(budget: Helpers.BudgetValue): string[] {
  switch (budget) {
    case "free": return ["free", "libre", "walang entrance"];
    case "under-500": return ["under 500", "below 500", "under ₱500", "under php 500"];
    case "500-1000": return ["500 1000", "500 to 1000", "₱500 ₱1 000", "php 500 php 1000"];
    case "1000-2000": return ["1000 2000", "1000 to 2000", "₱1 000 ₱2 000", "php 1000 php 2000"];
    case "2000-plus": return ["2000", "2000 plus", "₱2 000", "php 2000", "premium"];
    default: return [];
  }
}

export function getPlaceBudgetRange(row: Helpers.PlaceRow): { min: number; max: number } | null {
  const min = Helpers.getNumberField(row, ["budget_min"]);
  const max = Helpers.getNumberField(row, ["budget_max"]);
  if (min === null && max === null) return null;
  return { min: min ?? 0, max: max ?? Number.POSITIVE_INFINITY };
}

export function rangesOverlap(left: { min: number; max: number }, right: { min: number; max: number }): boolean {
  return left.min <= right.max && right.min <= left.max;
}

export function rangesAreNear(left: { min: number; max: number }, right: { min: number; max: number }): boolean {
  const finiteLeftMax = Number.isFinite(left.max) ? left.max : left.min;
  const finiteRightMax = Number.isFinite(right.max) ? right.max : right.min;
  const gap = left.max < right.min ? right.min - finiteLeftMax : left.min - finiteRightMax;
  return gap >= 0 && gap <= 500;
}

export function scoreBudgetMatch(row: Helpers.PlaceRow, budget: Helpers.BudgetValue, normalizedQuery: string): number {
  void normalizedQuery;
  const selectedBudgetRange = getBudgetRangeForFilter(budget);
  const budgetMin = Helpers.getNumberField(row, ["budget_min"]);
  if (budget === "any" || !selectedBudgetRange || budgetMin === null) return 0;
  return budgetMin >= selectedBudgetRange.min && budgetMin <= selectedBudgetRange.max ? 15 : 0;
}

export function scoreSupportingMatch(row: Helpers.PlaceRow, normalizedQuery: string): number {
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return 0;
  const supportingText = Helpers.getRowSupportingText(row);
  const matches = Helpers.countMatchedTerms(supportingText, promptTerms);
  return Math.min(matches * 3, 10);
}

export function scoreLowPriorityMatch(row: Helpers.PlaceRow, normalizedQuery: string): number {
  const promptTerms = getPromptTerms(normalizedQuery);
  if (promptTerms.length === 0) return 0;
  const lowPriorityText = Helpers.getRowLowPriorityText(row);
  const matches = Helpers.countMatchedTerms(lowPriorityText, promptTerms);
  return Math.min(matches, 3);
}

export function scorePlaceForSearch({ row, normalizedQuery, categoryIds, areaIds, goodForIds, budget, selectedIndoorOutdoor, selectedWeatherFit, strictPlaceSearch, }: {
  row: Helpers.PlaceRow; normalizedQuery: string; categoryIds: string[]; areaIds: string[]; goodForIds: string[]; budget: Helpers.BudgetValue; selectedIndoorOutdoor: string | null; selectedWeatherFit: string | null; strictPlaceSearch: boolean;
}): number {
  const structuredScore = scoreLocationMatch(row, areaIds) + scoreCategoryMatch(row, categoryIds) + scoreGoodForMatch(row, goodForIds) + scoreBudgetMatch(row, budget, normalizedQuery);
  const identityScore = scoreIdentityMatch(row, normalizedQuery);
  const discoveryScore = scoreDiscoveryMatch(row, normalizedQuery);
  const tagScore = scoreTagMatch(row, normalizedQuery);
  const intentScore = strictPlaceSearch ? 0 : scoreIntentFieldMatch(row, normalizedQuery, { selectedIndoorOutdoor, selectedWeatherFit });
  const supportingScore = strictPlaceSearch ? 0 : scoreSupportingMatch(row, normalizedQuery);
  const lowPriorityScore = strictPlaceSearch ? 0 : scoreLowPriorityMatch(row, normalizedQuery);
  const penalty = scoreNotIdealPenalty(row, normalizedQuery);
  const coreScore = structuredScore + identityScore + discoveryScore + tagScore + intentScore;
  if (coreScore === 0) return Math.max(Math.min(supportingScore + lowPriorityScore, 3) - penalty, 0);
  return Math.max(coreScore + supportingScore + lowPriorityScore - penalty, 0);
}

export function mapPlaceRowToSearchResult(row: Helpers.PlaceRow, { normalizedQuery, categoryIds, distanceKm, }: { normalizedQuery: string; categoryIds: string[]; distanceKm?: number | null }): Helpers.SearchPlaceResult {
  const city = Helpers.getStringField(row, ["city", "area"]);
  const address = Helpers.getStringField(row, ["address", "formatted_address"]);
  const fallbackLocation = [address, city].filter(Boolean).join(", ");
  const location = Helpers.getStringField(row, ["location"]) ?? (fallbackLocation || null);
  const categories = Helpers.getLinkedCategories(row);
  const tags = Helpers.getLinkedTagMetadata(row);
  return {
    id: String(row.id ?? row.foursquare_id ?? row.slug ?? ""),
    slug: Helpers.getStringField(row, ["slug"]),
    name: Helpers.getStringField(row, ["name"]),
    description: Helpers.getStringField(row, ["description", "reason"]),
    area: Helpers.getStringField(row, ["area", "city"]),
    city,
    location,
    category: Helpers.getStringField(row, ["category"]),
    categories: categories.length > 0 ? categories : Helpers.getLinkedCategoryIds(row).map((cid) => ({ id: cid, name: cid })),
    latitude: Helpers.getNumberField(row, ["latitude", "lat"]),
    longitude: Helpers.getNumberField(row, ["longitude", "lng", "lon"]),
    imageUrl: null,
    thumbnailUrl: null,
    imageAlt: Helpers.getStringField(row, ["name"]),
    curatedImageUrls: [],
    address,
    budget: Helpers.getStringField(row, ["budget"]),
    budgetRange: Helpers.getStringField(row, ["budgetRange", "budget_range", "priceRange", "price_range"]),
    reason: Helpers.getStringField(row, ["reason", "description"]),
    place_history: Helpers.getStringField(row, ["place_history"]),
    best_time_to_visit: Helpers.getStringField(row, ["best_time_to_visit"]),
    visit_duration: Helpers.getStringField(row, ["visit_duration"]),
    good_for: Helpers.getStringArrayField(row, ["good_for"]),
    not_ideal_for: Helpers.getStringArrayField(row, ["not_ideal_for"]),
    crowd_level: Helpers.getStringField(row, ["crowd_level"]),
    indoor_outdoor: Helpers.getStringField(row, ["indoor_outdoor"]),
    weather_fit: Helpers.getStringField(row, ["weather_fit"]),
    parking_info: Helpers.getStringField(row, ["parking_info"]),
    accessibility_notes: Helpers.getStringField(row, ["accessibility_notes"]),
    decision_reason: Helpers.getStringField(row, ["decision_reason"]),
    commute_friendly: typeof row.commute_friendly === "boolean" ? row.commute_friendly : null,
    commute_access: Helpers.getStringField(row, ["commute_access"]),
    nearby_context: Helpers.getStringField(row, ["nearby_context"]),
    budget_notes: Helpers.getStringField(row, ["budget_notes"]),
    verification_status: Helpers.getStringField(row, ["verification_status"]),
    verification_notes: Helpers.getStringField(row, ["verification_notes"]),
    verification_sources: Helpers.getStringArrayField(row, ["verification_sources"]),
    last_verified_at: Helpers.getStringField(row, ["last_verified_at"]),
    website_url: Helpers.getStringField(row, ["website_url"]),
    google_maps_url: Helpers.getStringField(row, ["google_maps_url"]),
    distanceKm: Helpers.roundDistanceKm(distanceKm ?? null),
    tags,
    matchedCategories: getMatchedCategories(row, categoryIds),
    matchedTags: getMatchedTags(row, normalizedQuery),
  };
}
