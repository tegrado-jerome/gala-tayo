import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isIndoorPlace } from "../domain/queryIntent";
import { detectLocationIntent, fitsKind, mealEstimatePerHead, typicalMealCost, widenThinArea } from "../services/galaPlanDraftPlanner";
import { visibleFixturePlaces } from "../services/assistant/fixtures/testPlaces";
import { buildPlanDraft } from "./galaPlanAiDraft";

// QA round 3 (R3-05, R3-06): thin areas widen and say so; lunch-to-dinner and food crawls have real meals,
// and the per-head estimate never leaves the meals out. Runs the whole pipeline without the model.
type Stop = { time: string; place: { slug: string; category: string; city: string | null; budget_min: number | null } };
type Body = { stops: Stop[]; notes: string[]; meal_estimate_per_head: number; meals_needed: number; meal_cost: number };

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
  it("a Binondo food crawl eats in Binondo and never sends dinner across the metro", async () => {
    // QA round 4: the old "dinner" here was Celera, a ₱5,000 tasting menu in Makati. Manila has no other dinner
    // spot on GalaTayo, so the plan says so instead.
    const body = await plan("Barkada food crawl sa Binondo tapos Intramuros, lunch hanggang gabi");
    const binondo = body.stops.find((stop) => stop.place.slug === "binondo-chinatown");
    assert.ok(binondo && minutes(binondo.time) < 15 * 60, "Binondo is the lunch");
    assert.ok(body.stops.every((stop) => stop.place.city === "Manila"), body.stops.map((stop) => stop.place.city).join(", "));
    const dinner = body.stops.some((stop) => isMeal(stop, "dinner") && minutes(stop.time) >= 17 * 60 + 30);
    assert.ok(dinner || body.notes.some((note) => /dinner/.test(note)), "a dinner stop, or a note saying why there is none");
  });

  it("never prices an evening plan without its meal", async () => {
    const body = await plan("Sabado sa Intramuros, 3 kami, ₱800 each, hapon hanggang gabi");
    const entry = body.stops.reduce((sum, stop) => sum + (stop.place.budget_min ?? 0), 0);
    assert.ok(body.meal_estimate_per_head >= typicalMealCost(visibleFixturePlaces), "the dinner is counted");
    assert.ok(entry + body.meal_estimate_per_head > 200);
  });

  it("sends the meals and meal price the app prices every screen from", async () => {
    const body = await plan("Sabado sa Intramuros, 3 kami, ₱800 each, hapon hanggang gabi");
    assert.equal(body.meal_cost, typicalMealCost(visibleFixturePlaces));
    assert.ok(body.meals_needed >= 1, "the dinner is a needed meal");
  });

  it("counts a free food street as a meal, and a meal no food stop covers", () => {
    const street = bySlug.get("binondo-chinatown")!; // filed as Heritage, free entry, but people go to eat
    const eatery = bySlug.get("toyo-eatery")!;
    const sight = bySlug.get("fort-santiago")!;
    assert.equal(mealEstimatePerHead([street, sight], 0, 250), 250, "a food crawl is never free");
    assert.equal(mealEstimatePerHead([eatery, sight], 2, 250), 250, "lunch is priced, dinner is not");
    assert.equal(mealEstimatePerHead([eatery, street], 1, 250), 250, "the street still costs a meal");
    assert.equal(mealEstimatePerHead([sight], 0, 250), 0);
  });

  it("estimates a meal from GalaTayo's everyday eateries", () => {
    const cost = typicalMealCost(visibleFixturePlaces);
    assert.ok(cost >= 100 && cost <= 600, `typical meal ₱${cost}`);
  });
});

