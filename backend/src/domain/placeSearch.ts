import type { NormalizedPlace } from "./places";
import { FINAL_PLACE_CATEGORIES } from "./places";
import { CATEGORY_KEYWORDS } from "../utils/categoryKeywords";
import { getSearchTerms, includesNormalizedPhrase, normalizeSearchText, uniqueNormalizedTerms } from "../utils/searchMatching";

export type PlaceSearchIntent = {
  normalizedQuery: string;
  tokens: string[];
  category: string | null;
  city: string | null;
  area: string | null;
  intents: string[];
  maxBudget: number | null;
  minBudget: number | null;
  free: boolean;
  priceLevel: number | null;
};

export type PlaceSearchFilters = {
  category?: string | null;
  city?: string | null;
  area?: string | null;
  budget?: string | null;
  maxBudget?: number | null;
  minBudget?: number | null;
  priceLevel?: number | null;
  goodFor?: string | null;
  tags?: string[];
};

export type RankedPlace = {
  place: NormalizedPlace;
  score: number;
};

type BudgetConstraints = {
  maxBudget: number | null;
  minBudget: number | null;
  free: boolean;
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  Activity: ["activity", "activities", "things to do", "laro", "games", "arcade", "bowling", "sports", ...(CATEGORY_KEYWORDS.activity ?? []), ...(CATEGORY_KEYWORDS.arcade ?? [])],
  Cafe: ["cafe", "coffee", "coffee shop", "kapihan", "kape", ...(CATEGORY_KEYWORDS.cafe ?? [])],
  Cinema: ["cinema", "movie", "movies", "sine", "pelikula", ...(CATEGORY_KEYWORDS.cinema ?? [])],
  Food: ["food", "restaurant", "resto", "kainan", "pagkain", "food trip", "saan kakain", ...(CATEGORY_KEYWORDS.food ?? []), ...(CATEGORY_KEYWORDS.kainan ?? [])],
  Heritage: ["heritage", "history", "historical", "kasaysayan", "old church", "monument", ...(CATEGORY_KEYWORDS.heritage ?? [])],
  Hotel: ["hotel", "hotels", "staycation", "accommodation", "matutuluyan", "overnight stay", ...(CATEGORY_KEYWORDS.hotel ?? []), ...(CATEGORY_KEYWORDS.stay ?? [])],
  Mall: ["mall", "shopping", "shopping center", "food court", ...(CATEGORY_KEYWORDS.mall ?? [])],
  Museum: ["museum", "museo", "exhibit", "gallery", "educational trip", ...(CATEGORY_KEYWORDS.museum ?? [])],
  Nightlife: ["nightlife", "bar", "drinks", "inuman", "club", "late night", ...(CATEGORY_KEYWORDS.nightlife ?? [])],
  Park: ["park", "parke", "garden", "green space", "picnic", ...(CATEGORY_KEYWORDS.park ?? []), ...(CATEGORY_KEYWORDS.parke ?? [])],
};

const CATEGORY_INTENT_ALIASES: Record<string, string[]> = {
  Activity: ["activity", "activities", "things to do", "arcade", "arcades", "bowling", "billiards", "karaoke", "ktv", "game", "games", "gaming", "sports", "laro", "pang laro"],
  Cafe: ["cafe", "cafes", "coffee", "coffee shop", "coffeeshop", "kapihan", "kape", "espresso", "latte", "tambay cafe", "study cafe", "work cafe"],
  Cinema: ["cinema", "cinemas", "movie", "movies", "movie theater", "movie theatre", "sine", "pelikula", "imax"],
  Food: ["food", "foods", "food trip", "foodtrip", "restaurant", "restaurants", "resto", "kainan", "pagkain", "dining", "kain", "saan kakain", "where to eat"],
  Heritage: ["heritage", "historical", "historic", "history", "monument", "monuments", "old church", "heritage site", "historical site", "church", "chapel", "cathedral", "basilica", "shrine"],
  Hotel: ["hotel", "hotels", "staycation", "resort", "overnight", "accommodation", "room", "rooms", "suite", "suites"],
  Mall: ["mall", "malls", "shopping mall", "shopping malls", "shopping center", "shopping centre", "commercial center", "town center", "lifestyle mall", "malling", "gala sa mall", "tambay sa mall"],
  Museum: ["museum", "museums", "museo", "gallery", "galleries", "art gallery", "exhibit", "exhibition", "science museum", "art museum", "history museum"],
  Nightlife: ["nightlife", "night life", "bar", "bars", "pub", "club", "clubs", "drinks", "cocktails", "beer", "wine", "inuman", "inom", "night out", "rooftop bar", "speakeasy"],
  Park: ["park", "parks", "parke", "garden", "gardens", "green space", "public park", "picnic", "pasyal sa park", "pang picnic"],
};

