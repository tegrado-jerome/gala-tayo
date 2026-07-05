import { getSecret } from "../config/keyVault";

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
const GROQ_MODEL = "llama-3.1-8b-instant";
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
  const match = normalized.match(/(?:₱|php|pesos?|peso)?\s*(\d{2,4})(?:\s*(?:per\s*head|per\s*person|per\s*tao))?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function detectLocationAlias(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  const patterns: Array<[RegExp, string]> = [
    [/\b(pque|paranaque|para naque|sa paranaque|dito sa paranaque|near paranaque|near para naque)\b/i, "Parañaque, Metro Manila, Philippines"],
  ];

  for (const [pattern, canonical] of patterns) {
    if (pattern.test(normalized)) return canonical;
  }

  return null;
}

function detectFoodIntent(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;
  if (/\b(unli wings|unlimited wings|unlimited chicken wings|all you can eat wings|ayce wings)\b/i.test(normalized)) return "chicken wings";
  return null;
}

function detectDealType(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;
  if (/\b(unli|unlimited|all you can eat|ayce)\b/i.test(normalized)) return "unlimited";
  return null;
}

function detectPlaceType(text: string): string | null {
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  if (/\bmall(s)?\b/i.test(normalized)) return "mall";
  if (/\bcafe(s)?\b|\bcoffee\b/i.test(normalized)) return "cafe";
  if (/\bpark(s)?\b|\bgarden(s)?\b/i.test(normalized)) return "park";
  if (/\brestaurant(s)?\b|\bfood\b|\bkainan\b|\beatery\b/i.test(normalized)) return "restaurant";
  if (/\bbuffet\b/i.test(normalized)) return "buffet restaurant";
  if (/\bwings\b/i.test(normalized)) return "chicken wings restaurant";
  return null;
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

  if (/\bin\b/i.test(parsedCore)) {
    return `${parsedCore.replace(/\s+in\s+[^,]+(?:,\s*[^,]+)*$/i, "").trim()} in ${location}`;
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

function postProcessResponse(rawPrompt: string, parsed: ParsedNormalizerResponse | null): NormalizedAskAiMapQuery {
  const parsedLocation = normalizeText(typeof parsed?.location === "string" ? parsed.location : "");
  const detectedLocation = parsedLocation || detectLocationAlias(rawPrompt);
  const parsedCoreSearchQuery = normalizeText(
    typeof parsed?.coreSearchQuery === "string" ? parsed.coreSearchQuery : ""
  );
  const placeTypes = uniqueStrings(Array.isArray(parsed?.placeTypes) ? parsed.placeTypes : [], 6);
  const detectedFoodIntent =
    typeof parsed?.foodIntent === "string" && parsed.foodIntent.trim()
      ? parsed.foodIntent.trim()
      : detectFoodIntent(rawPrompt);
  const detectedDealType =
    typeof parsed?.dealType === "string" && parsed.dealType.trim()
      ? parsed.dealType.trim()
      : detectDealType(rawPrompt);
  const budgetAmount =
    normalizeBudgetAmount(parsed?.budgetAmount) ??
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
      : placeTypes;
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
    budgetIntent: normalizeBudgetIntent(parsed?.budgetIntent),
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
        : null,
    fallbackQueries,
  };
}

async function resolveGroqApiKey(): Promise<string> {
  const envApiKey = normalizeText(process.env.GROQ_API_KEY);
  if (envApiKey) return envApiKey;

  const secretValue = normalizeText(await getSecret("groq-api-key"));
  if (secretValue) return secretValue;

  throw new Error("Missing Groq API key.");
}

function buildNormalizerPrompt(rawPrompt: string): string {
  return [
    "You are the GalaTayo Ask AI Map query normalizer.",
    "Return strict JSON only.",
    "Do not answer the user.",
    "Extract a short Google Maps-style query and keep budget/personal preference separate.",
    "For location aliases, normalize Parañaque variants to Parañaque, Metro Manila, Philippines.",
    "For unli wings or similar niche food prompts, keep the core query searchable.",
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

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasPreferenceWords = /\b(walang pera|free|libre|no budget|mura|cheap|budget|tipid|affordable|aesthetic|date|tambay|chill|student|students|budget-friendly|di mahal|hindi mahal)\b/i.test(normalized);
  const hasTagalogMarkers = /\b(sa|saan|pwedeng|pwede|kahit|tambayan|gala|puntahan|lang|pero|di|hindi|okay|ok|aircon|kainan)\b/i.test(normalized);
  const shortSimpleEnglish = wordCount <= 5 && /^(malls?|restaurants?|parks?|cafes?|cafe|hotels?|resorts?|museums?|tourist spots?|attractions?)\b/i.test(normalized) && /\b(in|near|nearby|at)\b/i.test(normalized) && !hasPreferenceWords && !hasTagalogMarkers;

  if (shortSimpleEnglish) return false;
  if (hasPreferenceWords || hasTagalogMarkers) return true;
  return wordCount > 6 || normalized.length > 40;
}

export function shouldNormalizeAskAiMapPrompt(rawPrompt: string): boolean {
  return shouldNormalizePrompt(rawPrompt);
}

export async function normalizeAskAiMapQuery(rawPrompt: string): Promise<NormalizedAskAiMapQuery> {
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
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
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
