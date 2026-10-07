import galaScores from "../../data/galaScores.json";
import type { NormalizedPlace } from "../../domain/places";
import { FIELD_WEIGHT, isIndoorPlace, parseQueryIntent, termField, vibeScore, type VibeId } from "../../domain/queryIntent";
import { detectAliasedCities } from "../../utils/areaAliases";
import { isGalaWorthySlug } from "../../utils/galaWorthy";
import { isMetroManilaDestination, resolveDestination } from "../../utils/phDestinations";
import { resolveAreaSlug } from "../../utils/seoPlaces";
import {
  areaLabel,
  buildFallbackDraft,
  detectLocationIntent,
  getPlanSunset,
  hasLocation,
  isNightFriendly,
  matchesLocation,
  scheduleStops,
  selectCandidates,
  servesMeal,
  wantsSunset,
} from "../galaPlanDraftPlanner";
import type { ToolDeclaration } from "./providers/types";
import type { WeatherSummary } from "./weather";

/** Everything a tool may touch. Tests pass fixture places and a fake weather lookup. */
export type ToolContext = {
  places: NormalizedPlace[];
  todayIso: string;
  weather: (latitude: number, longitude: number) => Promise<WeatherSummary | null>;
  /** Optional Google Maps check of a curated place; absent when the feature is off. */
  verify?: (place: NormalizedPlace) => Promise<{ found: boolean; title: string | null; uri: string | null } | null>;
};

/** What tools found during one answer: the only places the answer may show. */
export type ToolLedger = {
  places: Map<string, NormalizedPlace>;
  /** Slugs in the order the tools ranked them, best first. */
  ranked: string[];
  weather: (WeatherSummary & { area: string }) | null;
  plan: { date: string; stops: Array<{ time: string | null; slug: string; note: string }> } | null;
  verified: Map<string, { title: string | null; uri: string | null }>;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  /** When a search named an area: the places found that are actually in it, so answers never call the rest "in" it. */
  inArea: Set<string> | null;
};

export function newLedger(): ToolLedger {
  return { places: new Map(), ranked: [], weather: null, plan: null, verified: new Map(), calls: [], inArea: null };
}

const CATEGORIES = ["Activity", "Cafe", "Cinema", "Food", "Heritage", "Hotel", "Mall", "Museum", "Nightlife", "Park"];

/** Whether a place works in the rain: our own "Rainy Day" tag first, then the category. Null when unsure. */
export const isIndoor = isIndoorPlace;

