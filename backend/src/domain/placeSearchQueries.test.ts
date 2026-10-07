import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleFixturePlaces } from "../services/assistant/fixtures/testPlaces";
import { correctTypo, isIndoorPlace, parseQueryIntent } from "./queryIntent";
import { rankPlaces } from "./placeSearch";

// Real searches from QA (round 3) against the fixture snapshot of live places.
// `top`: these must be the first results, in any order. `include`: must be in the first `within`.
// `exclude`: must not appear at all. `none`: no results is the honest answer.
type Case = { query: string; top?: string[]; include?: string[]; within?: number; exclude?: string[]; none?: true; every?: (slug: string) => boolean };

const place = (slug: string) => visibleFixturePlaces.find((entry) => entry.slug === slug)!;

const CASES: Case[] = [
  // Dishes and things: only places whose own data has them, never a beach that mentions halo-halo.
  { query: "sisig", top: ["aling-lucing-sisig-angeles"], exclude: ["mount-arayat-pampanga", "zubuchon-cebu"] },
  { query: "halo-halo", top: ["halo-halo-de-iloko-san-fernando-la-union"], exclude: ["nacpan-beach-el-nido"] },
  { query: "night market", top: ["baguio-night-market"], exclude: ["batad-rice-terraces-banaue", "apo-island-dauin"] },
  { query: "fort santiago", top: ["fort-santiago"], exclude: ["miagao-church", "fortune-island-nasugbu"] },
  { query: "hot spring", top: ["maquinit-hot-spring-coron"], exclude: ["fort-santiago"] },
  { query: "chocolate hills", top: ["chocolate-hills-carmen"] },
  { query: "strawberry", include: ["la-trinidad-strawberry-farm"], within: 1 },
  { query: "aquarium", top: ["manila-ocean-park"] },
  { query: "zoo", include: ["calauit-safari-park-busuanga"], within: 3 },
  { query: "glamping", include: ["anawangin-cove-zambales", "nagsasa-cove-zambales"], within: 3 },
  { query: "sand dunes", none: true },
  { query: "xylophone", none: true },
  // Typos in place and area names.
  { query: "baguoi", every: (slug) => /baguio/i.test(place(slug).city ?? "") },
  { query: "Bagiuo", include: ["burnham-park-baguio"], within: 5 },
  { query: "intramurso", include: ["intramuros", "fort-santiago"], within: 3 },
  // Tagalog words.
  { query: "talon", every: (slug) => /falls/i.test(place(slug).name) || place(slug).tags.includes("waterfall"), exclude: ["osmena-peak-dalaguete", "salagdoong-beach-maria"] },
  { query: "bundok", include: ["mount-pulag-kabayan", "mount-apo"], within: 5, exclude: ["blue-lagoon-pagudpud"] },
  { query: "dagat", include: ["white-beach-boracay"], within: 3, exclude: ["manila-ocean-park", "kapurpurawan-rock-formation-burgos", "maquinit-hot-spring-coron"] },
  { query: "kape", include: ["cafe-by-the-ruins-baguio", "calea-pastries-bacolod"], within: 3, exclude: ["fort-santiago"] },
  { query: "kapehan", include: ["cafe-by-the-ruins-baguio"], within: 3 },
  { query: "simbahan", include: ["san-agustin-church", "manila-cathedral"], within: 3 },
  { query: "kweba", include: ["sumaguing-cave-sagada", "hinagdanan-cave-dauis"], within: 5 },
  // Vibes.
  { query: "date", include: ["toyo-eatery", "gallery-by-chele"], within: 5, every: (slug) => place(slug).good_for.some((tag) => /date|anniversary|special occasion/i.test(tag)) || place(slug).tags.some((tag) => /date/i.test(tag)) },
  { query: "romantic", include: ["toyo-eatery"], within: 5 },
  { query: "barkada", every: (slug) => place(slug).good_for.includes("Barkada Hangout") || place(slug).tags.some((tag) => /barkada|group/.test(tag)) },
  { query: "family", include: ["the-mind-museum", "star-city"], within: 3 },
  { query: "kids", include: ["the-mind-museum", "star-city"], within: 3 },
  { query: "nightlife", top: ["poblacion-makati"] },
  { query: "view", include: ["kiltepan-viewpoint-sagada", "mines-view-park-baguio"], within: 5 },
  { query: "sunset", include: ["boracay-sunset-paraw-sailing"], within: 1 },
  { query: "libre", every: (slug) => place(slug).budget_min === 0 },
  { query: "free museum manila", top: ["national-museum-of-fine-arts", "national-museum-of-natural-history"] },
  { query: "rainy day", every: (slug) => isIndoorPlace(place(slug)) === true },
  { query: "museum", every: (slug) => place(slug).category === "Museum" },
  { query: "food trip", include: ["aling-lucing-sisig-angeles", "binondo-chinatown"], within: 30, exclude: ["siargao-island-hopping", "ayala-museum"] },
  { query: "mountain", include: ["mount-pulag-kabayan"], within: 3, exclude: ["national-museum-of-natural-history"] },
  { query: "beach", include: ["white-beach-boracay"], within: 3, every: (slug) => place(slug).category !== "Food" },
  // Vibe plus place.
  { query: "date makati", include: ["toyo-eatery", "blackbird-at-the-nielson-tower"], within: 4, every: (slug) => place(slug).city === "Makati" },
  { query: "barkada qc", include: ["la-mesa-eco-park", "cubao-expo"], within: 3, every: (slug) => place(slug).city === "Quezon City" },
  { query: "coffee baguio", top: ["cafe-by-the-ruins-baguio"], every: (slug) => place(slug).city === "Baguio" },
  { query: "waterfalls cebu", include: ["kawasan-falls-badian", "tumalog-falls-oslob"], within: 3 },
  { query: "beach batangas", top: ["laiya-beach-san-juan-batangas"] },
  { query: "island hopping coron", every: (slug) => ["Coron", "Busuanga"].includes(place(slug).city ?? "") },
  { query: "el nido", every: (slug) => place(slug).city === "El Nido" },
  { query: "lake", include: ["kayangan-lake-coron"], within: 4 },
];

