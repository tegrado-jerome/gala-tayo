import type { NormalizedPlace } from "./places";

// Reads what a search or Tara ask is about: the vibe ("date", "libre", "umuulan"), the kind of place
// ("talon", "dagat", "kape") and the words left over, with Tagalog and common typos understood.
// Shared by Search and Tara so both read a query the same way.

export type VibeId =
  | "date"
  | "barkada"
  | "family"
  | "coffee"
  | "food"
  | "nightlife"
  | "view"
  | "sunset"
  | "free"
  | "indoor"
  | "beach"
  | "waterfall"
  | "mountain"
  | "island"
  | "hot-spring"
  | "cave"
  | "museum"
  | "church"
  | "heritage"
  | "park"
  | "night"
  | "island-hopping"
  | "theme-park"
  | "wildlife";

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (value: string) => foldText(value).split(" ").filter(Boolean);
// Tags are written both ways ("hot-spring", "hot spring"), so hyphens read as spaces.
const lowerAll = (values: string[]) => values.map((value) => value.toLowerCase().replace(/-/g, " "));
const hasAny = (values: string[], wanted: string[]) => {
  const wantedText = lowerAll(wanted);
  return lowerAll(values).some((value) => wantedText.includes(value));
};
const nameHas = (place: Pick<NormalizedPlace, "name">, pattern: RegExp) => pattern.test(foldText(place.name));

const isReligiousSite = (place: NormalizedPlace) =>
  place.good_for.includes("Church Visit") || hasAny(place.tags, ["religious site", "church", "heritage church", "pilgrimage"]) || nameHas(place, /\b(church|cathedral|basilica|shrine|parish|chapel)\b/i);

const INDOOR_CATEGORIES = new Set(["Cafe", "Cinema", "Food", "Hotel", "Mall", "Museum", "Nightlife"]);
// A whole district, street, market or town (Poblacion's bars, Binondo, a night market) is walked outdoors,
// whatever the venues in it are filed as.
const OPEN_AIR = /\b(district|poblacion|chinatown|street|road|market|expo|bridge|plaza|boulevard|baywalk|town|village)\b/i;
const OPEN_AIR_TAGS = ["bar hopping", "street food", "heritage-town", "festival-town", "walking-friendly", "outdoor"];

/**
 * Whether a place works in the rain, from its own data: our "Rainy Day" or indoor tags first, then open-air
 * districts and outdoor places (never rain-proof), then a single-venue category. Null when unsure.
 */
export function isIndoorPlace(place: NormalizedPlace): boolean | null {
  if (place.good_for.some((tag) => /rainy day|indoor/i.test(tag)) || place.tags.some((tag) => /indoor|aircon|weather-friendly/i.test(tag))) return true;
  if (OPEN_AIR.test(place.name) || hasAny(place.tags, OPEN_AIR_TAGS)) return false;
  if (place.category === "Park" || /beach|island|falls|lagoon|hike|trail|terraces|peak|mount|garden|viewpoint|lookout/i.test(`${place.name} ${place.tags.join(" ")}`)) return false;
  if (INDOOR_CATEGORIES.has(place.category)) return true;
  return null;
}

/** A street, market or town people go to for the food, though it isn't filed as a restaurant (Binondo, Cubao Expo). */
export function isFoodStreet(place: Pick<NormalizedPlace, "category" | "tags" | "good_for" | "name">): boolean {
  if (place.category === "Food" || place.category === "Cafe" || place.category === "Park" || place.category === "Museum") return false;
  if (hasAny(place.tags, ["food-trip", "food trip", "street food"])) return true;
  return place.good_for.includes("Food Trip") && nameHas(place, /\b(chinatown|market|expo|poblacion|road|street|town)\b/i);
}

/**
 * A stop where people pay for a meal: a restaurant, or a food street with free entry (Binondo). Plans
 * price these at the meal estimate when the place lists no price, so a food crawl never reads as free.
 */
export function isMealStop(place: Pick<NormalizedPlace, "category" | "tags" | "good_for" | "name">): boolean {
  return place.category === "Food" || isFoodStreet(place);
}

