import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { KEY_VAULT_SECRET_NAMES } from "../../../config/secretNames";
import { buildAbortSignal } from "../../../utils/askAiCancellation";
import { modelList, optionalSecret } from "./secrets";
import { ProviderError, type AssistantModelProvider, type ModelRequest, type ModelStep, type ModelTurn, type ToolCall } from "./types";

// Primary chat models, best first. Free-tier quotas are per model, so a rate-limited model is skipped for a minute.
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
const COOLDOWN_MS = 60_000;
const FIRST_CHUNK_TIMEOUT_MS = 9_000;
// Phrasing results already in the prompt normally starts within about a second; slower means overloaded, so move on.
const GROUNDED_FIRST_CHUNK_TIMEOUT_MS = 5_000;
const STEP_TIMEOUT_MS = 20_000;

const cooldowns = new Map<string, number>();

export function toGeminiContents(turns: ModelTurn[]): Content[] {
  return turns.map((turn): Content => {
    if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };
    if (turn.role === "tool") {
      return {
        role: "user",
        parts: turn.results.map((entry) => ({ functionResponse: { id: entry.id, name: entry.name, response: { result: entry.result } } })),
      };
    }
    // Gemini's own turns are replayed as they came (they carry thought signatures that tool calls need).
    if (turn.provider === "gemini" && Array.isArray(turn.raw)) return { role: "model", parts: turn.raw as Part[] };
    const parts: Part[] = [];
    if (turn.text) parts.push({ text: turn.text });
    for (const call of turn.toolCalls) parts.push({ functionCall: { id: call.id, name: call.name, args: call.args } });
    return { role: "model", parts: parts.length ? parts : [{ text: "" }] };
  });
}

function statusOf(error: unknown): number {
  const record = error as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
  if (typeof record?.status === "number") return record.status;
  if (typeof record?.code === "number") return record.code;
  if (record?.name === "AbortError" || record?.name === "TimeoutError") return 504;
  const match = String(record?.message ?? "").match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : 500;
}

// Models that answered 400 to minimal thinking; they get low thinking from then on.
const noMinimalThinking = new Set<string>();

/** Tool picking needs a little thinking; phrasing results already in the prompt needs almost none (it costs seconds before the first token). */
export function thinkingFor(model: string, grounded = false) {
  if (model.startsWith("gemini-2.5")) return { thinkingBudget: 0 };
  return { thinkingLevel: grounded && !noMinimalThinking.has(model) ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
}

export class GeminiProvider implements AssistantModelProvider {
  readonly id = "gemini";
  private client: GoogleGenAI | null = null;

  constructor(private readonly models = modelList("ASSISTANT_GEMINI_MODELS", DEFAULT_MODELS)) {}

  async available() {
    return Boolean(await optionalSecret("GEMINI_API_KEY", KEY_VAULT_SECRET_NAMES.GEMINI_API_KEY));
  }

  private async getClient() {
    if (this.client) return this.client;
    const apiKey = await optionalSecret("GEMINI_API_KEY", KEY_VAULT_SECRET_NAMES.GEMINI_API_KEY);
    if (!apiKey) throw new ProviderError(this.id, 500, "Gemini key missing", true);
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  async step(request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep> {
    const ai = await this.getClient();
    const now = Date.now();
    const models = this.models.filter((model) => (cooldowns.get(model) ?? 0) <= now);
    let lastError: ProviderError | null = null;

    for (const model of models.length ? models : this.models.slice(0, 1)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let emitted = false;
        const minimal = Boolean(request.grounded) && !model.startsWith("gemini-2.5") && !noMinimalThinking.has(model);
        try {
          return await this.stepWithModel(ai, model, request, (text) => {
            emitted = true;
            onDelta?.(text);
          });
        } catch (error) {
          if (request.signal?.aborted) throw error;
          const status = statusOf(error);
          // A model that doesn't take minimal thinking answers 400: retry it once with low thinking.
          if (status === 400 && minimal && !emitted) {
            noMinimalThinking.add(model);
            continue;
          }
          if (status === 429) cooldowns.set(model, Date.now() + COOLDOWN_MS);
          lastError = new ProviderError(this.id, status, `${model}: ${error instanceof Error ? error.message : String(error)}`, status === 429 || status >= 500 || status === 404);
          // Text already shown can't be taken back by a second model; let the caller fall back instead.
          if (emitted || !lastError.retryable) throw lastError;
          break;
        }
      }
    }
    throw lastError ?? new ProviderError(this.id, 503, "No Gemini model available");
  }

  private async stepWithModel(ai: GoogleGenAI, model: string, request: ModelRequest, onDelta: (text: string) => void): Promise<ModelStep> {
    const timeout = AbortSignal.timeout(STEP_TIMEOUT_MS);
    const firstChunk = new AbortController();
    const firstChunkTimer = setTimeout(() => firstChunk.abort(), request.grounded ? GROUNDED_FIRST_CHUNK_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS);
    const signal = buildAbortSignal([timeout, firstChunk.signal, request.signal]);
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: toGeminiContents(request.turns),
        config: {
          systemInstruction: request.system,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          thinkingConfig: thinkingFor(model, request.grounded),
          tools: request.tools.length ? [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) }] : undefined,
          toolConfig: request.tools.length && request.toolChoice === "required" ? { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } : undefined,
          abortSignal: signal,
        },
      });
      const parts: Part[] = [];
      const toolCalls: ToolCall[] = [];
      let text = "";
      for await (const chunk of stream) {
        clearTimeout(firstChunkTimer);
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          parts.push(part);
          if (part.functionCall?.name) {
            toolCalls.push({ id: part.functionCall.id ?? `call-${toolCalls.length + 1}`, name: part.functionCall.name, args: (part.functionCall.args ?? {}) as Record<string, unknown> });
          } else if (typeof part.text === "string" && !part.thought) {
            text += part.text;
            if (part.text) onDelta(part.text);
          }
        }
      }
      return { text, toolCalls, raw: parts, model };
    } finally {
      clearTimeout(firstChunkTimer);
    }
  }
}
