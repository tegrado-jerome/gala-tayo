import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces, type NormalizedPlace } from "../domain/places";
import { isIndoorPlace } from "../domain/queryIntent";
import { consumeAskAiUsageForActor, refundAskAiUsageForActor } from "../services/askAiUsageService";
import { generateJsonFromGroq } from "../services/groqChatProvider";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import {
  areaLabel,
  buildFallbackDraft,
  capSightsForFoodTrip,
  buildSystemPrompt,
  buildUserMessage,
  cleanSummary,
  defaultStart,
  describeStop,
  detectLocationIntent,
  driveMinutesFromManila,
  dropParentAreas,
  dropOffHoursFood,
  ensureAreaStop,
  ensureRequested,
  fillGaps,
  fitsKind,
  fitBudget,
  formatClock12,
  formatDuration,
  getPlanSunset,
  isDarkOutdoor,
  hasLocation,
  keepStopsNearby,
  KIND_LABEL,
  manilaToday,
  matchesLocation,
  mealEstimatePerHead,
  orderByTimeOfDay,
  parseDeparture,
  parseDraft,
  parseClock,
  parseGroupSize,
  parsePlanConstraints,
  pickSunsetStop,
  PLAN_CANDIDATES,
  placesForArea,
  preferInArea,
  requestedKinds,
  resolvePlanDate,
  scheduleStops,
  selectCandidates,
  tightenRoute,
  topUpStops,
  typicalMealCost,
  wantsEvening,
  wantsSunset,
  wantsWholeDay,
  weekdayOf,
  widenThinArea,
  type DraftResponse,
  type DraftStop,
  type PlanConstraints,
} from "../services/galaPlanDraftPlanner";
import { isMealStop } from "../domain/queryIntent";
import { isMetroManilaDestination, resolveDestination } from "../utils/phDestinations";

