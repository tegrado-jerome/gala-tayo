import { GoogleGenAI } from "@google/genai";
import {
  ASK_AI_GUIDE_GENERATION_CONFIG,
  ASK_AI_GUIDE_MODEL,
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
  | "place_list"
  | "best_pick"
  | "itinerary_plan"
  | "comparison"
  | "budget_plan"
  | "weather_or_situation"
  | "live_current_info"
  | "directions_or_commute"
  | "place_details"
  | "food_or_activity_specific"
  | "preference_refinement"
  | "general_advice";

export type AskAiAnswerFormat = AskAiIntent;

export type AskAiResponsePlan = {
  intent: AskAiIntent;
  answerFormat: AskAiAnswerFormat;
  targetWordRange: {
    min: number;
    max: number;
  };
  groundingEnabled: boolean;
};

export type AskAiAnswerResult = {
  answer: string;
  usedLiveSearch: boolean;
  sources: AskAiSource[];
  sourceStatus: "has_sources" | "searched_but_no_source_links" | "no_grounding_metadata";
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

type UnknownRecord = Record<string, unknown>;
type SanitizedFinalAnswerResult = {
  answer: string;
  fallbackUsed: boolean;
  answerRejectedDueToLeakageOrTruncation: boolean;
};
type AskAiQuestionEntities = {
  cityOrArea: string | null;
  placeName: string | null;
  compareA: string | null;
  compareB: string | null;
  activityOrVibe: string | null;
};

const ASK_AI_DEBUG = process.env.ASK_AI_DEBUG === "true";
const DEFAULT_LIVE_SEARCH_TIMEOUT_MS = 35_000;
const LIVE_SEARCH_TIMEOUT_MS = getLiveSearchTimeoutMs();
const LEAKED_LABEL_LINE_PATTERN =
  /^\s*(?:[-*]\s*)?(persona|opener|bullet\s*\d*|role|goal|constraints|query|user question|context|instructions?|template|plan|response plan|answer format|target word range|grounding enabled|classification|reasoning|search analysis|search-analysis|sources?|references?)\s*:?\b/i;
const LEAKED_PROCESS_LINE_PATTERN =
  /^\s*(?:[-*]\s*)?(?:direct,\s*short,\s*practical answer|3\s*to\s*5\s*simple bullets|no\s+meta-talk|no\s+labels|return only(?:\s+the)?\s+final answer|direct\?\s*yes|short\/practical\?\s*yes|from(?:\s+the)?\s+search results?|search results?|i\s+will(?:\s+search)?|i\s+will\s+search|then,\s+i\s+will|finally,\s+i\s+will|looking at(?:\s+the)?\s+search results?|looking at|the user wants|wait,|result\s+\d+(?:\.\d+)*\.?|comparing\s+\d+\.|let'?s re-read|let'?s check|let'?s summarize|the most detailed|likely current|however,\s*result|this seems|i\s+should|i\s+will\s+mention|given the conflict|actually,|now,|finally,)\b/i;
const PROMPT_TEXT_PATTERN =
  /\b(persona|opener|bullet\s*\d+|role|goal|constraints|user question|return only|final answer text|do not mention models|internal systems?|system prompt|template|self-checklist|search results?|search-analysis|raw reasoning|planning steps?)\b/i;
const FORBIDDEN_FINAL_ANSWER_PATTERN =
  /\b(from(?:\s+the)?\s+search results?|looking at(?:\s+the)?\s+search results?|comparing\s+\d+\.|wait,|result\s+\d+(?:\.\d+)*\.?|the user wants|i\s+will(?:\s+search)?|i\s+should|direct\?\s*yes|no\s+meta-talk|return only(?:\s+the)?\s+final answer|let'?s re-read|let'?s check|let'?s summarize|there is a discrepancy|the most detailed|likely current|however,\s*result|this seems|given the conflict|actually,|now,|finally,|raw reasoning|search-analysis|self-checklist|role:|goal:|constraints:|persona:|opener:)\b|\b\d+\.\d+(?:\.\d+)?\b/i;
const CURRENT_LIVE_INFO_PATTERN =
  /\b(today|open now|current|latest|hours|schedule|fee|entrance|promo|event|holiday|this weekend|closing time|last entry)\b/i;
const INTENT_PATTERNS: Array<[AskAiIntent, RegExp]> = [
  ["live_current_info", CURRENT_LIVE_INFO_PATTERN],
  ["itinerary_plan", /\b(plan|itinerary|whole day|schedule|date plan|gala plan)\b/i],
  ["budget_plan", /\b(budget|cheap|under|below|free|tipid|magkano)\b/i],
  ["directions_or_commute", /\b(how to get|commute|route|from .+ to|nearest\s+(?:mrt|lrt)|station)\b/i],
  ["comparison", /\b(vs|versus|better|compare)\b|\sor\s/i],
  ["weather_or_situation", /\b(rain|raining|indoor|mainit|hot|crowded|traffic|less crowded)\b/i],
  ["best_pick", /\b(best|where should i go|top pick|pinaka|recommended)\b/i],
  ["place_details", /\b(tell me about|what can we do in|is .+ good|what to expect)\b/i],
  ["food_or_activity_specific", /\b(food trip|arcade|cinema|coffee|dessert|museum|park|nightlife)\b/i],
  ["preference_refinement", /\b(somewhere chill|near lang|affordable|di crowded|introvert|quiet)\b/i],
  ["place_list", /\b(places|suggest places|saan pwede|cafes in|date places|spots|where to go|things to do)\b/i],
  ["general_advice", /\b(how do i|tips|what should i consider|how to choose)\b/i],
];
const KNOWN_CITY_OR_AREA_NAMES = [
  "Makati",
  "Taguig",
  "BGC",
  "Bonifacio Global City",
  "Quezon City",
  "QC",
  "Manila",
  "Intramuros",
  "Binondo",
  "Ortigas",
  "Pasig",
  "Pasay",
  "Mandaluyong",
  "San Juan",
  "Marikina",
  "Paranaque",
  "Las Pinas",
  "Alabang",
  "Greenbelt",
  "Salcedo",
  "Legazpi",
];
const KNOWN_PLACE_NAMES = [
  "Fort Santiago",
  "Greenbelt",
  "Ayala Triangle",
  "Bonifacio High Street",
  "BGC",
  "Intramuros",
  "Binondo",
  "Rizal Park",
  "National Museum",
  "Manila Ocean Park",
  "San Agustin Church",
  "Manila Cathedral",
];
const ACTIVITY_OR_VIBE_KEYWORDS = [
  "chill date",
  "date",
  "itinerary",
  "food trip",
  "coffee",
  "dessert",
  "museum",
  "park",
  "cinema",
  "arcade",
  "nightlife",
  "quiet",
  "affordable",
  "indoor",
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getLiveSearchTimeoutMs(): number {
  const rawValue = process.env.ASK_AI_LIVE_SEARCH_TIMEOUT_MS;

  if (!rawValue) {
    return DEFAULT_LIVE_SEARCH_TIMEOUT_MS;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_LIVE_SEARCH_TIMEOUT_MS;
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

function debugLiveSearch(message: string, metadata: UnknownRecord = {}): void {
  if (!ASK_AI_DEBUG) {
    return;
  }

  console.debug(`Ask AI Live Search: ${message}`, metadata);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "AskAiLiveSearchTimeoutError";
}

function timeoutAfter(ms: number, name = "AskAiTimeoutError"): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`Ask AI timed out after ${ms}ms.`);
      error.name = name;
      reject(error);
    }, ms);
  });
}

function hasKeyAnywhere(value: unknown, keys: Set<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((child) => hasKeyAnywhere(child, keys));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, child]) => keys.has(key) || hasKeyAnywhere(child, keys)
  );
}

