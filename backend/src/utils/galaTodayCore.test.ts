import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMAT_ORDER,
  budgetPlan,
  buildEditorPrompt,
  buildPrompt,
  chooseFormat,
  cleanSlug,
  fameTiers,
  parseClock,
  parseEditorReview,
  pesoAmounts,
  tagalogGrammarCount,
  unbackedSuperlatives,
  uniqueSlug,
  validateDraft,
  type TodayPlace,
  type ValidationContext,
} from "./galaTodayCore";
import type { ScoredTrend, TodayTopic } from "./galaTodaySignals";

// Real Metro Manila places (facts, budgets and gala scores as on GalaTayo, Oct 2026).
const place = (slug: string, name: string, category: string, city: string, budgetMin: number | null, score: number, summary: string): TodayPlace => ({
  slug,
  name,
  category,
  city,
  budgetMin,
  score,
  summary,
  canonicalPath: `/places/${city.toLowerCase()}/${slug}`,
});
const PLACES: TodayPlace[] = [
  place("national-museum-of-fine-arts", "National Museum of Fine Arts", "Museum", "Manila", 0, 100, "Free entry, air-con, and Juan Luna's Spoliarium in person - sulit na sulit! The National Museum of Fine Arts sits inside the grand neoclassical Old Legislative Building beside Rizal Park, where Congress and later the Senate once met."),
  place("fort-santiago", "Fort Santiago", "Heritage", "Manila", 75, 100, "Walls, dungeons, river views and Rizal's last footsteps - Fort Santiago is where Manila's history gets real. Built by the Spanish starting in 1571, this triangular fort guards the mouth of the Pasig River."),
  place("intramuros", "Intramuros", "Heritage", "Manila", 0, 99, "Intramuros was founded in 1571 as the capital of Spanish Manila, ringed by thick stone walls and bastions."),
  place("binondo-chinatown", "Binondo Chinatown", "Heritage", "Manila", 0, 99, "Tara, food crawl! Binondo was founded in 1594 for Chinese settlers across the river from Intramuros, and today it's Manila's busiest food-and-trade district."),
  place("rizal-park-luneta-park", "Rizal Park / Luneta Park", "Park", "Manila", 0, 94, "The classic free family gala. Rizal Park covers 58 hectares by Manila Bay."),
  place("manila-ocean-park", "Manila Ocean Park", "Activity", "Manila", 720, 92, "Walk under the sea without getting wet. Manila Ocean Park, behind the Quirino Grandstand in Luneta, has been the go-to family gala since 2008."),
  place("the-mind-museum", "The Mind Museum", "Museum", "Taguig", 625, 92, "Science pero super fun! The Mind Museum in BGC packs more than 250 interactive exhibits into five galleries."),
  place("toyo-eatery", "Toyo Eatery", "Food", "Makati", 2500, 98, "One Michelin star, all-Filipino ingredients, and a dinner you will talk about for weeks."),
  place("pinto-art-museum-antipolo", "Pintô Art Museum", "Museum", "Antipolo", 250, 80, "White Mediterranean-style buildings, lush gardens and walls full of Filipino art."),
];

const trend = (title: string, query: string, source = "Google Trends PH"): TodayTopic => ({
  kind: "trend",
  trend: { title, query, source, url: null, traffic: 2000, demand: 4.3, link: 1, score: 4.3 } satisfies ScoredTrend,
});

const base = (overrides: Partial<ValidationContext>): ValidationContext => ({
  topic: trend("ube cheesecake", "ube cheesecake manila"),
  format: "pov",
  places: PLACES,
  areaName: "Metro Manila",
  weather: null,
  budget: null,
  date: "2026-10-06",
  now: new Date("2026-10-05T22:30:00Z"),
  ...overrides,
});

