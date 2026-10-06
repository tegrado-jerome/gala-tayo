import type { NormalizedPlace } from "../domain/places";
import { extractJsonObject } from "../utils/jsonRepair";
import { inferProvincialDestinationsFromQuery, isMetroManilaDestination, resolveDestination } from "../utils/phDestinations";
import { detectAliasedCities, isNearManila, locationText, mentionsPhrase } from "../utils/areaAliases";
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
};

/** Cities and destinations named in free text; empty when the text names no place. */
export function detectLocationIntent(places: NormalizedPlace[], text: string): LocationIntent {
  const lower = locationText(text);
  const { cities, aliases } = detectAliasedCities(text);
  for (const place of places) {
    const city = (place.city ?? "").toLowerCase();
    if (city && mentionsPhrase(lower, city)) cities.add(city);
  }
  const destinationSlugs = new Set(inferProvincialDestinationsFromQuery(text).map(({ destination }) => destination.slug));
  return { cities, destinationSlugs, areaWords: aliases, nearManila: isNearManila(text) };
}

export function hasLocation(intent: LocationIntent) {
  return intent.cities.size > 0 || intent.destinationSlugs.size > 0;
}

// With no place named in the prompt, plans stay in Metro Manila.
export function matchesLocation(place: NormalizedPlace, { cities, destinationSlugs }: LocationIntent) {
  const destination = resolveDestination(place.city, place.area);
  return cities.has((place.city ?? "").toLowerCase()) || (destination !== null && destinationSlugs.has(destination.slug));
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
  locationSource = prompt,
  constraints?: Pick<PlanConstraints, "budgetPerHead" | "start">,
) {
  const text = prompt.toLowerCase();
  const location = detectLocationIntent(places, locationSource);
  const categories = detectCategories(text);
  const budget = constraints?.budgetPerHead ?? null;

  return placesForArea(places, location)
    .filter((place) => budget === null || place.budget_min === null || place.budget_min <= budget)
    .filter((place) => isOpenDuring(place, constraints?.start ?? null))
    .map((place) => ({ place, score: scorePlace(place, text, location, categories) }))
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
  ].filter(Boolean);
  return `You plan one-day outings ("gala") in the Philippines for GalaTayo. When the request names no place, plan in Metro Manila.
The gala is on ${plan.weekday}, ${plan.date}. Sunset is about ${formatClock12(plan.sunsetMinutes)}.
Pick ${MIN_STOPS}-${MAX_STOPS} stops ONLY from CANDIDATES, by their ref (p1, p2...). Never invent places. Always return at least ${MIN_STOPS} stops: if nothing fits exactly, use the closest fitting candidates (a mall for a movie, a cafe for snacks).
Stay in the area the request names. Keep travel short and use realistic 24h times: lunch 11:00-14:00, dinner 17:30-21:00, bars after 19:00, museums close about 16:00-17:00, a sunset stop starts about 45 min before sunset. Durations 30-240 minutes.
${rules.length ? `${rules.join("\n")}\n` : ""}Write the title, summary and notes in the same language mix as the request (Taglish in, Taglish out). Notes are one friendly sentence on why the stop fits; never put prices, refs, "2x" or the place name in a note.
Reply with JSON only:
{"title": string (max 60 chars), "summary": string (max 140 chars), "group_size": integer (1 if not stated), "stops": [{"ref": "p1", "time": "HH:MM", "minutes": integer, "note": string (max 80 chars)}]}`;
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
};

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
    text.match(new RegExp(String.raw`\b(?:budget|badyet|under|below|max|hanggang|tig-?)\s*(?:of|na|is|ay|ng)?\s*${AMOUNT}\b`));
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
  return { budgetPerHead: parseBudgetPerHead(prompt, groupSize), ...window, meal: requiredMeal(prompt, window) };
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

/** Minutes to get between two stops: walk when close, otherwise a city ride with traffic. */
export function travelMinutes(from: NormalizedPlace, to: NormalizedPlace) {
  const km = distanceKm(from, to);
  if (km === null) return 20;
  if (km < 1.2) return Math.max(5, Math.ceil(km * 13));
  return Math.min(120, Math.round(10 + km * 3));
}

const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5;

/**
 * Re-times stops so meals land in meal windows, the sunset stop meets the sunset,
 * venues are open, and each start allows for travel from the previous stop.
 */
