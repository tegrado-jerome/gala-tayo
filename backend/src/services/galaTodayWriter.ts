import { GoogleGenAI } from "@google/genai";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";
import { generateJsonFromGroq } from "./groqChatProvider";

// Gemini (free tier) writes Gala Today; Groq is only the backup. The list can be overridden with
// GALA_TODAY_GEMINI_MODELS. Unknown or rate-limited models fall through to the next one.
// The strongest free model writes first: Flash Lite drafts kept scoring 6-7/10 on funny and purpose.
const DEFAULT_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];
const GEMINI_TIMEOUT_MS = 40_000;

function geminiModels(): string[] {
  const configured = (process.env.GALA_TODAY_GEMINI_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set(configured.length ? configured : DEFAULT_GEMINI_MODELS)];
}

async function geminiApiKey(): Promise<string | null> {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;
  return (await getSecret(KEY_VAULT_SECRET_NAMES.GEMINI_API_KEY))?.trim() || null;
}

export type WriterResult = { text: string; model: string };

/** Returns the model's raw JSON text and which model wrote it. Drafts run warm (wit); the editor pass runs cool. */
export async function writeGalaTodayDraft(
  systemPrompt: string,
  userMessage: string,
  requestId: string,
  warn: (message: string) => void,
  temperature = 0.95
): Promise<WriterResult> {
  const apiKey = await geminiApiKey().catch(() => null);
  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    for (const model of geminiModels()) {
      try {
        const response = await ai.models.generateContent({
          model: `models/${model}`,
          contents: userMessage,
          config: {
            systemInstruction: systemPrompt,
            temperature,
            maxOutputTokens: 1600,
            responseMimeType: "application/json",
            abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          },
        });
        const text = response.text?.trim();
        if (text) return { text, model };
        warn(`Gala Today: ${model} returned no text`);
      } catch (error) {
        warn(`Gala Today: ${model} failed (${error instanceof Error ? error.message.slice(0, 120) : "error"})`);
      }
    }
  }
  const text = await generateJsonFromGroq({ systemPrompt, userMessage, requestId, maxCompletionTokens: 1300 });
  return { text, model: "groq" };
}
