import { GoogleGenAI } from "@google/genai";
import {
  ASK_AI_GUIDE_FALLBACK_MODEL,
  ASK_AI_GUIDE_GENERATION_CONFIG,
  ASK_AI_GUIDE_MODEL,
  ASK_AI_LIVE_SEARCH_FALLBACK_MODEL,
  ASK_AI_LIVE_SEARCH_GENERATION_CONFIG,
  ASK_AI_LIVE_SEARCH_MODEL,
} from "../config/askAiConfig";
import { getSecret } from "../config/keyVault";

export class AskAiServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AskAiServiceError";
    this.status = status;
  }
}

export type AskAiSource = {
  title: string;
  url: string;
};

export type AskAiIntent =
  | "place_recommendation"
  | "place_lookup"
  | "trip_planning"
  | "general_advice";
export type AskAiAnswerFormat = "plain_text";

export type AskAiResponsePlan = {
  intent: AskAiIntent;
  requiresPlaceAnswer: boolean;
  answerFormat: AskAiAnswerFormat;
  groundingEnabled: boolean;
};

export type AskAiAnswerResult = {
  answer: string;
  usedLiveSearch: boolean;
  sources: AskAiSource[];
  sourceStatus: "no_grounding_metadata";
  webSearchQueriesCount: number;
  groundingChunksCount: number;
  groundingSupportsCount: number;
  modelUsed: string;
  latencyMs: number;
  fallbackUsed: boolean;
  answerRejectedDueToLeakageOrTruncation: boolean;
};

type GenerateAskAiAnswerParams = {
  question: string;
  placeSlug?: string;
  enableLiveSearch: boolean;
};

const CURRENT_INFO_PATTERN =
  /\b(open|hours|schedule|fee|price|entrance|ticket|menu|address|located|location|where is|how to get|commute|contact|website|reservation|booking|available|today|current|latest|updated)\b/i;
const PLACE_SEEKING_PATTERN =
  /\b(place|places|lugar|spot|spots|where to go|where can|where should|saan|san\b|saan pwede|saan maganda|recommend|recommendation|suggest|hanap|hahanap|punta|puntahan|gala|hangout|tambay|tambayan|date|food trip|kainan|cafe|coffee|restaurant|museum|park|church|mall|hotel|resort|beach|pool|tourist spot|destination|pasyalan)\b/i;
const PLACE_LOOKUP_PATTERN =
  /\b(where is|address|located|location|how to get|commute|directions|open|hours|schedule|fee|price|entrance|ticket|menu|contact|website|reservation|booking)\b/i;
const TRIP_PLANNING_PATTERN =
  /\b(itinerary|plan|route|day trip|half day|whole day|schedule|after|before|nearby|near me|around|within|under|budget|kasama|family|barkada|partner|parents|kids|solo)\b/i;
const NON_PLACE_ADVICE_PATTERN =
  /\b(write|caption|translate|explain|define|summarize|debug|code|essay|email|message|joke|recipe)\b/i;
const ASK_AI_TAGLISH_INSTRUCTION =
  "You are GalaTayo AI. Always answer in natural Taglish. Understand Tagalog, Taglish, broken Tagalog, broken Taglish, broken English, typos, and incomplete casual prompts. Focus on the user's real search intent from the whole message, not isolated keywords. Do not follow a fixed answer template, fixed length, or forced format; use your full capability to answer naturally and completely.";
const RETRYABLE_AI_STATUSES = new Set([403, 429, 500, 503, 504]);
const RETRYABLE_PROVIDER_MESSAGE_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /quota/i,
  /resource exhausted/i,
  /exhausted/i,
  /consumed/i,
  /exceeded/i,
  /limit reached/i,
  /temporar(?:y|ily) unavailable/i,
  /unavailable/i,
  /overloaded/i,
  /try again later/i,
] as const;
const ASK_AI_FALLBACK_DELAY_MS = 450;

function sanitizeAnswer(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function getErrorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 502;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function isRetryableProviderError(error: unknown) {
  const status = getErrorStatus(error);

  if (RETRYABLE_AI_STATUSES.has(status)) {
    return true;
  }

  const message = getErrorMessage(error);

  if (!message) {
    return false;
  }

  return RETRYABLE_PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getGemmaApiKey(): Promise<string> {
  try {
    const envApiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GOOGLE_GENAI_API_KEY?.trim();
    const apiKey = envApiKey || (await getSecret("gemini-api-key"));

    if (!apiKey) {
      throw new AskAiServiceError("Gemma API key is missing.", 500);
    }

    return apiKey;
  } catch (error) {
    if (error instanceof AskAiServiceError) {
      throw error;
    }

    throw new AskAiServiceError(
      error instanceof Error ? error.message : "Failed to retrieve Gemma API key.",
      500
    );
  }
}

async function generateContentText({
  ai,
  model,
  prompt,
  enableLiveSearch,
}: {
  ai: GoogleGenAI;
  model: string;
  prompt: string;
  enableLiveSearch: boolean;
}): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...(enableLiveSearch
        ? ASK_AI_LIVE_SEARCH_GENERATION_CONFIG
        : ASK_AI_GUIDE_GENERATION_CONFIG),
      systemInstruction: ASK_AI_TAGLISH_INSTRUCTION,
      ...(enableLiveSearch
        ? {
            tools: [{ googleSearch: {} }],
          }
        : {}),
    },
  });

  return sanitizeAnswer(response.text ?? "");
}

