import {
  streamFromGemini,
  GeminiProviderResult,
} from "./geminiProvider";
import {
  ASK_AI_CHATBOT_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL_ID,
  OPENROUTER_BASE_URL,
  OPENROUTER_TIMEOUT_MS,
} from "../config/askAiConfig";

export class AskAiServiceError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AskAiServiceError";
    this.status = status;
  }
}

export type AskAiSource = {
  title: string;
  url: string;
};

export type AskAiProviderMeta = {
  provider: "gemini-direct" | "openrouter-fallback";
  model: string;
  fallbackUsed: boolean;
};

export type AskAiAnswerResult = {
  answer: string;
  usedLiveSearch: boolean;
  sources: AskAiSource[];
  sourceStatus: "no_grounding_metadata";
  webSearchQueriesCount: number;
  groundingChunksCount: number;
  groundingSupportsCount: number;
  modelUsed: string;
  latencyMs: number;
  fallbackUsed: boolean;
  answerRejectedDueToLeakageOrTruncation: boolean;
  provider: AskAiProviderMeta;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateAskAiAnswerParams = {
  question: string;
  placeSlug?: string;
  enableLiveSearch: boolean;
  conversationHistory?: ChatMessage[];
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
};

function buildPrompt(
  question: string,
  conversationHistory?: ChatMessage[]
): string {
  if (!conversationHistory || conversationHistory.length === 0) {
    return question;
  }

  const historyBlock = conversationHistory
    .map(
      (msg) =>
        `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
    )
    .join("\n\n");

  return `${historyBlock}\n\nUser: ${question}`;
}

function getErrorStatus(error: unknown): number {
  if (error instanceof Error && error.name === "AbortError") {
    return 504;
  }

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

export function shouldUseGroundedResearch(_question: string): boolean {
  return false;
}

async function callOpenRouterFallback({
  prompt,
  model,
  signal,
}: {
  prompt: string;
  model: string;
  signal?: AbortSignal;
}): Promise<GeminiProviderResult> {
  const startedAt = Date.now();
  const apiKey = OPENROUTER_API_KEY;

  if (!apiKey) {
    throw Object.assign(
      new Error("OpenRouter API key is not configured."),
      { status: 500 }
    );
  }

  console.log(
    `[openrouter-fallback] OPENROUTER REQUEST START model=${model}`
  );

  const abortSignal = signal ?? AbortSignal.timeout(OPENROUTER_TIMEOUT_MS);

  const response = await fetch(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 1200,
        temperature: 0.7,
      }),
      signal: abortSignal,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[openrouter-fallback] OPENROUTER ERROR status=${response.status} body=${errorText.slice(0, 500)}`
    );
    throw Object.assign(
      new Error(`OpenRouter returned status ${response.status}.`),
      { status: response.status }
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const answer =
    data.choices?.[0]?.message?.content?.trim() || "(no response)";

  const latency = Date.now() - startedAt;
  console.log(
    `[openrouter-fallback] OPENROUTER COMPLETE model=${model} answerLength=${answer.length} latencyMs=${latency}`
  );

  return {
    answer,
    model,
    latencyMs: latency,
  };
}

export async function generateAskAiAnswer({
  question,
  enableLiveSearch: _enableLiveSearch,
  conversationHistory,
  signal,
  onChunk,
}: GenerateAskAiAnswerParams): Promise<AskAiAnswerResult> {
  const prompt = buildPrompt(question, conversationHistory);
  const geminiModel = ASK_AI_CHATBOT_MODEL;
  let usedProvider: AskAiProviderMeta["provider"] = "gemini-direct";
  let usedModel = geminiModel;
  let fallbackUsed = false;
  let result: GeminiProviderResult;

  try {
    console.log(
      `[gemini-direct] Provider selected model=${geminiModel}`
    );

    result = await streamFromGemini({
      prompt,
      onChunk: onChunk ?? (() => {}),
      signal,
    });
  } catch (geminiError) {
    const geminiRawMessage = getErrorMessage(geminiError);
    const geminiStatus = getErrorStatus(geminiError);
    console.error(
      `[gemini-direct] Gemma 4 26B direct streaming failed: ${geminiRawMessage} status=${geminiStatus}`
    );

    if (signal?.aborted) {
      throw new AskAiServiceError("Generation was aborted.", 499);
    }

    if (!OPENROUTER_API_KEY) {
      console.error(
        `[openrouter-fallback] Skipped – OPENROUTER_API_KEY not configured.`
      );
      throw new AskAiServiceError(geminiRawMessage, geminiStatus);
    }

    console.log(
      `[openrouter-fallback] Retrying with OpenRouter non-streaming model=${OPENROUTER_MODEL_ID}`
    );

    try {
      result = await callOpenRouterFallback({
        prompt,
        model: OPENROUTER_MODEL_ID,
        signal,
      });
      usedProvider = "openrouter-fallback";
      usedModel = OPENROUTER_MODEL_ID;
      fallbackUsed = true;
    } catch (fallbackError) {
      const fallbackMessage = getErrorMessage(fallbackError);
      const fallbackStatus = getErrorStatus(fallbackError);
      console.error(
        `[openrouter-fallback] OpenRouter fallback also failed: ${fallbackMessage} status=${fallbackStatus}`
      );

      if (signal?.aborted) {
        throw new AskAiServiceError("Generation was aborted.", 499);
      }

      throw new AskAiServiceError(
        "The AI provider is busy right now. Please try again.",
        502
      );
    }
  }

  return {
    answer: result.answer,
    usedLiveSearch: false,
    sources: [],
    sourceStatus: "no_grounding_metadata",
    webSearchQueriesCount: 0,
    groundingChunksCount: 0,
    groundingSupportsCount: 0,
    modelUsed: usedModel,
    latencyMs: result.latencyMs,
    fallbackUsed,
    answerRejectedDueToLeakageOrTruncation: false,
    provider: {
      provider: usedProvider,
      model: usedModel,
      fallbackUsed,
    },
  };
}
