import type { NormalizedPlace } from "../domain/places";
import { extractJsonObject } from "../utils/jsonRepair";
import { inferProvincialDestinationsFromQuery, isMetroManilaDestination, resolveDestination } from "../utils/phDestinations";
import { getSunsetMinutes } from "../utils/sunTimes";

const MAX_CANDIDATES = 60;
export const PLAN_CANDIDATES = 30;
const MIN_STOPS = 2;
const MAX_STOPS = 6;

// Common Metro Manila nicknames mapped to the city names stored on places (other destinations are matched through phDestinations).
const AREA_ALIASES: Record<string, string> = {
  bgc: "taguig",
  "bonifacio global city": "taguig",
  mckinley: "taguig",
  poblacion: "makati",
  legazpi: "makati",
  salcedo: "makati",
  moa: "pasay",
  "mall of asia": "pasay",
  intramuros: "manila",
  ermita: "manila",
  malate: "manila",
  binondo: "manila",
  qc: "quezon city",
  cubao: "quezon city",
  maginhawa: "quezon city",
  ortigas: "pasig",
  kapitolyo: "pasig",
  alabang: "muntinlupa",
  eastwood: "quezon city",
};

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

type LocationIntent = {
  cities: Set<string>;
  destinationSlugs: Set<string>;
};

/** Cities and destinations named in free text; empty when the text names no place. */
export function detectLocationIntent(places: NormalizedPlace[], text: string): LocationIntent {
  const lower = text.toLowerCase();
  const cities = new Set<string>();
  for (const place of places) {
    const city = (place.city ?? "").toLowerCase();
    if (city && new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) cities.add(city);
  }
  for (const [alias, city] of Object.entries(AREA_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) cities.add(city);
  }
  const destinationSlugs = new Set(inferProvincialDestinationsFromQuery(text).map(({ destination }) => destination.slug));
  return { cities, destinationSlugs };
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

function scorePlace(place: NormalizedPlace, text: string, location: LocationIntent, categories: Set<string>) {
  const haystack = [place.name, place.area, place.category, ...place.tags, ...place.good_for, ...place.search_terms]
    .join(" ")
    .toLowerCase();

  let score = 0;
  score += scoreLocation(place, location);
  if (categories.has(place.category)) score += 4;
  for (const word of text.split(/[^a-z0-9ñ]+/).filter((token) => token.length > 3)) {
    if (haystack.includes(word)) score += 1;
  }
  score += Math.min(2, (place.average_rating ?? 0) / 2.5);
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

/**
 * Ranks places for a request. `locationText` lets a chat follow-up ("may kainan malapit dun?")
 * reuse the area named earlier in the conversation.
 */
export function selectCandidates(places: NormalizedPlace[], prompt: string, limit = MAX_CANDIDATES, locationText = prompt) {
  const text = prompt.toLowerCase();
  const location = detectLocationIntent(places, locationText);
  const categories = detectCategories(text);

  const mapped = places.filter((place) => place.latitude != null && place.longitude != null);
  // When the named area has enough places, stay inside it instead of padding the list with other cities.
  const inArea = hasLocation(location) ? mapped.filter((place) => matchesLocation(place, location)) : [];
  return (inArea.length >= 10 ? inArea : mapped)
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

export function buildSystemPrompt(plan: { date: string; weekday: string; sunsetMinutes: number }) {
  return `You plan one-day outings ("gala") in the Philippines for GalaTayo. When the request names no place, plan in Metro Manila.
The gala is on ${plan.weekday}, ${plan.date}. Sunset is about ${formatClock12(plan.sunsetMinutes)}.
Pick ${MIN_STOPS}-${MAX_STOPS} stops ONLY from CANDIDATES, by their ref (p1, p2...). Never invent places. Always return at least ${MIN_STOPS} stops: if nothing fits exactly, use the closest fitting candidates (a mall for a movie, a cafe for snacks).
Keep travel short, respect the budget in PHP, and use realistic 24h times: lunch 11:00-14:00, dinner 17:30-21:00, bars after 19:00, a sunset stop starts about 45 min before sunset. Durations 30-240 minutes.
Reply with JSON only:
{"title": string (max 60 chars, Taglish ok), "summary": string (max 140 chars), "group_size": integer (1 if not stated), "stops": [{"ref": "p1", "time": "HH:MM", "minutes": integer, "note": string (max 80 chars, why this stop)}]}`;
}

export function buildUserMessage(prompt: string, candidates: NormalizedPlace[]) {
  const lines = candidates.map((place, index) =>
    [
      `p${index + 1}`,
      place.name,
      place.category,
      place.city ?? "",
      place.budget_min != null ? (place.budget_min === 0 ? "free" : `PHP ${place.budget_min}+`) : "",
      place.good_for.slice(0, 3).join("/"),
    ].join(" | ")
  );
  return `REQUEST: ${prompt}\n\nCANDIDATES (ref | name | category | city | cost per person | good for):\n${lines.join("\n")}`;
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
      const note = typeof entry.note === "string" ? entry.note.trim().slice(0, 120) : "";
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

function stopKind(place: NormalizedPlace, note: string, clock: number | null, wantsSunset: boolean): StopKind {
  const text = `${note} ${place.name} ${place.tags.join(" ")} ${place.good_for.join(" ")} ${place.best_time_to_visit ?? ""}`.toLowerCase();
  if (place.category === "Nightlife") return "nightlife";
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

function distanceKm(a: NormalizedPlace, b: NormalizedPlace) {
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
  options: { sunsetMinutes: number; wantsSunset: boolean; notBefore?: number }
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
    const shiftRoom = Math.min(...items.slice(0, index).map((_, j) => windowFor(j).max - starts[j]));
    const shift = Math.max(0, Math.min(gap - 15, shiftRoom));
    for (let j = 0; j < index; j++) starts[j] += shift;
    gap -= shift;
    if (gap > 30) previous.stop.minutes = Math.min(240, previous.stop.minutes + gap - 15);
  }

  return items
    .map((item, index) => ({ ...item.stop, time: formatClock(roundTo5(starts[index])) }))
    // Drop trailing stops that would start after the venue closes or too late at night (always keep two).
    .filter((stop, index) => index < MIN_STOPS || (starts[index] < 23 * 60 + 30 && starts[index] <= windowFor(index).max + 30));
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
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}...` : sentence;
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
      note: firstSentence(place.description) || place.good_for.slice(0, 2).join(", "),
    })),
  };
}

export function wantsSunset(prompt: string) {
  return SUNSET_WORDS.test(prompt);
}

export function getPlanSunset(date: string, places: NormalizedPlace[]) {
  const anchor = places.find((place) => place.latitude != null && place.longitude != null);
  return getSunsetMinutes(date, anchor ? { lat: anchor.latitude!, lng: anchor.longitude! } : undefined);
}
