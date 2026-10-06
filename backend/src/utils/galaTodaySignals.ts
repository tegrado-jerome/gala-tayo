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

export type ScoredTrend = TrendSignal & {
  /** How many searches back it: traffic, other sources and autocomplete presence. */
  demand: number;
  /** 0–1: how naturally it links to going out. */
  link: number;
  score: number;
  /** The phrasing people actually search (from autocomplete), used in the title and slug. */
  query: string;
};

/** Today's topic: a real trend, or the region's top evergreen gala search when no trend fits. */
export type TodayTopic = { kind: "trend"; trend: ScoredTrend } | { kind: "evergreen"; query: string };

// Trends we never joke about or tie to a day out: tragedy, crime, politics, scandal, health scares.
const UNSAFE_WORDS = [
  "died", "dies", "dead", "death", "patay", "namatay", "pumanaw", "killed", "kill", "murder~", "slain", "shot", "shooting",
  "stabbed", "rape", "abuse~", "harass~", "assault", "suicide", "missing", "kidnap~", "hostage", "arrest~", "jail",
  "convicted", "charged", "probe", "investigat~", "scam", "fraud", "fake news", "fact check", "factcheck", "hoax", "drugs", "shabu",
  "accident~", "crash", "collision", "fire", "sunog", "explosion", "exploded", "earthquake", "lindol", "flood victims", "evacuat~",
  "casualt~", "injured", "war", "attack", "terror~", "bomb", "impeach~", "senate", "senator", "solon", "congress", "election~", "president",
  "vice president", "duterte", "marcos", "rally", "protest~", "scandal~", "controversy", "cheating", "affair", "breakup",
  "hiv", "outbreak", "virus", "dengue", "covid", "lawsuit", "court", "sued", "ban", "banned", "child abuse", "minor",
  "lost ability", "cancer", "hospital~", "funeral", "wake", "typhoon", "bagyo", "storm signal",
];

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

// How naturally a topic turns into a day out. Weather and money news are never the angle.
const LINK_RULES: Array<{ weight: number; words: string[] }> = [
  { weight: 0, words: ["weather", "pagasa", "el nino", "la nina", "rain", "rainy", "raining", "ulan", "heat index", "lpa", "stock~", "peso", "exchange rate", "oil price~", "gas price~", "lotto", "result~", "score~", "standings", "tax", "sss", "philhealth", "pag ibig"] },
  { weight: 1, words: ["food", "dessert", "cake", "cheesecake", "chocolate", "cookie~", "donut~", "croissant~", "pastry", "pastries", "bread", "boba", "drink~", "snack~", "dimsum", "dumpling~", "noodle~", "samgyup~", "korean bbq", "steak", "seafood", "mango", "cheese", "tea", "ube", "matcha", "coffee", "kape", "milk tea", "ramen", "pizza", "burger", "fried chicken", "lechon", "halo halo", "ice cream", "gelato", "bake~", "bakery", "menu", "restaurant", "cafe", "buffet", "street food", "mukbang", "sisig", "taho", "bibingka", "puto bumbong", "beach", "island", "hike", "hiking", "sunset", "travel", "trip", "vacation", "long weekend", "staycation", "road trip", "summer"] },
  { weight: 0.9, words: ["concert", "tour", "festival", "fest", "fiesta", "parade", "fireworks", "musical", "exhibit~", "expo", "fair", "bazaar", "night market", "christmas", "pasko", "halloween", "undas", "valentine~", "date night"] },
  { weight: 0.7, words: ["movie", "film", "premiere", "trailer", "filming", "location", "aesthetic", "photo", "outfit", "ootd", "challenge", "dance", "viral", "trend~", "meme", "tiktok"] },
  { weight: 0.5, words: ["kdrama", "k drama", "anime", "kpop", "k pop", "album", "song", "teaser", "mv", "netflix", "series", "episode", "fandom", "fan meet", "fanmeet"] },
  { weight: 0.2, words: ["nba", "pba", "uaap", "ncaa", "pvl", "volleyball", "basketball", "boxing", "tennis", "football", "vs", "game"] },
];

