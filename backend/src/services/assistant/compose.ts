import type { NormalizedPlace } from "../../domain/places";
import { isGalaWorthySlug } from "../../utils/galaWorthy";
import { allowedPrices, claimsHours, hoursBacked, pricesIn } from "./facts";
import { OFF_TOPIC_MARKER } from "./prompt";
import type { AssistantMemory, AssistantMode, Chip, ItineraryBlock, MapBlock, PlaceCard, WeatherBlock } from "./schema";
import { distanceKm, isIndoor, placePath, travelMode, type ToolLedger } from "./tools";

const MAX_CARDS = { chat: 4, map: 8 } as const;

const normalise = (value: string) => value.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");

/** Ledger places named in the text, in the order they first appear; a longer name wins over one inside it. */
export function mentionedPlaces(text: string, places: NormalizedPlace[]): NormalizedPlace[] {
  const lower = normalise(text);
  const hits = places
    .map((place) => ({ place, index: lower.indexOf(normalise(place.name)), length: place.name.length }))
    .filter((hit) => hit.index >= 0 && hit.length >= 3);
  return hits
    .filter((hit) => !hits.some((other) => other !== hit && other.index <= hit.index && other.index + other.length >= hit.index + hit.length && other.length > hit.length))
    .sort((a, b) => a.index - b.index)
    .map((hit) => hit.place);
}

function splitSentences(text: string) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z*"'(])|\n/);
}

/**
 * Makes the model's text safe to show: no off-topic marker, bold only on curated places, and no sentence
 * with a price or opening hours that our data and the user's words don't back.
 */
export function sanitizeAnswer(text: string, ledger: ToolLedger, curated: NormalizedPlace[], userText: string): string {
  let answer = text.replace(OFF_TOPIC_MARKER, "").trim();
  const known = new Set(curated.filter((place) => isGalaWorthySlug(place.slug)).map((place) => normalise(place.name)));
  answer = answer.replace(/\*\*([^*\n]{1,80})\*\*/g, (whole, name: string) => {
    const key = normalise(name.trim());
    return known.has(key) || [...known].some((entry) => key.includes(entry) && entry.length >= 5) ? whole : name;
  });
  const referenced = [...ledger.places.values(), ...mentionedPlaces(answer, curated)];
  const allowed = allowedPrices(userText, referenced);
  const lines = answer.split("\n").map((line) =>
    splitSentences(line)
      .filter((sentence) => (!claimsHours(sentence) || hoursBacked(sentence, referenced)) && pricesIn(sentence).every((value) => allowed.has(value)))
      .join(" ")
  );
  answer = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // An odd number of ** leaves bold open: drop the last one.
  if ((answer.match(/\*\*/g) ?? []).length % 2 === 1) {
    const index = answer.lastIndexOf("**");
    answer = answer.slice(0, index) + answer.slice(index + 2);
  }
  return answer;
}

export function budgetLabel(place: NormalizedPlace): string | null {
  if (place.budget_min === null) return null;
  return place.budget_min === 0 ? "Free" : `From ₱${place.budget_min.toLocaleString("en-PH")}`;
}

