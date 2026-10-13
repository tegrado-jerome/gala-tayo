import type { NormalizedPlace } from "./places";
import { FINAL_PLACE_CATEGORIES } from "./places";
import {
  DESTINATIONS,
  METRO_MANILA_REGION_SLUG,
  REGIONS,
  findDestinationByName,
  getDestinationNameKeys,
  isMetroManilaDestination,
  resolveDestination,
} from "../utils/phDestinations";
import { isOpenNow } from "../utils/openingHours";
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
  // "mura" or "budget" with no amount: places that cost little to get into.
  cheap: ["mura", "murang", "cheap", "affordable", "budget", "budget friendly", "tipid", "low cost"],
};
const CHEAP_MAX = 300;


export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Dictionary phrases are normalized once; every search checks thousands of them.
const normalizedPhrases = new Map<string, string>();

function includesWholePhrase(text: string, phrase: string): boolean {
  let normalizedPhrase = normalizedPhrases.get(phrase);
  if (normalizedPhrase === undefined) {
    normalizedPhrase = normalizeSearchText(phrase);
    normalizedPhrases.set(phrase, normalizedPhrase);
  }
  return normalizedPhrase !== "" && ` ${text} `.includes(` ${normalizedPhrase} `);
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

  let aliases = cityAliasSets.get(city);
  if (!aliases) {
    aliases = new Set([city, ...(CITY_DICTIONARY[city] ?? PROVINCIAL_CITY_DICTIONARY[city] ?? [])].map(normalizeSearchText));
    cityAliasSets.set(city, aliases);
  }
  return aliases.has(normalizedPlaceCity);
}

const cityAliasSets = new Map<string, Set<string>>();

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

  const cheap = BUDGET_KEYWORDS.cheap.some((keyword) => includesWholePhrase(normalizedQuery, keyword)) ? { min: null, max: CHEAP_MAX } : null;
  const hasBudgetKeyword = BUDGET_KEYWORDS.max.some((keyword) =>
    includesWholePhrase(normalizedQuery, keyword),
  );
  if (!hasBudgetKeyword) return cheap;

  const numbers = [...normalizedQuery.matchAll(/(?:^|\s)(\d{1,5}(?:,\d{3})?(?:\.\d+)?)(?=\s|$)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));

  const validNumbers = numbers.filter((value) => value >= 20 && value <= 99999);
  if (validNumbers.length === 0) return cheap;

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

const PROVINCES = [...new Set(DESTINATIONS.filter((destination) => !isMetroManilaDestination(destination)).map((destination) => destination.provinceName))];

// Island groups and regions people search by name: "mindanao", "bicol", "visayas".
const ISLAND_GROUPS: Record<string, string[]> = {
  luzon: ["Metro Manila", "Cordillera", "Ilocos Region", "Cagayan Valley", "Central Luzon", "Calabarzon", "Mimaropa", "Bicol"],
  visayas: ["Western Visayas", "Negros Island", "Central Visayas", "Eastern Visayas"],
  mindanao: ["Zamboanga Peninsula", "Northern Mindanao", "Davao Region", "Caraga", "Soccsksargen"],
};
const REGION_GROUPS: Record<string, string[]> = {
  ...ISLAND_GROUPS,
  "metro manila": ["Metro Manila"],
  ncr: ["Metro Manila"],
  kamaynilaan: ["Metro Manila"],
  ...Object.fromEntries(REGIONS.filter((region) => region.slug !== METRO_MANILA_REGION_SLUG).map((region) => [foldText(region.name), [region.name]])),
};

const LOCATION_WORDS = [...new Set(
  [...Object.entries(CITY_DICTIONARY), ...Object.entries(PROVINCIAL_CITY_DICTIONARY)]
    .flatMap(([city, aliases]) => [city, ...aliases])
    .concat(PROVINCES, Object.keys(REGION_GROUPS))
    .flatMap((alias) => foldText(alias).split(" "))
    .filter((word) => word.length >= 5),
)];

