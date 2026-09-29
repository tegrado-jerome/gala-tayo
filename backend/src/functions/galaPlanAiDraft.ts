import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getActiveNormalizedPlaces } from "../domain/places";
import { consumeAskAiUsageForActor, refundAskAiUsageForActor } from "../services/askAiUsageService";
import { generateJsonFromGroq } from "../services/groqChatProvider";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import { buildSystemPrompt, buildUserMessage, manilaToday, parseDraft, selectCandidates } from "../services/galaPlanDraftPlanner";
import { resolveAskAiActor, type AskAiActor } from "../utils/askAiActor";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { shouldAcceptAskAiPrompt } from "./askAi";
import { ASK_AI_SCOPE_REJECTION_MESSAGE, evaluateAskAiStrictPgGuard } from "./askAiStrictPgGuard";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_PROMPT_LENGTH = 400;
const RETRY_DELAY_MS = 1500;

// Groq's free tier occasionally rate-limits or returns malformed JSON; one short retry absorbs most of it.
async function withOneRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return task();
  }
}

async function getPrompt(request: HttpRequest) {
  try {
    const body = (await request.json()) as { prompt?: unknown };
    return typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return "";
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

    const prompt = await getPrompt(request);
    if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
      return { status: 400, headers: JSON_HEADERS, jsonBody: { message: `Describe your gala in 3 to ${MAX_PROMPT_LENGTH} characters.` } };
    }

    const isAccepted =
      evaluateAskAiStrictPgGuard(prompt).accepted &&
      (await withOneRetry(() => shouldAcceptAskAiPrompt({ message: prompt, requestId, context }))).accepted;
    if (!isAccepted) {
      return { status: 422, headers: JSON_HEADERS, jsonBody: { message: ASK_AI_SCOPE_REJECTION_MESSAGE } };
    }

    const usage = await consumeAskAiUsageForActor(actor, "chatbot_ai");
    if (!usage.allowed) {
      return { status: 429, headers: JSON_HEADERS, jsonBody: { code: "DAILY_LIMIT", message: "You've used today's AI requests. They reset at midnight.", usage } };
    }
    consumedUsage = true;

    const candidates = selectCandidates(await getActiveNormalizedPlaces(), prompt);
    const candidatesById = new Map(candidates.map((place) => [place.id, place]));
    const draft = await withOneRetry(async () => {
      const raw = await generateJsonFromGroq({
        systemPrompt: buildSystemPrompt(manilaToday()),
        userMessage: buildUserMessage(prompt, candidates),
        requestId,
      });
      const parsed = parseDraft(raw, new Set(candidatesById.keys()));
      if (!parsed) throw new Error("AI returned an unusable plan.");
      return parsed;
    });

    const images = await getApprovedPlaceImagesByPlaceIds(draft.stops.map((stop) => stop.place_id)).catch(() => new Map());
    const stops = draft.stops.map((stop) => {
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
      jsonBody: { draft: { ...draft, stops }, usage: { ...usage } },
    };
  } catch (error) {
    context.error(`[GalaPlan AI] requestId=${requestId} failed:`, error);
    if (consumedUsage && actor) {
      await refundAskAiUsageForActor({ actor, usageType: "chatbot_ai" }).catch(() => undefined);
    }
    return { status: 502, headers: JSON_HEADERS, jsonBody: { message: "Plan with AI couldn't build a plan right now. Try again in a moment." } };
  }
}

app.http("galaPlanAiDraft", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "gala-plans/ai-draft",
  handler: postGalaPlanAiDraft,
});
