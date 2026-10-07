import type { NormalizedPlace } from "../domain/places";
import { isFoodStreet, isIndoorPlace, isMealStop, parseQueryIntent, vibeScore, type VibeId } from "../domain/queryIntent";
import { extractJsonObject } from "../utils/jsonRepair";
import { DESTINATIONS, inferProvincialDestinationsFromQuery, isMetroManilaDestination, resolveDestination } from "../utils/phDestinations";
import { AREA_ALIASES, detectAliasedCities, isNearManila, locationText, mentionsPhrase } from "../utils/areaAliases";
import { getSunsetMinutes } from "../utils/sunTimes";

const MAX_CANDIDATES = 60;
export const PLAN_CANDIDATES = 30;
const MIN_STOPS = 2;
const MAX_STOPS = 6;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ["dinner", "lunch", "breakfast", "brunch", "kain", "kakain", "food", "eat", "resto", "restaurant", "merienda", "foodtrip"],
  Cafe: ["cafe", "coffee", "kape", "study", "tambay"],
  Cinema: ["sine", "movie", "cinema", "film"],
  Museum: ["museum", "art", "gallery", "exhibit"],
  Heritage: ["heritage", "history", "historical", "church", "old"],
  Mall: ["mall", "shopping", "shop"],
  Park: ["park", "nature", "outdoor", "walk", "picnic", "sunset"],
  Nightlife: ["night", "bar", "inuman", "drinks", "rooftop", "party", "gimik"],
  Activity: ["activity", "play", "arcade", "sports", "adventure", "kids"],
  Hotel: ["hotel", "staycation", "stay"],
};

const SUNSET_WORDS = /\b(sunset|golden hour|takipsilim|paglubog)\b/i;

export type DraftStop = {
  place_id: string;
  time: string;
  minutes: number;
  note: string;
};

export type DraftResponse = {
  title: string;
  summary: string;
  group_size: number;
  stops: DraftStop[];
};

export function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export type LocationIntent = {
  cities: Set<string>;
  destinationSlugs: Set<string>;
  /** District words from the request ("bgc", "intramuros"), to favour places in that part of the city. */
  areaWords?: Set<string>;
  /** "Beach near Manila": places outside Metro Manila are welcome. */
  nearManila?: boolean;
  /** A province named on its own ("waterfalls in cebu"): every place in it counts, not only its capital. */
  provinces?: Set<string>;
};

const PROVINCE_NAMES = [...new Set(DESTINATIONS.filter((destination) => !isMetroManilaDestination(destination)).map((destination) => destination.provinceName))];

/**
 * Provinces the text names without naming one of their cities: "cebu" is the province (Kawasan, Moalboal),
 * "cebu city" is the city. "Quezon City" never reads as Quezon province.
 */
function provincesNamedAlone(text: string): Set<string> {
  const lower = locationText(text);
  const matches = inferProvincialDestinationsFromQuery(text);
  return new Set(
    PROVINCE_NAMES.filter((province) => {
      const name = province.toLowerCase();
      if (!mentionsPhrase(lower, name) || mentionsPhrase(lower, `${name} city`)) return false;
      // A longer phrase naming one of its towns ("moalboal", "san juan batangas") is that town, not the whole province.
      return !matches.some(({ destination, matchedPhrase }) => destination.provinceName === province && matchedPhrase !== name);
    })
  );
}

/** Cities and destinations named in free text; empty when the text names no place. */
export function detectLocationIntent(places: NormalizedPlace[], text: string): LocationIntent {
  const lower = locationText(text);
  const { cities, aliases } = detectAliasedCities(text);
  for (const place of places) {
    const city = (place.city ?? "").toLowerCase();
    if (city && mentionsPhrase(lower, city)) cities.add(city);
  }
  const provinces = provincesNamedAlone(text);
  const destinationSlugs = new Set(
    inferProvincialDestinationsFromQuery(text)
      .filter(({ destination }) => !provinces.has(destination.provinceName))
      .map(({ destination }) => destination.slug)
  );
  return { cities, destinationSlugs, areaWords: aliases, nearManila: isNearManila(text), provinces };
}

export function hasLocation(intent: LocationIntent) {
  return intent.cities.size > 0 || intent.destinationSlugs.size > 0 || (intent.provinces?.size ?? 0) > 0;
}

// With no place named in the prompt, plans stay in Metro Manila.
export function matchesLocation(place: NormalizedPlace, { cities, destinationSlugs, provinces }: LocationIntent) {
  const destination = resolveDestination(place.city, place.area);
  return (
    cities.has((place.city ?? "").toLowerCase()) ||
    (destination !== null && (destinationSlugs.has(destination.slug) || Boolean(provinces?.has(destination.provinceName))))
  );
}

function scoreLocation(place: NormalizedPlace, location: LocationIntent) {
  if (hasLocation(location)) {
    return matchesLocation(place, location) ? 6 : -4;
  }

  if (location.nearManila) return 0;
  const destination = resolveDestination(place.city, place.area);
  return destination === null || isMetroManilaDestination(destination) ? 0 : -10;
}

/** The place named in the request when GalaTayo has too few places there, so callers can say so instead of planning elsewhere. */
export function findUncoveredArea(places: NormalizedPlace[], text: string, minimum = 2): string | null {
  // Within Metro Manila, neighbouring cities are a short ride away, so plans can draw on them.
  const provincial = inferProvincialDestinationsFromQuery(text)[0]?.destination;
  if (!provincial) return null;
  const location = detectLocationIntent(places, text);
  const covered = places.filter((place) => place.latitude != null && matchesLocation(place, location)).length;
  return covered >= minimum ? null : provincial.label;
}

// Words that say where or how much, not what: matching them would favour any place named "Manila ...".
const FILLER_WORDS = new Set(["manila", "metro", "near", "malapit", "best", "saan", "good", "nice", "place", "places", "spot", "spots", "with", "para", "yung", "naman", "lang"]);
const MANILA_CENTRE = { latitude: 14.5995, longitude: 120.9842 };

function scorePlace(place: NormalizedPlace, text: string, location: LocationIntent, categories: Set<string>) {
  const haystack = [place.name, place.area, place.category, ...place.tags, ...place.good_for, ...place.search_terms]
    .join(" ")
    .toLowerCase();

  let score = 0;
  score += scoreLocation(place, location);
  // "BGC" or "Intramuros" names a district: places in it beat the rest of the city.
  const where = `${place.area ?? ""} ${place.name} ${place.address ?? ""}`.toLowerCase();
  if ([...(location.areaWords ?? [])].some((word) => where.includes(word) || (word === "bgc" && where.includes("bonifacio")))) score += 3;
  if (categories.has(place.category)) score += 4;
  for (const word of text.split(/[^a-z0-9ñ]+/).filter((token) => token.length > 3 && !FILLER_WORDS.has(token))) {
    if (haystack.includes(word)) score += 2;
  }
  // "Near Manila" means a day trip out of the city: outside Metro Manila, and closer beats farther.
  if (location.nearManila) {
    const destination = resolveDestination(place.city, place.area);
    score -= destination === null || isMetroManilaDestination(destination) ? 3 : (distanceKm(place, MANILA_CENTRE) ?? 0) / 150;
  }
  score += Math.min(1, (place.average_rating ?? 0) / 5);
  return score;
}

export function detectCategories(text: string) {
  const lower = text.toLowerCase();
  return new Set(
    Object.entries(CATEGORY_KEYWORDS)
      .filter(([, words]) => words.some((word) => new RegExp(`\\b${word}`).test(lower)))
      .map(([category]) => category)
  );
}

/** How far outside a small named area (BGC has only a few places) a plan may reach, from the area's centre. */
const NEARBY_AREA_KM = 5;
const NEARBY_KINDS = new Set(["Food", "Cafe", "Nightlife"]);

function centreOf(places: NormalizedPlace[]) {
  const mapped = places.filter((place) => place.latitude != null && place.longitude != null);
  if (mapped.length === 0) return null;
  return {
    latitude: mapped.reduce((sum, place) => sum + place.latitude!, 0) / mapped.length,
    longitude: mapped.reduce((sum, place) => sum + place.longitude!, 0) / mapped.length,
  };
}

/**
 * Places a plan may use for a named area: the area itself, plus places a short ride from its centre
 * when the area alone has too few. Never the far side of the metro.
 */
export function placesForArea(places: NormalizedPlace[], location: LocationIntent) {
  const mapped = places.filter((place) => place.latitude != null && place.longitude != null);
  if (!hasLocation(location)) return mapped;
  const inArea = mapped.filter((place) => matchesLocation(place, location));
  const centre = centreOf(inArea);
  if (inArea.length >= 10 || !centre) return inArea;
  // Neighbours only lend places to eat and drink; the sights stay in the area that was asked for.
  return mapped.filter(
    (place) => inArea.includes(place) || (NEARBY_KINDS.has(place.category) && (distanceKm(place, centre) ?? 99) <= NEARBY_AREA_KM)
  );
}

/** Fewer places than this in a named area and the plan borrows from the nearest neighbouring cities. */
const THIN_AREA_PLACES = 6;

/**
 * A named area with too few GalaTayo places (QC has three) widens to the nearest cities around it, a short
 * ride away (farther outside Metro Manila), so the plan isn't two stops and no meal. `added` lists the
 * borrowed cities so the plan can say so. An area with no places at all stays as it is.
 */
export function widenThinArea(places: NormalizedPlace[], location: LocationIntent, minimum = THIN_AREA_PLACES): { location: LocationIntent; added: string[] } {
  if (!hasLocation(location)) return { location, added: [] };
  const mapped = places.filter((place) => place.latitude != null && place.longitude != null);
  const inArea = mapped.filter((place) => matchesLocation(place, location));
  const centre = centreOf(inArea);
  if (inArea.length >= minimum || !centre) return { location, added: [] };
  const metro = inArea.some((place) => isMetroManilaDestination(resolveDestination(place.city, place.area)));
  const reach = metro ? 12 : 40;
  const nearestByCity = new Map<string, number>();
  for (const place of mapped) {
    const city = (place.city ?? "").toLowerCase();
    if (!city || matchesLocation(place, location)) continue;
    const km = distanceKm(centre, place) ?? Infinity;
    if (km <= reach && km < (nearestByCity.get(city) ?? Infinity)) nearestByCity.set(city, km);
  }
  const cities = new Set(location.cities);
  const added: string[] = [];
  let count = inArea.length;
  for (const [city] of [...nearestByCity.entries()].sort((a, b) => a[1] - b[1])) {
    if (count >= minimum) break;
    cities.add(city);
    added.push(city);
    count += mapped.filter((place) => (place.city ?? "").toLowerCase() === city).length;
  }
  return { location: { ...location, cities }, added };
}