const textArray = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** isMealStop for a raw places row (a plan item's joined place), where tags and good_for may be null. */
export function isMealStopRow(row: { name?: string | null; category?: string | null; tags?: unknown; good_for?: unknown } | null | undefined): boolean {
  if (!row) return false;
  return isMealStop({ name: row.name ?? "", category: row.category ?? "", tags: textArray(row.tags), good_for: textArray(row.good_for) });
}

/** `best` marks the clearest fits (a place named "... Falls" for "talon"), which rank first. */
type Vibe = { id: VibeId; phrases: string[]; matches: (place: NormalizedPlace) => boolean; best?: (place: NormalizedPlace) => boolean };

// Longer phrases are matched first, so "food trip" and "hot spring" are read whole.
const VIBES: Vibe[] = [
  {
    id: "date",
    phrases: ["date", "dates", "dating", "date night", "date spot", "romantic", "romance", "couple", "couples", "jowa", "anniversary", "monthsary", "pang date"],
    matches: (place) => hasAny(place.good_for, ["casual date", "date night", "anniversary", "special occasion"]) || hasAny(place.tags, ["date-friendly", "date-night", "date night", "romantic"]),
    best: (place) => hasAny(place.good_for, ["date night", "anniversary"]) || hasAny(place.tags, ["date-night", "date night", "romantic"]),
  },
  {
    id: "barkada",
    phrases: ["barkada", "friends", "tropa", "squad", "group", "pang barkada"],
    matches: (place) => hasAny(place.good_for, ["barkada hangout", "group dining"]) || hasAny(place.tags, ["barkada", "barkada-friendly", "group-friendly"]),
  },
  {
    id: "family",
    phrases: ["family", "families", "pamilya", "kids", "kid", "children", "child", "bata", "mga bata", "anak", "kid friendly", "family friendly"],
    matches: (place) => hasAny(place.good_for, ["family trip", "amusement park", "educational trip"]) || hasAny(place.tags, ["family", "family-friendly", "kids", "kid-friendly"]),
    // A church can welcome families, but it is never a clear pick for kids.
    best: (place) => (hasAny(place.tags, ["kids", "kid-friendly"]) || hasAny(place.good_for, ["amusement park", "educational trip"])) && !isReligiousSite(place),
  },
  {
    id: "coffee",
    phrases: ["kape", "kapehan", "kapihan", "coffee", "coffee shop", "cafe", "cafes", "kafe"],
    matches: (place) => place.category === "Cafe" || place.good_for.includes("Coffee Run") || hasAny(place.tags, ["coffee", "cafe", "cafes"]) || nameHas(place, /\b(caf[eé]|coffee)\b/i),
    best: (place) => place.category === "Cafe" || nameHas(place, /\b(cafe|coffee)\b/),
  },
  {
    id: "food",
    phrases: ["food", "food trip", "foodtrip", "food crawl", "kainan", "kain", "kakain", "eat", "restaurant", "restaurants", "resto", "pagkain", "foodie", "dinner", "lunch", "breakfast", "brunch", "dining"],
    matches: (place) => place.category === "Food" || isFoodStreet(place),
    best: (place) => place.category === "Food",
  },
  {
    id: "nightlife",
    phrases: ["nightlife", "night life", "bar", "bars", "inuman", "gimik", "club", "clubs", "night out", "pub"],
    matches: (place) => place.category === "Nightlife" || place.good_for.includes("Nightlife") || hasAny(place.tags, ["nightlife", "bar", "bars"]),
    best: (place) => place.category === "Nightlife",
  },
  {
    id: "view",
    phrases: ["view", "views", "viewpoint", "viewdeck", "view deck", "tanawin", "scenic", "overlooking"],
    matches: (place) =>
      // Any "... view" tag counts: taal-view, mayon-view, sea-view, 360-view.
      place.tags.some((tag) => /\b(view|viewpoint|view deck|lookout|sea of clouds|scenic|skyline|city lights)\b/i.test(tag.replace(/-/g, " "))) ||
      place.good_for.includes("Night View") ||
      nameHas(place, /\b(view|viewpoint|peak|hill|hills|deck|sky)\b/i),
    best: (place) => nameHas(place, /\b(view|viewpoint|deck)\b/),
  },
  {
    id: "sunset",
    phrases: ["sunset", "sunsets", "paglubog", "paglubog ng araw", "golden hour", "takipsilim"],
    // Our own sunset tag or name, not a passing "come before sunset" in the visiting tips.
    matches: (place) => hasAny(place.tags, ["sunset"]) || nameHas(place, /\bsunset\b/),
    best: (place) => nameHas(place, /\bsunset\b/),
  },
  {
    id: "free",
    phrases: ["free", "libre", "libreng", "walang bayad", "free entrance"],
    matches: (place) => place.budget_min === 0,
  },
  {
    id: "indoor",
    phrases: ["rainy", "rainy day", "rain", "umuulan", "maulan", "ulan", "indoor", "indoors", "aircon", "bagyo"],
    matches: (place) => isIndoorPlace(place) === true,
    // A museum or a place tagged for rainy days beats a restaurant that merely has a roof.
    best: (place) => place.category === "Museum" || place.good_for.some((tag) => /rainy day|indoor/i.test(tag)) || hasAny(place.tags, ["rainy day", "indoor"]),
  },
  {
    id: "beach",
    phrases: ["beach", "beaches", "dagat", "tabing dagat", "dalampasigan", "baybayin", "white sand"],
    matches: (place) => hasAny(place.tags, ["beach", "white sand", "cove", "sandbar"]) || nameHas(place, /\b(beach|cove|sandbar)\b/i),
    best: (place) => nameHas(place, /\b(beach|cove|sandbar)\b/),
  },
  {
    id: "waterfall",
    phrases: ["waterfall", "waterfalls", "falls", "talon", "talon ng tubig"],
    matches: (place) => hasAny(place.tags, ["waterfall", "waterfalls"]) || nameHas(place, /\bfalls\b/i),
    best: (place) => nameHas(place, /\bfalls\b/),
  },
  {
    id: "mountain",
    phrases: ["mountain", "mountains", "bundok", "hike", "hiking", "trek", "trekking", "akyat", "mountain climbing", "summit"],
    matches: (place) => hasAny(place.tags, ["hiking", "trek", "volcano", "mountain", "summit", "sea-of-clouds"]) || nameHas(place, /\b(mount|mt|peak|volcano)\b/i),
    best: (place) => nameHas(place, /\b(mount|mt|peak|volcano)\b/),
  },
  {
    id: "island",
    phrases: ["island", "islands", "isla", "islet"],
    matches: (place) => hasAny(place.tags, ["island", "island hopping", "island-hopping", "island tour"]) || nameHas(place, /\b(island|islands|isla|islas)\b/i),
    best: (place) => nameHas(place, /\b(island|islands|isla|islas)\b/),
  },
  {
    id: "hot-spring",
    phrases: ["hot spring", "hot springs", "hotspring", "hotsprings", "bukal", "mainit na bukal"],
    matches: (place) => hasAny(place.tags, ["hot spring", "hot springs"]) || nameHas(place, /\bhot springs?\b/i),
  },
  {
    id: "cave",
    phrases: ["cave", "caves", "kweba", "kuweba", "yungib"],
    matches: (place) => hasAny(place.tags, ["cave", "caves"]) || nameHas(place, /\bcaves?\b/i),
  },
  {
    id: "museum",
    phrases: ["museum", "museums", "museo", "gallery", "art gallery", "exhibit"],
    matches: (place) => place.category === "Museum",
  },
  {
    id: "church",
    phrases: ["church", "churches", "simbahan", "cathedral", "basilica", "visita iglesia"],
    matches: (place) => nameHas(place, /\b(church|cathedral|basilica|shrine|temple)\b/i) || hasAny(place.tags, ["heritage church", "church"]),
    best: (place) => nameHas(place, /\b(church|cathedral|basilica)\b/),
  },
  {
    id: "heritage",
    phrases: ["heritage", "history", "historical", "historic", "kasaysayan", "makasaysayan", "makasaysayang lugar", "old town"],
    matches: (place) => place.category === "Heritage" || place.good_for.includes("History Trip"),
    best: (place) => place.category === "Heritage",
  },
  {
    id: "park",
    phrases: ["park", "parks", "parke", "picnic", "garden", "gardens"],
    matches: (place) => place.category === "Park" || hasAny(place.tags, ["park", "garden"]),
  },
  {
    id: "night",
    phrases: ["night", "night spots", "night spot", "at night", "evening", "gabi", "sa gabi", "gabi gabi", "night view", "city lights", "late night"],
    matches: (place) =>
      place.category === "Nightlife" ||
      place.good_for.some((tag) => /night/i.test(tag)) ||
      hasAny(place.tags, ["nightlife", "night market", "night", "city lights", "night lights", "fountain show", "bar hopping", "evening"]),
    best: (place) => place.category === "Nightlife" || hasAny(place.tags, ["night market", "city lights", "night lights", "fountain show", "nightlife"]),
  },
  {
    id: "island-hopping",
    phrases: ["island hopping", "island hop", "islandhopping", "island tour", "island tours", "boat tour", "cove hopping"],
    matches: (place) => hasAny(place.tags, ["island hopping", "island tour", "boat tour", "cove hopping"]) || nameHas(place, /\b(island hopping|tour [a-d])\b/i),
    best: (place) => nameHas(place, /\b(island hopping|tour [a-d])\b/i),
  },
  {
    id: "theme-park",
    phrases: ["theme park", "theme parks", "amusement park", "water park", "waterpark", "rides", "perya", "ferris wheel"],
    matches: (place) => place.good_for.includes("Amusement Park") || hasAny(place.tags, ["theme park", "amusement park", "water park", "rides", "ferris wheel"]),
  },
  {
    id: "wildlife",
    phrases: ["wildlife", "animal", "animals", "animal encounter", "animal encounters", "hayop", "mga hayop"],
    matches: (place) =>
      hasAny(place.tags, ["wildlife", "tarsier", "safari", "zoo", "dolphins", "whale sharks", "whale shark", "sea turtles", "turtles", "birds", "birdwatching", "marine park", "giraffes", "thresher sharks", "national bird"]),
    // Sanctuaries and conservation work first, so "ethical animal encounters" never leads with a show.
    best: (place) => hasAny(place.tags, ["ethical", "conservation", "responsible tourism", "marine sanctuary"]),
  },
];

// Words for a thing that places name differently: "aquarium" finds Manila Ocean Park.
const TERM_SYNONYMS: Record<string, string[]> = {
  aquarium: ["ocean park", "oceanarium"],
  oceanarium: ["ocean park"],
  zoo: ["safari", "wildlife"],
  glamping: ["camping", "campsite", "camp"],
  camping: ["camping", "campsite", "camp"],
  firefly: ["fireflies"],
  fireflies: ["firefly"],
  lawa: ["lake"],
  ilog: ["river"],
  bulkan: ["volcano"],
  palengke: ["market"],
  pasalubong: ["pasalubong"],
  seafood: ["seafood", "lobster", "scallops", "crab", "oysters", "shrimp"],
  scuba: ["diving", "dive", "scuba"],
  diving: ["diving", "dive", "scuba"],
  mount: ["mount", "mt"],
  swimming: ["swimming", "swim", "beach", "snorkeling", "lagoon", "falls", "spring pools"],
  swim: ["swimming", "swim", "beach", "snorkeling", "lagoon", "falls", "spring pools"],
};

// Describing words ("spanish churches", "famous beaches") rank a place up when it has them but never rule one out.
const SOFT_WORDS = new Set(
  (
    "mount spanish colonial baroque old ancient famous popular iconic beautiful pretty aesthetic instagrammable scenic countryside " +
    "ethical responsible encounter encounters local authentic hidden secret underrated relaxing resort resorts"
  ).split(" ")
);

// Dishes and food words ("halo-halo", "lechon", "ramen"): a place serves one only if its own name or tags say so,
// never because a beach's description mentions a snack stall.
const DISH_WORDS = new Set(
  (
    "halo lechon sisig adobo sinigang bulalo lomi pancit batchoy kare inasal longganisa tapa tapsilog silog balut bibingka puto " +
    "kakanin ensaymada empanada taho turon laing kinilaw ulam pulutan merienda seafood crab crabs lobster shrimp prawn prawns oyster " +
    "oysters ramen sushi pizza burger burgers pasta steak samgyup samgyupsal bbq barbecue chicken wings dessert desserts cake cakes " +
    "ice cream gelato milktea milk tea boba donut donuts bread pastry pastries brunch breakfast lunch dinner buffet mango ube buko"
  ).split(" ")
);

/** Every word is a dish or food word ("halo halo", "milk tea"), so a description-only mention doesn't count. */
export function isDishQuery(terms: string[][]): boolean {
  return terms.length > 0 && terms.every(([word]) => DISH_WORDS.has(word));
}

// Words that say nothing about what to find ("saan", "best") or are read elsewhere (budget numbers, days).
const STOP_WORDS = new Set(
  (
    "a an the and or of in at on to for from with by near nearby around malapit sa ng na nang mga ang si ni kay ko ka mo ba po pa naman lang din rin " +
    "may para kasi sana pwede puwede meron mayroon dapat " +
    "yung ung dun doon dito diyan saan where what which who how ano anong paano pano place places spot spots lugar best good nice top great cool " +
    "masarap maganda magandang sulit swak gala galaan lakad pasyal pasyalan tara gusto want need looking find search recommend suggest " +
    "ideas idea things thing something somewhere today ngayon bukas tonight mamaya weekend saturday sunday sabado linggo this next " +
    "me my we us our kami tayo namin natin akin amin budget cheap mura affordable under below max php peso pesos each per head pax " +
    "day trip trips tour activity activities experience visit go puntahan pupuntahan " +
    // Who is asking ("first time, visiting") says nothing about the place.
    "visiting visitor visitors tourist tourists foreigner first time one two see safe safety female women woman girls alone " +
    // The question around a place ("is boracay worth it", "how to get to siargao", "2 week itinerary").
    "worth worthit get getting going reach how itinerary itineraries week weeks days nights guide guides tips plan planning travel " +
    "vacation holiday holidays trip trips should must really overrated"
  ).split(" ")
);

// Words that ask for any good outing, not one kind of place: "pasyalan", "family outing", "things to do".
// Alone they mean "show the best"; next to a vibe or a place they just drop out.
const BROWSE_PHRASES = [
  "pasyalan", "pasyal", "pamasyal", "gala", "galaan", "gala spots", "lakad", "lakwatsa", "outing", "outings", "bonding",
  "tourist spot", "tourist spots", "attraction", "attractions", "sightseeing", "sights", "things to do", "must see", "must visit",
  "places to visit", "where to go", "puntahan", "philippines", "pilipinas", "ph", "solo", "solo travel", "solo trip", "backpacking",
  "tambayan", "hangout", "itinerary", "getaway",
]
  .map(foldText)
  .sort((a, b) => b.length - a.length);

export type QueryIntent = {
  /** The query, folded and with typos fixed. */
  text: string;
  vibes: VibeId[];
  /** The query asks for any good outing ("pasyalan", "outing", "things to do"), so the best places all fit. */
  browse: boolean;
  /** Words left after vibes and filler, each with the alternatives that also count. */
  terms: string[][];
  /** Describing words ("famous", "spanish") that rank a place up without ruling any out. */
  soft: string[][];
  /** "open now", "bukas ngayon": only places open at this moment. */
  openNow: boolean;
  /** "near me", "malapit sa akin": rank by the searcher's own location, once they share it. */
  nearMe: boolean;
  /** "weekend trip" or "day trip" with no place named: how far out from the city a trip like that goes. */
  trip: "weekend" | "day" | null;
  /** Typos that were fixed, for logs and tests. */
  corrections: Array<[string, string]>;
};

function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Edits allowed for a typo: none for short words (too many false friends), one for most, two for long ones. */
function typoBudget(length: number) {
  return length < 5 ? 0 : length < 9 ? 1 : 2;
}

const VIBE_PHRASES = VIBES.flatMap((vibe) => vibe.phrases.map((phrase) => ({ phrase: foldText(phrase), id: vibe.id }))).sort((a, b) => b.phrase.length - a.phrase.length);
// Dish words are known too, so "ramen" is never "fixed" to a place name a letter away.
const KNOWN_QUERY_WORDS = new Set([...STOP_WORDS, ...BROWSE_PHRASES.flatMap((phrase) => phrase.split(" ")), ...VIBE_PHRASES.flatMap((entry) => entry.phrase.split(" ")), ...Object.keys(TERM_SYNONYMS), ...DISH_WORDS, ...SOFT_WORDS]);

// Short forms people type for places and things: "bora", "elyu", "mt apo".
const QUERY_ALIASES: Record<string, string> = {
  bora: "boracay",
  elyu: "la union",
  pp: "puerto princesa",
  ppur: "puerto princesa underground river",
  cdo: "cagayan de oro",
  gensan: "general santos",
  mt: "mount",
  mtn: "mountain",
  pi: "philippines",
  sarg: "siargao",
  dgte: "dumaguete",
  naia: "airport",
  camsur: "camarines sur",
  camnorte: "camarines norte",
};

const NEAR_ME_PHRASES = ["near me", "around me", "close to me", "nearest", "malapit sa akin", "malapit sakin", "malapit dito", "dito malapit"].map(foldText);
const OPEN_NOW_PHRASES = ["open now", "open right now", "open today", "currently open", "bukas ngayon", "bukas pa"].map(foldText);
const TRIP_PHRASES: Array<[string, "weekend" | "day"]> = [
  ["weekend trip", "weekend"], ["weekend getaway", "weekend"], ["long weekend", "weekend"], ["weekend", "weekend"],
  ["day trip", "day"], ["day tour", "day"], ["side trip", "day"], ["road trip", "day"],
];

type Vocabulary = { targets: Set<string>; known: Set<string> };
const vocabularyCache = new WeakMap<NormalizedPlace[], Vocabulary>();
const VIBE_WORDS = [...new Set(VIBE_PHRASES.flatMap((entry) => entry.phrase.split(" ")))].filter((word) => word.length >= 4);

/**
 * `targets`: words of place names, areas, cities and vibes, what a typo is most likely aiming at.
 * `known`: every word the places use anywhere ("dining" in a tag), which is never treated as a typo.
 */
function placeVocabulary(places: NormalizedPlace[]): Vocabulary {
  const cached = vocabularyCache.get(places);
  if (cached) return cached;
  const targets = new Set<string>(VIBE_WORDS);
  const known = new Set<string>();
  for (const place of places) {
    for (const word of words(`${place.name} ${place.city ?? ""} ${place.area ?? ""}`)) if (word.length >= 4) targets.add(word);
    for (const word of words(`${place.tags.join(" ")} ${place.good_for.join(" ")} ${place.search_terms.join(" ")} ${place.description ?? ""}`)) known.add(word);
  }
  const vocabulary = { targets, known };
  vocabularyCache.set(places, vocabulary);
  return vocabulary;
}

/**
 * Fixes a misspelt word ("baguoi", "intramurso", "hils") to the closest name, area, city or vibe word.
 * A four-letter word may only be missing or have one extra letter. A short word is never cut to a shorter one
 * unless it doubled a letter ("corron"), so "tokyo" doesn't become "toyo".
 */
export function correctTypo(word: string, vocabulary: Set<string>, extra: Iterable<string> = [], known: Set<string> = new Set()): string {
  const budget = word.length === 4 ? 1 : typoBudget(word.length);
  if (budget === 0 || vocabulary.has(word) || known.has(word) || KNOWN_QUERY_WORDS.has(word) || /\d/.test(word)) return word;
  const mayShorten = word.length >= 7 || /(.)\1/.test(word);
  let best: { word: string; distance: number } | null = null;
  for (const candidate of [...vocabulary, ...extra]) {
    if (Math.abs(candidate.length - word.length) > budget || candidate[0] !== word[0]) continue;
    if (word.length === 4 && candidate.length === word.length) continue;
    if (candidate.length < word.length && !mayShorten) continue;
    const distance = damerauLevenshtein(word, candidate);
    if (distance <= budget && (!best || distance < best.distance)) best = { word: candidate, distance };
  }
  return best?.word ?? word;
}

/** Takes a phrase out of the padded query text; true when it was there. */
function takePhrase(text: { value: string }, phrase: string): boolean {
  const pattern = ` ${phrase} `;
  if (!text.value.includes(pattern)) return false;
  text.value = text.value.split(pattern).join(" ");
  return true;
}

/** Reads a query: vibes, the words left to match, and typo fixes against the places' own names. */
/**
 * Reads a query: vibes, the words left to match, and typo fixes against the places' own names.
 * `rewrites` maps extra whole words to what they mean (place names typed as one word, "elnido").
 */
export function parseQueryIntent(
  query: string,
  places: NormalizedPlace[],
  { locationWords = [] as string[], rewrites = {} as Record<string, string> } = {},
): QueryIntent {
  const { targets, known } = placeVocabulary(places);
  const corrections: Array<[string, string]> = [];
  const fixed = words(query)
    .flatMap((word) => (rewrites[word] ?? QUERY_ALIASES[word] ?? word).split(" "))
    .map((word) => {
      const corrected = correctTypo(word, targets, locationWords, known);
      if (corrected !== word) corrections.push([word, corrected]);
      return corrected;
    });
  const rest = { value: ` ${fixed.join(" ")} ` };
  const openNow = OPEN_NOW_PHRASES.filter((phrase) => takePhrase(rest, phrase)).length > 0;
  const nearMe = NEAR_ME_PHRASES.filter((phrase) => takePhrase(rest, phrase)).length > 0;
  const trip = TRIP_PHRASES.find(([phrase]) => takePhrase(rest, phrase))?.[1] ?? null;
  const vibes: VibeId[] = [];
  for (const { phrase, id } of VIBE_PHRASES) {
    if (takePhrase(rest, phrase) && !vibes.includes(id)) vibes.push(id);
  }
  let browse = trip !== null || nearMe;
  for (const phrase of BROWSE_PHRASES) {
    if (takePhrase(rest, phrase)) browse = true;
  }
  const left = rest.value.split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+k?$/.test(word));
  const withSynonyms = (word: string) => [word, ...(TERM_SYNONYMS[word] ?? [])];
  const terms = left.filter((word) => !SOFT_WORDS.has(word)).map(withSynonyms);
  const soft = left.filter((word) => SOFT_WORDS.has(word)).map(withSynonyms);
  // Only describing words ("famous", "beautiful"): show the best places, the describing words rank them.
  if (terms.length === 0 && soft.length > 0 && vibes.length === 0) browse = true;
  return { text: fixed.join(" "), vibes, browse, terms, soft, openNow, nearMe, trip, corrections };
}