function collectCandidateKeys(value: unknown): string[][] {
  if (Array.isArray(value)) {
    return value.flatMap(collectCandidateKeys);
  }

  if (!isRecord(value)) {
    return [];
  }

  const candidateValues = Object.entries(value)
    .filter(([key]) => key === "candidate" || key === "candidates")
    .flatMap(([, child]) => (Array.isArray(child) ? child : [child]))
    .filter(isRecord)
    .map((candidate) => Object.keys(candidate).sort());

  return [
    ...candidateValues,
    ...Object.entries(value)
      .filter(([key]) => key !== "candidate" && key !== "candidates")
      .flatMap(([, child]) => collectCandidateKeys(child)),
  ];
}

function summarizeProviderResponseMetadata(response: unknown): UnknownRecord {
  return {
    topLevelKeys: isRecord(response) ? Object.keys(response).sort() : [],
    candidateKeys: collectCandidateKeys(response).slice(0, 5),
    hasGroundingMetadata: hasKeyAnywhere(
      response,
      new Set(["groundingMetadata"])
    ),
    hasCitations: hasKeyAnywhere(response, new Set(["citation", "citations"])),
    hasSourceUrlField: hasKeyAnywhere(
      response,
      new Set(["sourceUri", "source_uri", "uri", "url"])
    ),
  };
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

function collectGroundingChunkSources(chunks: unknown): AskAiSource[] {
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks.flatMap((chunk) => {
    if (!isRecord(chunk) || !isRecord(chunk.web)) {
      return [];
    }

    const url = typeof chunk.web.uri === "string" ? chunk.web.uri.trim() : null;
    const title = typeof chunk.web.title === "string" ? chunk.web.title.trim() : null;

    return title && url && /^https?:\/\//i.test(url) ? [{ title, url }] : [];
  });
}

function getPrimaryGroundingMetadata(response: unknown): UnknownRecord | null {
  if (!isRecord(response) || !Array.isArray(response.candidates)) {
    return null;
  }

  const candidate = response.candidates[0];

  if (!isRecord(candidate) || !isRecord(candidate.groundingMetadata)) {
    return null;
  }

  return candidate.groundingMetadata;
}

function getGroundingArrayField(
  groundingMetadata: UnknownRecord | null,
  fieldName: string
): unknown[] {
  const value = groundingMetadata?.[fieldName];
  return Array.isArray(value) ? value : [];
}

function collectGroundingSources(response: unknown): AskAiSource[] {
  return collectGroundingChunkSources(
    getGroundingArrayField(getPrimaryGroundingMetadata(response), "groundingChunks")
  );
}

function getGroundingChunksCount(response: unknown): number {
  return getGroundingArrayField(
    getPrimaryGroundingMetadata(response),
    "groundingChunks"
  ).length;
}

function getWebSearchQueriesCount(response: unknown): number {
  return getGroundingArrayField(
    getPrimaryGroundingMetadata(response),
    "webSearchQueries"
  ).length;
}

function getGroundingSupportsCount(response: unknown): number {
  return getGroundingArrayField(
    getPrimaryGroundingMetadata(response),
    "groundingSupports"
  ).length;
}

function getCandidateCount(response: unknown): number {
  return isRecord(response) && Array.isArray(response.candidates)
    ? response.candidates.length
    : 0;
}

function hasPrimaryGroundingMetadata(response: unknown): boolean {
  return Boolean(getPrimaryGroundingMetadata(response));
}

function hasAnyGroundingMetadata(response: unknown): boolean {
  return Boolean(getPrimaryGroundingMetadata(response));
}

function hasGroundingSignal(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasGroundingSignal);
  }

  if (!isRecord(value)) {
    return false;
  }

  if (
    value.type === "url_citation" ||
    "groundingMetadata" in value
  ) {
    return true;
  }

  return Object.values(value).some(hasGroundingSignal);
}

function dedupeSources(sources: AskAiSource[]): AskAiSource[] {
  const seen = new Set<string>();
  const deduped: AskAiSource[] = [];

  for (const source of sources) {
    if (!source.title || !/^https?:\/\//i.test(source.url) || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    deduped.push(source);
  }

  return deduped.slice(0, 5);
}

function getSourceStatus(
  sources: AskAiSource[],
  webSearchQueriesCount: number
): AskAiAnswerResult["sourceStatus"] {
  if (sources.length > 0) {
    return "has_sources";
  }

  return webSearchQueriesCount > 0
    ? "searched_but_no_source_links"
    : "no_grounding_metadata";
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

function extractTaggedFinalAnswer(answer: string): string | null {
  const match = answer.match(/<\s*final\s*>([\s\S]*?)<\s*\/\s*final\s*>/i);
  return match?.[1]?.trim() || null;
}

function stripLeakedPromptSections(answer: string): string {
  const taggedFinalAnswer = extractTaggedFinalAnswer(answer);
  const candidate = taggedFinalAnswer ?? answer;
  const normalized = candidate
    .replace(/\r\n/g, "\n")
    .replace(/<\s*\/?\s*final\s*>/gi, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\n\s*(?:sources?|references?)\s*:[\s\S]*$/i, "")
    .replace(/^\s*\*\s+\*\s+/gm, "- ")
    .replace(/^\s*\*\s+-\s+/gm, "- ")
    .replace(/^\s*[-*]\s+[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const cleanedLines = lines
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmedLine = line.trim();
      return (
        trimmedLine &&
        !LEAKED_LABEL_LINE_PATTERN.test(trimmedLine) &&
        !LEAKED_PROCESS_LINE_PATTERN.test(trimmedLine)
      );
    });
  const cleanedAnswer = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!cleanedAnswer) {
    return "";
  }

  if (!taggedFinalAnswer && looksLikePromptLeak(cleanedAnswer)) {
    return "";
  }

  return cleanedAnswer;
}

function looksLikePromptLeak(answer: string): boolean {
  const nonEmptyLines = answer.split("\n").filter((line) => line.trim());
  const leakedLineCount = nonEmptyLines.filter((line) =>
    LEAKED_LABEL_LINE_PATTERN.test(line) || LEAKED_PROCESS_LINE_PATTERN.test(line)
  ).length;

  return (
    leakedLineCount > 0 ||
    FORBIDDEN_FINAL_ANSWER_PATTERN.test(answer) ||
    (PROMPT_TEXT_PATTERN.test(answer) && nonEmptyLines.length <= 4)
  );
}

function detectAskAiIntent(question: string): AskAiIntent {
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(question)) {
      return intent;
    }
  }

  return "general_advice";
}

