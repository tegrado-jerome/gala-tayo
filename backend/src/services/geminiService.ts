import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";

const GEMINI_MODEL = "gemini-2.5-flash";

type GenerateGeminiResponseParams = {
  prompt: string;
};

export async function generateGeminiResponse({
  prompt,
}: GenerateGeminiResponseParams): Promise<string> {
  const apiKey = await getSecret("gemini-api-key");

  if (!apiKey) {
    throw new Error("Gemini API key is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}