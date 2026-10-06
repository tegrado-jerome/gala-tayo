import { buildAbortSignal } from "../../../utils/askAiCancellation";
import { modelList, optionalSecret } from "./secrets";
import { ProviderError, type AssistantModelProvider, type ModelRequest, type ModelStep, type ModelTurn, type ToolCall } from "./types";

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAiCompatibleConfig = {
  id: string;
  /** Resolves the endpoint URL, or null when the provider isn't set up (its secrets are missing). */
  endpoint: () => Promise<string | null>;
  apiKey: () => Promise<string | null>;
  models: string[];
  /** Extra body fields per model (e.g. reasoning effort). */
  extraBody?: (model: string) => Record<string, unknown>;
  timeoutMs?: number;
};

export function toOpenAiMessages(system: string, turns: ModelTurn[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.text });
    else if (turn.role === "model") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        ...(turn.toolCalls.length
          ? { tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.args) } })) }
          : {}),
      });
    } else {
      for (const entry of turn.results) messages.push({ role: "tool", tool_call_id: entry.id, content: JSON.stringify(entry.result) });
    }
  }
  return messages;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Reads an OpenAI-style SSE stream: text deltas go out as they come, tool call fragments are joined by index. */
export async function readChatStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let buffer = "";
  let text = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const delta = event?.choices?.[0]?.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      onDelta(delta.content);
    }
    for (const fragment of delta.tool_calls ?? []) {
      const index = typeof fragment.index === "number" ? fragment.index : calls.size;
      const entry = calls.get(index) ?? { id: "", name: "", args: "" };
      if (fragment.id) entry.id = fragment.id;
      if (fragment.function?.name) entry.name += fragment.function.name;
      if (fragment.function?.arguments) entry.args += fragment.function.arguments;
      calls.set(index, entry);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  handleLine(buffer);
  const toolCalls: ToolCall[] = [...calls.values()]
    .filter((call) => call.name)
    .map((call, index) => ({ id: call.id || `call-${index + 1}`, name: call.name, args: parseArgs(call.args) }));
  return { text, toolCalls };
}

const cooldowns = new Map<string, number>();

/** Any chat-completions API with tool calling: Groq, Cloudflare Workers AI, OpenRouter. */
export class OpenAiCompatibleProvider implements AssistantModelProvider {
  readonly id: string;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.id = config.id;
  }

  async available() {
    return Boolean((await this.config.endpoint()) && (await this.config.apiKey()));
  }

  async step(request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep> {
    const [endpoint, apiKey] = await Promise.all([this.config.endpoint(), this.config.apiKey()]);
    if (!endpoint || !apiKey) throw new ProviderError(this.id, 500, `${this.id} is not configured`);
    const now = Date.now();
    const models = this.config.models.filter((model) => (cooldowns.get(`${this.id}:${model}`) ?? 0) <= now);
    let lastError: ProviderError | null = null;
    for (const model of models) {
      let emitted = false;
      try {
        return await this.callModel(endpoint, apiKey, model, request, (text) => {
          emitted = true;
          onDelta?.(text);
        });
      } catch (error) {
        if (request.signal?.aborted) throw error;
        lastError = error instanceof ProviderError ? error : new ProviderError(this.id, 500, String(error));
        if (lastError.status === 429) cooldowns.set(`${this.id}:${model}`, Date.now() + 60_000);
        if (emitted || !lastError.retryable) throw lastError;
      }
    }
    throw lastError ?? new ProviderError(this.id, 503, `${this.id}: all models cooling down`);
  }

  private async callModel(endpoint: string, apiKey: string, model: string, request: ModelRequest, onDelta: (text: string) => void): Promise<ModelStep> {
    const signal = buildAbortSignal([AbortSignal.timeout(this.config.timeoutMs ?? 20_000), request.signal]);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: toOpenAiMessages(request.system, request.turns),
          ...(request.tools.length
            ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: request.toolChoice ?? "auto" }
            : {}),
          temperature: request.temperature,
          max_completion_tokens: request.maxOutputTokens,
          stream: true,
          ...(this.config.extraBody?.(model) ?? {}),
        }),
        signal,
      });
    } catch (error) {
      throw new ProviderError(this.id, (error as Error)?.name === "TimeoutError" ? 504 : 503, `${model}: ${(error as Error)?.message ?? error}`);
    }
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new ProviderError(this.id, response.status, `${model}: ${response.status} ${detail.slice(0, 200)}`, response.status === 429 || response.status >= 500 || response.status === 404 || response.status === 400);
    }
    const { text, toolCalls } = await readChatStream(response.body, onDelta);
    return { text, toolCalls, model };
  }
}

export function groqProvider() {
  return new OpenAiCompatibleProvider({
    id: "groq",
    endpoint: async () => "https://api.groq.com/openai/v1/chat/completions",
    apiKey: () => optionalSecret("GROQ_API_KEY", "groq-api-key"),
    models: modelList("ASSISTANT_GROQ_MODELS", ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]),
    // gpt-oss reasons before answering; low effort keeps the first token fast and inside the free token budget.
    extraBody: (model) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
  });
}

/** Off until the owner adds cloudflare-account-id and cloudflare-workers-ai-token to Key Vault. */
export function cloudflareProvider() {
  return new OpenAiCompatibleProvider({
    id: "cloudflare",
    endpoint: async () => {
      const accountId = await optionalSecret("CLOUDFLARE_ACCOUNT_ID", "cloudflare-account-id");
      return accountId ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions` : null;
    },
    apiKey: () => optionalSecret("CLOUDFLARE_WORKERS_AI_TOKEN", "cloudflare-workers-ai-token"),
    models: modelList("ASSISTANT_CLOUDFLARE_MODELS", ["@cf/openai/gpt-oss-120b"]),
  });
}

/** Off until the owner adds openrouter-api-key to Key Vault. Free model ids change often, so keep them in the env var. */
export function openRouterProvider() {
  return new OpenAiCompatibleProvider({
    id: "openrouter",
    endpoint: async () => "https://openrouter.ai/api/v1/chat/completions",
    apiKey: () => optionalSecret("OPENROUTER_API_KEY", "openrouter-api-key"),
    models: modelList("ASSISTANT_OPENROUTER_MODELS", ["nvidia/nemotron-3-super-120b-a12b:free"]),
  });
}