describe("search: real queries", () => {
  for (const testCase of CASES) {
    it(testCase.query, () => {
      const slugs = rankPlaces(visibleFixturePlaces, testCase.query).map((result) => result.place.slug);
      if (testCase.none) {
        assert.deepEqual(slugs, [], `${testCase.query} should find nothing`);
        return;
      }
      assert.ok(slugs.length > 0, `${testCase.query} found nothing`);
      if (testCase.top) assert.deepEqual(slugs.slice(0, testCase.top.length).sort(), [...testCase.top].sort());
      for (const slug of testCase.include ?? []) assert.ok(slugs.slice(0, testCase.within ?? 5).includes(slug), `${slug} not in the first ${testCase.within ?? 5}: ${slugs.slice(0, 8).join(", ")}`);
      for (const slug of testCase.exclude ?? []) assert.ok(!slugs.includes(slug), `${slug} should not match ${testCase.query}`);
      if (testCase.every) for (const slug of slugs) assert.ok(testCase.every(slug), `${slug} doesn't fit ${testCase.query}`);
    });
  }
});

describe("query understanding", () => {
  it("fixes typos against place and area names only when close", () => {
    const vocabulary = new Set(["baguio", "intramuros", "boracay"]);
    assert.equal(correctTypo("baguoi", vocabulary), "baguio");
    assert.equal(correctTypo("intramurso", vocabulary), "intramuros");
    assert.equal(correctTypo("borcay", vocabulary), "boracay");
    // Short words and known words are never "corrected".
    assert.equal(correctTypo("bay", vocabulary), "bay");
    assert.equal(correctTypo("talon", vocabulary), "talon");
  });

  it("reads Tagalog and vibe words as vibes, not text to find", () => {
    const intent = parseQueryIntent("libreng talon na may view para sa barkada", visibleFixturePlaces);
    assert.deepEqual([...intent.vibes].sort(), ["barkada", "free", "view", "waterfall"]);
    assert.deepEqual(intent.terms, []);
  });

  it("maps an explicit good-for filter to the labels editors use", () => {
    const dates = rankPlaces(visibleFixturePlaces, "", { good_for: "date" });
    assert.ok(dates.length > 20);
    assert.ok(dates.some((result) => result.place.slug === "toyo-eatery"));
  });
});
