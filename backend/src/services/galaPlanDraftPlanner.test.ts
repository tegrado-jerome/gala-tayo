import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import { parseDraft, selectCandidates } from "./galaPlanDraftPlanner";

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
});

describe("parseDraft", () => {
  const ids = new Set(["a", "b", "c"]);

  it("keeps only known, unique stops and clamps values", () => {
    const draft = parseDraft(
      JSON.stringify({
        title: "BGC date",
        date: "2026-10-04",
        group_size: 2,
        stops: [
          { place_id: "a", time: "18:30", minutes: 500, note: "Dinner" },
          { place_id: "a", time: "19:00", minutes: 60, note: "Duplicate" },
          { place_id: "zzz", time: "20:00", minutes: 60, note: "Unknown" },
          { place_id: "b", time: "25:99", minutes: 10, note: "Movie" },
        ],
      }),
      ids,
    );

    assert.ok(draft);
    assert.deepEqual(draft.stops.map((stop) => stop.place_id), ["a", "b"]);
    assert.equal(draft.stops[0].minutes, 240);
    assert.equal(draft.stops[1].minutes, 30);
    assert.equal(draft.stops[1].time, "");
    assert.equal(draft.date, "2026-10-04");
  });

  it("rejects invalid JSON and plans with fewer than two stops", () => {
    assert.equal(parseDraft("not json", ids), null);
    assert.equal(parseDraft(JSON.stringify({ stops: [{ place_id: "a" }] }), ids), null);
  });
});
