import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import {
  ASK_AI_GUIDE_GENERATION_CONFIG,
  ASK_AI_GUIDE_FALLBACK_MODEL,
  ASK_AI_GUIDE_MODEL,
} from "../config/askAiConfig";

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
    config: ASK_AI_GUIDE_GENERATION_CONFIG,
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

export async function generateGeminiResponse({
  prompt,
}: GenerateGeminiResponseParams): Promise<string> {
  let apiKey: string;

  try {
    apiKey = await getSecret("gemini-api-key");
  } catch (error) {
    throw new GeminiServiceError(
      error instanceof Error ? error.message : "Failed to retrieve Gemini API key.",
      500
    );
  }

  if (!apiKey) {
    throw new GeminiServiceError("Gemini API key is missing.", 500);
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  try {
    return await generateContentText(ai, ASK_AI_GUIDE_MODEL, prompt);
  } catch {
    try {
      return await generateContentText(ai, ASK_AI_GUIDE_FALLBACK_MODEL, prompt);
    } catch (fallbackError) {
      const status = getGeminiErrorStatus(fallbackError);
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : "Gemini API request failed.";

      throw new GeminiServiceError(message, status);
    }
  }
}
