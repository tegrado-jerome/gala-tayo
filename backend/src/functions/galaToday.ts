import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import galaScores from "../data/galaScores.json";
import { writeGalaTodayDraft } from "../services/galaTodayWriter";
import { getJsonCacheValue, getRedisClient, setJsonCacheValue } from "../services/redisCacheService";
import { hasCuratedPhoto } from "../utils/hdPhotos";
import { extractJsonObject } from "../utils/jsonRepair";
import { getSeoPlaceSummaries } from "../utils/seoPlaces";
import { getDestinationBySlug, inferProvincialDestinationsFromQuery, mentionsDestination, REGIONS } from "../utils/phDestinations";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import {
  budgetPlan,
  buildEditorPrompt,
  buildPrompt,
  chooseFormat,
  parseEditorReview,
  validateDraft,
  type GalaTodayPost,
  type TodayPlace,
} from "../utils/galaTodayCore";
import {
  chooseRegion,
  chooseTrend,
  dayContext,
  describeRain,
  evergreenSeeds,
  normalizeTopic,
  parseAutocomplete,
  parseGoogleTrendsRss,
  parseHourlyWeather,
  parseNewsRss,
  pickEvergreenQuery,
  pickSignals,
  rotatePlaces,
  scoreTrends,
  type TodayTopic,
  type TrendSignal,
} from "../utils/galaTodaySignals";

// Posts live in Redis (newest first). The daily workflow also commits them into the frontend
// repo, so the site keeps its history even if the cache is cleared.
// v4: creator formats, meme captions, trend-first topics and the editor pass (new post shape).
const POSTS_KEY = "gala-today:posts:v4";
const GALA_TODAY_ENABLED = true;
const MAX_POSTS = 90;
const MAX_POSTS_PER_DAY = 2;
const MAX_DRAFTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; GalaTayoBot/1.0; +https://galatayo.app)";
// Free, public, no-login sources only.
const SOURCES: Array<{ url: string; parse: (xml: string) => TrendSignal[] }> = [
  { url: "https://trends.google.com/trending/rss?geo=PH", parse: parseGoogleTrendsRss },
  { url: "https://news.google.com/rss/search?q=viral+OR+trending+when:1d&hl=en-PH&gl=PH&ceid=PH:en", parse: (xml) => parseNewsRss(xml, "Google News") },
  { url: "https://news.google.com/rss/search?q=tiktok+trend+philippines+when:2d&hl=en-PH&gl=PH&ceid=PH:en", parse: (xml) => parseNewsRss(xml, "Google News") },
  { url: "https://news.google.com/rss/search?q=viral+food+OR+concert+OR+meme+philippines+when:2d&hl=en-PH&gl=PH&ceid=PH:en", parse: (xml) => parseNewsRss(xml, "Google News") },
  { url: "https://www.reddit.com/r/Philippines/hot.rss?limit=25", parse: (xml) => parseNewsRss(xml, "r/Philippines") },
];
// Only the top trends get an autocomplete lookup, to stay polite to the free endpoint.
const AUTOCOMPLETE_LOOKUPS = 8;
const SCORES: Record<string, number> = galaScores;
// Places that still work when it rains.
const INDOOR = new Set(["Museum", "Food", "Cafe", "Mall", "Nightlife"]);

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

async function collectSignals(context: InvocationContext) {
  const results = await Promise.all(SOURCES.map(async (source) => {
    const xml = await fetchText(source.url, context);
    return xml ? source.parse(xml) : [];
  }));
  return pickSignals(results.flat());
}

async function autocomplete(query: string, context: InvocationContext): Promise<string[]> {
  const text = await fetchText(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=ph&q=${encodeURIComponent(query)}`, context);
  return text ? parseAutocomplete(text) : [];
}

async function areaWeather(center: [number, number], fromHour: number, context: InvocationContext) {
  const [lat, lon] = center;
  const text = await fetchText(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation&timezone=Asia%2FManila&forecast_days=1`,
    context
  );
  return text ? describeRain(parseHourlyWeather(text), fromHour) : null;
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
  if (!GALA_TODAY_ENABLED) return [];
  return (await getJsonCacheValue<GalaTodayPost[]>(POSTS_KEY)) ?? [];
}

/** The region a trend names ("Baguio food crawl" → Cordillera), so the picks follow the trend. */
function trendRegion(text: string): string | null {
  const provincial = inferProvincialDestinationsFromQuery(text)[0]?.destination.regionSlug;
  if (provincial) return provincial;
  return mentionsDestination(text) ? "metro-manila" : null;
}

