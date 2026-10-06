import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces, type NormalizedPlace } from "../domain/places";
import { consumeAskAiUsageForActor, refundAskAiUsageForActor } from "../services/askAiUsageService";
import { generateJsonFromGroq } from "../services/groqChatProvider";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import {
  buildFallbackDraft,
  buildSystemPrompt,
  buildUserMessage,
  detectLocationIntent,
  ensureMeal,
  findUncoveredArea,
  fitBudget,
  getPlanSunset,
  hasLocation,
  keepStopsNearby,
  manilaToday,
  parseDraft,
  parseGroupSize,
  parsePlanConstraints,
  PLAN_CANDIDATES,
  placesForArea,
  resolvePlanDate,
  scheduleStops,
  selectCandidates,
  wantsEvening,
  wantsSunset,
  weekdayOf,
  type DraftResponse,
  type PlanConstraints,
} from "../services/galaPlanDraftPlanner";
import { resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
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
  const askedStart = constraints.start ?? (wantsEvening(prompt) ? 17 * 60 : 0);
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

  const candidatesById = new Map(candidates.map((place) => [place.id, place]));
  const nearby = keepStopsNearby(draft.stops, candidatesById, location);
  const withMeal = ensureMeal(nearby, candidates, constraints.meal, constraints.budgetPerHead);
  const affordable = fitBudget(withMeal, candidatesById, constraints.budgetPerHead);
  const stopsInOrder = scheduleStops(affordable, candidatesById, {
    sunsetMinutes,
    wantsSunset: wantsSunset(prompt),
    notBefore: notBefore || undefined,
    notAfter: constraints.end ?? undefined,
    fixedStart: constraints.start !== null,
  });

  const images = await getApprovedPlaceImagesByPlaceIds(stopsInOrder.map((stop) => stop.place_id)).catch(() => new Map());
  const stops = stopsInOrder.map((stop) => {
    const place = candidatesById.get(stop.place_id)!;
    const storageKey = images.get(place.id)?.[0]?.storage_key;
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
