import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "./places";
import { rankPlaces, scorePlaceNameMatch } from "./placeSearch";

function place(name: string, overrides: Partial<NormalizedPlace> = {}): NormalizedPlace {
  return {
    id: name,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    category: "Heritage",
    city: "Manila",
    area: null,
    address: null,
    description: null,
    status: "active",
    search_terms: [],
    good_for: [],
    tags: [],
    faqs: [],
    latitude: null,
    longitude: null,
    budget_min: null,
    price_level: null,
    average_rating: null,
    review_count: 0,
    ...overrides,
  } as NormalizedPlace;
}

describe("place name matches", () => {
  const church = place("San Agustin Church", { area: "Intramuros" });
  const cafe = place("Master Café Malabon", {
    category: "Cafe",
    city: "Malabon",
    area: "San Agustin",
    search_terms: ["San Agustin", "Malabon cafe"],
    description: "A modern local café in San Agustin.",
  });

  it("ranks a place named after the query above one that only lists it as a search term", () => {
    const ranked = rankPlaces([cafe, church], "San Agustin").map((result) => result.place.name);
    assert.deepEqual(ranked, ["San Agustin Church", "Master Café Malabon"]);
  });

  it("scores an exact name above a name that starts with the query", () => {
    assert.ok(scorePlaceNameMatch(place("Fort Santiago"), "fort santiago") > scorePlaceNameMatch(place("Fort Santiago Gardens"), "fort santiago"));
  });

  it("scores a name containing the query above a matching search term", () => {
    assert.ok(scorePlaceNameMatch(place("Museo de San Agustin"), "san agustin") > scorePlaceNameMatch(cafe, "san agustin"));
  });
});
