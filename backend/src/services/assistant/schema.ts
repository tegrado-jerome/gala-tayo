import type { ReplyLanguage } from "./language";

export type AssistantMode = "chat" | "map";
export const ASSISTANT_PROVIDERS = ["gemini", "groq", "cloudflare", "openrouter", "fallback", "cache", "mock"] as const;
export type AssistantProvider = (typeof ASSISTANT_PROVIDERS)[number];

/** What the assistant remembers within one chat session. The client keeps it and sends it back each turn. */
export type AssistantMemory = {
  area: string | null;
  budgetPerHead: number | null;
  groupSize: number | null;
  date: string | null;
  vibe: string | null;
  /** The last thing asked for ("sisig", "date with a view"), so "mas mura?" keeps the topic. */
  topic: string | null;
  indoor: boolean | null;
  lastPlaceSlugs: string[];
};

export type PlaceCard = {
  /** Pin number on the map, 1-based, in answer order. */
  n: number;
  /** Place id, for Save and Add to plan. */
  id: string;
  slug: string;
  name: string;
  category: string;
  area: string | null;
  city: string | null;
  path: string;
  imageUrl: string | null;
  budgetMin: number | null;
  budgetLabel: string | null;
  /** One honest line from our own data on why it fits. */
  why: string;
  latitude: number | null;
  longitude: number | null;
  goodFor: string[];
  indoor: boolean | null;
  verified: { source: "google_maps"; uri: string | null; title: string | null } | null;
};

export type MapBlock = {
  pins: Array<{ n: number; slug: string; latitude: number; longitude: number }>;
  centre: { latitude: number; longitude: number };
};

export type ItineraryStop = { time: string | null; slug: string; name: string; note: string; travel: { km: number; mode: string } | null };
export type ItineraryBlock = { date: string; stops: ItineraryStop[] };
export type WeatherBlock = { area: string; summary: string; rainLikely: boolean; tempC: number | null };

export type ChipKind = "refine" | "add_to_plan" | "map" | "plan";
export type Chip = { label: string; prompt: string; kind: ChipKind };

export type AssistantResponse = {
  version: 1;
  requestId: string;
  mode: AssistantMode;
  language: ReplyLanguage;
  text: string;
  refused: boolean;
  clarify: string | null;
  places: PlaceCard[];
  map: MapBlock | null;
  itinerary: ItineraryBlock | null;
  weather: WeatherBlock | null;
  chips: Chip[];
  memory: AssistantMemory;
  attribution: { google: boolean; sources: Array<{ title: string; uri: string }> } | null;
  provider: AssistantProvider;
  /** The caller's daily AI quota after this answer (added by the endpoint). */
  usage?: { allowed: boolean; usageType: string; dailyLimit: number; requestCount: number; remaining: number; resetsAt: string };
};

/** Streamed events, one JSON object per line. */
export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "places"; places: PlaceCard[]; map: MapBlock | null }
  | { type: "delta"; text: string }
  /** Drop the text streamed so far (a provider failed mid-answer and another one is answering). */
  | { type: "reset" }
  | { type: "final"; response: AssistantResponse }
  | { type: "error"; code: string; message: string; usage?: unknown };

export const EMPTY_MEMORY: AssistantMemory = { area: null, budgetPerHead: null, groupSize: null, date: null, vibe: null, topic: null, indoor: null, lastPlaceSlugs: [] };

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown) => value === null || isString(value);
const isNullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
const isCoordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value);

/** Checks a response against the contract the UI renders. Used by tests, the eval harness and the endpoint itself. */
export function validateAssistantResponse(value: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const response = value as Partial<AssistantResponse> | null;
  if (!response || typeof response !== "object") return { ok: false, errors: ["not an object"] };
  if (response.version !== 1) errors.push("version must be 1");
  if (response.mode !== "chat" && response.mode !== "map") errors.push("bad mode");
  if (response.language !== "english" && response.language !== "taglish") errors.push("bad language");
  if (!isString(response.text)) errors.push("text must be a string");
  if (typeof response.refused !== "boolean") errors.push("refused must be boolean");
  if (!Array.isArray(response.places)) errors.push("places must be an array");
  else {
    const seen = new Set<string>();
    response.places.forEach((card, index) => {
      const where = `places[${index}]`;
      if (!card || typeof card !== "object") return errors.push(`${where} not an object`);
      if (card.n !== index + 1) errors.push(`${where}.n must be ${index + 1}`);
      if (!isString(card.slug) || !card.slug) errors.push(`${where}.slug missing`);
      if (seen.has(card.slug)) errors.push(`${where} duplicate ${card.slug}`);
      seen.add(card.slug);
      if (!isString(card.name) || !card.name) errors.push(`${where}.name missing`);
      if (!isString(card.path) || !card.path.startsWith("/places/")) errors.push(`${where}.path must be a /places/ path`);
      if (!isString(card.why)) errors.push(`${where}.why missing`);
      if (!isNullableNumber(card.budgetMin)) errors.push(`${where}.budgetMin must be number|null`);
      if (!isNullableNumber(card.latitude) || !isNullableNumber(card.longitude)) errors.push(`${where} bad coordinates`);
      if (!isNullableString(card.imageUrl)) errors.push(`${where}.imageUrl must be string|null`);
    });
  }
  if (response.map !== null && response.map !== undefined) {
    if (!Array.isArray(response.map.pins) || response.map.pins.length === 0) errors.push("map.pins must be a non-empty array");
    else
      response.map.pins.forEach((pin, index) => {
        if (!isCoordinate(pin.latitude) || !isCoordinate(pin.longitude)) errors.push(`map.pins[${index}] bad coordinates`);
        if (!response.places?.some((card) => card.slug === pin.slug && card.n === pin.n)) errors.push(`map.pins[${index}] has no matching card`);
      });
  } else if (response.map !== null) errors.push("map must be an object or null");
  if (response.itinerary) {
    if (!Array.isArray(response.itinerary.stops) || response.itinerary.stops.length === 0) errors.push("itinerary.stops must be non-empty");
    else
      response.itinerary.stops.forEach((stop, index) => {
        if (stop.time !== null && !/^\d{2}:\d{2}$/.test(String(stop.time))) errors.push(`itinerary.stops[${index}].time must be HH:MM`);
        if (!isString(stop.slug)) errors.push(`itinerary.stops[${index}].slug missing`);
      });
  }
  if (!Array.isArray(response.chips)) errors.push("chips must be an array");
  else response.chips.forEach((chip, index) => {
    if (!isString(chip.label) || !chip.label || !isString(chip.prompt)) errors.push(`chips[${index}] needs label and prompt`);
  });
  if (!response.memory || typeof response.memory !== "object" || !Array.isArray(response.memory.lastPlaceSlugs)) errors.push("memory missing");
  if (!(ASSISTANT_PROVIDERS as readonly string[]).includes(String(response.provider))) errors.push("bad provider");
  return { ok: errors.length === 0, errors };
}