/** 0–1. The most restrictive matching rule wins for weather/money (weight 0); otherwise the best match. */
export function linkScore(title: string): number {
  const text = ` ${normalizeTopic(title)} `;
  const matched = LINK_RULES.filter((rule) => rule.words.some((word) => hasWord(text, word)));
  if (matched.some((rule) => rule.weight === 0)) return 0;
  // Unknown topics (a name, a show) can still work as a vibe, but rarely.
  return matched.length ? Math.max(...matched.map((rule) => rule.weight)) : 0.3;
}

const INTENT_WORDS = /\b(near me|where to|where can|manila|philippines|ph|price|menu|tickets?|venue|schedule|branch(es)?|recipe|location)\b/;
const JUNK_SUGGESTION = /\b(reddit|wiki|wikipedia|quora|pdf|meaning|in english|tagalog|lyrics|apk|download|mod|login|holy week|lent)\b/;

/** The phrasing people search for a trend: an autocomplete suggestion with going-out intent, else the plain trend. */
export function bestPhrasing(title: string, suggestions: string[]): string {
  const base = normalizeTopic(title);
  const related = suggestions.filter((item) => normalizeTopic(item).includes(base) && !JUNK_SUGGESTION.test(item) && isSafeTrend(item));
  return related.find((item) => INTENT_WORDS.test(item)) ?? base;
}

/**
 * Demand-scores each trend: Google Trends traffic (log scale), extra sources and autocomplete presence,
 * multiplied by how naturally it links to going out. Strongest first.
 */
export function scoreTrends(signals: Array<TrendSignal & { sources?: number }>, autocomplete: Map<string, string[]>): ScoredTrend[] {
  return signals
    .map((signal) => {
      const suggestions = autocomplete.get(normalizeTopic(signal.title)) ?? [];
      const searched = suggestions.some((item) => normalizeTopic(item).startsWith(normalizeTopic(signal.title)));
      const demand = (signal.traffic > 0 ? Math.log10(signal.traffic) : 1.5) + ((signal.sources ?? 1) - 1) * 0.5 + (searched ? 1 : 0);
      const link = linkScore(signal.title);
      return { title: signal.title, source: signal.source, url: signal.url, traffic: signal.traffic, demand: round(demand), link, score: round(demand * link), query: bestPhrasing(signal.title, suggestions) };
    })
    .sort((left, right) => right.score - left.score);
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The best trend when one links naturally enough (link ≥ 0.5 and real demand), else null. */
export function chooseTrend(scored: ScoredTrend[], usedTitles: Set<string> = new Set(), minScore = 1.5): ScoredTrend | null {
  return scored.find((trend) => trend.link >= 0.5 && trend.score >= minScore && !usedTitles.has(normalizeTopic(trend.title))) ?? null;
}

/** Autocomplete seeds for the region's evergreen gala searches, most useful first. */
export function evergreenSeeds(areaName: string): string[] {
  const area = areaName.toLowerCase();
  return [`things to do in ${area}`, `where to go in ${area}`, `${area} tourist spots`, `${area} date ideas`];
}

/** The top evergreen search for the region (first safe suggestion that names the area), else the first seed. */
export function pickEvergreenQuery(areaName: string, suggestionsBySeed: string[][], seed = 0): string {
  const seeds = evergreenSeeds(areaName);
  const area = areaName.toLowerCase();
  const candidates = suggestionsBySeed
    .flatMap((list, index) => list.filter((item) => item !== seeds[index]))
    .filter((item) => item.includes(area) && !JUNK_SUGGESTION.test(item) && isSafeTrend(item));
  const unique = [...new Set(candidates)];
  return unique.length ? unique[seed % Math.min(unique.length, 4)] : seeds[seed % seeds.length];
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
  if (weekday === 5) return "Friday night";
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