// QA round 4: the exact prompts that broke on the live site. Each runs with no model and with a stand-in model
// that ignores the request and picks the priciest candidates, so the rules hold whatever the model returns.
describe("QA round 4: budget, area, fullness, rain and chosen places", () => {
  const priciest: Parameters<typeof buildPlanDraft>[0]["model"] = async (_prompt, candidates) => ({
    title: "Plan",
    summary: "",
    group_size: 1,
    stops: [...candidates].sort((a, b) => (b.budget_min ?? 0) - (a.budget_min ?? 0)).slice(0, 6).map((place) => ({ place_id: place.id, time: "", minutes: 60, note: "A fun stop for the group." })),
  });
  async function both(prompt: string, placeSlugs: string[] = []) {
    const plans: Body[] = [];
    for (const model of [async () => null, priciest]) {
      const outcome = await buildPlanDraft({ prompt, places: visibleFixturePlaces, placeSlugs, requestedDate: "2099-10-10", requestId: "test", model, loadImages: async () => new Map() });
      assert.ok(outcome.ok, `no plan for "${prompt}"`);
      plans.push(outcome.body as unknown as Body);
    }
    return plans;
  }
  const perHead = (body: Body) => body.stops.reduce((sum, stop) => sum + (stop.place.budget_min ?? 0), 0) + body.meal_estimate_per_head;

  it("a ₱800 Binondo food trip stays under ₱800 a head, in Manila, and never dines in Makati", async () => {
    for (const body of await both("Saturday food trip in Binondo for 4 friends, around 800 each, lunch until early dinner")) {
      assert.ok(perHead(body) <= 800, `₱${perHead(body)} a head`);
      assert.ok(body.stops.every((stop) => stop.place.city === "Manila"), body.stops.map((stop) => stop.place.slug).join(", "));
      assert.ok(body.stops.length >= 3);
      assert.ok(!body.stops.some((stop) => stop.place.slug === "celera"));
    }
  });

  it("a Cebu City date night is more than one stop, meets the sunset at the lookout, and says why there's no dinner", async () => {
    for (const body of await both("Date night in Cebu City for 2, 3000 total")) {
      assert.ok(body.stops.length >= 2, body.stops.map((stop) => stop.place.slug).join(", "));
      assert.ok(body.stops.every((stop) => stop.place.city === "Cebu City"));
      const first = body.stops[0];
      const last = body.stops.at(-1)!;
      assert.ok(minutes(last.time) + 60 - minutes(first.time) >= 120, "at least two hours");
      assert.ok(perHead(body) <= 1500);
      assert.ok(body.stops.some((stop) => isMeal(stop, "dinner")) || body.notes.some((note) => /dinner/.test(note)));
    }
  });

  it("a rainy QC day is indoors, has three stops, fits ₱1,000 and explains what it left out", async () => {
    for (const body of await both("Rainy Saturday in Quezon City for 6 friends, 1000 each")) {
      assert.ok(body.stops.length >= 3, body.stops.map((stop) => stop.place.slug).join(", "));
      for (const stop of body.stops) assert.equal(isIndoorPlace(bySlug.get(stop.place.slug)!), true, `${stop.place.slug} is not indoors`);
      assert.ok(perHead(body) <= 1000, `₱${perHead(body)} a head`);
      assert.ok(body.notes.length > 0);
    }
  });

  it("never lists a whole area next to the places inside it", async () => {
    for (const body of await both("Saturday barkada day in Intramuros for 4, around 500 each, afternoon to dinner")) {
      const slugs = body.stops.map((stop) => stop.place.slug);
      const insideIntramuros = slugs.filter((slug) => /intramuros/i.test(bySlug.get(slug)?.area ?? "") && slug !== "intramuros");
      if (insideIntramuros.length > 0) assert.ok(!slugs.includes("intramuros"), slugs.join(", "));
      assert.ok(perHead(body) <= 500);
    }
  });

  it("'Plan a trip from these' keeps every saved place", async () => {
    for (const body of await both("Plan a day out from my saved places: Ayala Museum, Binondo Chinatown", ["ayala-museum", "binondo-chinatown"])) {
      const slugs = body.stops.map((stop) => stop.place.slug);
      assert.ok(slugs.includes("ayala-museum") && slugs.includes("binondo-chinatown"), slugs.join(", "));
    }
  });

  it("says why a saved place too far for the same day is left out", async () => {
    const [body] = await both("Plan a day out from my saved places: Fort Santiago, Kawasan Falls", ["fort-santiago", "kawasan-falls-badian"]);
    assert.ok(body.stops.some((stop) => stop.place.slug === "fort-santiago"));
    assert.ok(!body.stops.some((stop) => stop.place.slug === "kawasan-falls-badian"));
    assert.ok(body.notes.some((note) => /Kawasan Falls.*too far/.test(note)), body.notes.join(" | "));
  });
});
