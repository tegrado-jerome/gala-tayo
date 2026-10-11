import type { NormalizedPlace } from "./places";
import { FINAL_PLACE_CATEGORIES } from "./places";
import { DESTINATIONS, getDestinationNameKeys, isMetroManilaDestination, resolveDestination } from "../utils/phDestinations";
import galaScores from "../data/galaScores.json";
import goodForTags from "../data/goodForTags.json";
import { FIELD_WEIGHT, foldText, isDishQuery, parseQueryIntent, termField, vibeMatches, vibeScore, type VibeId } from "./queryIntent";

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

function budgetMatches(placeBudget: number | null, budget: BudgetFilter | null): boolean {
  if (!budget) return true;
  if (placeBudget === null) return false;
  if (budget.min !== null && placeBudget < budget.min) return false;
  if (budget.max !== null && placeBudget > budget.max) return false;
  return true;
}

const GOOD_FOR_TAGS: Record<string, string[]> = goodForTags;
const GOOD_FOR_VIBES: Record<string, VibeId> = { date: "date", barkada: "barkada", family: "family" };

function goodForMatches(place: NormalizedPlace, goodFor: string): boolean {
  const labels = (GOOD_FOR_TAGS[goodFor] ?? [goodFor]).map(normalizeSearchText);
  if (place.good_for.some((label) => labels.includes(normalizeSearchText(label)))) return true;
  const vibe = GOOD_FOR_VIBES[goodFor];
  return vibe ? vibeMatches(place, vibe) : false;
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

  if (goodFor && !goodForMatches(place, goodFor)) {
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

/** How well the whole query matches the place's own name: exact, start of the name, or inside it. */
export function scorePlaceNameMatch(place: NormalizedPlace, query: string): number {
  const cleanedQuery = normalizeSearchText(query);
  if (!cleanedQuery) return 0;
  return Math.max(
    scoreCandidateText(normalizeSearchText(place.name), cleanedQuery, { exact: 100, startsWith: 90, contains: 80 }),
    scoreCandidateText(normalizeSearchText(place.slug.replace(/-/g, " ")), cleanedQuery, { exact: 95, startsWith: 85, contains: 70 }),
  );
}

export function getExactLocationLabelForIntent(query: string): string | null {
  return detectCityFromQuery(query);
}

const LOCATION_WORDS = [...new Set(
  [...Object.entries(CITY_DICTIONARY), ...Object.entries(PROVINCIAL_CITY_DICTIONARY)]
    .flatMap(([city, aliases]) => [city, ...aliases])
    .flatMap((alias) => foldText(alias).split(" "))
    .filter((word) => word.length >= 5),
)];

const PROVINCES = [...new Set(DESTINATIONS.filter((destination) => !isMetroManilaDestination(destination)).map((destination) => destination.provinceName))];

/** A province named in the query ("waterfalls cebu", "beach batangas"), unless a city in it is named too. */
function detectProvince(normalizedQuery: string, city: string | null): string | null {
  const province = PROVINCES.filter((name) => includesWholePhrase(normalizedQuery, name)).sort((a, b) => b.length - a.length)[0] ?? null;
  if (!province) return null;
  // "Baguio, Benguet" stays Baguio; plain "cebu" means the province, not only Cebu City.
  return city && normalizeSearchText(city) !== normalizeSearchText(province) && includesWholePhrase(normalizedQuery, city) ? null : province;
}

function locationWords(names: Array<string | null>): Set<string> {
  const aliases = names.filter((name): name is string => Boolean(name)).flatMap((name) => [name, ...(CITY_DICTIONARY[name] ?? PROVINCIAL_CITY_DICTIONARY[name] ?? [])]);
  return new Set(aliases.flatMap((alias) => foldText(alias).split(" ")));
}

const GALA_SCORES: Record<string, number> = galaScores;

// "Near Manila" is a day trip (about two to three hours out); near any other city is a shorter ride.
const NEAR_METRO_KM = 150;
const NEAR_CITY_KM = 60;
const NEAR_WORDS = /\b(?:near|nearby|malapit(?:\s+sa)?|around|close\s+to|outside|labas\s+ng)\s+(.+)$/;

// Who-for vibes match half the catalogue loosely (a museum is "family" too); when enough places are a clear
// fit, only those count, so "date night" means the date-night places, not every place a couple could visit.
const NARROW_VIBES = new Set<VibeId>(["date", "family", "barkada"]);
const NARROW_MIN = 8;

function distanceKm(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** "Hiking near Manila": the named city is a centre to measure from, not a filter. Null when no "near" is asked. */
function detectNear(normalizedQuery: string, places: NormalizedPlace[]) {
  const after = normalizedQuery.match(NEAR_WORDS)?.[1];
  const city = after ? detectCityFromQuery(after) : null;
  if (!city) return null;
  const inCity = places.filter((place) => cityMatches(place.city, city) && place.latitude != null && place.longitude != null);
  if (inCity.length === 0) return null;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const centre = { latitude: median(inCity.map((place) => place.latitude!)), longitude: median(inCity.map((place) => place.longitude!)) };
  return { city, centre, radiusKm: CITY_DICTIONARY[city] ? NEAR_METRO_KM : NEAR_CITY_KM };
}

/**
 * Ranks places for a search. Vibe words ("date", "libre", "talon", "kape") must fit the place's own tags,
 * category or price; every other word must appear in the place's name, tags, area or search terms.
 * A word found only in a long description counts as a match only when nothing matches better, for a
 * one-word search ("fireflies"), and never for a dish ("halo-halo"): a beach that mentions halo-halo is not a halo-halo place.
 * Outing words ("pasyalan", "things to do") ask for the best places; "near <city>" ranks by distance from it.
 * Equal matches go to the more gala-worthy place.
 */
export function rankPlaces(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}): RankedPlace[] {
  const activePlaces = places.filter((place) => place.status === "active");
  const explicit = getExplicitFilters(filters);
  const intent = parseQueryIntent(query, activePlaces, { locationWords: LOCATION_WORDS });
  const normalizedQuery = normalizeSearchText(intent.text);
  const near = explicit.city ? null : detectNear(normalizedQuery, activePlaces);
  const detectedCity = explicit.city ?? (normalizedQuery ? detectCityFromQuery(normalizedQuery) : null);
  const province = explicit.city || near ? null : detectProvince(normalizedQuery, detectedCity);
  const city = province || near ? null : detectedCity;
  const budget = explicit.budget ?? (normalizedQuery ? detectBudgetFromQuery(normalizedQuery) : null);
  // The place is a filter, not a word to find in it: "date bgc" must not need "bgc" in the name.
  const where = locationWords([detectedCity, province]);
  const seen = new Set<string>();
  const terms = intent.terms.filter(([word]) => !where.has(word) && !seen.has(word) && seen.add(word));
  const hasFilter = Boolean(explicit.category ?? city ?? province ?? near ?? budget ?? explicit.good_for);
  if (normalizedQuery && terms.length === 0 && intent.vibes.length === 0 && !hasFilter && !intent.browse) return [];

  const away = (place: NormalizedPlace) => (near ? (distanceKm(near.centre, place) ?? Infinity) : 0);
  const ranked = activePlaces.flatMap((place) => {
    if (!filterPlaceByFilters(place, explicit.category, city, budget, explicit.good_for)) return [];
    if (province && resolveDestination(place.city, place.area)?.provinceName !== province) return [];
    if (near && away(place) > near.radiusKm) return [];
    let score = 0;
    for (const vibe of intent.vibes) {
      const fit = vibeScore(place, vibe);
      if (fit === 0) return [];
      score += fit * 5;
    }
    let descriptionOnly = terms.length > 0;
    for (const alternatives of terms) {
      const field = termField(place, alternatives);
      if (!field) return [];
      score += FIELD_WEIGHT[field];
      if (field !== "description") descriptionOnly = false;
    }
    if (terms.length > 0) score += scorePlaceNameMatch(place, normalizedQuery);
    return [{ place, score, descriptionOnly }];
  });

  const strong = ranked.filter((entry) => !entry.descriptionOnly);
  let kept = strong.length > 0 || terms.length > 1 || intent.vibes.length > 0 || isDishQuery(terms) ? strong : ranked;
  for (const vibe of intent.vibes.filter((id) => NARROW_VIBES.has(id))) {
    const clear = kept.filter((entry) => vibeScore(entry.place, vibe) === 2);
    if (clear.length >= NARROW_MIN) kept = clear;
  }
  // Near a city, places a short ride out beat equally good ones half a day away.
  const band = (place: NormalizedPlace) => (near ? Math.floor(away(place) / 40) : 0);
  return kept
    .map(({ place, score }) => ({ place, score }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        band(left.place) - band(right.place) ||
        (GALA_SCORES[right.place.slug] ?? 0) - (GALA_SCORES[left.place.slug] ?? 0) ||
        left.place.name.localeCompare(right.place.name),
    );
}

// What a vibe word asks for, for "no cafes in Tagaytay yet".
const VIBE_LABEL: Partial<Record<VibeId, string>> = {
  coffee: "cafes", food: "restaurants", nightlife: "bars", beach: "beaches", waterfall: "waterfalls", mountain: "hikes",
  island: "islands", "hot-spring": "hot springs", cave: "caves", museum: "museums", church: "churches", park: "parks",
  date: "date spots", family: "family spots", barkada: "barkada spots", view: "viewpoints", sunset: "sunset spots",
  free: "free places", indoor: "indoor places", heritage: "heritage sites",
};

/** The words asked for, as one phrase: Tagalog doubled words read whole ("halo halo" is "halo-halo"). */
function askedPhrase(words: string[]): string {
  const phrase: string[] = [];
  for (const word of words) {
    if (phrase.at(-1) === word) phrase[phrase.length - 1] = `${word}-${word}`;
    else phrase.push(word);
  }
  return phrase.join(" ");
}

/**
 * A search that never dead-ends: when nothing in a named place fits ("cafe tagaytay"), the area's own best
 * places come back with a note saying so plainly; a dish no place lists ("halo-halo") gets the top food trips
 * with the same kind of note. Other searches without a place stay empty, honestly.
 */
export function searchPlacesInArea(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}): { ranked: RankedPlace[]; note: string | null } {
  const ranked = rankPlaces(places, query, filters);
  if (ranked.length > 0 || !normalizeSearchText(query)) return { ranked, note: null };
  const active = places.filter((place) => place.status === "active");
  const intent = parseQueryIntent(query, active, { locationWords: LOCATION_WORDS });
  const normalizedQuery = normalizeSearchText(intent.text);
  const explicitCity = canonicalCity(filters.city);
  const city = explicitCity ?? detectCityFromQuery(normalizedQuery);
  const province = explicitCity ? null : detectProvince(normalizedQuery, city);
  const area = province ?? city;
  const where = locationWords([city, province]);
  const terms = intent.terms.filter(([word]) => !where.has(word));
  const termPhrase = askedPhrase(terms.map(([word]) => word));
  if (!area) {
    if (intent.vibes.length > 0 || !isDishQuery(terms)) return { ranked, note: null };
    const food = rankPlaces(places, "food", filters);
    return food.length > 0 ? { ranked: food, note: `No ${termPhrase} spots on GalaTayo yet. Here are the top food trips instead.` } : { ranked, note: null };
  }
  const fallback = rankPlaces(places, "", { ...filters, city: province ? null : city })
    .filter(({ place }) => !province || resolveDestination(place.city, place.area)?.provinceName === province);
  if (fallback.length === 0) return { ranked, note: null };
  const asked = [...intent.vibes.map((vibe) => VIBE_LABEL[vibe] ?? vibe), termPhrase].filter(Boolean).join(" and ") || "that";
  return { ranked: fallback, note: `No ${asked} in ${area} on GalaTayo yet. Here are ${area}'s top picks instead.` };
}
