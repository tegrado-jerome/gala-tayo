import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces, type NormalizedPlace } from "../domain/places";
import { consumeAskAiUsageForActor, refundAskAiUsageForActor } from "../services/askAiUsageService";
import { generateJsonFromGroq } from "../services/groqChatProvider";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import {
  areaLabel,
  buildFallbackDraft,
  buildSystemPrompt,
  buildUserMessage,
  cleanSummary,
  defaultStart,
  detectLocationIntent,
  driveMinutesFromManila,
  dropOffHoursFood,
  ensureAreaStop,
  ensureRequested,
  fillGaps,
  findUncoveredArea,
  fitsKind,
  fitBudget,
  formatClock12,
  formatDuration,
  getPlanSunset,
  hasLocation,
  keepStopsNearby,
  KIND_LABEL,
  manilaToday,
  matchesLocation,
  orderByTimeOfDay,
  parseDeparture,
  parseDraft,
  parseGroupSize,
  parsePlanConstraints,
  PLAN_CANDIDATES,
  placesForArea,
  preferInArea,
  requestedKinds,
  resolvePlanDate,
  scheduleStops,
  selectCandidates,
  tightenRoute,
  topUpStops,
  wantsSunset,
  wantsWholeDay,
  weekdayOf,
  type DraftResponse,
  type PlanConstraints,
} from "../services/galaPlanDraftPlanner";
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
const formatPeso = (value: number) => `₱${value.toLocaleString("en-PH")}`;
import { resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
import { hasCuratedPhoto, placePhotoKey } from "../utils/hdPhotos";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { buildDailyLimitMessage, shouldAcceptAskAiPrompt } from "./askAi";
import { ASK_AI_SCOPE_REJECTION_MESSAGE } from "./askAiStrictPgGuard";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_PROMPT_LENGTH = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function getBody(request: HttpRequest) {
  try {
    const body = (await request.json()) as { prompt?: unknown; date?: unknown };
    return {
      prompt: typeof body?.prompt === "string" ? body.prompt.trim() : "",
      date: typeof body?.date === "string" && ISO_DATE.test(body.date) ? body.date : null,
    };
  } catch {
    return { prompt: "", date: null };
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
  requestedDate,
  requestId,
  log = () => undefined,
}: {
  prompt: string;
  places: NormalizedPlace[];
  requestedDate: string | null;
  requestId: string;
  log?: (message: string) => void;
}): Promise<PlanDraftOutcome> {
  const location = detectLocationIntent(places, prompt);
  const uncovered = findUncoveredArea(places, prompt) ?? (hasLocation(location) && placesForArea(places, location).length < 2 ? titleCase([...location.cities][0] ?? "that area") : null);
  if (uncovered) {
    return { ok: false, status: 422, code: "NO_PLACES_IN_AREA", message: `GalaTayo doesn't have enough places in ${uncovered} yet, so Tara can't plan there without guessing. Try another area for now.` };
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
  const askedStart = arrival ?? constraints.start ?? defaultStart(prompt) ?? 0;
  const notBefore = Math.max(earliestToday, askedStart);
  const planConstraints: PlanConstraints = { ...constraints, start: notBefore || null };

  let candidates = selectCandidates(places, prompt, PLAN_CANDIDATES, prompt, planConstraints);
  if (constraints.meal && !candidates.some((place) => place.category === "Food")) {
    // A required meal needs Food options even when the vibe words ranked them out.
    const food = selectCandidates(places, `${prompt} ${constraints.meal} food`, 6, prompt, planConstraints).filter((place) => place.category === "Food");
    candidates = [...candidates, ...food.filter((place) => !candidates.includes(place))];
  }
  if (candidates.length < 2) {
    return { ok: false, status: 422, code: "NO_FIT", message: "Tara couldn't find enough places that fit that budget and time. Try a bigger budget or a different time." };
  }

  const sunsetMinutes = getPlanSunset(planDate.date, candidates);
  const planContext = { date: planDate.date, weekday: weekdayOf(planDate.date), sunsetMinutes };
  let draft: DraftResponse | null = await draftWithModel(prompt, candidates, planContext, planConstraints, requestId, log);
  const source = draft ? "ai" : "fallback";
  if (!draft) draft = buildFallbackDraft(prompt, candidates);
  if (!draft) {
    return { ok: false, status: 503, code: "AI_BUSY", message: "Plan with AI couldn't find enough places for that. Try another area or vibe." };
  }

  // The model's draft is a suggestion; these rules make it honour the request.
  // Every place that fits the area, budget and time can fill a requested stop, not just the top-ranked ones.
  const pool = [...candidates, ...selectCandidates(places, prompt, Number.MAX_SAFE_INTEGER, prompt, planConstraints).filter((place) => !candidates.includes(place))];
  const candidatesById = new Map(pool.map((place) => [place.id, place]));
  const nearby = keepStopsNearby(draft.stops, candidatesById, location);
  const inHours = dropOffHoursFood(nearby, candidatesById, notBefore >= 15 * 60);
  // A whole day out needs lunch even when the request doesn't say so.
  const wholeDay = wantsWholeDay(prompt);
  const kinds = requestedKinds(prompt, constraints.meal ?? (wholeDay ? "lunch" : null));
  if (wholeDay && !kinds.includes("lunch")) kinds.push("lunch");
  const requested = ensureRequested(inHours, pool, kinds, { budgetPerHead: constraints.budgetPerHead, location });
  const centre = planCentre(requested.stops.map((stop) => candidatesById.get(stop.place_id)));
  if (requested.missing.length > 0 && centre) {
    // Nothing in the area does an asked-for job: take the closest place that does, and say so.
    const reach = destinationAnchor ? 15 : 5;
    const nearbyOutside = selectCandidates(places, prompt, Number.MAX_SAFE_INTEGER, "", planConstraints)
      // A meal may be a little farther (a dinner a short ride away beats no dinner); a cafe stays close.
      .filter((place) => !candidatesById.has(place.id) && distanceKm(centre, place) <= reach + (place.category === "Food" ? 2 : 0))
      .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b));
    const pickedCost = [...requested.picks.values()].reduce((sum, id) => sum + (candidatesById.get(id)?.budget_min ?? 0), 0);
    const outsideFill = ensureRequested(requested.stops, [...requested.stops.map((stop) => candidatesById.get(stop.place_id)!), ...nearbyOutside], requested.missing, {
      budgetPerHead: constraints.budgetPerHead === null ? null : constraints.budgetPerHead - pickedCost,
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
  const anchored = ensureAreaStop(onlyAsked, pool, location, { start: notBefore, sunsetMinutes, keep: asked });
  const local = preferInArea(anchored, pool, location, requested.picks, constraints.budgetPerHead);
  const tight = tightenRoute(local.stops, candidatesById, new Set(requested.picks.values()), destinationAnchor ? 15 : 6);
  const affordable = fitBudget(tight, candidatesById, constraints.budgetPerHead, new Set(requested.picks.values()));
  const full = topUpStops(affordable, pool, { start: notBefore, sunsetMinutes, location });
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
  const ordered = orderByTimeOfDay(timed, candidatesById, requested.picks);

  const scheduleOptions = {
    sunsetMinutes,
    wantsSunset: wantsSunset(prompt),
    notBefore: notBefore || undefined,
    notAfter: constraints.end ?? undefined,
    fixedStart: constraints.start !== null || arrival !== null || wholeDay,
    // "Hanggang gabi" (to ~9 PM): dinner about two hours before the end, not at 5:30.
    dinnerFrom: constraints.end !== null && constraints.end >= 20 * 60 ? constraints.end - 120 : undefined,
  };
  let stopsInOrder = scheduleStops(ordered, candidatesById, scheduleOptions);
  // Idle gaps get a nearby stop; "hanggang gabi" runs to about 9 PM, a whole day into the late afternoon.
  const endTarget = constraints.end ?? (wholeDay ? (kinds.includes("dinner") ? 21 * 60 : 17 * 60) : null);
  const filled = fillGaps(stopsInOrder, pool, {
    end: endTarget,
    sunsetMinutes,
    budgetPerHead: constraints.budgetPerHead,
    location,
    maxKm: destinationAnchor ? 10 : 3,
  });
  if (filled.length > stopsInOrder.length) stopsInOrder = scheduleStops(filled, candidatesById, scheduleOptions);

  const area = areaLabel(location);
  const budgetText = constraints.budgetPerHead !== null ? ` that fits ${formatPeso(constraints.budgetPerHead)} a head` : "";
  const kindOf = (place: NormalizedPlace) => [...requested.picks.entries()].find(([, id]) => id === place.id)?.[0];
  /** Why no place in the area does a job: none listed yet, all over budget, or all closed then. */
  const whyNone = (label: string, matches: (place: NormalizedPlace) => boolean) => {
    const where = area ? ` in ${area}` : "";
    const inArea = places.filter((place) => matches(place) && (!hasLocation(location) || matchesLocation(place, location)));
    if (inArea.length === 0) return `GalaTayo has no ${label}${where} yet`;
    const budget = constraints.budgetPerHead;
    if (budget !== null && inArea.every((place) => (place.budget_min ?? 0) > budget)) return `No ${label}${where}${budgetText}`;
    return `No ${label}${where} is open at that time`;
  };
  const notes = [
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
  ].filter((note): note is string => Boolean(note));

  const uploadIds = stopsInOrder.filter((stop) => !hasCuratedPhoto(candidatesById.get(stop.place_id)?.slug)).map((stop) => stop.place_id);
  const images = uploadIds.length ? await getApprovedPlaceImagesByPlaceIds(uploadIds).catch(() => new Map()) : new Map();
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

    const { prompt, date: requestedDate } = await getBody(request);
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
