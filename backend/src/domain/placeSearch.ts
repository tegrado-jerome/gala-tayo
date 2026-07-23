import type { NormalizedPlace } from "./places";
import { FINAL_PLACE_CATEGORIES } from "./places";

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
  Activity: ["activity", "activities", "arcade", "bowling", "games", "karaoke", "ktv", "sports"],
  Cafe: ["cafe", "cafes", "coffee", "coffee shop", "coffeeshop", "tea shop", "milk tea"],
  Cinema: ["cinema", "cinemas", "movie", "movies", "pelikula", "sine", "theater", "theatre"],
  Food: ["eat", "food", "kainan", "pagkain", "restaurant", "restaurants", "resto"],
  Heritage: ["church", "heritage", "historic", "historical", "history", "landmark", "monument"],
  Hotel: ["accommodation", "hotel", "hotels", "overnight", "resort", "staycation"],
  Mall: ["mall", "malls", "shopping", "shopping center", "shopping centre"],
  Museum: ["art gallery", "exhibit", "gallery", "museum", "museo"],
  Nightlife: ["bar", "bars", "club", "clubs", "drinks", "nightlife", "pub"],
  Park: ["garden", "park", "parks", "parke", "picnic"],
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
  "San Juan": ["san juan", "san juan city"],
  Taguig: ["bgc", "bonifacio global city", "taguig", "taguig city"],
  Valenzuela: ["valenzuela", "valenzuela city"],
};

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
  "1000-plus": { min: 1000, max: null },
  "2000-plus": { min: 2000, max: null },
};

const BUDGET_KEYWORDS = {
  free: ["free", "libre", "libreng", "walang bayad"],
  max: ["below", "budget", "for", "hanggang", "less than", "max", "maximum", "under", "within"],
  currency: ["p", "peso", "pesos", "php"],
};

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

  for (const [city, aliases] of Object.entries(CITY_DICTIONARY)) {
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

  const cityAliases = [city, ...(CITY_DICTIONARY[city] ?? [])];
  return cityAliases.some((alias) => normalizeSearchText(alias) === normalizedPlaceCity);
}

export function detectCategoryFromQuery(query: string): string | null {
  return detectFromDictionary(query, CATEGORY_NAMES);
}

export function detectCityFromQuery(query: string): string | null {
  return detectFromDictionary(query, CITY_DICTIONARY);
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

  const numbers = [...normalizedQuery.matchAll(/(?:^|\s)(\d{1,5}(?:,\d{3})?(?:\.\d+)?)(?=\s|$)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));

  const budgetNumber = numbers.find((value) => value >= 20 && value <= 99999) ?? null;
  if (budgetNumber === null) return null;

  return { min: null, max: budgetNumber };
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
  const bestScore = Math.max(
    scoreCandidateText(normalizeSearchText(place.name), cleanedQuery, { exact: 100, startsWith: 80, contains: 60 }),
    scoreCandidateText(normalizeSearchText(place.slug), cleanedQuery, { exact: 90, startsWith: 70, contains: 55 }),
    ...place.search_terms.map((term) =>
      scoreCandidateText(normalizeSearchText(term), cleanedQuery, { exact: 85, startsWith: 65, contains: 50 }),
    ),
  );

  if (bestScore > 0) return bestScore;

  const candidateTexts = [
    normalizeSearchText(place.name),
    normalizeSearchText(place.slug),
    ...place.search_terms.map((term) => normalizeSearchText(term)),
  ];
  if (tokens.length > 0 && candidateTexts.some((candidate) => tokens.every((token) => candidate.includes(token)))) {
    return 60;
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
  const effectiveSignals = mergeSignals(explicitSignals, querySignals ?? emptySignals());

  const hasAnySignal = Boolean(effectiveSignals.category || effectiveSignals.city || effectiveSignals.budget || effectiveSignals.good_for);

  return activePlaces
    .map((place) => {
      if (!filterPlaceByFilters(place, effectiveSignals.category, effectiveSignals.city, effectiveSignals.budget, effectiveSignals.good_for)) {
        return null;
      }

      let score = 0;
      if (normalizedQuery) {
        score = scorePlaceNameMatch(place, normalizedQuery);
        if (score === 0 && !hasAnySignal) {
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