const CITY_ALIASES: Record<string, string[]> = {
  Caloocan: ["caloocan", "caloocan city"],
  "Las Pinas": ["las pinas", "las pinas city", "las piñas", "las piñas city"],
  Makati: ["makati", "makati city"],
  Malabon: ["malabon", "malabon city"],
  Mandaluyong: ["mandaluyong", "mandaluyong city"],
  Manila: ["manila", "city of manila"],
  Marikina: ["marikina", "marikina city"],
  Muntinlupa: ["muntinlupa", "muntinlupa city", "alabang"],
  Navotas: ["navotas", "navotas city"],
  Paranaque: ["paranaque", "paranaque city", "parañaque", "parañaque city"],
  Pasay: ["pasay", "pasay city"],
  Pasig: ["pasig", "pasig city"],
  Pateros: ["pateros"],
  "Quezon City": ["quezon city", "qc"],
  "San Juan": ["san juan", "san juan city"],
  Taguig: ["taguig", "taguig city", "bgc", "bonifacio global city"],
  Valenzuela: ["valenzuela", "valenzuela city"],
};

const AREA_ALIASES: Record<string, string[]> = {
  "Bonifacio Global City": ["bgc", "bonifacio global city"],
  "BF Homes": ["bf", "bf homes"],
  Alabang: ["alabang", "filinvest city", "festival mall alabang"],
  "Ortigas Center": ["ortigas", "ortigas center"],
  Poblacion: ["poblacion", "makati poblacion"],
  Kapitolyo: ["kapitolyo", "pasig kapitolyo"],
  Binondo: ["binondo"],
};

const INTENT_ALIASES: Record<string, string[]> = {
  date: ["date", "dating", "jowa", "romantic", "anniversary", "couple"],
  "rainy-day": ["rainy day", "rain", "ulan", "maulan"],
  indoor: ["indoor", "aircon", "covered"],
  outdoor: ["outdoor", "open air", "outside"],
  "food-trip": ["food trip", "kainan", "saan kakain", "pagkain"],
  "budget-friendly": ["budget", "cheap", "affordable", "mura", "murang", "tipid"],
  family: ["family", "pamilya", "kids", "children"],
  barkada: ["barkada", "friends", "tropa", "group"],
  staycation: ["staycation", "overnight", "hotel"],
  pool: ["pool", "swimming pool"],
  study: ["study", "work", "laptop", "quiet"],
  chill: ["chill", "relax", "relaxing", "unwind", "tambay", "tambayan", "cozy", "vibe"],
  tourist: ["tourist", "tourist spot", "sightseeing", "landmark", "attraction", "pasyalan", "galaan", "saan pupunta"],
  free: ["free", "libre", "libreng", "walang bayad"],
};

const GOOD_FOR_FILTERS: Record<string, string[]> = {
  date: ["Casual Date", "Date Night", "Couples Getaway", "Romantic Date", "Anniversary"],
  barkada: ["Barkada Hangout", "Group Activity", "Small Groups", "Friends"],
  family: ["Family Trip", "Family Stay", "Family Day", "Family Bonding", "Kids"],
  solo: ["Solo Trip", "Solo Date", "Me Time"],
  kids: ["Kids", "Family Trip", "Family Day"],
  study: ["Study Session", "Quiet Study", "Work Session"],
  staycation: ["Staycation", "Family Stay", "Couples Getaway"],
  "food-trip": ["Food Trip", "Family Meal", "Barkada Hangout"],
  "photo-spot": ["Photo Spot", "Content Shoot"],
  relaxing: ["Relaxing", "Chill", "Quiet Time"],
};

const RELATED_CATEGORY_GROUPS: Record<string, string[]> = {
  Food: ["Cafe", "Nightlife"],
  Heritage: ["Museum"],
  Mall: ["Activity", "Cinema", "Park"],
  Museum: ["Heritage"],
  Park: ["Activity"],
};

