import {
  ASK_AI_CHATBOT_MODEL,
  ASK_AI_GUIDE_GENERATION_CONFIG,
} from "../config/askAiConfig";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiContentPart = {
  text: string;
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiContentPart[];
};

export type AskAiChatbotProviderResult = {
  answer: string;
  model: string;
  latencyMs: number;
};

export class AskAiChatbotProviderError extends Error {
  status: number;
  errorCode: string;
  userMessage: string;

  constructor(
    status: number,
    errorCode: string,
    userMessage: string,
    message?: string
  ) {
    super(message ?? userMessage);
    this.name = "AskAiChatbotProviderError";
    this.status = status;
    this.errorCode = errorCode;
    this.userMessage = userMessage;
  }
}

type GenerateAskAiChatbotParams = {
  question: string;
  conversationHistory?: ChatMessage[];
  signal?: AbortSignal;
};

const GEMINI_REST_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_HISTORY_MESSAGES = 8;
const REQUEST_TIMEOUT_MS = 45_000;

function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function getGeminiApiKey(): string {
  const apiKey = normalizeText(process.env.GEMINI_API_KEY);

  if (!apiKey) {
    throw new AskAiChatbotProviderError(
      500,
      "AI_PROVIDER_CONFIGURATION_ERROR",
      "The AI provider is not configured.",
      "GEMINI_API_KEY is not configured."
    );
  }

  return apiKey;
}

function buildContents(
  question: string,
  conversationHistory?: ChatMessage[]
): GeminiContent[] {
  const contents: GeminiContent[] = [];
  const history = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-MAX_HISTORY_MESSAGES)
    : [];

  for (const message of history) {
    const text = normalizeText(message.content);
    if (!text) {
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: question }],
  });

  return contents;
}

function extractAnswerText(body: unknown): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !("candidates" in body)
  ) {
    return "";
  }

  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const firstCandidate = candidates[0] as {
    content?: {
      parts?: Array<{ text?: unknown }>;
    };
  };

  const parts = firstCandidate.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function getExplicitErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortError = new Error("The operation was aborted.");
      abortError.name = "AbortError";
      reject(abortError);
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      const abortError = new Error("The operation was aborted.");
      abortError.name = "AbortError";
      reject(abortError);
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function callGeminiRestOnce({
  question,
  conversationHistory,
  signal,
  model,
}: GenerateAskAiChatbotParams & { model: string }): Promise<AskAiChatbotProviderResult> {
  const startedAt = Date.now();
  const apiKey = getGeminiApiKey();
  const requestSignal = signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const contents = buildContents(question, conversationHistory);
  const url = `${GEMINI_REST_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: ASK_AI_GUIDE_GENERATION_CONFIG.temperature,
        maxOutputTokens: ASK_AI_GUIDE_GENERATION_CONFIG.maxOutputTokens,
      },
    }),
    signal: requestSignal,
  });

  if (response.status === 429) {
    throw new AskAiChatbotProviderError(
      429,
      "AI_PROVIDER_RATE_LIMITED",
      "AI limit reached. Please try again later.",
      "Gemini REST API returned 429."
    );
  }

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    const message =
      rawBody || `Gemini REST API returned status ${response.status}.`;

    throw new AskAiChatbotProviderError(
      response.status,
      "AI_PROVIDER_TEMPORARY_ERROR",
      "The AI model had a temporary issue. Please try again in a moment.",
      message
    );
  }

  const data = (await response.json()) as unknown;
  const answer = extractAnswerText(data) || "(no response)";
  const latencyMs = Date.now() - startedAt;

  return {
    answer,
    model,
    latencyMs,
  };
}

export async function generateAskAiChatbotAnswer({
  question,
  conversationHistory,
  signal,
}: GenerateAskAiChatbotParams): Promise<AskAiChatbotProviderResult> {
  const model = ASK_AI_CHATBOT_MODEL;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await callGeminiRestOnce({
        model,
        question,
        conversationHistory,
        signal,
      });
    } catch (error) {
      lastError = error;

      if (error instanceof AskAiChatbotProviderError && error.status === 429) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new AskAiChatbotProviderError(
          504,
          "AI_PROVIDER_TEMPORARY_ERROR",
          "The AI model had a temporary issue. Please try again in a moment.",
          "Request was aborted."
        );
      }

      const status = error instanceof AskAiChatbotProviderError
        ? error.status
        : getExplicitErrorStatus(error);

      if (status !== null && isRetryableStatus(status) && attempt < 3) {
        await sleep(RETRY_DELAYS_MS[attempt - 1], signal);
        continue;
      }

      if (error instanceof AskAiChatbotProviderError) {
        throw new AskAiChatbotProviderError(
          503,
          "AI_PROVIDER_TEMPORARY_ERROR",
          "The AI model had a temporary issue. Please try again in a moment.",
          error.message
        );
      }

      const message =
        error instanceof Error ? error.message : "Unknown Gemini REST error.";
      throw new AskAiChatbotProviderError(
        503,
        "AI_PROVIDER_TEMPORARY_ERROR",
        "The AI model had a temporary issue. Please try again in a moment.",
        message
      );
    }
  }

  throw new AskAiChatbotProviderError(
    503,
    "AI_PROVIDER_TEMPORARY_ERROR",
    "The AI model had a temporary issue. Please try again in a moment.",
    lastError instanceof Error ? lastError.message : "Gemini REST retries exhausted."
  );
}
