function normalizeModelName(value: string | undefined | null): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.replace(/^models\//i, "");
}

export const ASK_AI_CHATBOT_MODEL =
  normalizeModelName(process.env.ASK_AI_CHATBOT_MODEL) || "gemma-4-26b-a4b-it";
export const ASK_AI_CHATBOT_TIMEOUT_MS = Number(
  process.env.ASK_AI_CHATBOT_TIMEOUT_MS || 45000
);

export const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY?.trim() || "";
export const OPENROUTER_MODEL_ID =
  process.env.OPENROUTER_MODEL_ID || "google/gemma-4-26b-a4b-it:free";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const OPENROUTER_TIMEOUT_MS = Number(
  process.env.OPENROUTER_TIMEOUT_MS || 30000
);

export const ASK_AI_GUIDE_GENERATION_CONFIG = {
  maxOutputTokens: 900,
  temperature: 0.65,
};

export const ASK_AI_LIVE_SEARCH_GENERATION_CONFIG = {
  maxOutputTokens: 1100,
  temperature: 0.75,
};

export const ASK_AI_GUIDE_DAILY_LIMIT = 10;
export const ASK_AI_TOTAL_DAILY_LIMIT = 10;
export const ASK_AI_LIVE_SEARCH_DAILY_LIMIT = 5;
