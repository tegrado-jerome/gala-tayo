import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import { buildFallbackDraft, findUncoveredArea, parseDraft, parseGroupSize, resolvePlanDate, resolvePromptDate, scheduleStops, selectCandidates } from "./galaPlanDraftPlanner";

function place(overrides: Partial<NormalizedPlace>): NormalizedPlace {
  return {
    id: "id",
    name: "Place",
    slug: "place",
    category: "Food",
    address: null,
    city: "Makati",
    area: null,
    latitude: 14.55,
    longitude: 121.02,
    google_maps_url: null,
    description: null,
    best_time_to_visit: null,
    visit_duration: null,
    good_for: [],
    commute_access: null,
    parking_info: null,
    budget_min: null,
    budget_note: null,
    price_level: null,
    faqs: [],
    search_terms: [],
    tags: [],
    average_rating: 4,
    review_count: 0,
    status: "active",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("selectCandidates", () => {
  const places = [
    place({ id: "a", name: "Some Thai", category: "Food", city: "Taguig" }),
    place({ id: "b", name: "Glorietta Cinemas", category: "Cinema", city: "Makati" }),
    place({ id: "c", name: "Venice Grand Canal", category: "Mall", city: "Taguig" }),
    place({ id: "d", name: "No Pin Cafe", category: "Cafe", city: "Taguig", latitude: null }),
  ];

  it("ranks places in an aliased area first and drops places without coordinates", () => {
    const ids = selectCandidates(places, "Date sa BGC, dinner tapos sine").map((entry) => entry.id);
    assert.equal(ids.includes("d"), false);
    assert.equal(ids[0], "a");
  });

  it("stays in Metro Manila unless the prompt names another destination", () => {
    const mixed = [
      place({ id: "baguio", name: "Pine Cafe", category: "Cafe", city: "Baguio", average_rating: 5 }),
      place({ id: "makati", name: "Corner Cafe", category: "Cafe", city: "Makati", average_rating: 3 }),
    ];
    assert.equal(selectCandidates(mixed, "Chill cafe date")[0].id, "makati");
    assert.equal(selectCandidates(mixed, "Cafe hopping sa Baguio")[0].id, "baguio");
  });
});

describe("parseDraft", () => {
  const candidates = [
    place({ id: "a", name: "Some Thai" }),
    place({ id: "b", name: "Glorietta Cinemas", category: "Cinema" }),
    place({ id: "c", name: "Venice Grand Canal", category: "Mall" }),
  ];

  it("keeps only known, unique stops and clamps values", () => {
    const draft = parseDraft(
      JSON.stringify({
        title: "BGC date",
        group_size: 2,
        stops: [
          { ref: "p1", time: "18:30", minutes: 500, note: "Dinner" },
          { ref: "p1", time: "19:00", minutes: 60, note: "Duplicate" },
          { ref: "p9", time: "20:00", minutes: 60, note: "Unknown" },
          { ref: "p2", time: "25:99", minutes: 10, note: "Movie" },
        ],
      }),
      candidates,
    );

    assert.ok(draft && "stops" in draft);
    assert.deepEqual(draft.stops.map((stop) => stop.place_id), ["a", "b"]);
    assert.equal(draft.stops[0].minutes, 240);
    assert.equal(draft.stops[1].minutes, 30);
    assert.equal(draft.stops[1].time, "");
  });

  it("repairs loose output: fences, trailing commas, 12h times, ids or names instead of refs", () => {
    const raw = '```json\n{"title":"Gala","itinerary":[{"place_id":"c","time":"3:30 PM","duration":"2 hours"},{"name":"some thai","time":"7pm","minutes":"90"},]}\n```';
    const draft = parseDraft(raw, candidates);
    assert.ok(draft && "stops" in draft);
    assert.deepEqual(
      draft.stops.map((stop) => [stop.place_id, stop.time, stop.minutes]),
      [
        ["c", "15:30", 120],
        ["a", "19:00", 90],
      ],
    );
  });

  it("flags off-topic requests", () => {
    assert.deepEqual(parseDraft('{"off_topic": true}', candidates), { offTopic: true });
  });

  it("rejects unusable output and plans with fewer than two stops", () => {
    assert.equal(parseDraft("not json", candidates), null);
    assert.equal(parseDraft(JSON.stringify({ stops: [{ ref: "p1" }] }), candidates), null);
  });
});

describe("resolvePromptDate", () => {
  // 2026-09-30 is a Wednesday.
  it("resolves English and Tagalog day words", () => {
    assert.equal(resolvePromptDate("Chill Sunday sa Manila", "2026-09-30"), "2026-10-04");
    assert.equal(resolvePromptDate("Sabado night out", "2026-09-30"), "2026-10-03");
    assert.equal(resolvePromptDate("gala bukas", "2026-09-30"), "2026-10-01");
    assert.equal(resolvePromptDate("Wednesday lunch", "2026-09-30"), "2026-09-30");
    assert.equal(resolvePromptDate("this weekend sa BGC", "2026-09-30"), "2026-10-03");
  });

  it("returns null when no day is named", () => {
    assert.equal(resolvePromptDate("Date sa BGC", "2026-09-30"), null);
  });
});

describe("resolvePlanDate", () => {
  it("defaults to the next Saturday instead of today", () => {
    assert.deepEqual(resolvePlanDate("Date sa BGC", "2026-09-30"), { date: "2026-10-03", source: "default" });
    // On a Saturday the default is the following one, so there is time to prepare.
    assert.deepEqual(resolvePlanDate("Date sa BGC", "2026-10-03"), { date: "2026-10-10", source: "default" });
    assert.deepEqual(resolvePlanDate("Sunday museum day", "2026-09-30"), { date: "2026-10-04", source: "prompt" });
  });
});

describe("parseGroupSize", () => {
  it("reads group sizes in English and Taglish", () => {
    assert.equal(parseGroupSize("food trip, 6 kami"), 6);
    assert.equal(parseGroupSize("dinner for two"), 2);
    assert.equal(parseGroupSize("date sa Intramuros"), 2);
    assert.equal(parseGroupSize("museum day"), null);
  });
});

describe("scheduleStops", () => {
  const sunsetMinutes = 17 * 60 + 40;
  const pier = place({ id: "pier", name: "Bay Walk", category: "Park", tags: ["sunset"], latitude: 14.56, longitude: 120.98 });
  const resto = place({ id: "resto", name: "Ilustrado", category: "Food", latitude: 14.59, longitude: 120.975 });
  const museum = place({ id: "museum", name: "National Museum", category: "Museum", latitude: 14.587, longitude: 120.981 });
  const bar = place({ id: "bar", name: "Rooftop Bar", category: "Nightlife", latitude: 14.565, longitude: 121.03 });
  const byId = new Map([pier, resto, museum, bar].map((entry) => [entry.id, entry]));
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

  it("moves a 3:45 PM sunset stop to sunset and dinner after it", () => {
    const stops = scheduleStops(
      [
        { place_id: "pier", time: "15:45", minutes: 60, note: "Sunset by the bay" },
        { place_id: "resto", time: "16:45", minutes: 90, note: "Dinner" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: true },
    );
    assert.equal(stops[0].place_id, "pier");
    assert.equal(stops[0].time, "16:55");
    assert.ok(toMinutes(stops[1].time) >= 17 * 60 + 30, `dinner at ${stops[1].time}`);
    assert.ok(toMinutes(stops[1].time) >= toMinutes(stops[0].time) + 60, "dinner starts after the sunset stop ends");
  });

  it("puts sunset before dinner and the bar last, whatever order the model used", () => {
    const stops = scheduleStops(
      [
        { place_id: "bar", time: "14:00", minutes: 120, note: "Drinks" },
        { place_id: "resto", time: "15:00", minutes: 90, note: "Dinner" },
        { place_id: "pier", time: "16:00", minutes: 45, note: "Golden hour walk" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: true },
    );
    assert.deepEqual(stops.map((stop) => stop.place_id), ["pier", "resto", "bar"]);
    assert.ok(toMinutes(stops[2].time) >= 19 * 60, `bar at ${stops[2].time}`);
  });

  it("allows for travel time and keeps museums within opening hours", () => {
    const stops = scheduleStops(
      [
        { place_id: "museum", time: "17:00", minutes: 90, note: "Art" },
        { place_id: "resto", time: "17:10", minutes: 60, note: "Lunch" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: false },
    );
    assert.ok(toMinutes(stops[0].time) <= 16 * 60, `museum at ${stops[0].time}`);
    assert.ok(toMinutes(stops[1].time) >= toMinutes(stops[0].time) + 90 + 5);
  });

  it("starts no earlier than the given time on same-day plans", () => {
    const stops = scheduleStops(
      [
        { place_id: "museum", time: "09:00", minutes: 60, note: "" },
        { place_id: "resto", time: "10:30", minutes: 60, note: "" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: false, notBefore: 14 * 60 },
    );
    assert.equal(stops[0].time, "14:00");
  });
});

describe("buildFallbackDraft", () => {
  it("builds a plan from GalaTayo places matching the request", () => {
    const candidates = [
      place({ id: "cafe", name: "Corner Cafe", category: "Cafe" }),
      place({ id: "food", name: "Some Thai", category: "Food" }),
      place({ id: "park", name: "Bay Walk", category: "Park" }),
      place({ id: "mall", name: "Big Mall", category: "Mall" }),
    ];
    const draft = buildFallbackDraft("sunset date then dinner for 2", candidates);
    assert.ok(draft);
    assert.deepEqual(draft.stops.map((stop) => stop.place_id), ["park", "food", "cafe"]);
    assert.equal(draft.group_size, 2);
    assert.equal(draft.title, "Gala sa Makati");
  });
});

describe("findUncoveredArea", () => {
  const places = [place({ id: "a", city: "Makati" }), place({ id: "b", city: "Makati" })];
  it("names a requested area GalaTayo has no places in", () => {
    assert.equal(findUncoveredArea(places, "Baguio day trip"), "Baguio");
    assert.equal(findUncoveredArea(places, "Makati food trip"), null);
    assert.equal(findUncoveredArea(places, "chill cafe date"), null);
  });
});
