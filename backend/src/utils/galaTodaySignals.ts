// Pure helpers that turn free public signals (Google Trends, Google News, Reddit, Google
// Autocomplete, Open-Meteo) into today's topic for "Gala Today". No network here, so the
// scoring and wording rules are unit-tested.

export type TrendSignal = {
  title: string;
  source: string;
  url: string | null;
  /** Google Trends traffic estimate when known (e.g. 2000 for "2,000+"). */
  traffic: number;
};

/** Why a trend is about going out: it names one of our places (or a destination plus an outing word), a festival, or a season/occasion. */
export type TrendKind = "place" | "festival" | "season";

export type ScoredTrend = TrendSignal & {
  /** How many searches back it: traffic, other sources and autocomplete presence. */
  demand: number;
  kind: TrendKind | null;
  /** The demand of a going-out trend; 0 for any other trend. */
  score: number;
  /** The phrasing people actually search (from autocomplete), used in the title and slug. */
  query: string;
};

/** Today's topic: a real going-out trend, or an evergreen angle (rainy day, weekend, date ideas…) when no trend fits. */
export type TodayTopic = { kind: "trend"; trend: ScoredTrend } | { kind: "evergreen"; query: string; note?: string };

// Trends we never joke about or tie to a day out: tragedy, crime, politics, scandal, health scares.
const UNSAFE_WORDS = [
  "died", "dies", "dead", "death", "patay", "namatay", "pumanaw", "killed", "kill", "murder~", "slain", "shot", "shooting",
  "stabbed", "rape", "abuse~", "harass~", "assault", "suicide", "missing", "kidnap~", "hostage", "arrest~", "jail",
  "convicted", "charged", "probe", "investigat~", "scam", "fraud", "fake news", "fact check", "factcheck", "hoax", "drugs", "shabu",
  "accident~", "crash", "collision", "fire", "sunog", "explosion", "exploded", "earthquake", "lindol", "flood victims", "evacuat~",
  "casualt~", "injured", "war", "attack", "terror~", "bomb", "impeach~", "senate", "senator", "solon", "congress", "election~", "president",
  "vice president", "duterte", "marcos", "rally", "protest~", "scandal~", "controversy", "cheating", "affair", "breakup",
  "hiv", "outbreak", "virus", "dengue", "covid", "lawsuit", "court", "sued", "ban", "banned", "child abuse", "minor",
  "lost ability", "cancer", "hospital~", "funeral", "wake", "typhoon", "bagyo", "storm signal", "landslide", "flood~", "baha",
  // Adult spam: Google Trends PH surfaced "pinay 1v5 viral video" with an "xxx" page as its news link (Oct 2026).
  "sex", "sexy", "xxx", "porn~", "nude~", "nsfw", "onlyfans", "leak~", "viral video~", "scandal video~", "kantot~", "iyot", "jakol",
];
// Everyday words in travel copy ("fully charged power bank", "fire dancers", "the sky is leaking") that only mean
// crime or tragedy in a headline. Post text skips them; trends still don't.
const POST_EVERYDAY_WORDS = new Set(["charged", "shot", "fire", "wake", "minor", "court", "missing", "ban", "attack", "leak~"]);

