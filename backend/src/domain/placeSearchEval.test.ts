import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalPlaces, runSearchEval } from "../../scripts/search-eval/evaluate";
import { isOpenNow } from "../utils/openingHours";
import { resolveDestination } from "../utils/phDestinations";
import { isGalaWorthySlug } from "../utils/galaWorthy";
import { correctTypo, parseQueryIntent } from "./queryIntent";
import { rankPlaces, searchPlacesInArea } from "./placeSearch";

// Against the snapshot of live places in scripts/search-eval (run `npx tsx scripts/search-eval/evaluate.ts` for the report).
const clock = new Date("2026-10-17T02:00:00Z");
const search = (query: string) => searchPlacesInArea(evalPlaces, query, {}, { now: clock });
const slugs = (query: string, count = 5) => search(query).ranked.slice(0, count).map(({ place }) => place.slug);
const cityOf = (slug: string) => evalPlaces.find((place) => place.slug === slug)?.city;

describe("search eval", () => {
  it("meets the quality bar on the whole query set, fast, with no hidden places", () => {
    const report = runSearchEval();
    assert.ok(report.precisionAt5 >= 0.9, `precision@5 ${report.precisionAt5}`);
    assert.ok(report.mrr >= 0.85, `MRR ${report.mrr}`);
    assert.ok(report.p95Ms < 200, `p95 ${report.p95Ms} ms`);
    assert.deepEqual(report.hiddenLeaks, []);
  });
});

describe("search understanding", () => {
  it("reads nicknames and place names typed as one word", () => {
    for (const query of ["bora", "bora bora"]) assert.ok(slugs(query).every((slug) => cityOf(slug) === "Boracay"), query);
    assert.ok(slugs("sarg").every((slug) => cityOf(slug) === "Siargao"));
    assert.ok(slugs("elnido").every((slug) => cityOf(slug) === "El Nido"));
    assert.equal(slugs("mt apo")[0], "mount-apo");
  });

  it("fixes typos, says what it read, and leaves real words alone", () => {
    const falls = search("waterfals");
    assert.equal(falls.didYouMean, "waterfalls");
    assert.ok(falls.ranked.length > 5);
    assert.equal(search("chocolate hils").ranked[0].place.slug, "chocolate-hills-carmen");
    assert.equal(search("intramuros").didYouMean, null);
    // "tokyo" is not a misspelt "toyo", and "dining" is a word places use, not a typo of "diving".
    assert.deepEqual(search("tokyo").ranked, []);
    assert.deepEqual(parseQueryIntent("fine dining", evalPlaces).corrections, []);
    assert.equal(correctTypo("hils", new Set(["hills"])), "hills");
    assert.equal(correctTypo("hall", new Set(["hill"])), "hall", "a four-letter word may only gain or lose a letter");
  });

  it("puts a place named outright first, whatever its words also mean", () => {
    assert.equal(slugs("rizal park")[0], "rizal-park-luneta-park");
    assert.equal(slugs("white beach boracay")[0], "white-beach-boracay");
  });

  it("drops the question around a place and never writes a broken note", () => {
    for (const query of ["is boracay worth it", "how to get to siargao", "things to do in cebu"]) {
      const { ranked, note } = search(query);
      assert.ok(ranked.length >= 5, query);
      assert.equal(note, null, query);
    }
  });

  it("shows both sides of an either-or, taking turns", () => {
    const cities = slugs("el nido or coron", 4).map(cityOf);
    assert.deepEqual(new Set(cities), new Set(["El Nido", "Coron"]));
    assert.notEqual(cities[0], cities[1]);
  });

  it("sends a trip from Manila out of Metro Manila, within a few hours", () => {
    const trip = search("weekend trip from manila").ranked;
    assert.ok(trip.length >= 10);
    assert.ok(trip.every(({ place }) => resolveDestination(place.city, place.area)?.provinceName !== "Metro Manila"));
    assert.ok(search("day trip from manila").ranked.every(({ place }) => resolveDestination(place.city, place.area)?.provinceName !== "Metro Manila"));
  });

  it("keeps only places open now when asked, by their hours", () => {
    const open = search("open now").ranked;
    assert.ok(open.length > 0);
    assert.ok(open.every(({ place }) => isOpenNow(place.opening_hours, clock).state === "open"));
    assert.ok(rankPlaces(evalPlaces, "museum", {}, { now: clock, openNow: true }).every(({ place }) => place.category === "Museum" && isOpenNow(place.opening_hours, clock).state === "open"));
  });

  it("notices near me, so the app can offer its location button", () => {
    const nearMe = search("date spot near me");
    assert.equal(nearMe.nearMe, true);
    assert.ok(nearMe.ranked.length > 0);
    assert.equal(search("date spot").nearMe, false);
  });

  it("widens a thinly covered town to its neighbours, and says so", () => {
    const nightlife = search("nightlife manila");
    assert.equal(nightlife.ranked[0].place.slug, "poblacion-makati");
    assert.match(nightlife.note ?? "", /nearby/);
    const dumaguete = search("dumaguete");
    assert.ok(dumaguete.ranked.slice(0, 3).every(({ place }) => resolveDestination(place.city, place.area)?.provinceName === "Negros Oriental"));
  });

  it("reads island groups and regions", () => {
    const mindanao = new Set(["Zamboanga Peninsula", "Northern Mindanao", "Davao Region", "Caraga", "Soccsksargen"]);
    const ranked = search("mindanao").ranked;
    assert.ok(ranked.length >= 10);
    assert.ok(ranked.every(({ place }) => mindanao.has(resolveDestination(place.city, place.area)?.regionName ?? "")));
    assert.ok(search("metro manila").ranked.every(({ place }) => resolveDestination(place.city, place.area)?.provinceName === "Metro Manila"));
  });

  it("ranks the fun spots of a town above its hotel, and never a church for kids", () => {
    assert.notEqual(slugs("tagaytay")[0], "taal-vista-hotel-tagaytay");
    assert.ok(!slugs("kid friendly", 3).some((slug) => /church|cathedral|basilica/.test(slug)));
  });

  it("never returns a hidden place", () => {
    for (const query of ["beach", "manila", "bora", "free", "near me"]) {
      assert.ok(search(query).ranked.every(({ place }) => isGalaWorthySlug(place.slug)), query);
    }
  });
});