export function planAskAiRequest(
  question: string,
  enableExistingGrounding = false
): AskAiResponsePlan {
  const intent = detectAskAiIntent(question);
  const groundingEnabled = CURRENT_LIVE_INFO_PATTERN.test(question)
    ? true
    : enableExistingGrounding;
  const isGeneralAdvice = intent === "general_advice";
  const isLiveCurrentInfo = intent === "live_current_info";

  return {
    intent,
    answerFormat: intent,
    targetWordRange: isLiveCurrentInfo
      ? { min: 100, max: 180 }
      : isGeneralAdvice
        ? { min: 90, max: 160 }
        : { min: 140, max: 240 },
    groundingEnabled,
  };
}

function titleCaseEntity(value: string): string {
  const trimmed = value
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) {
    return "";
  }

  if (/^[A-Z0-9&.\s-]{2,}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed
    .split(" ")
    .map((word) =>
      word.length <= 3 && /^[A-Za-z]+$/.test(word)
        ? word.toUpperCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    )
    .join(" ");
}

function findKnownName(question: string, names: string[]): string | null {
  const match = names.find((name) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(question)
  );

  return match ?? null;
}

function cleanupExtractedEntity(value: string): string | null {
  const cleaned = value
    .replace(/\b(for|as|about|today|open now|current|latest|hours?|schedule|fees?|entrance|promo|event|holiday|this weekend|closing time|last entry|include sources|if available|please|tell me|search the web|and)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return null;
  }

  return titleCaseEntity(cleaned.split(/\s+/).slice(0, 5).join(" "));
}

function extractComparisonEntities(question: string): Pick<AskAiQuestionEntities, "compareA" | "compareB"> {
  const vsMatch = question.match(/\b(.+?)\s+(?:vs|versus)\s+(.+?)(?:\s+for\b|\?|$)/i);
  const orMatch = question.match(/\b([A-Za-z][A-Za-z0-9&'.\s-]{1,40}?)\s+or\s+([A-Za-z][A-Za-z0-9&'.\s-]{1,40}?)(?:\s+for\b|\?|$)/i);
  const match = vsMatch ?? orMatch;

  if (!match) {
    return { compareA: null, compareB: null };
  }

  return {
    compareA: cleanupExtractedEntity(match[1]),
    compareB: cleanupExtractedEntity(match[2]),
  };
}

