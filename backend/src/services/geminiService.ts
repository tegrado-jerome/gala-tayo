import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-pro";
const GEMINI_GENERATION_CONFIG = {
  maxOutputTokens: 2400,
  temperature: 0.7,
};

export class GeminiServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "GeminiServiceError";
    this.status = status;
  }
}

type GenerateGeminiResponseParams = {
  prompt: string;
};

async function generateContentText(
  ai: GoogleGenAI,
  model: string,
  prompt: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...GEMINI_GENERATION_CONFIG,
      abortSignal: AbortSignal.timeout(25000),
    },
  });

  const text = response.text;

  if (!text) {
    throw new GeminiServiceError("Gemini returned an empty response.", 502);
  }

  return text;
}

function getGeminiErrorStatus(error: unknown): number {
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

function normalizeApiKey(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveGeminiApiKey(): Promise<string> {
  const envApiKey =
    normalizeApiKey(process.env.GEMINI_API_KEY) ||
    normalizeApiKey(process.env.GOOGLE_API_KEY) ||
    normalizeApiKey(process.env.GOOGLE_GENAI_API_KEY);

  if (envApiKey) {
    return envApiKey;
  }

  const secretNames = ["gemini-api-key", "gemini_api_key"];
  let lastError: unknown = null;

  for (const secretName of secretNames) {
    try {
      const secretValue = normalizeApiKey(await getSecret(secretName));
      if (secretValue) {
        return secretValue;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const reason =
    lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new GeminiServiceError(
    `Missing Gemini API key. Checked env vars GEMINI_API_KEY/GOOGLE_API_KEY/GOOGLE_GENAI_API_KEY and Key Vault secrets gemini-api-key/gemini_api_key.${reason}`,
    500
  );
}

export async function generateGeminiResponse({
  prompt,
}: GenerateGeminiResponseParams): Promise<string> {
  const apiKey = await resolveGeminiApiKey();
  console.log("[Gemini Direct] API key resolved:", Boolean(apiKey));

  const ai = new GoogleGenAI({
    apiKey,
  });

  const modelSequence = [
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL,
  ];

  let lastError: unknown = null;

  for (const model of modelSequence) {
    try {
      return await generateContentText(ai, model, prompt);
    } catch (error) {
      lastError = error;
    }
  }

  const status = getGeminiErrorStatus(lastError);
  const message =
    lastError instanceof Error
      ? lastError.message
      : "Gemini API request failed.";

  throw new GeminiServiceError(message, status);
}
