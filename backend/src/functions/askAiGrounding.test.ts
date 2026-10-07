import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import { detectLocationIntent, selectCandidates } from "../services/galaPlanDraftPlanner";
import { chatBudgetPerHead, findMentionedPlaces, missingKind } from "./askAi";

function place(overrides: Partial<NormalizedPlace>): NormalizedPlace {
  return {
    id: "id", name: "Place", slug: "place", category: "Food", address: null, city: "Makati", area: null,
    latitude: 14.55, longitude: 121.02, google_maps_url: null, description: null, best_time_to_visit: null,
    visit_duration: null, good_for: [], commute_access: null, parking_info: null, budget_min: null, budget_note: null,
    price_level: null, faqs: [], search_terms: [], tags: [], average_rating: null, review_count: 0, status: "active",
    created_at: "", updated_at: "", ...overrides,
  };
}

describe("chat grounding", () => {
  it("reads 'hindi mahal' and 'mura' as a ₱500 cap, and a stated budget as is", () => {
    assert.equal(chatBudgetPerHead("date sa BGC na hindi mahal"), 500);
    assert.equal(chatBudgetPerHead("murang kainan sa QC"), 500);
    assert.equal(chatBudgetPerHead("dinner sa Makati, ₱1,500 each"), 1500);
    assert.equal(chatBudgetPerHead("best beach near Manila"), null);
  });

  it("keeps a ₱3,500 dinner out of a 'hindi mahal' answer", () => {
    const places = [
      place({ id: "chele", name: "Gallery by Chele", city: "Taguig", latitude: 14.553, longitude: 121.048, budget_min: 3500 }),
      place({ id: "bhs", name: "Bonifacio High Street", category: "Mall", city: "Taguig", latitude: 14.5508, longitude: 121.0509, budget_min: 0 }),
    ];
    const ids = selectCandidates(places, "date sa BGC na hindi mahal", 16, undefined, { budgetPerHead: 500, start: null }).map((entry) => entry.id);
    assert.deepEqual(ids, ["bhs"]);
  });

  it("reads 'near Manila' as outside the city", () => {
    const intent = detectLocationIntent([place({ city: "Manila" })], "Best beach near Manila");
    assert.equal(intent.cities.size, 0);
    assert.equal(intent.nearManila, true);
  });

  it("links each GalaTayo place once, preferring the longer name", () => {
    const places = [
      place({ id: "a", name: "Intramuros", slug: "intramuros", city: "Manila", area: "Intramuros" }),
      place({ id: "b", name: "Bambike Ecotours Intramuros", slug: "bambike-ecotours-intramuros", city: "Manila", area: "Intramuros" }),
    ];
    const sources = findMentionedPlaces("Try **Bambike Ecotours Intramuros** for a bike tour.", places);
    assert.deepEqual(sources.map((source) => source.title), ["Bambike Ecotours Intramuros"]);
  });

  it("notes when the area has no place of the asked kind", () => {
    const makati = [place({ name: "Filling Station Bar Cafe", category: "Food" })];
    assert.match(missingKind("Quiet cafe to study in Makati", makati) ?? "", /cafe/);
    assert.equal(missingKind("Quiet cafe in Manila", [place({ category: "Cafe" })]), null);
  });

  it("reads near Manila beach questions as day trips out of the city", () => {
    const places = [
      place({ id: "luneta", name: "Rizal Park", category: "Park", city: "Manila", average_rating: 5 }),
      place({ id: "laiya", name: "Laiya Beach", category: "Activity", city: "San Juan, Batangas", tags: ["beach"], latitude: 13.67, longitude: 121.4 }),
      place({ id: "boracay", name: "White Beach", category: "Activity", city: "Boracay", tags: ["beach"], latitude: 11.96, longitude: 121.92 }),
    ];
    assert.deepEqual(selectCandidates(places, "Best beach near Manila?", 2).map((entry) => entry.id), ["laiya", "boracay"]);
  });

  it("links names written with a non-breaking hyphen", () => {
    const places = [place({ name: "New Po-Heng Lumpia House", slug: "po-heng", city: "Manila" })];
    assert.equal(findMentionedPlaces("Try **New Po‑Heng Lumpia House**.", places).length, 1);
  });
});
