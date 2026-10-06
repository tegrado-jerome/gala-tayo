// Pure helpers for "Gala Today": the daily trend-to-gala post. No network or AI here, so the
// rules that keep posts safe and honest are unit-tested.

export type TrendSignal = {
  title: string;
  source: string;
  url: string | null;
  /** Google Trends traffic estimate when known (e.g. 2000 for "2,000+"). */
  traffic: number;
};

export type TodayPlace = {
  slug: string;
  name: string;
  city: string;
  category: string;
  summary: string;
  canonicalPath: string;
};

export type GalaTodayPost = {
  slug: string;
  date: string;
  publishedAt: string;
  title: string;
  hook: string;
  body: string;
  memeFormat: string | null;
  trend: { title: string; source: string; url: string | null } | null;
  angle: string;
  picks: Array<{ slug: string; name: string; city: string; canonicalPath: string; why: string }>;
};

// Trends we never joke about or tie to a day out: tragedy, crime, politics, scandal, health scares.
const UNSAFE_WORDS = [
  "died", "dies", "dead", "death", "patay", "namatay", "pumanaw", "killed", "kill", "murder~", "slain", "shot", "shooting",
  "stabbed", "rape", "abuse~", "harass~", "assault", "suicide", "missing", "kidnap~", "hostage", "arrest~", "jail",
  "convicted", "charged", "probe", "investigat~", "scam", "fraud", "fake news", "fact check", "hoax", "drugs", "shabu",
  "accident~", "crash", "collision", "fire", "sunog", "explosion", "exploded", "earthquake", "lindol", "flood victims", "evacuat~",
  "casualt~", "injured", "war", "attack", "terror~", "bomb", "impeach~", "senate", "congress", "election~", "president",
  "vice president", "duterte", "marcos", "rally", "protest~", "scandal~", "controversy", "cheating", "affair", "breakup",
  "hiv", "outbreak", "virus", "dengue", "covid", "lawsuit", "court", "sued", "ban", "banned", "child abuse", "minor",
];

