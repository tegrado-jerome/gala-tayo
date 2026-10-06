import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedPlace } from "../domain/places";
import {
  buildFallbackDraft,
  cleanNote,
  detectLocationIntent,
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
    assert.equal(draft.title, "Gala sa Makati");
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

  it("counts a cafe picked for dinner as the meal", () => {
    const cafe = place({ id: "cafe", name: "1919 Grand Cafe", category: "Cafe" });
    const lumpia = place({ id: "lumpia", name: "Lumpia House", category: "Food", best_time_to_visit: "Evening" });
    const stops = [{ place_id: "cafe", time: "", minutes: 60, note: "Light dinner in Binondo" }];
    assert.deepEqual(ensureMeal(stops, [cafe, lumpia], "dinner").map((stop) => stop.place_id), ["cafe"]);
  });
});
