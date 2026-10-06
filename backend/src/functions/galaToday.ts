import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import galaScores from "../data/galaScores.json";
import { generateJsonFromGroq } from "../services/groqChatProvider";
import { getJsonCacheValue, getRedisClient, setJsonCacheValue } from "../services/redisCacheService";
import { extractJsonObject } from "../utils/jsonRepair";
import { getSeoPlaceSummaries } from "../utils/seoPlaces";
import { getDestinationBySlug, REGIONS } from "../utils/phDestinations";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import {
  buildPrompt,
  calendarAngle,
  chooseRegion,
  parseGoogleTrendsRss,
  parseNewsRss,
  pickSignals,
  rotatePlaces,
  validateDraft,
  type GalaTodayPost,
  type TodayPlace,
  type TrendSignal,
} from "../utils/galaTodayCore";

// Posts live in Redis (newest first). The daily workflow also commits them into the frontend
// repo, so the site keeps its history even if the cache is cleared.
const POSTS_KEY = "gala-today:posts:v1";
const MAX_POSTS = 90;
const MAX_POSTS_PER_DAY = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; GalaTayoBot/1.0; +https://galatayo.app)";
// Public, no-login sources only.
const SOURCES: Array<{ url: string; parse: (xml: string) => TrendSignal[] }> = [
  { url: "https://trends.google.com/trending/rss?geo=PH", parse: parseGoogleTrendsRss },
  { url: "https://news.google.com/rss/search?q=viral+OR+trending+when:1d&hl=en-PH&gl=PH&ceid=PH:en", parse: (xml) => parseNewsRss(xml, "Google News") },
  { url: "https://news.google.com/rss/search?q=tiktok+trend+philippines+when:2d&hl=en-PH&gl=PH&ceid=PH:en", parse: (xml) => parseNewsRss(xml, "Google News") },
  { url: "https://www.reddit.com/r/Philippines/hot.rss?limit=25", parse: (xml) => parseNewsRss(xml, "r/Philippines") },
];
const SCORES: Record<string, number> = galaScores;

async function fetchText(url: string, context: InvocationContext): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      context.warn(`Gala Today source ${response.status}: ${url}`);
      return null;
    }
    return await response.text();
  } catch {
    context.warn(`Gala Today source failed: ${url}`);
    return null;
  }
}

async function collectSignals(context: InvocationContext): Promise<TrendSignal[]> {
  const results = await Promise.all(SOURCES.map(async (source) => {
    const xml = await fetchText(source.url, context);
    return xml ? source.parse(xml) : [];
  }));
  return pickSignals(results.flat());
}

