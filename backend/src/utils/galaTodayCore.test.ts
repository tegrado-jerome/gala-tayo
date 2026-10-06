import assert from "node:assert/strict";
import test from "node:test";
import { calendarAngle, isSafeTrend, parseGoogleTrendsRss, parseNewsRss, pickSignals, rotatePlaces, slugifyTitle, validateDraft, type TodayPlace } from "./galaTodayCore";

const places: TodayPlace[] = ["a", "b", "c", "d"].map((slug) => ({
  slug,
  name: `Place ${slug.toUpperCase()}`,
  city: "Manila",
  category: "Cafe",
  summary: "A cozy cafe.",
  canonicalPath: `/places/manila/${slug}`,
}));
const goodDraft = {
  trend_index: 0,
  meme_format: "POV:",
  title: "POV: umuulan pero gusto mo pa rin ng gala",
  hook: "POV: umuulan, pero ayaw mong ma-stuck sa bahay. Same energy, indoor gala.",
  body: "Rain or shine, tuloy ang gala. Today we picked three spots where the vibe stays cozy kahit maulan: warm drinks, art on the walls and seats you can stay in for hours. Bring the barkada, share a cake, then take the slow way home. Tara na, the couch can wait.",
  picks: [
    { slug: "a", why: "Cozy seats for a long chika." },
    { slug: "b", why: "Warm drinks, art on the walls." },
    { slug: "c", why: "Easy to reach, good for groups." },
  ],
};
const context = { signals: [{ title: "Rainy week", source: "PAGASA", url: null, traffic: 0 }], places, angle: "Weekend", date: "2026-10-06", now: new Date("2026-10-06T00:00:00Z") };

test("unsafe trends are dropped; whole words only", () => {
  assert.equal(isSafeTrend("Actor dies at 54"), false);
  assert.equal(isSafeTrend("Impeachment trial day 3"), false);
  assert.equal(isSafeTrend("Evacuation centers open"), false);
  assert.equal(isSafeTrend("Warm weather this weekend"), true);
  assert.equal(isSafeTrend("Matcha latte trend"), true);
});

test("signals are safe, unique and strongest first", () => {
  const picked = pickSignals([
    { title: "Concert tickets", source: "x", url: null, traffic: 100 },
    { title: "concert tickets!", source: "y", url: null, traffic: 50 },
    { title: "Fire in Tondo", source: "z", url: null, traffic: 5000 },
    { title: "[Megathread] Something", source: "r", url: null, traffic: 0 },
    { title: "Ube cheesecake", source: "w", url: null, traffic: 2000 },
  ]);
  assert.deepEqual(picked.map((signal) => signal.title), ["Ube cheesecake", "Concert tickets"]);
});

test("RSS parsers read titles, publishers and traffic", () => {
  const trends = parseGoogleTrendsRss("<item><title>ube</title><ht:approx_traffic>2,000+</ht:approx_traffic><ht:news_item_url>https://x.ph/a</ht:news_item_url><ht:news_item_source>X</ht:news_item_source></item>");
  assert.deepEqual(trends[0], { title: "ube", source: "X", url: "https://x.ph/a", traffic: 2000 });
  const news = parseNewsRss("<item><title>Viral matcha drink - GMA Network</title><link>https://n/1</link></item>", "Google News");
  assert.deepEqual(news[0], { title: "Viral matcha drink", source: "GMA Network", url: "https://n/1", traffic: 0 });
});

test("calendar angle uses real signals in priority order", () => {
  assert.equal(calendarAngle(new Date("2026-10-06T00:00:00Z"), 80, null), "Rain likely in Metro Manila today (80% chance)");
  assert.equal(calendarAngle(new Date("2026-10-15T00:00:00Z"), 10, null), "Payday");
  assert.equal(calendarAngle(new Date("2026-11-01T00:00:00Z"), 90, "All Saints' Day"), "Holiday today: All Saints' Day");
  assert.equal(calendarAngle(new Date("2026-10-09T00:00:00Z"), 0, null), "Friday night");
});

test("a good draft becomes a post with linked picks", () => {
  const result = validateDraft(goodDraft, context);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.post.picks.length, 3);
    assert.equal(result.post.picks[0].canonicalPath, "/places/manila/a");
    assert.equal(result.post.trend?.title, "Rainy week");
    assert.match(result.post.slug, /^2026-10-06-pov-umuulan/);
  }
});

test("drafts with invented places, hedges or slop are rejected", () => {
  const unknown = validateDraft({ ...goodDraft, picks: [...goodDraft.picks.slice(0, 2), { slug: "zzz", why: "Made up." }] }, context);
  assert.equal(unknown.ok, false);
  const hedge = validateDraft({ ...goodDraft, body: `${goodDraft.body} Check the hours before going.` }, context);
  assert.equal(hedge.ok, false);
  const slop = validateDraft({ ...goodDraft, hook: "Unlock the best rainy-day gala in the city today." }, context);
  assert.equal(slop.ok, false);
});

test("rotation skips recently used places when it can", () => {
  const rotated = rotatePlaces(places, new Set(["a", "b"]), 0, 2);
  assert.deepEqual(rotated.map((place) => place.slug), ["c", "d"]);
  assert.equal(slugifyTitle("2026-10-06", "Tara na! Ube szn ✨"), "2026-10-06-tara-na-ube");
});