// Occasions that decide which places a plan leads with. Kinds of place (beach, museum) are read by the category words.
const PLAN_VIBES = new Set<VibeId>(["date", "barkada", "family", "food", "coffee", "nightlife", "view", "sunset", "heritage"]);
const MIN_INDOOR = 3;
const PRICED_CATEGORIES = new Set(["Food", "Cafe", "Nightlife", "Activity", "Hotel", "Cinema"]);

/** Venues that close before the plan starts (museums at 4 PM for a date night) can't be in it. */
function isOpenDuring(place: NormalizedPlace, start: number | null) {
  const opening = CATEGORY_OPENING[place.category];
  if (start === null || !opening) return true;
  return opening.max - 30 >= start;
}

/**
 * Ranks places for a request. `locationSource` lets a chat follow-up ("may kainan malapit dun?")
 * reuse the area named earlier in the conversation. With constraints, places over the budget per head
 * or closed for the whole plan window are left out.
 */
export function selectCandidates(
  places: NormalizedPlace[],
  prompt: string,
  limit = MAX_CANDIDATES,
  locationSource: string | LocationIntent = prompt,
  constraints?: Pick<PlanConstraints, "budgetPerHead" | "start" | "indoor">,
) {
  const text = prompt.toLowerCase();
  const location = typeof locationSource === "string" ? detectLocationIntent(places, locationSource) : locationSource;
  const categories = detectCategories(text);
  const budget = constraints?.budgetPerHead ?? null;
  // The occasion ranks: a date night leads with date spots, a food trip with eateries and food streets.
  const vibes = parseQueryIntent(prompt, places).vibes.filter((vibe) => PLAN_VIBES.has(vibe));

  const fitting = placesForArea(places, location)
    // With a budget, a place we can't price passes only if it is a free-to-walk sight; an unpriced restaurant may be anything.
    .filter((place) => budget === null || (place.budget_min === null ? !PRICED_CATEGORIES.has(place.category) : place.budget_min <= budget))
    .filter((place) => isOpenDuring(place, constraints?.start ?? null));
  // Rain: places our data marks indoor; only an area with too few of those adds places of unknown cover.
  const indoor = fitting.filter((place) => isIndoorPlace(place) === true);
  const covered = !constraints?.indoor ? fitting : indoor.length >= MIN_INDOOR ? indoor : fitting.filter((place) => isIndoorPlace(place) !== false);
  return covered
    .map((place) => ({
      place,
      score:
        scorePlace(place, text, location, categories) +
        vibes.reduce((sum, vibe) => sum + vibeScore(place, vibe) * 2, 0) +
        (constraints?.indoor && isIndoorPlace(place) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.place);
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatClock12(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export function buildSystemPrompt(plan: { date: string; weekday: string; sunsetMinutes: number }, constraints?: PlanConstraints) {
  const rules = [
    constraints?.budgetPerHead != null ? `Budget: PHP ${constraints.budgetPerHead} per person for all stops together. The listed costs must add up to no more than that.` : null,
    constraints?.start != null ? `Start at ${formatClock(constraints.start)} or later.` : null,
    constraints?.end != null ? `Finish by ${formatClock(constraints.end)}.` : null,
    constraints?.meal ? `Include a ${constraints.meal} stop at a Food candidate.` : null,
    constraints?.indoor ? "It is a rainy day: every stop must be indoors." : null,
    constraints?.pinned ? `The user chose ${Array.from({ length: constraints.pinned }, (_, index) => `p${index + 1}`).join(", ")}: include every one of them.` : null,
  ].filter(Boolean);
  return `You plan one-day outings ("gala") in the Philippines for GalaTayo. When the request names no place, plan in Metro Manila.
The gala is on ${plan.weekday}, ${plan.date}. Sunset is about ${formatClock12(plan.sunsetMinutes)}.
Pick ${MIN_STOPS}-${MAX_STOPS} stops ONLY from CANDIDATES, by their ref (p1, p2...). Never invent places. Always return at least ${MIN_STOPS} stops: if nothing fits exactly, use the closest fitting candidates (a mall for a movie, a cafe for snacks).
Stay in the area the request names. Include every kind of stop the request asks for, in the order it asks ("cafe tapos dinner" = a Cafe first, then dinner at a Food place). A Cafe is never the lunch or dinner stop.
Use realistic 24h times in time-of-day order: breakfast 7:00-10:30, lunch 11:00-14:00, dinner 17:30-21:00, bars after 19:00, museums close about 16:00-17:00, parks and outdoor walks only in daylight, a sunset stop starts about 45 min before sunset. Durations: meals 60-120 min, cafes 45-90, parks and sights 30-90, museums and malls 60-150.
${rules.length ? `${rules.join("\n")}\n` : ""}Write the title, summary and notes in simple, enthusiastic English, like a lively, knowledgeable Filipino tour guide, even when the request is in Tagalog or Taglish (no Taglish words). The summary is one short line on the vibe of the day, with no times, counts, prices or place names. Notes are one friendly sentence on why the stop fits; never put prices, refs, "2x" or the place name in a note.
Reply with JSON only:
{"title": string (max 60 chars), "summary": string (max 120 chars), "group_size": integer (1 if not stated), "stops": [{"ref": "p1", "time": "HH:MM", "minutes": integer, "note": string (max 80 chars)}]}`;
}

export function buildUserMessage(prompt: string, candidates: NormalizedPlace[]) {
  const lines = candidates.map((place, index) =>
    [
      `p${index + 1}`,
      place.name,
      place.category,
      [place.area, place.city].filter(Boolean).join(", "),
      place.budget_min != null ? (place.budget_min === 0 ? "free" : `PHP ${place.budget_min}+`) : "",
      place.good_for.slice(0, 3).join("/"),
      (place.best_time_to_visit ?? "").slice(0, 40),
    ].join(" | ")
  );
  return `REQUEST: ${prompt}\n\nCANDIDATES (ref | name | category | area | cost per person | good for | best time):\n${lines.join("\n")}`;
}

/** "18:30", "6:30 PM", "6pm", "18.30" -> minutes after midnight, or null. */
export function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.[0];
  if (meridiem === "p" && hours < 12) hours += 12;
  if (meridiem === "a" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || (!meridiem && !match[2])) return null;
  return hours * 60 + minutes;
}

function parseMinutes(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").match(/\d+/)?.[0]);
  const hours = typeof value === "string" && /\bh(?:ou)?rs?\b/i.test(value) && number <= 6 ? number * 60 : number;
  return Math.min(240, Math.max(30, Math.round(hours || 60)));
}

function resolveStopPlace(entry: Record<string, unknown>, candidates: NormalizedPlace[]) {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const keys = [entry.ref, entry.place_id, entry.id, entry.place, entry.name].filter((value): value is string => typeof value === "string");
  for (const key of keys) {
    const trimmed = key.trim();
    const ref = trimmed.match(/^p?(\d{1,3})$/i);
    if (ref) {
      const place = candidates[Number(ref[1]) - 1];
      if (place) return place;
    }
    const place = byId.get(trimmed) ?? candidates.find((candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase());
    if (place) return place;
  }
  return null;
}



/** Tolerant parse of the model's plan; repairs damaged JSON and loose field names. Null when unusable. */
export function parseDraft(raw: string, candidates: NormalizedPlace[]): DraftResponse | null {
  const value = extractJsonObject(raw);
  if (!value) return null;

  const rawStops = [value.stops, value.itinerary, value.plan].find(Array.isArray) as unknown[] | undefined;
  const seen = new Set<string>();
  const stops = (rawStops ?? [])
    .map((stop): DraftStop | null => {
      if (!stop || typeof stop !== "object") return null;
      const entry = stop as Record<string, unknown>;
      const place = resolveStopPlace(entry, candidates);
      if (!place || seen.has(place.id)) return null;
      seen.add(place.id);
      const clock = parseClock(entry.time ?? entry.start);
      const note = cleanNote(typeof entry.note === "string" ? entry.note : "", place);
      return { place_id: place.id, time: clock === null ? "" : formatClock(clock), minutes: parseMinutes(entry.minutes ?? entry.duration), note };
    })
    .filter((stop): stop is DraftStop => stop !== null)
    .slice(0, MAX_STOPS);

  if (stops.length < MIN_STOPS) return null;

  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 80) : "Gala plan",
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 200) : "",
    group_size: Math.min(20, Math.max(1, Math.round(Number(value.group_size) || 1))),
    stops,
  };
}

const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/\b(sunday|linggo)\b/, 0],
  [/\b(monday|lunes)\b/, 1],
  [/\b(tuesday|martes)\b/, 2],
  [/\b(wednesday|miyerkules)\b/, 3],
  [/\b(thursday|huwebes)\b/, 4],
  [/\b(friday|biyernes)\b/, 5],
  [/\b(saturday|sabado)\b/, 6],
];

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

// Resolve day words in the prompt to a date so plans don't depend on the model's calendar math.
// Returns null when the prompt names no day.
export function resolvePromptDate(prompt: string, todayIso: string): string | null {
  const text = prompt.toLowerCase();
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch && isoMatch[1] >= todayIso) return isoMatch[1];
  if (/\b(today|ngayon|mamaya|tonight|mamayang gabi)\b/.test(text)) return todayIso;
  if (/\b(tomorrow|bukas)\b/.test(text)) return addDays(todayIso, 1);
  const match = WEEKDAY_WORDS.find(([pattern]) => pattern.test(text));
  if (match) {
    const today = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
    return addDays(todayIso, (match[1] - today + 7) % 7);
  }
  if (/\b(this weekend|weekend)\b/.test(text)) {
    const today = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
    return addDays(todayIso, today === 0 ? 0 : (6 - today + 7) % 7);
  }
  return null;
}