const HEDGE_PATTERN = /\b(check|confirm|verify|call ahead|subject to change|may change|may vary|be sure to)\b/i;
const SLOP_PATTERN = /\b(unlock|elevate|seamless|delve|tapestry|game-changer|look no further|whether you're)\b/i;

export const MEME_FORMATS = [
  "POV:",
  "Tell me you're ___ without telling me",
  "Nobody: / Me:",
  "Ako lang ba or…",
  "Main character energy:",
  "Expectation vs reality",
  "It's giving…",
  "Real ones know",
];

// Whole words only ("war" must not match "warm"); a trailing "~" marks a stem ("evacuat~" matches "evacuation").
function hasWord(text: string, word: string) {
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

/** Safe, de-duplicated signals, strongest first, capped for a small prompt. */
export function pickSignals(signals: TrendSignal[], limit = 10): TrendSignal[] {
  const seen = new Set<string>();
  return signals
    .filter((signal) => isSafeTrend(signal.title) && !/^\[(hub|megathread)/i.test(signal.title))
    .filter((signal) => {
      const key = signal.title.toLowerCase().replace(/\W+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.traffic - left.traffic)
    .slice(0, limit);
}

/** Today's non-trend angle from the calendar and the Manila forecast (real data only). */
export function calendarAngle(date: Date, rainChance: number | null, holidayName: string | null): string {
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (holidayName) return `Holiday today: ${holidayName}`;
  if (rainChance !== null && rainChance >= 60) return `Rain likely in Metro Manila today (${rainChance}% chance)`;
  if (day === 15 || day === lastDay || day === 30) return "Payday";
  if (weekday === 5) return "Friday night";
  if (weekday === 6 || weekday === 0) return "Weekend";
  return "Midweek break";
}

export function slugifyTitle(date: string, title: string) {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-[^-]*$/, "");
  return `${date}-${base || "gala-today"}`;
}

// Claims the model may only make when the place's own facts already say them.
const SUPERLATIVES = ["biggest", "largest", "oldest", "first", "only", "best", "most", "highest", "longest", "tallest", "#1", "number one"];

/** Superlatives in the text that none of the picked places' facts back up. */
export function unbackedSuperlatives(text: string, facts: string): string[] {
  const lowerFacts = facts.toLowerCase();
  return SUPERLATIVES.filter((word) => new RegExp(`(^|\\W)${word.replace("#", "\\#")}(\\W|$)`, "i").test(text) && !lowerFacts.includes(word));
}

/** Weekdays and rain keep it local (Metro Manila); weekends and holidays rotate through getaway regions. */
export function chooseRegion(angle: string, weekday: number, seed: number, regionsWithPlaces: string[], metroSlug = "metro-manila"): string {
  const isGetawayDay = (weekday === 0 || weekday === 6 || angle.startsWith("Holiday")) && !angle.startsWith("Rain");
  const getaways = regionsWithPlaces.filter((slug) => slug !== metroSlug);
  if (!isGetawayDay || getaways.length === 0) return metroSlug;
  return getaways[seed % getaways.length];
}

export function buildPrompt(signals: TrendSignal[], angle: string, places: TodayPlace[], date: string, areaName = "Metro Manila") {
  const system = `You write "Gala Today" for GalaTayo, a Filipino app of gala-worthy places. One short, very catchy daily post that rides what's hot right now and turns it into a gala plan.
Voice: Gen Z Pinoy, playful Taglish, meme-literate, warm. Never mean, never about real private people.
Rules:
- Pick at most ONE trend from TRENDS that can link naturally to going out (food, a show, a vibe, weather, a viral word or meme). If none fits, use TODAY'S ANGLE instead and set trend_index to -1.
- Use one meme format from FORMATS for the hook, rewritten for this post. Text only.
- Recommend exactly 3 places, chosen only from PLACES by slug. All PLACES are in ${areaName}; frame the post for ${areaName}.
- Say why using only the facts given for that place. Never invent prices, hours, distances, events, numbers or rankings; no superlatives (biggest, oldest, first, best…) unless that place's facts say them.
- Hook: one punchy line, max 120 characters.
- Never claim a place is connected to the trend unless the facts say so; the link is the vibe ("same energy", "para sa…").
- No hedges ("check", "confirm", "may change"), no hashtags, no emojis in the title.
Return JSON: {"trend_index": number, "meme_format": string, "title": string (max 70 chars), "hook": string (max 140 chars), "body": string (50-100 words), "picks": [{"slug": string, "why": string (max 110 chars)}]}`;
  const user = [
    `DATE: ${date}`,
    `TODAY'S ANGLE: ${angle}`,
    `AREA: ${areaName}`,
    `FORMATS: ${MEME_FORMATS.join(" | ")}`,
    "TRENDS:",
    ...signals.map((signal, index) => `${index}. ${signal.title} (${signal.source})`),
    "PLACES:",
    ...places.map((place) => `- ${place.slug} | ${place.name} | ${place.category}, ${place.city} | ${place.summary}`),
  ].join("\n");
  return { system, user };
}

export type ValidationResult = { ok: true; post: GalaTodayPost } | { ok: false; reason: string };

/** Turns the model's JSON into a post, or explains why it can't be published. */
export function validateDraft(
  raw: Record<string, unknown>,
  { signals, places, angle, date, now }: { signals: TrendSignal[]; places: TodayPlace[]; angle: string; date: string; now: Date }
): ValidationResult {
  const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const title = text(raw.title);
  const hook = text(raw.hook);
  const body = text(raw.body);
  const memeFormat = text(raw.meme_format) || null;
  const trendIndex = typeof raw.trend_index === "number" ? raw.trend_index : -1;
  const trend = trendIndex >= 0 && trendIndex < signals.length ? signals[trendIndex] : null;
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  const rawPicks = Array.isArray(raw.picks) ? raw.picks : [];
  const picks = rawPicks
    .map((pick) => (pick && typeof pick === "object" ? (pick as Record<string, unknown>) : {}))
    .map((pick) => ({ place: bySlug.get(text(pick.slug)), why: text(pick.why) }))
    .filter((pick): pick is { place: TodayPlace; why: string } => Boolean(pick.place && pick.why))
    .filter((pick, index, list) => list.findIndex((other) => other.place.slug === pick.place.slug) === index);

  if (title.length < 10 || title.length > 80) return { ok: false, reason: "title length" };
  if (hook.length < 10 || hook.length > 140) return { ok: false, reason: "hook length" };
  const words = body.split(" ").length;
  if (words < 35 || words > 130) return { ok: false, reason: "body length" };
  if (picks.length < 3) return { ok: false, reason: "needs 3 valid picks" };
  const allText = [title, hook, body, ...picks.map((pick) => pick.why)].join(" ");
  if (HEDGE_PATTERN.test(allText)) return { ok: false, reason: "hedge" };
  if (SLOP_PATTERN.test(allText)) return { ok: false, reason: "slop words" };
  if (!isSafeTrend(allText)) return { ok: false, reason: "unsafe topic" };
  const facts = picks.map((pick) => `${pick.place.name} ${pick.place.summary}`).join(" ");
  const unbacked = unbackedSuperlatives(allText, facts);
  if (unbacked.length > 0) return { ok: false, reason: `unbacked claim: ${unbacked.join(", ")}` };

  return {
    ok: true,
    post: {
      slug: slugifyTitle(date, title),
      date,
      publishedAt: now.toISOString(),
      title,
      hook,
      body,
      memeFormat,
      trend: trend ? { title: trend.title, source: trend.source, url: trend.url } : null,
      angle,
      picks: picks.slice(0, 3).map(({ place, why }) => ({ slug: place.slug, name: place.name, city: place.city, canonicalPath: place.canonicalPath, why })),
    },
  };
}

/** Rotates the candidate places so the same spots don't repeat day after day. */
export function rotatePlaces<T extends { slug: string }>(places: T[], recentSlugs: Set<string>, seed: number, count: number): T[] {
  const fresh = places.filter((place) => !recentSlugs.has(place.slug));
  const pool = fresh.length >= count ? fresh : places;
  const start = pool.length ? seed % pool.length : 0;
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, count);
}