// Place names typed as one word ("elnido", "launion", "puertoprincesa") read as the name.
const JOINED_LOCATION_NAMES: Record<string, string> = Object.fromEntries(
  [...Object.entries(CITY_DICTIONARY), ...Object.entries(PROVINCIAL_CITY_DICTIONARY)]
    .flatMap(([city, aliases]) => [city, ...aliases])
    .concat(PROVINCES)
    .map(foldText)
    .filter((name) => name.includes(" "))
    .map((name) => [name.replace(/ /g, ""), name]),
);

// The same list in, the same active list out, so per-list caches (the typo vocabulary) are built once, not per search.
const activeLists = new WeakMap<NormalizedPlace[], NormalizedPlace[]>();
function activeOf(places: NormalizedPlace[]): NormalizedPlace[] {
  let active = activeLists.get(places);
  if (!active) {
    active = places.filter((place) => place.status === "active");
    activeLists.set(places, active);
  }
  return active;
}

const readQuery = (query: string, places: NormalizedPlace[]) => parseQueryIntent(query, places, { locationWords: LOCATION_WORDS, rewrites: JOINED_LOCATION_NAMES });

/** The text as search reads it: folded, nicknames expanded and typos fixed ("bora", "chocolate hils"). */
export function readQueryText(query: string, places: NormalizedPlace[]): string {
  return normalizeSearchText(readQuery(query, activeOf(places)).text);
}

/** A province named in the query ("waterfalls cebu", "beach batangas"), unless a city in it is named too. */
function detectProvince(normalizedQuery: string, city: string | null): string | null {
  const province = PROVINCES.filter((name) => includesWholePhrase(normalizedQuery, name)).sort((a, b) => b.length - a.length)[0] ?? null;
  if (!province) return null;
  // "Baguio, Benguet" stays Baguio; plain "cebu" means the province, not only Cebu City.
  return city && normalizeSearchText(city) !== normalizeSearchText(province) && includesWholePhrase(normalizedQuery, city) ? null : province;
}

function detectRegion(normalizedQuery: string): { phrase: string; regions: string[] } | null {
  const phrase = Object.keys(REGION_GROUPS).filter((name) => includesWholePhrase(normalizedQuery, name)).sort((a, b) => b.length - a.length)[0];
  return phrase ? { phrase, regions: REGION_GROUPS[phrase] } : null;
}

function locationWords(names: Array<string | null>): Set<string> {
  const aliases = names.filter((name): name is string => Boolean(name)).flatMap((name) => [name, ...(CITY_DICTIONARY[name] ?? PROVINCIAL_CITY_DICTIONARY[name] ?? [])]);
  return new Set(aliases.flatMap((alias) => foldText(alias).split(" ")));
}

const isLocationOnly = (normalizedQuery: string) =>
  Boolean(canonicalCity(normalizedQuery) ?? PROVINCES.find((name) => normalizeSearchText(name) === normalizedQuery) ?? REGION_GROUPS[normalizedQuery]);

/** The text names only a city, province or region ("palawan", "puerto princesa"), not a place. */
export const isLocationQuery = (text: string) => isLocationOnly(normalizeSearchText(text));

/** Places whose own name holds the whole query ("rizal park", "mount apo"): a place named outright beats any reading of its words. */
function namedPlaces(places: NormalizedPlace[], normalizedQuery: string): NormalizedPlace[] {
  if (!normalizedQuery.includes(" ") || isLocationOnly(normalizedQuery)) return [];
  return places.filter(
    (place) => includesWholePhrase(normalizeSearchText(place.name), normalizedQuery) || includesWholePhrase(normalizeSearchText(place.slug.replace(/-/g, " ")), normalizedQuery),
  );
}

const GALA_SCORES: Record<string, number> = galaScores;

const hasAnyTag = (place: NormalizedPlace, tag: string) => place.tags.some((value) => value.toLowerCase() === tag);

