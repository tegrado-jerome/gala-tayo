import type { NormalizedPlace } from "./places";
import { FINAL_PLACE_CATEGORIES } from "./places";
import { DESTINATIONS, getDestinationNameKeys, isMetroManilaDestination } from "../utils/phDestinations";

export type PlaceSearchFilters = {
  category?: string | null;
  city?: string | null;
  good_for?: string | null;
  budget?: string | null;
};

export type RankedPlace = {
  place: NormalizedPlace;
  score: number;
};

type BudgetFilter = {
  min: number | null;
  max: number | null;
};

type SearchSignals = {
  category: string | null;
  city: string | null;
  good_for: string | null;
  budget: BudgetFilter | null;
};

const CATEGORY_NAMES: Record<string, string[]> = {
  Activity: ["activity", "activities", "arcade", "arcades", "bowling", "games", "karaoke", "ktv", "sports"],
  Cafe: ["cafe", "cafes", "coffee", "coffee shop", "coffeeshop", "tea shop", "milk tea"],
  Cinema: ["cinema", "cinemas", "movie", "movies", "pelikula", "sine", "theater", "theatre"],
  Food: ["eat", "food", "kainan", "pagkain", "restaurant", "restaurants", "resto"],
  Heritage: ["church", "churches", "heritage", "historic", "historical", "history", "landmark", "landmarks", "monument", "monuments"],
  Hotel: ["accommodation", "accommodations", "hotel", "hotels", "overnight", "resort", "resorts", "staycation"],
  Mall: ["mall", "malls", "shopping", "shopping center", "shopping centre"],
  Museum: ["art gallery", "exhibit", "gallery", "museum", "museums", "museo"],
  Nightlife: ["bar", "bars", "club", "clubs", "drinks", "nightlife", "pub", "pubs"],
  Park: ["garden", "park", "parks", "parke", "picnic", "picnics"],
};

const CITY_DICTIONARY: Record<string, string[]> = {
  Caloocan: ["caloocan", "caloocan city"],
  "Las Pinas": ["las pinas", "las pinas city", "las pinas city", "lp"],
  Makati: ["makati", "makati city"],
  Malabon: ["malabon", "malabon city"],
  Mandaluyong: ["mandaluyong", "mandaluyong city"],
  Manila: ["manila", "city of manila"],
  Marikina: ["marikina", "marikina city"],
  Muntinlupa: ["alabang", "muntinlupa", "muntinlupa city"],
  Navotas: ["navotas", "navotas city"],
  Paranaque: ["paranaque", "paranaque city", "paranaque city"],
  Pasay: ["pasay", "pasay city"],
  Pasig: ["pasig", "pasig city", "ortigas"],
  Pateros: ["pateros"],
  "Quezon City": ["qc", "quezon city"],
  "San Juan": ["san juan", "san juan city", "little baguio"],
  Taguig: ["bgc", "bonifacio global city", "taguig", "taguig city"],
  Valenzuela: ["valenzuela", "valenzuela city"],
};

// Destinations outside Metro Manila, keyed by the city name stored on places.
const PROVINCIAL_CITY_DICTIONARY: Record<string, string[]> = Object.fromEntries(
  DESTINATIONS.filter((destination) => !isMetroManilaDestination(destination)).map((destination) => [
    destination.name,
    getDestinationNameKeys(destination),
  ]),
);

// Words inside destination aliases that are too generic to count as a location.
const GENERIC_LOCATION_WORDS = new Set(["city", "island", "beach", "bay", "freeport", "port", "rice", "terraces", "garden", "of"]);

const GOOD_FOR_NAMES: Record<string, string[]> = {
  date: ["date", "dates", "romantic", "couple", "anniversary"],
  barkada: ["barkada", "barkadas", "friends", "group", "hangout"],
  family: ["family", "kids", "child friendly", "all ages"],
  study: ["study", "student", "quiet", "work friendly", "wifi"],
  chill: ["chill", "relax", "tambayan", "low key"],
};

