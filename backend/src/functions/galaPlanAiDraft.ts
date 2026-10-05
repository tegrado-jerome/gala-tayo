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
  findUncoveredArea,
  getPlanSunset,
  manilaToday,
  parseDraft,
  parseGroupSize,
  PLAN_CANDIDATES,
  resolvePlanDate,
  scheduleStops,
  keepStopsNearby,
  wantsEvening,
  detectLocationIntent,
  selectCandidates,
  wantsSunset,
  weekdayOf,
  type DraftResponse,
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

type ModelOutcome = { draft: DraftResponse } | { failed: string };

async function draftWithModel(prompt: string, candidates: NormalizedPlace[], plan: { date: string; weekday: string; sunsetMinutes: number }, requestId: string): Promise<ModelOutcome> {
  try {
    const raw = await generateJsonFromGroq({
      systemPrompt: buildSystemPrompt(plan),
      userMessage: buildUserMessage(prompt, candidates),
      requestId,
    });
    const parsed = parseDraft(raw, candidates);
    if (!parsed) return { failed: "unusable plan JSON" };
    return { draft: parsed };
  } catch (error) {
    return { failed: error instanceof Error ? error.message : String(error) };
  }
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
    const uncoveredArea = findUncoveredArea(places, prompt);
    if (uncoveredArea) {
      return { status: 422, headers: JSON_HEADERS, jsonBody: { code: "NO_PLACES_IN_AREA", message: `GalaTayo doesn't have enough places in ${uncoveredArea} yet, so Tara can't plan there without guessing. Try another area for now.` } };
    }

    const usage = await consumeAskAiUsageForActor(actor, "chatbot_ai");
    if (!usage.allowed) {
      return { status: 429, headers: JSON_HEADERS, jsonBody: { code: "DAILY_LIMIT", message: buildDailyLimitMessage(actor, usage.dailyLimit), usage } };
    }
    consumedUsage = true;

    const today = manilaToday();
    const planDate = requestedDate && requestedDate >= today.iso ? { date: requestedDate, source: "prompt" as const } : resolvePlanDate(prompt, today.iso);
    const candidates = selectCandidates(places, prompt, PLAN_CANDIDATES);
    const sunsetMinutes = getPlanSunset(planDate.date, candidates);

    const outcome = await draftWithModel(prompt, candidates, { date: planDate.date, weekday: weekdayOf(planDate.date), sunsetMinutes }, requestId);

    let draft: DraftResponse | null = "draft" in outcome ? outcome.draft : null;
    const source = draft ? "ai" : "fallback";
    if (!draft) {
      context.warn(`[GalaPlan AI] requestId=${requestId} model failed (${"failed" in outcome ? outcome.failed : "unknown"}); using fallback planner`);
      draft = buildFallbackDraft(prompt, candidates);
      // The fallback costs nothing, so it doesn't use up a daily AI request.
      await refundAskAiUsageForActor({ actor, usageType: "chatbot_ai" }).catch(() => undefined);
      consumedUsage = false;
    }
    if (!draft) {
      return { status: 503, headers: JSON_HEADERS, jsonBody: { code: "AI_BUSY", message: "Plan with AI couldn't find enough places for that. Try another area or vibe." } };
    }

    const candidatesById = new Map(candidates.map((place) => [place.id, place]));
    const isToday = planDate.date === today.iso;
    const earliestToday = isToday ? Math.ceil((today.minutes + 60) / 15) * 15 : 0;
    const earliestForVibe = wantsEvening(prompt) ? 16 * 60 : 0;
    const nearbyStops = keepStopsNearby(draft.stops, candidatesById, detectLocationIntent(places, prompt));
    const stopsInOrder = scheduleStops(nearbyStops, candidatesById, {
      sunsetMinutes,
      wantsSunset: wantsSunset(prompt),
      notBefore: Math.max(earliestToday, earliestForVibe) || undefined,
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
      status: 200,
      headers: JSON_HEADERS,
      jsonBody: {
        draft: {
          ...draft,
          group_size: parseGroupSize(prompt) ?? draft.group_size,
          date: planDate.date,
          date_source: planDate.source,
          sunset: `${String(Math.floor(sunsetMinutes / 60)).padStart(2, "0")}:${String(sunsetMinutes % 60).padStart(2, "0")}`,
          source,
          stops,
        },
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