// "Near Manila" is a day trip (about two to three hours out); near any other city is a shorter ride.
const NEAR_METRO_KM = 150;
const NEAR_CITY_KM = 60;
// A city with few matches also shows what's a short ride around it: elsewhere in Metro Manila, or the next towns over.
const AROUND_KM = 30;
const AROUND_MIN = 5;
// With no place named, a weekend trip or a day trip starts from Manila, where most trips start. Straight-line km:
// roads run about a third longer, so 200 km is roughly a four-hour drive (Baguio, La Union) and 120 km about two to three.
const TRIP_KM = { weekend: 200, day: 120 } as const;
const NEAR_WORDS = /\b(near|nearby|malapit(?:\s+sa)?|around|close\s+to|outside|labas\s+ng|from|mula\s+sa)\s+(.+)$/;
// "From Manila" and "outside Manila" ask for trips out of the city, so the city itself (all of Metro Manila) is left out.
const AWAY_WORDS = /^(outside|labas|from|mula)/;
const LEAVE_METRO_KM = 40;
const LEAVE_TOWN_KM = 10;
// Gala-worthiness is a ranking signal of its own, worth up to 4 points: less than one step of fit to a vibe (5).
const GALA_WEIGHT = 1 / 25;
// A hotel is a place to stay; it leads only a search that asks for one.
const STAY_WORDS = /\b(hotel|hotels|staycation|resort|resorts|overnight|stay|accommodation|matutulugan)\b/;

// Places a search can be "near" that are not towns. Coordinates are the terminals.
const LANDMARKS: Array<{ phrase: string; centre: Point; radiusKm: number }> = [
  { phrase: "clark airport", centre: { latitude: 15.186, longitude: 120.56 }, radiusKm: 30 },
  { phrase: "mactan airport", centre: { latitude: 10.3075, longitude: 123.9794 }, radiusKm: 30 },
  { phrase: "cebu airport", centre: { latitude: 10.3075, longitude: 123.9794 }, radiusKm: 30 },
  { phrase: "manila airport", centre: { latitude: 14.5086, longitude: 121.0198 }, radiusKm: 20 },
  { phrase: "airport", centre: { latitude: 14.5086, longitude: 121.0198 }, radiusKm: 20 },
];

// Who-for vibes match half the catalogue loosely (a museum is "family" too); when enough places are a clear
// fit, only those count, so "date night" means the date-night places, not every place a couple could visit.
const NARROW_VIBES = new Set<VibeId>(["date", "family", "barkada"]);
const NARROW_MIN = 8;

type Point = { latitude: number | null; longitude: number | null };
type Near = { centre: Point; radiusKm: number; minKm?: number; words: string[]; byDistance: boolean };

export type SearchOptions = {
  /** The moment "open now" is checked against. */
  now?: Date;
  /** Only places whose hours say they are open at `now` (the "Open now" chip). */
  openNow?: boolean;
  /** Only places you can reach without a car (the "No car needed" chip). */
  noCar?: boolean;
  /** Search around this city instead of only inside it (a city with few matches). */
  around?: string;
};

function distanceKm(a: Point, b: Point) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Where a city is: its own centre, or the middle of its places. */
function cityCentre(city: string, places: NormalizedPlace[]): Point | null {
  const destination = findDestinationByName(city);
  if (destination) return { latitude: destination.center[0], longitude: destination.center[1] };
  const inCity = places.filter((place) => cityMatches(place.city, city) && place.latitude != null && place.longitude != null);
  if (inCity.length === 0) return null;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { latitude: median(inCity.map((place) => place.latitude!)), longitude: median(inCity.map((place) => place.longitude!)) };
}

