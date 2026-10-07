import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFoodStreet, vibeMatches } from "../../domain/queryIntent";
import { planTools } from "./agent";
import { allFixturePlaces, visibleFixturePlaces } from "./fixtures/testPlaces";
import { updateMemory } from "./memory";
import { EMPTY_MEMORY } from "./schema";
import { newLedger, runTool, type ToolContext } from "./tools";

// QA round 3 (R3-02): every card must fit what was asked; a question about one place gets its facts.
const context: ToolContext = { places: allFixturePlaces, todayIso: "2026-10-10", weather: async () => null };
const bySlug = new Map(visibleFixturePlaces.map((place) => [place.slug, place]));

type SearchResult = { note?: string; places: Array<{ slug: string; in_area?: boolean; matches_query: boolean }> };

/** Runs the tools Tara's fast path would pick for an ask, as the chat does. */
async function ask(message: string) {
  const memory = updateMemory({ ...EMPTY_MEMORY }, message, visibleFixturePlaces, "2026-10-10");
  const plan = planTools(message, memory, visibleFixturePlaces, [], false) ?? [];
  const ledger = newLedger();
  const results: Record<string, unknown> = {};
  for (const call of plan) results[call.name] = await runTool(call.name, call.args, context, ledger);
  return { plan: plan.map((call) => call.name), search: results.search_places as SearchResult | undefined, ledger };
}

describe("Tara relevance", () => {
  it("a dish ask only shows places whose own data has the dish, nearest first, and says none are in the area", async () => {
    const { search } = await ask("saan masarap na sisig sa Makati?");
    assert.deepEqual(search!.places.map((place) => place.slug), ["aling-lucing-sisig-angeles"]);
    assert.match(search!.note ?? "", /No GalaTayo place in Makati has sisig/);
    assert.ok(!search!.places.some((place) => place.slug === "blackbird-at-the-nielson-tower"));
  });

  it("a beach ask lists beaches, never a restaurant first", async () => {
    const { plan, search } = await ask("Beach malapit sa Manila na day trip lang");
    assert.deepEqual(plan, ["search_places"]);
    assert.ok(search!.places.length >= 3);
    for (const { slug } of search!.places) {
      assert.ok(vibeMatches(bySlug.get(slug)!, "beach"), `${slug} is not a beach`);
      assert.notEqual(bySlug.get(slug)!.category, "Food");
    }
  });

  it("'libre' means free places only, whatever budget was also said", async () => {
    const { search } = await ask("Libreng gala sa Manila this Sunday para sa barkada, budget ₱300 each");
    assert.ok(search!.places.length >= 3);
    for (const { slug } of search!.places) assert.equal(bySlug.get(slug)!.budget_min, 0, `${slug} is not free`);
  });

  it("a question about one place looks up only that place", async () => {
    const { plan, ledger } = await ask("Fort Santiago open ba ngayon at magkano entrance?");
    assert.deepEqual(plan, ["get_place"]);
    assert.deepEqual(ledger.ranked, ["fort-santiago"]);
  });

  it("a BGC date night shows evening date spots in and near BGC, and says the area is thin", async () => {
    const { search } = await ask("Date sa BGC Saturday night");
    const slugs = search!.places.map((place) => place.slug);
    assert.equal(slugs[0], "gallery-by-chele");
    assert.ok(!slugs.includes("the-mind-museum"), "a daytime museum is not a night date");
    for (const slug of slugs) {
      const place = bySlug.get(slug)!;
      assert.ok(["Taguig", "Makati"].includes(place.city ?? ""), `${slug} is far from BGC`);
      assert.ok(vibeMatches(place, "date"), `${slug} is not a date spot`);
    }
    assert.match(search!.note ?? "", /thin/);
  });

  it("rain with kids in QC shows indoor family places, never a bar", async () => {
    const { search } = await ask("Umuulan, QC with kids");
    assert.equal(search!.places[0].slug, "art-in-island");
    for (const { slug } of search!.places) {
      const place = bySlug.get(slug)!;
      assert.notEqual(place.category, "Nightlife");
      assert.ok(vibeMatches(place, "family"), `${slug} is not for kids`);
    }
  });

  it("knows food streets that aren't filed as restaurants", () => {
    assert.ok(isFoodStreet(bySlug.get("binondo-chinatown")!));
    assert.ok(isFoodStreet(bySlug.get("cubao-expo")!));
    assert.ok(!isFoodStreet(bySlug.get("fort-santiago")!));
    assert.ok(!isFoodStreet(bySlug.get("toyo-eatery")!));
  });
});