const BUDGET_MAP: Record<string, BudgetFilter> = {
  any: { min: null, max: null },
  free: { min: null, max: 0 },
  "under-300": { min: null, max: 300 },
  "under-500": { min: null, max: 500 },
  "500-1000": { min: null, max: 1000 },
  "1000-2000": { min: null, max: 2000 },
  "1000-plus": { min: null, max: 1000 },
  "2000-plus": { min: null, max: 2000 },
};

const BUDGET_KEYWORDS = {
  free: ["free", "libre", "libreng", "walang bayad"],
  max: ["below", "budget", "for", "hanggang", "less than", "max", "maximum", "plus", "under", "up to", "within"],
  currency: ["p", "peso", "pesos", "php"],
};

const STOP_WORDS_SET = new Set([
  "in", "at", "the", "for", "to", "and", "an", "a", "of",
  "near", "with", "by", "on", "or", "is", "are", "was", "were",
]);

const KNOWN_WORDS = buildKnownWords();

function buildKnownWords(): Set<string> {
  const words = new Set<string>(STOP_WORDS_SET);

  const addWords = (text: string): void => {
    words.add(text.toLowerCase());
    for (const w of text.split(" ")) {
      if (w) words.add(w);
    }
  };

  for (const [name, aliases] of Object.entries(CATEGORY_NAMES)) {
    addWords(name);
    for (const a of aliases) addWords(a);
  }

  for (const [city, aliases] of Object.entries(CITY_DICTIONARY)) {
    addWords(city);
    for (const a of aliases) addWords(a);
  }

  for (const aliases of Object.values(PROVINCIAL_CITY_DICTIONARY)) {
    for (const alias of aliases) {
      words.add(alias);
      for (const w of alias.split(" ")) {
        if (w && !GENERIC_LOCATION_WORDS.has(w)) words.add(w);
      }
    }
  }

  for (const [id, aliases] of Object.entries(GOOD_FOR_NAMES)) {
    addWords(id);
    for (const a of aliases) addWords(a);
  }

  for (const bws of Object.values(BUDGET_KEYWORDS)) {
    for (const w of bws) addWords(w);
  }

  return words;
}

function matchesKnownWordAfterStemming(token: string): boolean {
  if (token.endsWith("ies") && token.length > 4) {
    if (KNOWN_WORDS.has(token.slice(0, -3) + "y")) return true;
  }
  if (token.endsWith("es") && token.length > 4) {
    if (KNOWN_WORDS.has(token.slice(0, -2))) return true;
  }
  if (token.endsWith("s") && token.length > 3) {
    if (KNOWN_WORDS.has(token.slice(0, -1))) return true;
  }
  return false;
}

function getSpecificTokens(normalizedQuery: string): string[] {
  if (!normalizedQuery) return [];
  return normalizedQuery
    .split(" ")
    .filter(Boolean)
    .filter((t) => {
      if (KNOWN_WORDS.has(t)) return false;
      if (/^\d+(,\d{3})*(\.\d+)?$/.test(t)) return false;
      return !matchesKnownWordAfterStemming(t);
    });
}