// Three fixture outputs written to the new prompt, used to check tone and every rule.
export const FIXTURE_BUDGET = {
  title: "The ₱300 ube cheesecake day: Binondo, Fort Santiago, art",
  slug: "300-peso-ube-cheesecake-day",
  hook: "Everyone's hunting ube cheesecake. Here's a full Manila day for ₱75, so the rest of your ₱300 goes to dessert.",
  body: "The ube cheesecake craze is real, and your wallet needs a game plan. Start free at the National Museum of Fine Arts and say hi to Juan Luna's Spoliarium in air-con comfort. Walk to Fort Santiago for ₱75 of walls, river views and Rizal's last footsteps. End with a Binondo food crawl and spend the ₱225 change on whatever sweet thing calls your name. Total gala spend: ₱75. Sulit? Very.",
  meme: { top: "Me: a whole Manila day for ₱75", bottom: "Also me: ₱225 left for ube cheesecake. Strategy." },
  picks: [
    { slug: "fort-santiago", why: "₱75 for walls, dungeons and Pasig River views. History, but make it cardio." },
    { slug: "national-museum-of-fine-arts", why: "Free entry, air-con and the Spoliarium. The flex costs nothing." },
    { slug: "binondo-chinatown", why: "Free to wander, and the food crawl is where your ube budget gets tested." },
  ],
};

export const FIXTURE_TIER = {
  title: "Matcha in hand: the official Manila stroll tier list",
  slug: "matcha-manila-stroll-tier-list",
  hook: "Your matcha is the main character today. We ranked where to carry it. Zero bias. Okay, some bias.",
  body: "The matcha trend isn't slowing down, so give your cup a view. S tier goes to Intramuros: thick stone walls, bastions and streets that make every sip look like a film still. A tier is Rizal Park, 58 hectares by Manila Bay, free and roomy enough for the whole barkada. B tier is Binondo, only because you'll abandon the matcha for the food crawl in five minutes. Tara, pick your tier.",
  meme: { top: "S tier: matcha on Intramuros's stone walls", bottom: "B tier: still beats your couch, honestly" },
  picks: [
    { slug: "binondo-chinatown", tier: "B", why: "Loses only because the food crawl will steal you from your matcha." },
    { slug: "intramuros", tier: "S", why: "Stone walls and bastions from 1571. Your matcha has never looked this cultured." },
    { slug: "rizal-park-luneta-park", tier: "A", why: "58 hectares by Manila Bay, free. Room for the barkada and their twelve orders." },
  ],
};

export const FIXTURE_GUESS = {
  title: "Guess the free Manila weekend spot from 3 clues",
  slug: "guess-the-free-manila-spot",
  hook: "Three clues, one free weekend plan in Manila. Guess it before you scroll down.",
  body: "Weekend plans in Metro Manila don't need a budget meeting. Read the three clues, send your guess to the group chat, then reveal. Bonus stops nearby: Rizal Park for a long walk by Manila Bay, and Intramuros for stone walls and bastions. One afternoon, three spots, no entrance fees. You get bragging rights if you guessed right.",
  meme: { top: "Guess where this is. Hint: it's free", bottom: "Wrong answers only in the GC, then go" },
  clues: [
    "Entry is free and so is the air-con.",
    "It sits in a grand neoclassical building where lawmakers once met.",
    "A famous Juan Luna painting waits for you in person.",
  ],
  picks: [
    { slug: "national-museum-of-fine-arts", why: "Free entry, air-con and Juan Luna's Spoliarium. Weekend sorted." },
    { slug: "rizal-park-luneta-park", why: "58 hectares by Manila Bay for the post-museum walk." },
    { slug: "intramuros", why: "Stone walls and bastions, a short walk away." },
  ],
};

const budgetPlanFixture = budgetPlan(PLACES);

