import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import { rankPlaces } from "../domain/placeSearch";
import { noCarReason, soloEligible } from "./placeTraits";

test("no car: a public ride with nothing that needs a car gets a one-line reason", () => {
  assert.equal(noCarReason("Ceres bus toward Bato/Samboan from Cebu South Bus Terminal (about 3.5-4 hours)."), "Bus gets you there");
  assert.equal(noCarReason("From Legazpi, ride a jeepney to Daraga town (around 15 minutes), then walk or take a tricycle up the hill."), "Jeep, then a tricycle");
  assert.equal(noCarReason("Bus to Batangas Port, then a ferry directly to Sabang (around 1 hour)."), "Bus, plus a ferry");
  assert.equal(noCarReason("Bus to San Antonio, Zambales, tricycle to Pundaquit, then a boat to Nagsasa."), "Bus, plus a boat");
  assert.equal(noCarReason("Walk from MRT Ayala or One Ayala through the Ayala Center walkways."), "Train, then a short walk");
});

test("no car: a train to the bus terminal before a long ride counts as the bus", () => {
  assert.equal(noCarReason("Take a DLTB bus or van from LRT Buendia bound for Calatagan (3.5–4.5 hours), then a tricycle to the beach."), "Bus or van, then a tricycle");
});

test("no car: anything that needs a car, a hired ride or a motorbike stays unmarked", () => {
  assert.equal(noCarReason("Private car or motorbike only. Jeepneys and buses do not run on this road."), null);
  assert.equal(noCarReason("Bus to Dalaguete town, then habal-habal (motorcycle taxi) up to the jump-off."), null);
  assert.equal(noCarReason("Take a bus to Capas, then join a pre-booked 4x4 tour from the jump-off."), null);
  assert.equal(noCarReason("From Baguio, hire a jeep/van or join an organized tour."), null);
  assert.equal(noCarReason("About 1 hour by scooter or van from General Luna."), null);
  assert.equal(noCarReason("Ferry to Sablayan, then a chartered bangka. There are no public boats."), null);
});

test("no car: a tricycle offered next to a habal-habal is still a no-car trip", () => {
  assert.equal(noCarReason("Ceres bus to Barili Poblacion, then take a tricycle or habal-habal to the falls."), "Bus, then a tricycle");
});

test("no car: taxi-only, drive-only or empty notes are not enough", () => {
  assert.equal(noCarReason("About 15-20 minutes by car from Tagbilaran."), null);
  assert.equal(noCarReason("Ride-hailing or taxi from the airport."), null);
  assert.equal(noCarReason(null), null);
  assert.equal(noCarReason("  "), null);
});

test("solo: needs our Solo Trip tag, a way in without a car and no serious safety warning", () => {
  const market = { goodFor: ["Food Trip", "Solo Trip"], commuteAccess: "Walkable from Session Road and Burnham Park.", safetyTips: ["Keep your bag in front."] };
  assert.equal(soloEligible(market), true);
  assert.equal(soloEligible({ ...market, goodFor: ["Food Trip"] }), false);
  assert.equal(soloEligible({ ...market, commuteAccess: "About 1 hour by scooter or habal-habal from town." }), false);
  assert.equal(soloEligible({ ...market, safetyTips: ["A tourist snorkeling without a guide drowned in May 2026."] }), false);
  assert.equal(soloEligible({ ...market, safetyTips: ["Routes take several days round trip."] }), false);
  assert.equal(soloEligible({ ...market, commuteAccess: "Ceres bus to Badian, then a walk in." }), true);
});

const read = (relativePath: string) => readFileSync(path.resolve(__dirname, relativePath), "utf8");

test("the frontend and backend trait files match, and every solo entry has a reason and a caveat", () => {
  const backend = read("../data/placeTraits.json");
  assert.equal(read("../../../frontend/src/data/placeTraits.json"), backend);
  const traits = JSON.parse(backend) as { noCar: Record<string, string>; solo: Record<string, { why: string; caveat: string }>; surge: Array<{ cities: string[]; kind: string; sources: string[] }> };
  for (const [slug, entry] of Object.entries(traits.solo)) assert.ok(entry.why.trim() && entry.caveat.trim(), slug);
  for (const town of traits.surge) {
    assert.ok(["ferry", "stay", "road"].includes(town.kind), town.cities.join());
    assert.ok(town.sources.length > 0 && town.sources.every((url) => url.startsWith("https://")), town.cities.join());
  }
});

function place(slug: string, overrides: Partial<NormalizedPlace> = {}): NormalizedPlace {
  return {
    id: slug, slug, name: slug.replace(/-/g, " "), category: "Park", city: "Baguio", area: null, address: null, description: null, status: "active",
    search_terms: [], good_for: [], tags: [], faqs: [], latitude: null, longitude: null, budget_min: null, price_level: null, average_rating: null, review_count: 0,
    ...overrides,
  } as NormalizedPlace;
}

test("search reads commute and solo words as filters", () => {
  const traits = JSON.parse(read("../data/placeTraits.json")) as { noCar: Record<string, string>; solo: Record<string, unknown> };
  const noCarSlug = Object.keys(traits.noCar)[0];
  const soloSlug = Object.keys(traits.solo)[0];
  const places = [place(noCarSlug), place(soloSlug), place("needs-a-car-somewhere")];
  for (const query of ["commute", "walang kotse", "no car", "public transport"]) {
    assert.ok(rankPlaces(places, query).every(({ place: found }) => found.slug in traits.noCar), query);
    assert.ok(rankPlaces(places, query).some(({ place: found }) => found.slug === noCarSlug), query);
  }
  assert.deepEqual(rankPlaces(places, "solo trip").map(({ place: found }) => found.slug), [soloSlug]);
  assert.ok(rankPlaces(places, "", {}, { noCar: true }).every(({ place: found }) => found.slug in traits.noCar));
});
