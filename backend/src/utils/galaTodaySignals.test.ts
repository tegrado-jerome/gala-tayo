import assert from "node:assert/strict";
import test from "node:test";
import {
  bestPhrasing,
  chooseAngle,
  chooseRegion,
  clusterAround,
  dayContext,
  describeRain,
  distanceKm,
  evergreenAngles,
  isSafePostText,
  isSafeTrend,
  parseAutocomplete,
  parseGoogleTrendsRss,
  parseHourlyWeather,
  parseNewsRss,
  pickSignals,
  rotatePlaces,
  scoreTrends,
  trendKind,
  trustedTrendUrl,
  usableTrends,
  type AnglePlace,
  type HourlyWeather,
} from "./galaTodaySignals";

test("unsafe trends are dropped; whole words only", () => {
  assert.equal(isSafeTrend("Actor dies at 54"), false);
  assert.equal(isSafeTrend("Impeachment trial day 3"), false);
  assert.equal(isSafeTrend("Fact check: viral fire trikes"), false);
  assert.equal(isSafeTrend("Solon asks police to identify animal abuser"), false);
  assert.equal(isSafeTrend("Warm weather this weekend"), true);
  assert.equal(isSafeTrend("Matcha latte trend"), true);
  // Seen on Google Trends PH, Oct 2026, with an adult page as its news link.
  assert.equal(isSafeTrend("~(@Trending)^pinay 1v5 viral video"), false);
  assert.equal(isSafeTrend("viral video 1vs5 kambal"), false);
  assert.equal(isSafeTrend("Naked Island hopping in Siargao"), true, "a real island name is not adult content");
});

test("post text allows everyday travel words that only mean trouble in a headline", () => {
  assert.equal(isSafePostText("Bring a fully charged power bank and catch the fire dancers by the basketball court."), true);
  assert.equal(isSafeTrend("Bring a fully charged power bank"), false);
  assert.equal(isSafePostText("Where the national hero was executed, a murder mystery"), false);
});

test("trend links on the page are trusted news or Reddit pages only", () => {
  assert.equal(trustedTrendUrl("https://news.google.com/rss/articles/abc?oc=5"), "https://news.google.com/rss/articles/abc?oc=5");
  assert.equal(trustedTrendUrl("https://www.reddit.com/r/Philippines/comments/x"), "https://www.reddit.com/r/Philippines/comments/x");
  assert.equal(trustedTrendUrl("https://um.mos.ru/uploads/virtual_tours/x.html?id=asian-xxx-videos"), null);
  assert.equal(trustedTrendUrl("https://news.google.com.evil.example/a"), null);
  assert.equal(trustedTrendUrl("http://news.google.com/a"), null);
  assert.equal(trustedTrendUrl(null), null);
});

test("signals are safe, one per topic, and count their sources", () => {
  const picked = pickSignals([
    { title: "Concert tickets", source: "x", url: null, traffic: 100 },
    { title: "concert tickets!", source: "y", url: null, traffic: 50 },
    { title: "Fire in Tondo", source: "z", url: null, traffic: 5000 },
    { title: "[Megathread] Something", source: "r", url: null, traffic: 0 },
    { title: "Ube cheesecake", source: "w", url: null, traffic: 2000 },
  ]);
  assert.deepEqual(picked.map((signal) => `${signal.title}:${signal.sources}`), ["Ube cheesecake:1", "Concert tickets:2"]);
});

test("RSS and autocomplete parsers read real payloads", () => {
  const trends = parseGoogleTrendsRss("<item><title>ube</title><ht:approx_traffic>2,000+</ht:approx_traffic><ht:news_item_url>https://x.ph/a</ht:news_item_url><ht:news_item_source>X</ht:news_item_source></item>");
  assert.deepEqual(trends[0], { title: "ube", source: "X", url: "https://x.ph/a", traffic: 2000 });
  const news = parseNewsRss("<item><title>Viral matcha drink - GMA Network</title><link>https://n/1</link></item>", "Google News");
  assert.deepEqual(news[0], { title: "Viral matcha drink", source: "GMA Network", url: "https://n/1", traffic: 0 });
  // Shape of https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=ph&q=ube (Oct 2026).
  assert.deepEqual(parseAutocomplete('["ube",["ube","ube in english","ube halaya","ube cake"],[],{}]'), ["ube", "ube in english", "ube halaya", "ube cake"]);
  assert.deepEqual(parseAutocomplete("<html>"), []);
});

