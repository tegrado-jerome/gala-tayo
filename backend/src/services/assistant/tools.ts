import type { NormalizedPlace } from "../../domain/places";
import { isGalaWorthySlug } from "../../utils/galaWorthy";
import { resolveAreaSlug } from "../../utils/seoPlaces";
import {
  buildFallbackDraft,
  detectLocationIntent,
  getPlanSunset,
  hasLocation,
  matchesLocation,
  placesForArea,
  scheduleStops,
  selectCandidates,
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
};

export function newLedger(): ToolLedger {
  return { places: new Map(), ranked: [], weather: null, plan: null, verified: new Map(), calls: [] };
}

const CATEGORIES = ["Activity", "Cafe", "Cinema", "Food", "Heritage", "Hotel", "Mall", "Museum", "Nightlife", "Park"];
const INDOOR_CATEGORIES = new Set(["Cafe", "Cinema", "Food", "Hotel", "Mall", "Museum", "Nightlife"]);
const OUTDOOR_CATEGORIES = new Set(["Park"]);

/** Whether a place works in the rain: our own "Rainy Day" tag first, then the category. Null when unsure. */
export function isIndoor(place: NormalizedPlace): boolean | null {
  if (place.good_for.some((tag) => /rainy day|indoor/i.test(tag)) || place.tags.some((tag) => /indoor|aircon/i.test(tag))) return true;
  if (INDOOR_CATEGORIES.has(place.category)) return true;
  if (OUTDOOR_CATEGORIES.has(place.category) || /beach|island|falls|lagoon|hike|trail|terraces|peak|mount/i.test(`${place.name} ${place.tags.join(" ")}`)) return false;
  return null;
}

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

function centre(places: NormalizedPlace[]) {
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

/** How strongly a place matches the words of the query: its name counts most, then tags, then its description. */
export function keywordScore(place: NormalizedPlace, tokens: string[]) {
  if (tokens.length === 0) return 0;
  const name = place.name.toLowerCase();
  const tags = [...place.search_terms, ...place.tags, ...place.good_for, place.category].join(" ").toLowerCase();
  const about = (place.description ?? "").toLowerCase();
  return tokens.reduce((score, token) => score + (name.includes(token) ? 3 : tags.includes(token) ? 2 : about.includes(token) ? 1 : 0), 0);
}

function searchPlaces(args: Record<string, unknown>, context: ToolContext, ledger: ToolLedger) {
  const query = str(args.query) ?? "";
  const area = str(args.area);
  const vibe = str(args.vibe, 40);
  const category = CATEGORIES.includes(String(args.category)) ? String(args.category) : null;
  const budget = num(args.budget_max, 0, 200000);
  const indoor = bool(args.indoor);
  const places = visiblePlaces(context.places);
  const locationText = area ?? query;
  const intent = detectLocationIntent(places, locationText);
  const named = hasLocation(intent);
  const text = [query, vibe, category, indoor ? "indoor rainy day" : null].filter(Boolean).join(" ");
  // With a budget, only places whose price we know count: "unknown" must not pass as cheap.
  const withinBudget = (place: NormalizedPlace) => budget === null || (place.budget_min !== null && place.budget_min <= budget);
  const fits = (place: NormalizedPlace) =>
    (!category || place.category === category) &&
    (!indoor || isIndoor(place) !== false) &&
    withinBudget(place);

  let ranked = selectCandidates(places, text, 60, locationText, { budgetPerHead: budget, start: null });
  if (category && ranked.some((place) => place.category === category)) ranked = ranked.filter((place) => place.category === category);
  ranked = ranked.filter((place) => (!indoor || isIndoor(place) !== false) && withinBudget(place));

  // A dish or thing named in the query ("sisig", "lagoon") beats generic ranking. With no area named, a strong
  // match anywhere counts (the best sisig is in Angeles); with an area, only matches in or near it.
  const tokens = queryTokens(query);
  // "Beach near Manila" is a day trip: within a few hours' drive, closest first.
  const fromManila = (place: NormalizedPlace) => distanceKm(MANILA, place) ?? 9999;
  const pool = named ? ranked : intent.nearManila ? places.filter((place) => fits(place) && fromManila(place) <= NEAR_MANILA_KM) : places.filter(fits);
  const matches = pool
    .map((place) => ({ place, score: keywordScore(place, tokens) }))
    .filter((entry) => entry.score >= 2 || (entry.score >= 1 && tokens.length === 1))
    .sort((a, b) => b.score - a.score || (named ? 0 : fromManila(a.place) - fromManila(b.place)))
    .map((entry) => entry.place);
  // In the named area first, then the nearby ones placesForArea lent (food a short ride away).
  const inArea = (place: NormalizedPlace) => !named || matchesLocation(place, intent);
  const ordered = [...matches, ...ranked.filter((place) => !matches.includes(place))];
  const results = [...ordered.filter(inArea), ...ordered.filter((place) => !inArea(place))].slice(0, 8);
  record(ledger, results);

  const covered = !named || placesForArea(places, intent).length > 0;
  const notes = [
    !covered ? `GalaTayo has no places in ${area} yet. Say so; do not name venues there.` : null,
    covered && results.length === 0 ? "No GalaTayo place fits all of that. Say so and suggest loosening one filter." : null,
    tokens.length > 0 && matches.length === 0 && results.length > 0
      ? `No GalaTayo place mentions "${tokens.join(" ")}". Say GalaTayo doesn't list one yet, then offer these as alternatives.`
      : null,
    args.open_now === true ? "Opening hours are not in GalaTayo data: do not say a place is open now." : null,
  ].filter(Boolean);
  return {
    area_covered: covered,
    ...(notes.length ? { note: notes.join(" ") } : {}),
    places: results.map((place) => ({ ...summarise(place), ...(named ? { in_area: inArea(place) } : {}), matches_query: matches.includes(place) })),
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
  else if (area) point = centre(areaPlaces(places, area));
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
