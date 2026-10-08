import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFoodStreet, vibeMatches } from "../../domain/queryIntent";
import { planTools } from "./agent";
import { allFixturePlaces, visibleFixturePlaces } from "./fixtures/testPlaces";
import { fallbackText } from "./compose";
import { updateMemory } from "./memory";
import { EMPTY_MEMORY, type PlaceCard } from "./schema";
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
    const { search } = await ask("saan masarap na lemon pie sa Makati?");
    assert.deepEqual(search!.places.map((place) => place.slug), ["sagada-lemon-pie-house"]);
    assert.match(search!.note ?? "", /No GalaTayo place in Makati has lemon/);
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

  it("a BGC date night shows evening date spots in and near BGC, and says which ones are outside it", async () => {
    const { search } = await ask("Date sa BGC Saturday night");
    const slugs = search!.places.map((place) => place.slug);
    assert.equal(slugs[0], "gallery-by-chele");
    assert.ok(!slugs.includes("the-mind-museum"), "a daytime museum is not a night date");
    for (const slug of slugs) {
      const place = bySlug.get(slug)!;
      assert.ok(["Taguig", "Makati"].includes(place.city ?? ""), `${slug} is far from BGC`);
      assert.ok(vibeMatches(place, "date"), `${slug} is not a date spot`);
    }
    // Never "GalaTayo is still growing here": the model is told which places are outside BGC instead.
    assert.match(search!.note ?? "", /outside BGC/);
    assert.doesNotMatch(search!.note ?? "", /thin/);
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

  it("'waterfalls in cebu' is the province: Kawasan and Aguinid, not 'none in Cebu City'", async () => {
    const { search } = await ask("waterfalls in cebu");
    const slugs = search!.places.map((place) => place.slug);
    assert.ok(slugs.includes("kawasan-falls-badian") && slugs.includes("aguinid-falls-samboan"), slugs.join(", "));
    assert.equal(updateMemory({ ...EMPTY_MEMORY }, "waterfalls in cebu", visibleFixturePlaces, "2026-10-10").area, "Cebu");
  });

  it("'waterfalls near cebu city' checks the catalogue: the nearest falls in the same province, said plainly", async () => {
    const { search } = await ask("waterfalls near cebu city");
    const slugs = search!.places.map((place) => place.slug);
    assert.deepEqual(slugs.slice(0, 2).sort(), ["aguinid-falls-samboan", "kawasan-falls-badian"]);
    assert.ok(slugs.every((slug) => ["Badian", "Samboan"].includes(bySlug.get(slug)!.city ?? "")), slugs.join(", "));
    assert.match(search!.note ?? "", /nearest/);
  });

  it("a rainy QC ask never shows a bar district, and only borrows outside QC when QC has almost nothing", async () => {
    const { search, ledger } = await ask("rainy day saan pwede sa QC with barkada?");
    const slugs = search!.places.map((place) => place.slug);
    assert.ok(!slugs.includes("poblacion-makati"));
    assert.equal(slugs[0], "art-in-island");
    for (const slug of slugs.filter((entry) => bySlug.get(entry)!.city !== "Quezon City")) assert.ok(!ledger.inArea!.has(slug));
  });

  it("a Makati date night under ₱1,000 a head stays in Makati", async () => {
    const { search } = await ask("date night in makati under 2000 for two");
    assert.ok(search!.places.length >= 2);
    for (const { slug } of search!.places) assert.equal(bySlug.get(slug)!.city, "Makati", slug);
  });

  it("a tourist's one day in Manila gets the city's best, not two picks and 'still growing'", async () => {
    const { search } = await ask("I'm visiting Manila for one day from Japan. What should I see?");
    const slugs = search!.places.map((place) => place.slug);
    assert.ok(slugs.length >= 4, slugs.join(", "));
    assert.ok(slugs.includes("fort-santiago"));
    assert.doesNotMatch(search!.note ?? "", /thin|growing/);
  });

  it("the no-AI answer titles places outside the area as outside it", () => {
    const card = (slug: string, city: string) => ({ slug, name: slug, city, budgetLabel: null }) as unknown as PlaceCard;
    const memory = { ...EMPTY_MEMORY, area: "QC" };
    const text = fallbackText([card("art-in-island", "Quezon City"), card("the-mind-museum", "Taguig")], memory, null, new Set(["art-in-island"]));
    assert.match(text, /^Here are great picks in QC:\n- \*\*art-in-island\*\*\nA short ride away:\n- \*\*the-mind-museum\*\* \(Taguig\)$/);
    assert.match(fallbackText([card("the-mind-museum", "Taguig")], memory, null, new Set()), /^Nothing in QC fits that yet/);
    assert.match(fallbackText([card("x", "Zambales")], { ...EMPTY_MEMORY, area: "near Manila" }, null), /^Here are great picks near Manila:/);
  });

  it("knows food streets that aren't filed as restaurants", () => {
    assert.ok(isFoodStreet(bySlug.get("binondo-chinatown")!));
    assert.ok(isFoodStreet(bySlug.get("cubao-expo")!));
    assert.ok(!isFoodStreet(bySlug.get("fort-santiago")!));
    assert.ok(!isFoodStreet(bySlug.get("toyo-eatery")!));
  });
});