/** "Hiking near Manila", "near the airport": the named place is a centre to measure from, not a filter. Null when no "near" is asked. */
function detectNear(normalizedQuery: string, places: NormalizedPlace[]): Near | null {
  const landmark = LANDMARKS.find(({ phrase }) => includesWholePhrase(normalizedQuery, phrase));
  if (landmark) return { centre: landmark.centre, radiusKm: landmark.radiusKm, words: landmark.phrase.split(" "), byDistance: true };
  const [, nearWord = "", after] = normalizedQuery.match(NEAR_WORDS) ?? [];
  const city = after ? detectCityFromQuery(after) : null;
  const centre = city ? cityCentre(city, places) : null;
  if (!city || !centre) return null;
  const metro = Boolean(CITY_DICTIONARY[city]);
  const leaving = AWAY_WORDS.test(nearWord);
  return {
    centre,
    radiusKm: metro ? NEAR_METRO_KM : NEAR_CITY_KM,
    minKm: leaving ? (metro ? LEAVE_METRO_KM : LEAVE_TOWN_KM) : undefined,
    words: [...locationWords([city])],
    // A trip out of town wants the best places in reach; "near" wants the closest.
    byDistance: !leaving,
  };
}

function aroundCity(city: string, places: NormalizedPlace[]): Near | null {
  const centre = cityCentre(city, places);
  return centre ? { centre, radiusKm: AROUND_KM, words: [...locationWords([city])], byDistance: true } : null;
}

/**
 * Ranks places for a search. Vibe words ("date", "libre", "talon", "kape") must fit the place's own tags,
 * category or price; every other word must appear in the place's name, tags, area or search terms, while
 * describing words ("famous", "spanish") only rank a place up. A place named outright ("rizal park") comes first.
 * A word found only in a long description counts as a match only when nothing matches better, for a
 * one-word search ("fireflies"), and never for a dish ("halo-halo"): a beach that mentions halo-halo is not a halo-halo place.
 * Outing words ("pasyalan", "things to do") ask for the best places; "near <city>" ranks by distance from it;
 * "open now" keeps the places whose hours say they are open. Equal matches go to the more gala-worthy place.
 */