export function distanceKm(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function placePath(place: Pick<NormalizedPlace, "city" | "area" | "slug">) {
  return `/places/${encodeURIComponent(resolveAreaSlug(place.city, place.area).slug)}/${encodeURIComponent(place.slug)}`;
}

function firstSentence(text: string | null, max = 180) {
  if (!text) return null;
  const sentence = text.split(/(?<=[.!?])\s+/).find((part) => part.length > 30) ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** Only visible, gala-worthy places with a slug are ever handed to the model. */
export function visiblePlaces(places: NormalizedPlace[]) {
  return places.filter((place) => place.slug && place.status !== "hidden" && isGalaWorthySlug(place.slug));
}

/** The compact record the model sees. Facts only from our data; no hours (we don't hold them). */
function summarise(place: NormalizedPlace, from?: { latitude: number | null; longitude: number | null }) {
  const km = from ? distanceKm(from, place) : null;
  return {
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: [place.area, place.city].filter(Boolean).join(", "),
    budget_per_head: place.budget_min === null ? "not listed" : place.budget_min === 0 ? "free" : `from PHP ${place.budget_min}`,
    budget_note: place.budget_note ? place.budget_note.slice(0, 140) : null,
    good_for: place.good_for.slice(0, 5),
    indoor: isIndoor(place),
    about: firstSentence(place.description),
    best_time: place.best_time_to_visit,
    ...(km !== null ? { distance_km: Math.round(km * 10) / 10 } : {}),
  };
}

function record(ledger: ToolLedger, places: NormalizedPlace[]) {
  for (const place of places) {
    ledger.places.set(place.slug, place);
    if (!ledger.ranked.includes(place.slug)) ledger.ranked.push(place.slug);
  }
}

const str = (value: unknown, max = 120) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const num = (value: unknown, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const bool = (value: unknown) => (value === true || value === "true" ? true : value === false || value === "false" ? false : null);

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "search_places",
    description:
      "Search GalaTayo's curated, verified places. Always call this before recommending anything. Returns up to 8 places ranked for the request.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the user wants, in a few words (e.g. 'sisig', 'date with a view', 'museum')." },
        area: { type: "string", description: "City, district or destination (e.g. 'BGC', 'Quezon City', 'Tagaytay', 'near Manila'). Omit when none is known." },
        vibe: { type: "string", description: "Who or what for: date, barkada, family, solo, tourist." },
        category: { type: "string", enum: CATEGORIES, description: "Only when the user clearly wants one kind of place." },
        budget_max: { type: "number", description: "Max pesos per person. Only when the user gave a budget or asked for cheap (use 500 for cheap, 0 for free)." },
        indoor: { type: "boolean", description: "True when it is raining or the user wants indoor places." },
        open_now: { type: "boolean", description: "User asked for places open now. Opening hours are not in GalaTayo data; the result says so." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_place",
    description: "Full details of one GalaTayo place by slug: description, budget note, best time, how to get there.",
    parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "nearby_places",
    description: "GalaTayo places near a place (by slug) or a point, nearest first.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "A GalaTayo place slug to search around." },
        latitude: { type: "number" },
        longitude: { type: "number" },
        radius_km: { type: "number", description: "Default 2." },
        category: { type: "string", enum: CATEGORIES },
      },
    },
  },
  {
    name: "weather",
    description: "Live weather (Open-Meteo) for an area or point: temperature and whether rain is likely in the next hours.",
    parameters: {
      type: "object",
      properties: { area: { type: "string" }, latitude: { type: "number" }, longitude: { type: "number" } },
    },
  },
  {
    name: "plan_day",
    description: "Build a timed day plan from GalaTayo places, using GalaTayo's planner rules (meal times, sunset, short hops).",
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "The plan request in the user's words, including area, vibe, budget and time." },
      },
      required: ["request"],
    },
  },
  {
    name: "route_hint",
    description: "Straight-line distance between two GalaTayo places (slugs) and the usual way to get there. Gives no travel times.",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
];

export const VERIFY_TOOL: ToolDeclaration = {
  name: "verify_place",
  description: "Check on Google Maps that a GalaTayo place (by slug) still exists. Use only when the user asks if a place is still open or operating.",
  parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
};

/** Typical way to cover a straight-line distance in the Philippines. Never a time. */
export function travelMode(km: number) {
  if (km <= 1.2) return "walk";
  if (km <= 20) return "Grab, taxi or jeep";
  if (km <= 250) return "drive or bus";
  return "flight, or a ferry for islands";
}

function centreOf(places: NormalizedPlace[]) {
  const mapped = places.filter((place) => place.latitude != null && place.longitude != null);
  if (mapped.length === 0) return null;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { latitude: median(mapped.map((place) => place.latitude!)), longitude: median(mapped.map((place) => place.longitude!)) };
}

function areaPlaces(places: NormalizedPlace[], area: string) {
  const intent = detectLocationIntent(places, area);
  return hasLocation(intent) ? places.filter((place) => matchesLocation(place, intent)) : [];
}

// Words that say where, who or how much rather than what; matching them would favour any place named "Manila ...".
const QUERY_FILLER = new Set(
  "a an the and or with for near malapit sa ng na mga ang place places spot spots best good nice gala lakad tara saan where what some any cheap mura budget date night barkada family solo friends indoor outdoor activities activity things manila metro city today ngayon bukas kasi lang naman pwede puwede yung dito doon diyan umuulan maulan ulan rain raining rainy something cheaper else more also another other instead options please lower budget each kami tayo".split(" ")
);

const MANILA = { latitude: 14.5995, longitude: 120.9842 };
const NEAR_MANILA_KM = 250;

export function queryTokens(query: string) {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .map((word) => word.replace(/^mag-?/, ""))
    .filter((word) => word.length >= 4 && !QUERY_FILLER.has(word));
}

const GALA_SCORES: Record<string, number> = galaScores;

