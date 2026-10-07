import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLocationIntent, fitsKind, typicalMealCost, widenThinArea } from "../services/galaPlanDraftPlanner";
import { visibleFixturePlaces } from "../services/assistant/fixtures/testPlaces";
import { buildPlanDraft } from "./galaPlanAiDraft";

// QA round 3 (R3-05, R3-06): thin areas widen and say so; lunch-to-dinner and food crawls have real meals,
// and the per-head estimate never leaves the meals out. Runs the whole pipeline without the model.
type Stop = { time: string; place: { slug: string; category: string; city: string | null; budget_min: number | null } };
type Body = { stops: Stop[]; notes: string[]; meal_estimate_per_head: number };

async function plan(prompt: string) {
  const outcome = await buildPlanDraft({ prompt, places: visibleFixturePlaces, requestedDate: "2099-10-10", requestId: "test", model: async () => null, loadImages: async () => new Map() });
  assert.ok(outcome.ok, `no plan for "${prompt}": ${"message" in outcome ? outcome.message : ""}`);
  return outcome.body as unknown as Body;
}

const bySlug = new Map(visibleFixturePlaces.map((place) => [place.slug, place]));
const isMeal = (stop: Stop, meal: "lunch" | "dinner") => fitsKind(bySlug.get(stop.place.slug)!, meal);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

describe("thin areas", () => {
  it("QC borrows the nearest cities, Makati does not need to", () => {
    const qc = widenThinArea(visibleFixturePlaces, detectLocationIntent(visibleFixturePlaces, "barkada day in QC"));
    assert.ok(qc.added.length > 0);
    assert.ok(qc.location.cities.has("quezon city"));
    const nowhere = widenThinArea(visibleFixturePlaces, detectLocationIntent(visibleFixturePlaces, "gala ideas"));
    assert.deepEqual(nowhere.added, []);
  });

  it("a QC lunch-to-dinner plan is planned, keeps QC first, has both meals and says it widened", async () => {
    const body = await plan("Barkada gala sa QC this Saturday, 5 kami, ₱800 each, lunch hanggang gabi, may kainan");
    assert.equal(body.stops[0].place.city, "Quezon City");
    assert.ok(body.stops.some((stop) => isMeal(stop, "lunch") && minutes(stop.time) < 15 * 60), "lunch stop");
    assert.ok(body.stops.some((stop) => isMeal(stop, "dinner") && minutes(stop.time) >= 17 * 60 + 30), "dinner stop");
    assert.ok(body.notes.some((note) => /only a few places in QC/.test(note)));
  });

  it("the 'Barkada day in QC' chip gives a full day with QC stops first", async () => {
    const body = await plan("Barkada day in QC for 6");
    assert.ok(body.stops.length >= 3);
    assert.equal(body.stops[0].place.city, "Quezon City");
  });
});

describe("meals and cost", () => {
  it("a Binondo food crawl eats in Binondo and has a real dinner stop", async () => {
    const body = await plan("Barkada food crawl sa Binondo tapos Intramuros, lunch hanggang gabi");
    const binondo = body.stops.find((stop) => stop.place.slug === "binondo-chinatown");
    assert.ok(binondo && minutes(binondo.time) < 15 * 60, "Binondo is the lunch");
    assert.ok(body.stops.some((stop) => isMeal(stop, "dinner") && minutes(stop.time) >= 17 * 60 + 30), "dinner stop");
  });

  it("never prices an evening plan without its meal", async () => {
    const body = await plan("Sabado sa Intramuros, 3 kami, ₱800 each, hapon hanggang gabi");
    const entry = body.stops.reduce((sum, stop) => sum + (stop.place.budget_min ?? 0), 0);
    assert.ok(body.meal_estimate_per_head >= typicalMealCost(visibleFixturePlaces), "the dinner is counted");
    assert.ok(entry + body.meal_estimate_per_head > 200);
  });

  it("estimates a meal from GalaTayo's everyday eateries", () => {
    const cost = typicalMealCost(visibleFixturePlaces);
    assert.ok(cost >= 100 && cost <= 600, `typical meal ₱${cost}`);
  });
});