async function manilaRainChance(context: InvocationContext): Promise<number | null> {
  const text = await fetchText("https://api.open-meteo.com/v1/forecast?latitude=14.5995&longitude=120.9842&daily=precipitation_probability_max&timezone=Asia%2FManila&forecast_days=1", context);
  try {
    const value = text ? JSON.parse(text)?.daily?.precipitation_probability_max?.[0] : null;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

async function holidayToday(date: string, context: InvocationContext): Promise<string | null> {
  const text = await fetchText(`https://date.nager.at/api/v3/PublicHolidays/${date.slice(0, 4)}/PH`, context);
  try {
    const holidays = text ? (JSON.parse(text) as Array<{ date: string; localName: string; name: string }>) : [];
    const match = holidays.find((holiday) => holiday.date === date);
    return match ? match.name : null;
  } catch {
    return null;
  }
}

export async function readGalaTodayPosts(): Promise<GalaTodayPost[]> {
  return (await getJsonCacheValue<GalaTodayPost[]>(POSTS_KEY)) ?? [];
}

/** Writes one new post when today still has room. Returns the post, or why it skipped. */
export async function generateGalaTodayPost(context: InvocationContext, now = new Date()): Promise<GalaTodayPost | string> {
  const manilaNow = new Date(now.getTime() + 8 * 3600_000);
  const date = manilaNow.toISOString().slice(0, 10);
  const posts = await readGalaTodayPosts();
  if (posts.filter((post) => post.date === date).length >= MAX_POSTS_PER_DAY) return "today is full";

  const [signals, rainChance, holiday, summaries] = await Promise.all([
    collectSignals(context),
    manilaRainChance(context),
    holidayToday(date, context),
    getSeoPlaceSummaries(),
  ]);
  const usedToday = new Set(posts.filter((post) => post.date === date).map((post) => post.trend?.title).filter(Boolean));
  const freshSignals = signals.filter((signal) => !usedToday.has(signal.title));
  const angle = calendarAngle(manilaNow, rainChance, holiday);

  const recentSlugs = new Set(posts.slice(0, 7).flatMap((post) => post.picks.map((pick) => pick.slug)));
  const seed = Number(date.replace(/-/g, "")) + posts.length;
  // All three picks come from one region so a post never sends people across the country in one day.
  const regionOf = (areaSlug: string) => getDestinationBySlug(areaSlug)?.regionSlug ?? null;
  const counts = new Map<string, number>();
  for (const place of summaries) {
    const region = regionOf(place.areaSlug);
    if (region && place.description) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  const regionSlug = chooseRegion(angle, manilaNow.getUTCDay(), seed, [...counts].filter(([, count]) => count >= 6).map(([slug]) => slug).sort());
  const areaName = REGIONS.find((region) => region.slug === regionSlug)?.name ?? "Metro Manila";
  const ranked = summaries
    .filter((place) => place.description && regionOf(place.areaSlug) === regionSlug)
    .sort((left, right) => (SCORES[right.slug] ?? 0) - (SCORES[left.slug] ?? 0));
  const places: TodayPlace[] = rotatePlaces(ranked, recentSlugs, seed, 14).map((place) => ({
    slug: place.slug,
    name: place.name,
    city: place.city ?? "",
    category: place.category ?? "Place",
    summary: (place.description ?? "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 260),
    canonicalPath: place.canonicalPath,
  }));

  const { system, user } = buildPrompt(freshSignals, angle, places, date, areaName);
  let lastReason = "no draft";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = await generateJsonFromGroq({ systemPrompt: system, userMessage: user, requestId: `gala-today-${date}-${attempt}`, maxCompletionTokens: 900 });
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      lastReason = "unparseable";
      continue;
    }
    const result = validateDraft(parsed, { signals: freshSignals, places, angle, date, now });
    if ("reason" in result) {
      lastReason = result.reason;
      continue;
    }
    const draft = result.post;
    const post = { ...draft, slug: posts.some((existing) => existing.slug === draft.slug) ? `${draft.slug}-2` : draft.slug };
    await setJsonCacheValue(POSTS_KEY, [post, ...posts].slice(0, MAX_POSTS));
    return post;
  }
  return `skipped: ${lastReason}`;
}

async function galaTodayTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  try {
    const result = (await withGenerateLock(() => generateGalaTodayPost(context))) ?? "another run holds the lock";
    context.log(typeof result === "string" ? `Gala Today: ${result}` : `Gala Today posted: ${result.slug}`);
  } catch (error) {
    context.error("Gala Today failed", error);
  }
}

/** Only one generator runs at a time (timer and the catch-up request below). */
async function withGenerateLock<T>(run: () => Promise<T>): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const locked = await client.set("gala-today:lock", "1", { nx: true, ex: 180 }).catch(() => null);
  if (!locked) return null;
  try {
    return await run();
  } finally {
    await client.del("gala-today:lock").catch(() => undefined);
  }
}

async function galaTodayList(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "gala-today", 120, 60);
  if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;
  const limit = Math.min(Math.max(Number(request.query.get("limit")) || 30, 1), MAX_POSTS);
  let posts = await readGalaTodayPosts();
  // Catch-up: if the morning timer missed (cold start, AI limit), the first request after 6 AM Manila writes today's post.
  const manilaNow = new Date(Date.now() + 8 * 3600_000);
  const today = manilaNow.toISOString().slice(0, 10);
  if (manilaNow.getUTCHours() >= 6 && !posts.some((post) => post.date === today)) {
    const result = await withGenerateLock(() => generateGalaTodayPost(context));
    if (result && typeof result !== "string") posts = [result, ...posts];
  }
  return {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
    jsonBody: { posts: posts.slice(0, limit) },
  };
}

// 6:30 AM and 4:30 PM in Manila (UTC+8): a morning post, and an afternoon one when there's room.
app.timer("galaTodayTimer", { schedule: "0 30 22,8 * * *", handler: galaTodayTimer });

app.http("galaToday", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "today",
  handler: galaTodayList,
});