// Vibes that only rank: a view or a sunset is a plus. Every other vibe must fit: a beach ask shows beaches,
// a "kainan" ask shows eateries, "with kids" never shows a bar.
const RANKING_VIBES = new Set<VibeId>(["view", "sunset"]);
// Time-of-day and filler words in chat asks that say when, not what.
const ASK_FILLER = new Set(
  // Where the asker comes from ("visiting from Japan") is about them, not the place.
  "night gabi evening tonight morning umaga hapon afternoon tanghali noon later open bukas sarado ngayon magkano entrance fee price presyo hours oras para kasi sana yata pala kaya muna nalang nlang huwag wala meron mayroon with without japan korea china taiwan singapore usa america australia europe abroad balikbayan".split(" ")
);
const NIGHT_ASK = /\b(night|gabi|evening|tonight|mamayang gabi|after work|after office|dinner|hapunan)\b/i;
// An area borrows from its neighbours only when it has fewer fits than this; two real local picks beat four mixed ones.
const BORROW_BELOW = 2;
// When nothing in or around the area is that kind of place (waterfalls in Cebu City), the nearest ones within a day trip.
const NEAREST_KIND_KM = 200;

/** Places that can't be visited at night: museums, heritage sites and parks without an evening draw, breakfast spots. */
function closedAtNight(place: NormalizedPlace) {
  if (place.category === "Food") return !servesMeal(place, "dinner");
  return ["Museum", "Heritage", "Park"].includes(place.category) && !isNightFriendly(place);
}

/** Words of the area the ask names ("bgc", "makati"): a filter, not something to find in a place's data. */
function areaWords(text: string, places: NormalizedPlace[]) {
  const intent = detectLocationIntent(places, text);
  const { aliases } = detectAliasedCities(text);
  return new Set([...intent.cities, ...aliases, ...(intent.provinces ?? [])].flatMap((name) => name.toLowerCase().split(/[^a-z0-9ñ]+/)).filter(Boolean));
}

/** How a place fits the words of an ask: null when it misses a required word, else a score (name beats tags beats description). */
export function askScore(place: NormalizedPlace, terms: string[][]): number | null {
  let score = 0;
  for (const alternatives of terms) {
    const field = termField(place, alternatives);
    if (!field) return null;
    score += FIELD_WEIGHT[field];
  }
  return score;
}

