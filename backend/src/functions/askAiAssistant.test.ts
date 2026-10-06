import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";

// Offline: recorded/rule-based model, fixture places, no Key Vault, no Redis, no Supabase.
process.env.ASSISTANT_PROVIDER = "mock";
process.env.ASSISTANT_PLACES = "fixtures";
delete process.env.KEY_VAULT_URL;
const EVAL_KEY = "test-eval-key-0123456789";

describe("askAiAssistant endpoint", () => {
  it("only honours the eval header when ASSISTANT_EVAL_KEY holds a long secret", async () => {
    const { isEvalRequest } = await import("./askAiAssistant");
    assert.equal(isEvalRequest(EVAL_KEY, undefined), false, "off without the env var");
    assert.equal(isEvalRequest("short", "short"), false, "off with a short secret");
    assert.equal(isEvalRequest(null, EVAL_KEY), false);
    assert.equal(isEvalRequest("wrong-key-0123456789", EVAL_KEY), false);
    assert.equal(isEvalRequest(EVAL_KEY, EVAL_KEY), true);
  });

  it("streams status, cards, text and the final answer as separate lines, cards first", async () => {
    process.env.ASSISTANT_EVAL_KEY = EVAL_KEY;
    const { postAskAiAssistant } = await import("./askAiAssistant");
    const request = new HttpRequest({
      url: "http://localhost/api/ask-ai/assistant",
      method: "POST",
      headers: { "content-type": "application/json", "x-ask-ai-guest-id": "11111111-2222-4333-8444-555555555555", "x-assistant-eval-key": EVAL_KEY },
      body: { string: JSON.stringify({ message: "saan masarap mag-sisig", mode: "chat", stream: true }) },
    });
    const started = Date.now();
    const response = await postAskAiAssistant(request, new InvocationContext({ functionName: "askAiAssistant" }));
    assert.equal(response.status, 200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const lines: Array<{ type: string; at: number; event: Record<string, any> }> = [];
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts.filter(Boolean)) {
        const event = JSON.parse(part);
        lines.push({ type: event.type, at: Date.now() - started, event });
      }
    }
    const types = lines.map((line) => line.type);
    assert.equal(types[0], "status");
    assert.ok(types.indexOf("places") > 0 && types.indexOf("places") < types.indexOf("delta"), types.join(","));
    assert.equal(types.at(-1), "final");
    const final = lines.at(-1)!.event.response;
    assert.equal(final.language, "taglish");
    assert.ok(final.places.length > 0);
    // Eval runs skip the daily limit, so no usage was taken.
    assert.equal(final.usage.requestCount, 0);
    console.log(`  stage times (offline): ${lines.map((line) => `${line.type}@${line.at}ms`).join(" ")}`);
  });
});
