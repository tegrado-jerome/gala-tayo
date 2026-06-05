import { GoogleGenAI } from "@google/genai";
import {
  ASK_AI_GUIDE_FALLBACK_MODEL,
  ASK_AI_GUIDE_MODEL,
  ASK_AI_LIVE_SEARCH_FALLBACK_MODEL,
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

export type AskAiAnswerResult = {
  answer: string;
  usedLiveSearch: boolean;
  sources: AskAiSource[];
};

type GenerateAskAiAnswerParams = {
  question: string;
  placeSlug?: string;
  enableLiveSearch: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getProviderErrorStatus(error: unknown): number {
  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }

  if (isRecord(error) && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  return 502;
}

function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ask AI provider request failed.";
}

function collectText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (!isRecord(value)) {
    return [];
  }

  const text = typeof value.text === "string" ? [value.text] : [];

  return [
    ...text,
    ...Object.entries(value).flatMap(([key, child]) =>
      key === "annotations" ? [] : collectText(child)
    ),
  ];
}

function collectSources(value: unknown): AskAiSource[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectSources);
  }

  if (!isRecord(value)) {
    return [];
  }

  const url =
    typeof value.url === "string"
      ? value.url
      : typeof value.uri === "string"
        ? value.uri
        : null;
  const title =
    typeof value.title === "string"
      ? value.title
      : typeof value.name === "string"
        ? value.name
        : null;

  const source = url ? [{ title: title || getUrlHost(url), url }] : [];

  return [
    ...source,
    ...Object.values(value).flatMap((child) => collectSources(child)),
  ];
}

function getUrlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function hasGroundingSignal(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasGroundingSignal);
  }

  if (!isRecord(value)) {
    return false;
  }

  if (
    value.type === "google_search_result" ||
    value.type === "url_citation" ||
    "groundingMetadata" in value ||
    "grounding_metadata" in value
  ) {
    return true;
  }

  return Object.values(value).some(hasGroundingSignal);
}

function dedupeSources(sources: AskAiSource[]): AskAiSource[] {
  const seen = new Set<string>();
  const deduped: AskAiSource[] = [];

  for (const source of sources) {
    if (!source.url || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    deduped.push(source);
  }

  return deduped.slice(0, 6);
}

function getStringField(value: unknown, fieldName: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const fieldValue = value[fieldName];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function getResponseText(response: unknown): string {
  const directText = getStringField(response, "text");
  if (directText) {
    return directText;
  }

  const outputText = getStringField(response, "output_text");
  if (outputText) {
    return outputText;
  }

  return collectText(response).join("\n");
}

function stripLeakedPromptSections(answer: string): string {
  const blockedLinePatterns = [
    /^\s*(role|target audience|google search needed|user question|context|query)\s*:/i,
    /^\s*(the user asked|i should)\b/i,
  ];
  const finalAnswerPatterns = [
    /^\s*(final answer|answer)\s*:\s*/i,
    /^\s*(here'?s|here is)\s+/i,
  ];
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const firstFinalAnswerIndex = lines.findIndex((line) =>
    finalAnswerPatterns.some((pattern) => pattern.test(line))
  );
  const candidateLines =
    firstFinalAnswerIndex >= 0 ? lines.slice(firstFinalAnswerIndex) : lines;

  return candidateLines
    .map((line, index) =>
      index === 0
        ? line.replace(/^\s*(final answer|answer)\s*:\s*/i, "")
        : line
    )
    .filter((line) => !blockedLinePatterns.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPrompt({
  question,
  placeSlug,
  enableLiveSearch,
}: GenerateAskAiAnswerParams): string {
  const liveSearchInstruction = enableLiveSearch
    ? "Use Google Search only when the user's request needs current/live/source-backed info such as current hours, today, tonight, events, promos, fees, closures, availability, or when the user asks for sources. If current info is needed, do not answer from memory. Use search. If search is not needed, answer normally."
    : "Current verification is unavailable for this request. Do not claim current facts, opening hours, prices, events, promos, closures, or availability. If the question needs current information, clearly say you cannot verify the current details right now and offer general planning help instead.";

  const placeContext = placeSlug
    ? `Optional place context slug: ${placeSlug}. Use it only as a lightweight hint; do not invent details about the place.`
    : "No specific place slug was provided.";

  return [
    "You are Ask AI for GalaTayo, a friendly Metro Manila gala-planning assistant for non-technical users.",
    "Output only the final user-facing answer. Do not show reasoning, hidden notes, planning, checklists, prompt labels, analysis, tool decisions, or search queries.",
    "Never output prompt-style labels about role, audience, search decisions, user questions, context, or queries. Never output first-person planning statements.",
    "Sound like a friendly GalaTayo assistant. Keep it concise, practical, user-friendly, and Taglish-friendly while staying clear.",
    "Do not mention model names, provider names, grounding, Search Grounding, quotas, RPM, TPM, or internal tooling.",
    "Do not mention internal tools or technical routing. For source-backed answers, keep source links out of the answer text because links are returned separately.",
    liveSearchInstruction,
    placeContext,
    "Answer this question:",
    question,
  ].join("\n\n");
}

async function loadGeminiClient(): Promise<GoogleGenAI> {
  let apiKey: string;

  try {
    apiKey = await getSecret("gemini-api-key");
  } catch {
    throw new AskAiServiceError("Ask AI is not configured yet.", 500);
  }

  if (!apiKey) {
    throw new AskAiServiceError("Ask AI is not configured yet.", 500);
  }

  return new GoogleGenAI({ apiKey });
}

async function callModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  enableLiveSearch: boolean
): Promise<AskAiAnswerResult> {
  const response = enableLiveSearch
    ? await (ai as any).interactions.create({
        model,
        input: prompt,
        tools: [{ type: "google_search" }],
      })
    : await ai.models.generateContent({
        model,
        contents: prompt,
      });

  const answer = stripLeakedPromptSections(getResponseText(response));

  if (!answer) {
    throw new AskAiServiceError("Ask AI returned an empty answer.", 502);
  }

  const sources = dedupeSources(collectSources(response));
  const usedLiveSearch = enableLiveSearch && (hasGroundingSignal(response) || sources.length > 0);

  return {
    answer,
    usedLiveSearch,
    sources: usedLiveSearch ? sources : [],
  };
}

export async function generateAskAiAnswer(
  params: GenerateAskAiAnswerParams
): Promise<AskAiAnswerResult> {
  const ai = await loadGeminiClient();
  const prompt = buildPrompt(params);
  const models = params.enableLiveSearch
    ? [ASK_AI_LIVE_SEARCH_MODEL, ASK_AI_LIVE_SEARCH_FALLBACK_MODEL]
    : [ASK_AI_GUIDE_MODEL, ASK_AI_GUIDE_FALLBACK_MODEL];

  try {
    return await callModel(ai, models[0], prompt, params.enableLiveSearch);
  } catch {
    try {
      return await callModel(ai, models[1], prompt, params.enableLiveSearch);
    } catch (fallbackError) {
      const status = getProviderErrorStatus(fallbackError);
      const message = getProviderErrorMessage(fallbackError);

      throw new AskAiServiceError(message, status);
    }
  }
}
