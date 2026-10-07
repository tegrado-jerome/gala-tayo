import type { NormalizedPlace } from "../../domain/places";
import { detectLocationIntent, hasLocation, parseBudgetPerHead, parseGroupSize, resolvePromptDate } from "../galaPlanDraftPlanner";
import { inferProvincialDestinationsFromQuery } from "../../utils/phDestinations";
import { EMPTY_MEMORY, type AssistantMemory } from "./schema";
import { queryTokens } from "./tools";

const CHEAP_WORDS = /\b(mura|murang|cheap|budget|tipid|hindi mahal|di mahal|affordable|sulit|walang gastos)\b/i;
const FREE_WORDS = /\b(free|libreng?|walang bayad)\b/i;
const CHEAPER_WORDS = /\b(mas mura|cheaper|less expensive|mas tipid|mas sulit|lower budget)\b/i;
const CHEAP_PER_HEAD = 500;
const INDOOR_WORDS = /\b(indoor|indoors|aircon|umuulan|maulan|ulan|rain|raining|rainy|bagyo|storm|typhoon|loob)\b/i;
const OUTDOOR_WORDS = /\b(outdoor|outdoors|open air|labas|nature|hike|beach)\b/i;

const VIBES: Array<[string, RegExp]> = [
  ["date", /\b(date|jowa|partner|anniversary|monthsary|romantic|couple)\b/i],
  ["family", /\b(family|pamilya|kids|anak|bata|parents|lola|lolo)\b/i],
  ["barkada", /\b(barkada|tropa|friends|group|kaibigan|squad)\b/i],
  ["solo", /\b(solo|alone|mag-isa|me time|study)\b/i],
  ["tourist", /\b(first time|tourist|visiting|foreigner|balikbayan)\b/i],
];

function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

/** A short name for the area the text names ("BGC", "Quezon City", "Coron"), or null. */
export function areaLabel(places: NormalizedPlace[], text: string): string | null {
  const intent = detectLocationIntent(places, text);
  if (intent.nearManila && !hasLocation(intent)) return "near Manila";
  if (!hasLocation(intent)) return null;
  const alias = [...(intent.areaWords ?? [])][0];
  if (alias) return alias.length <= 3 ? alias.toUpperCase() : titleCase(alias);
  // "Waterfalls in Cebu" is the whole province, not Cebu City.
  const province = [...(intent.provinces ?? [])][0];
  if (province && intent.cities.size === 0) return province;
  const provincial = inferProvincialDestinationsFromQuery(text)[0]?.destination.label;
  const city = [...intent.cities][0];
  return city ? titleCase(city) : provincial ?? null;
}

/**
 * Updates session memory from the latest message. Only what the user said changes it: a new area
 * replaces the old one, "mas mura?" lowers the budget, "umuulan" turns on indoor.
 */
export function updateMemory(
  previous: AssistantMemory | null | undefined,
  message: string,
  places: NormalizedPlace[],
  todayIso: string
): AssistantMemory {
  const memory: AssistantMemory = { ...EMPTY_MEMORY, ...(previous ?? {}), lastPlaceSlugs: previous?.lastPlaceSlugs ?? [] };
  const area = areaLabel(places, message);
  if (area) memory.area = area;

  const groupSize = parseGroupSize(message);
  if (groupSize) memory.groupSize = groupSize;

  const stated = parseBudgetPerHead(message, groupSize ?? memory.groupSize);
  // "Libreng gala, budget ₱300 each" asks for free places; the amount is only spending money.
  if (FREE_WORDS.test(message)) memory.budgetPerHead = 0;
  else if (stated !== null) memory.budgetPerHead = stated;
  else if (CHEAPER_WORDS.test(message)) {
    // "Cheaper" means below what was shown: under the earlier cap, or under the earlier picks' prices.
    const shown = memory.lastPlaceSlugs
      .map((slug) => places.find((place) => place.slug === slug)?.budget_min)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const reference = memory.budgetPerHead ?? (shown.length ? Math.min(...shown) : null);
    memory.budgetPerHead = reference ? Math.max(0, Math.floor((reference * 0.7) / 50) * 50) : CHEAP_PER_HEAD;
  } else if (CHEAP_WORDS.test(message) && memory.budgetPerHead === null) memory.budgetPerHead = CHEAP_PER_HEAD;

  const date = resolvePromptDate(message, todayIso);
  if (date) memory.date = date;

  if (INDOOR_WORDS.test(message)) memory.indoor = true;
  else if (OUTDOOR_WORDS.test(message)) memory.indoor = false;

  const vibe = VIBES.find(([, pattern]) => pattern.test(message))?.[0];
  if (vibe) memory.vibe = vibe;
  // A message that names something to find replaces the topic; a pure refinement ("mas mura?", "indoor na lang") keeps it.
  const withoutArea = area ? message.toLowerCase().split(area.toLowerCase()).join(" ") : message;
  if (queryTokens(withoutArea).length > 0) memory.topic = message.trim().slice(0, 80);
  return memory;
}

/** Normalises memory sent by the client: it's user-controlled, so every field is checked. */
export function parseClientMemory(value: unknown): AssistantMemory {
  if (!value || typeof value !== "object") return { ...EMPTY_MEMORY };
  const raw = value as Record<string, unknown>;
  const text = (input: unknown, max = 60) => (typeof input === "string" && input.trim() ? input.trim().slice(0, max) : null);
  const number = (input: unknown, max: number) => (typeof input === "number" && Number.isFinite(input) && input >= 0 && input <= max ? Math.round(input) : null);
  return {
    area: text(raw.area),
    budgetPerHead: number(raw.budgetPerHead, 200000),
    groupSize: number(raw.groupSize, 50),
    date: typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    vibe: text(raw.vibe, 20),
    topic: text(raw.topic, 80),
    indoor: typeof raw.indoor === "boolean" ? raw.indoor : null,
    lastPlaceSlugs: Array.isArray(raw.lastPlaceSlugs)
      ? raw.lastPlaceSlugs.filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9-]{1,120}$/.test(slug)).slice(0, 10)
      : [],
  };
}