test("formats rotate by date and slot, never repeat back to back, and cover all ten", () => {
  const seen = new Set<string>();
  let previous: string | null = null;
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    for (const slot of [0, 1]) {
      const format = chooseFormat(date, slot, null);
      assert.notEqual(format, previous, `${date} slot ${slot} repeats ${format}`);
      previous = format;
      seen.add(format);
    }
  }
  assert.equal(seen.size, FORMAT_ORDER.length);
  // Same input, same answer.
  assert.equal(chooseFormat("2026-10-06", 0, null), chooseFormat("2026-10-06", 0, null));
  // Skips unavailable formats and the previous post's format.
  const today = chooseFormat("2026-10-06", 0, null);
  assert.notEqual(chooseFormat("2026-10-06", 0, today), today);
  assert.notEqual(chooseFormat("2026-10-06", 0, null, (id) => id !== today), today);
});

test("budget plans come only from real budget data", () => {
  assert.deepEqual(budgetPlanFixture && { cap: budgetPlanFixture.cap, count: budgetPlanFixture.eligible.length }, { cap: 300, count: 6 });
  assert.ok(budgetPlanFixture?.eligible.every((item) => item.budgetMin !== null && item.budgetMin <= 300));
  const pricey = PLACES.filter((item) => ["manila-ocean-park", "the-mind-museum", "toyo-eatery"].includes(item.slug));
  assert.equal(budgetPlan(pricey), null, "₱3,845 for three is over every cap");
  assert.equal(budgetPlan(PLACES.map((item) => ({ ...item, budgetMin: null }))), null);
});

test("peso amounts are read in every common spelling", () => {
  assert.deepEqual(pesoAmounts("₱500 day, P1,200 dinner, PHP 300 jeep, 2k pesos, 75 pesos, ₱2.5k"), [500, 1200, 300, 2500, 2000, 75]);
  assert.deepEqual(pesoAmounts("Built in 1571, 58 hectares, 3 clues"), []);
});

test("budget challenge: totals are computed in code and every peso amount must be backed", () => {
  const context = base({ format: "budget-challenge", budget: { cap: 300 }, places: budgetPlanFixture?.eligible ?? [] });
  const result = validateDraft(FIXTURE_BUDGET, context);
  assert.ok(result.ok, "reason" in result ? result.reason : "");
  if (result.ok) {
    assert.deepEqual(result.post.budget, { cap: 300, total: 75 });
    assert.equal(result.post.sticker, "₱300 Challenge");
    assert.equal(result.post.slug, "300-peso-ube-cheesecake-day");
    assert.equal(result.post.picks[0].budgetMin, 75);
  }
  const invented = validateDraft({ ...FIXTURE_BUDGET, body: `${FIXTURE_BUDGET.body} Merienda is ₱150.` }, context);
  assert.deepEqual(invented, { ok: false, reason: "unbacked peso amount: 150" });
  const unpriced = validateDraft(FIXTURE_BUDGET, { ...context, places: context.places.map((item) => (item.slug === "fort-santiago" ? { ...item, budgetMin: null } : item)) });
  assert.equal(unpriced.ok, false);
  const over = validateDraft(FIXTURE_BUDGET, { ...context, budget: { cap: 50 } });
  assert.equal(over.ok, false);
});

test("tier list needs exactly one S, A and B, sorted S first", () => {
  const context = base({ format: "tier-list", topic: trend("matcha", "matcha manila") });
  const result = validateDraft(FIXTURE_TIER, context);
  assert.ok(result.ok, "reason" in result ? result.reason : "");
  if (result.ok) assert.deepEqual(result.post.picks.map((pick) => `${pick.tier}:${pick.slug}`), ["S:intramuros", "A:rizal-park-luneta-park", "B:binondo-chinatown"]);
  const twoS = validateDraft({ ...FIXTURE_TIER, picks: FIXTURE_TIER.picks.map((pick) => ({ ...pick, tier: pick.tier === "B" ? "S" : pick.tier })) }, context);
  assert.deepEqual(twoS, { ok: false, reason: "tier list needs one S, one A and one B" });
});

