import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import galaScores from "../data/galaScores.json";
import { writeGalaTodayDraft } from "../services/galaTodayWriter";
import { createGalaTodayStore, r2JsonObjects } from "../services/galaTodayStore";
import { getJsonCacheValue } from "../services/redisCacheService";
import { hasCuratedPhoto } from "../utils/hdPhotos";
import { extractJsonObject } from "../utils/jsonRepair";
import { isGalaWorthySlug } from "../utils/galaWorthy";
import { getSeoPlaceSummaries, type SeoPlaceSummary } from "../utils/seoPlaces";
import { getDestinationBySlug, inferProvincialDestinationsFromQuery, METRO_MANILA_REGION_SLUG, type Destination } from "../utils/phDestinations";
import { checkPublicReadRateLimit } from "../utils/redisRateLimit";
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
  chooseAngle,
  chooseRegion,
  clusterAround,
  dayContext,
  describeRain,
  evergreenAngles,
  normalizeTopic,
  parseAutocomplete,
  parseGoogleTrendsRss,
  parseHourlyWeather,
  parseNewsRss,
  pickSignals,
  rotatePlaces,
  scoreTrends,
  trustedTrendUrl,
  usableTrends,
  worksInRain,
  type ScoredTrend,
  type TodayTopic,
  type TrendSignal,
} from "../utils/galaTodaySignals";

// Posts live in R2 (newest first; see galaTodayStore). The daily workflow also commits them into the frontend
// repo, so the site keeps its history even if the object is lost.
// v4: creator formats, meme captions, trend-first topics and the editor pass (new post shape).
// Before R2 the posts were in Redis under this key; it's read once to migrate them.
const LEGACY_POSTS_KEY = "gala-today:posts:v4";
// The frontend's committed copy, from the public repo (no login), for a first run with neither R2 nor Redis.
const BUNDLED_POSTS_URL = "https://raw.githubusercontent.com/tegrado-jerome/gala-tayo/main/frontend/src/data/galaToday.json";
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
// A region joins the rotation when one day-trip cluster there has this many places; a post needs this many to choose from.
const MIN_CLUSTER = 5;
const MIN_PICKABLE = 4;
const MAX_CANDIDATES = 10;

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