const CATEGORY_GROUP_COMPETITORS: Record<string, string[]> = {};

const MALL_CONTEXT_TERMS = [
  "alabang town center",
  "araneta center",
  "araneta city",
  "ayala center",
  "ayala malls",
  "blue bay walk",
  "bonifacio high street",
  "century city",
  "circuit makati",
  "commercenter",
  "eastwood",
  "estancia",
  "evia",
  "festival mall",
  "gateway mall",
  "glorietta",
  "greenbelt",
  "greenhills",
  "landmark makati",
  "makati central square",
  "mall of asia",
  "market market",
  "megamall",
  "molito",
  "newport",
  "parqal",
  "power plant",
  "robinsons",
  "robinsons place",
  "robinsons mall",
  "rockwell",
  "santolan town plaza",
  "shangri la plaza",
  "sm aura",
  "sm city",
  "sm mall",
  "sm north",
  "the 30th",
  "tiendesitas",
  "trinoma",
  "uptown",
  "venice grand canal",
  "vista mall",
  "westgate",
];

const BUDGET_QUERY_TERMS = new Set([
  "budget",
  "php",
  "p",
  "peso",
  "pesos",
  "per",
  "head",
  "person",
  "each",
  "under",
  "below",
  "less",
  "than",
  "hanggang",
  "mga",
  "max",
  "maximum",
  "within",
  "around",
  "about",
  "at",
  "least",
  "minimum",
  "min",
  "over",
  "above",
  "starting",
  "starts",
  "premium",
  "luxury",
  "upscale",
]);

function matchesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesNormalizedPhrase(text, phrase));
}

export function canonicalCategory(value: string | null | undefined): string | null {
  const normalized = normalizeSearchText(value ?? "");
  if (!normalized || normalized === "all") return null;
  for (const category of FINAL_PLACE_CATEGORIES) {
    const terms = [category, ...(CATEGORY_ALIASES[category] ?? [])];
    if (terms.some((term) => normalizeSearchText(term) === normalized)) return category;
  }
  return null;
}

export function canonicalCity(value: string | null | undefined): string | null {
  const normalized = normalizeSearchText(value ?? "");
  if (!normalized || normalized === "all") return null;
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if ([city, ...aliases].some((term) => normalizeSearchText(term) === normalized)) return city;
  }
  return value?.trim() || null;
}

function detectFromDictionary(normalizedQuery: string, dictionary: Record<string, string[]>): string | null {
  for (const [key, aliases] of Object.entries(dictionary)) {
    if ([key, ...aliases].some((alias) => includesNormalizedPhrase(normalizedQuery, alias))) return key;
  }
  return null;
}

function detectAllFromDictionary(normalizedQuery: string, dictionary: Record<string, string[]>): string[] {
  return Object.entries(dictionary)
    .filter(([key, aliases]) => [key, ...aliases].some((alias) => includesNormalizedPhrase(normalizedQuery, alias)))
    .map(([key]) => key);
}

