import { GoogleGenAI, ThinkingLevel } from "@google/genai";
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
// Gemini 3 models think before writing; at the default level a draft passed 40 s and was aborted.
const GEMINI_TIMEOUT_MS = 75_000;
const BUSY_RETRY_MS = 4_000;
// The free tier allows 20 requests a day per model. Once a model says its daily quota is spent, later drafts and
// editor passes in this instance skip it for an hour instead of paying a failed call plus a retry each time.
const QUOTA_SKIP_MS = 3_600_000;
const quotaSpentUntil = new Map<string, number>();

/**
 * Medium thinking: at low, drafts kept slipping in claims the facts don't make ("Michelin-starred", museum
 * dinosaurs) and the editor scored them accuracy 10. 2.5 models take a token budget instead.
 */
function thinkingFor(model: string) {
  return model.startsWith("gemini-2.5") ? { thinkingBudget: 1024 } : { thinkingLevel: ThinkingLevel.MEDIUM };
}

/** "High demand" (503) and rate limits (429) are usually brief, so the model gets one more try. */
function isBusy(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /(503|429)|high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(text);
}

/** True when the error is a spent daily quota (not a brief rate limit). */
export function isDailyQuotaSpent(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /PerDay/i.test(text) && /RESOURCE_EXHAUSTED|429/.test(text);
}

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
      if ((quotaSpentUntil.get(model) ?? 0) > Date.now()) continue;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await ai.models.generateContent({
            model: `models/${model}`,
            contents: userMessage,
            config: {
              systemInstruction: systemPrompt,
              temperature,
              maxOutputTokens: 4096,
              thinkingConfig: thinkingFor(model),
              responseMimeType: "application/json",
              abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
            },
          });
          const text = response.text?.trim();
          if (text) return { text, model };
          warn(`Gala Today: ${model} returned no text`);
          break;
        } catch (error) {
          warn(`Gala Today: ${model} failed (${error instanceof Error ? error.message.slice(0, 120) : "error"})`);
          if (isDailyQuotaSpent(error)) {
            quotaSpentUntil.set(model, Date.now() + QUOTA_SKIP_MS);
            break;
          }
          if (attempt === 0 && isBusy(error)) {
            await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
            continue;
          }
          break;
        }
      }
    }
  }
  const text = await generateJsonFromGroq({ systemPrompt, userMessage, requestId, maxCompletionTokens: 1300 });
  return { text, model: "groq" };
}