function searchPlaces(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const query = str(args.query) ?? "";
  const area = str(args.area);
  const vibe = str(args.vibe, 40);
  const category = CATEGORIES.includes(String(args.category)) ? String(args.category) : null;
  const indoor = bool(args.indoor);
  const places = visiblePlaces(context.places);
  const locationText = area ?? query;
  const intent = detectLocationIntent(places, locationText);
  const named = hasLocation(intent);

  const ask = parseQueryIntent([query, vibe].filter(Boolean).join(" "), places);
  // "Libre" means free, whatever budget was said earlier.
  const budget = ask.vibes.includes("free") ? 0 : num(args.budget_max, 0, 200000);
  const required = ask.vibes.filter((id) => !RANKING_VIBES.has(id) && id !== "free");
  if (indoor && !required.includes("indoor")) required.push("indoor");
  const ranking = ask.vibes.filter((id) => RANKING_VIBES.has(id));
  const night = NIGHT_ASK.test(query);
  // Only words some place is actually known by count ("sisig", "lagoon"); chat filler and the area itself don't.
  const where = areaWords(locationText, places);
  const known = (alternatives: string[]) => places.some((place) => ["name", "tags", "location"].includes(termField(place, alternatives) ?? ""));
  const asked = ask.terms.filter(([word]) => !where.has(word) && !ASK_FILLER.has(word) && !QUERY_FILLER.has(word));
  const terms = asked.filter(known);
  // "xylophone in Makati": a thing no place is known by. Said plainly, with the area's best as alternatives.
  const unlisted = terms.length === 0 && required.length === 0 && !category ? asked.map(([word]) => word) : [];

  // With a budget, only places whose price we know count: "unknown" must not pass as cheap.
  const withinBudget = (place: NormalizedPlace) => budget === null || (place.budget_min !== null && place.budget_min <= budget);
  const fitsKind = (place: NormalizedPlace) =>
    (!category || place.category === category) && required.every((id) => vibeScore(place, id) > 0) && (!night || !closedAtNight(place));
  const fits = (place: NormalizedPlace) => fitsKind(place) && withinBudget(place);
  const isMetro = (place: NormalizedPlace) => isMetroManilaDestination(resolveDestination(place.city, place.area));
  // With no area named, Metro Manila comes first: most outings start there.
  const homeBonus = (place: NormalizedPlace) => (!named && !intent.nearManila && isMetro(place) ? 4 : 0);
  const rank = (place: NormalizedPlace) => {
    const words = askScore(place, terms);
    if (words === null) return null;
    return words + homeBonus(place) + [...required, ...ranking].reduce((sum, id) => sum + vibeScore(place, id) * 3, 0);
  };
  const byRank = (pool: NormalizedPlace[]) =>
    pool
      .map((place) => ({ place, score: rank(place) }))
      .filter((entry): entry is { place: NormalizedPlace; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score || (GALA_SCORES[b.place.slug] ?? 0) - (GALA_SCORES[a.place.slug] ?? 0))
      .map((entry) => entry.place);

  // A place that has the dish in its name or tags beats one whose long description mentions it in passing.
  const strongly = (place: NormalizedPlace) => terms.every((alternatives) => !["description", null].includes(termField(place, alternatives)));
  const fitting = places.filter(fits);
  const candidates = terms.length > 0 && fitting.some(strongly) ? fitting.filter(strongly) : fitting;
  const inArea = (place: NormalizedPlace) => !named || matchesLocation(place, intent);
  const inAreaPlaces = places.filter(inArea);
  const covered = !named || inAreaPlaces.length > 0;
  const centre = named ? centreOf(inAreaPlaces) : intent.nearManila ? MANILA : null;
  const metro = !named || inAreaPlaces.some(isMetro);
  const away = (place: NormalizedPlace) => (centre ? (distanceKm(centre, place) ?? 9999) : 0);

  let results: NormalizedPlace[];
  let nearest = false;
  let relaxedWords = false;
  if (!named && intent.nearManila) {
    // "Beach near Manila" is a day trip: outside Metro Manila, within a few hours' drive, best fit then closest.
    const outside = candidates.filter((place) => !isMetro(place) && away(place) <= NEAR_MANILA_KM);
    results = byRank(outside).sort((a, b) => (rank(b) ?? 0) - (rank(a) ?? 0) || away(a) - away(b));
  } else {
    results = byRank(candidates.filter(inArea));
    if (named && results.length < BORROW_BELOW) {
      // An area with almost nothing that fits borrows places a short ride away, nearest first, after its own.
      const reach = metro ? 8 : 30;
      results = [...results, ...byRank(candidates.filter((place) => !inArea(place) && away(place) <= reach)).sort((a, b) => away(a) - away(b))];
    }
    if (results.length === 0 && terms.length > 0) {
      // Nothing near has the dish or thing asked for: the closest places that do ("sisig" -> Angeles).
      results = byRank(candidates).sort((a, b) => away(a) - away(b));
      nearest = results.length > 0;
    }
    if (results.length === 0 && required.length > 0 && centre) {
      // The catalogue may still have that kind of place a drive away (Kawasan for "waterfalls near Cebu City").
      results = byRank(candidates.filter((place) => away(place) <= NEAREST_KIND_KM)).sort((a, b) => away(a) - away(b));
      // The same province first: a drive away, not a ferry to the next island.
      const provinces = new Set(inAreaPlaces.map((place) => resolveDestination(place.city, place.area)?.provinceName).filter(Boolean));
      const sameProvince = results.filter((place) => provinces.has(resolveDestination(place.city, place.area)?.provinceName));
      if (sameProvince.length > 0) results = sameProvince;
      nearest = results.length > 0;
    }
    if (results.length === 0 && terms.length > 0) {
      // Nobody lists it: the kind of place asked for, in the area, as an honest alternative.
      relaxedWords = true;
      const loose = fitting.filter(inArea).sort((a, b) => (GALA_SCORES[b.slug] ?? 0) - (GALA_SCORES[a.slug] ?? 0));
      results = required.length > 0 || category ? loose : [];
    }
  }
  let overBudget = false;
  if (results.length === 0 && budget !== null && budget > 0 && terms.length === 0 && required.length > 0) {
    // No place of that kind within the budget ("island hopping in Coron, budget"): the cheapest that are,
    // so the answer can say what it costs. A dish asked "cheaper" stays empty: nothing cheaper is listed.
    const cheapest = places
      .filter((place) => fitsKind(place) && inArea(place) && place.budget_min !== null)
      .sort((a, b) => a.budget_min! - b.budget_min!);
    results = cheapest;
    overBudget = cheapest.length > 0;
  }
  results = results.slice(0, 8);
  record(ledger, results);
  if (named) ledger.inArea = new Set([...(ledger.inArea ?? []), ...results.filter(inArea).map((place) => place.slug)]);

  const inAreaCount = results.filter(inArea).length;
  const wanted = [...terms.map(([word]) => word), ...required].join(", ");
  const areaName = area ?? areaLabel(intent) ?? "the area";
  const notes = [
    !covered ? `GalaTayo has no places in ${areaName} yet. Say so; do not name venues there.` : null,
    unlisted.length > 0 ? `No GalaTayo place mentions "${unlisted.join(" ")}". Say GalaTayo doesn't list one yet, then offer these as alternatives.` : null,
    overBudget ? `Nothing like that fits PHP ${budget} a head${named ? ` in ${areaName}` : ""}. These are the cheapest; say they cost more than the budget.` : null,
    covered && results.length === 0 ? `No GalaTayo place fits ${wanted || "all of that"}${named ? ` in or near ${areaName}` : ""}. Say so plainly and suggest loosening one filter.` : null,
    nearest ? `No GalaTayo place in ${areaName} has ${wanted}. These are the nearest that do; say where they are.` : null,
    relaxedWords && results.length > 0 ? `No GalaTayo place mentions "${terms.map(([word]) => word).join(" ")}". Say GalaTayo doesn't list one yet, then offer these as alternatives.` : null,
    named && covered && !nearest && results.length > 0 && inAreaCount === 0
      ? `No GalaTayo place in ${areaName} fits. Say so; these are a short ride away.`
      : null,
    named && covered && !nearest && inAreaCount > 0 && inAreaCount < results.length
      ? `Places with in_area false are outside ${areaName}, a short ride away: say where each one is, never that it is in ${areaName}.`
      : null,
    budget === 0 ? "Only free places are listed." : null,
    args.open_now === true ? "Opening hours are not in GalaTayo data: do not say a place is open now." : null,
  ].filter(Boolean);
  return {
    area_covered: covered,
    ...(notes.length ? { note: notes.join(" ") } : {}),
    places: results.map((place) => ({
      ...summarise(place),
      ...(named ? { in_area: inArea(place) } : {}),
      matches_query: terms.length > 0 && !relaxedWords,
    })),
  };
}

function getPlace(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const slug = str(args.slug)?.toLowerCase();
  const place = visiblePlaces(context.places).find((entry) => entry.slug === slug);
  if (!place) return { error: "No GalaTayo place with that slug." };
  record(ledger, [place]);
  return {
    ...summarise(place),
    description: place.description ? place.description.slice(0, 700) : null,
    visit_duration: place.visit_duration,
    commute: place.commute_access ? place.commute_access.slice(0, 240) : null,
    parking: place.parking_info ? place.parking_info.slice(0, 160) : null,
    faqs: place.faqs.slice(0, 3),
    hours: "not in GalaTayo data",
  };
}

function nearbyPlaces(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const places = visiblePlaces(context.places);
  const anchor = str(args.slug) ? places.find((place) => place.slug === str(args.slug)!.toLowerCase()) : null;
  const point = anchor
    ? { latitude: anchor.latitude, longitude: anchor.longitude }
    : { latitude: num(args.latitude, -90, 90), longitude: num(args.longitude, -180, 180) };
  if (point.latitude == null || point.longitude == null) return { error: "Give a GalaTayo place slug or a latitude and longitude." };
  const radius = num(args.radius_km, 0.1, 50) ?? 2;
  const category = CATEGORIES.includes(String(args.category)) ? String(args.category) : null;
  const results = places
    .filter((place) => place !== anchor && (!category || place.category === category))
    .map((place) => ({ place, km: distanceKm(point, place) }))
    .filter((entry): entry is { place: NormalizedPlace; km: number } => entry.km !== null && entry.km <= radius)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8)
    .map((entry) => entry.place);
  record(ledger, results);
  return { radius_km: radius, places: results.map((place) => summarise(place, point)) };
}