function hasSpecificKeyword(normalizedQuery: string): boolean {
  return getSpecificTokens(normalizedQuery).length > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesWholePhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}($|\\s)`).test(text);
}

function detectFromDictionary(query: string, dictionary: Record<string, string[]>): string | null {
  const normalizedQuery = normalizeSearchText(query);

  for (const [canonical, aliases] of Object.entries(dictionary)) {
    if ([canonical, ...aliases].some((alias) => includesWholePhrase(normalizedQuery, alias))) {
      return canonical;
    }
  }

  return null;
}

function canonicalCategory(value: string | null | undefined): string | null {
  const normalizedValue = normalizeSearchText(value ?? "");
  if (!normalizedValue || normalizedValue === "all") return null;

  for (const category of FINAL_PLACE_CATEGORIES) {
    const aliases = CATEGORY_NAMES[category] ?? [];
    if ([category, ...aliases].some((alias) => normalizeSearchText(alias) === normalizedValue)) {
      return category;
    }
  }

  return null;
}

function canonicalCity(value: string | null | undefined): string | null {
  const normalizedValue = normalizeSearchText(value ?? "");
  if (!normalizedValue || normalizedValue === "all") return null;

  for (const [city, aliases] of [...Object.entries(CITY_DICTIONARY), ...Object.entries(PROVINCIAL_CITY_DICTIONARY)]) {
    if ([city, ...aliases].some((alias) => normalizeSearchText(alias) === normalizedValue)) {
      return city;
    }
  }

  return null;
}

function canonicalGoodFor(value: string | null | undefined): string | null {
  const normalizedValue = normalizeSearchText(value ?? "");
  if (!normalizedValue || normalizedValue === "all") return null;

  for (const [id, aliases] of Object.entries(GOOD_FOR_NAMES)) {
    if ([id, ...aliases].some((alias) => normalizeSearchText(alias) === normalizedValue)) {
      return id;
    }
  }

  return null;
}

function budgetFilterFromValue(value: string | null | undefined): BudgetFilter | null {
  const normalizedValue = normalizeSearchText(value ?? "").replace(/\s+/g, "-");
  if (!normalizedValue || normalizedValue === "any") return null;
  return BUDGET_MAP[normalizedValue] ?? null;
}

function cityMatches(placeCity: string | null | undefined, city: string | null): boolean {
  if (!city) return true;

  const normalizedPlaceCity = normalizeSearchText(placeCity ?? "");
  if (!normalizedPlaceCity) return false;

  const cityAliases = [city, ...(CITY_DICTIONARY[city] ?? PROVINCIAL_CITY_DICTIONARY[city] ?? [])];
  return cityAliases.some((alias) => normalizeSearchText(alias) === normalizedPlaceCity);
}

export function detectCategoryFromQuery(query: string): string | null {
  return detectFromDictionary(query, CATEGORY_NAMES);
}

function longestPhraseMatch(normalizedQuery: string, dictionary: Record<string, string[]>): { city: string; length: number } | null {
  let best: { city: string; length: number } | null = null;

  for (const [city, aliases] of Object.entries(dictionary)) {
    for (const alias of [city, ...aliases]) {
      const length = normalizeSearchText(alias).length;
      if (includesWholePhrase(normalizedQuery, alias) && (!best || length > best.length)) {
        best = { city, length };
      }
    }
  }

  return best;
}

// Metro Manila keeps its original first-match order; a destination elsewhere wins only with a
// longer phrase, so "san juan" stays in Metro Manila but "san juan la union" goes to La Union.
export function detectCityFromQuery(query: string): string | null {
  const normalizedQuery = normalizeSearchText(query);
  const metroManilaCity = detectFromDictionary(normalizedQuery, CITY_DICTIONARY);
  const provincialMatch = longestPhraseMatch(normalizedQuery, PROVINCIAL_CITY_DICTIONARY);

  if (!provincialMatch) return metroManilaCity;
  if (!metroManilaCity) return provincialMatch.city;

  const metroManilaLength = longestPhraseMatch(normalizedQuery, { [metroManilaCity]: CITY_DICTIONARY[metroManilaCity] })?.length ?? 0;
  return provincialMatch.length > metroManilaLength ? provincialMatch.city : metroManilaCity;
}

export function detectBudgetFromQuery(query: string): BudgetFilter | null {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  if (BUDGET_KEYWORDS.free.some((keyword) => includesWholePhrase(normalizedQuery, keyword))) {
    return { min: null, max: 0 };
  }

  const currencyMatch = normalizedQuery.match(/(?:^|\s)(?:p|php|peso|pesos)\s*(\d{1,5}(?:,\d{3})?(?:\.\d+)?)(?:\s|$)/);
  if (currencyMatch) {
    return { min: null, max: Number(currencyMatch[1].replace(/,/g, "")) };
  }

  const suffixCurrencyMatch = normalizedQuery.match(/(?:^|\s)(\d{1,5}(?:,\d{3})?(?:\.\d+)?)\s*(?:p|php|peso|pesos)(?:\s|$)/);
  if (suffixCurrencyMatch) {
    return { min: null, max: Number(suffixCurrencyMatch[1].replace(/,/g, "")) };
  }

  const rangeMatch = normalizedQuery.match(/(?:^|\s)(\d{1,5}(?:,\d{3})?(?:\.\d+)?)\s*(?:to|-)\s*(\d{1,5}(?:,\d{3})?(?:\.\d+)?)(?:\s|$)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(/,/g, ""));
    const max = Number(rangeMatch[2].replace(/,/g, ""));
    if (min >= 20 && min <= 99999 && max >= 20 && max <= 99999) {
      return { min, max };
    }
  }

  const hasBudgetKeyword = BUDGET_KEYWORDS.max.some((keyword) =>
    includesWholePhrase(normalizedQuery, keyword),
  );
  if (!hasBudgetKeyword) return null;

  const numbers = [...normalizedQuery.matchAll(/(?:^|\s)(\d{1,5}(?:,\d{3})?(?:\.\d+)?)(?=\s|$)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));

  const validNumbers = numbers.filter((value) => value >= 20 && value <= 99999);
  if (validNumbers.length === 0) return null;

  return { min: null, max: validNumbers[0] };
}

export function detectGoodForFromQuery(query: string): string | null {
  return detectFromDictionary(query, GOOD_FOR_NAMES);
}

function getExplicitFilters(filters: PlaceSearchFilters): SearchSignals {
  return {
    category: canonicalCategory(filters.category),
    city: canonicalCity(filters.city),
    good_for: canonicalGoodFor(filters.good_for),
    budget: budgetFilterFromValue(filters.budget),
  };
}

function getQuerySignals(query: string): SearchSignals {
  return {
    category: detectCategoryFromQuery(query),
    city: detectCityFromQuery(query),
    good_for: detectGoodForFromQuery(query),
    budget: detectBudgetFromQuery(query),
  };
}

function emptySignals(): SearchSignals {
  return { category: null, city: null, good_for: null, budget: null };
}

function mergeSignals(primary: SearchSignals, secondary: SearchSignals): SearchSignals {
  return {
    category: primary.category ?? secondary.category,
    city: primary.city ?? secondary.city,
    good_for: primary.good_for ?? secondary.good_for,
    budget: primary.budget ?? secondary.budget,
  };
}

function budgetMatches(placeBudget: number | null, budget: BudgetFilter | null): boolean {
  if (!budget) return true;
  if (placeBudget === null) return false;
  if (budget.min !== null && placeBudget < budget.min) return false;
  if (budget.max !== null && placeBudget > budget.max) return false;
  return true;
}

export function filterPlaceByFilters(
  place: NormalizedPlace,
  category: string | null,
  location: string | null,
  budget: BudgetFilter | null,
  goodFor: string | null,
): boolean {
  if (category && normalizeSearchText(place.category) !== normalizeSearchText(category)) {
    return false;
  }

  if (!cityMatches(place.city, location)) {
    return false;
  }

  if (goodFor && !place.good_for.some((gf) => normalizeSearchText(gf) === normalizeSearchText(goodFor))) {
    return false;
  }

  return budgetMatches(place.budget_min, budget);
}

function scoreCandidateText(candidate: string, query: string, { exact, startsWith, contains }: { exact: number; startsWith: number; contains: number }): number {
  if (!candidate || !query) return 0;
  if (candidate === query) return exact;
  if (candidate.startsWith(query)) return startsWith;
  if (candidate.includes(query)) return contains;
  return 0;
}

export function scorePlaceNameMatch(place: NormalizedPlace, query: string): number {
  const cleanedQuery = normalizeSearchText(query);
  if (!cleanedQuery) return 0;

  const tokens = cleanedQuery.split(" ").filter(Boolean);

  // The place's own name outranks curated search terms: "San Agustin" should find San Agustin Church
  // before a cafe that merely lists its barangay, San Agustin, as a search term.
  const bestExactScore = Math.max(
    scoreCandidateText(normalizeSearchText(place.name), cleanedQuery, { exact: 100, startsWith: 90, contains: 80 }),
    scoreCandidateText(normalizeSearchText(place.slug), cleanedQuery, { exact: 95, startsWith: 85, contains: 70 }),
    ...place.search_terms.map((term) =>
      scoreCandidateText(normalizeSearchText(term), cleanedQuery, { exact: 75, startsWith: 60, contains: 50 }),
    ),
  );

  if (bestExactScore > 0) return bestExactScore;

  const allTextFieldValues = [
    normalizeSearchText(place.name),
    normalizeSearchText(place.slug),
    ...place.search_terms.map((term) => normalizeSearchText(term)),
    place.address ? normalizeSearchText(place.address) : "",
    place.description ? normalizeSearchText(place.description) : "",
    place.area ? normalizeSearchText(place.area) : "",
  ].filter(Boolean);

  if (allTextFieldValues.some((candidate) => candidate.includes(cleanedQuery))) {
    return 40;
  }

  if (tokens.length > 0) {
    const nonStopTokens = tokens.filter((t) => !STOP_WORDS_SET.has(t));
    if (nonStopTokens.length === 0) return 0;

    const bestRatio = Math.max(
      ...allTextFieldValues.map((candidate) => {
        const matched = nonStopTokens.filter((t) => candidate.includes(t)).length;
        return matched / nonStopTokens.length;
      }),
    );

    if (bestRatio > 0) {
      return Math.max(1, Math.round(40 * bestRatio));
    }
  }

  return 0;
}

export function getExactLocationLabelForIntent(query: string): string | null {
  return detectCityFromQuery(query);
}

export function rankPlaces(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}): RankedPlace[] {
  const activePlaces = places.filter((place) => place.status === "active");
  const normalizedQuery = normalizeSearchText(query);
  const explicitSignals = getExplicitFilters(filters);

  const querySignals = normalizedQuery ? getQuerySignals(normalizedQuery) : null;
  const specificTokens = normalizedQuery ? getSpecificTokens(normalizedQuery) : [];
  const queryHasSpecificKeyword = specificTokens.length > 0;

  const hardFilterSignals: SearchSignals = (!queryHasSpecificKeyword && querySignals)
    ? mergeSignals(explicitSignals, querySignals)
    : explicitSignals;

  const hasActiveHardFilter = Boolean(
    hardFilterSignals.category ?? hardFilterSignals.city ?? hardFilterSignals.budget ?? hardFilterSignals.good_for,
  );

  return activePlaces
    .map((place) => {
      if (!filterPlaceByFilters(
        place,
        hardFilterSignals.category,
        hardFilterSignals.city,
        hardFilterSignals.budget,
        hardFilterSignals.good_for,
      )) {
        return null;
      }

      let score = 0;
      if (normalizedQuery) {
        score = scorePlaceNameMatch(place, normalizedQuery);

        if (querySignals && queryHasSpecificKeyword) {
          if (querySignals.category && normalizeSearchText(place.category) === normalizeSearchText(querySignals.category)) {
            score += 15;
          }
          if (querySignals.city && place.city && normalizeSearchText(place.city) === normalizeSearchText(querySignals.city)) {
            score += 10;
          }
          if (querySignals.good_for && place.good_for.some((gf) => normalizeSearchText(gf) === normalizeSearchText(querySignals.good_for!))) {
            score += 10;
          }
          if (querySignals.budget && budgetMatches(place.budget_min, querySignals.budget)) {
            score += 10;
          }

          const placeTextFields = [
            normalizeSearchText(place.name),
            normalizeSearchText(place.slug),
            ...place.search_terms.map((t) => normalizeSearchText(t)),
            place.address ? normalizeSearchText(place.address) : "",
            place.description ? normalizeSearchText(place.description) : "",
            place.area ? normalizeSearchText(place.area) : "",
          ].filter(Boolean).join(" ");

          const longSpecificTokens = specificTokens.filter((st) => st.length > 2);
          if (longSpecificTokens.length > 0) {
            if (!longSpecificTokens.some((st) => placeTextFields.includes(st))) {
              return null;
            }
          } else {
            if (!specificTokens.some((st) => placeTextFields.includes(st))) {
              return null;
            }
          }
        }

        if (queryHasSpecificKeyword && score === 0) {
          return null;
        }
        if (!queryHasSpecificKeyword && score === 0 && !hasActiveHardFilter) {
          return null;
        }
      }

      return { place, score };
    })
    .filter((r): r is RankedPlace => r !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.place.name.localeCompare(right.place.name);
    });
}