const store = createGalaTodayStore({
  objects: r2JsonObjects,
  readLegacyPosts: () => getJsonCacheValue<GalaTodayPost[]>(LEGACY_POSTS_KEY),
  readBundledPosts: async () => {
    const response = await fetch(BUNDLED_POSTS_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    return response.ok ? ((await response.json()) as GalaTodayPost[]) : null;
  },
});

/** `memoryTtlSeconds` lets page reads reuse this instance's copy; the generator always reads R2 (and throws if it's down). */
export async function readGalaTodayPosts({ memoryTtlSeconds }: { memoryTtlSeconds?: number } = {}): Promise<GalaTodayPost[]> {
  if (!GALA_TODAY_ENABLED) return [];
  return store.readPosts({ memoryTtlSeconds });
}

type ClusterPlace = SeoPlaceSummary & { destination: Destination; center: [number, number] };

/** What the post calls the cluster: its one town, else Metro Manila, its one province, or its region. */
function clusterName(places: ClusterPlace[]): string {
  const [first] = places;
  if (places.every((place) => place.destination.slug === first.destination.slug)) return first.destination.label;
  if (places.every((place) => place.destination.regionSlug === METRO_MANILA_REGION_SLUG)) return "Metro Manila";
  if (places.every((place) => place.destination.provinceSlug === first.destination.provinceSlug)) return first.destination.provinceName;
  return first.destination.regionName;
}

export type GenerateOptions = {
  /** Dry run (scripts/galaTodayDryRun.ts): the posts to build on, and nothing is saved. */
  dryRunPosts?: GalaTodayPost[];
  /** Every draft with its outcome, for the dry-run report. */
  onAttempt?: (attempt: { model: string; draft: unknown; outcome: string }) => void;
};

/** Writes one new post when today still has room. Returns the post, or why it skipped. */
export async function generateGalaTodayPost(context: InvocationContext, now = new Date(), options: GenerateOptions = {}): Promise<GalaTodayPost | string> {
  if (!GALA_TODAY_ENABLED) return "paused";
  const manilaNow = new Date(now.getTime() + 8 * 3600_000);
  const date = manilaNow.toISOString().slice(0, 10);
  const dryRun = Boolean(options.dryRunPosts);
  const posts = options.dryRunPosts ?? (await readGalaTodayPosts());
  const slot = posts.filter((post) => post.date === date).length;
  if (slot >= MAX_POSTS_PER_DAY) return "today is full";

  const [signals, holiday, summaries] = await Promise.all([collectSignals(context), holidayToday(date, context), getSeoPlaceSummaries()]);
  const weekday = manilaNow.getUTCDay();
  const seed = Number(date.replace(/-/g, "")) + posts.length;
  const recentTopics = new Set(posts.slice(0, 10).map((post) => normalizeTopic(post.topic?.title ?? "")));
  const recentSlugs = new Set(posts.slice(0, 7).flatMap((post) => post.picks.map((pick) => pick.slug)));

  // 1. Places: real, visible (gala-worthy; the cached list can lag a fresh hide), photo-backed and mapped to a
  // destination, most iconic first.
  const usable: ClusterPlace[] = summaries
    .flatMap((place) => {
      const destination = getDestinationBySlug(place.areaSlug);
      return destination && place.description && hasCuratedPhoto(place.slug) && isGalaWorthySlug(place.slug) ? [{ ...place, destination, center: destination.center }] : [];
    })
    .sort((left, right) => (SCORES[right.slug] ?? 0) - (SCORES[left.slug] ?? 0));
  // A day's picks are one day trip: places around an anchor, in the anchor's region.
  const clusterOf = (anchor: { center: [number, number]; regionSlug: string }) =>
    clusterAround(anchor.center, usable.filter((place) => place.destination.regionSlug === anchor.regionSlug));
  const regions = [...new Set(usable.map((place) => place.destination.regionSlug))]
    .filter((slug) => usable.some((place) => place.destination.regionSlug === slug && clusterOf({ center: place.center, regionSlug: slug }).length >= MIN_CLUSTER))
    .sort();

  // 2. Topic: a trend that is already about going out (names one of our places, a festival or a season). Place and
  // festival trends need a day-trip cluster where they happen; anything else falls back to an evergreen angle.
  const lookups = signals.slice(0, AUTOCOMPLETE_LOOKUPS);
  const suggestions = await Promise.all(lookups.map((signal) => autocomplete(signal.title, context)));
  const autocompleteMap = new Map(lookups.map((signal, index) => [normalizeTopic(signal.title), suggestions[index]]));
  const namedPlace = (title: string) => usable.find((place) => normalizeTopic(place.name).length >= 8 && normalizeTopic(title).includes(normalizeTopic(place.name)));
  const namedDestination = (title: string) => inferProvincialDestinationsFromQuery(title)[0]?.destination ?? null;
  const scored = scoreTrends(signals, autocompleteMap, { namesOurPlace: (title) => Boolean(namedPlace(title)), namesDestination: (title) => Boolean(namedDestination(title)) });
  let trend: ScoredTrend | null = null;
  let trendCluster: ClusterPlace[] | null = null;
  for (const candidate of usableTrends(scored, recentTopics)) {
    if (candidate.kind === "season") {
      trend = candidate;
      break;
    }
    const text = `${candidate.title} ${candidate.query}`;
    const anchor = namedPlace(text) ?? namedDestination(text);
    const cluster = anchor ? clusterOf({ center: anchor.center, regionSlug: "destination" in anchor ? anchor.destination.regionSlug : anchor.regionSlug }) : [];
    if (cluster.length >= MIN_CLUSTER) {
      trend = candidate;
      trendCluster = cluster;
      break;
    }
  }
  context.log(`Gala Today trends: ${scored.slice(0, 5).map((item) => `${item.title}=${item.score}${item.kind ? `(${item.kind})` : ""}`).join(", ") || "none"}; picked ${trend?.title ?? "evergreen"}`);

  // 3. Cluster: the trend's own; else local (Metro Manila) on weekdays and a getaway region on weekends/holidays,
  // around the most iconic place that wasn't picked lately. Rain keeps the picks indoors.
  const regionSlug = trendCluster?.[0].destination.regionSlug ?? chooseRegion(weekday === 0 || weekday === 6 || Boolean(holiday), seed, regions);
  const anchors = trendCluster ?? rotatePlaces(usable.filter((place) => place.destination.regionSlug === regionSlug), recentSlugs, seed, usable.length);
  if (anchors.length === 0) return "skipped: not enough places";
  const weather = await areaWeather(anchors[0].center, Math.max(8, manilaNow.getUTCHours() + 1), context);
  const fitsWeather = (place: ClusterPlace) => !weather?.rainy || worksInRain(place);
  // When a getaway region has nothing rain-proof, the post stays local (Metro Manila has the most indoor places).
  const metroAnchors = usable.filter((place) => place.destination.regionSlug === METRO_MANILA_REGION_SLUG);
  const trendPlaces = trendCluster?.filter(fitsWeather) ?? [];
  // A place or festival trend without enough rain-proof places there falls back to an evergreen angle.
  if (trendCluster && trendPlaces.length < MIN_PICKABLE) trend = null;
  const cluster =
    (trend && trendCluster ? trendPlaces : null) ??
    [...(trendCluster ? [] : anchors), ...metroAnchors]
      .map((anchor) => clusterOf({ center: anchor.center, regionSlug: anchor.destination.regionSlug }).filter(fitsWeather))
      .find((places) => places.length >= MIN_PICKABLE) ??
    [];
  if (cluster.length < MIN_PICKABLE) return `skipped: not enough ${weather?.rainy ? "rain-proof " : ""}places`;
  const areaName = clusterName(cluster);

  // 4. The evergreen angle (when no trend) narrows the cluster to places that fit it.
  let topic: TodayTopic;
  let pool = cluster;
  if (trend) topic = { kind: "trend", trend: { ...trend, url: trustedTrendUrl(trend.url), source: trustedTrendUrl(trend.url) ? trend.source : "Google Trends" } };
  else {
    const angle = chooseAngle(evergreenAngles(areaName, dayContext(manilaNow, holiday), Boolean(weather?.rainy)), cluster, seed, recentTopics, MIN_PICKABLE);
    topic = { kind: "evergreen", query: angle.query, note: angle.note };
    const fitting = cluster.filter(angle.fits);
    if (fitting.length >= MIN_PICKABLE) pool = fitting;
  }
  // Fresh places first, then the iconic ones again; 10 is plenty of choice without diluting the prompt.
  const ordered = [...pool.filter((place) => !recentSlugs.has(place.slug)), ...pool.filter((place) => recentSlugs.has(place.slug))];
  const candidates: TodayPlace[] = ordered.slice(0, MAX_CANDIDATES).map((place) => ({
    slug: place.slug,
    name: place.name,
    city: place.city ?? place.destination.label,
    category: place.category ?? "Place",
    summary: (place.description ?? "").split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 420),
    canonicalPath: place.canonicalPath,
    budgetMin: place.budgetMin,
    score: SCORES[place.slug] ?? 0,
  }));

  // 5. Format: rotates by date and slot; the budget challenge only runs on real budget data, and a trend that names
  // a place can't be a guessing game.
  const budget = budgetPlan(candidates);
  const format = chooseFormat(date, slot, posts[0]?.format ?? null, (id) => (id !== "budget-challenge" || budget !== null) && (id !== "guess-the-place" || trend?.kind !== "place"));
  const places = format === "budget-challenge" && budget ? budget.eligible : candidates;
  const takenSlugs = new Set(posts.map((post) => post.slug));

  // 6. Draft → rules → editor. Publish only when the editor scores every line 8+; else redraft with its notes.
  // The weekday name lets writer and editor match a place's best days ("Thursday to Saturday") to today.
  const weekdayName = manilaNow.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const occasion = dayContext(manilaNow, holiday);
  const day = occasion === weekdayName ? weekdayName : `${weekdayName} (${occasion})`;
  let editorNotes: string | null = null;
  let previousDraft: string | null = null;
  let lastReason = "no draft";
  const attempts: string[] = [];
  // Model failures (quota, unknown model) only reach server logs otherwise; keep them for the last-run note.
  const modelErrors = new Set<string>();
  const warn = (message: string) => {
    context.warn(message);
    modelErrors.add(message.replace(/^Gala Today: /, "").slice(0, 140));
  };
  for (let attempt = 0; attempt < MAX_DRAFTS; attempt += 1) {
    // Money only enters the prompt for budget challenges; other formats must not mention peso amounts the rules can't verify.
    const promptBudget = format === "budget-challenge" ? budget : null;
    const { system, user } = buildPrompt({ date, topic, format, places, areaName, weather: weather?.line ?? null, day, budget: promptBudget, editorNotes, previousDraft });
    const { text: raw, model } = await writeGalaTodayDraft(system, user, `gala-today-${date}-${attempt}`, warn);
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      lastReason = "unparseable";
      attempts.push(`${model}: unparseable`);
      options.onAttempt?.({ model, draft: raw, outcome: "unparseable" });
      continue;
    }
    const result = validateDraft(parsed, { topic, format, places, areaName, weather: weather?.line ?? null, budget: promptBudget, date, now, takenSlugs });
    if ("reason" in result) {
      lastReason = result.reason;
      attempts.push(`${model}: rules: ${result.reason}`);
      options.onAttempt?.({ model, draft: parsed, outcome: `rules: ${result.reason}` });
      editorNotes = `The last draft was rejected by the rules: ${result.reason}.`;
      previousDraft = JSON.stringify(parsed);
      context.log(`Gala Today draft ${attempt + 1} (${model}) rejected: ${result.reason}`);
      continue;
    }
    const editor = buildEditorPrompt(result.post, places, topic.kind === "evergreen" ? (topic.note ?? null) : null, day);
    const review = parseEditorReview(extractJsonObject((await writeGalaTodayDraft(editor.system, editor.user, `gala-today-${date}-${attempt}-edit`, warn, 0.2)).text));
    context.log(`Gala Today draft ${attempt + 1} (${model}) editor: ${JSON.stringify(review.scores)} ${review.fix}`);
    options.onAttempt?.({ model, draft: result.post, outcome: `editor ${review.pass ? "pass" : "fail"}: ${JSON.stringify(review.scores)} ${review.fix}` });
    if (!review.pass || !review.scores) {
      lastReason = `editor: ${JSON.stringify(review.scores)}`;
      attempts.push(`${model}: ${lastReason}`);
      editorNotes = review.fix || "Make it funnier and clearer.";
      previousDraft = JSON.stringify(parsed);
      continue;
    }
    const post: GalaTodayPost = { ...result.post, review: review.scores, model };
    if (!dryRun) await store.savePosts([post, ...posts].slice(0, MAX_POSTS));
    return post;
  }
  const failures = modelErrors.size ? ` {models: ${[...modelErrors].join(" | ")}}` : "";
  return `skipped: ${lastReason}${failures}${attempts.length ? ` [${attempts.join(" | ")}]` : ""}`;
}