test("phrasing comes from what people actually search", () => {
  assert.equal(bestPhrasing("Ube cheesecake", ["ube cheesecake", "ube cheesecake recipe", "ube cheesecake near me", "ube cheesecake manila"]), "ube cheesecake recipe");
  assert.equal(bestPhrasing("Dubai chocolate", ["dubai chocolate meaning", "dubai chocolate price philippines"]), "dubai chocolate price philippines");
  assert.equal(bestPhrasing("BINI", []), "bini");
});

test("only going-out trends count: our places, festivals and seasons; never unrelated viral news", () => {
  // Trends the old picker forced into posts (Oct 2026 logs) link to nothing.
  for (const title of ["Sassy Southern Dad reacts", "cat whisperer in Dubai", "Mercedes F1 jacket", "nba preseason schedule", "Taylor Swift deep cut"]) {
    assert.equal(trendKind(title), null, title);
  }
  assert.equal(trendKind("MassKara Festival 2026 schedule"), "festival");
  assert.equal(trendKind("long weekend november 2026"), "season");
  assert.equal(trendKind("Intramuros night tour", true), "place");
  assert.equal(trendKind("Baguio strawberry farm", false, true), "place", "a destination plus an outing word");
  assert.equal(trendKind("Baguio mayor", false, true), null, "a destination in ordinary news isn't an outing");
});

test("trend scoring: demand counts only for going-out trends, which beat bigger unrelated traffic", () => {
  // Google Trends PH on 2026-10-06 was mostly NBA; a smaller festival trend should still win.
  const signals = [
    { title: "nba", source: "Google Trends PH", url: null, traffic: 20000, sources: 1 },
    { title: "nba score", source: "Google Trends PH", url: null, traffic: 10000, sources: 1 },
    { title: "Panagbenga festival", source: "Google News", url: null, traffic: 0, sources: 2 },
    { title: "Burnham Park boat ride", source: "Google News", url: null, traffic: 0, sources: 1 },
  ];
  const autocomplete = new Map([
    ["panagbenga festival", ["panagbenga festival", "panagbenga festival 2027 schedule", "panagbenga festival meaning"]],
    ["nba", ["nba", "nba schedule", "nba score"]],
  ]);
  const scored = scoreTrends(signals, autocomplete, { namesOurPlace: (title) => /burnham park/i.test(title), namesDestination: () => false });
  assert.equal(scored[0].title, "Panagbenga festival");
  assert.equal(scored[0].kind, "festival");
  assert.equal(scored[0].demand, 3);
  assert.equal(scored[0].query, "panagbenga festival 2027 schedule");
  assert.equal(scored.find((trend) => trend.title === "nba")?.score, 0);
  assert.deepEqual(usableTrends(scored).map((trend) => trend.title), ["Panagbenga festival", "Burnham Park boat ride"]);
  // Already used recently → only the place trend is left.
  assert.deepEqual(usableTrends(scored, new Set(["panagbenga festival"])).map((trend) => trend.title), ["Burnham Park boat ride"]);
});

test("evergreen angles: the day's occasion first, then a rotation, never a recent one", () => {
  const place = (category: string, goodFor: string[], description = ""): AnglePlace => ({ category, goodFor, description });
  const museums = [1, 2, 3, 4].map(() => place("Museum", ["Family Trip", "Photo Walk"]));
  const parks = [1, 2, 3, 4].map(() => place("Park", ["Casual Date", "Nature Escape"], "Stay for the sunset."));
  const all = [...museums, ...parks];
  const pick = (day: string, rainy: boolean, recent = new Set<string>(), seed = 0) => chooseAngle(evergreenAngles("Metro Manila", day, rainy), all, seed, recent);
  assert.equal(pick("Weekday", true).query, "rainy day activities in Metro Manila");
  assert.equal(pick("Friday", false).query, "date ideas in Metro Manila");
  assert.equal(pick("Payday", false).id, "payday");
  assert.equal(pick("Holiday: National Heroes Day", false).query, "things to do in Metro Manila this holiday");
  assert.equal(pick("Weekend", false).query, "things to do in Metro Manila this weekend");
  // Plain weekday: rotates through evergreen angles that have at least 4 fitting places.
  const weekday = [0, 1, 2, 3, 4, 5].map((seed) => pick("Weekday", false, new Set(), seed).id);
  assert.ok(weekday.every((id) => ["photo", "sunset", "family", "nature", "history", "things-to-do"].includes(id)), weekday.join());
  assert.ok(!weekday.includes("adventure"), "no angle without enough fitting places");
  assert.notEqual(pick("Weekday", true, new Set(["rainy day activities in metro manila"])).id, "rainy", "never the same angle as a recent post");
});