/** The plan's date: from the prompt, else the next Saturday (never today, so there is time to prepare). */
export function resolvePlanDate(prompt: string, todayIso: string): { date: string; source: "prompt" | "default" } {
  const fromPrompt = resolvePromptDate(prompt, todayIso);
  if (fromPrompt) return { date: fromPrompt, source: "prompt" };
  const today = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  return { date: addDays(todayIso, (6 - today + 7) % 7 || 7), source: "default" };
}

export function parseGroupSize(prompt: string): number | null {
  const text = prompt.toLowerCase();
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6 };
  const match = text.match(/\b(?:for|kami|tayo|group of|party of)\s+(\d{1,2}|two|three|four|five|six|seven|eight|dalawa|tatlo|apat|lima|anim)\b/) ?? text.match(/\b(\d{1,2}|dalawa|tatlo|apat|lima|anim)\s+(?:kami|tayo|people|pax|persons|katao)\b/);
  if (match) return Math.min(20, Math.max(1, Number(match[1]) || words[match[1]] || 1));
  if (/\b(date|couple|jowa|partner)\b/.test(text)) return 2;
  return null;
}

// ---------------------------------------------------------------------------
// Request constraints: budget, time window and meals, read from English or Taglish.
// ---------------------------------------------------------------------------

export type PlanConstraints = {
  budgetPerHead: number | null;
  /** Earliest start and latest end, in minutes after midnight. */
  start: number | null;
  end: number | null;
  meal: "lunch" | "dinner" | null;
  /** A rainy day or an indoor ask: no stop whose own data says it is outdoors. */
  indoor?: boolean;
  /** How many of the first candidates are places the user chose (saved places), which every plan keeps. */
  pinned?: number;
};

const INDOOR_ASK = /\b(rain|rainy|raining|umuulan|maulan|ulan|bagyo|storm|stormy|typhoon|indoors?|aircon|air-?conditioned)\b/i;

