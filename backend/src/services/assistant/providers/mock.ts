import { detectLanguage } from "../language";
import { queryTokens } from "../tools";
import type { AssistantModelProvider, ModelRequest, ModelStep, ToolCall } from "./types";

/** A recorded model conversation: the tool calls a model made, then its final text. */
export type RecordedTurn = { toolCalls?: Array<{ name: string; args: Record<string, unknown> }>; text?: string };
export type RecordedConversation = { prompt: string; mode?: "chat" | "map"; steps: RecordedTurn[] };

const key = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

function lastUserText(request: ModelRequest) {
  return [...request.turns].reverse().find((turn) => turn.role === "user")?.text ?? "";
}

function stepIndex(request: ModelRequest) {
  // Steps taken since the latest user message = model turns after it.
  const lastUser = request.turns.map((turn) => turn.role).lastIndexOf("user");
  return request.turns.slice(lastUser + 1).filter((turn) => turn.role === "model").length;
}

function emitText(text: string, onDelta?: (text: string) => void) {
  for (const piece of text.match(/\S+\s*/g) ?? []) onDelta?.(piece);
}

/**
 * Replays recorded conversations (fixtures) so the whole agent runs offline in tests and local dev.
 * Prompts without a recording get a rule-based turn: search first, then a short answer naming the top results.
 */
export class MockProvider implements AssistantModelProvider {
  readonly id = "mock";
  private readonly recordings = new Map<string, RecordedConversation>();

  constructor(recordings: RecordedConversation[] = []) {
    for (const recording of recordings) this.recordings.set(key(recording.prompt), recording);
  }

  async available() {
    return true;
  }

  async step(request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep> {
    const message = lastUserText(request);
    const index = stepIndex(request);
    const recording = this.recordings.get(key(message));
    if (recording) {
      const turn = recording.steps[Math.min(index, recording.steps.length - 1)];
      const toolCalls: ToolCall[] = request.tools.length ? (turn.toolCalls ?? []).map((call, n) => ({ id: `rec-${index}-${n}`, name: call.name, args: call.args })) : [];
      if (toolCalls.length) return { text: "", toolCalls, model: "recorded" };
      emitText(turn.text ?? "", onDelta);
      return { text: turn.text ?? "", toolCalls: [], model: "recorded" };
    }
    return this.ruleBased(request, message, index, onDelta);
  }

  private ruleBased(request: ModelRequest, message: string, index: number, onDelta?: (text: string) => void): ModelStep {
    if (index === 0 && request.tools.length) {
      // Like a model would: reuse what the chat remembers (area, budget, indoor, the topic for "mas mura?").
      const remembered = request.system.match(/Remembered from this chat: ([^\n]*)/)?.[1] ?? "";
      const area = remembered.match(/area: ([^;]+)/)?.[1];
      const budget = Number(remembered.match(/budget: PHP (\d+)/)?.[1] ?? NaN);
      const topic = remembered.match(/last asked for: "([^"]+)"/)?.[1];
      const args = {
        query: topic && queryTokens(message).length === 0 ? topic : message,
        ...(area ? { area } : {}),
        ...(Number.isFinite(budget) ? { budget_max: budget } : {}),
        ...(/wants indoor/.test(remembered) ? { indoor: true } : {}),
      };
      return { text: "", toolCalls: [{ id: "mock-0", name: "search_places", args }], model: "rule-based" };
    }
    const results = [...request.turns].reverse().find((turn) => turn.role === "tool");
    const found = results?.role === "tool" ? ((results.results[0]?.result as { places?: Array<{ name: string; about: string | null }> })?.places ?? []) : [];
    const taglish = detectLanguage(message) === "taglish" || /natural Taglish/.test(request.system);
    const picks = found.slice(0, 3);
    const text = picks.length
      ? [taglish ? "Tara, heto ang swak:" : "Here's what fits:", ...picks.map((place) => `- **${place.name}**: ${(place.about ?? "").split(/(?<=[.!?])\s/)[0]}`)].join("\n")
      : taglish
        ? "Wala pa akong swak na lugar para diyan. Ibang area kaya?"
        : "I couldn't find a GalaTayo place for that yet. Another area?";
    emitText(text, onDelta);
    return { text, toolCalls: [], model: "rule-based" };
  }
}

/** A provider that always fails, to test fallbacks. */
export class FailingProvider implements AssistantModelProvider {
  constructor(readonly id = "gemini", private readonly status = 429, private readonly afterText = "") {}
  async available() {
    return true;
  }
  async step(_request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep> {
    if (this.afterText) onDelta?.(this.afterText);
    const { ProviderError } = await import("./types");
    throw new ProviderError(this.id, this.status, `forced ${this.status}`);
  }
}