/** Straight-line km between two points. */
function distanceKm(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity;
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function planCentre(places: Array<NormalizedPlace | undefined>) {
  const mapped = places.filter((place): place is NormalizedPlace => place?.latitude != null && place.longitude != null);
  if (mapped.length === 0) return null;
  return {
    latitude: mapped.reduce((sum, place) => sum + place.latitude!, 0) / mapped.length,
    longitude: mapped.reduce((sum, place) => sum + place.longitude!, 0) / mapped.length,
  };
}

const MEAL_TIMES: Record<string, string> = { breakfast: "08:00", lunch: "12:00", dinner: "19:00" };
// Chosen places farther apart than this can't share one day out.
const PINNED_REACH_KM = 60;
const MAX_PINNED = 6;
// Inside Metro Manila a missing meal may come from just outside the asked area, never across the metro.
const METRO_OUTSIDE_KM = 3;
const formatPeso = (value: number) => `₱${value.toLocaleString("en-PH")}`;
const STATED_CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\b|\balas[-\s]?\d/i;
const DATE_ASK = /\b(date|romantic|jowa|anniversary|monthsary|sunset)\b/i;
const FOOD_TRIP = /\b(food ?trip|food crawl|foodie|food tour|kainan|eat(?:ing)? our way)\b/i;
import { isAskAiIpAllowed, resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
import { hasCuratedPhoto, placePhotoKey } from "../utils/hdPhotos";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { buildDailyLimitMessage, shouldAcceptAskAiPrompt } from "./askAi";
import { ASK_AI_SCOPE_REJECTION_MESSAGE } from "./askAiStrictPgGuard";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_PROMPT_LENGTH = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACE_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

async function getBody(request: HttpRequest) {
  try {
    const body = (await request.json()) as { prompt?: unknown; date?: unknown; places?: unknown };
    return {
      prompt: typeof body?.prompt === "string" ? body.prompt.trim() : "",
      date: typeof body?.date === "string" && ISO_DATE.test(body.date) ? body.date : null,
      // Slugs of places the user chose; only slugs, never anything about the user.
      places: Array.isArray(body?.places)
        ? [...new Set(body.places.filter((slug): slug is string => typeof slug === "string" && PLACE_SLUG.test(slug)))].slice(0, MAX_PINNED)
        : [],
    };
  } catch {
    return { prompt: "", date: null, places: [] };
  }
}

type PlanContext = { date: string; weekday: string; sunsetMinutes: number };

/** Asks the model for a plan, retrying once: a busy model is usually free a second later. */
async function draftWithModel(prompt: string, candidates: NormalizedPlace[], plan: PlanContext, constraints: PlanConstraints, requestId: string, log: (message: string) => void) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await generateJsonFromGroq({
        systemPrompt: buildSystemPrompt(plan, constraints),
        userMessage: buildUserMessage(prompt, candidates),
        requestId: `${requestId}-${attempt}`,
      });
      const parsed = parseDraft(raw, candidates);
      if (parsed) return parsed;
      log(`attempt ${attempt}: unusable plan JSON`);
    } catch (error) {
      log(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return null;
}

const titleCase = (value: string) => value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

export type PlanDraftOutcome =
  | { ok: true; source: "ai" | "fallback"; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

/** The whole planning pipeline, without auth or usage, so it can be exercised directly. */
export async function buildPlanDraft({
  prompt,
  places,
  placeSlugs = [],
  requestedDate,
  requestId,
  log = () => undefined,
  model = draftWithModel,
  loadImages = getApprovedPlaceImagesByPlaceIds,
}: {
  prompt: string;
  places: NormalizedPlace[];
  /** Places the user chose ("Plan a trip from these"): every one is a stop, or a note says why not. */
  placeSlugs?: string[];
  requestedDate: string | null;
  requestId: string;
  log?: (message: string) => void;
  /** Tests pass a stand-in for the model and the photo lookup. */
  model?: typeof draftWithModel;
  loadImages?: (placeIds: string[]) => Promise<Map<string, Array<{ storage_key: string }>>>;
}): Promise<PlanDraftOutcome> {
  // Chosen places a day can hold: the first one and the others within a day's reach of it.
  const chosen = placeSlugs.map((slug) => places.find((place) => place.slug === slug)).filter((place): place is NormalizedPlace => Boolean(place));
  const pinned = chosen.filter((place, index) => index === 0 || distanceKm(chosen[0], place) <= PINNED_REACH_KM).slice(0, MAX_PINNED);
  const tooFar = chosen.filter((place) => !pinned.includes(place));
  const promptArea = detectLocationIntent(places, prompt);
  // With chosen places, the plan's area is where they are (plus any area the request names).
  const askedArea = pinned.length
    ? {
        ...promptArea,
        cities: new Set([...promptArea.cities, ...pinned.map((place) => (place.city ?? "").toLowerCase()).filter(Boolean)]),
        // The chosen places' names ("Binondo Chinatown") aren't a district the whole plan must sit in.
        areaWords: new Set<string>(),
      }
    : promptArea;
  // A thin area (QC has three places) borrows the nearest cities around it; an empty one can't be planned.
  const { location, added: borrowedCities } = widenThinArea(places, askedArea);
  const askedLabel = areaLabel(askedArea) ?? titleCase([...askedArea.cities][0] ?? "that area");
  if (hasLocation(location) && placesForArea(places, location).length < 2) {
    return { ok: false, status: 422, code: "NO_PLACES_IN_AREA", message: `GalaTayo doesn't have enough places in ${askedLabel} yet, so Tara can't plan there without guessing. Try another area for now.` };
  }

  const groupSize = parseGroupSize(prompt);
  const constraints = parsePlanConstraints(prompt, groupSize);
  const today = manilaToday();
  const planDate = requestedDate && requestedDate >= today.iso ? { date: requestedDate, source: "prompt" as const } : resolvePlanDate(prompt, today.iso);
  const isToday = planDate.date === today.iso;
  const earliestToday = isToday ? Math.ceil((today.minutes + 60) / 15) * 15 : 0;
  const departure = parseDeparture(prompt);
  // "Alis 7am" to a province: the day there starts after the drive from Manila.
  const destinationAnchor = places.find((place) => {
    const destination = hasLocation(location) && matchesLocation(place, location) ? resolveDestination(place.city, place.area) : null;
    return destination !== null && !isMetroManilaDestination(destination) && place.latitude != null;
  });
  const drive = departure !== null && destinationAnchor ? driveMinutesFromManila(destinationAnchor) : null;
  const arrival = departure !== null && drive !== null ? departure + drive : null;
  let askedStart = arrival ?? constraints.start ?? defaultStart(prompt) ?? 0;
  // A date night with no clock time starts before sunset, so the golden-hour stop and the view are in it.
  const sunsetDate = arrival === null && !STATED_CLOCK.test(prompt) && DATE_ASK.test(prompt) && askedStart >= 17 * 60;
  if (sunsetDate) {
    const sunset = getPlanSunset(planDate.date, placesForArea(places, location));
    askedStart = Math.min(askedStart, Math.floor((sunset - 75) / 15) * 15);
  }
  const notBefore = Math.max(earliestToday, askedStart);
  const planConstraints: PlanConstraints = { ...constraints, start: notBefore || null, pinned: pinned.length };
  // No time and no evening is a day out: from the morning, with lunch and at least three stops.
  // "Barkada day ... afternoon to dinner" starts in the afternoon, so it is not.
  const wholeDay =
    (wantsWholeDay(prompt) && (constraints.start === null || constraints.start < 12 * 60)) ||
    (arrival === null && constraints.start === null && constraints.end === null && defaultStart(prompt) === null && !wantsEvening(prompt));

  let candidates = selectCandidates(places, prompt, PLAN_CANDIDATES, location, planConstraints);
  // Chosen places lead the list (refs p1..pN), whatever their price or hours.
  candidates = [...pinned, ...candidates.filter((place) => !pinned.includes(place))];
  if (constraints.meal && !candidates.some((place) => fitsKind(place, constraints.meal!))) {
    // A required meal needs Food options even when the vibe words ranked them out.
    const food = selectCandidates(places, `${prompt} ${constraints.meal} food`, 6, location, planConstraints).filter((place) => fitsKind(place, constraints.meal!));
    candidates = [...candidates, ...food.filter((place) => !candidates.includes(place))];
  }
  // The area that was asked for leads; borrowed neighbours fill in after it. Chosen places stay first.
  const rest = candidates.filter((place) => !pinned.includes(place));
  candidates = [...pinned, ...rest.filter((place) => matchesLocation(place, askedArea)), ...rest.filter((place) => !matchesLocation(place, askedArea))];
  if (candidates.length < 2) {
    return { ok: false, status: 422, code: "NO_FIT", message: "Tara couldn't find enough places that fit that budget and time. Try a bigger budget or a different time." };
  }

  const sunsetMinutes = getPlanSunset(planDate.date, candidates);
  const planContext = { date: planDate.date, weekday: weekdayOf(planDate.date), sunsetMinutes };
  let draft: DraftResponse | null = await model(prompt, candidates, planContext, planConstraints, requestId, log);
  const source = draft ? "ai" : "fallback";
  if (!draft) draft = buildFallbackDraft(prompt, candidates);
  if (!draft) {
    return { ok: false, status: 503, code: "AI_BUSY", message: "Plan with AI couldn't find enough places for that. Try another area or vibe." };
  }

  // The model's draft is a suggestion; these rules make it honour the request.
  // Every place that fits the area, budget and time can fill a requested stop, not just the top-ranked ones.
  const pool = [...candidates, ...selectCandidates(places, prompt, Number.MAX_SAFE_INTEGER, location, planConstraints).filter((place) => !candidates.includes(place))];
  const candidatesById = new Map(pool.map((place) => [place.id, place]));
  const nearby = keepStopsNearby(draft.stops, candidatesById, location);
  const inHours = dropOffHoursFood(nearby, candidatesById, notBefore >= 15 * 60);
  // A whole day out needs lunch even when the request doesn't say so.
  const kinds = requestedKinds(prompt, constraints.meal ?? (wholeDay ? "lunch" : null));
  if (wholeDay && !kinds.includes("lunch")) kinds.push("lunch");
  // "Lunch hanggang gabi" runs through dinner time: it needs dinner as well as lunch.
  if (constraints.end !== null && constraints.end >= 19 * 60 && kinds.includes("lunch") && !kinds.includes("dinner")) kinds.push("dinner");
  const requested = ensureRequested(inHours, pool, kinds, { budgetPerHead: constraints.budgetPerHead, location });
  const centre = planCentre(requested.stops.map((stop) => candidatesById.get(stop.place_id)));
  if (requested.missing.length > 0 && centre) {
    // Nothing in the area does an asked-for job: take the closest place that does, and say so.
    // In a province a meal may be a drive away; in Metro Manila only just outside the area (never Makati for Binondo).
    const reach = destinationAnchor ? 15 : METRO_OUTSIDE_KM;
    const nearbyOutside = selectCandidates(places, prompt, Number.MAX_SAFE_INTEGER, "", planConstraints)
      // A meal may be a little farther (a dinner a short ride away beats no dinner); a cafe stays close.
      .filter((place) => !candidatesById.has(place.id) && distanceKm(centre, place) <= reach + (destinationAnchor && place.category === "Food" ? 2 : 0))
      .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b));
    const pickedCost = [...requested.picks.values()].reduce((sum, id) => sum + (candidatesById.get(id)?.budget_min ?? 0), 0);
    const outsideFill = ensureRequested(requested.stops, [...requested.stops.map((stop) => candidatesById.get(stop.place_id)!), ...nearbyOutside], requested.missing, {
      budgetPerHead: constraints.budgetPerHead === null ? null : constraints.budgetPerHead - pickedCost,
      taken: new Set(requested.picks.values()),
    });
    for (const place of nearbyOutside) {
      if (![...outsideFill.picks.values()].includes(place.id)) continue;
      pool.push(place);
      candidatesById.set(place.id, place);
    }
    for (const [kind, id] of outsideFill.picks) if (!requested.picks.has(kind)) requested.picks.set(kind, id);
    requested.stops = outsideFill.stops;
    requested.missing = outsideFill.missing;
  }
  const asked = new Set(requested.picks.values());
  // "Cafe tapos dinner" has one meal: an extra eatery the model added isn't what was asked.
  const extraMealsAllowed = kinds.length === 0 || kinds.includes("lunch") || kinds.includes("breakfast");
  const withoutExtraMeals = extraMealsAllowed
    ? requested.stops
    : requested.stops.filter((stop) => asked.has(stop.place_id) || candidatesById.get(stop.place_id)?.category !== "Food");
  // One coffee stop is a break; two in a row is the same stop twice.
  const firstCafe = withoutExtraMeals.find((stop) => candidatesById.get(stop.place_id)?.category === "Cafe");
  const onlyAsked = withoutExtraMeals.filter((stop) => stop === firstCafe || asked.has(stop.place_id) || candidatesById.get(stop.place_id)?.category !== "Cafe");
  const pinnedIds = new Set(pinned.map((place) => place.id));
  const keep = () => new Set([...requested.picks.values(), ...pinnedIds]);
  const anchored = ensureAreaStop(onlyAsked, pool, hasLocation(askedArea) ? askedArea : location, { start: notBefore, sunsetMinutes, keep: keep() });
  const local = preferInArea(anchored, pool, location, requested.picks, constraints.budgetPerHead);
  const tight = tightenRoute(local.stops, candidatesById, keep(), destinationAnchor ? 15 : 6);
  const affordable = fitBudget(tight, candidatesById, constraints.budgetPerHead, keep());
  const focused = dropParentAreas(FOOD_TRIP.test(prompt) ? capSightsForFoodTrip(affordable, candidatesById, keep()) : affordable, candidatesById, keep());
  // Every chosen place is a stop: one the model or a rule left out goes back in.
  const withPinned = [...focused, ...pinned.filter((place) => !focused.some((stop) => stop.place_id === place.id)).map((place) => ({ place_id: place.id, time: "", minutes: 60, note: describeStop(place) }))];
  // A day out has at least three stops; an evening or a short window at least two.
  const minStops = wholeDay || (constraints.end !== null && constraints.end - notBefore >= 5 * 60) ? 3 : 2;
  const full = topUpStops(withPinned, pool, { start: notBefore, sunsetMinutes, location, min: minStops });
  const picked = new Map([...requested.picks.entries()].map(([kind, id]) => [id, kind]));
  // A whole day is timed from the morning: the model's clock only matters for meals.
  const timed = wholeDay
    ? full.map((stop) => {
        const kind = picked.get(stop.place_id);
        const isFood = candidatesById.get(stop.place_id)?.category === "Food";
        const time = kind === "cafe" && isFood ? "09:00" : (MEAL_TIMES[kind ?? ""] ?? (isFood ? stop.time : ""));
        return { ...stop, time };
      })
    : full;
  // A date or sunset plan saves its best view for sunset: the stop that stays good after dark closes the day.
  const sunsetAsk = wantsSunset(prompt) || sunsetDate;
  const sunsetPlaceId = sunsetAsk ? pickSunsetStop(timed, candidatesById) : undefined;
  const ordered = orderByTimeOfDay(timed, candidatesById, requested.picks, sunsetPlaceId);

  const scheduleOptions = {
    sunsetMinutes,
    wantsSunset: sunsetAsk,
    sunsetPlaceId,
    notBefore: notBefore || undefined,
    notAfter: constraints.end ?? undefined,
    fixedStart: constraints.start !== null || arrival !== null || wholeDay,
    // "Hanggang gabi" (to ~9 PM): dinner about two hours before the end, not at 5:30.
    dinnerFrom: constraints.end !== null && constraints.end >= 20 * 60 ? constraints.end - 120 : undefined,
    meals: new Map(
      [...requested.picks.entries()]
        .filter((entry): entry is ["breakfast" | "lunch" | "dinner", string] => entry[0] === "breakfast" || entry[0] === "lunch" || entry[0] === "dinner")
        .map(([kind, id]) => [id, kind] as const)
    ),
  };
  let stopsInOrder = scheduleStops(ordered, candidatesById, scheduleOptions);
  // Idle gaps get a nearby stop; "hanggang gabi" runs to about 9 PM, a whole day into the late afternoon.
  const endTarget = constraints.end ?? (wholeDay ? (kinds.includes("dinner") ? 21 * 60 : 17 * 60) : null);
  const filled = fillGaps(stopsInOrder, pool, {
    end: endTarget,
    sunsetMinutes,
    budgetPerHead: constraints.budgetPerHead,
    location,
    // A thin area's stops sit farther apart, so gaps may be filled from a little farther away.
    maxKm: destinationAnchor ? 10 : borrowedCities.length > 0 ? 8 : 3,
  });
  if (filled.length > stopsInOrder.length) stopsInOrder = scheduleStops(filled, candidatesById, scheduleOptions);

  /** Times a changed plan from scratch: only meals keep their clock, so a dropped first stop doesn't push the day later. */
  const retime = (stops: DraftStop[]) => {
    scheduleOptions.sunsetPlaceId = sunsetAsk ? pickSunsetStop(stops, candidatesById) : undefined;
    const cleared = stops.map((stop) => (scheduleOptions.meals.has(stop.place_id) || candidatesById.get(stop.place_id)?.category === "Food" ? stop : { ...stop, time: "" }));
    return scheduleStops(orderByTimeOfDay(cleared, candidatesById, requested.picks, scheduleOptions.sunsetPlaceId), candidatesById, scheduleOptions);
  };
  // The hard budget: the stops' prices plus the meals they don't price must fit the per-head budget.
  const mealCost = typicalMealCost(places);
  const mealsNeeded = kinds.filter((kind) => kind === "lunch" || kind === "dinner" || kind === "breakfast").length;
  // Same rule as the app's planCost, so the cap and the shown price always agree.
  const mealEstimateFor = (stops: DraftStop[]) =>
    mealEstimatePerHead(stops.map((stop) => candidatesById.get(stop.place_id)), mealsNeeded, mealCost);
  const perHead = (stops: DraftStop[]) => stops.reduce((sum, stop) => sum + (candidatesById.get(stop.place_id)?.budget_min ?? 0), 0) + mealEstimateFor(stops);
  const overBudget: NormalizedPlace[] = [];
  const budget = constraints.budgetPerHead;
  /** Drops the priciest stops the user didn't choose until the plan fits; a dropped meal still counts at a typical price. */
  const trimToBudget = (stops: DraftStop[]) => {
    let trimmed = stops;
    while (budget !== null && perHead(trimmed) > budget) {
      const droppable = trimmed.filter((stop) => !pinnedIds.has(stop.place_id) && (candidatesById.get(stop.place_id)?.budget_min ?? 0) > 0);
      if (droppable.length === 0) break;
      const priciest = droppable.reduce((max, stop) => ((candidatesById.get(stop.place_id)?.budget_min ?? 0) > (candidatesById.get(max.place_id)?.budget_min ?? 0) ? stop : max));
      overBudget.push(candidatesById.get(priciest.place_id)!);
      trimmed = trimmed.filter((stop) => stop !== priciest);
    }
    return trimmed;
  };
  // Gap fillers follow the same rules: no whole-area stop next to places inside it, a food trip stays about food,
  // no garden after dark, and the budget holds.
  const focused2 = dropParentAreas(FOOD_TRIP.test(prompt) ? capSightsForFoodTrip(stopsInOrder, candidatesById, keep()) : stopsInOrder, candidatesById, keep());
  const lit = focused2.filter((stop) => keep().has(stop.place_id) || !isDarkOutdoor(candidatesById.get(stop.place_id)!, parseClock(stop.time) ?? 0, sunsetMinutes));
  const affordableNow = trimToBudget(lit);
  if (affordableNow.length < stopsInOrder.length) stopsInOrder = affordableNow.length > 0 ? retime(affordableNow) : affordableNow;
  if (stopsInOrder.length < minStops) {
    // A stop was dropped (a garden after dark, over budget): top up with what is open and affordable, then time it again.
    const topped = trimToBudget(topUpStops(stopsInOrder, pool, { start: notBefore, sunsetMinutes, location, min: minStops }));
    if (topped.length > stopsInOrder.length) {
      const retimed = retime(topped);
      stopsInOrder = retimed.filter((stop) => keep().has(stop.place_id) || !isDarkOutdoor(candidatesById.get(stop.place_id)!, parseClock(stop.time) ?? 0, sunsetMinutes));
    }
  }
  const missingPinned = pinned.filter((place) => !stopsInOrder.some((stop) => stop.place_id === place.id));

  const area = areaLabel(askedArea);
  const budgetText = constraints.budgetPerHead !== null ? ` that fits ${formatPeso(constraints.budgetPerHead)} a head` : "";
  const kindOf = (place: NormalizedPlace) => [...requested.picks.entries()].find(([, id]) => id === place.id)?.[0];
  /** Why no place in the area does a job: none listed yet, all over budget, or all closed then. */
  const whyNone = (label: string, matches: (place: NormalizedPlace) => boolean) => {
    const where = area ? ` in ${area}` : "";
    const inArea = places.filter((place) => matches(place) && (!hasLocation(location) || matchesLocation(place, location)));
    if (inArea.length === 0) return `GalaTayo has no ${label}${where} yet`;
    // Binondo can be the lunch or the dinner, not both.
    const used = inArea.find((place) => stopsInOrder.some((stop) => stop.place_id === place.id));
    if (used && inArea.every((place) => stopsInOrder.some((stop) => stop.place_id === place.id))) return `${used.name} is already in the plan, and GalaTayo has no other ${label}${where} yet`;
    const budget = constraints.budgetPerHead;
    if (budget !== null && inArea.every((place) => (place.budget_min ?? 0) > budget)) return `No ${label}${where}${budgetText}`;
    if (constraints.indoor && inArea.every((place) => isIndoorPlace(place) !== true)) return `No indoor ${label}${where} yet`;
    return `No ${label}${where} is open at that time`;
  };
  const borrowedNames = borrowedCities.filter((city) => stopsInOrder.some((stop) => (candidatesById.get(stop.place_id)?.city ?? "").toLowerCase() === city)).map(titleCase);
  const notes = [
    borrowedNames.length > 0 ? `GalaTayo has only a few places in ${askedLabel} so far, so the plan adds spots in nearby ${borrowedNames.join(" and ")}.` : null,
    arrival !== null && drive !== null && departure !== null && destinationAnchor
      ? `Alis ${formatClock12(departure)} from Manila: about ${formatDuration(drive)} by car to ${destinationAnchor.city ?? destinationAnchor.name}.`
      : null,
    ...requested.missing.map((kind) => `${whyNone(KIND_LABEL[kind], (place) => fitsKind(place, kind))}, so the plan skips it.`),
    ...local.outside
      .filter((place) => stopsInOrder.some((stop) => stop.place_id === place.id))
      .map((place) => {
        const kind = kindOf(place);
        const label = kind ? KIND_LABEL[kind] : `${place.category.toLowerCase()} stop`;
        const reason = whyNone(label, (other) => other.category === place.category && (!kind || fitsKind(other, kind)));
        return `${reason}, so ${place.name} in ${[place.area, place.city].filter(Boolean).join(", ")} is the closest pick.`;
      }),
    ...overBudget.map((place) => `${place.name} (from ${formatPeso(place.budget_min ?? 0)}) doesn't fit ${formatPeso(budget ?? 0)} a head with the meals, so the plan leaves it out.`),
    budget !== null && perHead(stopsInOrder) > budget
      ? `Your chosen places and meals come to about ${formatPeso(perHead(stopsInOrder))} a head, over the ${formatPeso(budget)} budget.`
      : null,
    ...missingPinned.map((place) => `${place.name} isn't open at the time this plan reaches it, so it's left out. Start earlier to fit it in.`),
    ...tooFar.map((place) => `${place.name} is in ${place.city ?? place.area ?? "another area"}, too far to share a day with ${pinned[0]?.city ?? "the rest"}, so plan it on its own day.`),
  ].filter((note): note is string => Boolean(note));

  // Meals the stops can't price (a food street with free entry) or that no listed place covers still cost
  // money: the estimate per head counts them, so a lunch-to-dinner plan never reads as PHP 100 a head.
  const mealEstimate = mealEstimateFor(stopsInOrder);

  const uploadIds = stopsInOrder.filter((stop) => !hasCuratedPhoto(candidatesById.get(stop.place_id)?.slug)).map((stop) => stop.place_id);
  const images = uploadIds.length ? await loadImages(uploadIds).catch(() => new Map()) : new Map();
  const stops = stopsInOrder.map((stop) => {
    const place = candidatesById.get(stop.place_id)!;
    const storageKey = placePhotoKey(place.slug, images.get(place.id)?.[0]?.storage_key);
    return {
      ...stop,
      place: {
        id: place.id,
        name: place.name,
        slug: place.slug,
        category: place.category,
        city: place.city,
        area: place.area,
        address: place.address,
        budget_min: place.budget_min,
        meal_stop: isMealStop(place),
        latitude: place.latitude,
        longitude: place.longitude,
        image_url: storageKey ? buildImageUrl(storageKey) : null,
      },
    };
  });

  return {
    ok: true,
    source,
    body: {
      ...draft,
      summary: cleanSummary(draft.summary, stopsInOrder, candidatesById, sunsetMinutes),
      notes,
      group_size: groupSize ?? draft.group_size,
      budget_per_head: constraints.budgetPerHead,
      meal_estimate_per_head: mealEstimate,
      // The app prices every screen of the plan from these two (frontend utils/planCost.ts).
      meals_needed: mealsNeeded,
      meal_cost: mealCost,
      date: planDate.date,
      date_source: planDate.source,
      sunset: `${String(Math.floor(sunsetMinutes / 60)).padStart(2, "0")}:${String(sunsetMinutes % 60).padStart(2, "0")}`,
      source,
      stops,
    },
  };
}

export async function postGalaPlanAiDraft(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const requestId = randomUUID();
  let actor: AskAiActor | null = null;
  let consumedUsage = false;

  try {
    try {
      actor = await resolveAskAiActor(request);
    } catch {
      return { status: 401, headers: JSON_HEADERS, jsonBody: { message: "Sign in or refresh the page to use Plan with AI." } };
    }

    if (!(await isAskAiIpAllowed(request, actor))) {
      return { status: 429, headers: JSON_HEADERS, jsonBody: { code: "RATE_LIMITED", message: "Too many Plan with AI requests. Try again in a few minutes." } };
    }

    const { prompt, date: requestedDate, places: placeSlugs } = await getBody(request);
    if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
      return { status: 400, headers: JSON_HEADERS, jsonBody: { message: `Describe your gala in 3 to ${MAX_PROMPT_LENGTH} characters.` } };
    }

    if (!(await shouldAcceptAskAiPrompt({ message: prompt, requestId, context })).accepted) {
      return { status: 422, headers: JSON_HEADERS, jsonBody: { code: "OFF_TOPIC", message: ASK_AI_SCOPE_REJECTION_MESSAGE } };
    }

    const places = await getActiveNormalizedPlaces();
    const usage = await consumeAskAiUsageForActor(actor, "chatbot_ai");
    if (!usage.allowed) {
      return { status: 429, headers: JSON_HEADERS, jsonBody: { code: "DAILY_LIMIT", message: buildDailyLimitMessage(actor, usage.dailyLimit), usage } };
    }
    consumedUsage = true;

    const outcome = await buildPlanDraft({
      prompt,
      places,
      placeSlugs,
      requestedDate,
      requestId,
      log: (message) => context.warn(`[GalaPlan AI] requestId=${requestId} ${message}`),
    });

    // Only a plan the model actually wrote uses up a daily AI request.
    if ("status" in outcome || outcome.source === "fallback") {
      await refundAskAiUsageForActor({ actor, usageType: "chatbot_ai" }).catch(() => undefined);
      consumedUsage = false;
    }
    if ("status" in outcome) {
      return { status: outcome.status, headers: JSON_HEADERS, jsonBody: { code: outcome.code, message: outcome.message } };
    }

    return {
      status: 200,
      headers: JSON_HEADERS,
      jsonBody: {
        draft: outcome.body,
        usage: consumedUsage ? { ...usage } : { ...usage, requestCount: usage.requestCount - 1, remaining: usage.remaining + 1 },
      },
    };
  } catch (error) {
    context.error(`[GalaPlan AI] requestId=${requestId} failed:`, error);
    if (consumedUsage && actor) {
      await refundAskAiUsageForActor({ actor, usageType: "chatbot_ai" }).catch(() => undefined);
    }
    return { status: 503, headers: JSON_HEADERS, jsonBody: { code: "AI_BUSY", message: "Plan with AI couldn't build a plan right now. Try again in a moment." } };
  }
}

app.http("galaPlanAiDraft", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "gala-plans/ai-draft",
  handler: postGalaPlanAiDraft,
});
