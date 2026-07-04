import { GoogleGenAI } from "@google/genai";
import {
  ASK_AI_CHATBOT_MODEL,
  ASK_AI_CHATBOT_TIMEOUT_MS,
} from "../config/askAiConfig";
import { getSecret } from "../config/keyVault";

export type GeminiStreamParams = {
  prompt: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
};

export type GeminiProviderResult = {
  answer: string;
  model: string;
  latencyMs: number;
};

export type GeminiStreamError = {
  message: string;
  status: number;
  rawMessage: string;
};

function getErrorStatus(error: unknown): number {
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

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const parts: string[] = [error.message];
    if ("status" in error && typeof error.status === "number") {
      parts.push(`status=${error.status}`);
    }
    if ("code" in error && typeof error.code === "number") {
      parts.push(`code=${error.code}`);
    }
    if (
      "statusCode" in error &&
      typeof error.statusCode === "number"
    ) {
      parts.push(`statusCode=${error.statusCode}`);
    }
    return parts.join("; ");
  }

  if (typeof error === "string") return error;

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
  throw new Error(
    `Missing Gemini API key. Checked env vars GEMINI_API_KEY/GOOGLE_API_KEY/GOOGLE_GENAI_API_KEY and Key Vault secrets gemini-api-key/gemini_api_key.${reason}`
  );
}

export async function streamGemmaFromGemini({
  prompt,
  onChunk,
  signal,
}: GeminiStreamParams): Promise<GeminiProviderResult> {
  return streamFromGeminiWithModel({
    model: ASK_AI_CHATBOT_MODEL,
    prompt,
    onChunk,
    signal,
  });
}

async function streamFromGeminiWithModel({
  model,
  prompt,
  onChunk,
  signal,
}: GeminiStreamParams & { model: string }): Promise<GeminiProviderResult> {
  const startedAt = Date.now();
  const apiKey = await resolveGeminiApiKey();
  console.log("[Gemini Direct] API key resolved:", Boolean(apiKey));

  const ai = new GoogleGenAI({ apiKey });

  console.log(`[gemini-direct] GEMMA STREAM START model=${model}`);

  const stream = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      abortSignal: signal ?? AbortSignal.timeout(ASK_AI_CHATBOT_TIMEOUT_MS),
    },
  });

  let answer = "";
  let firstChunk = true;

  for await (const chunk of stream) {
    if (signal?.aborted) {
      break;
    }

    const delta = typeof chunk.text === "string" ? chunk.text : "";
    if (!delta) {
      continue;
    }

    if (firstChunk) {
      firstChunk = false;
      console.log(
        `[gemini-direct] GEMMA FIRST CHUNK model=${model} length=${delta.length}`
      );
    }

    answer += delta;
    onChunk(delta);
  }

  const latency = Date.now() - startedAt;
  console.log(
    `[gemini-direct] GEMMA STREAM COMPLETE model=${model} answerLength=${answer.length} latencyMs=${latency}`
  );

  return {
    answer: answer.trim() || "(no response)",
    model,
    latencyMs: latency,
  };
}

export async function streamFromGemini(
  params: GeminiStreamParams
): Promise<GeminiProviderResult> {
  try {
    return await streamFromGeminiWithModel({
      model: ASK_AI_CHATBOT_MODEL,
      ...params,
    });
  } catch (error) {
    const rawMessage = getRawErrorMessage(error);
    const status = getErrorStatus(error);
    console.error(`[gemini-direct] GEMMA STREAM ERROR: ${rawMessage}`);

    throw Object.assign(new Error(rawMessage), { status });
  }
}

export type GeminiGenerateParams = {
  prompt: string;
  signal?: AbortSignal;
};

export async function generateFromGemini({
  prompt,
  signal,
}: GeminiGenerateParams): Promise<GeminiProviderResult> {
  try {
    return await generateFromGeminiWithModel({
      model: ASK_AI_CHATBOT_MODEL,
      prompt,
      signal,
    });
  } catch (error) {
    const rawMessage = getRawErrorMessage(error);
    const status = getErrorStatus(error);
    console.error(`[gemini-direct] GEMMA GENERATE ERROR: ${rawMessage}`);

    throw Object.assign(new Error(rawMessage), { status });
  }
}

async function generateFromGeminiWithModel({
  model,
  prompt,
  signal,
}: GeminiGenerateParams & { model: string }): Promise<GeminiProviderResult> {
  const startedAt = Date.now();
  const apiKey = await resolveGeminiApiKey();
  console.log("[Gemini Direct] API key resolved:", Boolean(apiKey));

  const ai = new GoogleGenAI({ apiKey });

  console.log(`[gemini-direct] GEMMA GENERATE START model=${model}`);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      abortSignal: signal ?? AbortSignal.timeout(ASK_AI_CHATBOT_TIMEOUT_MS),
    },
  });

  const answer = response.text ?? "";

  const latency = Date.now() - startedAt;
  console.log(
    `[gemini-direct] GEMMA GENERATE COMPLETE model=${model} answerLength=${answer.length} latencyMs=${latency}`
  );

  return {
    answer: answer.trim() || "(no response)",
    model,
    latencyMs: latency,
  };
}

export async function generateWithGeminiFallback(
  params: GeminiGenerateParams
): Promise<GeminiProviderResult> {
  return generateFromGemini(params);
}
