import { rankPlaces } from "../src/domain/placeSearch";
import type { NormalizedPlace } from "../src/domain/places";

function place(overrides: Partial<NormalizedPlace>): NormalizedPlace {
  return {
    id: overrides.id ?? `fixture-${normalizeFixtureId(overrides.name ?? "unnamed-place")}`,
    name: overrides.name ?? "Unnamed Place",
    slug: overrides.slug ?? "unnamed-place",
    category: overrides.category ?? "Activity",
    address: overrides.address ?? null,
    city: overrides.city ?? "Manila",
    area: overrides.area ?? null,
    latitude: overrides.latitude ?? 14.5995,
    longitude: overrides.longitude ?? 120.9842,
    google_maps_url: overrides.google_maps_url ?? null,
    description: overrides.description ?? null,
    best_time_to_visit: overrides.best_time_to_visit ?? null,
    visit_duration: overrides.visit_duration ?? null,
    good_for: overrides.good_for ?? [],
    commute_access: overrides.commute_access ?? null,
    parking_info: overrides.parking_info ?? null,
    budget_min: overrides.budget_min ?? null,
    budget_note: overrides.budget_note ?? null,
    price_level: overrides.price_level ?? null,
    faqs: overrides.faqs ?? [],
    search_terms: overrides.search_terms ?? [],
    tags: overrides.tags ?? [],
    average_rating: overrides.average_rating ?? 0,
    review_count: overrides.review_count ?? 0,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function normalizeFixtureId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function assertTop(query: string, places: NormalizedPlace[], expectedName: string, message: string) {
  const top = rankPlaces(places, query)[0]?.place.name;
  if (top !== expectedName) {
    throw new Error(`${message}: expected "${expectedName}", got "${top ?? "none"}"`);
  }
}

const fixtures = [
  place({
    name: "The Bellevue Manila",
    slug: "the-bellevue-manila",
    category: "Hotel",
    city: "Muntinlupa",
    area: "Alabang",
    budget_min: 3500,
    search_terms: ["bellevue alabang", "hotel in alabang", "staycation in muntinlupa", "hotel na may pool sa muntinlupa"],
    tags: ["pool", "staycation"],
    good_for: ["Staycation", "Date Night"],
  }),
  place({
    name: "Kapitan Moy Cultural Center",
    slug: "kapitan-moy-cultural-center",
    category: "Heritage",
    city: "Marikina",
    area: "Marikina",
    budget_min: 0,
    search_terms: ["kapitan moy", "heritage in marikina"],
    tags: ["photo-friendly"],
  }),
  place({
    name: "Soul Good Cafe",
    slug: "soul-good-cafe",
    category: "Cafe",
    city: "Makati",
    area: "Poblacion",
    budget_min: 450,
    search_terms: ["soul good", "date cafe in makati"],
    tags: ["date-friendly", "quiet"],
    good_for: ["Casual Date", "Study Session"],
  }),
  place({
    name: "Rainy Day Games BGC",
    slug: "rainy-day-games-bgc",
    category: "Activity",
    city: "Taguig",
    area: "Bonifacio Global City",
    budget_min: 600,
    search_terms: ["rainy day activity in bgc", "indoor games in bgc"],
    tags: ["rainy-day", "indoor", "group-friendly"],
    good_for: ["Barkada Hangout"],
  }),
  place({
    name: "Free Manila Heritage Walk",
    slug: "free-manila-heritage-walk",
    category: "Heritage",
    city: "Manila",
    area: "Intramuros",
    budget_min: 0,
    search_terms: ["libreng gala sa manila", "free heritage walk manila"],
    tags: ["budget-friendly", "walking-friendly"],
    good_for: ["Solo Trip"],
  }),
  place({
    name: "Paranaque Coffee Yard",
    slug: "paranaque-coffee-yard",
    category: "Cafe",
    city: "Paranaque",
    area: "BF Homes",
    budget_min: 300,
    search_terms: ["paranaque cafe", "bf homes cafe"],
    tags: ["quiet"],
  }),
];

assertTop("The Bellevue Manila", fixtures, "The Bellevue Manila", "Exact place name");
assertTop("bellevue", fixtures, "The Bellevue Manila", "Short place name");
assertTop("kapitan moy", fixtures, "Kapitan Moy Cultural Center", "Short heritage name");
assertTop("soul good", fixtures, "Soul Good Cafe", "Partial cafe name");
assertTop("bellevue alabang", fixtures, "The Bellevue Manila", "Place and location intent");
assertTop("date cafe in makati", fixtures, "Soul Good Cafe", "Category, city, and occasion");
assertTop("saan mag staycation sa alabang", fixtures, "The Bellevue Manila", "Filipino natural query");
assertTop("hotel na may pool sa muntinlupa", fixtures, "The Bellevue Manila", "Feature query");
assertTop("libreng gala sa manila", fixtures, "Free Manila Heritage Walk", "Free query");
assertTop("rainy day activity in bgc", fixtures, "Rainy Day Games BGC", "Rainy-day query");
assertTop("Paranaque cafe", fixtures, "Paranaque Coffee Yard", "Accent normalization");

const explicit = rankPlaces(fixtures, "date", {
  category: "cafe",
  city: "Makati",
  budget: "under-500",
});
if (explicit.length !== 1 || explicit[0].place.name !== "Soul Good Cafe") {
  throw new Error("Explicit filter combination should return only the matching Makati cafe under PHP 500.");
}

const exactMakatiDate = rankPlaces(fixtures, "date in makati");
if (exactMakatiDate.length !== 1 || exactMakatiDate[0].place.name !== "Soul Good Cafe") {
  throw new Error("Typed exact city query should only return Makati matches for date in makati.");
}

const exactMakati = rankPlaces(fixtures, "makati");
if (exactMakati.length !== 1 || exactMakati[0].place.city !== "Makati") {
  throw new Error("Typed city-only query should only return Makati places.");
}

const exactBgc = rankPlaces(fixtures, "bgc");
if (exactBgc.length !== 1 || exactBgc[0].place.area !== "Bonifacio Global City") {
  throw new Error("Typed area query should only return the matching exact area.");
}

const broadDate = rankPlaces(fixtures, "date");
if (broadDate.length < 2 || !broadDate.some(({ place }) => place.city === "Makati") || !broadDate.some(({ place }) => place.city === "Muntinlupa")) {
  throw new Error("Broad date query should still return cross-city date-friendly matches.");
}

console.log("Search ranking smoke tests passed.");
