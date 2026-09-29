import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";
import { buildAbortSignal, throwIfAskAiRequestCancelled } from "../utils/askAiCancellation";

export type NormalizedAskAiMapQuery = {
  isMapIntent: boolean;
  shouldUseNormalizedQuery: boolean;
  coreSearchQuery: string;
  location: string | null;
  placeTypes: string[];
  budgetIntent: "free" | "low_cost" | "free_or_low_cost" | "normal" | "unknown";
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  budgetPerPerson?: boolean;
  dealType?: string | null;
  foodIntent?: string | null;
  userPreference: string | null;
  fallbackQueries: string[];
};

type GroqMessage = {
  role: "system" | "user";
  content: string;
};

type ParsedNormalizerResponse = Partial<NormalizedAskAiMapQuery> & {
  coreSearchQuery?: unknown;
  location?: unknown;
  placeTypes?: unknown;
  budgetIntent?: unknown;
  budgetAmount?: unknown;
  budgetCurrency?: unknown;
  budgetPerPerson?: unknown;
  dealType?: unknown;
  foodIntent?: unknown;
  userPreference?: unknown;
  fallbackQueries?: unknown;
  isMapIntent?: unknown;
  shouldUseNormalizedQuery?: unknown;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_TIMEOUT_MS = Number(process.env.ASK_AI_MAP_NORMALIZER_TIMEOUT_MS || 8000);
const GROQ_MAX_TOKENS = Number(process.env.ASK_AI_MAP_NORMALIZER_MAX_TOKENS || 220);

function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripAccents(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNormalizedWords(value: string): string[] {
  return normalizeKey(value).split(" ").filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(insertion, deletion, substitution));
    }
    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function maxAllowedDistance(term: string): number {
  if (term.length <= 3) return 1;
  if (term.length <= 5) return 1;
  if (term.length <= 7) return 2;
  return 3;
}

function tokenLooksLike(term: string, candidate: string): boolean {
  const normalizedTerm = normalizeKey(term);
  const normalizedCandidate = normalizeKey(candidate);
  if (!normalizedTerm || !normalizedCandidate) return false;
  if (normalizedTerm === normalizedCandidate) return true;

  return levenshteinDistance(normalizedTerm, normalizedCandidate) <= maxAllowedDistance(normalizedCandidate);
}

function phraseLooksLike(text: string, phrase: string): boolean {
  const words = splitNormalizedWords(text);
  const phraseWords = splitNormalizedWords(phrase);
  if (words.length === 0 || phraseWords.length === 0) return false;

  if (phraseWords.length === 1) {
    return words.some((word) => tokenLooksLike(word, phraseWords[0]));
  }

  const windowSize = phraseWords.length;
  for (let i = 0; i <= words.length - windowSize; i += 1) {
    const window = words.slice(i, i + windowSize).join(" ");
    if (tokenLooksLike(window, phraseWords.join(" "))) {
      return true;
    }
  }

  return false;
}

function uniqueStrings(values: unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = normalizeText(typeof value === "string" ? value : "");
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function parseJsonObject<T>(value: string): T | null {
  const cleaned = value.replace(/^```json/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}

function normalizeBudgetIntent(value: unknown): NormalizedAskAiMapQuery["budgetIntent"] {
  if (
    value === "free" ||
    value === "low_cost" ||
    value === "free_or_low_cost" ||
    value === "normal" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function detectBudgetIntent(text: string): NormalizedAskAiMapQuery["budgetIntent"] {
  const normalized = normalizeKey(text);
  if (!normalized) return "unknown";

  if (
    phraseLooksLike(normalized, "walang pera") ||
    phraseLooksLike(normalized, "wlang pera") ||
    phraseLooksLike(normalized, "free") ||
    phraseLooksLike(normalized, "libre")
  ) {
    return "free_or_low_cost";
  }

  if (
    phraseLooksLike(normalized, "mura") ||
    phraseLooksLike(normalized, "murang") ||
    phraseLooksLike(normalized, "mra") ||
    phraseLooksLike(normalized, "tipid") ||
    phraseLooksLike(normalized, "budget") ||
    phraseLooksLike(normalized, "di mahal") ||
    phraseLooksLike(normalized, "hindi mahal") ||
    phraseLooksLike(normalized, "affordable") ||
    phraseLooksLike(normalized, "cheap")
  ) {
    return "low_cost";
  }

  return "unknown";
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeBudgetAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function detectBudgetAmount(text: string): number | null {
  const normalized = normalizeKey(text);
  const match = normalized.match(/(?:php|pesos?|peso)?\s*(\d{2,4})(?:\s*(?:per\s*head|per\s*person|per\s*tao))?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function detectLocationAlias(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  const patterns: Array<[RegExp, string]> = [
    [/\b(bicutan|bcutan|sa bicutan|near bicutan)\b/i, "Bicutan, Para�aque, Philippines"],
    [/\b(tagytay|tagayty|tagaytay)\b/i, "Tagaytay, Cavite, Philippines"],
    [/\b(cavte|cavit|cavite)\b/i, "Cavite, Philippines"],
    [/\b(pque|paranaque|para naque|sa paranaque|dito sa paranaque|near paranaque|near para naque)\b/i, "Para�aque, Metro Manila, Philippines"],
  ];

  for (const [pattern, canonical] of patterns) {
    if (pattern.test(normalized)) return canonical;
  }

  if (phraseLooksLike(normalized, "paranaque") || phraseLooksLike(normalized, "pque")) {
    return "Para�aque, Metro Manila, Philippines";
  }
  if (phraseLooksLike(normalized, "cavite") || phraseLooksLike(normalized, "cavte")) {
    return "Cavite, Philippines";
  }
  if (phraseLooksLike(normalized, "tagaytay") || phraseLooksLike(normalized, "tagytay")) {
    return "Tagaytay, Cavite, Philippines";
  }
  if (phraseLooksLike(normalized, "bicutan") || phraseLooksLike(normalized, "bcutan")) {
    return "Bicutan, Para�aque, Philippines";
  }

  return null;
}

function detectFoodIntent(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;
  if (
    phraseLooksLike(normalized, "unli wings") ||
    phraseLooksLike(normalized, "unlimited wings") ||
    phraseLooksLike(normalized, "unlimited chicken wings") ||
    phraseLooksLike(normalized, "all you can eat wings") ||
    phraseLooksLike(normalized, "ayce wings") ||
    phraseLooksLike(normalized, "wngs") ||
    phraseLooksLike(normalized, "wings")
  ) {
    return "chicken wings";
  }
  return null;
}

function detectDealType(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;
  if (/\b(unli|unlimited|all you can eat|ayce)\b/i.test(normalized)) return "unlimited";
  return null;
}

function detectUserPreference(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  const preferences: string[] = [];
  if (phraseLooksLike(normalized, "aesthetic")) preferences.push("aesthetic");
  if (phraseLooksLike(normalized, "date")) preferences.push("date");
  if (phraseLooksLike(normalized, "chill") || phraseLooksLike(normalized, "tambay") || phraseLooksLike(normalized, "hangout") || phraseLooksLike(normalized, "hang out")) preferences.push("chill");
  if (phraseLooksLike(normalized, "family friendly") || phraseLooksLike(normalized, "family")) preferences.push("family-friendly");
  if (/\b(highly rated|well rated|mataas rating|maganda rating|maraming reviews?|many reviews?|still highly rated)\b/i.test(normalized)) preferences.push("highly-rated");
  if (/\b(walkable|walking distance|lakarin|kayang lakarin|short walk|nearby|malapit)\b/i.test(normalized)) preferences.push("walkable");
  if (/\b(sulit|worth it|value for money)\b/i.test(normalized)) preferences.push("sulit");
  return preferences.length > 0 ? uniqueStrings(preferences, 5).join(", ") : null;
}

function detectPlaceType(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  if (phraseLooksLike(normalized, "mall")) return "mall";
  if (phraseLooksLike(normalized, "cafe") || phraseLooksLike(normalized, "coffee")) return "cafe";
  if (phraseLooksLike(normalized, "park") || phraseLooksLike(normalized, "garden")) return "park";
  if (phraseLooksLike(normalized, "resto")) return "restaurant";
  if (phraseLooksLike(normalized, "restaurant") || phraseLooksLike(normalized, "food") || phraseLooksLike(normalized, "kainan") || phraseLooksLike(normalized, "eatery")) return "restaurant";
  if (phraseLooksLike(normalized, "buffet")) return "buffet restaurant";
  if (phraseLooksLike(normalized, "wngs") || phraseLooksLike(normalized, "wings")) return "chicken wings restaurant";
  return null;
}

function buildNormalizationHints(rawPrompt: string) {
  const location = detectLocationAlias(rawPrompt);
  const foodIntent = detectFoodIntent(rawPrompt);
  const dealType = detectDealType(rawPrompt);
  const placeType = detectPlaceType(rawPrompt);
  const budgetIntent = detectBudgetIntent(rawPrompt);
  const budgetAmount = detectBudgetAmount(rawPrompt);
  const userPreference = detectUserPreference(rawPrompt);

  return {
    location,
    foodIntent,
    dealType,
    placeType,
    budgetIntent,
    budgetAmount,
    userPreference,
  };
}

function buildCoreSearchQuery(args: {
  rawPrompt: string;
  parsedCoreSearchQuery: string;
  location: string | null;
  placeTypes: string[];
  foodIntent: string | null;
  dealType: string | null;
}): string {
  const rawLocation = args.location ?? detectLocationAlias(args.rawPrompt);
  const location = rawLocation ? normalizeText(rawLocation) : null;
  const parsedCore = normalizeText(args.parsedCoreSearchQuery);
  const placeType = args.placeTypes[0] ?? detectPlaceType(args.rawPrompt);

  if (foodIntentMatch(args.rawPrompt)) {
    const prefix = args.dealType === "unlimited" ? "unlimited " : "";
    return location
      ? `${prefix}chicken wings restaurants in ${location}`
      : `${prefix}chicken wings restaurants`;
  }

  if (!parsedCore && placeType && location) {
    return `${placeType}s in ${location}`;
  }

  if (!parsedCore) {
    return location ? `places in ${location}` : "";
  }

  if (!location) {
    return parsedCore;
  }

  const normalizedCore = normalizeKey(parsedCore);
  const normalizedLocation = normalizeKey(location);
  if (normalizedCore.includes(normalizedLocation)) return parsedCore;

  const locationNeutralCore = parsedCore
    .replace(/\s+(?:in|sa|near|around|within|at)\s+[^,]+(?:,\s*[^,]+)*$/i, "")
    .trim();
  if (locationNeutralCore && locationNeutralCore !== parsedCore) {
    return `${locationNeutralCore} in ${location}`;
  }

  return `${parsedCore} in ${location}`;
}

function foodIntentMatch(text: string): boolean {
  return detectFoodIntent(text) === "chicken wings";
}

function buildFallbackQueries(args: {
  location: string | null;
  placeTypes: string[];
  foodIntent: string | null;
  dealType: string | null;
  coreSearchQuery: string;
}): string[] {
  const location = args.location ? normalizeText(args.location) : null;
  const cityOnly = location ? location.split(",")[0] : null;

  if (args.foodIntent === "chicken wings" && cityOnly) {
    return uniqueStrings(
      [
        `unli wings ${cityOnly}`,
        `chicken wings restaurants in ${cityOnly}`,
        `restaurants in ${cityOnly}`,
      ],
      3
    );
  }

  if (location) {
    const placeType = args.placeTypes[0] ?? "places";
    return uniqueStrings(
      [
        `${placeType} in ${location}`,
        `popular ${placeType} in ${location}`,
        `restaurants in ${location}`,
      ],
      3
    );
  }

  return uniqueStrings([args.coreSearchQuery], 3);
}

function buildHintsForPrompt(rawPrompt: string): string {
  const hints = buildNormalizationHints(rawPrompt);
  const parts = [
    hints.location ? `location alias => ${hints.location}` : null,
    hints.foodIntent ? `food intent => ${hints.foodIntent}` : null,
    hints.dealType ? `deal type => ${hints.dealType}` : null,
    hints.placeType ? `place type => ${hints.placeType}` : null,
    hints.budgetIntent !== "unknown" ? `budget intent => ${hints.budgetIntent}` : null,
    typeof hints.budgetAmount === "number" ? `budget amount => ${hints.budgetAmount}` : null,
    hints.userPreference ? `preference => ${hints.userPreference}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join("; ") : "none";
}

function postProcessResponse(rawPrompt: string, parsed: ParsedNormalizerResponse | null): NormalizedAskAiMapQuery {
  const localHints = buildNormalizationHints(rawPrompt);
  const parsedLocation = normalizeText(typeof parsed?.location === "string" ? parsed.location : "");
  const detectedLocation = parsedLocation || localHints.location || detectLocationAlias(rawPrompt);
  const parsedCoreSearchQuery = normalizeText(
    typeof parsed?.coreSearchQuery === "string" ? parsed.coreSearchQuery : ""
  );
  const placeTypes = uniqueStrings(Array.isArray(parsed?.placeTypes) ? parsed.placeTypes : [], 6);
  const detectedFoodIntent =
    typeof parsed?.foodIntent === "string" && parsed.foodIntent.trim()
      ? parsed.foodIntent.trim()
      : localHints.foodIntent || detectFoodIntent(rawPrompt);
  const detectedDealType =
    typeof parsed?.dealType === "string" && parsed.dealType.trim()
      ? parsed.dealType.trim()
      : localHints.dealType || detectDealType(rawPrompt);
  const budgetAmount =
    normalizeBudgetAmount(parsed?.budgetAmount) ?? 
    localHints.budgetAmount ??
    detectBudgetAmount(rawPrompt) ??
    detectBudgetAmount(detectedLocation ?? "") ??
    null;
  const coreSearchQuery = buildCoreSearchQuery({
    rawPrompt,
    parsedCoreSearchQuery,
    location: detectedLocation,
    placeTypes,
    foodIntent: detectedFoodIntent,
    dealType: detectedDealType,
  });
  const normalizedPlaceTypes =
      detectedFoodIntent === "chicken wings"
        ? uniqueStrings(
          [
            "restaurant",
            "chicken wings restaurant",
            "buffet restaurant",
            ...placeTypes,
          ],
          6
        )
      : uniqueStrings(
          [
            ...(localHints.placeType ? [localHints.placeType] : []),
            ...placeTypes,
          ],
          6
        );
  const fallbackQueries = buildFallbackQueries({
    location: detectedLocation,
    placeTypes: normalizedPlaceTypes,
    foodIntent: detectedFoodIntent,
    dealType: detectedDealType,
    coreSearchQuery,
  });

  return {
    isMapIntent: parsed?.isMapIntent === false ? false : true,
    shouldUseNormalizedQuery: parsed?.shouldUseNormalizedQuery === false ? false : Boolean(coreSearchQuery),
    coreSearchQuery,
    location: detectedLocation,
    placeTypes:
      normalizedPlaceTypes.length > 0
        ? normalizedPlaceTypes
        : uniqueStrings([detectPlaceType(rawPrompt) ?? "place"], 2),
    budgetIntent: normalizeBudgetIntent(parsed?.budgetIntent) === "unknown"
      ? localHints.budgetIntent
      : normalizeBudgetIntent(parsed?.budgetIntent),
    budgetAmount,
    budgetCurrency:
      typeof parsed?.budgetCurrency === "string" && parsed.budgetCurrency.trim()
        ? parsed.budgetCurrency.trim()
        : budgetAmount !== null
          ? "PHP"
          : null,
    budgetPerPerson:
      normalizeOptionalBoolean(parsed?.budgetPerPerson) ??
      /\b(per\s*person|per\s*tao|per\s*head)\b/i.test(rawPrompt),
    dealType: detectedDealType,
    foodIntent: detectedFoodIntent,
    userPreference:
      typeof parsed?.userPreference === "string" && parsed.userPreference.trim()
        ? parsed.userPreference.trim()
        : localHints.userPreference ?? null,
    fallbackQueries,
  };
}

async function resolveGroqApiKey(): Promise<string> {
  const envApiKey = normalizeText(process.env.GROQ_API_KEY);
  if (envApiKey) return envApiKey;

  const secretValue = normalizeText(await getSecret(KEY_VAULT_SECRET_NAMES.GROQ_API_KEY));
  if (secretValue) return secretValue;

  throw new Error("Missing Groq API key.");
}

function buildNormalizerPrompt(rawPrompt: string): string {
  const hints = buildHintsForPrompt(rawPrompt);
  return [
    "You are the GalaTayo Ask AI Map query normalizer.",
    "Return strict JSON only.",
    "Do not answer the user.",
    "Extract a short Google Maps-style query and keep budget/personal preference separate.",
    "Correct only obvious typos, aliases, and slang when the intent is clear.",
    "Do not overcorrect unknown words or invent new meaning.",
    "For location aliases, normalize these variants:",
    "- pque / paranaque / para�aque -> Para�aque, Metro Manila, Philippines",
    "- cavte / cavit / cavite -> Cavite, Philippines",
    "- tagytay / tagayty / tagaytay -> Tagaytay, Cavite, Philippines",
    "- bicutan / bcutan -> Bicutan, Para�aque, Philippines",
    "For food aliases, normalize these variants:",
    "- wngs / wings / unli wings -> chicken wings / unlimited chicken wings",
    "For budget aliases, normalize these variants:",
    "- mura / murang / mra / tipid / di mahal / budget -> low_cost",
    "- wlang pera / walang pera / free / libre -> free_or_low_cost",
    "Examples of nasty-typo handling:",
    '- "unli wngs sa paranaque 500 per tao" -> coreSearchQuery about unlimited chicken wings in Para�aque and budget-aware output',
    '- "murang kainan sa cavte" -> affordable restaurants in Cavite',
    '- "resto sa pque for date na di mahal" -> affordable date restaurants in Para�aque',
    "Use the hints below only as guidance, not as hard requirements.",
    `Hints: ${hints}`,
    "JSON shape:",
    '{',
    '  "isMapIntent": true,',
    '  "shouldUseNormalizedQuery": true,',
    '  "coreSearchQuery": "string",',
    '  "location": "string or null",',
    '  "placeTypes": ["string"],',
    '  "budgetIntent": "free | low_cost | free_or_low_cost | normal | unknown",',
    '  "budgetAmount": 0,',
    '  "budgetCurrency": "PHP or null",',
    '  "budgetPerPerson": true,',
    '  "dealType": "string or null",',
    '  "foodIntent": "string or null",',
    '  "userPreference": "string or null",',
    '  "fallbackQueries": ["string"]',
    '}',
    `User prompt: ${JSON.stringify(rawPrompt)}`,
  ].join("\n");
}

function buildDefaultFallbackText(budgetIntent: NormalizedAskAiMapQuery["budgetIntent"], userPreference: string | null, location: string | null): string | null {
  const parts = [
    budgetIntent === "free_or_low_cost"
      ? "free or low-budget gala"
      : budgetIntent === "low_cost"
        ? "low-budget gala"
        : budgetIntent === "free"
          ? "free gala"
          : null,
    userPreference,
    location ? `around ${location}` : null,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(", ") : null;
}

function shouldNormalizePrompt(rawPrompt: string): boolean {
  const normalized = normalizeText(rawPrompt).toLowerCase();
  if (!normalized) return false;

  const aliasHints = buildNormalizationHints(rawPrompt);
  if (
    aliasHints.location ||
    aliasHints.foodIntent ||
    aliasHints.dealType ||
    aliasHints.placeType ||
    aliasHints.userPreference ||
    aliasHints.budgetIntent !== "unknown" ||
    aliasHints.budgetAmount !== null
  ) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasPreferenceWords = /\b(walang pera|free|libre|no budget|mura|cheap|budget|tipid|affordable|aesthetic|date|tambay|chill|student|students|budget-friendly|di mahal|hindi mahal)\b/i.test(normalized);
  const hasTagalogMarkers = /\b(sa|saan|pwedeng|pwede|kahit|tambayan|gala|puntahan|lang|pero|di|hindi|okay|ok|aircon|kainan)\b/i.test(normalized);
  const shortSimpleEnglish = wordCount <= 5 && /^(malls?|restaurants?|parks?|cafes?|cafe|hotels?|resorts?|museums?|tourist spots?|attractions?)\b/i.test(normalized) && /\b(in|near|nearby|at)\b/i.test(normalized) && !hasPreferenceWords && !hasTagalogMarkers;

  if (shortSimpleEnglish) return false;
  if (hasPreferenceWords || hasTagalogMarkers) return true;
  return wordCount > 6 || normalized.length > 40;
}

export function shouldNormalizeAskAiMapPrompt(_rawPrompt: string): boolean {
  return true;
}

export async function normalizeAskAiMapQuery(
  rawPrompt: string,
  signal?: AbortSignal
): Promise<NormalizedAskAiMapQuery> {
  const cleanedPrompt = normalizeText(rawPrompt);
  if (!cleanedPrompt) {
    return {
      isMapIntent: false,
      shouldUseNormalizedQuery: false,
      coreSearchQuery: "",
      location: null,
      placeTypes: [],
      budgetIntent: "unknown",
      userPreference: null,
      fallbackQueries: [],
    };
  }

  const apiKey = await resolveGroqApiKey();
  throwIfAskAiRequestCancelled(signal);
  const abortSignal = buildAbortSignal([AbortSignal.timeout(GROQ_TIMEOUT_MS), signal]);
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "Return strict JSON only. No markdown. No prose. No code fences." },
        { role: "user", content: buildNormalizerPrompt(cleanedPrompt) },
      ] satisfies GroqMessage[],
      temperature: 0,
      max_completion_tokens: GROQ_MAX_TOKENS,
      stream: false,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Groq normalizer request failed with status ${response.status}.`);
  }

  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const answer = normalizeText(data?.choices?.[0]?.message?.content ?? "");

  if (!answer) {
    throw new Error("Groq normalizer returned an empty response.");
  }

  const parsed = parseJsonObject<ParsedNormalizerResponse>(answer);
  const normalized = postProcessResponse(cleanedPrompt, parsed);
  const defaultFallbackText = buildDefaultFallbackText(normalized.budgetIntent, normalized.userPreference, normalized.location);

  return {
    ...normalized,
    fallbackQueries:
      normalized.fallbackQueries.length > 0
        ? normalized.fallbackQueries.slice(0, 3)
        : defaultFallbackText
          ? uniqueStrings(
              [
                normalized.coreSearchQuery ? `${normalized.coreSearchQuery} ${defaultFallbackText}` : "",
                normalized.location ? `${normalized.coreSearchQuery} near ${normalized.location}` : "",
              ],
              3
            )
          : normalized.fallbackQueries,
  };
}
