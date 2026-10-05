import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAskAiScope } from "./askAiStrictPgGuard";
import { buildDailyLimitMessage, evaluateAskAiPromptGuardDecision } from "./askAi";
import { finishChatbotAnswer, generateJsonFromGroq, getGroqRetryDelayMs, GroqChatProviderError, clearGroqModelCooldownsForTest } from "../services/groqChatProvider";

describe("classifyAskAiScope", () => {
  const allowed = [
    "Umuulan, saan pwede tumambay sa QC na indoor? Mga 4 kami",
    "rainy day hangout sa QC",
    "Eh yung may kainan malapit dun?",
    "Best cafes to study in Maginhawa?",
    "how do I commute from Cubao to Intramuros",
    "ano magandang gawin sa Siargao",
    "gay bar in manila",
    "salamat!",
    "hi",
  ];
  for (const prompt of allowed) {
    it(`allows "${prompt}" without a model call`, () => assert.equal(classifyAskAiScope(prompt), "allow"));
  }

  const blocked = ["1+1", "write python code for a todo app", "help me with my essay", "is jerome gay", "strip club near me", "what is the capital of France?"];
  for (const prompt of blocked) {
    it(`blocks "${prompt}"`, () => assert.equal(classifyAskAiScope(prompt), "block"));
  }

  it("leaves unclear messages to the model guard", () => {
    assert.equal(classifyAskAiScope("tell me something interesting"), "unsure");
    assert.equal(classifyAskAiScope("write a poem about my date in BGC"), "unsure");
  });
});

describe("evaluateAskAiPromptGuardDecision", () => {
  const base = {
    accepted: true,
    label: "allowed" as const,
    actions: [
      { text: "rainy day ideas", intent: "gala_planning" as const, isAllowed: true },
      { text: "food nearby", intent: "nearby_places" as const, isAllowed: true },
    ],
    invalidActions: [],
    fillerOnly: false,
    mixedIntent: true,
    secondaryIntentPresent: true,
    reason: "two outing asks",
    confidence: 0.9,
  };

  it("accepts several valid outing asks in one message", () => {
    assert.equal(evaluateAskAiPromptGuardDecision(base).accepted, true);
  });

  it("still rejects when any action is off-topic", () => {
    const invalid = { text: "solve 2x=4", intent: "unrelated" as const, isAllowed: false };
    assert.equal(evaluateAskAiPromptGuardDecision({ ...base, actions: [...base.actions, invalid], invalidActions: [invalid] }).accepted, false);
  });
});

describe("daily limit message", () => {
  it("states the limit that actually applies", () => {
    assert.match(buildDailyLimitMessage({ kind: "guest", id: "guest-123456" }, 5), /all 5 free AI requests for today/);
    assert.match(buildDailyLimitMessage({ kind: "registered", id: "u", user: { id: "u" } }, 20), /all 20 AI requests/);
  });
});

describe("finishChatbotAnswer", () => {
  it("drops an unfinished sentence when the answer was cut off", () => {
    assert.equal(finishChatbotAnswer("Try **Gateway Mall** for indoor fun. Then head to **Some", true), "Try **Gateway Mall** for indoor fun.");
  });

  it("drops a dangling list item and heading", () => {
    const cut = "Rainy day ideas:\n\n- **Gateway Gallery** has free entry.\n- **Art in Island** is fun for photos.\n- **The 70s";
    assert.equal(finishChatbotAnswer(cut, true), "Rainy day ideas:\n\n- **Gateway Gallery** has free entry.\n- **Art in Island** is fun for photos.");
  });

  it("closes bold left open even when not truncated", () => {
    assert.equal(finishChatbotAnswer("Go to **Rizal Park at sunset.", false), "Go to Rizal Park at sunset.");
  });

  it("keeps complete answers unchanged", () => {
    assert.equal(finishChatbotAnswer("Tara sa **Intramuros**! Bring an umbrella.", true), "Tara sa **Intramuros**! Bring an umbrella.");
  });
});

describe("Groq retry and JSON salvage", () => {
  it("retries quickly only for short rate limits and server errors", () => {
    const rateLimited = (cooldownMs: number) => new GroqChatProviderError(429, "AI_PROVIDER_RATE_LIMITED", "busy", "busy", { cooldownMs });
    assert.equal(getGroqRetryDelayMs(rateLimited(2000)), 2150);
    assert.equal(getGroqRetryDelayMs(rateLimited(30_000)), null);
    assert.equal(getGroqRetryDelayMs(new GroqChatProviderError(503, "AI_PROVIDER_TEMPORARY_ERROR", "x")), 800);
    assert.equal(getGroqRetryDelayMs(new GroqChatProviderError(500, "AI_PROVIDER_CONFIGURATION_ERROR", "x")), null);
  });

  it("returns the failed generation from a json_validate_failed 400 so it can be repaired", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test";
    clearGroqModelCooldownsForTest();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: "json_validate_failed", message: "bad json", failed_generation: '{"title":"Gala",}' } }), { status: 400 })) as typeof fetch;
    try {
      assert.equal(await generateJsonFromGroq({ systemPrompt: "s", userMessage: "u", requestId: "t" }), '{"title":"Gala",}');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = originalKey;
    }
  });

  it("reports other provider 4xx errors as a bad gateway, not a client error", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test";
    clearGroqModelCooldownsForTest();
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "context too long" } }), { status: 400 })) as typeof fetch;
    try {
      await assert.rejects(
        () => generateJsonFromGroq({ systemPrompt: "s", userMessage: "u", requestId: "t" }),
        (error: unknown) => error instanceof GroqChatProviderError && error.status === 502
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = originalKey;
    }
  });
});