test("guess the place: 3 clues, answer never given away, answer leads the meme", () => {
  const context = base({ format: "guess-the-place", topic: { kind: "evergreen", query: "things to do in metro manila this weekend" } });
  const result = validateDraft(FIXTURE_GUESS, context);
  assert.ok(result.ok, "reason" in result ? result.reason : "");
  if (result.ok) {
    assert.equal(result.post.leadSlug, "national-museum-of-fine-arts");
    assert.equal(result.post.clues?.length, 3);
    assert.equal(result.post.topic.kind, "evergreen");
  }
  const spoiler = validateDraft({ ...FIXTURE_GUESS, clues: [...FIXTURE_GUESS.clues.slice(0, 2), "It's the National Museum of Fine Arts."] }, context);
  assert.deepEqual(spoiler, { ok: false, reason: "guess gives away the answer" });
  assert.equal(validateDraft({ ...FIXTURE_GUESS, clues: FIXTURE_GUESS.clues.slice(0, 2) }, context).ok, false);
});

test("meme captions: both lines required and at most 60 characters", () => {
  const context = base({ format: "tier-list", topic: trend("matcha", "matcha manila") });
  const long = validateDraft({ ...FIXTURE_TIER, meme: { top: "S tier: ".padEnd(61, "x"), bottom: "ok then" } }, context);
  assert.deepEqual(long, { ok: false, reason: "meme length" });
  assert.equal(validateDraft({ ...FIXTURE_TIER, meme: { top: "S tier", bottom: "" } }, context).ok, false);
  assert.equal(validateDraft({ ...FIXTURE_TIER, meme: undefined }, context).ok, false);
});

test("format captions and order rules", () => {
  const pov = validateDraft({ ...FIXTURE_TIER, picks: FIXTURE_TIER.picks }, base({ format: "pov", topic: trend("matcha", "matcha manila") }));
  assert.deepEqual(pov, { ok: false, reason: "pov meme must start with POV" });
  const evr = validateDraft(
    { ...FIXTURE_TIER, meme: { top: "Expectation: one quick matcha walk", bottom: "Reality: 400 photos on the walls" } },
    base({ format: "expectation-vs-reality", topic: trend("matcha", "matcha manila") })
  );
  assert.ok(evr.ok, "reason" in evr ? evr.reason : "");
  const hours = (times: string[]) =>
    validateDraft({ ...FIXTURE_TIER, picks: FIXTURE_TIER.picks.map((pick, index) => ({ ...pick, time: times[index] })) }, base({ format: "24-hours", topic: trend("matcha", "matcha manila") }));
  assert.ok(hours(["8 AM", "1:30 PM", "7 PM"]).ok);
  assert.deepEqual(hours(["8 PM", "1 PM", "7 PM"]), { ok: false, reason: "24 hours needs ordered times" });
  // Hidden gem vs the famous one: an icon first, then an underrated pick (by gala score).
  const gem = (first: string, second: string) =>
    validateDraft({ ...FIXTURE_TIER, picks: [{ slug: first, why: "The famous one, and it earns it." }, { slug: second, why: "The underrated friend with great art." }] }, base({ format: "gem-vs-famous", topic: trend("matcha", "matcha manila") }));
  assert.ok(gem("fort-santiago", "pinto-art-museum-antipolo").ok);
  assert.equal(gem("pinto-art-museum-antipolo", "fort-santiago").ok, false);
  const { icons, gems } = fameTiers(PLACES);
  assert.deepEqual([...icons].sort(), ["fort-santiago", "intramuros", "national-museum-of-fine-arts"]);
  assert.deepEqual([...gems].sort(), ["manila-ocean-park", "pinto-art-museum-antipolo", "the-mind-museum"]);
});

test("title must carry the trend's search words; slugs stay clean and whole", () => {
  const context = base({ format: "tier-list", topic: trend("viral ube cheesecake", "ube cheesecake manila") });
  assert.deepEqual(validateDraft(FIXTURE_TIER, context), { ok: false, reason: "title misses the topic" });
  assert.equal(cleanSlug("500 Peso Intramuros Challenge", "x"), "500-peso-intramuros-challenge");
  assert.equal(cleanSlug("", "Rainy Manila? Here are the coziest museum and cafe stops for the barkada"), "rainy-manila-here-are-the-coziest");
  assert.equal(cleanSlug("way-too-long-slug-with-many-extra-words", "Guess the free Manila spot"), "guess-the-free-manila-spot");
  assert.equal(uniqueSlug("matcha-manila-tier-list", "2026-10-06", new Set(["matcha-manila-tier-list"])), "matcha-manila-tier-list-2026-10-06");
});