/** Writes one new post when today still has room. Returns the post, or why it skipped. */
export async function generateGalaTodayPost(context: InvocationContext, now = new Date()): Promise<GalaTodayPost | string> {
  if (!GALA_TODAY_ENABLED) return "paused";
  const manilaNow = new Date(now.getTime() + 8 * 3600_000);
  const date = manilaNow.toISOString().slice(0, 10);
  const posts = await readGalaTodayPosts();
  const slot = posts.filter((post) => post.date === date).length;
  if (slot >= MAX_POSTS_PER_DAY) return "today is full";

  const [signals, holiday, summaries] = await Promise.all([collectSignals(context), holidayToday(date, context), getSeoPlaceSummaries()]);

  // 1. Topic: the highest-demand safe trend that links naturally to going out.
  const lookups = signals.slice(0, AUTOCOMPLETE_LOOKUPS);
  const suggestions = await Promise.all(lookups.map((signal) => autocomplete(signal.title, context)));
  const autocompleteMap = new Map(lookups.map((signal, index) => [normalizeTopic(signal.title), suggestions[index]]));
  const recentTopics = new Set(posts.slice(0, 10).map((post) => normalizeTopic(post.topic?.title ?? "")));
  const scored = scoreTrends(signals, autocompleteMap);
  const trend = chooseTrend(scored, recentTopics);
  context.log(`Gala Today trends: ${scored.slice(0, 5).map((item) => `${item.title}=${item.score}`).join(", ") || "none"}; picked ${trend?.title ?? "evergreen"}`);

  // 2. Region: the trend's own region when it names one; else local on weekdays, getaways on weekends/holidays.
  const regionOf = (areaSlug: string) => getDestinationBySlug(areaSlug)?.regionSlug ?? null;
  const usable = summaries.filter((place) => place.description && hasCuratedPhoto(place.slug));
  const counts = new Map<string, number>();
  for (const place of usable) {
    const region = regionOf(place.areaSlug);
    if (region) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  const regions = [...counts].filter(([, count]) => count >= 6).map(([slug]) => slug).sort();
  const weekday = manilaNow.getUTCDay();
  const seed = Number(date.replace(/-/g, "")) + posts.length;
  const regionSlug = chooseRegion(weekday === 0 || weekday === 6 || Boolean(holiday), seed, regions, trend ? trendRegion(`${trend.title} ${trend.query}`) : null);
  const region = REGIONS.find((item) => item.slug === regionSlug);
  const areaName = region?.name ?? "Metro Manila";

  // 3. Weather is a practical side line only: rain keeps the picks indoors, never becomes the angle.
  const weather = region ? await areaWeather(region.center, Math.max(8, manilaNow.getUTCHours() + 1), context) : null;
  const fitsWeather = (place: (typeof summaries)[number]) => !weather?.rainy || INDOOR.has(place.category ?? "") || place.goodFor.some((tag) => /rainy/i.test(tag));

  // 4. Places: real, photo-backed, gala-worthy spots in the region, most iconic first, rotated for freshness.
  const recentSlugs = new Set(posts.slice(0, 7).flatMap((post) => post.picks.map((pick) => pick.slug)));
  const ranked = usable
    .filter((place) => regionOf(place.areaSlug) === regionSlug && fitsWeather(place))
    .sort((left, right) => (SCORES[right.slug] ?? 0) - (SCORES[left.slug] ?? 0));
  const candidates: TodayPlace[] = rotatePlaces(ranked, recentSlugs, seed, 14).map((place) => ({
    slug: place.slug,
    name: place.name,
    city: place.city ?? "",
    category: place.category ?? "Place",
    summary: (place.description ?? "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 260),
    canonicalPath: place.canonicalPath,
    budgetMin: place.budgetMin,
    score: SCORES[place.slug] ?? 0,
  }));
  if (candidates.length < 3) return "skipped: not enough places";

  let topic: TodayTopic;
  if (trend) topic = { kind: "trend", trend };
  else {
    const evergreen = await Promise.all(evergreenSeeds(areaName).map((query) => autocomplete(query, context)));
    topic = { kind: "evergreen", query: pickEvergreenQuery(areaName, evergreen, seed) };
  }

  // 5. Format: rotates by date and slot; the budget challenge only runs on real budget data.
  const budget = budgetPlan(candidates);
  const format = chooseFormat(date, slot, posts[0]?.format ?? null, (id) => id !== "budget-challenge" || budget !== null);
  const places = format === "budget-challenge" && budget ? budget.eligible : candidates;
  const takenSlugs = new Set(posts.map((post) => post.slug));

  // 6. Draft → rules → editor. Publish only when the editor scores every line 8+; else redraft with its notes.
  let editorNotes: string | null = null;
  let lastReason = "no draft";
  for (let attempt = 0; attempt < MAX_DRAFTS; attempt += 1) {
    const { system, user } = buildPrompt({ date, topic, format, places, areaName, weather: weather?.line ?? null, day: dayContext(manilaNow, holiday), budget, editorNotes });
    const { text: raw, model } = await writeGalaTodayDraft(system, user, `gala-today-${date}-${attempt}`, (message) => context.warn(message));
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      lastReason = "unparseable";
      continue;
    }
    const result = validateDraft(parsed, { topic, format, places, areaName, weather: weather?.line ?? null, budget, date, now, takenSlugs });
    if ("reason" in result) {
      lastReason = result.reason;
      editorNotes = `The last draft was rejected by the rules: ${result.reason}.`;
      context.log(`Gala Today draft ${attempt + 1} (${model}) rejected: ${result.reason}`);
      continue;
    }
    const editor = buildEditorPrompt(result.post, places);
    const review = parseEditorReview(extractJsonObject((await writeGalaTodayDraft(editor.system, editor.user, `gala-today-${date}-${attempt}-edit`, (message) => context.warn(message), 0.2)).text));
    context.log(`Gala Today draft ${attempt + 1} (${model}) editor: ${JSON.stringify(review.scores)} ${review.fix}`);
    if (!review.pass || !review.scores) {
      lastReason = `editor: ${JSON.stringify(review.scores)}`;
      editorNotes = review.fix || "Make it funnier and clearer.";
      continue;
    }
    const post: GalaTodayPost = { ...result.post, review: review.scores, model };
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

/** Only one generator runs at a time (timer and the catch-up request below). Drafts plus editor passes can take minutes. */
async function withGenerateLock<T>(run: () => Promise<T>): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const locked = await client.set("gala-today:lock", "1", { nx: true, ex: 420 }).catch(() => null);
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
  if (GALA_TODAY_ENABLED && manilaNow.getUTCHours() >= 6 && !posts.some((post) => post.date === today)) {
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
