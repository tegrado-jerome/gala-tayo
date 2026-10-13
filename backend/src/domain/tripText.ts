// Reads a pasted itinerary ("Day 1: El Nido tour A, Nacpan Beach / Day 2: ...") into days and stops for
// Trip Check, plus the group size, budget and start date when the text names them. Place names go through
// the search code's reading (nicknames and typos), and a stop only counts when it names one place.
import type { NormalizedPlace } from "./places";
import { isLocationQuery, normalizeSearchText, rankPlaces, readQueryText } from "./placeSearch";

export type TripLine = { day: number; text: string };
export type TripBudget = { amount: number; per: "person" | "group" };
export type ParsedTrip = { lines: TripLine[]; groupSize: number | null; budget: TripBudget | null; startDate: string | null };
export type TripMatch = { day: number; text: string; place: NormalizedPlace };

const MAX_DAYS = 30;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const MONTH_FIRST = new RegExp(String.raw`\b${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*[-–]\s*\d{1,2})?(?:,?\s+(20\d{2}))?`, "i");
const DAY_FIRST = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}(?:,?\s+(20\d{2}))?`, "i");
const ISO_DATE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;
const DAY_PREFIX = /^\s*(?:day|araw|d)\s*(\d{1,2})\b(?:\s*[-–]\s*\d{1,2})?\s*[:.)\-–]?\s*/i;
const AMOUNT = String.raw`(?:₱|php|p)?\s?(\d+(?:[.,]\d+)*)\s?(k)?`;
const RANGE = String.raw`${AMOUNT}(?:\s*(?:-|–|to)\s*${AMOUNT})?`;
const BUDGET_BEFORE = new RegExp(String.raw`\b(?:budget|badyet)\b[^\d₱]{0,15}${RANGE}`, "i");
const BUDGET_AFTER = new RegExp(String.raw`${RANGE}(\s*(?:\/|per|each|a)\s*(?:pax|person|head|tao))?\s*(?:total\s+)?(?:budget|badyet)\b`, "i");
const PER_PERSON = /^\s*(?:\/\s*|per\s+|a\s+|each\s*)?(?:pax|person|head|tao|pp|each)\b/i;
const GROUP_SIZE = /\b(\d{1,2})\s*(?:pax|people|persons|tao|adults|friends|of us)\b|\b(?:group|barkada) of (\d{1,2})\b/i;
const CHUNK_SPLIT = /[,;|•\n]|\s[-–—>]+\s|->|→|\+|\/|\bthen\b|\btapos\b/i;
const DATES = new RegExp([ISO_DATE, MONTH_FIRST, DAY_FIRST].map((pattern) => pattern.source).join("|"), "gi");
const META = /\b(budget|badyet|pax|people|persons|adults|itinerary)\b/i;
const TIME = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi;

function toAmount(digits: string | undefined, thousands: string | undefined): number | null {
  if (!digits) return null;
  const value = Number(thousands ? digits.replace(/,/g, "") : digits.replace(/[.,](?=\d{3}\b)/g, ""));
  if (!Number.isFinite(value)) return null;
  return Math.round(thousands ? value * 1000 : value);
}

/** "budget 10-15k for 4 pax" -> ₱15,000 for the group (the top of a range); "₱3,000 per pax" -> per person. */
export function readBudget(text: string): TripBudget | null {
  for (const pattern of [BUDGET_BEFORE, BUDGET_AFTER]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const low = toAmount(match[1], match[2] ?? match[4]);
    const high = toAmount(match[3], match[4]);
    const amount = Math.max(low ?? 0, high ?? 0);
    if (amount < 100) continue;
    const after = text.slice(match.index + match[0].length);
    return { amount, per: match[5] || PER_PERSON.test(after) ? "person" : "group" };
  }
  return null;
}

export function readGroupSize(text: string): number | null {
  const match = GROUP_SIZE.exec(text);
  const size = Number(match?.[1] ?? match?.[2] ?? 0);
  return size >= 1 && size <= 30 ? size : null;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/** The first date in a line ("Dec 27", "27 December 2026", "2026-12-27"); a date with no year is the next one from today. */
export function readDate(text: string, today: Date): Date | null {
  const isoMatch = ISO_DATE.exec(text);
  if (isoMatch) return validDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const monthFirst = MONTH_FIRST.exec(text);
  const dayFirst = DAY_FIRST.exec(text);
  const [month, day, year] = monthFirst
    ? [monthFirst[1], Number(monthFirst[2]), monthFirst[3]]
    : dayFirst
      ? [dayFirst[2], Number(dayFirst[1]), dayFirst[3]]
      : [null, 0, undefined];
  if (!month) return null;
  const monthNumber = MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  if (year) return validDate(Number(year), monthNumber, day);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const thisYear = validDate(today.getUTCFullYear(), monthNumber, day);
  return thisYear && thisYear.getTime() >= startOfToday ? thisYear : validDate(today.getUTCFullYear() + 1, monthNumber, day);
}

/** Days and their lines, and the trip's group size, budget and start date. */
export function parseTripText(text: string, today = new Date()): ParsedTrip {
  const lines: TripLine[] = [];
  let day = 1;
  let startDate: string | null = null;
  // "Day 1: ... Day 2: ..." on one line still starts a new day.
  for (const raw of text.replace(/\s*\b(day|araw)\s*(\d{1,2})\b/gi, "\n$1 $2").split("\n")) {
    const prefix = DAY_PREFIX.exec(raw);
    if (prefix) day = Math.min(MAX_DAYS, Math.max(1, Number(prefix[1])));
    const body = prefix ? raw.slice(prefix[0].length) : raw;
    const date = startDate ? null : readDate(raw, today);
    if (date) startDate = iso(new Date(date.getTime() - (day - 1) * 86_400_000));
    if (body.trim()) lines.push({ day, text: body.trim() });
  }
  return { lines, groupSize: readGroupSize(text), budget: readBudget(text), startDate };
}

type NameVariant = { phrase: string; place: NormalizedPlace };
const variantCache = new WeakMap<NormalizedPlace[], NameVariant[]>();

// Names short enough to be everyday words ("Aya", "Hapag") only match when a chunk is the name itself.
const isDistinctive = (phrase: string) => phrase.includes(" ") || phrase.length >= 6;

/** Each place's name without its parenthesis, and the multi-word sights the parenthesis lists ("Big Lagoon"). */
function nameVariants(places: NormalizedPlace[]): NameVariant[] {
  const cached = variantCache.get(places);
  if (cached) return cached;
  const variants = places
    .filter((place) => place.status === "active")
    .flatMap((place) => {
      const inside = [...place.name.matchAll(/\(([^)]*)\)/g)].flatMap((match) => match[1].split(/,|\band\b/));
      const phrases = [normalizeSearchText(place.name.replace(/\([^)]*\)/g, " ")), ...inside.map((part) => normalizeSearchText(part)).filter((part) => part.includes(" "))];
      return [...new Set(phrases)].filter(isDistinctive).map((phrase) => ({ phrase, place }));
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);
  variantCache.set(places, variants);
  return variants;
}

// The name only, not the slug: slugs end in the town ("...-palawan"), so a town would match a place.
const nameHolds = (place: NormalizedPlace, phrase: string) => ` ${normalizeSearchText(place.name)} `.includes(` ${phrase} `);

/** One place from several: the one whose town the trip names, else none (ambiguous). */
function pickOne(candidates: NormalizedPlace[], tripText: string): NormalizedPlace | null {
  const unique = [...new Map(candidates.map((place) => [place.slug, place])).values()];
  if (unique.length <= 1) return unique[0] ?? null;
  const named = unique.filter((place) => [place.city, place.area].some((town) => town && ` ${tripText} `.includes(` ${normalizeSearchText(town)} `)));
  return named.length === 1 ? named[0] : null;
}

/** The places one chunk of an itinerary names: every name written out in it, else one search match by name. */
export function matchChunk(chunk: string, places: NormalizedPlace[], tripText = ""): NormalizedPlace[] {
  const text = ` ${readQueryText(chunk, places)} `;
  if (!text.trim()) return [];
  // Longest names first, each blanked out once found so "Twin Lagoon" can't also match a shorter "Lagoon" name.
  let rest = text;
  const found: Array<{ place: NormalizedPlace; at: number }> = [];
  for (const { phrase } of nameVariants(places)) {
    if (!rest.includes(` ${phrase} `)) continue;
    const place = pickOne(nameVariants(places).filter((variant) => variant.phrase === phrase).map((variant) => variant.place), tripText);
    if (place && !found.some((entry) => entry.place === place)) found.push({ place, at: text.indexOf(` ${phrase} `) });
    rest = rest.split(` ${phrase} `).join(" | ");
  }
  if (found.length > 0) return found.sort((a, b) => a.at - b.at).map((entry) => entry.place);

  const query = text.trim();
  const townWords = townWordsOf(places);
  const isTown = (phrase: string) => isLocationQuery(phrase) || phrase.split(" ").every((word) => townWords.has(word));
  if (!query.split(" ").some((word) => word.length >= 4) || isTown(query)) return [];
  const named = pickOne(
    rankPlaces(places, query)
      .filter(({ place, score }) => score >= 1000 || nameHolds(place, query))
      .map(({ place }) => place),
    tripText,
  );
  if (named) return [named];

  // Part of a name among other words ("Mt Tapyas sunset"): the longest run of words that sits in exactly one name.
  const words = query.split(" ");
  const active = places.filter((place) => place.status === "active");
  for (let size = words.length - 1; size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      const run = words.slice(start, start + size).join(" ");
      if ((size === 1 && (run.length < 5 || GENERIC_WORDS.has(run))) || isTown(run)) continue;
      const place = pickOne(active.filter((candidate) => nameHolds(candidate, run)), tripText);
      if (place) return [place];
    }
  }
  return [];
}

// Words in many names, or that name a kind of stop rather than one place.
const GENERIC_WORDS = new Set(
  "beach beaches falls lake island islands lagoon river spring springs church park museum mount mountain hill hills tour trip market sunset sunrise view deck cafe coffee food resort hotel cove cave caves rock rocks pool pools garden farm town city street night lunch dinner breakfast hopping island-hopping shrine heritage village bridge plaza tower peak trail reef sandbar point bay secret hidden small big little white blue green twin grand old new".split(" "),
);
const townWordCache = new WeakMap<NormalizedPlace[], Set<string>>();
function townWordsOf(places: NormalizedPlace[]): Set<string> {
  let words = townWordCache.get(places);
  if (!words) {
    words = new Set(places.flatMap((place) => normalizeSearchText(`${place.city ?? ""} ${place.area ?? ""}`).split(" ").filter(Boolean)));
    townWordCache.set(places, words);
  }
  return words;
}

/** Every stop the itinerary names, in order, and the chunks that named no GalaTayo place. */
export function matchTripStops(parsed: ParsedTrip, places: NormalizedPlace[]) {
  const tripText = normalizeSearchText(parsed.lines.map((line) => line.text).join(" "));
  const stops: TripMatch[] = [];
  const unmatched: TripLine[] = [];
  for (const line of parsed.lines) {
    for (const raw of line.text.split(CHUNK_SPLIT)) {
      const chunk = raw.replace(DATES, " ").replace(TIME, " ").replace(/^[\s*•·()-]+|[\s():]+$/g, "").trim();
      if (!/[a-z]{3}/i.test(chunk)) continue;
      const matches = matchChunk(chunk, places, tripText);
      if (matches.length === 0 && !META.test(chunk)) unmatched.push({ day: line.day, text: chunk });
      for (const place of matches) {
        if (!stops.some((stop) => stop.day === line.day && stop.place.slug === place.slug)) stops.push({ day: line.day, text: chunk, place });
      }
    }
  }
  return { stops, unmatched };
}