test("voice and safety rules reject hedges, unkind jokes, heavy Tagalog grammar and unbacked claims", () => {
  const context = base({ format: "tier-list", topic: trend("matcha", "matcha manila") });
  const reject = (patch: Record<string, unknown>) => validateDraft({ ...FIXTURE_TIER, ...patch }, context);
  assert.deepEqual(reject({ hook: "Check the hours first, then bring your matcha to the walls." }), { ok: false, reason: "hedge" });
  assert.deepEqual(reject({ hook: "Matcha walks so easy even your tanga cousin can do it." }), { ok: false, reason: "unkind or religious joke" });
  assert.deepEqual(reject({ hook: "Tara na sa Intramuros, kahit umuulan pa rin ang mga plano natin ngayon." }), { ok: false, reason: "too much Tagalog grammar" });
  assert.deepEqual(reject({ hook: "The best matcha walk in the whole of Metro Manila today, period." }), { ok: false, reason: "unbacked claim: best" });
  assert.deepEqual(reject({ title: "Matcha in hand: the Manila stroll tier list 🍵" }), { ok: false, reason: "emoji in title or meme" });
  assert.equal(tagalogGrammarCount("Tara, barkada! Sulit and kilig."), 0);
  assert.deepEqual(unbackedSuperlatives("The oldest church", "Completed in 1607, it is the oldest stone church."), []);
});

test("clock times parse for the 24-hours format", () => {
  assert.equal(parseClock("8 AM"), 480);
  assert.equal(parseClock("12 NN"), 720);
  assert.equal(parseClock("7:30pm"), 1170);
  assert.equal(parseClock("25 PM"), null);
});

test("prompt carries the trend phrasing, format rules, budgets and fame; never raw weather numbers", () => {
  const { system, user } = buildPrompt({
    date: "2026-10-06",
    topic: trend("ube cheesecake", "ube cheesecake manila"),
    format: "budget-challenge",
    places: budgetPlanFixture?.eligible ?? [],
    areaName: "Metro Manila",
    weather: "Afternoon showers likely, 2–5 PM",
    day: "Weekday",
    budget: { cap: 300 },
  });
  assert.match(system, /No politics, religion/);
  assert.match(system, /mostly simple English/i);
  assert.match(user, /QUERY: ube cheesecake manila/);
  assert.match(user, /STICKER: ₱300 Challenge/);
  assert.match(user, /fort-santiago \| Fort Santiago \| Heritage, Manila \| from ₱75 \| ICON/);
  assert.match(user, /WEATHER: Afternoon showers likely, 2–5 PM/);
  assert.doesNotMatch(user, /%/);
});

test("editor pass: publish only when every score is 8+ and safety 9+", () => {
  const result = validateDraft(FIXTURE_TIER, base({ format: "tier-list", topic: trend("matcha", "matcha manila") }));
  assert.ok(result.ok);
  if (!result.ok) return;
  const { system, user } = buildEditorPrompt(result.post, PLACES);
  assert.match(system, /funny/);
  assert.match(user, /\[S\] Intramuros/);
  assert.match(user, /FACTS:\n- Intramuros/);
  assert.equal(parseEditorReview({ funny: 9, purpose: 8, accuracy: 9, natural: 8, safe: 10, fix: "" }).pass, true);
  assert.equal(parseEditorReview({ funny: 7, purpose: 9, accuracy: 9, natural: 9, safe: 10, fix: "Sharper punchline." }).pass, false);
  assert.equal(parseEditorReview({ funny: "9", purpose: "8", accuracy: "8", natural: "8", safe: "8" }).pass, false);
  assert.equal(parseEditorReview(null).pass, false);
});