function parseBudgetAmount(rawAmount: string, suffix = ""): number | null {
  const normalizedAmount = rawAmount.replace(/,/g, "").trim();
  const parsedAmount = Number(normalizedAmount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return null;
  const multiplier = normalizeSearchText(suffix) === "k" ? 1000 : 1;
  return Math.round(parsedAmount * multiplier);
}

function getBudgetAmountPattern(): string {
  return String.raw`(?:php|p|₱|peso|pesos)?\s*(\d{1,5}(?:,\d{3})?|\d+(?:\.\d+)?)\s*(k)?`;
}

function detectBudget(normalizedQuery: string): { maxBudget: number | null; minBudget: number | null; free: boolean } {
  const free = matchesAny(normalizedQuery, INTENT_ALIASES.free);
  const amountPattern = getBudgetAmountPattern();
  const underMatch = normalizedQuery.match(new RegExp(String.raw`\b(?:under|below|less than|hanggang|mga under|max|maximum|budget|around|about|mga|within)\s*${amountPattern}\b`));
  const overMatch = normalizedQuery.match(new RegExp(String.raw`\b(?:over|above|at least|minimum|min|starting at|starts at)\s*${amountPattern}\b`));
  const rangeMatch = normalizedQuery.match(new RegExp(String.raw`\b${amountPattern}\s*(?:(?:to|and|through)\s*)?${amountPattern}\b`));
  const amountWithCurrencyMatch = normalizedQuery.match(new RegExp(String.raw`(?:php|p|₱|peso|pesos)\s*(\d{1,5}(?:,\d{3})?|\d+(?:\.\d+)?)\s*(k)?\b`));
  const standaloneAmountMatch = normalizedQuery.match(/\b(\d{2,5}(?:,\d{3})?|\d+(?:\.\d+)?)\s*(k)?\s*(?:per head|per person|each|budget|php|peso|pesos)?\b/);
  const premium = matchesAny(normalizedQuery, ["premium", "luxury", "high end", "high-end", "upscale"]);
  const underAmount = underMatch ? parseBudgetAmount(underMatch[1], underMatch[2] ?? "") : null;
  const overAmount = overMatch ? parseBudgetAmount(overMatch[1], overMatch[2] ?? "") : null;
  const rangeMaxAmount = rangeMatch ? parseBudgetAmount(rangeMatch[3], rangeMatch[4] ?? "") : null;
  const currencyAmount = amountWithCurrencyMatch ? parseBudgetAmount(amountWithCurrencyMatch[1], amountWithCurrencyMatch[2] ?? "") : null;
  const standaloneAmount = standaloneAmountMatch ? parseBudgetAmount(standaloneAmountMatch[1], standaloneAmountMatch[2] ?? "") : null;
  return {
    maxBudget: free ? 0 : overAmount !== null ? null : underAmount ?? rangeMaxAmount ?? currencyAmount ?? standaloneAmount,
    minBudget: overAmount ?? (premium ? 2000 : null),
    free,
  };
}

export function interpretPlaceSearchQuery(query: string): PlaceSearchIntent {
  const normalizedQuery = normalizeSearchText(query);
  const budget = detectBudget(normalizedQuery);
  const category = detectFromDictionary(normalizedQuery, CATEGORY_INTENT_ALIASES);
  const city = detectFromDictionary(normalizedQuery, CITY_ALIASES);
  const area = detectFromDictionary(normalizedQuery, AREA_ALIASES);
  return {
    normalizedQuery,
    tokens: getSearchTerms(normalizedQuery),
    category,
    city,
    area,
    intents: detectAllFromDictionary(normalizedQuery, INTENT_ALIASES),
    priceLevel: null,
    ...budget,
  };
}

export function getExactLocationLabelForIntent(intent: Pick<PlaceSearchIntent, "city" | "area">): string | null {
  return intent.area ?? intent.city ?? null;
}

function placeText(place: NormalizedPlace, keys: Array<keyof NormalizedPlace>): string {
  return normalizeSearchText(keys.map((key) => {
    const value = place[key];
    return Array.isArray(value) ? value.join(" ") : String(value ?? "");
  }).join(" "));
}

function normalizedPlaceSearchTerms(place: NormalizedPlace): string[] {
  return uniqueNormalizedTerms(place.search_terms);
}

function tokenMatchesText(tokens: string[], text: string): number {
  return tokens.filter((token) => includesNormalizedPhrase(text, token)).length;
}

function isBudgetQueryToken(token: string): boolean {
  if (BUDGET_QUERY_TERMS.has(token)) return true;
  return /^\d+(?:\.\d+)?k?$/.test(token);
}

function getNonBudgetQueryTokens(intent: PlaceSearchIntent): string[] {
  if (intent.maxBudget === null && intent.minBudget === null && !intent.free) return intent.tokens;
  return intent.tokens.filter((token) => !isBudgetQueryToken(token));
}

function budgetMatches(place: NormalizedPlace, maxBudget: number | null, minBudget: number | null, free = false): boolean {
  if (maxBudget === null && minBudget === null && !free) return true;
  if (place.budget_min === null) return false;
  if (free && place.budget_min !== 0) return false;
  if (maxBudget !== null && place.budget_min > maxBudget) return false;
  if (minBudget !== null && place.budget_min < minBudget) return false;
  return true;
}

function resolveBudgetConstraints(filters: PlaceSearchFilters, intent: PlaceSearchIntent): BudgetConstraints {
  const hasExplicitBudget =
    (filters.budget !== undefined && filters.budget !== null && filters.budget !== "any") ||
    filters.maxBudget !== null && filters.maxBudget !== undefined ||
    filters.minBudget !== null && filters.minBudget !== undefined;

  const explicitMaxBudget =
    filters.maxBudget ??
    (filters.budget === "free"
      ? 0
      : filters.budget === "under-300"
        ? 300
        : filters.budget === "under-500"
          ? 500
          : filters.budget === "500-1000"
            ? 1000
            : filters.budget === "1000-2000"
              ? 2000
              : null);
  const explicitMinBudget =
    filters.minBudget ??
    (filters.budget === "1000-plus"
      ? 1000
      : filters.budget === "2000-plus"
        ? 2000
        : null);

  if (hasExplicitBudget) {
    return {
      maxBudget: explicitMaxBudget,
      minBudget: explicitMinBudget,
      free: filters.budget === "free",
    };
  }

  return {
    maxBudget: intent.maxBudget,
    minBudget: intent.minBudget,
    free: intent.free,
  };
}

function placeMatchesGoodFor(place: NormalizedPlace, goodFor: string | null | undefined): boolean {
  if (!goodFor || goodFor === "all") return true;
  const terms = GOOD_FOR_FILTERS[normalizeSearchText(goodFor)] ?? [goodFor];
  const text = placeText(place, ["good_for", "tags", "search_terms"]);
  return terms.some((term) => includesNormalizedPhrase(text, term));
}

function placeCategory(place: NormalizedPlace): string | null {
  return canonicalCategory(place.category) ?? null;
}

function placeHasCategoryGroupEvidence(place: NormalizedPlace, category: string): boolean {
  const terms = [
    category,
    ...(CATEGORY_INTENT_ALIASES[category] ?? []),
    ...(category === "Mall" ? MALL_CONTEXT_TERMS : []),
  ];
  const text = placeText(place, ["name", "slug", "area", "search_terms", "tags"]);
  return matchesAny(text, terms);
}

function placeMatchesCategoryGroup(place: NormalizedPlace, category: string): boolean {
  const actualCategory = placeCategory(place);
  if (actualCategory === category) return true;

  if (actualCategory && (RELATED_CATEGORY_GROUPS[category] ?? []).includes(actualCategory)) {
    return placeHasCategoryGroupEvidence(place, category);
  }

  return placeHasCategoryGroupEvidence(place, category);
}

function tagMatchCount(place: NormalizedPlace, tags: string[]): number {
  if (tags.length === 0) return 0;
  const normalizedTags = new Set(place.tags.map((tag) => normalizeSearchText(tag)));
  return tags.filter((tag) => normalizedTags.has(normalizeSearchText(tag))).length;
}

function placeMatchesIdentityQuery(place: NormalizedPlace, query: string): boolean {
  if (!query) return false;
  const name = normalizeSearchText(place.name);
  const slug = normalizeSearchText(place.slug);
  const searchTerms = normalizedPlaceSearchTerms(place);
  return (
    name === query ||
    name.startsWith(query) ||
    includesNormalizedPhrase(name, query) ||
    slug === query ||
    searchTerms.some((term) => term === query || term.startsWith(query) || includesNormalizedPhrase(term, query))
  );
}

export function placeMatchesExplicitFilters(place: NormalizedPlace, filters: PlaceSearchFilters): boolean {
  const intent = interpretPlaceSearchQuery("");
  return placeMatchesEffectiveFilters(place, filters, intent);
}

function placeMatchesEffectiveFilters(place: NormalizedPlace, filters: PlaceSearchFilters, intent: PlaceSearchIntent): boolean {
  const effectiveCategory = canonicalCategory(filters.category) ?? intent.category;
  const explicitCity = canonicalCity(filters.city);
  const explicitArea = filters.area && filters.area !== "all" ? normalizeSearchText(filters.area) : null;
  const effectiveCity = explicitCity ?? (explicitArea ? null : intent.city);
  const effectiveArea = explicitArea ?? (explicitCity ? null : intent.area ? normalizeSearchText(intent.area) : null);
  const budgetConstraints = resolveBudgetConstraints(filters, intent);
  const hasStrongIdentityMatch = placeMatchesIdentityQuery(place, intent.normalizedQuery);

  if (effectiveCategory && !placeMatchesCategoryGroup(place, effectiveCategory)) return false;
  if (effectiveCity && normalizeSearchText(place.city ?? "") !== normalizeSearchText(effectiveCity) && !(hasStrongIdentityMatch && !explicitCity)) return false;
  if (effectiveArea && !matchesAny(placeText(place, ["area", "city", "search_terms"]), [effectiveArea]) && !(hasStrongIdentityMatch && !explicitArea)) return false;
  if (!budgetMatches(place, budgetConstraints.maxBudget, budgetConstraints.minBudget, budgetConstraints.free)) return false;
  if (filters.priceLevel !== null && filters.priceLevel !== undefined && place.price_level !== filters.priceLevel) return false;
  if (!placeMatchesGoodFor(place, filters.goodFor)) return false;
  if ((filters.tags ?? []).length > 0 && tagMatchCount(place, filters.tags ?? []) === 0) return false;
  return true;
}

export function scorePlaceForQuery(place: NormalizedPlace, intent: PlaceSearchIntent, filters: PlaceSearchFilters = {}): number {
  const query = intent.normalizedQuery;
  const tokens = intent.tokens;
  const name = normalizeSearchText(place.name);
  const slug = normalizeSearchText(place.slug);
  const category = normalizeSearchText(place.category);
  const city = normalizeSearchText(place.city ?? "");
  const area = normalizeSearchText(place.area ?? "");
  const goodForText = placeText(place, ["good_for"]);
  const tagText = placeText(place, ["tags"]);
  const description = normalizeSearchText(place.description ?? "");
  const searchTerms = normalizedPlaceSearchTerms(place);
  const searchText = searchTerms.join(" ");

  let score = 0;
  if (query) {
    if (name === query) score += 120;
    else if (name.startsWith(query)) score += 100;
    else if (includesNormalizedPhrase(name, query)) score += 85;
    if (slug === query) score += 80;
    if (searchTerms.some((term) => term === query)) score += 75;
    else if (searchTerms.some((term) => term.startsWith(query))) score += 60;
    else if (searchTerms.some((term) => includesNormalizedPhrase(term, query))) score += 50;
    if (tokens.length > 0 && tokens.every((token) => includesNormalizedPhrase(`${name} ${searchText}`, token))) score += 45;
    if (includesNormalizedPhrase(description, query)) score += 8;
    score += Math.min(tokenMatchesText(tokens, description) * 3, 12);
  }

  const effectiveCategory = canonicalCategory(filters.category) ?? intent.category;
  const explicitCity = canonicalCity(filters.city);
  const explicitArea = filters.area && filters.area !== "all" ? filters.area : null;
  const effectiveCity = explicitCity ?? (explicitArea ? null : intent.city);
  const effectiveArea = explicitArea ?? (explicitCity ? null : intent.area);
  const budgetConstraints = resolveBudgetConstraints(filters, intent);
  if (effectiveCategory && category === normalizeSearchText(effectiveCategory)) score += 60;
  if (effectiveCity && city === normalizeSearchText(effectiveCity)) score += 35;
  if (effectiveArea && matchesAny(`${area} ${searchText}`, [effectiveArea, ...(AREA_ALIASES[effectiveArea] ?? [])])) score += 35;

  const intentTerms = uniqueNormalizedTerms([
    ...intent.intents,
    ...intent.intents.flatMap((key) => INTENT_ALIASES[key] ?? []),
    filters.goodFor ?? "",
  ]);
  if (intentTerms.some((term) => matchesAny(goodForText, [term]))) score += 25;
  if (intentTerms.some((term) => matchesAny(tagText, [term]))) score += 25;
  if (budgetMatches(place, budgetConstraints.maxBudget, budgetConstraints.minBudget, budgetConstraints.free)) {
    score += budgetConstraints.maxBudget !== null || budgetConstraints.minBudget !== null || budgetConstraints.free ? 20 : 0;
  }
  if (intent.priceLevel !== null && place.price_level === intent.priceLevel) score += 10;

  const selectedTags = filters.tags ?? [];
  if (selectedTags.length > 0) score += Math.min(tagMatchCount(place, selectedTags) * 12, 30);

  const matchedParts = [
    Boolean(effectiveCategory && category === normalizeSearchText(effectiveCategory)),
    Boolean(effectiveCity && city === normalizeSearchText(effectiveCity)),
    Boolean(effectiveArea && matchesAny(`${area} ${searchText}`, [effectiveArea])),
    Boolean(intentTerms.some((term) => matchesAny(`${goodForText} ${tagText} ${searchText}`, [term]))),
    Boolean(query && searchTerms.some((term) => includesNormalizedPhrase(term, query))),
  ].filter(Boolean).length;
  if (matchedParts >= 3) score += 25;
  if (matchedParts >= 4) score += 15;

  return score;
}

function placeHasMeaningfulQueryMatch(place: NormalizedPlace, intent: PlaceSearchIntent): boolean {
  const query = intent.normalizedQuery;
  if (!query) return true;

  const name = normalizeSearchText(place.name);
  const slug = normalizeSearchText(place.slug);
  const category = normalizeSearchText(place.category);
  const city = normalizeSearchText(place.city ?? "");
  const area = normalizeSearchText(place.area ?? "");
  const description = normalizeSearchText(place.description ?? "");
  const goodForText = placeText(place, ["good_for"]);
  const tagText = placeText(place, ["tags"]);
  const searchTerms = normalizedPlaceSearchTerms(place);
  const searchText = searchTerms.join(" ");
  const locationText = `${city} ${area} ${searchText}`;
  const nonBudgetTokens = getNonBudgetQueryTokens(intent);
  const hasBudgetOnlyQuery = (intent.maxBudget !== null || intent.minBudget !== null || intent.free) && nonBudgetTokens.length === 0;
  const queryIsCategoryOnly = intent.category
    ? [intent.category, ...(CATEGORY_ALIASES[intent.category] ?? [])].some((term) => normalizeSearchText(term) === query)
    : false;
  const queryIsCityOnly = intent.city
    ? [intent.city, ...(CITY_ALIASES[intent.city] ?? [])].some((term) => normalizeSearchText(term) === query)
    : false;
  const queryIsAreaOnly = intent.area
    ? [intent.area, ...(AREA_ALIASES[intent.area] ?? [])].some((term) => normalizeSearchText(term) === query)
    : false;
  const allTokensMatch = nonBudgetTokens.length > 0 && nonBudgetTokens.every((token) =>
    includesNormalizedPhrase(`${name} ${category} ${locationText} ${goodForText} ${tagText} ${description}`, token)
  );

  if (hasBudgetOnlyQuery) return true;
  if (name === query || name.startsWith(query) || includesNormalizedPhrase(name, query)) return true;
  if (slug === query) return true;
  if (searchTerms.some((term) => term === query || term.startsWith(query) || includesNormalizedPhrase(term, query))) return true;
  if (allTokensMatch) return true;
  if (includesNormalizedPhrase(description, query)) return true;
  if (intent.category && placeMatchesCategoryGroup(place, intent.category)) return true;

  if (intent.category && category === normalizeSearchText(intent.category) && queryIsCategoryOnly) return true;
  if (intent.city && city === normalizeSearchText(intent.city) && queryIsCityOnly) return true;
  if (intent.area && matchesAny(locationText, [intent.area, ...(AREA_ALIASES[intent.area] ?? [])]) && queryIsAreaOnly) return true;
  if (intent.free && place.budget_min === 0) return true;

  const intentTerms = uniqueNormalizedTerms([
    ...intent.intents,
    ...intent.intents.flatMap((key) => INTENT_ALIASES[key] ?? []),
  ]);
  return intentTerms.some((term) => matchesAny(`${goodForText} ${tagText} ${searchText}`, [term]));
}

function placePassesRelevanceGate(place: NormalizedPlace, intent: PlaceSearchIntent, score: number): boolean {
  if (!intent.normalizedQuery) return true;
  if (score <= 0) return false;
  return placeHasMeaningfulQueryMatch(place, intent);
}

export function rankPlaces(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}): RankedPlace[] {
  const intent = interpretPlaceSearchQuery(query);
  return places
    .filter((place) => place.status === "active")
    .filter((place) => placeMatchesEffectiveFilters(place, filters, intent))
    .map((place) => ({ place, score: scorePlaceForQuery(place, intent, filters) }))
    .filter(({ place, score }) => placePassesRelevanceGate(place, intent, score))
    .sort((left, right) => right.score - left.score || left.place.name.localeCompare(right.place.name));
}
