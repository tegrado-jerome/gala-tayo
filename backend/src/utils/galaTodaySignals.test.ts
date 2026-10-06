import assert from "node:assert/strict";
import test from "node:test";
import {
  bestPhrasing,
  chooseRegion,
  chooseTrend,
  dayContext,
  describeRain,
  isSafeTrend,
  linkScore,
  parseAutocomplete,
  parseGoogleTrendsRss,
  parseHourlyWeather,
  parseNewsRss,
  pickEvergreenQuery,
  pickSignals,
  rotatePlaces,
  scoreTrends,
  type HourlyWeather,
} from "./galaTodaySignals";

test("unsafe trends are dropped; whole words only", () => {
  assert.equal(isSafeTrend("Actor dies at 54"), false);
  assert.equal(isSafeTrend("Impeachment trial day 3"), false);
  assert.equal(isSafeTrend("Fact check: viral fire trikes"), false);
  assert.equal(isSafeTrend("Solon asks police to identify animal abuser"), false);
  assert.equal(isSafeTrend("Warm weather this weekend"), true);
  assert.equal(isSafeTrend("Matcha latte trend"), true);
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

test("link score: food, events and travel link; weather and sports scores don't", () => {
  assert.equal(linkScore("Ube cheesecake"), 1);
  assert.equal(linkScore("BINI concert"), 0.9);
  assert.equal(linkScore("el niño"), 0);
  assert.equal(linkScore("nba score"), 0);
  assert.equal(linkScore("nba"), 0.2);
  assert.equal(linkScore("rainbow cake"), 1);
  assert.equal(linkScore("carlos alcaraz"), 0.3);
});

test("phrasing comes from what people actually search", () => {
  assert.equal(bestPhrasing("Ube cheesecake", ["ube cheesecake", "ube cheesecake recipe", "ube cheesecake near me", "ube cheesecake manila"]), "ube cheesecake recipe");
  assert.equal(bestPhrasing("Dubai chocolate", ["dubai chocolate meaning", "dubai chocolate price philippines"]), "dubai chocolate price philippines");
  assert.equal(bestPhrasing("BINI", []), "bini");
});

test("trend scoring: demand × link; the best linkable trend wins over bigger sports traffic", () => {
  // Google Trends PH on 2026-10-06 was mostly NBA; a smaller food trend should still win.
  const signals = [
    { title: "nba", source: "Google Trends PH", url: null, traffic: 20000, sources: 1 },
    { title: "nba score", source: "Google Trends PH", url: null, traffic: 10000, sources: 1 },
    { title: "el niño", source: "Google Trends PH", url: null, traffic: 5000, sources: 1 },
    { title: "Dubai chocolate", source: "Google News", url: null, traffic: 0, sources: 2 },
    { title: "carlos alcaraz", source: "Google Trends PH", url: null, traffic: 500, sources: 1 },
  ];
  const autocomplete = new Map([
    ["dubai chocolate", ["dubai chocolate", "dubai chocolate price philippines", "dubai chocolate near me"]],
    ["nba", ["nba", "nba schedule", "nba score"]],
  ]);
  const scored = scoreTrends(signals, autocomplete);
  assert.equal(scored[0].title, "Dubai chocolate");
  assert.equal(scored[0].demand, 3);
  assert.equal(scored[0].query, "dubai chocolate price philippines");
  const best = chooseTrend(scored);
  assert.equal(best?.title, "Dubai chocolate");
  // Already used recently → nothing else links well enough → evergreen fallback (null).
  assert.equal(chooseTrend(scored, new Set(["dubai chocolate"])), null);
});

test("evergreen fallback uses the region's top autocomplete search", () => {
  const suggestions = [
    ["things to do in metro manila", "things to do in metro manila this weekend", "things to do in metro manila reddit", "what to do in metro manila during holy week"],
    ["where to go in metro manila", "where to go in metro manila at night"],
    [],
    [],
  ];
  assert.equal(pickEvergreenQuery("Metro Manila", suggestions), "things to do in metro manila this weekend");
  assert.equal(pickEvergreenQuery("Metro Manila", suggestions, 1), "where to go in metro manila at night");
  assert.equal(pickEvergreenQuery("Ilocos Region", [[], [], [], []]), "things to do in ilocos region");
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
  assert.equal(dayContext(new Date("2026-10-09T00:00:00Z"), null), "Friday night");
  assert.equal(chooseRegion(false, 5, ["calabarzon", "metro-manila"]), "metro-manila");
  assert.equal(chooseRegion(true, 1, ["calabarzon", "central-luzon", "metro-manila"]), "central-luzon");
  assert.equal(chooseRegion(false, 1, ["calabarzon", "ilocos-region", "metro-manila"], "ilocos-region"), "ilocos-region", "a trend that names a region wins");
  assert.equal(chooseRegion(false, 1, ["calabarzon", "metro-manila"], "bicol-region"), "metro-manila", "unless that region has too few places");
  const places = ["a", "b", "c", "d"].map((slug) => ({ slug }));
  assert.deepEqual(rotatePlaces(places, new Set(["a", "b"]), 0, 2).map((place) => place.slug), ["c", "d"]);
});