function shortSentence(text: string | null, max = 140) {
  if (!text) return null;
  const sentence = text.split(/(?<=[.!?])\s+/).find((part) => part.length > 30) ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** One honest line on why a place fits, only from our own data and the user's stated needs. */
export function whyLine(place: NormalizedPlace, memory: AssistantMemory, outsideArea = false): string {
  const parts: string[] = [];
  if (outsideArea && memory.area) parts.push(`Outside ${memory.area}, in ${place.city ?? place.area ?? "a nearby area"}`);
  if (memory.indoor && isIndoor(place)) parts.push("Indoor, rain-proof");
  if (memory.budgetPerHead !== null && place.budget_min !== null && place.budget_min <= memory.budgetPerHead) parts.push(`Fits ₱${memory.budgetPerHead} a head`);
  const about = shortSentence(place.description);
  if (about) parts.push(about);
  else if (place.good_for.length) parts.push(`Good for ${place.good_for.slice(0, 3).join(", ").toLowerCase()}`);
  return parts.join(" · ");
}

export function selectCards(
  text: string,
  ledger: ToolLedger,
  mode: AssistantMode,
  memory: AssistantMemory,
  imageUrl: (place: NormalizedPlace) => string | null
): PlaceCard[] {
  const pool = [...ledger.places.values()].filter((place) => isGalaWorthySlug(place.slug));
  const named = mentionedPlaces(text, pool);
  const ranked = ledger.ranked.map((slug) => ledger.places.get(slug)).filter((place): place is NormalizedPlace => Boolean(place) && pool.includes(place!));
  const planOrder = ledger.plan?.stops.map((stop) => ledger.places.get(stop.slug)).filter((place): place is NormalizedPlace => Boolean(place)) ?? [];
  let chosen: NormalizedPlace[];
  if (planOrder.length) chosen = planOrder;
  else if (named.length) chosen = mode === "map" ? [...named, ...ranked.filter((place) => !named.includes(place))] : named;
  else chosen = ranked;
  return chosen.slice(0, planOrder.length ? 8 : MAX_CARDS[mode]).map((place, index) => {
    const verified = ledger.verified.get(place.slug);
    return {
      n: index + 1,
      id: place.id,
      slug: place.slug,
      name: place.name,
      category: place.category,
      area: place.area,
      city: place.city,
      path: placePath(place),
      imageUrl: imageUrl(place),
      budgetMin: place.budget_min,
      budgetLabel: budgetLabel(place),
      why: whyLine(place, memory, Boolean(ledger.inArea && !ledger.inArea.has(place.slug))),
      latitude: place.latitude,
      longitude: place.longitude,
      goodFor: place.good_for.slice(0, 4),
      indoor: isIndoor(place),
      verified: verified ? { source: "google_maps", uri: verified.uri, title: verified.title } : null,
    };
  });
}

export function buildMap(cards: PlaceCard[]): MapBlock | null {
  const pins = cards
    .filter((card) => card.latitude !== null && card.longitude !== null)
    .map((card) => ({ n: card.n, slug: card.slug, latitude: card.latitude!, longitude: card.longitude! }));
  if (pins.length === 0) return null;
  return {
    pins,
    centre: {
      latitude: pins.reduce((sum, pin) => sum + pin.latitude, 0) / pins.length,
      longitude: pins.reduce((sum, pin) => sum + pin.longitude, 0) / pins.length,
    },
  };
}

export function buildItinerary(ledger: ToolLedger): ItineraryBlock | null {
  if (!ledger.plan || ledger.plan.stops.length === 0) return null;
  const stops = ledger.plan.stops.map((stop, index, all) => {
    const place = ledger.places.get(stop.slug)!;
    const next = all[index + 1] ? ledger.places.get(all[index + 1].slug) : null;
    const km = next ? distanceKm(place, next) : null;
    return { time: stop.time, slug: stop.slug, name: place.name, note: stop.note, travel: km === null ? null : { km: Math.round(km * 10) / 10, mode: travelMode(km) } };
  });
  return { date: ledger.plan.date, stops };
}

export function buildWeather(ledger: ToolLedger): WeatherBlock | null {
  return ledger.weather ? { area: ledger.weather.area, summary: ledger.weather.summary, rainLikely: ledger.weather.rainLikely, tempC: ledger.weather.tempC } : null;
}

/** Follow-up chips that change one thing about the last answer. */
export function buildChips({
  mode,
  memory,
  cards,
  hasItinerary,
  refused,
}: {
  mode: AssistantMode;
  memory: AssistantMemory;
  cards: PlaceCard[];
  hasItinerary: boolean;
  refused: boolean;
}): Chip[] {
  if (refused) {
    return [
      { label: "Date ideas", prompt: "Date ideas that won't break the bank", kind: "refine" },
      { label: "Food trip", prompt: "Where's good to eat today?", kind: "refine" },
    ];
  }
  if (cards.length === 0) {
    return [
      { label: "Metro Manila", prompt: "Ideas in Metro Manila", kind: "refine" },
      { label: "Day trip near Manila", prompt: "Day trip near Manila", kind: "refine" },
    ];
  }
  const chips: Chip[] = [];
  const priced = cards.filter((card) => card.budgetMin !== null && card.budgetMin > 0);
  if (priced.length > 0 && memory.budgetPerHead !== 0) chips.push({ label: "Cheaper?", prompt: "Something cheaper?", kind: "refine" });
  const first = cards[0];
  chips.push({ label: "Nearby", prompt: `What else is near ${first.name}?`, kind: "refine" });
  if (!memory.indoor) chips.push({ label: "Indoor, it's raining", prompt: "Indoor options, it's raining", kind: "refine" });
  if (!hasItinerary && cards.length >= 2) chips.push({ label: "Make it a day plan", prompt: `Turn this into a day plan${memory.area ? ` in ${memory.area}` : ""}`, kind: "plan" });
  chips.push({ label: "Add to plan", prompt: first.slug, kind: "add_to_plan" });
  if (mode === "chat" && cards.some((card) => card.latitude !== null)) chips.push({ label: "Show on map", prompt: "", kind: "map" });
  return chips.slice(0, 5);
}

/**
 * The answer when no model is reachable: honest, short, built from the tool results alone. `inArea` lists the
 * cards that are really in the asked area; the rest are titled as outside it, never "in" it.
 */
export function fallbackText(cards: PlaceCard[], memory: AssistantMemory, weather: WeatherBlock | null, inArea: Set<string> | null = null): string {
  const area = memory.area;
  const where = area ? (/^near\b/i.test(area) ? ` ${area}` : ` in ${area}`) : "";
  if (cards.length === 0) return `No GalaTayo place${where} for that yet! Want to try another area or budget?`;
  const rain = weather?.rainLikely ? ` (${weather.summary.toLowerCase()})` : "";
  const shown = cards.slice(0, 4);
  const line = (card: PlaceCard, withCity: boolean) =>
    `- **${card.name}**${withCity && card.city ? ` (${card.city})` : ""}${card.budgetLabel ? ` · ${card.budgetLabel.toLowerCase()}` : ""}`;
  const local = inArea && area ? shown.filter((card) => inArea.has(card.slug)) : shown;
  const outside = shown.filter((card) => !local.includes(card));
  if (outside.length === 0) return [`Here are great picks${where}${rain}:`, ...local.map((card) => line(card, false))].join("\n");
  if (local.length === 0) return [`Nothing${where} fits that yet. The closest picks${rain}:`, ...outside.map((card) => line(card, true))].join("\n");
  return [`Here are great picks${where}${rain}:`, ...local.map((card) => line(card, false)), `A short ride away:`, ...outside.map((card) => line(card, true))].join("\n");
}