export function scheduleStops(
  stops: DraftStop[],
  placesById: Map<string, NormalizedPlace>,
  options: { sunsetMinutes: number; wantsSunset: boolean; notBefore?: number; notAfter?: number; fixedStart?: boolean }
): DraftStop[] {
  const items = stops
    .map((stop) => ({ stop: { ...stop }, place: placesById.get(stop.place_id)!, clock: parseClock(stop.time) }))
    .filter((item) => item.place);

  // Only one sunset stop makes sense; when sunset was asked for and no stop says so, the last outdoor stop takes it.
  const classify = () => {
    const kinds = items.map((item) => stopKind(item.place, item.stop.note, item.clock, options.wantsSunset));
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
    const base = WINDOWS[kind];
    const opening = kind === "general" ? CATEGORY_OPENING[items[index].place.category] : undefined;
    return opening ? { min: Math.max(base.min, opening.min), max: Math.min(base.max, opening.max) } : base;
  };

  const starts: number[] = [];
  items.forEach((item, index) => {
    const window = windowFor(index);
    let start: number;
    if (index === 0) {
      start = Math.max(item.clock ?? 10 * 60, window.min, options.notBefore ?? 0);
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
    if (gap > 30) previous.stop.minutes = Math.min(240, previous.stop.minutes + gap - 15);
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

/**
 * Makes sure a plan that needs a meal has one: adds the closest Food candidate that fits the
 * remaining budget, replacing the last non-food stop when the plan is full.
 */
export function ensureMeal(
  stops: DraftStop[],
  candidates: NormalizedPlace[],
  meal: "lunch" | "dinner" | null,
  budgetPerHead: number | null = null,
): DraftStop[] {
  if (!meal) return stops;
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const mealWords = meal === "dinner" ? /\b(dinner|hapunan|supper)\b/i : /\b(lunch|tanghalian)\b/i;
  const hasMeal = stops.some((stop) => {
    const place = byId.get(stop.place_id);
    // A cafe the model picked "for dinner" counts as the meal.
    return place?.category === "Food" || (place?.category === "Cafe" && mealWords.test(stop.note));
  });
  if (hasMeal) return stops;

  const kept = stops.length >= MAX_STOPS ? stops.slice(0, -1) : stops;
  const spent = kept.reduce((sum, stop) => sum + (byId.get(stop.place_id)?.budget_min ?? 0), 0);
  const left = budgetPerHead === null ? Infinity : budgetPerHead - spent;
  const anchor = byId.get(kept.at(-1)?.place_id ?? "");
  const used = new Set(kept.map((stop) => stop.place_id));
  const food = candidates
    .filter((place) => place.category === "Food" && !used.has(place.id) && (place.budget_min ?? 0) <= left && servesMeal(place, meal))
    // Prefer a known price over an unknown one, then the closest to the plan.
    .sort((a, b) => Number(a.budget_min === null) - Number(b.budget_min === null) || (anchor ? (distanceKm(anchor, a) ?? 99) - (distanceKm(anchor, b) ?? 99) : 0))[0];
  if (!food) return stops;

  const mealStop: DraftStop = {
    place_id: food.id,
    time: meal === "dinner" ? "19:00" : "12:00",
    minutes: DEFAULT_MINUTES.Food,
    note: describeStop(food),
  };
  return meal === "lunch" && kept.length > 1 ? [kept[0], mealStop, ...kept.slice(1)] : [...kept, mealStop];
}

/** Drops the priciest non-meal stops until the plan fits the budget per head (always keeps two). */
export function fitBudget(stops: DraftStop[], placesById: Map<string, NormalizedPlace>, budgetPerHead: number | null): DraftStop[] {
  if (budgetPerHead === null) return stops;
  const cost = (stop: DraftStop) => placesById.get(stop.place_id)?.budget_min ?? 0;
  let kept = [...stops];
  while (kept.length > MIN_STOPS && kept.reduce((sum, stop) => sum + cost(stop), 0) > budgetPerHead) {
    const foodCount = kept.filter((stop) => placesById.get(stop.place_id)?.category === "Food").length;
    const droppable = kept.filter((stop) => placesById.get(stop.place_id)?.category !== "Food" || foodCount > 1);
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
    title: city ? `Gala sa ${city}` : "Gala plan",
    summary: "A quick plan from GalaTayo places. Swap or reorder stops, then save.",
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

export function getPlanSunset(date: string, places: NormalizedPlace[]) {
  const anchor = places.find((place) => place.latitude != null && place.longitude != null);
  return getSunsetMinutes(date, anchor ? { lat: anchor.latitude!, lng: anchor.longitude! } : undefined);
}