export function rankPlaces(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}, options: SearchOptions = {}): RankedPlace[] {
  const activePlaces = activeOf(places);
  const explicit = getExplicitFilters(filters);
  const intent = readQuery(query, activePlaces);
  const normalizedQuery = normalizeSearchText(intent.text);
  const tripFromManila = intent.trip ? aroundCity("Manila", activePlaces) : null;
  let near = explicit.city ? null : options.around ? aroundCity(options.around, activePlaces) : detectNear(normalizedQuery, activePlaces);
  const regionMatch = explicit.city || near ? null : detectRegion(normalizedQuery);
  // "Metro Manila" names the region, not the City of Manila inside it.
  const detectedCity = explicit.city ?? (normalizedQuery && !regionMatch?.phrase.includes(" ") ? detectCityFromQuery(normalizedQuery) : null);
  const province = explicit.city || near ? null : detectProvince(normalizedQuery, detectedCity);
  const region = province || detectedCity ? null : regionMatch;
  const city = province || near ? null : detectedCity;
  if (!near && !city && !province && !region && intent.trip && tripFromManila) {
    near = { ...tripFromManila, radiusKm: TRIP_KM[intent.trip], minKm: LEAVE_METRO_KM, byDistance: false };
  } else if (near && intent.trip && !options.around) {
    // "Weekend trip from Manila": out of the city, as far as that kind of trip goes.
    near = { ...near, radiusKm: TRIP_KM[intent.trip], minKm: near.minKm ?? (CITY_DICTIONARY[detectedCity ?? ""] ? LEAVE_METRO_KM : LEAVE_TOWN_KM), byDistance: false };
  }
  const budget = explicit.budget ?? (normalizedQuery ? detectBudgetFromQuery(normalizedQuery) : null);
  // The place is a filter, not a word to find in it: "date bgc" must not need "bgc" in the name.
  const where = new Set([...locationWords([detectedCity, province]), ...(near?.words ?? []), ...(region?.phrase.split(" ") ?? [])]);
  const seen = new Set<string>();
  const terms = intent.terms.filter(([word]) => !where.has(word) && !seen.has(word) && seen.add(word));
  const openNow = intent.openNow || options.openNow === true;
  const hasFilter = Boolean(explicit.category ?? city ?? province ?? region ?? near ?? budget ?? explicit.good_for) || openNow || options.noCar === true;
  const named = new Set(namedPlaces(activePlaces, normalizedQuery).map((place) => place.slug));
  if (normalizedQuery && named.size === 0 && terms.length === 0 && intent.vibes.length === 0 && !hasFilter && !intent.browse) return [];

  const now = options.now ?? new Date();
  const asksForStay = STAY_WORDS.test(normalizedQuery) || explicit.category === "Hotel";
  const away = (place: NormalizedPlace) => (near ? (distanceKm(near.centre, place) ?? Infinity) : 0);
  const ranked = activePlaces.flatMap((place) => {
    if (!filterPlaceByFilters(place, explicit.category, named.has(place.slug) ? null : city, budget, explicit.good_for)) return [];
    if (named.has(place.slug)) return [{ place, score: 1000 + scorePlaceNameMatch(place, normalizedQuery), descriptionOnly: false }];
    if (province && resolveDestination(place.city, place.area)?.provinceName !== province) return [];
    if (region && !region.regions.includes(resolveDestination(place.city, place.area)?.regionName ?? "")) return [];
    if (near && (away(place) > near.radiusKm || away(place) < (near.minKm ?? 0))) return [];
    if (openNow && isOpenNow(place.opening_hours, now).state !== "open") return [];
    if (options.noCar && !vibeMatches(place, "no-car")) return [];
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
    for (const alternatives of intent.soft) {
      const field = termField(place, alternatives);
      if (field) score += FIELD_WEIGHT[field];
    }
    if (terms.length > 0) score += scorePlaceNameMatch(place, normalizedQuery);
    if (!asksForStay && hasAnyTag(place, "hotel")) score -= 3;
    // Near a place, distance decides between equal matches (below); everywhere else, gala-worthiness counts too.
    if (!near?.byDistance) score += (GALA_SCORES[place.slug] ?? 0) * GALA_WEIGHT;
    return [{ place, score, descriptionOnly }];
  });

  const strong = ranked.filter((entry) => !entry.descriptionOnly);
  let kept = strong.length > 0 || terms.length > 1 || intent.vibes.length > 0 || isDishQuery(terms) ? strong : ranked;
  for (const vibe of intent.vibes.filter((id) => NARROW_VIBES.has(id))) {
    const clear = kept.filter((entry) => vibeScore(entry.place, vibe) === 2 || named.has(entry.place.slug));
    if (clear.length >= NARROW_MIN) kept = clear;
  }
  // Near a city, places a short ride out beat equally good ones half a day away (bands of a quarter of the radius).
  const band = (place: NormalizedPlace) => (near?.byDistance ? Math.floor(away(place) / Math.min(40, near.radiusKm / 4)) : 0);
  // Around a town, its own province first: the spot across the strait is closer on the map, not on the road.
  const homeProvince = options.around ? findDestinationByName(options.around)?.provinceName : null;
  const awayFromHome = (place: NormalizedPlace) => (homeProvince && resolveDestination(place.city, place.area)?.provinceName !== homeProvince ? 1 : 0);
  return kept
    .map(({ place, score }) => ({ place, score }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        awayFromHome(left.place) - awayFromHome(right.place) ||
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
  free: "free places", indoor: "indoor places", heritage: "heritage sites", "island-hopping": "island hopping tours",
  "theme-park": "theme parks", wildlife: "wildlife spots",
  "no-car": "places you can reach without a car", solo: "solo-friendly places",
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
 * A search that never dead-ends. A town with few matches also shows what's a short ride away ("nightlife manila"
 * finds Poblacion in Makati), with a note saying so. When nothing near a named place fits ("cafe tagaytay"), the area's
 * own best places come back with a plain note; a dish no place lists ("halo-halo") gets the top food trips with the same
 * kind of note. Other searches without a place stay empty, honestly.
 */
export type AreaSearch = {
  ranked: RankedPlace[];
  note: string | null;
  /** The query as read, when a typo was fixed ("waterfals" -> "waterfalls"), for a "Showing results for" line. */
  didYouMean: string | null;
  /** The query said "near me": results rank by distance once the searcher shares a location. */
  nearMe: boolean;
};

// "El Nido or Coron", "baguio vs sagada": both, side by side.
const EITHER = /\s+(?:or|o|vs|versus)\s+/;

/** Takes turns between lists, so "el nido or coron" shows both from the top. */
function interleave(lists: RankedPlace[][]): RankedPlace[] {
  const seen = new Set<string>();
  const merged: RankedPlace[] = [];
  for (let index = 0; lists.some((list) => index < list.length); index++) {
    for (const list of lists) {
      const entry = list[index];
      if (entry && !seen.has(entry.place.slug)) {
        seen.add(entry.place.slug);
        merged.push(entry);
      }
    }
  }
  return merged;
}

export function searchPlacesInArea(places: NormalizedPlace[], query: string, filters: PlaceSearchFilters = {}, options: SearchOptions = {}): AreaSearch {
  const parts = normalizeSearchText(query).split(EITHER).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((part) => searchPlacesInArea(places, part, filters, options));
    const found = each.filter((result) => result.ranked.length > 0);
    if (found.length === 0) return { ranked: [], note: null, didYouMean: null, nearMe: false };
    return {
      ranked: interleave(found.map((result) => result.ranked)),
      note: null,
      didYouMean: each.some((result) => result.didYouMean) ? each.map((result, index) => result.didYouMean ?? parts[index]).join(" or ") : null,
      nearMe: each.some((result) => result.nearMe),
    };
  }
  const active = activeOf(places);
  const intent = readQuery(query, active);
  const answer = (ranked: RankedPlace[], note: string | null): AreaSearch => ({
    ranked,
    note,
    didYouMean: intent.corrections.length > 0 ? intent.text : null,
    nearMe: intent.nearMe,
  });
  const ranked = rankPlaces(places, query, filters, options);
  if (!normalizeSearchText(query)) return answer(ranked, null);
  const normalizedQuery = normalizeSearchText(intent.text);
  const explicitCity = canonicalCity(filters.city);
  const city = explicitCity ?? detectCityFromQuery(normalizedQuery);
  const province = explicitCity ? null : detectProvince(normalizedQuery, city);
  const where = locationWords([city, province]);
  const terms = intent.terms.filter(([word]) => !where.has(word));
  const termPhrase = askedPhrase(terms.map(([word]) => word));
  const asked = [...intent.vibes.map((vibe) => VIBE_LABEL[vibe] ?? vibe), termPhrase].filter(Boolean).join(" and ");
  const label = city ? (findDestinationByName(city)?.label ?? city) : null;

  const searchesAround = city && !explicitCity && !province && !detectNear(normalizedQuery, active);
  if (searchesAround && ranked.length < AROUND_MIN) {
    const inCity = new Set(ranked.map(({ place }) => place.slug));
    const nearby = rankPlaces(places, query, filters, { ...options, around: city }).filter(({ place }) => !inCity.has(place.slug));
    if (nearby.length > 0) {
      const note = ranked.length === 0
        ? `No ${asked || "spots"} in ${label} itself yet, so here are the closest ones nearby.`
        : `Only ${ranked.length} in ${label}, so spots a short ride away are included.`;
      return answer([...ranked, ...nearby], note);
    }
  }
  if (ranked.length > 0) return answer(ranked, null);

  const area = province ?? city;
  if (!area) {
    if (intent.vibes.length > 0 || !isDishQuery(terms)) return answer(ranked, null);
    const food = rankPlaces(places, "food", filters, options);
    return food.length > 0 ? answer(food, `No ${termPhrase} spots on GalaTayo yet. Here are the top food trips instead.`) : answer(ranked, null);
  }
  const fallback = rankPlaces(places, "", { ...filters, city: province ? null : city }, options)
    .filter(({ place }) => !province || resolveDestination(place.city, place.area)?.provinceName === province);
  if (fallback.length === 0) return answer(ranked, null);
  const areaLabel = province ?? label;
  return answer(fallback, asked ? `No ${asked} in ${areaLabel} on GalaTayo yet. Here are ${areaLabel}'s top picks instead.` : `Here are ${areaLabel}'s top picks.`);
}
