/** A tool the model may call, described with plain JSON Schema so every provider can use it. */
export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolResult = { id: string; name: string; result: unknown };

/**
 * One turn of the provider-neutral transcript. `raw` holds what a provider needs to replay its own
 * turn exactly (Gemini's thought signatures); other providers ignore it.
 */
export type ModelTurn =
  | { role: "user"; text: string }
  | { role: "model"; text: string; toolCalls: ToolCall[]; raw?: unknown; provider?: string }
  | { role: "tool"; results: ToolResult[] };

export type ModelRequest = {
  system: string;
  turns: ModelTurn[];
  tools: ToolDeclaration[];
  maxOutputTokens: number;
  temperature: number;
  /** "required" makes the model call a tool (first step of a clear gala ask), so answers are always grounded. */
  toolChoice?: "auto" | "required";
  /** The search already ran and its results are in the prompt: the model only ranks and phrases, so it can skip deep thinking. */
  grounded?: boolean;
  signal?: AbortSignal;
  requestId: string;
};

export type ModelStep = { text: string; toolCalls: ToolCall[]; raw?: unknown; model: string };

/**
 * A chat model that can call tools. `step` runs one model call: it returns tool calls, or the answer text,
 * streaming text through `onDelta` as it arrives. Providers that are not configured (no key) report
 * `available() === false` and are skipped, so new free providers can be added without breaking anything.
 */
export interface AssistantModelProvider {
  readonly id: string;
  available(): Promise<boolean>;
  step(request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
    /** True when trying the next provider makes sense (rate limit, outage, timeout). */
    readonly retryable = true
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