async function weather(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const places = visiblePlaces(context.places);
  const area = str(args.area);
  let point: { latitude: number; longitude: number } | null = null;
  const latitude = num(args.latitude, -90, 90);
  const longitude = num(args.longitude, -180, 180);
  if (latitude !== null && longitude !== null) point = { latitude, longitude };
  else if (area) point = centreOf(areaPlaces(places, area));
  // No area named: Metro Manila, where most outings start.
  point ??= { latitude: 14.5995, longitude: 120.9842 };
  const summary = await context.weather(point.latitude, point.longitude);
  if (!summary) return { error: "Weather is unavailable right now. Don't guess it." };
  ledger.weather = { ...summary, area: area ?? "Metro Manila" };
  return { area: area ?? "Metro Manila", temperature_c: summary.tempC, rain_likely: summary.rainLikely, summary: summary.summary };
}

function planDay(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const request = str(args.request, 400);
  if (!request) return { error: "Describe the plan." };
  const places = visiblePlaces(context.places);
  const candidates = selectCandidates(places, request, 30, request, { budgetPerHead: null, start: null });
  const draft = buildFallbackDraft(request, candidates);
  if (!draft) return { error: "Not enough GalaTayo places for a plan there yet." };
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const sunsetMinutes = getPlanSunset(context.todayIso, candidates);
  const stops = scheduleStops(draft.stops, byId, { sunsetMinutes, wantsSunset: wantsSunset(request) });
  const resolved = stops.map((stop) => ({ stop, place: byId.get(stop.place_id)! })).filter((entry) => entry.place);
  record(ledger, resolved.map((entry) => entry.place));
  ledger.plan = {
    date: context.todayIso,
    stops: resolved.map(({ stop, place }) => ({ time: /^\d{2}:\d{2}$/.test(stop.time) ? stop.time : null, slug: place.slug, note: stop.note })),
  };
  return {
    title: draft.title,
    stops: resolved.map(({ stop, place }, index) => {
      const next = resolved[index + 1]?.place;
      const km = next ? distanceKm(place, next) : null;
      return { time: stop.time || null, ...summarise(place), next_hop: km === null ? null : { km: Math.round(km * 10) / 10, mode: travelMode(km) } };
    }),
  };
}

