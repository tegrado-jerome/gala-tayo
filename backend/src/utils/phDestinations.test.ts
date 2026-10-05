import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { detectCityFromQuery } from "../domain/placeSearch";
import {
  DESTINATIONS,
  getDestinationNameKeys,
  getLocationNamesForAreaSlug,
  inferProvincialDestinationsFromQuery,
  resolveDestination,
} from "./phDestinations";
import { validateSearchQuery } from "./searchQueryValidation";
import { resolveAreaSlug } from "./seoPlaces";

describe("phDestinations data", () => {
  it("matches the frontend copy", () => {
    const backendCopy = readFileSync(path.join(__dirname, "../data/phDestinations.json"), "utf8");
    const frontendCopy = readFileSync(path.join(__dirname, "../../../frontend/src/data/phDestinations.json"), "utf8");
    assert.equal(backendCopy.replace(/\r\n/g, "\n"), frontendCopy.replace(/\r\n/g, "\n"));
  });

  it("gives every name a single destination", () => {
    const owners = new Map<string, string>();
    for (const destination of DESTINATIONS) {
      for (const key of getDestinationNameKeys(destination)) {
        assert.equal(owners.get(key) ?? destination.slug, destination.slug, `"${key}" is used by ${owners.get(key)} and ${destination.slug}`);
        owners.set(key, destination.slug);
      }
    }
  });
});

describe("resolveAreaSlug", () => {
  it("keeps every Metro Manila URL as it was", () => {
    const liveCities: Array<[string, string]> = [
      ["Caloocan", "caloocan"],
      ["Las Piñas", "las-pinas"],
      ["Makati", "makati"],
      ["Malabon", "malabon"],
      ["Mandaluyong", "mandaluyong"],
      ["Manila", "manila"],
      ["Marikina", "marikina"],
      ["Muntinlupa", "muntinlupa"],
      ["Navotas", "navotas"],
      ["Parañaque", "paranaque"],
      ["Pasay", "pasay"],
      ["Pasig", "pasig"],
      ["Quezon City", "quezon-city"],
      ["San Juan", "san-juan"],
      ["Taguig", "taguig"],
      ["Valenzuela", "valenzuela"],
      ["Pateros", "pateros"],
    ];

    for (const [city, slug] of liveCities) {
      assert.equal(resolveAreaSlug(city, "Poblacion").slug, slug, city);
    }
    assert.deepEqual(resolveAreaSlug("Las Piñas", null), { slug: "las-pinas", name: "Las Pinas" });
    assert.equal(resolveAreaSlug("San Juan", "Little Baguio").slug, "san-juan");
    assert.equal(resolveAreaSlug("Muntinlupa", "Carmona").slug, "muntinlupa");
    assert.equal(resolveAreaSlug(null, null).slug, "metro-manila");
  });

  it("maps destinations outside Metro Manila", () => {
    assert.equal(resolveAreaSlug("Baguio City", null).slug, "baguio");
    assert.equal(resolveAreaSlug("San Juan, La Union", "Urbiztondo").slug, "san-juan-la-union");
    assert.equal(resolveAreaSlug("San Juan", "La Union").slug, "san-juan-la-union");
    assert.equal(resolveAreaSlug("Boracay", "Station 2").slug, "malay-boracay");
    assert.equal(resolveAreaSlug("General Luna", "Siargao").slug, "general-luna-siargao");
    assert.equal(resolveAreaSlug("Cebu City", "IT Park").slug, "cebu-city");
    assert.equal(resolveAreaSlug("Unlisted Town", null).slug, "unlisted-town");
  });

  it("exposes region groups for listings", () => {
    const names = getLocationNamesForAreaSlug("metro-manila");
    assert.ok(names.includes("Makati"));
    assert.ok(names.includes("Las Piñas"));
    assert.equal(names.includes("Baguio"), false);
    assert.equal(resolveDestination("Tagaytay", null)?.regionSlug, "calabarzon");
  });
});

describe("location search", () => {
  it("accepts places outside Metro Manila", () => {
    const result = validateSearchQuery({ query: "cafes in Tagaytay", hasSelectedFilters: false, hasNearbySearch: false, allowBroadDiscovery: false });
    assert.equal(result.status, "ok");
    assert.equal(result.message, null);
    assert.deepEqual(result.supportedLocationNames, ["Tagaytay"]);
  });

  it("still flags an empty query", () => {
    const result = validateSearchQuery({ query: "  ", hasSelectedFilters: false, hasNearbySearch: false, allowBroadDiscovery: false });
    assert.equal(result.status, "empty_query");
  });

  it("prefers the longer place name", () => {
    assert.equal(detectCityFromQuery("cafe in makati"), "Makati");
    assert.equal(detectCityFromQuery("san juan food trip"), "San Juan");
    assert.equal(detectCityFromQuery("little baguio cafes"), "San Juan");
    assert.equal(detectCityFromQuery("surf spots in san juan la union"), "San Juan, La Union");
    assert.equal(detectCityFromQuery("baguio strawberry farm"), "Baguio");
    assert.deepEqual(inferProvincialDestinationsFromQuery("weekend sa elyu").map(({ destination }) => destination.slug), ["san-juan-la-union"]);
    assert.deepEqual(inferProvincialDestinationsFromQuery("date sa bgc"), []);
  });
});