/** "Rainy Saturday in QC", "indoor spots only": the plan stays under a roof. */
export function wantsIndoor(prompt: string) {
  return INDOOR_ASK.test(prompt);
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?`;
const PER_HEAD = /\b(each|per\s*(?:head|person|pax)|\/\s*(?:head|pax|person)|a\s+head|kada\s+isa|bawat\s+isa|isa['’]?t\s+isa|tig)\b/;
const GROUP_TOTAL = /\b(total|for\s+(?:two|2|us|both|all|the\s+group|the\s+barkada)|para\s+sa\s+(?:dalawa|lahat|amin)|for\s+\d+\s+(?:people|pax)|lahat\s+lahat)\b/;

function toAmount(digits: string, thousands: string | undefined) {
  const value = Number(digits.replace(/,/g, ""));
  return Math.round(thousands ? value * 1000 : value);
}

/**
 * Budget per head in pesos. "₱800 each" and "tig-500" are per head; "₱2k for two" and
 * "₱3,000 total" are split by the group; a date's single budget is for the couple.
 */
export function parseBudgetPerHead(prompt: string, groupSize: number | null): number | null {
  const text = prompt.toLowerCase();
  const match =
    text.match(new RegExp(String.raw`(?:₱|php\s*|\bp(?=\d))\s*${AMOUNT}`)) ??
    text.match(new RegExp(String.raw`\b${AMOUNT}\s*(?:pesos?|php|piso)\b`)) ??
    text.match(new RegExp(String.raw`\b(?:budget|badyet|under|below|max|hanggang|tig-?)\s*(?:of|na|is|ay|ng)?\s*${AMOUNT}\b`)) ??
    // A bare amount is a budget when it says whose ("800 each", "3000 total") or hedges it ("around 800").
    text.match(new RegExp(String.raw`\b${AMOUNT}\s*(?=(?:each|per\s*(?:head|person|pax)|\/\s*(?:head|pax|person)|a\s+head|pp|total|all\s+in|kada\s+isa|bawat\s+isa)\b)`)) ??
    text.match(new RegExp(String.raw`\b(?:around|about|approx(?:imately)?|roughly|mga|~)\s*${AMOUNT}\b(?!\s*(?:am|pm|a\.m\.|p\.m\.|:|km|min|mins|minutes|hours?|hrs?|people|pax|kami|tayo|friends|persons))`));
  if (!match) return null;
  const amount = toAmount(match[1], match[2]);
  if (!Number.isFinite(amount) || amount < 50 || amount > 200000) return null;

  const around = text.slice(Math.max(0, (match.index ?? 0) - 12), (match.index ?? 0) + match[0].length + 24);
  if (PER_HEAD.test(around) || PER_HEAD.test(text)) return amount;
  const people = groupSize ?? 1;
  if (people > 1 && (GROUP_TOTAL.test(text) || (people === 2 && /\b(date|couple|jowa|partner)\b/.test(text)))) {
    return Math.round(amount / people);
  }
  return amount;
}

const DAY_PARTS: Array<[RegExp, number]> = [
  [/\b(umaga|morning|breakfast|almusal)\b/, 9 * 60],
  [/\b(tanghali|noon|lunch|tanghalian)\b/, 11 * 60 + 30],
  [/\b(hapon|afternoon|merienda)\b/, 14 * 60],
  [/\b(gabi|evening|night|tonight|dinner|hapunan)\b/, 17 * 60 + 30],
];

const END_PARTS: Array<[RegExp, number]> = [
  [/\b(tanghali|noon|lunch)\b/, 13 * 60],
  [/\b(hapon|afternoon)\b/, 17 * 60],
  [/\b(sunset|paglubog)\b/, 18 * 60],
  [/\bearly\s+(dinner|evening)\b/, 18 * 60 + 30],
  [/\b(gabi|evening|night|dinner)\b/, 21 * 60],
  [/\b(late|madaling\s+araw|midnight|hatinggabi)\b/, 23 * 60],
];

/** "2pm", "2 pm", "14:00", "alas-2 ng hapon", "alas 8 ng gabi" -> minutes; bare 1-6 read as PM. */
function readClock(hourText: string, minuteText: string | undefined, suffix: string | undefined) {
  let hours = Number(hourText);
  const minutes = Number(minuteText ?? 0);
  if (hours > 23 || minutes > 59) return null;
  const marker = (suffix ?? "").replace(/\s+/g, " ").trim();
  if (/^(pm|p\.m\.|ng hapon|ng gabi|n?g tanghali)$/.test(marker) && hours < 12) hours += marker.includes("tanghali") && hours >= 11 ? 0 : 12;
  else if (/^(am|a\.m\.)$/.test(marker) && hours === 12) hours = 0;
  else if (!marker && !minuteText && hours >= 1 && hours <= 6) hours += 12;
  return hours * 60 + minutes;
}

const CLOCK = String.raw`(?:alas[-\s]?)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.m\.|p\.m\.|am|pm|ng\s+umaga|ng\s+hapon|ng\s+gabi|n?g\s+tanghali)?`;
const END_WORDS = String.raw`(?:hanggang|until|till|to|up\s+to|-|–)`;

/** Start and end of the outing, when the request says ("simula 2pm hanggang gabi", "from 10am to 4pm"). */
export function parseTimeWindow(prompt: string): { start: number | null; end: number | null } {
  const text = prompt.toLowerCase().replace(/₱\s*[\d,.]+k?/g, " ");
  let start: number | null = null;
  let end: number | null = null;

  const range = text.match(new RegExp(String.raw`\b${CLOCK}\s*${END_WORDS}\s*${CLOCK}`));
  if (range && (range[3] || range[6])) {
    // "2-8pm": the end's am/pm carries over to a start that has none.
    start = readClock(range[1], range[2], range[3] ?? range[6]);
    end = readClock(range[4], range[5], range[6]);
  }

  const startMatch = text.match(new RegExp(String.raw`\b(?:simula|mula|from|start(?:ing)?(?:\s+at)?|starts?\s+at|after|by|sa)\s+${CLOCK}`));
  if (start === null && startMatch && (startMatch[3] || /simula|mula|from|start/.test(startMatch[0]))) {
    start = readClock(startMatch[1], startMatch[2], startMatch[3]);
  }
  if (start === null) {
    const bare = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (bare && !new RegExp(String.raw`${END_WORDS}\s*$`).test(text.slice(0, bare.index))) start = readClock(bare[1], bare[2], bare[3]);
  }

  const endClock = text.match(new RegExp(String.raw`\b(?:hanggang|until|till|up\s+to|end(?:ing)?\s+(?:at|by)|uwi\s+(?:ng|by)?)\s+${CLOCK}`));
  if (end === null && endClock && endClock[1]) end = readClock(endClock[1], endClock[2], endClock[3]);
  const endPart = text.match(/\b(?:hanggang|until|till|up to|ending at|end at)\s+([a-z\s]{3,20})/);
  if (end === null && endPart) end = END_PARTS.find(([pattern]) => pattern.test(endPart[1]))?.[1] ?? null;

  if (start === null) {
    // Day words that aren't the end of a range ("hanggang gabi") set the start.
    const withoutEnd = text.replace(/\b(?:hanggang|until|till|up to)\s+\S+(?:\s+\S+)?/g, " ");
    start = DAY_PARTS.find(([pattern]) => pattern.test(withoutEnd))?.[1] ?? null;
    // "Museum day then dinner": the day starts with the museum, not at dinner time.
    const daytimeAsk = requestedKinds(withoutEnd).some((kind) => kind === "museum" || kind === "cafe" || kind === "lunch" || kind === "breakfast");
    if (start === 17 * 60 + 30 && daytimeAsk) start = null;
  }
  if (start !== null && end !== null && end <= start) end = null;
  return { start, end };
}

/** A meal the plan must include: dinner for date nights and evening plans, lunch for lunch asks. */
export function requiredMeal(prompt: string, window: { start: number | null; end: number | null }): "lunch" | "dinner" | null {
  const text = prompt.toLowerCase();
  if (/\b(date night|dinner|hapunan|supper|night out)\b/.test(text)) return "dinner";
  if (/\b(lunch|tanghalian)\b/.test(text)) return "lunch";
  if (/\b(food ?trip|kain|kainan|eat|foodie)\b/.test(text)) return window.start !== null && window.start >= 15 * 60 ? "dinner" : "lunch";
  // A plan that runs through dinner time needs a dinner stop.
  if (window.end !== null && window.end >= 19 * 60 && (window.start ?? 0) <= 18 * 60) return "dinner";
  if (/\bdate\b/.test(text) && window.start !== null && window.start >= 16 * 60) return "dinner";
  return null;
}

export function parsePlanConstraints(prompt: string, groupSize: number | null): PlanConstraints {
  const window = parseTimeWindow(prompt);
  return { budgetPerHead: parseBudgetPerHead(prompt, groupSize), ...window, meal: requiredMeal(prompt, window), indoor: wantsIndoor(prompt) };
}

// ---------------------------------------------------------------------------
// Time sanity: the model's clock is a suggestion; these rules decide.
// ---------------------------------------------------------------------------

type StopKind = "breakfast" | "lunch" | "dinner" | "sunset" | "nightlife" | "general";

const WINDOWS: Record<StopKind, { min: number; max: number }> = {
  breakfast: { min: 7 * 60, max: 10 * 60 + 30 },
  lunch: { min: 11 * 60, max: 14 * 60 },
  dinner: { min: 17 * 60 + 30, max: 21 * 60 },
  sunset: { min: 0, max: 24 * 60 },
  nightlife: { min: 19 * 60, max: 23 * 60 },
  general: { min: 9 * 60, max: 21 * 60 },
};

const CATEGORY_OPENING: Record<string, { min: number; max: number }> = {
  Mall: { min: 10 * 60, max: 21 * 60 },
  Cinema: { min: 10 * 60 + 30, max: 21 * 60 + 30 },
  Museum: { min: 9 * 60, max: 16 * 60 },
  Heritage: { min: 8 * 60, max: 17 * 60 },
};

const NIGHT_VENUE = /\b(night market|night bazaar|night food market|light park|firefly)\b/i;

function stopKind(place: NormalizedPlace, note: string, clock: number | null, wantsSunset: boolean): StopKind {
  const text = `${note} ${place.name} ${place.tags.join(" ")} ${place.good_for.join(" ")} ${place.best_time_to_visit ?? ""}`.toLowerCase();
  // Night markets, light shows and firefly tours only happen after dark.
  if (place.category === "Nightlife" || NIGHT_VENUE.test(place.name)) return "nightlife";
  if (wantsSunset && SUNSET_WORDS.test(text) && place.category !== "Food") return "sunset";
  if (SUNSET_WORDS.test(note) && place.category !== "Food") return "sunset";
  if (place.category === "Food") {
    if (/\b(breakfast|almusal|brunch)\b/.test(note.toLowerCase())) return "breakfast";
    if (/\b(lunch|tanghalian)\b/.test(note.toLowerCase())) return "lunch";
    if (/\b(dinner|hapunan|supper)\b/.test(note.toLowerCase())) return "dinner";
    if (clock !== null) return clock >= 15 * 60 ? "dinner" : clock >= 10 * 60 + 30 ? "lunch" : "breakfast";
    return "lunch";
  }
  return "general";
}

type Point = { latitude: number | null; longitude: number | null };

function distanceKm(a: Point, b: Point) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Streets add about 30% to the straight-line distance; up to 1.5 km by road is a walk. */
const ROAD_FACTOR = 1.3;
const WALK_MAX_ROAD_KM = 1.5;

/** Minutes to get between two stops: walk when close, otherwise a city ride with traffic. */
export function travelMinutes(from: NormalizedPlace, to: NormalizedPlace) {
  const km = distanceKm(from, to);
  if (km === null) return 20;
  if (km * ROAD_FACTOR <= WALK_MAX_ROAD_KM) return Math.max(5, Math.ceil(((km * ROAD_FACTOR) / 4.5) * 60));
  return Math.min(120, Math.round(10 + km * 3));
}

/** How long a stop sensibly lasts: a lunch is never four hours, a museum never twenty minutes. */
const STAY_MINUTES: Record<string, { min: number; max: number }> = {
  Food: { min: 60, max: 120 },
  Cafe: { min: 45, max: 90 },
  Park: { min: 30, max: 90 },
  Heritage: { min: 30, max: 90 },
  Museum: { min: 60, max: 150 },
  Mall: { min: 60, max: 150 },
  Cinema: { min: 120, max: 180 },
  Nightlife: { min: 60, max: 150 },
  Activity: { min: 45, max: 180 },
  Hotel: { min: 60, max: 240 },
};

export function clampStay(place: NormalizedPlace, minutes: number) {
  // A food street (Binondo) is a crawl through several stalls, not a quick look.
  const range = isFoodStreet(place) ? { min: 90, max: 180 } : (STAY_MINUTES[place.category] ?? { min: 30, max: 120 });
  return Math.min(range.max, Math.max(range.min, minutes));
}

const NIGHT_TIME = /\b(evening|night|nights|after dark|blue hour|lights|sunset onward|late[- ]night)\b/i;

/** Places that work after dark: bars, night markets, and spots whose best time is the evening. */
export function isNightFriendly(place: NormalizedPlace) {
  return place.category === "Nightlife" || NIGHT_VENUE.test(place.name) || NIGHT_TIME.test(place.best_time_to_visit ?? "");
}

/** Parks and outdoor walks are daytime stops unless the place is known for its evenings. */
export function isDarkOutdoor(place: NormalizedPlace, start: number, sunsetMinutes: number) {
  return place.category === "Park" && start >= sunsetMinutes + 15 && !isNightFriendly(place);
}

const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5;

/**
 * Re-times stops so meals land in meal windows, the sunset stop meets the sunset,
 * venues are open, and each start allows for travel from the previous stop.
 */
type ScheduleOptions = {
  sunsetMinutes: number;
  wantsSunset: boolean;
  notBefore?: number;
  notAfter?: number;
  fixedStart?: boolean;
  dinnerFrom?: number;
  /** Place ids picked as a meal that aren't filed as restaurants (a food street for dinner). */
  meals?: Map<string, "breakfast" | "lunch" | "dinner">;
  /** The stop chosen to meet the sunset (see pickSunsetStop); others never take that slot. */
  sunsetPlaceId?: string;
};

/**
 * The stop that should meet the sunset on a date or sunset plan: a non-food stop whose own best time is the
 * sunset, preferring one that stays good after dark (a lookout with city lights) so it closes the day.
 */
export function pickSunsetStop(stops: DraftStop[], placesById: Map<string, NormalizedPlace>): string | undefined {
  const options = stops
    .map((stop) => placesById.get(stop.place_id))
    .filter((place): place is NormalizedPlace => Boolean(place && place.category !== "Food" && SUNSET_WORDS.test(`${place.best_time_to_visit ?? ""} ${place.tags.join(" ")}`)));
  return (options.find(isNightFriendly) ?? options[0])?.id;
}

/** An opening time the place's own best-time text states: "Right at 9 PM opening", "opens at 5 PM". */
export function statedOpening(place: NormalizedPlace): number | null {
  const text = place.best_time_to_visit ?? "";
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+opening\b/i) ?? text.match(/\bopens?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  return match ? readClock(match[1], match[2], match[3].toLowerCase()) : null;
}

/** Times the stops, then leaves out parks that would land after dark and times the rest again. */
export function scheduleStops(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, options: ScheduleOptions): DraftStop[] {
  // The chosen sunset stop is the point of a date night: when the stops before it run past sunset, the last
  // daytime stop before it gives way, not the sunset.
  for (let guard = 0; options.sunsetPlaceId && guard < MAX_STOPS; guard++) {
    if (timeStops(stops, placesById, options).some((stop) => stop.place_id === options.sunsetPlaceId)) break;
    const index = stops.findIndex((stop) => stop.place_id === options.sunsetPlaceId);
    const before = stops.slice(0, Math.max(0, index)).map((stop, at) => ({ stop, at })).filter(({ stop }) => !options.meals?.has(stop.place_id)).pop();
    if (!before) break;
    stops = stops.filter((_, at) => at !== before.at);
  }
  const timed = timeStops(stops, placesById, options);
  const dark = new Set(
    timed.filter((stop) => isDarkOutdoor(placesById.get(stop.place_id)!, parseClock(stop.time) ?? 0, options.sunsetMinutes)).map((stop) => stop.place_id)
  );
  if (dark.size === 0 || timed.length - dark.size < MIN_STOPS) return timed;
  return timeStops(
    stops.filter((stop) => !dark.has(stop.place_id)),
    placesById,
    options
  );
}

function timeStops(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, options: ScheduleOptions): DraftStop[] {
  const items = stops
    .filter((stop) => placesById.has(stop.place_id))
    .map((stop) => {
      const place = placesById.get(stop.place_id)!;
      return { stop: { ...stop, minutes: clampStay(place, stop.minutes) }, place, clock: parseClock(stop.time) };
    });

  // Only one sunset stop makes sense; when sunset was asked for and no stop says so, the last outdoor stop takes it.
  const classify = () => {
    const kinds = items.map((item) => options.meals?.get(item.place.id) ?? stopKind(item.place, item.stop.note, item.clock, options.wantsSunset));
    if (options.sunsetPlaceId && items.some((item) => item.place.id === options.sunsetPlaceId)) {
      return kinds.map((kind, index) => (items[index].place.id === options.sunsetPlaceId ? "sunset" : kind === "sunset" ? "general" : kind));
    }
    const result = kinds.map((kind, index) => (kind === "sunset" && kinds.indexOf("sunset") !== index ? "general" : kind));
    if (options.wantsSunset && !result.includes("sunset")) {
      const categories = items.map((item) => item.place.category);
      const outdoor = categories.lastIndexOf("Park") > -1 ? categories.lastIndexOf("Park") : categories.lastIndexOf("Heritage");
      if (outdoor > -1) result[outdoor] = "sunset";
    }
    return result;
  };

  // Sunset comes before dinner; bars close out the day.
  let kinds = classify();
  const sunsetIndex = kinds.indexOf("sunset");
  const firstDinner = kinds.indexOf("dinner");
  if (sunsetIndex > -1 && firstDinner > -1 && sunsetIndex > firstDinner) {
    const [moved] = items.splice(sunsetIndex, 1);
    items.splice(firstDinner, 0, moved);
  }
  kinds = classify();
  for (let index = items.length - 2; index >= 0; index--) {
    if (kinds[index] === "nightlife" && kinds.slice(index + 1).some((kind) => kind !== "nightlife")) {
      const [moved] = items.splice(index, 1);
      items.push(moved);
    }
  }
  kinds = classify();

  const windowFor = (index: number) => {
    const kind = kinds[index];
    if (kind === "sunset") {
      const target = options.sunsetMinutes - 45;
      return { min: target, max: target + 20 };
    }
    const place = items[index].place;
    // "Hanggang gabi": dinner waits so the evening isn't over by 7 PM. A stated opening ("9 PM opening") wins.
    const floor = Math.max(kind === "dinner" ? (options.dinnerFrom ?? 0) : 0, statedOpening(place) ?? 0);
    const base = { min: Math.max(WINDOWS[kind].min, floor), max: Math.max(WINDOWS[kind].max, floor + 60) };
    // Landmarks known for their evenings (a lit-up bridge, a plaza) have no closing time.
    const opening = kind === "general" && !isNightFriendly(place) ? CATEGORY_OPENING[place.category] : undefined;
    return opening ? { min: Math.max(base.min, opening.min), max: Math.min(base.max, opening.max) } : base;
  };

  const starts: number[] = [];
  items.forEach((item, index) => {
    const window = windowFor(index);
    let start: number;
    if (index === 0) {
      // With an asked start ("alis 7am", "simula 2pm") and no clock from the model, the day starts then.
      start = Math.max(options.fixedStart && options.notBefore ? options.notBefore : (item.clock ?? 10 * 60), window.min, options.notBefore ?? 0);
      if (kinds[0] !== "sunset") start = Math.min(start, Math.max(window.max, window.min));
      // The asked start time wins over a meal window ("simula 2pm" never starts at 10:30).
      start = Math.max(start, options.notBefore ?? 0);
    } else {
      const previous = items[index - 1];
      start = Math.max(starts[index - 1] + previous.stop.minutes + travelMinutes(previous.place, item.place), window.min);
    }
    starts.push(start);
  });

  // Close idle gaps a window forced: start earlier stops later (if they stay open) or linger longer.
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1];
    const ready = starts[index - 1] + previous.stop.minutes + travelMinutes(previous.place, items[index].place);
    let gap = starts[index] - ready;
    if (gap <= 30) continue;
    // An asked start time ("alis 8am") stays put; the stop before the gap lingers instead.
    const shiftRoom = options.fixedStart ? 0 : Math.min(...items.slice(0, index).map((_, j) => windowFor(j).max - starts[j]));
    const shift = Math.max(0, Math.min(gap - 15, shiftRoom));
    for (let j = 0; j < index; j++) starts[j] += shift;
    gap -= shift;
    // Linger a little, never into a three-hour meal: the rest stays free time.
    if (gap > 30) previous.stop.minutes = clampStay(previous.place, previous.stop.minutes + Math.min(30, gap - 15));
  }

  return items
    .map((item, index) => ({
      ...item.stop,
      time: formatClock(roundTo5(starts[index])),
      // No lingering past the asked end ("from 10am to 4pm").
      minutes: options.notAfter === undefined ? item.stop.minutes : Math.max(30, Math.min(item.stop.minutes, options.notAfter - roundTo5(starts[index]))),
    }))
    // Drop trailing stops that would start after the venue closes, after the asked end, or too late at night (always keep two).
    .filter(
      (stop, index) =>
        index < MIN_STOPS ||
        (starts[index] < 23 * 60 + 30 && starts[index] <= windowFor(index).max + 30 && (options.notAfter === undefined || starts[index] < options.notAfter))
    );
}

// ---------------------------------------------------------------------------
// Fallback: a plain plan from GalaTayo places when the model is unavailable.
// ---------------------------------------------------------------------------

const DEFAULT_MINUTES: Record<string, number> = {
  Food: 75,
  Cafe: 60,
  Museum: 90,
  Heritage: 60,
  Park: 60,
  Mall: 120,
  Cinema: 150,
  Nightlife: 120,
  Activity: 120,
  Hotel: 120,
};

const FALLBACK_ORDER = ["Museum", "Heritage", "Activity", "Mall", "Cinema", "Cafe", "Park", "Food", "Nightlife"];

function firstSentence(text: string | null) {
  const sentence = (text ?? "").split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  // Cut long sentences at a word, not mid-word.
  return sentence.length > 90 ? `${sentence.slice(0, 88).replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}...` : sentence;
}

/** A plain note from the place's own data, for stops whose model note was empty or unusable. */
export function describeStop(place: NormalizedPlace) {
  const sentence = firstSentence(place.description);
  if (sentence) return sentence;
  const goodFor = place.good_for.slice(0, 2).join(" and ").toLowerCase();
  if (goodFor) return `Good for ${goodFor}.`;
  return `${place.category} stop in ${place.area || place.city || "the area"}.`;
}

/**
 * Turns the model's note into something a person would write: no prices ("2xPHP450"), refs ("p3"),
 * or a bare repeat of the place name. Falls back to the place's own description.
 */
export function cleanNote(raw: string, place: NormalizedPlace) {
  const name = place.name.toLowerCase();
  let note = raw
    .replace(/\s+/g, " ")
    .replace(/\b\d+\s*[x×]\s*(?:php|₱|p)?\s*\d[\d,]*(?:\.\d+)?\+?/gi, " ")
    .replace(/(?:php|₱)\s*\d[\d,]*(?:\.\d+)?\s*k?\+?(?:\s*(?:each|per\s*(?:head|person|pax)|\/\s*(?:head|pax)|pp))?/gi, " ")
    .replace(/\b\d[\d,]*\s*(?:php|pesos?)\b/gi, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\bp\d{1,3}\b/gi, " ")
    .trim();
  if (note.toLowerCase().startsWith(name)) note = note.slice(name.length).replace(/^\s*[,:;\-–—|]\s*/, "");
  note = note
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[,;:.!?]|$)/g, "")
    .replace(/^[\s,.;:\-–—|]+|[\s,;:\-–—|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = note.match(/[a-zñ]{2,}/gi) ?? [];
  if (words.length < 3 || note.toLowerCase() === name) return describeStop(place);
  // Only an eatery is the meal: a cafe or park note that calls itself "dinner" would mislead ("bago dinner" is fine).
  if (place.category !== "Food" && /(?<!\b(?:bago|before|after|pagkatapos|then|tapos)[\s-]+)\b(dinner|hapunan|supper|lunch|tanghalian|dining|dine)\b/i.test(note)) {
    return describeStop(place);
  }
  // A note that sells a bar, market or restaurant as a cafe ("quiet spot for study and coffee") describes a different place.
  const servesCoffee = place.category === "Cafe" || /\b(caf[eé]|coffee)(?![a-z])/i.test(`${place.name} ${place.tags.join(" ")}`);
  if (!servesCoffee && /\b(caf[eé]s?|coffee|kape|sip|latte)(?![a-z])/i.test(note)) return describeStop(place);
  note = note.charAt(0).toUpperCase() + note.slice(1);
  return note.length > 120 ? `${note.slice(0, 117).trimEnd()}...` : note;
}

/** False when the place's best time rules the meal out (a breakfast-and-lunch eatery for dinner). */
export function servesMeal(place: NormalizedPlace, meal: "lunch" | "dinner") {
  const best = (place.best_time_to_visit ?? "").toLowerCase();
  if (!best) return true;
  if (meal === "dinner") return /\b(dinner|evening|night|sunset|anytime|any time)\b/.test(best) || !/\b(breakfast|morning|lunch|afternoon|brunch)\b/.test(best);
  return /\b(lunch|noon|afternoon|midday|day|anytime|any time)\b/.test(best) || !/\b(dinner|evening|night|breakfast)\b/.test(best);
}

// ---------------------------------------------------------------------------
// Intent: the kinds of stops the request names ("tahimik na cafe tapos dinner") must all be there.
// ---------------------------------------------------------------------------

export type RequestedKind = "breakfast" | "cafe" | "museum" | "lunch" | "dinner" | "nightlife";

const REQUEST_WORDS: Array<[RequestedKind, RegExp]> = [
  ["breakfast", /\b(breakfast|almusal|brunch)\b/],
  ["cafe", /\b(cafes?|coffee|kape|kapihan)\b/],
  ["museum", /\b(museums?|museo)\b/],
  ["lunch", /\b(lunch|tanghalian)\b/],
  ["dinner", /\b(dinner|hapunan|supper|date night)\b/],
  ["nightlife", /\b(bars?|inuman|cocktails?|drinks)\b/],
];

/** The kinds of stops a request asks for, in the order it names them, plus the meal the plan needs. */
export function requestedKinds(prompt: string, meal: "lunch" | "dinner" | null = null): RequestedKind[] {
  const text = prompt.toLowerCase();
  const found = REQUEST_WORDS.map(([kind, pattern]) => ({ kind, at: text.search(pattern) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.kind);
  if (meal && !found.includes(meal)) found.push(meal);
  return found;
}

/** True when the place can be the stop the request asked for. A cafe is never the meal. */
export function fitsKind(place: NormalizedPlace, kind: RequestedKind) {
  switch (kind) {
    case "cafe":
      // "Café by the Ruins" is filed as a restaurant but is a café all the same.
      return place.category === "Cafe" || (place.category === "Food" && /\b(caf[eé]|coffee)(?![a-z])/i.test(place.name));
    case "museum":
      return place.category === "Museum";
    case "nightlife":
      return place.category === "Nightlife";
    case "breakfast":
      return place.category === "Food" && /\b(breakfast|morning|brunch|anytime|any time)\b/i.test(place.best_time_to_visit ?? "breakfast");
    case "lunch":
    case "dinner":
      // A pasalubong shop sells food but is not a sit-down meal. A food street (Binondo, Cubao Expo) is a meal.
      return (
        (place.category === "Food" || isFoodStreet(place)) &&
        servesMeal(place, kind) &&
        !/\bbreakfast\b/i.test(place.name) &&
        !(place.tags.includes("pasalubong") && !place.tags.includes("restaurant"))
      );
  }
}

const KIND_LABEL: Record<RequestedKind, string> = {
  breakfast: "breakfast place",
  cafe: "cafe",
  museum: "museum",
  lunch: "lunch spot",
  dinner: "dinner restaurant",
  nightlife: "bar",
};

const KIND_TIME: Partial<Record<RequestedKind, string>> = { breakfast: "08:00", lunch: "12:00", dinner: "19:00", nightlife: "20:30" };

/**
 * Adds every requested kind of stop the plan is missing, from the candidates that fit the remaining
 * budget: in the asked area first, then closest to the plan. Kinds no candidate fits are returned as
 * `missing` so the plan can say so instead of pretending.
 */
export function ensureRequested(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  kinds: RequestedKind[],
  { budgetPerHead = null, location, taken = new Set<string>() }: { budgetPerHead?: number | null; location?: LocationIntent; taken?: Set<string> } = {}
): { stops: DraftStop[]; missing: RequestedKind[]; overBudget: Set<RequestedKind>; picks: Map<RequestedKind, string> } {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  let kept = stops.filter((stop) => byId.has(stop.place_id));
  const missing: RequestedKind[] = [];
  const overBudget = new Set<RequestedKind>();
  const picks = new Map<RequestedKind, string>();

  for (const kind of kinds) {
    // A stop already doing another job (Binondo as lunch) can't also be the dinner.
    const already = kept.find((stop) => !taken.has(stop.place_id) && ![...picks.values()].includes(stop.place_id) && fitsKind(byId.get(stop.place_id)!, kind));
    if (already) {
      picks.set(kind, already.place_id);
      continue;
    }
    // Only the asked-for stops count against the budget here; fitBudget trims the rest later.
    const asked = new Set(picks.values());
    const spent = kept.filter((stop) => asked.has(stop.place_id)).reduce((sum, stop) => sum + (byId.get(stop.place_id)?.budget_min ?? 0), 0);
    const left = budgetPerHead === null ? Infinity : budgetPerHead - spent;
    const anchor = byId.get(kept.at(-1)?.place_id ?? "");
    const used = new Set(kept.map((stop) => stop.place_id));
    const inArea = (place: NormalizedPlace) => (location && hasLocation(location) ? matchesLocation(place, location) : true);
    const pick = candidates
      .filter((place) => fitsKind(place, kind) && !used.has(place.id) && (place.budget_min ?? 0) <= left)
      .sort(
        (a, b) =>
          Number(inArea(b)) - Number(inArea(a)) ||
          Number(a.budget_min === null) - Number(b.budget_min === null) ||
          (anchor ? (distanceKm(anchor, a) ?? 99) - (distanceKm(anchor, b) ?? 99) : 0)
      )[0];
    if (!pick) {
      missing.push(kind);
      if (candidates.some((place) => fitsKind(place, kind) && !used.has(place.id) && inArea(place))) overBudget.add(kind);
      continue;
    }
    // A full plan gives up its last stop that no request asked for.
    if (kept.length >= MAX_STOPS) {
      const dropIndex = kept.map((stop) => asked.has(stop.place_id)).lastIndexOf(false);
      if (dropIndex === -1) {
        missing.push(kind);
        continue;
      }
      kept = kept.filter((_, index) => index !== dropIndex);
    }
    kept = [...kept, { place_id: pick.id, time: KIND_TIME[kind] ?? "", minutes: DEFAULT_MINUTES[pick.category] ?? 60, note: describeStop(pick) }];
    picks.set(kind, pick.id);
  }
  return { stops: kept, missing, overBudget, picks };
}

/** Makes sure a plan that needs a meal has a real one (a Food place that serves it), never a cafe. */
export function ensureMeal(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  meal: "lunch" | "dinner" | null,
  budgetPerHead: number | null = null,
): DraftStop[] {
  if (!meal) return stops;
  const byId = new Map(candidates.map((place) => [place.id, place]));
  if (stops.some((stop) => byId.has(stop.place_id) && fitsKind(byId.get(stop.place_id)!, meal))) return stops;
  return ensureRequested(stops, candidates, [meal], { budgetPerHead }).stops;
}

/** Evening plans leave out eateries that only open for breakfast or lunch (a morning market at 7 PM). */
export function dropOffHoursFood(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, evening: boolean) {
  return stops.filter((stop) => {
    const place = placesById.get(stop.place_id);
    if (!place || place.category !== "Food") return true;
    if (evening) return servesMeal(place, "dinner");
    // A day plan keeps an eatery only for a meal it serves at the time it was given (no lunch spot at 6 PM).
    const clock = parseClock(stop.time);
    if (clock === null || clock < 10 * 60 + 30) return true;
    return servesMeal(place, clock >= 16 * 60 ? "dinner" : "lunch");
  });
}

const TIME_RANK = { breakfast: 0, day: 1, dinner: 3, night: 4 } as const;

/**
 * Puts stops in time-of-day order: breakfast first, dinner after the daytime stops, bars last.
 * Daytime stops keep the order asked for but go nearest-next, so the route doesn't zigzag.
 */
export function orderByTimeOfDay(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, picks: Map<RequestedKind, string> = new Map(), sunsetPlaceId?: string) {
  const rank = (stop: DraftStop) => {
    const place = placesById.get(stop.place_id);
    if (!place) return TIME_RANK.day;
    if (picks.get("breakfast") === place.id) return TIME_RANK.breakfast;
    if (place.category === "Nightlife") return TIME_RANK.night;
    if (picks.get("dinner") === place.id) return TIME_RANK.dinner;
    // The sunset stop closes the daytime part of the plan.
    if (place.id === sunsetPlaceId || (!sunsetPlaceId && place.category !== "Food" && SUNSET_WORDS.test(stop.note))) return TIME_RANK.dinner - 0.5;
    // After dinner, only places that work at night stay late.
    if (picks.has("dinner") && isNightFriendly(place) && stops.indexOf(stop) > stops.findIndex((other) => other.place_id === picks.get("dinner"))) return TIME_RANK.dinner + 0.5;
    return TIME_RANK.day;
  };
  const sorted = stops.map((stop, index) => ({ stop, index, rank: rank(stop) })).sort((a, b) => a.rank - b.rank || a.index - b.index);

  const result: DraftStop[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (end < sorted.length && sorted[end].rank === sorted[start].rank) end++;
    const group = sorted.slice(start, end).map((entry) => entry.stop);
    if (sorted[start].rank === TIME_RANK.day && group.length > 2) {
      // The first daytime stop stays (often the asked cafe or sight); the rest go nearest-next.
      const route = [group.shift()!];
      while (group.length) {
        const from = placesById.get(route.at(-1)!.place_id)!;
        group.sort((a, b) => (distanceKm(from, placesById.get(a.place_id)!) ?? 99) - (distanceKm(from, placesById.get(b.place_id)!) ?? 99));
        route.push(group.shift()!);
      }
      result.push(...route);
    } else {
      result.push(...group);
    }
    start = end;
  }

  // Lunch lands at midday: after the stops timed before noon, or after the first half of the day's stops.
  const lunchIndex = picks.has("lunch") ? result.findIndex((stop) => stop.place_id === picks.get("lunch")) : -1;
  if (lunchIndex > -1) {
    const [lunch] = result.splice(lunchIndex, 1);
    const daytime = result.filter((stop) => rank(stop) <= TIME_RANK.day);
    const allTimed = daytime.length > 0 && daytime.every((stop) => parseClock(stop.time) !== null);
    const before = allTimed ? daytime.filter((stop) => parseClock(stop.time)! < 12 * 60).at(-1) : daytime[Math.ceil(daytime.length / 2) - 1];
    result.splice(before ? result.indexOf(before) + 1 : 0, 0, lunch);
  }

  // No two meals in a row: a daytime sight from later in the day goes between them.
  const isFood = (stop: DraftStop) => placesById.get(stop.place_id)?.category === "Food";
  for (let index = 0; index < result.length - 1; index++) {
    if (!isFood(result[index]) || !isFood(result[index + 1])) continue;
    const spacer = result.findIndex((stop, other) => other > index + 1 && !isFood(stop) && rank(stop) === TIME_RANK.day);
    if (spacer === -1) continue;
    const [moved] = result.splice(spacer, 1);
    result.splice(index + 1, 0, moved);
  }
  return result;
}

/** Whether a place can be visited starting at `start`: open then, and not a park in the dark. */
function canVisitAt(place: NormalizedPlace, start: number, sunsetMinutes: number) {
  if (start >= sunsetMinutes) return isNightFriendly(place);
  const opening = CATEGORY_OPENING[place.category];
  return isNightFriendly(place) || !opening || opening.max - 30 >= start;
}

type FillOptions = { end: number | null; sunsetMinutes: number; budgetPerHead?: number | null; location?: LocationIntent; maxKm?: number };

/**
 * Fills idle time in a timed plan: long gaps between stops (a morning breakfast, then nothing until
 * a sunset ride) and, when the plan should run to an end ("hanggang gabi", a whole day trip), the
 * time after the last stop. Each gap gets the nearest place open at that hour (after dark, only
 * places that work at night: a bar, a lit-up bridge, a night market).
 */
export function fillGaps(stops: DraftStop[], candidates: NormalizedPlace[], { end, sunsetMinutes, budgetPerHead = null, location, maxKm = 3 }: FillOptions): DraftStop[] {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const result = [...stops];
  for (let index = 0; index < result.length && result.length < MAX_STOPS; index++) {
    const current = result[index];
    const from = byId.get(current.place_id);
    if (!from) continue;
    const free = (parseClock(current.time) ?? 0) + current.minutes;
    const next = result[index + 1];
    const nextPlace = next ? byId.get(next.place_id) : undefined;
    const until = next ? (parseClock(next.time) ?? free) : end;
    if (until === null || until - free < (next ? 90 : 75)) continue;
    const spent = result.reduce((sum, stop) => sum + (byId.get(stop.place_id)?.budget_min ?? 0), 0);
    const left = budgetPerHead === null ? Infinity : budgetPerHead - spent;
    const used = new Set(result.map((stop) => stop.place_id));
    const pick = candidates
      .filter(
        (place) =>
          !used.has(place.id) &&
          place.category !== "Food" &&
          (place.budget_min ?? 0) <= left &&
          (distanceKm(from, place) ?? 99) <= maxKm &&
          canVisitAt(place, free + travelMinutes(from, place), sunsetMinutes) &&
          (!location || !hasLocation(location) || matchesLocation(place, location))
      )
      .sort((a, b) => (distanceKm(from, a) ?? 99) - (distanceKm(from, b) ?? 99))[0];
    if (!pick) continue;
    const arrive = free + travelMinutes(from, pick);
    const room = until - arrive - (nextPlace ? travelMinutes(pick, nextPlace) : 0);
    if (room < 30) continue;
    // The caller re-times the plan; this estimate tells the next pass where the day stands.
    result.splice(index + 1, 0, { place_id: pick.id, time: formatClock(arrive), minutes: clampStay(pick, Math.min(DEFAULT_MINUTES[pick.category] ?? 60, room)), note: describeStop(pick) });
  }
  return result;
}

/** A plan for a named area ("date sa BGC") starts there when any place in the area is open at that hour. */
export function ensureAreaStop(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  location: LocationIntent,
  { start, sunsetMinutes, keep = new Set() }: { start: number; sunsetMinutes: number; keep?: Set<string> }
): DraftStop[] {
  if (!hasLocation(location)) return stops;
  const byId = new Map(candidates.map((place) => [place.id, place]));
  if (stops.some((stop) => byId.has(stop.place_id) && matchesLocation(byId.get(stop.place_id)!, location))) return stops;
  const used = new Set(stops.map((stop) => stop.place_id));
  const pick = candidates.find((place) => !used.has(place.id) && place.category !== "Food" && matchesLocation(place, location) && canVisitAt(place, start, sunsetMinutes));
  if (!pick) return stops;
  let kept = stops;
  if (kept.length >= MAX_STOPS) {
    const dropIndex = kept.map((stop) => keep.has(stop.place_id)).lastIndexOf(false);
    if (dropIndex === -1) return stops;
    kept = kept.filter((_, index) => index !== dropIndex);
  }
  return [{ place_id: pick.id, time: "", minutes: DEFAULT_MINUTES[pick.category] ?? 60, note: describeStop(pick) }, ...kept];
}

/** How far a city plan's stops may sit from its asked-for stops: a short ride, not across Quezon City. */
const ROUTE_KM = 6;

/**
 * Leaves out stops nobody asked for that sit far from the ones they did ask for (a Fairview park on
 * a Diliman dinner date). Provincial day trips spread wider, so the caller passes a bigger reach.
 */
export function tightenRoute(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, keep: Set<string>, maxKm = ROUTE_KM): DraftStop[] {
  const anchors = stops.filter((stop) => keep.has(stop.place_id)).map((stop) => placesById.get(stop.place_id)).filter((place): place is NormalizedPlace => Boolean(place));
  const centre = centreOf(anchors);
  if (!centre) return stops;
  return stops.filter((stop) => {
    const place = placesById.get(stop.place_id);
    return !place || keep.has(stop.place_id) || (distanceKm(centre, place) ?? 0) <= maxKm;
  });
}

/** Tops a thin plan up (to two stops, or `min`) with the best-ranked place that is open when the plan runs. */
export function topUpStops(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  { start, sunsetMinutes, location, min = MIN_STOPS }: { start: number; sunsetMinutes: number; location?: LocationIntent; min?: number }
): DraftStop[] {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  let result = [...stops];
  const hasFood = () => result.some((stop) => byId.get(stop.place_id)?.category === "Food");
  while (result.length < Math.min(min, MAX_STOPS)) {
    const used = new Set(result.map((stop) => stop.place_id));
    const open = candidates.filter(
      (place) =>
        !used.has(place.id) &&
        !(hasFood() && place.category === "Food") &&
        canVisitAt(place, start, sunsetMinutes) &&
        (!location || !hasLocation(location) || matchesLocation(place, location))
    );
    // Near the stops already in the plan: the best-ranked place within a short ride, else the nearest.
    const centre = centreOf(result.map((stop) => byId.get(stop.place_id)).filter((place): place is NormalizedPlace => Boolean(place)));
    const near = (place: NormalizedPlace) => (centre ? (distanceKm(centre, place) ?? 99) : 0);
    const pick = open.find((place) => near(place) <= ROUTE_KM) ?? [...open].sort((a, b) => near(a) - near(b))[0];
    if (!pick) break;
    // Added after the asked-for stops, so the plan still opens where the request said.
    result = [...result, { place_id: pick.id, time: "", minutes: DEFAULT_MINUTES[pick.category] ?? 60, note: describeStop(pick) }];
  }
  return result;
}

const fold = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Leaves out a whole-area stop when the plan already visits places inside it: Intramuros after Fort Santiago
 * and Manila Cathedral (whose area is "Intramuros") is the same walk twice. Kept stops are never dropped.
 */
export function dropParentAreas(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, keep: Set<string> = new Set()): DraftStop[] {
  const isParent = (stop: DraftStop) => {
    const parent = placesById.get(stop.place_id);
    if (!parent || keep.has(stop.place_id)) return false;
    const name = ` ${fold(parent.name)} `;
    return stops.some((other) => {
      const child = placesById.get(other.place_id);
      return child && child !== parent && name.trim().length >= 4 && ` ${fold(child.area ?? "")} `.includes(name);
    });
  };
  const kept = stops.filter((stop) => !isParent(stop));
  return kept.length >= MIN_STOPS ? kept : stops;
}

/**
 * A food trip is about the food: sights nobody asked for stay a side dish (three at most, the closest to the
 * meals), so a Binondo food crawl isn't four heritage walks in Intramuros.
 */
export function capSightsForFoodTrip(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, keep: Set<string>, maxSights = 3): DraftStop[] {
  const isFood = (place: NormalizedPlace) => place.category === "Food" || place.category === "Cafe" || isFoodStreet(place);
  const meals = stops.map((stop) => placesById.get(stop.place_id)).filter((place): place is NormalizedPlace => Boolean(place && isFood(place)));
  const centre = centreOf(meals);
  const sights = stops.filter((stop) => {
    const place = placesById.get(stop.place_id);
    return place && !isFood(place) && !keep.has(stop.place_id);
  });
  if (sights.length <= maxSights || !centre) return stops;
  const closest = new Set(
    [...sights].sort((a, b) => (distanceKm(centre, placesById.get(a.place_id)!) ?? 99) - (distanceKm(centre, placesById.get(b.place_id)!) ?? 99)).slice(0, maxSights)
  );
  return stops.filter((stop) => !sights.includes(stop) || closest.has(stop));
}

/** A short name for the asked area: "BGC" for the alias, else the city. */
export function areaLabel(location: LocationIntent) {
  const alias = [...(location.areaWords ?? [])][0];
  if (alias) return alias.length <= 4 ? alias.toUpperCase() : alias.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  const city = [...location.cities][0];
  if (city) return city.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return [...(location.provinces ?? [])][0] ?? null;
}

/**
 * Swaps stops outside the asked area for an in-area place that does the same job (same category,
 * same meal, fits the budget). Asked-for stops with no in-area match move to the place nearest the
 * area and are listed so the plan can say why; other outside stops are left out.
 */
export function preferInArea(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  location: LocationIntent,
  picks: Map<RequestedKind, string>,
  budgetPerHead: number | null = null
): { stops: DraftStop[]; outside: NormalizedPlace[] } {
  if (!hasLocation(location)) return { stops, outside: [] };
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const result = [...stops];
  const outside: NormalizedPlace[] = [];
  const dropped = new Set<number>();
  result.forEach((stop, index) => {
    const place = byId.get(stop.place_id);
    if (!place || matchesLocation(place, location)) return;
    const kind = [...picks.entries()].find(([, id]) => id === place.id)?.[0];
    const spent = result.reduce((sum, other) => sum + (other === stop ? 0 : (byId.get(other.place_id)?.budget_min ?? 0)), 0);
    const left = budgetPerHead === null ? Infinity : budgetPerHead - spent;
    const used = new Set(result.map((other) => other.place_id));
    const doesTheJob = (other: NormalizedPlace) =>
      !used.has(other.id) && other.category === place.category && (!kind || fitsKind(other, kind)) && (other.budget_min ?? 0) <= left;
    const swap = candidates.find((other) => doesTheJob(other) && matchesLocation(other, location));
    if (swap) {
      result[index] = { ...stop, place_id: swap.id, note: describeStop(swap) };
      if (kind) picks.set(kind, swap.id);
      return;
    }
    // A stop nobody asked for that only exists outside the area is left out.
    if (!kind) {
      dropped.add(index);
      return;
    }
    // Nothing in the area does the job: the place closest to the area's own stops does.
    const centre = centreOf(result.map((other) => byId.get(other.place_id)).filter((other): other is NormalizedPlace => Boolean(other && matchesLocation(other, location))));
    const nearest = centre
      ? candidates.filter(doesTheJob).sort((a, b) => (distanceKm(centre, a) ?? 99) - (distanceKm(centre, b) ?? 99))[0]
      : undefined;
    const chosen = nearest && centre && (distanceKm(centre, nearest) ?? 99) < (distanceKm(centre, place) ?? 99) ? nearest : place;
    if (chosen !== place) {
      result[index] = { ...stop, place_id: chosen.id, note: describeStop(chosen) };
      if (kind) picks.set(kind, chosen.id);
    }
    outside.push(chosen);
  });
  return { stops: result.filter((_, index) => !dropped.has(index)), outside };
}

/**
 * Keeps the model's one-line summary only when it is a human line that matches the final plan:
 * no times, counts or prices, and no meal, cafe, sunset or bar the plan doesn't have.
 */
export function cleanSummary(summary: string, stops: DraftStop[], placesById: Map<string, NormalizedPlace>, sunsetMinutes: number) {
  const text = summary.replace(/\s+/g, " ").trim();
  if (!text || text.length > 160 || /\d/.test(text) || /\b(stops?|ka,|am|pm|php|₱)\b/i.test(text)) return "";
  const places = stops.map((stop) => ({ stop, place: placesById.get(stop.place_id) })).filter((entry) => entry.place);
  const has = (test: (place: NormalizedPlace, start: number) => boolean) => places.some(({ stop, place }) => test(place!, parseClock(stop.time) ?? 0));
  const claims: Array<[RegExp, boolean]> = [
    [/\b(dinner|hapunan|supper)\b/i, has((place, start) => place.category === "Food" && start >= 17 * 60)],
    [/\b(lunch|tanghalian)\b/i, has((place, start) => place.category === "Food" && start >= 10 * 60 + 30 && start < 15 * 60)],
    [/\b(cafes?|coffee|kape)\b/i, has((place) => place.category === "Cafe")],
    [/\b(sunset|golden hour|paglubog)\b/i, has((place, start) => place.category !== "Food" && Math.abs(start - (sunsetMinutes - 45)) <= 45)],
    [/\b(museums?|museo)\b/i, has((place) => place.category === "Museum")],
    [/\b(bars?|inuman|drinks?|cocktails?)\b/i, has((place) => place.category === "Nightlife")],
  ];
  if (claims.some(([pattern, present]) => pattern.test(text) && !present)) return "";
  // The summary must not name a place (place names belong to the stops) or an area the plan isn't in.
  const lower = text.toLowerCase();
  if (places.some(({ place }) => lower.includes(place!.name.toLowerCase()))) return "";
  const planAreas = places.map(({ place }) => `${place!.city ?? ""} ${place!.area ?? ""} ${place!.name}`.toLowerCase()).join(" ");
  const otherAreas = new Set([...placesById.values()].map((place) => (place.city ?? "").toLowerCase()).filter(Boolean));
  for (const [alias, city] of Object.entries(AREA_ALIASES)) {
    otherAreas.add(alias);
    otherAreas.add(city);
  }
  if ([...otherAreas].some((area) => mentionsPhrase(lower, area) && !planAreas.includes(area) && !planAreas.includes(AREA_ALIASES[area] ?? "\u0000"))) return "";
  return text;
}

/** "alis 7am", "leave at 6:30" -> the time the group leaves home, in minutes. */
export function parseDeparture(prompt: string): number | null {
  const match = prompt.toLowerCase().match(new RegExp(String.raw`\b(?:alis|aalis|leave|leaving|depart|departure|byahe|biyahe)\s+(?:at\s+|ng\s+|by\s+)?${CLOCK}`));
  // "alis 7" means the morning.
  return match ? readClock(match[1], match[2], match[3] ?? (Number(match[1]) <= 11 ? "am" : undefined)) : null;
}

/** Drive time from central Manila to a provincial stop: road distance at expressway pace, plus getting out of the city. */
export function driveMinutesFromManila(place: NormalizedPlace) {
  const km = distanceKm(MANILA_CENTRE, place);
  if (km === null) return null;
  return Math.round((20 + ((km * ROAD_FACTOR) / 60) * 60) / 15) * 15;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null, rest ? `${rest} min` : null].filter(Boolean).join(" ");
}

export { formatClock12, KIND_LABEL };

/** Drops the priciest stops nobody asked for until the plan fits the budget per head (always keeps two). */
export function fitBudget(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, budgetPerHead: number | null, keep: Set<string> = new Set()): DraftStop[] {
  if (budgetPerHead === null) return stops;
  const cost = (stop: DraftStop) => placesById.get(stop.place_id)?.budget_min ?? 0;
  let kept = [...stops];
  while (kept.length > MIN_STOPS && kept.reduce((sum, stop) => sum + cost(stop), 0) > budgetPerHead) {
    const foodCount = kept.filter((stop) => placesById.get(stop.place_id)?.category === "Food").length;
    const droppable = kept.filter((stop) => !keep.has(stop.place_id) && (placesById.get(stop.place_id)?.category !== "Food" || foodCount > 1));
    if (droppable.length === 0) break;
    const priciest = droppable.reduce((max, stop) => (cost(stop) > cost(max) ? stop : max));
    if (cost(priciest) === 0) break;
    kept = kept.filter((stop) => stop !== priciest);
  }
  return kept;
}

export function buildFallbackDraft(prompt: string, candidates: NormalizedPlace[]): DraftResponse | null {
  const requested = detectCategories(prompt);
  const wantsSunset = SUNSET_WORDS.test(prompt);
  const wantsEvening = wantsSunset || /\b(dinner|hapunan|night|gabi|evening|inuman|movie)\b/i.test(prompt);
  if (wantsSunset) requested.add("Park");
  if (requested.size < 2) ["Cafe", "Food"].forEach((category) => requested.add(category));
  const slots = FALLBACK_ORDER.filter((category) => requested.has(category)).slice(0, 4);

  const picks: NormalizedPlace[] = [];
  for (const category of slots) {
    const options = candidates.filter((place) => place.category === category && !picks.includes(place)).slice(0, 5);
    if (options.length === 0) continue;
    const previous = picks.at(-1);
    const best = previous
      ? [...options].sort((a, b) => (distanceKm(previous, a) ?? 99) - (distanceKm(previous, b) ?? 99))[0]
      : options[0];
    picks.push(best);
  }
  for (const place of candidates) {
    if (picks.length >= 3) break;
    if (!picks.includes(place)) picks.push(place);
  }
  if (picks.length < MIN_STOPS) return null;

  const cityCounts = new Map<string, number>();
  for (const place of picks) if (place.city) cityCounts.set(place.city, (cityCounts.get(place.city) ?? 0) + 1);
  const city = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    title: city ? `Day out in ${city}` : "Day plan",
    summary: "",
    group_size: parseGroupSize(prompt) ?? 1,
    stops: picks.map((place) => ({
      place_id: place.id,
      // A meal hint lets scheduleStops put food at lunch or dinner as the request implies.
      time: place.category === "Food" ? (wantsEvening ? "19:00" : "12:00") : "",
      minutes: DEFAULT_MINUTES[place.category] ?? 60,
      note: describeStop(place),
    })),
  };
}

export function wantsSunset(prompt: string) {
  return SUNSET_WORDS.test(prompt);
}

/** Date nights and "gabi" plans start late afternoon instead of the default morning. */
export function wantsEvening(prompt: string) {
  // "hanggang gabi" (until night) is when the day ends, not when it starts.
  const text = prompt.replace(/\b(?:hanggang|until|till|up to)\s+\S+(?:\s+\S+)?/gi, " ");
  return /\b(date night|night out|gabi|evening|tonight|mamayang gabi|dinner|hapunan|inuman|nightlife|after work|after office)\b/i.test(text);
}

const WHOLE_DAY = /\b(day ?trip|whole day|full day|buong araw|weekend|day tour|road ?trip|day out|(?:barkada|family|date) day)\b/i;

/** "Tagaytay day trip", "Baguio weekend": a whole day out, so the plan should run into the afternoon. */
export function wantsWholeDay(prompt: string) {
  return WHOLE_DAY.test(prompt);
}

/**
 * When the plan starts if the request gives no time: whole days start in the morning, "cafe tapos
 * dinner" in the afternoon (a museum a bit earlier, before it closes), date nights at 5 PM.
 */
export function defaultStart(prompt: string): number | null {
  if (wantsWholeDay(prompt) || !wantsEvening(prompt)) return null;
  const kinds = requestedKinds(prompt);
  if (kinds.includes("museum")) return 13 * 60;
  if (kinds.some((kind) => kind === "cafe" || kind === "lunch" || kind === "breakfast")) return 14 * 60;
  return 17 * 60;
}

/**
 * Keeps a plan in the area that was asked for: with a named place, stops elsewhere are dropped;
 * without one, stops far from the first stop are dropped. Never leaves fewer than two stops.
 */
export function keepStopsNearby(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, intent: LocationIntent, maxKm = 12): DraftStop[] {
  const resolved = stops.filter((stop) => placesById.has(stop.place_id));
  const inArea = hasLocation(intent)
    ? resolved.filter((stop) => matchesLocation(placesById.get(stop.place_id)!, intent))
    : resolved.filter((stop) => {
        const first = placesById.get(resolved[0].place_id)!;
        const km = distanceKm(first, placesById.get(stop.place_id)!);
        return km === null || km <= maxKm;
      });
  return inArea.length >= MIN_STOPS ? inArea : resolved;
}

/**
 * What a meal costs a head, from GalaTayo's own everyday eateries (the median of those up to PHP 1,000),
 * for meals the plan can't price: a food street with no entrance fee, or a meal no listed place covers.
 */
export function typicalMealCost(places: NormalizedPlace[]): number {
  const prices = places
    .filter((place) => place.category === "Food" && place.budget_min !== null && place.budget_min > 0 && place.budget_min <= 1000)
    .map((place) => place.budget_min!)
    .sort((a, b) => a - b);
  if (prices.length === 0) return 250;
  return Math.round(prices[Math.floor(prices.length / 2)] / 50) * 50;
}

/**
 * Meal money per head the stops' own prices miss: each food stop with no price (a food street with free
 * entry) is still a meal, and so is each asked-for meal no food stop covers. Same rule as the app's planCost.
 */
export function mealEstimatePerHead(stops: Array<NormalizedPlace | undefined>, mealsNeeded: number, mealCost: number): number {
  const food = stops.filter((place): place is NormalizedPlace => place !== undefined && isMealStop(place));
  const unpriced = food.filter((place) => !((place?.budget_min ?? 0) > 0)).length;
  return (unpriced + Math.max(0, mealsNeeded - food.length)) * mealCost;
}

export function getPlanSunset(date: string, places: NormalizedPlace[]) {
  const anchor = places.find((place) => place.latitude != null && place.longitude != null);
  return getSunsetMinutes(date, anchor ? { lat: anchor.latitude!, lng: anchor.longitude! } : undefined);
}
