import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import {
  buildFallbackDraft,
  fillGaps,
  cleanNote,
  cleanSummary,
  clampStay,
  describeStop,
  detectLocationIntent,
  driveMinutesFromManila,
  defaultStart,
  dropOffHoursFood,
  ensureRequested,
  isDarkOutdoor,
  orderByTimeOfDay,
  parseDeparture,
  preferInArea,
  requestedKinds,
  tightenRoute,
  topUpStops,
  ensureMeal,
  findUncoveredArea,
  fitBudget,
  keepStopsNearby,
  parseBudgetPerHead,
  parseDraft,
  parseGroupSize,
  parsePlanConstraints,
  parseTimeWindow,
  placesForArea,
  requiredMeal,
  resolvePlanDate,
  resolvePromptDate,
  scheduleStops,
  selectCandidates,
  servesMeal,
  wantsEvening,
} from "./galaPlanDraftPlanner";

function place(overrides: Partial<NormalizedPlace>): NormalizedPlace {
  return {
    id: "id",
    name: "Place",
    slug: "place",
    category: "Food",
    address: null,
    city: "Makati",
    area: null,
    latitude: 14.55,
    longitude: 121.02,
    google_maps_url: null,
    description: null,
    best_time_to_visit: null,
    visit_duration: null,
    good_for: [],
    commute_access: null,
    parking_info: null,
    budget_min: null,
    budget_note: null,
    price_level: null,
    faqs: [],
    search_terms: [],
    tags: [],
    average_rating: 4,
    review_count: 0,
    status: "active",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("selectCandidates", () => {
  const places = [
    place({ id: "a", name: "Some Thai", category: "Food", city: "Taguig" }),
    place({ id: "b", name: "Glorietta Cinemas", category: "Cinema", city: "Makati" }),
    place({ id: "c", name: "Venice Grand Canal", category: "Mall", city: "Taguig" }),
    place({ id: "d", name: "No Pin Cafe", category: "Cafe", city: "Taguig", latitude: null }),
  ];

  it("ranks places in an aliased area first and drops places without coordinates", () => {
    const ids = selectCandidates(places, "Date sa BGC, dinner tapos sine").map((entry) => entry.id);
    assert.equal(ids.includes("d"), false);
    assert.equal(ids[0], "a");
  });

  it("stays in Metro Manila unless the prompt names another destination", () => {
    const mixed = [
      place({ id: "baguio", name: "Pine Cafe", category: "Cafe", city: "Baguio", average_rating: 5 }),
      place({ id: "makati", name: "Corner Cafe", category: "Cafe", city: "Makati", average_rating: 3 }),
    ];
    assert.equal(selectCandidates(mixed, "Chill cafe date")[0].id, "makati");
    assert.equal(selectCandidates(mixed, "Cafe hopping sa Baguio")[0].id, "baguio");
  });
});

describe("parseDraft", () => {
  const candidates = [
    place({ id: "a", name: "Some Thai" }),
    place({ id: "b", name: "Glorietta Cinemas", category: "Cinema" }),
    place({ id: "c", name: "Venice Grand Canal", category: "Mall" }),
  ];

  it("keeps only known, unique stops and clamps values", () => {
    const draft = parseDraft(
      JSON.stringify({
        title: "BGC date",
        group_size: 2,
        stops: [
          { ref: "p1", time: "18:30", minutes: 500, note: "Dinner" },
          { ref: "p1", time: "19:00", minutes: 60, note: "Duplicate" },
          { ref: "p9", time: "20:00", minutes: 60, note: "Unknown" },
          { ref: "p2", time: "25:99", minutes: 10, note: "Movie" },
        ],
      }),
      candidates,
    );

    assert.ok(draft);
    assert.deepEqual(draft.stops.map((stop) => stop.place_id), ["a", "b"]);
    assert.equal(draft.stops[0].minutes, 240);
    assert.equal(draft.stops[1].minutes, 30);
    assert.equal(draft.stops[1].time, "");
  });

  it("repairs loose output: fences, trailing commas, 12h times, ids or names instead of refs", () => {
    const raw = '```json\n{"title":"Gala","itinerary":[{"place_id":"c","time":"3:30 PM","duration":"2 hours"},{"name":"some thai","time":"7pm","minutes":"90"},]}\n```';
    const draft = parseDraft(raw, candidates);
    assert.ok(draft);
    assert.deepEqual(
      draft.stops.map((stop) => [stop.place_id, stop.time, stop.minutes]),
      [
        ["c", "15:30", 120],
        ["a", "19:00", 90],
      ],
    );
  });

  it("rejects unusable output and plans with fewer than two stops", () => {
    assert.equal(parseDraft("not json", candidates), null);
    assert.equal(parseDraft(JSON.stringify({ stops: [{ ref: "p1" }] }), candidates), null);
  });
});

describe("resolvePromptDate", () => {
  // 2026-09-30 is a Wednesday.
  it("resolves English and Tagalog day words", () => {
    assert.equal(resolvePromptDate("Chill Sunday sa Manila", "2026-09-30"), "2026-10-04");
    assert.equal(resolvePromptDate("Sabado night out", "2026-09-30"), "2026-10-03");
    assert.equal(resolvePromptDate("gala bukas", "2026-09-30"), "2026-10-01");
    assert.equal(resolvePromptDate("Wednesday lunch", "2026-09-30"), "2026-09-30");
    assert.equal(resolvePromptDate("this weekend sa BGC", "2026-09-30"), "2026-10-03");
  });

  it("returns null when no day is named", () => {
    assert.equal(resolvePromptDate("Date sa BGC", "2026-09-30"), null);
  });
});

describe("resolvePlanDate", () => {
  it("defaults to the next Saturday instead of today", () => {
    assert.deepEqual(resolvePlanDate("Date sa BGC", "2026-09-30"), { date: "2026-10-03", source: "default" });
    // On a Saturday the default is the following one, so there is time to prepare.
    assert.deepEqual(resolvePlanDate("Date sa BGC", "2026-10-03"), { date: "2026-10-10", source: "default" });
    assert.deepEqual(resolvePlanDate("Sunday museum day", "2026-09-30"), { date: "2026-10-04", source: "prompt" });
  });
});

describe("parseGroupSize", () => {
  it("reads group sizes in English and Taglish", () => {
    assert.equal(parseGroupSize("food trip, 6 kami"), 6);
    assert.equal(parseGroupSize("dinner for two"), 2);
    assert.equal(parseGroupSize("date sa Intramuros"), 2);
    assert.equal(parseGroupSize("museum day"), null);
  });
});

describe("scheduleStops", () => {
  const sunsetMinutes = 17 * 60 + 40;
  const pier = place({ id: "pier", name: "Bay Walk", category: "Park", tags: ["sunset"], latitude: 14.56, longitude: 120.98 });
  const resto = place({ id: "resto", name: "Ilustrado", category: "Food", latitude: 14.59, longitude: 120.975 });
  const museum = place({ id: "museum", name: "National Museum", category: "Museum", latitude: 14.587, longitude: 120.981 });
  const bar = place({ id: "bar", name: "Rooftop Bar", category: "Nightlife", latitude: 14.565, longitude: 121.03 });
  const byId = new Map([pier, resto, museum, bar].map((entry) => [entry.id, entry]));
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

  it("moves a 3:45 PM sunset stop to sunset and dinner after it", () => {
    const stops = scheduleStops(
      [
        { place_id: "pier", time: "15:45", minutes: 60, note: "Sunset by the bay" },
        { place_id: "resto", time: "16:45", minutes: 90, note: "Dinner" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: true },
    );
    assert.equal(stops[0].place_id, "pier");
    assert.equal(stops[0].time, "16:55");
    assert.ok(toMinutes(stops[1].time) >= 17 * 60 + 30, `dinner at ${stops[1].time}`);
    assert.ok(toMinutes(stops[1].time) >= toMinutes(stops[0].time) + 60, "dinner starts after the sunset stop ends");
  });

  it("puts sunset before dinner and the bar last, whatever order the model used", () => {
    const stops = scheduleStops(
      [
        { place_id: "bar", time: "14:00", minutes: 120, note: "Drinks" },
        { place_id: "resto", time: "15:00", minutes: 90, note: "Dinner" },
        { place_id: "pier", time: "16:00", minutes: 45, note: "Golden hour walk" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: true },
    );
    assert.deepEqual(stops.map((stop) => stop.place_id), ["pier", "resto", "bar"]);
    assert.ok(toMinutes(stops[2].time) >= 19 * 60, `bar at ${stops[2].time}`);
  });

  it("allows for travel time and keeps museums within opening hours", () => {
    const stops = scheduleStops(
      [
        { place_id: "museum", time: "17:00", minutes: 90, note: "Art" },
        { place_id: "resto", time: "17:10", minutes: 60, note: "Lunch" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: false },
    );
    assert.ok(toMinutes(stops[0].time) <= 16 * 60, `museum at ${stops[0].time}`);
    assert.ok(toMinutes(stops[1].time) >= toMinutes(stops[0].time) + 90 + 5);
  });

  it("starts no earlier than the given time on same-day plans", () => {
    const stops = scheduleStops(
      [
        { place_id: "museum", time: "09:00", minutes: 60, note: "" },
        { place_id: "resto", time: "10:30", minutes: 60, note: "" },
      ],
      byId,
      { sunsetMinutes, wantsSunset: false, notBefore: 14 * 60 },
    );
    assert.equal(stops[0].time, "14:00");
  });
});

describe("buildFallbackDraft", () => {
  it("builds a plan from GalaTayo places matching the request", () => {
    const candidates = [
      place({ id: "cafe", name: "Corner Cafe", category: "Cafe" }),
      place({ id: "food", name: "Some Thai", category: "Food" }),
      place({ id: "park", name: "Bay Walk", category: "Park" }),
      place({ id: "mall", name: "Big Mall", category: "Mall" }),
    ];
    const draft = buildFallbackDraft("sunset date then dinner for 2", candidates);
    assert.ok(draft);
    assert.deepEqual(draft.stops.map((stop) => stop.place_id), ["park", "food", "cafe"]);
    assert.equal(draft.group_size, 2);
    assert.equal(draft.title, "Day out in Makati");
  });
});

describe("findUncoveredArea", () => {
  const places = [place({ id: "a", city: "Makati" }), place({ id: "b", city: "Makati" })];
  it("names a requested area GalaTayo has no places in", () => {
    assert.equal(findUncoveredArea(places, "Baguio day trip"), "Baguio");
    assert.equal(findUncoveredArea(places, "Makati food trip"), null);
    assert.equal(findUncoveredArea(places, "chill cafe date"), null);
  });
});

describe("plan sense rules", () => {
  const bgcCafe = place({ id: "a", name: "BGC Cafe", category: "Cafe", city: "Taguig", latitude: 14.55, longitude: 121.05 });
  const bgcDinner = place({ id: "b", name: "BGC Dinner", category: "Food", city: "Taguig", latitude: 14.552, longitude: 121.048 });
  const cubao = place({ id: "c", name: "Cubao Expo", category: "Activity", city: "Quezon City", latitude: 14.62, longitude: 121.05 });
  const byId = new Map([bgcCafe, bgcDinner, cubao].map((p) => [p.id, p]));
  const stop = (id: string) => ({ place_id: id, time: "", minutes: 60, note: "" });

  it("treats date nights and gabi plans as evening plans", () => {
    assert.equal(wantsEvening("Date night in BGC under 2000"), true);
    assert.equal(wantsEvening("Gala mamayang gabi sa Makati"), true);
    assert.equal(wantsEvening("Rainy day museums in Manila"), false);
  });

  it("drops stops outside the named area", () => {
    const intent = detectLocationIntent([bgcCafe, bgcDinner, cubao], "date night in taguig");
    const kept = keepStopsNearby([stop("a"), stop("c"), stop("b")], byId, intent);
    assert.deepEqual(kept.map((s) => s.place_id), ["a", "b"]);
  });

  it("keeps stops close together when no area is named", () => {
    const kept = keepStopsNearby([stop("a"), stop("b"), stop("c")], byId, { cities: new Set(), destinationSlugs: new Set() }, 5);
    assert.deepEqual(kept.map((s) => s.place_id), ["a", "b"]);
  });

  it("schedules night markets after dark", () => {
    const market = place({ id: "m", name: "Baguio Night Market", category: "Activity", latitude: 16.41, longitude: 120.6 });
    const cafe = place({ id: "k", name: "Cafe", category: "Cafe", latitude: 16.411, longitude: 120.601 });
    const out = scheduleStops([stop("m"), stop("k")], new Map([market, cafe].map((p) => [p.id, p])), { sunsetMinutes: 17 * 60 + 40, wantsSunset: false });
    const marketStop = out.find((s) => s.place_id === "m")!;
    assert.ok(Number(marketStop.time.split(":")[0]) >= 19);
  });
});

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

describe("parseBudgetPerHead", () => {
  it("reads per-head budgets in English and Taglish", () => {
    assert.equal(parseBudgetPerHead("Chill na Sabado sa Intramuros, 4 kami, ₱800 each", 4), 800);
    assert.equal(parseBudgetPerHead("Tagaytay, 5 kami, tig-₱1,500", 5), 1500);
    assert.equal(parseBudgetPerHead("museum day, PHP 600 per head", 3), 600);
    assert.equal(parseBudgetPerHead("Gimik sa Poblacion, ₱1k each", 3), 1000);
  });

  it("splits a group or couple budget", () => {
    assert.equal(parseBudgetPerHead("Date night sa BGC, ₱2k for two", 2), 1000);
    assert.equal(parseBudgetPerHead("Dinner and a movie in BGC for two, ₱2,000 budget", 2), 1000);
    assert.equal(parseBudgetPerHead("Murang date sa QC, ₱500 lang total para sa dalawa", 2), 250);
    assert.equal(parseBudgetPerHead("Barkada outing, ₱6,000 total", 6), 1000);
  });

  it("ignores prompts without a budget and stray small numbers", () => {
    assert.equal(parseBudgetPerHead("Chill day sa Makati, 4 kami", 4), null);
    assert.equal(parseBudgetPerHead("simula 2pm hanggang 8pm", null), null);
    assert.equal(parseBudgetPerHead("around 2pm in Makati for 4", 4), null);
    assert.equal(parseBudgetPerHead("around 100 people party", null), null);
  });

  it("reads bare amounts that say whose they are or hedge (QA round 4)", () => {
    assert.equal(parseBudgetPerHead("Saturday food trip in Binondo for 4 friends, around 800 each, lunch until early dinner", 4), 800);
    assert.equal(parseBudgetPerHead("Rainy Saturday in Quezon City for 6 friends, 1000 each", 6), 1000);
    assert.equal(parseBudgetPerHead("Date night in Cebu City for 2, 3000 total", 2), 1500);
    assert.equal(parseBudgetPerHead("date for 2 around 1500", 2), 750);
  });
});

describe("parseTimeWindow", () => {
  it("reads Taglish start and end words", () => {
    assert.deepEqual(parseTimeWindow("Chill na Sabado sa Intramuros, 4 kami, ₱800 each, simula 2pm hanggang gabi"), { start: at(14), end: at(21) });
    assert.deepEqual(parseTimeWindow("Food trip sa Binondo, umaga hanggang tanghali"), { start: at(9), end: at(13) });
    assert.deepEqual(parseTimeWindow("alas-3 ng hapon hanggang alas-8 ng gabi"), { start: at(15), end: at(20) });
  });

  it("reads English clock ranges", () => {
    assert.deepEqual(parseTimeWindow("Baguio cafe hopping for 2, from 10am to 4pm"), { start: at(10), end: at(16) });
    assert.deepEqual(parseTimeWindow("museum hop 2-6pm"), { start: at(14), end: at(18) });
    assert.deepEqual(parseTimeWindow("Tagaytay day trip, alis 8am"), { start: at(8), end: null });
  });

  it("treats evening words as a start only when they aren't the end", () => {
    assert.equal(parseTimeWindow("Date night sa BGC").start, at(17, 30));
    assert.equal(parseTimeWindow("Chill day, until gabi").start, null);
    assert.deepEqual(parseTimeWindow("Date sa BGC, ₱2k"), { start: null, end: null });
  });
});

describe("requiredMeal", () => {
  it("asks for dinner on date nights and evening-long plans", () => {
    assert.equal(requiredMeal("Date night sa BGC", { start: null, end: null }), "dinner");
    assert.equal(requiredMeal("Chill sa Intramuros", { start: at(14), end: at(21) }), "dinner");
    assert.equal(requiredMeal("Food trip sa Binondo", { start: at(9), end: at(13) }), "lunch");
    assert.equal(requiredMeal("Museum morning", { start: at(9), end: at(12) }), null);
  });

  it("combines into plan constraints", () => {
    assert.deepEqual(parsePlanConstraints("Chill na Sabado sa Intramuros, 4 kami, ₱800 each, simula 2pm hanggang gabi", 4), {
      budgetPerHead: 800,
      start: at(14),
      end: at(21),
      meal: "dinner",
      indoor: false,
    });
  });
});

describe("area aliases", () => {
  const taguig = [
    place({ id: "bhs", name: "Bonifacio High Street", category: "Mall", city: "Taguig", area: "Bonifacio Global City", latitude: 14.5508, longitude: 121.0509 }),
    place({ id: "venice", name: "Venice Grand Canal Mall", category: "Mall", city: "Taguig", area: "McKinley Hill", latitude: 14.5355, longitude: 121.0503 }),
  ];
  const poblacion = place({ id: "alamat", name: "Alamat", category: "Food", city: "Makati", area: "Poblacion", latitude: 14.5649, longitude: 121.0303, budget_min: 600 });
  const ermita = place({ id: "clock", name: "Manila Clock Tower Museum", category: "Museum", city: "Manila", area: "Ermita", latitude: 14.5896, longitude: 120.9813, budget_min: 100 });
  const ayala = place({ id: "ayala", name: "Ayala Museum", category: "Museum", city: "Makati", area: "Ayala Center", latitude: 14.5534, longitude: 121.0236, budget_min: 450 });
  const chele = place({ id: "chele", name: "Gallery by Chele", category: "Food", city: "Taguig", area: "Bonifacio Global City", latitude: 14.553, longitude: 121.048, budget_min: 3500 });
  const all = [...taguig, poblacion, ermita, ayala, chele];

  it("maps nicknames to cities", () => {
    assert.deepEqual([...detectLocationIntent(all, "Date night sa BGC").cities], ["taguig"]);
    assert.deepEqual([...detectLocationIntent(all, "Quiet cafes in QC").cities], ["quezon city"]);
    assert.deepEqual([...detectLocationIntent(all, "Food trip sa Binondo").cities], ["manila"]);
    assert.deepEqual([...detectLocationIntent(all, "Things to do in Metro Manila").cities], []);
  });

  it("lets a small area reach a short ride out, never across the metro", () => {
    const ids = placesForArea(all, detectLocationIntent(all, "Date night sa BGC")).map((entry) => entry.id);
    assert.ok(ids.includes("alamat"), "Poblacion is a short ride from BGC");
    assert.equal(ids.includes("clock"), false, "Ermita is across the metro");
  });

  it("leaves out stops over budget and venues closed for a night plan", () => {
    const ids = selectCandidates(all, "Date night sa BGC, ₱2k for two", 30, undefined, { budgetPerHead: 1000, start: at(17, 30) }).map((entry) => entry.id);
    assert.equal(ids.includes("chele"), false, "₱3,500 dinner is over ₱1,000 a head");
    assert.equal(ids.includes("ayala"), false, "museums close before a 5:30 PM start");
    assert.ok(ids.includes("bhs"));
  });
});

describe("cleanNote", () => {
  const ayala = place({ name: "Ayala Museum", category: "Museum", description: "Art and history museum in the Ayala Center. Great dioramas." });

  it("strips prices, refs and the bare place name", () => {
    assert.equal(cleanNote("Ayala Museum, 2xPHP450", ayala), "Art and history museum in the Ayala Center.");
    assert.equal(cleanNote("p3 - Cheap eats, PHP 200 each, good for groups", ayala), "Cheap eats, good for groups");
    assert.equal(cleanNote("Ayala Museum: art date bago dinner (₱450)", ayala), "Art date bago dinner");
  });

  it("keeps a good note as is", () => {
    assert.equal(cleanNote("Libre-ish na art date bago dinner", ayala), "Libre-ish na art date bago dinner");
  });
});

describe("meal and budget rules", () => {
  const mall = place({ id: "mall", name: "High Street", category: "Mall", budget_min: 0 });
  const cheap = place({ id: "cheap", name: "Little Tokyo", category: "Food", budget_min: 500, latitude: 14.56, longitude: 121.02 });
  const pricey = place({ id: "pricey", name: "Fancy", category: "Food", budget_min: 3000, latitude: 14.55, longitude: 121.02 });
  const museum = place({ id: "museum", name: "Mind Museum", category: "Museum", budget_min: 625 });
  const byId = new Map([mall, cheap, pricey, museum].map((entry) => [entry.id, entry]));
  const stop = (id: string) => ({ place_id: id, time: "", minutes: 60, note: "" });

  it("adds a dinner that fits the budget when the plan has none", () => {
    const out = ensureMeal([stop("mall"), stop("museum")], [mall, cheap, pricey, museum], "dinner", 1200);
    assert.deepEqual(out.map((entry) => entry.place_id), ["mall", "museum", "cheap"]);
    assert.equal(out[2].time, "19:00");
  });

  it("drops the priciest non-meal stop to fit the budget", () => {
    const out = fitBudget([stop("museum"), stop("mall"), stop("cheap")], byId, 800);
    assert.deepEqual(out.map((entry) => entry.place_id), ["mall", "cheap"]);
  });

  it("never starts before the asked time and ends by the asked end", () => {
    const out = scheduleStops([stop("cheap"), stop("mall"), stop("museum")], byId, { sunsetMinutes: at(17, 40), wantsSunset: false, notBefore: at(14), notAfter: at(15) });
    assert.ok(Number(out[0].time.slice(0, 2)) >= 14, `first stop at ${out[0].time}`);
    assert.equal(out.length, 2);
  });
});

describe("meal fit", () => {
  it("skips eateries whose hours rule the meal out", () => {
    assert.equal(servesMeal(place({ best_time_to_visit: "Late morning to mid-afternoon on weekdays" }), "dinner"), false);
    assert.equal(servesMeal(place({ best_time_to_visit: "Evening to late night" }), "dinner"), true);
    assert.equal(servesMeal(place({ best_time_to_visit: "Dinner, Tuesday to Saturday" }), "lunch"), false);
    assert.equal(servesMeal(place({ best_time_to_visit: null }), "lunch"), true);
  });

  it("never counts a cafe picked for dinner as the meal", () => {
    const cafe = place({ id: "cafe", name: "1919 Grand Cafe", category: "Cafe" });
    const lumpia = place({ id: "lumpia", name: "Lumpia House", category: "Food", best_time_to_visit: "Evening" });
    const stops = [{ place_id: "cafe", time: "", minutes: 60, note: "Light dinner in Binondo" }];
    assert.deepEqual(ensureMeal(stops, [cafe, lumpia], "dinner").map((stop) => stop.place_id), ["cafe", "lumpia"]);
    assert.equal(cleanNote("Light dinner sa Binondo, sulit!", cafe), describeStop(cafe));
    assert.equal(cleanNote("Kape muna bago dinner, chill lang", cafe), "Kape muna bago dinner, chill lang");
  });
});

describe("plan intent rules (QA round 2)", () => {
  const at = (hours: number, minutes = 0) => hours * 60 + minutes;
  const stop = (id: string, time = "", note = "", minutes = 60) => ({ place_id: id, time, minutes, note });
  const pastry = place({ id: "pastry", name: "Apologue Coffee & Pastry", category: "Cafe", city: "Manila", budget_min: 160, best_time_to_visit: "Afternoon after a Binondo food crawl" });
  const quietCafe = place({ id: "quiet", name: "Quiet Cafe", category: "Cafe", city: "Quezon City", latitude: 14.64, longitude: 121.05 });
  const qcDinner = place({ id: "qc-dinner", name: "Deo Gracias", category: "Food", city: "Quezon City", budget_min: 800, best_time_to_visit: "Dinner for date night", latitude: 14.63, longitude: 121.04 });
  const market = place({ id: "market", name: "Sunday Market", category: "Food", city: "Makati", budget_min: 250, best_time_to_visit: "Early Sunday morning" });

  it("reads the asked stops in order, plus the meal the plan needs", () => {
    assert.deepEqual(requestedKinds("Study date sa QC, tahimik na cafe tapos dinner"), ["cafe", "dinner"]);
    assert.deepEqual(requestedKinds("Museum day then drinks sa Poblacion"), ["museum", "nightlife"]);
    assert.deepEqual(requestedKinds("Intramuros walk simula 2pm hanggang gabi", "dinner"), ["dinner"]);
  });

  it("adds a real dinner restaurant, never a pastry cafe as dinner", () => {
    const out = ensureRequested([stop("pastry", "18:30", "Dinner and pastries")], [pastry, quietCafe, qcDinner, market], ["cafe", "dinner"]);
    assert.equal(out.picks.get("cafe"), "pastry");
    assert.equal(out.picks.get("dinner"), "qc-dinner");
    assert.deepEqual(out.missing, []);
  });

  it("says what it could not find instead of faking it", () => {
    const out = ensureRequested([stop("qc-dinner")], [qcDinner, market], ["cafe", "dinner"]);
    assert.deepEqual(out.missing, ["cafe"]);
    assert.deepEqual(out.stops.map((entry) => entry.place_id), ["qc-dinner"]);
  });

  it("keeps a BGC date in BGC/Taguig when a place there does the job", () => {
    const bgc = detectLocationIntent([], "Date night sa BGC");
    const bgcDinner = place({ id: "bgc-dinner", name: "Gallery by Chele", category: "Food", city: "Taguig", budget_min: 1500, best_time_to_visit: "Friday or Saturday dinner", latitude: 14.55, longitude: 121.05 });
    const shangDinner = place({ id: "mandaluyong-dinner", name: "Juniper", category: "Food", city: "Mandaluyong", budget_min: 1000, best_time_to_visit: "Dinner for dates", latitude: 14.58, longitude: 121.056 });
    const walk = place({ id: "bhs", name: "Bonifacio High Street", category: "Mall", city: "Taguig", budget_min: 0, latitude: 14.551, longitude: 121.051 });
    const swapped = preferInArea([stop("bhs"), stop("mandaluyong-dinner")], [walk, shangDinner, bgcDinner], bgc, new Map([["dinner", "mandaluyong-dinner"]]), 2000);
    assert.deepEqual(swapped.stops.map((entry) => entry.place_id), ["bhs", "bgc-dinner"]);
    assert.deepEqual(swapped.outside, []);

    const tight = preferInArea([stop("bhs"), stop("mandaluyong-dinner")], [walk, shangDinner, bgcDinner], bgc, new Map([["dinner", "mandaluyong-dinner"]]), 1200);
    assert.deepEqual(tight.stops.map((entry) => entry.place_id), ["bhs", "mandaluyong-dinner"]);
    assert.deepEqual(tight.outside.map((entry) => entry.id), ["mandaluyong-dinner"]);
  });

  it("caps stays: no four-hour lunch, even to fill a gap before a sunset stop", () => {
    assert.equal(clampStay(place({ category: "Food" }), 240), 120);
    assert.equal(clampStay(place({ category: "Cafe" }), 20), 45);
    const lunch = place({ id: "lunch", name: "Leslie's", category: "Food", city: "Tagaytay", latitude: 14.1, longitude: 120.94 });
    const ridge = place({ id: "ridge", name: "Sky Ranch", category: "Park", city: "Tagaytay", latitude: 14.101, longitude: 120.941, best_time_to_visit: "Late afternoon to sunset" });
    const byId = new Map([lunch, ridge].map((entry) => [entry.id, entry]));
    const out = scheduleStops([stop("lunch", "12:00", "Lunch with a view", 90), stop("ridge", "", "Sunset views", 60)], byId, { sunsetMinutes: at(17, 50), wantsSunset: true });
    assert.ok(out[0].minutes <= 120, `lunch lasts ${out[0].minutes} min`);
  });

  it("leaves out parks after dark unless the park is known for its evenings", () => {
    assert.equal(isDarkOutdoor(place({ category: "Park", best_time_to_visit: "Weekday mornings" }), at(20, 10), at(17, 45)), true);
    assert.equal(isDarkOutdoor(place({ category: "Park", best_time_to_visit: "Late afternoon to evening" }), at(20, 10), at(17, 45)), false);
    assert.equal(isDarkOutdoor(place({ category: "Park" }), at(15), at(17, 45)), false);

    const dinner = place({ id: "dinner", name: "Dinner", category: "Food", best_time_to_visit: "Dinner" });
    const grove = place({ id: "grove", name: "Picnic Grove", category: "Park", best_time_to_visit: "Weekday mornings", latitude: 14.551, longitude: 121.021 });
    const bar = place({ id: "bar", name: "Bar", category: "Nightlife", latitude: 14.552, longitude: 121.022 });
    const byId = new Map([dinner, grove, bar].map((entry) => [entry.id, entry]));
    const out = scheduleStops([stop("dinner", "19:00", "Dinner"), stop("grove", "20:10"), stop("bar", "21:00")], byId, { sunsetMinutes: at(17, 45), wantsSunset: false, notBefore: at(18) });
    assert.deepEqual(out.map((entry) => entry.place_id), ["dinner", "bar"]);
  });

  it("orders by time of day: the asked cafe, then dinner, then the bar", () => {
    const bar = place({ id: "bar", name: "Bar", category: "Nightlife" });
    const byId = new Map([pastry, qcDinner, bar, quietCafe].map((entry) => [entry.id, entry]));
    const picks = new Map<"cafe" | "dinner", string>([["cafe", "quiet"], ["dinner", "qc-dinner"]]);
    const out = orderByTimeOfDay([stop("bar"), stop("qc-dinner"), stop("quiet")], byId, picks);
    assert.deepEqual(out.map((entry) => entry.place_id), ["quiet", "qc-dinner", "bar"]);
  });

  it("goes nearest-next between daytime stops", () => {
    const a = place({ id: "a", category: "Heritage", latitude: 14.59, longitude: 120.97 });
    const far = place({ id: "far", category: "Heritage", latitude: 14.65, longitude: 121.05 });
    const near = place({ id: "near", category: "Museum", latitude: 14.591, longitude: 120.971 });
    const byId = new Map([a, far, near].map((entry) => [entry.id, entry]));
    assert.deepEqual(orderByTimeOfDay([stop("a"), stop("far"), stop("near")], byId).map((entry) => entry.place_id), ["a", "near", "far"]);
  });

  it("runs 'hanggang gabi' plans into the evening with a nearby night spot", () => {
    assert.equal(parseTimeWindow("Intramuros simula 2pm hanggang gabi").end, at(21));
    const dinner = place({ id: "dinner", name: "Barbara's", category: "Food", city: "Manila", latitude: 14.589, longitude: 120.975 });
    const bridge = place({ id: "bridge", name: "Jones Bridge", category: "Heritage", city: "Manila", best_time_to_visit: "Sunset to blue hour, when the lamps turn on", latitude: 14.596, longitude: 120.977 });
    const museum = place({ id: "museum", name: "Casa Manila", category: "Museum", city: "Manila", best_time_to_visit: "Weekday mornings", latitude: 14.589, longitude: 120.975 });
    const out = fillGaps([stop("dinner", "18:00", "Dinner", 90)], [dinner, bridge, museum], { end: at(21), sunsetMinutes: at(17, 45) });
    assert.deepEqual(out.map((entry) => entry.place_id), ["dinner", "bridge"]);
  });

  it("leaves morning-only eateries out of evening plans", () => {
    const byId = new Map([market, qcDinner].map((entry) => [entry.id, entry]));
    assert.deepEqual(dropOffHoursFood([stop("market"), stop("qc-dinner")], byId, true).map((entry) => entry.place_id), ["qc-dinner"]);
    assert.equal(dropOffHoursFood([stop("market")], byId, false).length, 1);
  });

  it("drops a summary that is really internal notes or promises stops the plan lacks", () => {
    const byId = new Map([pastry, qcDinner].map((entry) => [entry.id, entry]));
    const stops = [stop("pastry", "15:00"), stop("qc-dinner", "18:30")];
    assert.equal(cleanSummary("4 ka, 14:00-21:00, 4 stops, dinner at Binondo, sunset at Intramuros", stops, byId, at(17, 45)), "");
    assert.equal(cleanSummary("Kape at chika, tapos sunset walk", stops, byId, at(17, 45)), "");
    assert.equal(cleanSummary("Kape muna, tapos dinner na pang-date", stops, byId, at(17, 45)), "Kape muna, tapos dinner na pang-date");
    assert.equal(cleanSummary("Chill hapon sa Apologue Coffee & Pastry", stops, byId, at(17, 45)), "");
  });

  it("starts a provincial day after the drive from the asked leave time", () => {
    assert.equal(parseDeparture("Tagaytay day trip, alis 7am, 4 kami"), at(7));
    assert.equal(parseDeparture("Tagaytay day, leave at 6:30"), at(6, 30));
    assert.equal(parseDeparture("Tagaytay day trip"), null);
    const drive = driveMinutesFromManila(place({ city: "Tagaytay", latitude: 14.1153, longitude: 120.9621 }));
    assert.ok(drive !== null && drive >= 75 && drive <= 120, `drive ${drive} min`);
  });

  it("starts whole days in the morning, cafe-then-dinner in the afternoon, date nights at 5 PM", () => {
    assert.equal(defaultStart("Baguio weekend: cafes, views and a good dinner"), null);
    assert.equal(defaultStart("Study date sa QC, tahimik na cafe tapos dinner"), at(14));
    assert.equal(defaultStart("Museum day in Manila then dinner"), at(13));
    assert.equal(defaultStart("Date night sa BGC"), at(17));
    assert.equal(defaultStart("Chill Saturday sa Makati"), null);
  });

  it("never puts two meals back to back when a sight can go between", () => {
    const breakfast = place({ id: "breakfast", category: "Food", latitude: 14.1, longitude: 120.94 });
    const lunch = place({ id: "lunch", category: "Food", latitude: 14.11, longitude: 120.95 });
    const park = place({ id: "park", category: "Park", latitude: 14.12, longitude: 120.96 });
    const byId = new Map([breakfast, lunch, park].map((entry) => [entry.id, entry]));
    const out = orderByTimeOfDay([stop("breakfast"), stop("lunch"), stop("park")], byId, new Map([["breakfast", "breakfast"]]));
    assert.deepEqual(out.map((entry) => entry.place_id), ["breakfast", "park", "lunch"]);
  });

  it("puts lunch at midday on a whole-day plan", () => {
    const ids = ["breakfast", "cafe", "grove", "lunch", "ridge", "ranch"];
    const categories: Record<string, string> = { breakfast: "Food", cafe: "Cafe", grove: "Park", lunch: "Food", ridge: "Park", ranch: "Activity" };
    const byId = new Map(ids.map((id, index) => [id, place({ id, category: categories[id], latitude: 14.1 + index * 0.001, longitude: 120.95 })]));
    const picks = new Map<"breakfast" | "lunch", string>([["breakfast", "breakfast"], ["lunch", "lunch"]]);
    const out = orderByTimeOfDay([stop("breakfast", "08:30"), stop("cafe"), stop("grove"), stop("ridge"), stop("ranch"), stop("lunch", "12:00")], byId, picks);
    assert.deepEqual(out.map((entry) => entry.place_id), ["breakfast", "cafe", "grove", "lunch", "ridge", "ranch"]);
  });

  it("leaves out unasked stops far from the asked ones", () => {
    const fairview = place({ id: "fairview", category: "Park", city: "Quezon City", latitude: 14.71, longitude: 121.07 });
    const cubao = place({ id: "cubao", category: "Activity", city: "Quezon City", latitude: 14.62, longitude: 121.05 });
    const byId = new Map([fairview, cubao, qcDinner].map((entry) => [entry.id, entry]));
    const out = tightenRoute([stop("fairview"), stop("cubao"), stop("qc-dinner")], byId, new Set(["qc-dinner"]));
    assert.deepEqual(out.map((entry) => entry.place_id), ["cubao", "qc-dinner"]);
  });

  it("tops a one-stop plan up with a place that is open at that hour", () => {
    const museum = place({ id: "museum", category: "Museum", city: "Quezon City" });
    const expo = place({ id: "expo", category: "Activity", city: "Quezon City", best_time_to_visit: "Late afternoon into the evening" });
    const qc = detectLocationIntent([], "Study date sa QC");
    const out = topUpStops([stop("qc-dinner")], [museum, expo, qcDinner], { start: at(17), sunsetMinutes: at(17, 45), location: qc });
    // Added after the asked-for stop; the schedule puts each stop at its time of day later.
    assert.deepEqual(out.map((entry) => entry.place_id), ["qc-dinner", "expo"]);
  });

  it("tops a day out up to the minimum it is asked for", () => {
    const museum = place({ id: "museum", category: "Museum", city: "Quezon City" });
    const expo = place({ id: "expo", category: "Activity", city: "Quezon City" });
    const qc = detectLocationIntent([], "Day in QC");
    const out = topUpStops([stop("qc-dinner")], [museum, expo, qcDinner], { start: at(10), sunsetMinutes: at(17, 45), location: qc, min: 3 });
    assert.equal(out.length, 3);
  });
});