// The last run's outcome, so a skipped day can be diagnosed without server logs (no secrets, just reasons).
async function generateAndRecord(context: InvocationContext, trigger: string): Promise<GalaTodayPost | string | null> {
  let outcome: GalaTodayPost | string | null;
  try {
    // Only one generator runs at a time (timer and the catch-up request below). Drafts plus editor passes can take minutes.
    outcome = await store.withLock(() => generateGalaTodayPost(context));
  } catch (error) {
    outcome = `error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`;
  }
  const summary = outcome === null ? "another run holds the lock" : typeof outcome === "string" ? outcome : `posted ${outcome.slug}`;
  if (outcome !== null) await store.saveLastRun({ at: new Date().toISOString(), trigger, result: summary.slice(0, 900) });
  return outcome;
}

async function galaTodayTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  try {
    const result = (await generateAndRecord(context, "timer")) ?? "another run holds the lock";
    context.log(typeof result === "string" ? `Gala Today: ${result}` : `Gala Today posted: ${result.slug}`);
  } catch (error) {
    context.error("Gala Today failed", error);
  }
}

async function galaTodayList(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "gala-today", 120, 60);
  if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;
  const limit = Math.min(Math.max(Number(request.query.get("limit")) || 30, 1), MAX_POSTS);
  // Catch-up: if the morning timer missed (cold start, AI limit), the first request after 6 AM Manila writes today's post.
  const manilaNow = new Date(Date.now() + 8 * 3600_000);
  const today = manilaNow.toISOString().slice(0, 10);
  // Catch-up generation only on explicit request (the daily workflow sends ensure=1), never on a page view:
  // generation can take minutes, which stalled pages and the prerender build.
  const ensure = request.query.get("ensure") === "1";
  // Posts change twice a day, so page reads may use this instance's copy; the catch-up check reads R2.
  let posts: GalaTodayPost[];
  try {
    posts = await readGalaTodayPosts(ensure ? {} : { memoryTtlSeconds: 120 });
  } catch (error) {
    context.warn(`Gala Today posts unavailable: ${error instanceof Error ? error.message : "unknown"}`);
    posts = [];
  }
  if (GALA_TODAY_ENABLED && ensure && manilaNow.getUTCHours() >= 6 && !posts.some((post) => post.date === today)) {
    const result = await generateAndRecord(context, "catch-up");
    if (result && typeof result !== "string") posts = [result, ...posts];
  }
  const hasToday = posts.some((post) => post.date === today);
  const lastRun = hasToday ? undefined : await store.readLastRun({ memoryTtlSeconds: 120 });
  return {
    status: 200,
    headers: { "Cache-Control": hasToday ? "public, max-age=300" : "no-store" },
    jsonBody: { posts: posts.slice(0, limit), ...(lastRun ? { lastRun } : {}) },
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