// Whole words only ("war" must not match "warm"); a trailing "~" marks a stem ("evacuat~" matches "evacuation").
export function hasWord(text: string, word: string) {
  const isStem = word.endsWith("~");
  const escaped = word.replace(/~$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}${isStem ? "" : "\\b"}`, "i").test(text);
}

export function isSafeTrend(title: string): boolean {
  const lower = ` ${title.toLowerCase()} `;
  return title.trim().length >= 3 && !UNSAFE_WORDS.some((word) => hasWord(lower, word));
}

/** The same check for a written post, minus words that are everyday in travel copy. */
export function isSafePostText(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return !UNSAFE_WORDS.some((word) => !POST_EVERYDAY_WORDS.has(word) && hasWord(lower, word));
}

// Only news links go on the page; other trend URLs are whatever a Trends item cites, and one was adult spam.
const TRUSTED_LINK_HOSTS = /(^|\.)(news\.google\.com|reddit\.com)$/;

/** The trend's link when it is a trusted news or Reddit page, else null. */
export function trustedTrendUrl(url: string | null): string | null {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && TRUSTED_LINK_HOSTS.test(parsed.hostname) ? parsed.href : null;
  } catch {
    return null;
  }
}

const decode = (value: string) =>
  value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const tag = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]) : "";
};

/** Google Trends "trending now" RSS for the Philippines. */
export function parseGoogleTrendsRss(xml: string): TrendSignal[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: tag(item, "title"),
    source: tag(item, "ht:news_item_source") || "Google Trends PH",
    url: tag(item, "ht:news_item_url") || null,
    traffic: Number(tag(item, "ht:approx_traffic").replace(/\D/g, "")) || 0,
  }));
}

/** Google News or Reddit RSS/Atom items. Google News titles end in " - Publisher". */
export function parseNewsRss(xml: string, fallbackSource: string): TrendSignal[] {
  const items = [...xml.matchAll(/<(item|entry)>([\s\S]*?)<\/\1>/g)].map(([, , item]) => item);
  return items.map((item) => {
    const rawTitle = tag(item, "title");
    const publisher = rawTitle.match(/ - ([^-]+)$/)?.[1]?.trim();
    const link = tag(item, "link") || item.match(/<link[^>]*href="([^"]+)"/)?.[1] || null;
    return { title: publisher ? rawTitle.slice(0, -(publisher.length + 3)).trim() : rawTitle, source: publisher || fallbackSource, url: link, traffic: 0 };
  });
}

/** Google Autocomplete (client=firefox) JSON: ["query", ["suggestion", ...], ...]. */
export function parseAutocomplete(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    const list = Array.isArray(parsed) ? parsed[1] : null;
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()) : [];
  } catch {
    return [];
  }
}

export const normalizeTopic = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Safe, de-duplicated signals; one per topic, keeping the strongest and counting how many sources had it. */
export function pickSignals(signals: TrendSignal[], limit = 12): Array<TrendSignal & { sources: number }> {
  const byKey = new Map<string, TrendSignal & { sources: number }>();
  for (const signal of signals) {
    if (!isSafeTrend(signal.title) || /^\[(hub|megathread)/i.test(signal.title)) continue;
    const key = normalizeTopic(signal.title);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { ...signal, sources: 1 });
    else byKey.set(key, { ...(signal.traffic > existing.traffic ? signal : existing), sources: existing.sources + 1 });
  }
  return [...byKey.values()].sort((left, right) => right.traffic - left.traffic || right.sources - left.sources).slice(0, limit);
}

// Words that make a trend about going out. Other news (sports, celebrities, viral clips, weather alerts) is never
// forced into a post: the editor rightly scored those 2-3/10 (Oct 2026 logs: "cat whisperer in Dubai").
const FESTIVAL_WORDS = [
  "festival", "fiesta", "masskara", "panagbenga", "sinulog", "ati atihan", "dinagyang", "kadayawan", "pahiyas", "higantes",
  "fireworks", "night market", "lantern~", "light show", "christmas village", "christmas lights",
];
const SEASON_WORDS = [
  "long weekend", "christmas", "pasko", "new year", "halloween", "valentine~", "summer", "rainy season", "ber months",
  "sembreak", "semestral break", "school break", "christmas break", "payday", "sweldo", "date night", "staycation",
  "road trip", "weekend getaway", "seat sale", "piso fare",
];
// With a destination name these turn place news into an outing ("Baguio strawberry farm", "Cebu beaches").
const OUTING_WORDS = [
  "beach~", "island~", "falls", "hike", "hiking", "trail~", "sunset", "travel", "trip", "tour", "tourist~", "itinerary",
  "food", "food trip", "food crawl", "cafe~", "restaurant~", "museum~", "park", "view~", "resort~", "lake", "river",
  "cave~", "mountain~", "farm~", "garden~", "reopen~", "things to do", "where to go", "spots",
];

const hasAny = (text: string, words: string[]) => words.some((word) => hasWord(text, word));

/** Why a trend links to going out, or null when it doesn't. The flags say whether it names one of our places or a PH destination. */
export function trendKind(title: string, namesOurPlace = false, namesDestination = false): TrendKind | null {
  const text = ` ${normalizeTopic(title)} `;
  if (namesOurPlace || (namesDestination && hasAny(text, OUTING_WORDS))) return "place";
  if (hasAny(text, FESTIVAL_WORDS)) return "festival";
  if (hasAny(text, SEASON_WORDS)) return "season";
  return null;
}

const INTENT_WORDS = /\b(near me|where to|where can|manila|philippines|ph|price|menu|tickets?|venue|schedule|branch(es)?|recipe|location)\b/;
const JUNK_SUGGESTION = /\b(reddit|wiki|wikipedia|quora|pdf|meaning|in english|tagalog|lyrics|apk|download|mod|login|holy week|lent)\b/;

/** The phrasing people search for a trend: an autocomplete suggestion with going-out intent, else the plain trend. */
export function bestPhrasing(title: string, suggestions: string[]): string {
  const base = normalizeTopic(title);
  const related = suggestions.filter((item) => normalizeTopic(item).includes(base) && !JUNK_SUGGESTION.test(item) && isSafeTrend(item));
  return related.find((item) => INTENT_WORDS.test(item)) ?? base;
}

export type TrendPlaceCheck = { namesOurPlace: (title: string) => boolean; namesDestination: (title: string) => boolean };

/**
 * Demand-scores each trend: Google Trends traffic (log scale), extra sources and autocomplete presence. A trend that
 * doesn't link to going out scores 0. Strongest first.
 */
export function scoreTrends(
  signals: Array<TrendSignal & { sources?: number }>,
  autocomplete: Map<string, string[]>,
  places: TrendPlaceCheck = { namesOurPlace: () => false, namesDestination: () => false }
): ScoredTrend[] {
  return signals
    .map((signal) => {
      const suggestions = autocomplete.get(normalizeTopic(signal.title)) ?? [];
      const searched = suggestions.some((item) => normalizeTopic(item).startsWith(normalizeTopic(signal.title)));
      const demand = round((signal.traffic > 0 ? Math.log10(signal.traffic) : 1.5) + ((signal.sources ?? 1) - 1) * 0.5 + (searched ? 1 : 0));
      const kind = trendKind(signal.title, places.namesOurPlace(signal.title), places.namesDestination(signal.title));
      return { title: signal.title, source: signal.source, url: signal.url, traffic: signal.traffic, demand, kind, score: kind ? demand : 0, query: bestPhrasing(signal.title, suggestions) };
    })
    .sort((left, right) => right.score - left.score);
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Going-out trends with real demand that weren't used recently, strongest first (the caller checks each has places). */
export function usableTrends(scored: ScoredTrend[], usedTitles: Set<string> = new Set(), minScore = 1.5): ScoredTrend[] {
  return scored.filter((trend) => trend.kind !== null && trend.score >= minScore && !usedTitles.has(normalizeTopic(trend.title)));
}

export type AnglePlace = { category: string | null; goodFor: string[]; description: string | null };
export type Angle = { id: string; query: string; note: string; fits: (place: AnglePlace) => boolean };

const tagged = (pattern: RegExp) => (place: AnglePlace) => place.goodFor.some((tag) => pattern.test(tag));
const INDOOR_CATEGORIES = new Set(["Museum", "Food", "Cafe", "Mall", "Nightlife"]);
export const worksInRain = (place: AnglePlace) => INDOOR_CATEGORIES.has(place.category ?? "") || tagged(/rainy|indoor/i)(place);
const OCCASIONS = new Set(["rainy", "holiday", "payday", "date", "weekend"]);

/** Searches people really make, for days without a going-out trend: the day's occasion first, then evergreen ones. */
export function evergreenAngles(area: string, day: string, rainy: boolean): Angle[] {
  const anyPlace = () => true;
  const occasions: Angle[] = [];
  if (rainy) occasions.push({ id: "rainy", query: `rainy day activities in ${area}`, note: "Rain is likely today, so this is a rainy-day plan: every pick is indoors or works in the rain.", fits: worksInRain });
  if (day.startsWith("Holiday: ")) occasions.push({ id: "holiday", query: `things to do in ${area} this holiday`, note: `Today is a public holiday (${day.slice(9)}): a plan for the day off. Never joke about the holiday itself.`, fits: anyPlace });
  if (day === "Payday") occasions.push({ id: "payday", query: `payday treat ideas in ${area}`, note: "It's payday (the 15th or the last day of the month): a treat-yourself day out.", fits: anyPlace });
  if (day === "Friday") occasions.push({ id: "date", query: `date ideas in ${area}`, note: "It's Friday: a date plan for this weekend (most picks are daytime spots).", fits: tagged(/date/i) });
  if (day === "Weekend") occasions.push({ id: "weekend", query: `things to do in ${area} this weekend`, note: "It's the weekend: a plan for today.", fits: anyPlace });
  return [
    ...occasions,
    { id: "photo", query: `${area} photo spots`, note: "Photo-dump day: spots that fill the camera roll.", fits: tagged(/photo/i) },
    { id: "sunset", query: `sunset spots in ${area}`, note: "Sunset chasing: every pick's facts mention the sunset.", fits: (place) => /sunset/i.test(place.description ?? "") },
    { id: "friends", query: `group day out in ${area}`, note: "A day out with your friends.", fits: tagged(/barkada|group/i) },
    { id: "family", query: `family day out in ${area}`, note: "A family day out that works for every age.", fits: tagged(/family/i) },
    { id: "nature", query: `nature escapes near ${area}`, note: "Fresh air: a break from screens and traffic.", fits: tagged(/nature/i) },
    { id: "history", query: `history trip in ${area}`, note: "Stories you can walk into: history and heritage stops.", fits: (place) => tagged(/history|heritage|museum/i)(place) || ["Heritage", "Museum"].includes(place.category ?? "") },
    { id: "adventure", query: `adventure day in ${area}`, note: "An adrenaline day.", fits: tagged(/adventure/i) },
    { id: "things-to-do", query: `things to do in ${area}`, note: "The best of the area in one day.", fits: anyPlace },
  ];
}

/** Today's angle: the day's occasion when it has enough places, else a rotating evergreen one; never one used recently. */
export function chooseAngle(angles: Angle[], places: AnglePlace[], seed: number, recentTopics: Set<string>, minPlaces = 4): Angle {
  const usable = angles.filter((angle) => !recentTopics.has(normalizeTopic(angle.query)) && places.filter(angle.fits).length >= minPlaces);
  const occasion = usable.find((angle) => OCCASIONS.has(angle.id));
  if (occasion) return occasion;
  return usable.length ? usable[seed % usable.length] : angles[angles.length - 1];
}

/** Straight-line distance in km between two [lat, lon] points. */
export function distanceKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// One day's picks must be a day trip apart: Metro Manila end to end is about 30 km, while a "Cagayan Valley" post
// paired Callao Cave with Batanes islands (a flight apart) and the editor scored its accuracy 2.
export const CLUSTER_RADIUS_KM = 30;

/** The places within a day trip of `center`, in their given order. */
export function clusterAround<T extends { center: [number, number] }>(center: [number, number], places: T[], radiusKm = CLUSTER_RADIUS_KM): T[] {
  return places.filter((place) => distanceKm(center, place.center) <= radiusKm);
}

export type HourlyWeather = { time: string; probability: number | null; mm: number | null };

/** Open-Meteo hourly JSON → one entry per hour. */
export function parseHourlyWeather(json: string): HourlyWeather[] {
  try {
    const hourly = (JSON.parse(json) as { hourly?: { time?: string[]; precipitation_probability?: number[]; precipitation?: number[] } }).hourly;
    return (hourly?.time ?? []).map((time, index) => ({ time, probability: hourly?.precipitation_probability?.[index] ?? null, mm: hourly?.precipitation?.[index] ?? null }));
  } catch {
    return [];
  }
}

const clock = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;
function timeWindow(start: number, end: number) {
  const startText = clock(start);
  const endText = clock(end);
  return startText.slice(-2) === endText.slice(-2) ? `${startText.slice(0, -3)}–${endText}` : `${startText}–${endText}`;
}

/**
 * A short, human weather line for the gala hours, or null when rain isn't likely. An hour counts as wet only
 * when the chance is ≥ 70% AND at least 0.5 mm is forecast. Never shows raw percentages.
 */
export function describeRain(hours: HourlyWeather[], fromHour = 8, toHour = 21): { line: string; rainy: boolean } | null {
  const wet = hours
    .map((hour) => ({ ...hour, at: Number(hour.time.slice(11, 13)) }))
    .filter((hour) => hour.at >= fromHour && hour.at <= toHour && (hour.probability ?? 0) >= 70 && (hour.mm ?? 0) >= 0.5);
  if (wet.length === 0) return null;
  const peak = Math.max(...wet.map((hour) => hour.mm ?? 0));
  const intensity = peak >= 7.6 ? "heavy" : peak < 1 ? "light" : "showers";
  if (wet.length >= 8) {
    const line = { heavy: "Heavy rain most of the day", light: "Light rain on and off most of the day", showers: "Showers on and off most of the day" }[intensity];
    return { line, rainy: true };
  }
  // The longest run of wet hours decides the window.
  let best = { start: wet[0].at, end: wet[0].at };
  let run = { ...best };
  for (const hour of wet.slice(1)) {
    run = hour.at === run.end + 1 ? { start: run.start, end: hour.at } : { start: hour.at, end: hour.at };
    if (run.end - run.start > best.end - best.start) best = { ...run };
  }
  const part = best.start < 12 ? "Morning" : best.start < 18 ? "Afternoon" : "Evening";
  const window = timeWindow(best.start, best.end + 1);
  const line = {
    heavy: `Heavy ${part.toLowerCase()} rain likely, ${window}`,
    light: `Light rain on and off, ${window}`,
    showers: `${part} showers likely, ${window}`,
  }[intensity];
  return { line, rainy: true };
}

/** Optional day context for the prompt (never the headline). */
export function dayContext(date: Date, holidayName: string | null): string {
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (holidayName) return `Holiday: ${holidayName}`;
  if (day === 15 || day === lastDay) return "Payday";
  if (weekday === 5) return "Friday";
  if (weekday === 6 || weekday === 0) return "Weekend";
  return "Weekday";
}

/** Weekdays stay local (Metro Manila); weekends and holidays rotate through getaway regions. A trend that names a region wins. */
export function chooseRegion(isGetawayDay: boolean, seed: number, regionsWithPlaces: string[], trendRegion: string | null = null, metroSlug = "metro-manila"): string {
  if (trendRegion && regionsWithPlaces.includes(trendRegion)) return trendRegion;
  const getaways = regionsWithPlaces.filter((slug) => slug !== metroSlug);
  if (!isGetawayDay || getaways.length === 0) return metroSlug;
  return getaways[seed % getaways.length];
}

/** Rotates the candidate places so the same spots don't repeat day after day. */
export function rotatePlaces<T extends { slug: string }>(places: T[], recentSlugs: Set<string>, seed: number, count: number): T[] {
  const fresh = places.filter((place) => !recentSlugs.has(place.slug));
  const pool = fresh.length >= count ? fresh : places;
  const start = pool.length ? seed % pool.length : 0;
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, count);
}
