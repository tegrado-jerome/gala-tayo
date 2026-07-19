import assert from "node:assert/strict";
import { rankPlaces } from "./placeSearch";
import type { NormalizedPlace } from "./places";

function makePlace(overrides: Partial<NormalizedPlace>): NormalizedPlace {
  const name = overrides.name ?? "Test Place";

  return {
    id: overrides.id ?? name.toLowerCase().replace(/\s+/g, "-"),
    name,
    slug: overrides.slug ?? name.toLowerCase().replace(/\s+/g, "-"),
    category: overrides.category ?? "Mall",
    address: overrides.address ?? null,
    city: overrides.city ?? "Makati",
    area: overrides.area ?? null,
    latitude: overrides.latitude ?? 14.55,
    longitude: overrides.longitude ?? 121.02,
    google_maps_url: overrides.google_maps_url ?? null,
    description: overrides.description ?? "Mall in Makati",
    best_time_to_visit: overrides.best_time_to_visit ?? null,
    visit_duration: overrides.visit_duration ?? null,
    good_for: overrides.good_for ?? [],
    commute_access: overrides.commute_access ?? null,
    parking_info: overrides.parking_info ?? null,
    budget_min: overrides.budget_min ?? null,
    budget_note: overrides.budget_note ?? null,
    price_level: overrides.price_level ?? null,
    faqs: overrides.faqs ?? [],
    search_terms: overrides.search_terms ?? ["mall", "makati"],
    tags: overrides.tags ?? ["mall"],
    average_rating: overrides.average_rating ?? null,
    review_count: overrides.review_count ?? 0,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

const makatiMalls = [
  makePlace({ name: "Free Makati Mall", budget_min: 0 }),
  makePlace({ name: "Budget Makati Mall", budget_min: 300 }),
  makePlace({ name: "Mid Makati Mall", budget_min: 900 }),
  makePlace({ name: "Premium Makati Mall", budget_min: 2200 }),
  makePlace({ name: "Unknown Makati Mall", budget_min: null }),
  makePlace({ name: "Quezon City Mall", city: "Quezon City", budget_min: 300 }),
  makePlace({ name: "Makati Cafe", category: "Cafe", budget_min: 300, search_terms: ["cafe", "makati"], tags: ["cafe"] }),
];

const premiumResults = rankPlaces(makatiMalls, "", {
  city: "makati",
  category: "mall",
  budget: "2000-plus",
});
assert.deepEqual(
  premiumResults.map(({ place }) => place.name),
  ["Premium Makati Mall", "Mid Makati Mall", "Budget Makati Mall", "Free Makati Mall", "Unknown Makati Mall"],
  "premium budget preference should keep Makati malls and rank around/above 2000 first",
);

const lowBudgetResults = rankPlaces(makatiMalls, "", {
  city: "makati",
  category: "mall",
  budget: "under-500",
});
assert.deepEqual(
  lowBudgetResults.map(({ place }) => place.name),
  ["Budget Makati Mall", "Free Makati Mall", "Mid Makati Mall", "Premium Makati Mall", "Unknown Makati Mall"],
  "under-500 budget preference should keep Makati malls and rank cheaper places first",
);

const typedPremiumResults = rankPlaces(makatiMalls, "premium", {
  city: "makati",
  category: "mall",
});
assert.deepEqual(
  typedPremiumResults.map(({ place }) => place.name),
  ["Premium Makati Mall", "Mid Makati Mall", "Budget Makati Mall", "Free Makati Mall", "Unknown Makati Mall"],
  "typed premium budget intent should use the same soft ranking as structured budget filters",
);

const typedLowBudgetResults = rankPlaces(makatiMalls, "malls in makati under 500");
assert.deepEqual(
  typedLowBudgetResults.map(({ place }) => place.name),
  ["Budget Makati Mall", "Free Makati Mall", "Mid Makati Mall", "Premium Makati Mall", "Unknown Makati Mall"],
  "typed under-500 budget intent should keep category/city matches and rank cheaper places first",
);