export function vibeMatches(place: NormalizedPlace, vibe: VibeId): boolean {
  return VIBES.find((entry) => entry.id === vibe)?.matches(place) ?? false;
}

/** How well a place fits a vibe: 0 not at all, 1 fits, 2 a clear fit. */
export function vibeScore(place: NormalizedPlace, vibe: VibeId): 0 | 1 | 2 {
  const entry = VIBES.find((candidate) => candidate.id === vibe);
  if (!entry?.matches(place)) return 0;
  return entry.best?.(place) ? 2 : 1;
}

// "beaches" -> "beach", "lakes" -> "lake", "falls" -> "fall": "es" goes only where English adds it.
const stem = (word: string) => (/(ch|sh|ss|x|z)es$/.test(word) ? word.slice(0, -2) : word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

const stemmed = (text: string) => ` ${words(text).map(stem).join(" ")} `;

export type TermField = "name" | "tags" | "location" | "search_terms" | "description";

// Each place's fields, folded and stemmed once: a search reads every place for every word.
const fieldCache = new WeakMap<NormalizedPlace, Array<[TermField, string]>>();

function placeFields(place: NormalizedPlace): Array<[TermField, string]> {
  const cached = fieldCache.get(place);
  if (cached) return cached;
  const fields: Array<[TermField, string]> = [
    ["name", stemmed(`${place.name} ${place.slug.replace(/-/g, " ")}`)],
    ["tags", stemmed([...place.tags, ...place.good_for, place.category].join(" , "))],
    ["location", stemmed(`${place.area ?? ""} , ${place.city ?? ""}`)],
    ["search_terms", stemmed(place.search_terms.join(" , "))],
    ["description", stemmed(place.description ?? "")],
  ];
  fieldCache.set(place, fields);
  return fields;
}

/**
 * Where a term matches a place as whole words (singular and plural alike), strongest field first; null when it
 * doesn't. The description alone is weak evidence.
 */
export function termField(place: NormalizedPlace, alternatives: string[]): TermField | null {
  const needles = alternatives.map(stemmed).filter((needle) => needle.trim());
  for (const [field, text] of placeFields(place)) {
    if (needles.some((needle) => text.includes(needle))) return field;
  }
  return null;
}

export const FIELD_WEIGHT: Record<TermField, number> = { name: 10, tags: 6, location: 5, search_terms: 3, description: 1 };
