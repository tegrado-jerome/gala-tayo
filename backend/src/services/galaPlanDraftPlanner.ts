import type { NormalizedPlace } from "../domain/places";

const MAX_CANDIDATES = 60;
const MIN_STOPS = 2;
const MAX_STOPS = 6;

// Common Metro Manila nicknames mapped to the city names stored on places.
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

export type DraftStop = {
  place_id: string;
  time: string;
  minutes: number;
  note: string;
};

export type DraftResponse = {
  title: string;
  summary: string;
  date: string | null;
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
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") };
}

function scorePlace(place: NormalizedPlace, text: string, cities: Set<string>, categories: Set<string>) {
  const city = (place.city ?? "").toLowerCase();
  const haystack = [place.name, place.area, place.category, ...place.tags, ...place.good_for, ...place.search_terms]
    .join(" ")
    .toLowerCase();

  let score = 0;
  if (cities.size > 0) score += cities.has(city) ? 6 : -4;
  if (categories.has(place.category)) score += 4;
  for (const word of text.split(/[^a-z0-9ñ]+/).filter((token) => token.length > 3)) {
    if (haystack.includes(word)) score += 1;
  }
  score += Math.min(2, (place.average_rating ?? 0) / 2.5);
  return score;
}

export function selectCandidates(places: NormalizedPlace[], prompt: string) {
  const text = prompt.toLowerCase();
  const cities = new Set<string>();
  for (const place of places) {
    const city = (place.city ?? "").toLowerCase();
    if (city && text.includes(city)) cities.add(city);
  }
  for (const [alias, city] of Object.entries(AREA_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(text)) cities.add(city);
  }
  const categories = new Set(
    Object.entries(CATEGORY_KEYWORDS)
      .filter(([, words]) => words.some((word) => text.includes(word)))
      .map(([category]) => category)
  );

  return places
    .filter((place) => place.latitude != null && place.longitude != null)
    .map((place) => ({ place, score: scorePlace(place, text, cities, categories) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.place);
}

export function buildSystemPrompt(today: { iso: string; weekday: string }) {
  return `You plan one-day outings ("gala") in Metro Manila for GalaTayo.
Today is ${today.weekday}, ${today.iso} (Asia/Manila).
Pick ${MIN_STOPS}-${MAX_STOPS} stops ONLY from the CANDIDATES list, using their exact id.
Order stops so travel is short, respect the user's budget in PHP, and choose realistic times (24h "HH:MM") and durations in minutes (30-240).
Reply with JSON only, in this shape:
{"title": string (max 60 chars, Taglish ok), "summary": string (max 160 chars), "date": "YYYY-MM-DD" or null (resolve words like "Sunday" or "bukas"), "group_size": integer (1 if not stated), "stops": [{"place_id": string, "time": "HH:MM", "minutes": integer, "note": string (max 90 chars, why this stop)}]}`;
}

export function buildUserMessage(prompt: string, candidates: NormalizedPlace[]) {
  const lines = candidates.map((place) =>
    [
      place.id,
      place.name,
      place.category,
      place.city ?? "",
      place.area ?? "",
      place.budget_min != null ? `from PHP ${place.budget_min}` : "price unknown",
      place.visit_duration ?? "",
      place.good_for.slice(0, 3).join("/"),
    ].join(" | ")
  );
  return `REQUEST: ${prompt}\n\nCANDIDATES (id | name | category | city | area | cost per person | visit length | good for):\n${lines.join("\n")}`;
}

export function parseDraft(raw: string, candidateIds: Set<string>): DraftResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;

  const seen = new Set<string>();
  const stops = (Array.isArray(value.stops) ? value.stops : [])
    .map((stop): DraftStop | null => {
      if (!stop || typeof stop !== "object") return null;
      const entry = stop as Record<string, unknown>;
      const placeId = typeof entry.place_id === "string" ? entry.place_id : "";
      if (!candidateIds.has(placeId) || seen.has(placeId)) return null;
      seen.add(placeId);
      const time = typeof entry.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time) ? entry.time : "";
      const minutes = Math.min(240, Math.max(30, Math.round(Number(entry.minutes) || 60)));
      const note = typeof entry.note === "string" ? entry.note.slice(0, 120) : "";
      return { place_id: placeId, time, minutes, note };
    })
    .filter((stop): stop is DraftStop => stop !== null)
    .slice(0, MAX_STOPS);

  if (stops.length < MIN_STOPS) return null;

  const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 80) : "Gala plan",
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 200) : "",
    date,
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

// Resolve day words in the prompt to a date so plans don't depend on the model's calendar math.
// Returns null when the prompt names no day.
export function resolvePromptDate(prompt: string, todayIso: string): string | null {
  const text = prompt.toLowerCase();
  const today = new Date(`${todayIso}T00:00:00Z`);
  const addDays = (days: number) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  if (/\b(today|ngayon|mamaya)\b/.test(text)) return todayIso;
  if (/\b(tomorrow|bukas)\b/.test(text)) return addDays(1);
  const match = WEEKDAY_WORDS.find(([pattern]) => pattern.test(text));
  if (!match) return null;
  const difference = (match[1] - today.getUTCDay() + 7) % 7;
  return addDays(difference === 0 ? 0 : difference);
}
