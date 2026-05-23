import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";

const GEMINI_MODEL = "gemini-2.5-flash";

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

  let response;

  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
  } catch (error) {
    const status = getGeminiErrorStatus(error);
    const message =
      error instanceof Error
        ? error.message
        : "Gemini API request failed.";

    throw new GeminiServiceError(message, status);
  }

  const text = response.text;

  if (!text) {
    throw new GeminiServiceError("Gemini returned an empty response.", 502);
  }

  return text;
}