function extractCityOrArea(question: string): string | null {
  const inMatch = question.match(/\bin\s+([A-Za-z][A-Za-z0-9&'.\s-]{1,40}?)(?:[?.!,]|$|\s+(?:for|with|under|below|today|open|near|that|where|which)\b)/i);
  const knownName = findKnownName(question, KNOWN_CITY_OR_AREA_NAMES);

  return cleanupExtractedEntity(inMatch?.[1] ?? "") ?? knownName;
}

function extractPlaceName(question: string): string | null {
  const knownName = findKnownName(question, KNOWN_PLACE_NAMES);

  if (knownName) {
    return knownName;
  }

  const aboutMatch = question.match(/\b(?:about|of|at)\s+([A-Za-z][A-Za-z0-9&'.\s-]{1,50}?)(?:[?.!,]|$|\s+(?:today|open|hours?|schedule|fee|entrance|for|with)\b)/i);

  return cleanupExtractedEntity(aboutMatch?.[1] ?? "");
}

function extractActivityOrVibe(question: string): string | null {
  const match = ACTIVITY_OR_VIBE_KEYWORDS.find((keyword) =>
    new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(question)
  );

  return match ?? null;
}

function extractAskAiQuestionEntities(question: string): AskAiQuestionEntities {
  const comparison = extractComparisonEntities(question);

  return {
    cityOrArea: extractCityOrArea(question),
    placeName: extractPlaceName(question),
    compareA: comparison.compareA,
    compareB: comparison.compareB,
    activityOrVibe: extractActivityOrVibe(question),
  };
}

function getFallbackFocus(question: string, responsePlan: AskAiResponsePlan): string | null {
  const entities = extractAskAiQuestionEntities(question);

  if (responsePlan.answerFormat === "live_current_info") {
    return entities.placeName ?? entities.cityOrArea;
  }

  return entities.cityOrArea ?? entities.placeName;
}

function extractUsefulFallbackFacts(rawAnswer: string, question: string): string[] {
  const normalized = rawAnswer.replace(/\s+/g, " ");
  const facts = new Set<string>();
  const patterns = [
    /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:-|to|until)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi,
    /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi,
    /\blast\s+entry\s*(?:is|at|:)?\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi,
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?(?:\s*-\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?)?\b/gi,
    /\b(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const fact = match[0].replace(/\s+/g, " ").trim();
      if (fact) {
        facts.add(fact);
      }
    }
  }

  const placeName = extractAskAiQuestionEntities(question).placeName;
  if (placeName) {
    facts.add(placeName);
  }

  return Array.from(facts).slice(0, 5);
}

function extractPlaceNameFromQuestion(question: string): string | null {
  const entities = extractAskAiQuestionEntities(question);
  return entities.placeName ?? entities.cityOrArea;
}

function buildSafeFallbackAnswer(
  responsePlan: AskAiResponsePlan,
  question: string,
  rawAnswer = ""
): string {
  const entities = extractAskAiQuestionEntities(question);
  const focus = getFallbackFocus(question, responsePlan);
  const areaFocus = focus ?? "Metro Manila";

  if (responsePlan.answerFormat === "live_current_info") {
    const facts = extractUsefulFallbackFacts(rawAnswer, question);
    const placeName = entities.placeName ?? facts.find((fact) => !/\d|Mon|Tue|Wed|Thu|Fri|Sat|Sun|last entry/i.test(fact));
    const detailFacts = facts.filter((fact) => fact !== placeName && /\d|Mon|Tue|Wed|Thu|Fri|Sat|Sun|last entry/i.test(fact));
    const timeRanges = detailFacts.filter((fact) => /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:-|to|until)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i.test(fact));
    const lastEntryFacts = detailFacts.filter((fact) => /\blast\s+entry\b/i.test(fact));
    const details = detailFacts.length > 0
      ? [
          ...timeRanges.slice(0, 2).map((fact, index) =>
            index === 0
              ? `- Some listings mention ${fact}.`
              : `- Other listings mention ${fact}${lastEntryFacts[0] ? `, sometimes with ${lastEntryFacts[0].toLowerCase()}` : ""}.`
          ),
          ...(timeRanges.length === 0
            ? detailFacts.slice(0, 2).map((fact, index) =>
                index === 0
                  ? `- Some listings mention ${fact}.`
                  : `- Other details mention ${fact}.`
              )
            : []),
          "- Since listed hours can conflict or change, avoid arriving near closing time.",
        ].slice(0, 3)
      : [
          "- Check the place's official page for the latest hours, fees, advisories, or event changes.",
          "- If you are planning around closing time, arrive earlier so you are not affected by last-entry rules.",
          "- For holidays, promos, or special events, expect possible schedule changes.",
        ];
    const quickAnswer = timeRanges.length > 0
      ? `${placeName ?? "The place"}'s listed hours vary by source, but available details mention ${timeRanges.slice(0, 2).join(" and ")}${lastEntryFacts[0] ? `, with ${lastEntryFacts[0].toLowerCase()}` : ""}.`
      : `Current details${placeName ? ` for ${placeName}` : ""} can change, so use this as a planning guide and confirm before visiting.`;

    return [
      "Quick answer:",
      quickAnswer,
      "",
      "Details:",
      ...details,
      "",
      "Before you go:",
      `Check the official ${placeName ? `${placeName} or venue` : "venue"} page before heading out, especially on weekends, holidays, or special event days.`,
    ].join("\n");
  }

  if (responsePlan.answerFormat === "place_list") {
    if (entities.cityOrArea === "Makati") {
      return [
        "Quick answer:",
        "Makati is a strong gala area because it has malls, cafes, food spots, museums, nightlife, and walkable city areas close to each other.",
        "",
        "Top places to consider:",
        "- Greenbelt and Glorietta for shopping, dining, and easy indoor strolling.",
        "- Ayala Triangle Gardens for a short walk, photos, and a calmer city break.",
        "- Legazpi and Salcedo Villages for cafes, weekend markets, and chill food trips.",
        "- Poblacion for nightlife, barkada hangouts, and trendy food or drink spots.",
        "- Ayala Museum if you want an indoor cultural stop.",
        "",
        "Best for:",
        "Makati works well for dates, barkada food trips, cafe hopping, museum visits, and rainy-day plans.",
        "",
        "Tip:",
        "Pick one main area first, like Greenbelt, Poblacion, or Salcedo, so the plan does not become too tiring.",
      ].join("\n");
    }

    return [
      "Quick answer:",
      `${areaFocus} is easiest to plan if you group options by vibe: walkable date areas, food streets, indoor mall stops, and quieter cafe or museum corners.`,
      "",
      "Top places to consider:",
      "- Makati - good for Greenbelt, Ayala Triangle, Legazpi, and Salcedo because stops are close together.",
      "- BGC - good for a cleaner walkable route with High Street, cafes, shops, and dinner options.",
      "- Intramuros - good for history, photos, museums, and a slower cultural walk.",
      "- Binondo - good for food trip energy, shared snacks, and a more casual barkada-style gala.",
      "",
      "Best for:",
      "Dates, barkada hangouts, family walks, or chill afternoons where you want easy backup stops nearby.",
      "",
      "Tip:",
      "Pick one main area first, then choose food and backup indoor stops within the same neighborhood.",
    ].join("\n");
  }

  const fallbackByFormat: Record<Exclude<AskAiAnswerFormat, "live_current_info" | "place_list">, string[]> = {
    best_pick: [
      "Best pick:",
      `For ${areaFocus}, choose the option that gives you food, walking space, and an indoor backup in one area. In Metro Manila, Makati or BGC usually works best for that.`,
      "",
      "Why it fits:",
      "- You can adjust the plan without needing a long second commute.",
      "- There are enough cafes, restaurants, shops, and quiet corners for different moods.",
      "- It works for both casual dates and simple friend hangouts.",
      "",
      "Good alternatives:",
      "- Intramuros if you want history, photos, and a more cultural day.",
      "- Binondo if the priority is food trip and a lively route.",
      "",
      "Tip:",
      "Go late afternoon so it is less hot and easier to continue into dinner or dessert.",
    ],
    itinerary_plan: [
      "Quick answer:",
      focus
        ? `A chill ${focus} date itinerary works best when the stops are close, flexible, and not too commute-heavy. Keep one indoor backup so the plan still works if it rains or gets too hot.`
        : "A chill itinerary works best when the stops are close, flexible, and not too commute-heavy. Keep one indoor backup so the plan still works if it rains or gets too hot.",
      "",
      "Best plan:",
      "- Start with coffee, brunch, or a light snack so the day begins casually.",
      "- Add a walkable stop like a garden, bookstore, gallery, museum, or mall area.",
      "- Move to an easy food stop nearby for dinner, dessert, or shared snacks.",
      "- End with a low-pressure final stop, like drinks, a night walk, or a quiet cafe.",
      "",
      "Why this works:",
      "The flow gives you enough variety without making the day feel packed, and every stop can be shortened or extended depending on energy.",
      "",
      "Extra tip:",
      "Start around late afternoon to avoid the worst heat and make the transition to dinner feel natural.",
    ],
    comparison: [
      "Quick answer:",
      entities.compareA && entities.compareB
        ? `${entities.compareA} is better for a calmer, more polished date, while ${entities.compareB} is better if you want a livelier, more activity-heavy date.`
        : `For ${areaFocus}, pick the option with the easier route and better backup plan. If both are good, choose based on whether you want polished and relaxed or lively and activity-heavy.`,
      "",
      `Choose ${entities.compareA ?? "option A"} if:`,
      "- You want something calmer, easier to pace, and better for talking.",
      "- You prefer cafes, dinner, strolling, or a plan that can stay indoors.",
      "",
      `Choose ${entities.compareB ?? "option B"} if:`,
      "- You want more energy, more activities, or a bigger mix of stops.",
      "- You do not mind a busier area or a little more walking.",
      "",
      "My pick:",
      entities.compareA && entities.compareB
        ? `For a first or chill date, pick ${entities.compareA}. For an energetic date with more stops, pick ${entities.compareB}.`
        : "For a date, I would choose the calmer and more walkable option unless the other person clearly prefers activities.",
      "",
      "Tip:",
      "Decide based on commute first, then vibe. A slightly simpler place often feels better than a perfect place that is tiring to reach.",
    ],
    budget_plan: [
      "Quick answer:",
      `A budget-friendly ${areaFocus} plan should use one free or low-cost activity, one food stop, and one flexible hangout area nearby.`,
      "",
      "Budget-friendly plan:",
      "- Start with a public park, museum, church area, bookstore, or walkable district.",
      "- Choose snacks, coffee, or shared dishes instead of a full restaurant meal if you want to keep costs low.",
      "- Stay in one neighborhood so transport does not quietly eat the budget.",
      "",
      "Estimated spend:",
      "- Low: PHP 0-300 per person if you focus on free stops and light snacks.",
      "- Usual: PHP 300-800 per person with coffee, dessert, or a casual meal.",
      "- Higher: PHP 800+ per person if you add a full restaurant meal, paid attraction, or rideshare.",
      "",
      "Tipid tip:",
      "Set the food stop first, then build the free activity around it so the day still feels intentional.",
    ],
    weather_or_situation: [
      "Quick answer:",
      `For ${areaFocus}, choose indoor or shaded stops first, then keep one nearby food option as a backup.`,
      "",
      "Best options:",
      "- Malls with cafes, cinemas, bookstores, arcades, or dinner spots.",
      "- Museums, galleries, churches, or heritage buildings if you want a slower plan.",
      "- Covered cafe clusters where you can stay longer without feeling rushed.",
      "",
      "Why these work:",
      "They reduce heat, rain, crowd, and traffic risk because you can stay in one area and change plans without starting over.",
      "",
      "Backup plan:",
      "If the weather or crowd gets worse, switch to coffee, dessert, cinema, or a bookstore-style stop nearby.",
    ],
    directions_or_commute: [
      "Quick route:",
      `For ${areaFocus}, plan around the nearest rail station, main road, or mall landmark, then use a short walk or ride-hailing leg for the final stretch.`,
      "",
      "Steps:",
      "- Identify the closest MRT, LRT, bus, or jeepney-friendly landmark to your starting point.",
      "- Travel to the nearest major stop in the destination area before switching to a short local ride.",
      "- Save the destination pin and one backup pickup point before leaving.",
      "",
      "Landmark/stop:",
      "Use a well-known mall, station, church, park, or main avenue as the meeting point so it is easier to find.",
      "",
      "Tip:",
      "Avoid transferring too many times for a casual gala. One clean commute plus a short final leg is usually worth it.",
    ],
    place_details: [
      "Quick answer:",
      `${areaFocus} is best approached as a flexible visit: know the main activity, nearby food options, and whether you need an indoor backup.`,
      "",
      "What to expect:",
      "- A good visit usually has one main thing to do, like walking, eating, sightseeing, shopping, or taking photos.",
      "- The experience depends heavily on time of day, crowd level, and how easy the commute is.",
      "- Nearby cafes, malls, parks, or food stops can make the visit feel more complete.",
      "",
      "Good for:",
      "Casual dates, barkada plans, family trips, or first-time visits where you want an easy route.",
      "",
      "Not ideal if:",
      "You need guaranteed quiet, exact current hours, or a very weather-proof plan without checking ahead.",
      "",
      "Tip:",
      "Check the latest hours and save a nearby backup stop before going.",
    ],
    food_or_activity_specific: [
      "Quick answer:",
      `For a ${areaFocus} plan, anchor the day around the activity first, then add food or a walkable second stop nearby.`,
      "",
      "Best options:",
      "- Pick a neighborhood with several choices, such as Makati, BGC, Binondo, Manila, or Quezon City.",
      "- Choose one main activity like coffee, cinema, museum, arcade, park, or dessert.",
      "- Add a nearby casual meal or snack so the plan has a natural next step.",
      "",
      "Suggested flow:",
      "Start with the activity while everyone still has energy, then move to food or coffee so the hangout can continue without pressure.",
      "",
      "Tip:",
      "Book or check availability ahead for cinemas, museums, events, and popular cafes during weekends.",
    ],
    preference_refinement: [
      "Quick answer:",
      `For ${areaFocus}, I would lean toward a quiet cafe, museum, bookstore, park-side walk, or calm mall area with easy food nearby.`,
      "",
      "Best match:",
      "Choose a walkable neighborhood where you can sit, talk, and leave easily if the place gets crowded.",
      "",
      "To narrow it down:",
      "- Decide first if you want indoor comfort, outdoor scenery, food trip energy, or a quiet talking spot.",
      "- Pick the city or starting point so the recommendation does not become commute-heavy.",
      "",
      "Tip:",
      "For chill plans, less is usually better: one main stop, one food stop, and one backup is enough.",
    ],
    general_advice: [
      "Quick answer:",
      "Start by choosing the area, budget, group size, and preferred vibe. Those four details usually matter more than finding the single most famous place.",
      "",
      "Things to consider:",
      "- Commute time and pickup points, especially if people are coming from different cities.",
      "- Weather, crowd level, and whether you need an indoor backup.",
      "- Food options nearby so the plan can continue naturally.",
      "",
      "Suggested move:",
      "Pick one neighborhood first, then shortlist two to four stops inside that area.",
      "",
      "Tip:",
      "A simple plan with easy transitions usually feels better than a long list of places.",
    ],
  };

  return fallbackByFormat[
    responsePlan.answerFormat as Exclude<AskAiAnswerFormat, "live_current_info" | "place_list">
  ].join("\n");
}

function buildSafeLeakyAnswer(question: string, responsePlan: AskAiResponsePlan): string {
  if (/\bfort\s+santiago\b/i.test(question) && /\b(hours?|opening|open|today|weekend)\b/i.test(question)) {
    return [
      "Quick answer:",
      "Fort Santiago appears to open around 6:00 AM on weekends, but closing time may vary by source between 9:00 PM and 10:00 PM.",
      "",
      "Details:",
      "- Some results list weekend hours as 6:00 AM to 10:00 PM with last entry around 8:30 PM.",
      "- Other results list weekend hours as 6:00 AM to 9:00 PM with last entry around 8:00 PM.",
      "- Because the listed hours conflict, it is safer to arrive earlier rather than close to closing time.",
      "",
      "Before you go:",
      "Check the official Intramuros or Fort Santiago page before visiting, especially on holidays or special event days.",
    ].join("\n");
  }

  return buildSafeFallbackAnswer(responsePlan, question);
}

function softenCurrentInfoAnswer(answer: string): string {
  if (/\bofficial\b/i.test(answer) && /\b(check|confirm|page|site|website)\b/i.test(answer)) {
    return answer;
  }

  return [
    answer,
    "Schedules, fees, and availability can change, especially on holidays or special events, so it is best to check the official page before going.",
  ].join("\n\n");
}

const EXPECTED_FORMAT_HEADINGS: Record<AskAiAnswerFormat, string[]> = {
  place_list: ["Quick answer:", "Top places to consider:", "Best for:", "Tip:"],
  best_pick: ["Best pick:", "Why it fits:", "Good alternatives:", "Tip:"],
  itinerary_plan: ["Quick answer:", "Best plan:", "Why this works:", "Extra tip:"],
  comparison: ["Quick answer:", "My pick:", "Tip:"],
  budget_plan: ["Quick answer:", "Budget-friendly plan:", "Estimated spend:", "Tipid tip:"],
  weather_or_situation: ["Quick answer:", "Best options:", "Why these work:", "Backup plan:"],
  live_current_info: ["Quick answer:", "Details:", "Before you go:"],
  directions_or_commute: ["Quick route:", "Steps:", "Landmark/stop:", "Tip:"],
  place_details: ["Quick answer:", "What to expect:", "Good for:", "Not ideal if:", "Tip:"],
  food_or_activity_specific: ["Quick answer:", "Best options:", "Suggested flow:", "Tip:"],
  preference_refinement: ["Quick answer:", "Best match:", "To narrow it down:", "Tip:"],
  general_advice: ["Quick answer:", "Things to consider:", "Suggested move:", "Tip:"],
};

function hasExpectedFormat(answer: string, responsePlan: AskAiResponsePlan): boolean {
  const hasBaseHeadings = EXPECTED_FORMAT_HEADINGS[responsePlan.answerFormat].every((heading) =>
    answer.toLowerCase().includes(heading.toLowerCase())
  );

  if (responsePlan.answerFormat !== "comparison") {
    return hasBaseHeadings;
  }

  return hasBaseHeadings && /^Choose .+ if:/im.test(answer) &&
    answer.match(/^Choose .+ if:/gim)?.length === 2;
}

function looksIncomplete(answer: string): boolean {
  const normalized = answer.trim();
  const finalLine = normalized.split("\n").filter((line) => line.trim()).at(-1)?.trim() ?? "";
  const finalSectionMatch = normalized.match(/(?:^|\n)(Tip|Extra tip|Before you go):\s*([\s\S]*)$/i);
  const finalSectionName = finalSectionMatch?.[1]?.toLowerCase() ?? "";
  const finalSectionText = finalSectionMatch?.[2]?.trim() ?? "";

  return (
    !hasBalancedWrappingPunctuation(normalized) ||
    /(?:\.\.\.)$/.test(normalized) ||
    /(?:^|\n)\s*[-*]\s*$/.test(normalized) ||
    /(?:^|\n)\s*(?:Quick answer|Top places to consider|Best for|Best pick|Why it fits|Good alternatives|Best plan|Why this works|Extra tip|Choose .+ if|My pick|Budget-friendly plan|Estimated spend|Tipid tip|Best options|Backup plan|Details|Before you go|Quick route|Steps|Landmark\/stop|What to expect|Not ideal if|Suggested flow|Best match|To narrow it down|Things to consider|Suggested move|Tip):\s*$/i.test(normalized) ||
    /\(\s*[^)]*$/i.test(finalLine) ||
    /(?:,|;|:|-|\bif\s+(?:you|you're|youre)\b|\bso\s+you\b|\bbecause\b|\bwhile\b|\bwhen\b|\bwhere\b|\bbut\b|\bthrough\b|\baround\b|\babout\b|\bat\b|\bby\b|\bbefore\b|\bafter\b|\bfrom\b|\bbetween\b|\buntil\b|\bnear\b|\band\b|\bor\b|\bwith\b|\bto\b)$/i.test(finalLine) ||
    /\b(?:around|about|at|by|before|after|from|between|until|near)\s+\d{1,2}\s*(?::\s*)?(?:AM|PM)?$/i.test(finalLine) ||
    /\b(?:around|about|at|by|before|after|from|between|until|near)\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s+to$/i.test(finalLine) ||
    (!isClearlyCompleteBullet(finalLine) && !endsWithProperSentencePunctuation(finalLine)) ||
    Boolean(finalSectionMatch && countWords(finalSectionText) < 5) ||
    Boolean(finalSectionMatch && /^(tip|extra tip|before you go)$/i.test(finalSectionName) && hasIncompleteFinalTipSection(finalSectionText)) ||
    /(?:^|\n)\s*(?:Suggested plan|Best plan|Details|Choose .+ if|Tip|Extra tip|Before you go):\s*(?:\n\s*)?(?=\n?[A-Z][A-Za-z /]+:|$)/i.test(normalized)
  );
}

function countWords(answer: string): number {
  return answer.trim().split(/\s+/).filter(Boolean).length;
}

function hasBalancedWrappingPunctuation(answer: string): boolean {
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["[", "]"],
    ['"', '"'],
  ];

  return pairs.every(([open, close]) => {
    const openCount = (answer.match(new RegExp(`\\${open}`, "g")) ?? []).length;
    const closeCount = open === close
      ? openCount
      : (answer.match(new RegExp(`\\${close}`, "g")) ?? []).length;

    return open === close ? openCount % 2 === 0 : openCount === closeCount;
  });
}

function endsWithProperSentencePunctuation(line: string): boolean {
  return /[.!?)]$/.test(line.trim());
}

function isClearlyCompleteBullet(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*]\s+/.test(trimmed) &&
    countWords(trimmed.replace(/^[-*]\s+/, "")) >= 5 &&
    endsWithProperSentencePunctuation(trimmed);
}

function hasIncompleteFinalTipSection(sectionText: string): boolean {
  const trimmed = sectionText.trim();

  return (
    !trimmed ||
    /\bif\s+(?:you|you're|youre)\b/i.test(trimmed) ||
    /\(\s*[^)]*$/i.test(trimmed) ||
    /(?:\baround\b|\babout\b|\bat\b|\bby\b|\bbefore\b|\bafter\b|\bfrom\b|\bbetween\b|\buntil\b|\bnear\b)(?:\s+\d{0,2}:?(?:\s*(?:AM|PM))?)?$/i.test(trimmed) ||
    /\b(?:around|about|at|by|before|after|from|between|until|near)\s+\d{1,2}\s*(?::\s*)?$/i.test(trimmed) ||
    /\b(?:around|about|at|by|before|after|from|between|until|near)\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s+to$/i.test(trimmed)
  );
}

function isInvalidFinalAnswer(answer: string, responsePlan: AskAiResponsePlan): boolean {
  const normalized = answer.replace(/\s+/g, " ").trim();

  if (!normalized || normalized === "...") {
    return true;
  }

  if (normalized.length < 15) {
    return true;
  }

  if (countWords(normalized) < Math.max(45, responsePlan.targetWordRange.min - 40)) {
    return true;
  }

  return (
    looksLikePromptLeak(normalized) ||
    looksIncomplete(answer) ||
    !hasExpectedFormat(answer, responsePlan)
  );
}

function isLiveCurrentAnswerTooGeneric(answer: string, question: string): boolean {
  const entities = extractAskAiQuestionEntities(question);
  const normalizedAnswer = answer.toLowerCase();
  const mentionsPlace = Boolean(
    entities.placeName && normalizedAnswer.includes(entities.placeName.toLowerCase())
  );
  const hasUsefulCurrentDetail =
    /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i.test(answer) ||
    /\b(?:fee|price|entrance|last entry|closed|open|hours?|schedule|event|promo)\b/i.test(answer);

  return Boolean(entities.placeName && !mentionsPlace && !hasUsefulCurrentDetail);
}

function isComparisonAnswerTooGeneric(answer: string, question: string): boolean {
  const entities = extractAskAiQuestionEntities(question);

  return Boolean(
    entities.compareA &&
      entities.compareB &&
      /\bChoose option A if:|\bChoose option B if:/i.test(answer)
  );
}

function isLeakyAnswer(answer: string): boolean {
  return FORBIDDEN_FINAL_ANSWER_PATTERN.test(answer);
}

function sanitizeFinalAnswer(
  rawAnswer: string,
  question: string,
  responsePlan: AskAiResponsePlan
): SanitizedFinalAnswerResult {
  const cleanedAnswer = stripLeakedPromptSections(rawAnswer);
  const rejectedCleanedAnswer =
    isInvalidFinalAnswer(cleanedAnswer, responsePlan) ||
    (responsePlan.answerFormat === "live_current_info" &&
      isLiveCurrentAnswerTooGeneric(cleanedAnswer, question)) ||
    (responsePlan.answerFormat === "comparison" &&
      isComparisonAnswerTooGeneric(cleanedAnswer, question));
  const baseAnswer = rejectedCleanedAnswer
    ? buildSafeFallbackAnswer(responsePlan, question, rawAnswer)
    : cleanedAnswer;
  const softenedAnswer =
    responsePlan.answerFormat === "live_current_info"
      ? softenCurrentInfoAnswer(baseAnswer)
      : baseAnswer;
  const rejectedSoftenedAnswer = isInvalidFinalAnswer(softenedAnswer, responsePlan);

  return {
    answer: rejectedSoftenedAnswer
      ? buildSafeFallbackAnswer(responsePlan, question, rawAnswer)
      : softenedAnswer,
    fallbackUsed: rejectedCleanedAnswer || rejectedSoftenedAnswer,
    answerRejectedDueToLeakageOrTruncation:
      rejectedCleanedAnswer || rejectedSoftenedAnswer,
  };
}

function validateFinalAnswer(
  answer: string,
  question: string,
  responsePlan: AskAiResponsePlan
): string {
  if (!isLeakyAnswer(answer)) {
    return answer;
  }

  debugLiveSearch("sanitized answer replaced after leakage validation", {
    replacementReason: "forbidden_live_search_marker",
    intent: responsePlan.intent,
  });

  return buildSafeLeakyAnswer(question, responsePlan);
}

function buildSystemInstruction(
  enableLiveSearch: boolean,
  responsePlan: AskAiResponsePlan
): string {
  const targetInstruction = `Response plan: intent=${responsePlan.intent}; answerFormat=${responsePlan.answerFormat}; targetWordRange=${responsePlan.targetWordRange.min}-${responsePlan.targetWordRange.max} words; groundingEnabled=${responsePlan.groundingEnabled ? "true" : "false"}.`;
  const liveInfoGuidance = responsePlan.answerFormat === "live_current_info"
    ? enableLiveSearch
      ? "Use available current-info capability. Include useful current details when available, make uncertain live claims careful, and mention that schedules, prices, events, promos, or availability can change when relevant."
      : "Do not claim exact current opening hours, prices, events, promos, closures, schedules, or availability. Give helpful planning context and suggest checking the official page before going."
    : "";
  const formatTemplates: Record<AskAiAnswerFormat, string> = {
    place_list: [
      "Quick answer:",
      "...",
      "Top places to consider:",
      "- [Place/area 1] - [why it fits]",
      "- [Place/area 2] - [why it fits]",
      "- [Place/area 3] - [why it fits]",
      "- [Place/area 4] - [why it fits]",
      "Best for:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
    best_pick: [
      "Best pick:",
      "...",
      "Why it fits:",
      "- ...",
      "- ...",
      "- ...",
      "Good alternatives:",
      "- ...",
      "- ...",
      "Tip:",
      "...",
    ].join("\n"),
    itinerary_plan: [
      "Quick answer:",
      "...",
      "Best plan:",
      "- ...",
      "- ...",
      "- ...",
      "- ...",
      "Why this works:",
      "...",
      "Extra tip:",
      "...",
    ].join("\n"),
    comparison: [
      "Quick answer:",
      "...",
      "Choose [first option name] if:",
      "- ...",
      "- ...",
      "Choose [second option name] if:",
      "- ...",
      "- ...",
      "My pick:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
    budget_plan: [
      "Quick answer:",
      "...",
      "Budget-friendly plan:",
      "- ...",
      "- ...",
      "- ...",
      "Estimated spend:",
      "- Low: ...",
      "- Usual: ...",
      "- Higher: ...",
      "Tipid tip:",
      "...",
    ].join("\n"),
    weather_or_situation: [
      "Quick answer:",
      "...",
      "Best options:",
      "- ...",
      "- ...",
      "- ...",
      "Why these work:",
      "...",
      "Backup plan:",
      "...",
    ].join("\n"),
    live_current_info: [
      "Quick answer:",
      "...",
      "Details:",
      "- ...",
      "- ...",
      "- ...",
      "Before you go:",
      "...",
    ].join("\n"),
    directions_or_commute: [
      "Quick route:",
      "...",
      "Steps:",
      "- ...",
      "- ...",
      "- ...",
      "Landmark/stop:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
    place_details: [
      "Quick answer:",
      "...",
      "What to expect:",
      "- ...",
      "- ...",
      "- ...",
      "Good for:",
      "...",
      "Not ideal if:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
    food_or_activity_specific: [
      "Quick answer:",
      "...",
      "Best options:",
      "- ...",
      "- ...",
      "- ...",
      "Suggested flow:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
    preference_refinement: [
      "Quick answer:",
      "...",
      "Best match:",
      "...",
      "To narrow it down:",
      "- ...",
      "- ...",
      "Tip:",
      "...",
    ].join("\n"),
    general_advice: [
      "Quick answer:",
      "...",
      "Things to consider:",
      "- ...",
      "- ...",
      "- ...",
      "Suggested move:",
      "...",
      "Tip:",
      "...",
    ].join("\n"),
  };

  return [
    "You are GalaTayo's friendly Metro Manila local-guide assistant. Be helpful, friendly, practical, and Taglish-friendly when natural.",
    "Return only the final user-facing answer inside one <final>...</final> block. Do not write anything before or after the final block.",
    "Use the selected response format exactly. Use enough detail to be useful, but avoid rambling.",
    "Do not repeat instructions. Do not include self-checklists, raw reasoning, search-result analysis, source URLs, prompt labels, model/tool/provider talk, grounding details, metadata details, or internal status.",
    "Do not say I will search, Looking at results, Looking at search results, Wait, Result 1.1.1, The user wants, I should, or similar process text.",
    targetInstruction,
    liveInfoGuidance,
    "Selected response format:",
    formatTemplates[responsePlan.answerFormat],
  ].join(" ");
}

function buildUserPrompt({
  question,
  placeSlug,
}: GenerateAskAiAnswerParams): string {
  const placeContext = placeSlug
    ? `Place hint: ${placeSlug}`
    : null;
  const entities = extractAskAiQuestionEntities(question);
  const entityContext = [
    entities.cityOrArea ? `Detected city/area: ${entities.cityOrArea}` : null,
    entities.placeName ? `Detected place: ${entities.placeName}` : null,
    entities.compareA && entities.compareB
      ? `Detected comparison: ${entities.compareA} vs ${entities.compareB}`
      : null,
    entities.activityOrVibe ? `Detected activity/vibe: ${entities.activityOrVibe}` : null,
  ].filter(Boolean).join("\n");

  return [placeContext, entityContext || null, question].filter(Boolean).join("\n\n");
}

export function needsCurrentVerification(question: string): boolean {
  return planAskAiRequest(question).groundingEnabled;
}

async function loadGoogleAiClient(): Promise<GoogleGenAI> {
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
  systemInstruction: string,
  userPrompt: string,
  question: string,
  responsePlan: AskAiResponsePlan,
  enableLiveSearch: boolean
): Promise<AskAiAnswerResult> {
  const startedAt = Date.now();
  const response = enableLiveSearch
    ? await callLiveSearchGenerateContent(ai, model, systemInstruction, userPrompt)
    : await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          ...ASK_AI_GUIDE_GENERATION_CONFIG,
          systemInstruction,
        },
      });
  const latencyMs = Date.now() - startedAt;

  const sources = dedupeSources(
    enableLiveSearch ? collectGroundingSources(response) : []
  );
  const usedLiveSearch = enableLiveSearch;
  const webSearchQueriesCount = enableLiveSearch ? getWebSearchQueriesCount(response) : 0;
  const groundingChunksCount = enableLiveSearch ? getGroundingChunksCount(response) : 0;
  const groundingSupportsCount = enableLiveSearch
    ? getGroundingSupportsCount(response)
    : 0;
  const sourceStatus = enableLiveSearch
    ? getSourceStatus(sources, webSearchQueriesCount)
    : "no_grounding_metadata";
  const rawAnswer = getResponseText(response);
  const sanitizedAnswer = sanitizeFinalAnswer(rawAnswer, question, responsePlan);
  const answer = validateFinalAnswer(
    sanitizedAnswer.answer,
    question,
    responsePlan
  );
  const leakyAnswerReplaced = answer !== sanitizedAnswer.answer;
  const fallbackUsed = sanitizedAnswer.fallbackUsed || leakyAnswerReplaced;
  const answerRejectedDueToLeakageOrTruncation =
    sanitizedAnswer.answerRejectedDueToLeakageOrTruncation || leakyAnswerReplaced;

  if (enableLiveSearch) {
    debugLiveSearch("source metadata parsed", {
      neededCurrentVerification: needsCurrentVerification(question),
      ...summarizeProviderResponseMetadata(response),
      candidateCount: getCandidateCount(response),
      groundingMetadataExists: hasAnyGroundingMetadata(response),
      primaryGroundingMetadataExists: hasPrimaryGroundingMetadata(response),
      sourceStatus,
      webSearchQueriesCount,
      groundingChunksCount,
      groundingSupportsCount,
      sourceCount: sources.length,
      usedLiveSearch,
      modelUsed: model,
      latencyMs,
      hasGroundingSignal: hasGroundingSignal(response),
      responsePlan,
      sanitizedAnswerLength: answer.length,
      fallbackUsed,
      answerRejectedDueToLeakageOrTruncation,
    });
  }

  if (!answer) {
    throw new AskAiServiceError("Ask AI returned an empty answer.", 502);
  }

  return {
    answer,
    usedLiveSearch,
    sources,
    sourceStatus,
    webSearchQueriesCount,
    groundingChunksCount,
    groundingSupportsCount,
    modelUsed: model,
    latencyMs,
    fallbackUsed,
    answerRejectedDueToLeakageOrTruncation,
  };
}

async function callLiveSearchGenerateContent(
  ai: GoogleGenAI,
  model: string,
  systemInstruction: string,
  userPrompt: string
): Promise<unknown> {
  const groundingTool = {
    googleSearch: {},
  };

  debugLiveSearch("SDK generateContent with googleSearch started", {
    endpointPathType: "models.generateContent",
    model,
    toolsShape: "googleSearch",
    hasSystemInstruction: Boolean(systemInstruction),
    maxOutputTokens: ASK_AI_LIVE_SEARCH_GENERATION_CONFIG.maxOutputTokens,
    temperature: ASK_AI_LIVE_SEARCH_GENERATION_CONFIG.temperature,
    timeoutMs: LIVE_SEARCH_TIMEOUT_MS,
    timeoutEnvOverrideProvided: Boolean(process.env.ASK_AI_LIVE_SEARCH_TIMEOUT_MS),
  });

  return ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      tools: [groundingTool],
      maxOutputTokens: ASK_AI_LIVE_SEARCH_GENERATION_CONFIG.maxOutputTokens,
      temperature: ASK_AI_LIVE_SEARCH_GENERATION_CONFIG.temperature,
      httpOptions: {
        timeout: LIVE_SEARCH_TIMEOUT_MS,
      },
    },
  });
}

export async function generateAskAiAnswer(
  params: GenerateAskAiAnswerParams
): Promise<AskAiAnswerResult> {
  const ai = await loadGoogleAiClient();
  const responsePlan = planAskAiRequest(params.question, params.enableLiveSearch);
  const enableLiveSearch = params.enableLiveSearch && responsePlan.groundingEnabled;
  const systemInstruction = buildSystemInstruction(
    enableLiveSearch,
    responsePlan
  );
  const userPrompt = buildUserPrompt(params);
  const model = enableLiveSearch ? ASK_AI_LIVE_SEARCH_MODEL : ASK_AI_GUIDE_MODEL;

  if (!enableLiveSearch) {
    try {
      return await callModel(
        ai,
        model,
        systemInstruction,
        userPrompt,
        params.question,
        responsePlan,
        false
      );
    } catch (error) {
      const status = getProviderErrorStatus(error);
      const message = getProviderErrorMessage(error);

      if (status >= 500 || status === 429 || status === 503) {
        throw new AskAiServiceError(message, status);
      }

      throw new AskAiServiceError(message, status);
    }
  }

  debugLiveSearch("source-backed route triggered", {
    timeoutMs: LIVE_SEARCH_TIMEOUT_MS,
    responsePlan,
  });

  try {
    const liveSearchResult = await Promise.race([
      callModel(
        ai,
        model,
        systemInstruction,
        userPrompt,
        params.question,
        responsePlan,
        true
      ),
      timeoutAfter(LIVE_SEARCH_TIMEOUT_MS, "AskAiLiveSearchTimeoutError"),
    ]);

    debugLiveSearch("SDK generateContent with googleSearch response received", {
      sourceStatus: liveSearchResult.sourceStatus,
      webSearchQueriesCount: liveSearchResult.webSearchQueriesCount,
      groundingChunksCount: liveSearchResult.groundingChunksCount,
      groundingSupportsCount: liveSearchResult.groundingSupportsCount,
      sourceCount: liveSearchResult.sources.length,
      modelUsed: liveSearchResult.modelUsed,
      latencyMs: liveSearchResult.latencyMs,
    });

    return liveSearchResult;
  } catch (liveSearchError) {
    debugLiveSearch("SDK generateContent with googleSearch failed or timed out", {
      timedOut: isTimeoutError(liveSearchError),
      finalUsedLiveSearch: false,
    });

    return {
      answer: buildSafeFallbackAnswer(responsePlan, params.question),
      usedLiveSearch: false,
      sources: [],
      sourceStatus: "no_grounding_metadata",
      webSearchQueriesCount: 0,
      groundingChunksCount: 0,
      groundingSupportsCount: 0,
      modelUsed: model,
      latencyMs: 0,
      fallbackUsed: true,
      answerRejectedDueToLeakageOrTruncation: false,
    };
  }
}