test("day-trip clusters keep picks within reach; regions can be a flight apart", () => {
  const manila: [number, number] = [14.5995, 120.9842];
  const makati: [number, number] = [14.5547, 121.0244];
  const batanes: [number, number] = [20.4487, 121.9702];
  const penablanca: [number, number] = [17.6258, 121.7856];
  assert.ok(distanceKm(manila, makati) < 10);
  assert.ok(distanceKm(batanes, penablanca) > 250, "Callao Cave and Batanes were once one 'Cagayan Valley' post");
  const places = [
    { slug: "fort", center: manila },
    { slug: "ayala", center: makati },
    { slug: "callao", center: penablanca },
  ];
  assert.deepEqual(clusterAround(manila, places).map((place) => place.slug), ["fort", "ayala"]);
});

const hours = (values: Array<[number, number, number]>): HourlyWeather[] =>
  values.map(([hour, probability, mm]) => ({ time: `2026-10-06T${String(hour).padStart(2, "0")}:00`, probability, mm }));

test("weather wording: human time windows, never percentages", () => {
  const dry = hours([[9, 90, 0.1], [14, 40, 3], [15, 60, 2]]);
  assert.equal(describeRain(dry), null, "high chance with almost no rain, or real rain at low chance, is not 'likely'");
  assert.deepEqual(describeRain(hours([[13, 20, 0], [14, 80, 2], [15, 85, 3], [16, 75, 1.2], [17, 30, 0]])), { line: "Afternoon showers likely, 2–5 PM", rainy: true });
  assert.deepEqual(describeRain(hours([[10, 75, 0.6], [11, 80, 0.8], [12, 90, 0.7]])), { line: "Light rain on and off, 10 AM–1 PM", rainy: true });
  assert.deepEqual(describeRain(hours([[18, 90, 9], [19, 95, 12]])), { line: "Heavy evening rain likely, 6–8 PM", rainy: true });
  const allDay = hours(Array.from({ length: 12 }, (_, index) => [8 + index, 90, 3] as [number, number, number]));
  assert.deepEqual(describeRain(allDay), { line: "Showers on and off most of the day", rainy: true });
  // Only the hours that are still ahead count (the afternoon post ignores morning rain).
  assert.equal(describeRain(hours([[9, 90, 4], [10, 90, 4]]), 16), null);
  for (const result of [describeRain(allDay), describeRain(hours([[14, 80, 2]]))]) assert.doesNotMatch(result?.line ?? "", /%|\d+(\.\d+)? ?mm/);
  const parsed = parseHourlyWeather('{"hourly":{"time":["2026-10-06T14:00"],"precipitation_probability":[80],"precipitation":[2.1]}}');
  assert.deepEqual(parsed, [{ time: "2026-10-06T14:00", probability: 80, mm: 2.1 }]);
});

test("day context, region and rotation", () => {
  assert.equal(dayContext(new Date("2026-10-15T00:00:00Z"), null), "Payday");
  assert.equal(dayContext(new Date("2026-11-01T00:00:00Z"), "All Saints' Day"), "Holiday: All Saints' Day");
  assert.equal(dayContext(new Date("2026-10-09T00:00:00Z"), null), "Friday", "not \"Friday night\": writers then planned museum nights");
  assert.equal(chooseRegion(false, 5, ["calabarzon", "metro-manila"]), "metro-manila");
  assert.equal(chooseRegion(true, 1, ["calabarzon", "central-luzon", "metro-manila"]), "central-luzon");
  assert.equal(chooseRegion(false, 1, ["calabarzon", "ilocos-region", "metro-manila"], "ilocos-region"), "ilocos-region", "a trend that names a region wins");
  assert.equal(chooseRegion(false, 1, ["calabarzon", "metro-manila"], "bicol-region"), "metro-manila", "unless that region has too few places");
  const places = ["a", "b", "c", "d"].map((slug) => ({ slug }));
  assert.deepEqual(rotatePlaces(places, new Set(["a", "b"]), 0, 2).map((place) => place.slug), ["c", "d"]);
});
