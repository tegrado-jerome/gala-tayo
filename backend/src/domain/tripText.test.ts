import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalPlaces } from "../../scripts/search-eval/evaluate";
import { matchChunk, matchTripStops, parseTripText, readBudget, readDate, readGroupSize } from "./tripText";

const today = new Date("2026-10-13T00:00:00Z");
const slugsOf = (chunk: string, text = "") => matchChunk(chunk, evalPlaces, text).map((place) => place.slug);

describe("trip text", () => {
  it("splits days, including several on one line", () => {
    const parsed = parseTripText("Day 1: El Nido tour A, Nacpan Beach Day 2: Las Cabanas Beach\nD3 - Lio Beach", today);
    assert.deepEqual(parsed.lines, [
      { day: 1, text: "El Nido tour A, Nacpan Beach" },
      { day: 2, text: "Las Cabanas Beach" },
      { day: 3, text: "Lio Beach" },
    ]);
  });

  it("reads budget, group size and the start date", () => {
    assert.deepEqual(readBudget("4 pax, 10-15k budget"), { amount: 15000, per: "group" });
    assert.deepEqual(readBudget("Budget: ₱3,500 per pax"), { amount: 3500, per: "person" });
    assert.deepEqual(readBudget("3k/pax budget"), { amount: 3000, per: "person" });
    assert.equal(readBudget("Day 2 of 3"), null);
    assert.equal(readGroupSize("4 pax, 10-15k budget"), 4);
    assert.equal(readGroupSize("barkada of 6"), 6);
    assert.equal(readDate("Dec 27-30", today)?.toISOString().slice(0, 10), "2026-12-27");
    assert.equal(readDate("27 March", today)?.toISOString().slice(0, 10), "2027-03-27");
    assert.equal(readDate("2027-01-02", today)?.toISOString().slice(0, 10), "2027-01-02");
    // A date written on Day 2 puts Day 1 the day before.
    assert.equal(parseTripText("Day 1: Intramuros\nDay 2 (Dec 28): Fort Santiago", today).startDate, "2026-12-27");
  });

  it("matches names with typos, nicknames and filler words, and names inside a tour's parenthesis", () => {
    assert.deepEqual(slugsOf("El Nido tour A"), ["el-nido-tour-a-lagoons"]);
    assert.deepEqual(slugsOf("chocolate hils"), ["chocolate-hills-carmen"]);
    assert.deepEqual(slugsOf("intramurso walking tour"), ["intramuros"]);
    assert.deepEqual(slugsOf("swim at Kawasan Falls early"), ["kawasan-falls-badian"]);
    assert.deepEqual(slugsOf("Big Lagoon kayak"), ["el-nido-tour-a-lagoons"]);
    assert.deepEqual(slugsOf("Twin Lagoon and Kayangan Lake"), ["twin-lagoon-coron", "kayangan-lake-coron"]);
  });

  it("never guesses: a town, a category or an unknown spot matches nothing", () => {
    assert.deepEqual(slugsOf("El Nido"), []);
    assert.deepEqual(slugsOf("arrive Coron town, check in"), []);
    assert.deepEqual(slugsOf("beach"), []);
    assert.deepEqual(slugsOf("bora"), []);
    assert.deepEqual(slugsOf("lunch at a carinderia"), []);
  });

  it("reads a Reddit-style itinerary end to end", () => {
    const text = "Coron 3D2N, 4 pax, budget 15k\nDay 1 (Dec 27): arrive 10am, Mt Tapyas sunset\nDay 2: Kayangan Lake, Twin Lagoon, lunch\nDay 3: Maquinit hot spring then fly out";
    const parsed = parseTripText(text, today);
    assert.equal(parsed.startDate, "2026-12-27");
    assert.equal(parsed.groupSize, 4);
    assert.deepEqual(parsed.budget, { amount: 15000, per: "group" });
    const { stops, unmatched } = matchTripStops(parsed, evalPlaces);
    assert.deepEqual(stops.map((stop) => `${stop.day} ${stop.place.slug}`), [
      "1 mt-tapyas-coron",
      "2 kayangan-lake-coron",
      "2 twin-lagoon-coron",
      "3 maquinit-hot-spring-coron",
    ]);
    assert.ok(unmatched.every((line) => !/pax|budget/.test(line.text)));
  });
});

describe("trip text, towns in slugs", () => {
  it("a province or town that only appears in a slug matches nothing", () => {
    assert.deepEqual(matchChunk("Palawan", evalPlaces), []);
    assert.deepEqual(matchChunk("Puerto Princesa", evalPlaces), []);
  });
});