function routeHint(args: Record<string, unknown>, context: ToolContext) {
  const places = visiblePlaces(context.places);
  const find = (value: unknown) => {
    const key = str(value)?.toLowerCase();
    return key ? places.find((place) => place.slug === key) ?? null : null;
  };
  const from = find(args.from);
  const to = find(args.to);
  if (!from || !to) return { error: "Both ends must be GalaTayo place slugs." };
  const km = distanceKm(from, to);
  if (km === null) return { error: "One of the places has no map location." };
  return { from: from.name, to: to.name, straight_line_km: Math.round(km * 10) / 10, usual_mode: travelMode(km), note: "Straight-line distance; real travel time depends on traffic." };
}

async function verifyPlace(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const place = visiblePlaces(context.places).find((entry) => entry.slug === str(args.slug)?.toLowerCase());
  if (!place) return { error: "No GalaTayo place with that slug." };
  if (!context.verify) return { error: "Verification is off." };
  const result = await context.verify(place);
  if (!result) return { error: "Couldn't check right now." };
  if (result.found) ledger.verified.set(place.slug, { title: result.title, uri: result.uri });
  record(ledger, [place]);
  return { slug: place.slug, found_on_google_maps: result.found };
}

/** Runs one tool call. Bad arguments come back as an error the model can read, never a crash. */
export async function runTool(name: string, args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger): Promise<unknown> {
  ledger.calls.push({ name, args });
  try {
    switch (name) {
      case "search_places":
        return searchPlaces(args, context, ledger);
      case "get_place":
        return getPlace(args, context, ledger);
      case "nearby_places":
        return nearbyPlaces(args, context, ledger);
      case "weather":
        return await weather(args, context, ledger);
      case "plan_day":
        return planDay(args, context, ledger);
      case "route_hint":
        return routeHint(args, context);
      case "verify_place":
        return await verifyPlace(args, context, ledger);
      default:
        return { error: `Unknown tool ${name}.` };
    }
  } catch (error) {
    return { error: `Tool failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