function getIntentReason(intent: AskAiIntent): string {
  switch (intent) {
    case "place_recommendation":
      return "The user is asking for places, hangout options, venues, destinations, or searchable recommendations.";
    case "place_lookup":
      return "The user is asking about a specific place or practical place detail.";
    case "trip_planning":
      return "The user is planning a route, day, budget, group outing, or sequence that should include places.";
    default:
      return "The user is asking for general help that does not require place candidates.";
  }
}

export function planAskAiRequest(question: string): AskAiResponsePlan {
  const isPlaceSeeking = PLACE_SEEKING_PATTERN.test(question);
  const isPlaceLookup = PLACE_LOOKUP_PATTERN.test(question);
  const isTripPlanning = TRIP_PLANNING_PATTERN.test(question);
  const looksNonPlace = NON_PLACE_ADVICE_PATTERN.test(question) && !isPlaceSeeking;
  const intent: AskAiIntent = looksNonPlace
    ? "general_advice"
    : isPlaceLookup && isPlaceSeeking
      ? "place_lookup"
      : isPlaceSeeking
        ? "place_recommendation"
        : isTripPlanning
          ? "trip_planning"
          : "general_advice";

  return {
    intent,
    requiresPlaceAnswer: intent !== "general_advice",
    answerFormat: "plain_text",
    groundingEnabled: intent !== "general_advice" || CURRENT_INFO_PATTERN.test(question),
  };
}

export function shouldUseGroundedResearch(question: string): boolean {
  const plan = planAskAiRequest(question);

  return (
    plan.requiresPlaceAnswer ||
    CURRENT_INFO_PATTERN.test(question) ||
    PLACE_SEEKING_PATTERN.test(question)
  );
}

function buildAskAiPrompt(question: string, plan: AskAiResponsePlan): string {
  return `
Ask AI intent plan:
- Inferred intent: ${plan.intent}
- Intent reason: ${getIntentReason(plan.intent)}
- Place/search related: ${plan.requiresPlaceAnswer ? "yes" : "no"}

Interpretation guidance:
- Understand Tagalog, Taglish, broken Tagalog, broken Taglish, broken English, typos, shorthand, and incomplete casual prompts.
- Focus on the actual search intent and user need behind the message.
- Output must be natural Taglish.
- Answer naturally with as much useful detail as the request deserves.
- Do not use a forced template, fixed structure, fixed length, or app-imposed answer format.
- Use your full capability and decide the best way to answer the user's request.
- For place/search-related prompts, include useful places, areas, categories, or search directions that match the user's intent.

User request:
${question}
`.trim();
}

export async function generateAskAiAnswer({
  question,
  enableLiveSearch,
}: GenerateAskAiAnswerParams): Promise<AskAiAnswerResult> {
  const startedAt = Date.now();
  const apiKey = await getGemmaApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const plan = planAskAiRequest(question);
  const prompt = buildAskAiPrompt(question, plan);
  const modelAttempts = enableLiveSearch
    ? [
        { model: ASK_AI_LIVE_SEARCH_MODEL, liveSearch: true },
        { model: ASK_AI_LIVE_SEARCH_FALLBACK_MODEL, liveSearch: true },
        { model: ASK_AI_GUIDE_MODEL, liveSearch: false },
        { model: ASK_AI_GUIDE_FALLBACK_MODEL, liveSearch: false },
      ]
    : [
        { model: ASK_AI_GUIDE_MODEL, liveSearch: false },
        { model: ASK_AI_GUIDE_FALLBACK_MODEL, liveSearch: false },
      ];
  let lastError: unknown = null;

  for (const attempt of modelAttempts) {
    try {
      const answer = await generateContentText({
        ai,
        model: attempt.model,
        prompt,
        enableLiveSearch: attempt.liveSearch,
      });

      if (!answer) {
        throw new AskAiServiceError("Gemma returned an empty response.", 502);
      }

      return {
        answer,
        usedLiveSearch: attempt.liveSearch,
        sources: [],
        sourceStatus: "no_grounding_metadata",
        webSearchQueriesCount: 0,
        groundingChunksCount: 0,
        groundingSupportsCount: 0,
        modelUsed: attempt.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed:
          attempt.model !== modelAttempts[0].model ||
          attempt.liveSearch !== enableLiveSearch,
        answerRejectedDueToLeakageOrTruncation: false,
      };
    } catch (error) {
      lastError = error;

      if (!isRetryableProviderError(error)) {
        throw new AskAiServiceError(
          error instanceof Error ? error.message : "Gemma API request failed.",
          getErrorStatus(error)
        );
      }

      if (attempt !== modelAttempts[modelAttempts.length - 1]) {
        await sleep(ASK_AI_FALLBACK_DELAY_MS);
      }
    }
  }

  throw new AskAiServiceError(
    lastError instanceof Error ? lastError.message : "Gemma API request failed.",
    getErrorStatus(lastError)
  );
}
