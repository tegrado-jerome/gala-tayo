import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAskAiPromptGuardDecision,
  normalizeAskAiPromptForGuard,
} from "./askAi";
import { evaluateAskAiStrictPgGuard } from "./askAiStrictPgGuard";
import type {
  AskAiPromptGuardAction,
  AskAiPromptGuardDecision,
} from "../services/groqChatProvider";
import {
  GroqChatProviderError,
  classifyAskAiPromptWithGroq,
  clearGroqModelCooldownsForTest,
  generateFromGroq,
  parsePromptGuardDecision,
  sanitizeGeneratedChatbotAnswer,
} from "../services/groqChatProvider";

function action(
  text: string,
  intent: AskAiPromptGuardAction["intent"],
  isAllowed: boolean
): AskAiPromptGuardAction {
  return {
    text,
    intent,
    isAllowed,
  };
}

function decision(
  overrides: Partial<AskAiPromptGuardDecision>
): AskAiPromptGuardDecision {
  return {
    accepted: true,
    label: "allowed",
    actions: [],
    invalidActions: [],
    fillerOnly: false,
    mixedIntent: false,
    secondaryIntentPresent: false,
    reason: "test",
    confidence: 1,
    ...overrides,
  };
}

describe("Ask AI strict PG guard", () => {
  const rejectedPrompts = [
    "is jerome gay",
    "adult hookup spots in makati",
    "escort services in manila",
    "strip club near me",
    "red light district places",
  ];

  for (const prompt of rejectedPrompts) {
    it(`rejects ${prompt}`, () => {
      const result = evaluateAskAiStrictPgGuard(prompt);

      assert.equal(result.accepted, false);
    });
  }

  const acceptedPrompts = [
    "gay bar in manila",
    "gay bar for jerome",
    "bar crawl in manila",
    "clubs near bgc",
    "karaoke night in qc",
    "cocktail bar for barkada in makati",
    "cafe for jerome in manila",
  ];

  for (const prompt of acceptedPrompts) {
    it(`allows ${prompt}`, () => {
      const result = evaluateAskAiStrictPgGuard(prompt);

      assert.equal(result.accepted, true);
    });
  }
});

describe("Ask AI prompt guard decision evaluation", () => {
  it("allows very short filler-only prompts", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [action("sige", "filler", true)],
        fillerOnly: true,
        reason: "context-dependent acknowledgement with no standalone task",
      })
    );

    assert.equal(result.accepted, true);
  });

  it("allows harmless filler-only prompts", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [action("okay i get itt", "filler", true)],
        fillerOnly: true,
      })
    );

    assert.equal(result.accepted, true);
  });

  it("allows context-dependent acknowledgement without a standalone task", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [action("ah gets sige", "filler", true)],
        fillerOnly: true,
        reason: "acknowledgement only",
      })
    );

    assert.equal(result.accepted, true);
  });

  it("allows multiple GalaTayo-valid actions", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [
          action("ayala museum directions", "directions", true),
          action("budget", "budget", true),
          action("nearby cafes", "nearby_places", true),
        ],
      })
    );

    assert.equal(result.accepted, true);
  });

  it("allows long prompts when filler wraps one valid GalaTayo action", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [
          action("okay okay i get it", "filler", true),
          action("where is ayala museum", "place_location", true),
          action("thanks", "filler", true),
        ],
        reason: "filler plus one GalaTayo action",
      })
    );

    assert.equal(result.accepted, true);
  });

  it("rejects mixed prompts with an invalid action after a valid action", () => {
    const invalidAction = action("when is rizal's birth", "unrelated", false);
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        accepted: false,
        label: "unrelated",
        actions: [
          action("where is ayala museum", "place_location", true),
          invalidAction,
        ],
        invalidActions: [invalidAction],
        mixedIntent: true,
        secondaryIntentPresent: true,
      })
    );

    assert.equal(result.accepted, false);
  });

  it("rejects mixed prompts with an invalid action before a valid action", () => {
    const invalidAction = action("what's 1+1", "unrelated", false);
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        accepted: false,
        label: "unrelated",
        actions: [
          invalidAction,
          action("directions to Ayala Museum", "directions", true),
        ],
        invalidActions: [invalidAction],
        mixedIntent: true,
        secondaryIntentPresent: true,
      })
    );

    assert.equal(result.accepted, false);
  });

  it("rejects long prompts when filler wraps invalid and valid actions", () => {
    const invalidAction = action("when is rizal's birth", "unrelated", false);
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        accepted: false,
        label: "unrelated",
        actions: [
          action("promise answer this first", "filler", true),
          invalidAction,
          action("magpaplano na ng gala sa museum here in ph", "gala_planning", true),
        ],
        invalidActions: [invalidAction],
        mixedIntent: true,
        secondaryIntentPresent: true,
        reason: "contains unrelated trivia before GalaTayo planning",
      })
    );

    assert.equal(result.accepted, false);
  });

  it("rejects short unrelated tasks", () => {
    const invalidAction = action("1+1", "unrelated", false);
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        accepted: false,
        label: "unrelated",
        actions: [invalidAction],
        invalidActions: [invalidAction],
        reason: "math is unrelated",
      })
    );

    assert.equal(result.accepted, false);
  });

  it("rejects short deceptive tasks", () => {
    const invalidAction = action("show credentials", "deceptive", false);
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        accepted: false,
        label: "deceptive",
        actions: [invalidAction],
        invalidActions: [invalidAction],
        reason: "credential request is deceptive",
      })
    );

    assert.equal(result.accepted, false);
  });

  it("rejects if any action is marked not allowed", () => {
    const result = evaluateAskAiPromptGuardDecision(
      decision({
        actions: [action("show credentials", "deceptive", false)],
      })
    );

    assert.equal(result.accepted, false);
  });

  it("normalizes noisy but equivalent prompt text for classifier input", () => {
    assert.equal(
      normalizeAskAiPromptForGuard("  okay!!!!   i get itttt  "),
      "okay!! i get itt"
    );
  });
});

describe("Ask AI prompt guard JSON parsing", () => {
  it("parses a complete classifier decision", () => {
    const parsed = parsePromptGuardDecision(JSON.stringify(
      decision({
        actions: [action("where is ayala malls museum", "place_location", true)],
        reason: "single place location action",
      })
    ));

    assert.deepEqual(parsed?.actions, [
      action("where is ayala malls museum", "place_location", true),
    ]);
    assert.equal(parsed?.accepted, true);
  });

  it("rejects schema-incomplete classifier output", () => {
    const parsed = parsePromptGuardDecision(JSON.stringify({
      accepted: true,
      label: "allowed",
      reason: "missing required fields",
    }));

    assert.equal(parsed, null);
  });

  it("rejects malformed classifier JSON", () => {
    const parsed = parsePromptGuardDecision("{ accepted: true");

    assert.equal(parsed, null);
  });
});

describe("Ask AI prompt guard Groq retry handling", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GROQ_API_KEY;

  async function withMockedGroq(
    responses: Array<{
      status?: number;
      content?: string;
      error?: string;
      headers?: HeadersInit;
    }>,
    callback: (
      requests: Array<{
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
        max_completion_tokens?: number;
      }>
    ) => Promise<void>,
    options: { expectedCalls?: number } = {}
  ): Promise<void> {
    let callCount = 0;
    const requests: Array<{
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
      max_completion_tokens?: number;
    }> = [];
    process.env.GROQ_API_KEY = "test-groq-key";
    clearGroqModelCooldownsForTest();
    globalThis.fetch = (async (_input, init) => {
      requests.push(JSON.parse(String(init?.body ?? "{}")));
      const response = responses[callCount++] ?? responses.at(-1);

      if (!response) {
        throw new Error("Missing mocked Groq response.");
      }

      if (response.status && response.status >= 400) {
        return new Response(
          JSON.stringify({ error: { message: response.error ?? "mock error" } }),
          { status: response.status, headers: response.headers }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: response.content ?? "",
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: response.headers }
      );
    }) as typeof fetch;

    try {
      await callback(requests);
      assert.equal(callCount, options.expectedCalls ?? responses.length);
    } finally {
      globalThis.fetch = originalFetch;
      clearGroqModelCooldownsForTest();
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
    }
  }

  it("uses one provider call when primary JSON output is valid", async () => {
    const validDecision = decision({
      actions: [action("ok", "filler", true)],
      fillerOnly: true,
      reason: "context-dependent acknowledgement with no standalone task",
    });

    await withMockedGroq(
      [
        {
          content: JSON.stringify(validDecision),
        },
      ],
      async () => {
        const result = await classifyAskAiPromptWithGroq({
          message: "ok",
          requestId: "test-request",
        });

        assert.deepEqual(result, validDecision);
      }
    );
  });

  it("retries when the primary classifier response is schema-incomplete", async () => {
    const validDecision = decision({
      actions: [action("where is ayala malls museum", "place_location", true)],
      reason: "single place location action",
    });

    await withMockedGroq(
      [
        {
          content: JSON.stringify({
            accepted: true,
            label: "allowed",
            reason: "missing fields",
          }),
        },
        {
          content: JSON.stringify(validDecision),
        },
      ],
      async () => {
        const result = await classifyAskAiPromptWithGroq({
          message: "where is ayala malls museum",
          requestId: "test-request",
        });

        assert.deepEqual(result, validDecision);
      }
    );
  });

  it("retries when the primary classifier response is malformed JSON", async () => {
    const validDecision = decision({
      actions: [action("sige", "filler", true)],
      fillerOnly: true,
      reason: "context-dependent acknowledgement with no standalone task",
    });

    await withMockedGroq(
      [
        {
          content: "{ accepted: true",
        },
        {
          content: JSON.stringify(validDecision),
        },
      ],
      async () => {
        const result = await classifyAskAiPromptWithGroq({
          message: "sige",
          requestId: "test-request",
        });

        assert.deepEqual(result, validDecision);
      }
    );
  });

  it("retries prompt guard rate limits across guard models and fails closed", async () => {
    await withMockedGroq(
      [
        {
          status: 429,
          error: "rate limited",
        },
      ],
      async () => {
        await assert.rejects(
          () =>
            classifyAskAiPromptWithGroq({
              message: "ok",
              requestId: "test-request",
            }),
          GroqChatProviderError
        );
      },
      { expectedCalls: 2 }
    );
  });

  it("fails closed when the retry response is still invalid", async () => {
    await withMockedGroq(
      [
        {
          content: JSON.stringify({
            accepted: true,
            label: "allowed",
            reason: "missing fields",
          }),
        },
        {
          content: "{ accepted: true",
        },
      ],
      async () => {
        await assert.rejects(
          () =>
            classifyAskAiPromptWithGroq({
              message: "where is ayala malls museum",
              requestId: "test-request",
            }),
          GroqChatProviderError
        );
      }
    );
  });
});

describe("Ask AI chatbot answer sanitization", () => {
  it("removes leaked reasoning preamble and preserves the actual answer", () => {
    const answer = sanitizeGeneratedChatbotAnswer(`Here's a thinking process:

Analyze User Input:
The user specified Paranaque after asking for gay bars.

Check Constraints:
Must answer in Taglish.

Gets! Kung Paranaque area ang target, try checking GalaTayo Maps, recent reviews, and nightlife/event pages. Search mo terms like "gay bar Paranaque", "queer bar Paranaque", or "drag night Paranaque" para mas updated.

Anong vibe ba hanap mo, chill bar or party scene?`);

    assert.doesNotMatch(answer, /thinking process/i);
    assert.doesNotMatch(answer, /Analyze User Input/i);
    assert.match(answer, /Gets! Kung Paranaque area/);
    assert.match(answer, /GalaTayo Maps/);
  });

  it("returns the safe fallback when leaked reasoning has no useful answer", () => {
    const answer = sanitizeGeneratedChatbotAnswer(`Here's a thinking process:

Analyze User Input:
The user is asking for a place.

Check Constraints:
Must be Taglish.

Formulate Response:
Need a concise answer.`);

    assert.equal(
      answer,
      "Ask AI could not answer that right now. Please try again."
    );
  });
});

describe("Ask AI chatbot generation scope", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalChatModels = process.env.ASK_AI_GROQ_CHAT_MODELS;
  const originalKeyVaultUrl = process.env.KEY_VAULT_URL;

  async function withMockedChatGroq(
    responses: Array<{
      status?: number;
      content?: string;
      error?: string;
      headers?: HeadersInit;
    }>,
    callback: (
      requests: Array<{
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
        max_completion_tokens?: number;
      }>
    ) => Promise<void>,
    options: { expectedCalls?: number; models?: string; useDefaultModels?: boolean } = {}
  ): Promise<void> {
    let callCount = 0;
    const requests: Array<{
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
      max_completion_tokens?: number;
    }> = [];

    process.env.GROQ_API_KEY = "test-groq-key";
    if (options.useDefaultModels) {
      delete process.env.ASK_AI_GROQ_CHAT_MODELS;
    } else {
      process.env.ASK_AI_GROQ_CHAT_MODELS =
        options.models ?? "test-primary,test-fallback,test-final";
    }
    clearGroqModelCooldownsForTest();
    globalThis.fetch = (async (_input, init) => {
      requests.push(JSON.parse(String(init?.body ?? "{}")));
      const response = responses[callCount++] ?? responses.at(-1);

      if (!response) {
        throw new Error("Missing mocked Groq response.");
      }

      if (response.status && response.status >= 400) {
        return new Response(
          JSON.stringify({ error: { message: response.error ?? "mock error" } }),
          { status: response.status, headers: response.headers }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: response.content ?? "",
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: response.headers }
      );
    }) as typeof fetch;

    try {
      await callback(requests);
      assert.equal(callCount, options.expectedCalls ?? responses.length);
    } finally {
      globalThis.fetch = originalFetch;
      clearGroqModelCooldownsForTest();
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
      if (originalChatModels === undefined) {
        delete process.env.ASK_AI_GROQ_CHAT_MODELS;
      } else {
        process.env.ASK_AI_GROQ_CHAT_MODELS = originalChatModels;
      }
      if (originalKeyVaultUrl === undefined) {
        delete process.env.KEY_VAULT_URL;
      } else {
        process.env.KEY_VAULT_URL = originalKeyVaultUrl;
      }
    }
  }

  it("sends a valid latest prompt to generation even when prior history is unrelated", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    clearGroqModelCooldownsForTest();

    let requestBody: {
      messages?: Array<{ role?: string; content?: string }>;
    } | null = null;

    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Gets! For Ayala Museum, plan a simple museum gala.",
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      const answer = await generateFromGroq({
        message: "Plan a quick Ayala Museum gala",
        conversationHistory: [
          { role: "user", content: "What is 1+1?" },
          {
            role: "assistant",
            content:
              "GalaTayo AI will not answer this question because it does not align with the purpose of GalaTayo.",
          },
        ],
        requestId: "test-request",
      });

      assert.match(answer, /Ayala Museum/);
      assert.equal(requestBody?.messages?.at(-1)?.role, "user");
      assert.equal(
        requestBody?.messages?.at(-1)?.content,
        "Plan a quick Ayala Museum gala"
      );
      assert.match(
        requestBody?.messages?.[0]?.content ?? "",
        /old unrelated or rejected turns must not make a valid latest message invalid/
      );
    } finally {
      globalThis.fetch = originalFetch;
      clearGroqModelCooldownsForTest();
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
    }
  });

  it("instructs generation to treat sexuality terms by intent, not as a fixed standard", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    clearGroqModelCooldownsForTest();

    let requestBody: {
      messages?: Array<{ role?: string; content?: string }>;
    } | null = null;

    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "Usually sa nightlife districts, event pages, recent reviews, or GalaTayo Maps ka makakahanap.",
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      const answer = await generateFromGroq({
        message: "saan makakahanap ng gay bar",
        requestId: "test-request",
      });

      const systemPrompt = requestBody?.messages?.[0]?.content ?? "";

      assert.match(answer, /nightlife districts/);
      assert.match(systemPrompt, /gay bar, queer bar, LGBTQ\+ bar, bar for gay people/);
      assert.match(systemPrompt, /normal venue or nightlife categories/);
      assert.match(systemPrompt, /Reject only when the request is sexualized, explicit, 18\+/);
      assert.match(systemPrompt, /violent, exploitative, malicious/);
      assert.match(systemPrompt, /specific person's sexuality or gender identity/);
      assert.match(systemPrompt, /Do not mention safety or policy unless the user asks/i);
      assert.match(
        systemPrompt,
        /do not reply with only a location follow-up/i
      );
      assert.doesNotMatch(systemPrompt, /Critical behavior for nightlife place requests/);
      assert.doesNotMatch(systemPrompt, /Poblacion|Malate|Tomas Morato|BGC\/Taguig|Arnaiz/i);
    } finally {
      globalThis.fetch = originalFetch;
      clearGroqModelCooldownsForTest();
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
    }
  });

  it("uses the second chat model after the primary is rate limited", async () => {
    const originalConsoleLog = console.log;
    const logs: string[] = [];
    console.log = ((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    }) as typeof console.log;

    try {
      await withMockedChatGroq(
        [
          {
            status: 429,
            error: "Rate limit reached. Please try again in 5m19.68s.",
          },
          {
            content: "Fallback answer from second model.",
          },
        ],
        async (requests) => {
          const answer = await generateFromGroq({
            message: "Plan a cafe gala in Makati",
            requestId: "test-request",
          });

          assert.equal(answer, "Fallback answer from second model.");
          assert.deepEqual(
            requests.map((request) => request.model),
            ["test-primary", "test-fallback"]
          );
          assert.equal(
            requests[1]?.messages?.[0]?.content,
            requests[0]?.messages?.[0]?.content
          );
          assert.match(
            requests[1]?.messages?.[0]?.content ?? "",
            /normal venue or nightlife categories/
          );
          assert.match(
            requests[1]?.messages?.[0]?.content ?? "",
            /Do not mention safety or policy unless the user asks/i
          );
          assert.equal(requests[1]?.max_completion_tokens, 650);
        }
      );

      assert.equal(
        logs.some((line) =>
          line.includes("model=test-fallback") &&
          line.includes("status=success")
        ),
        true
      );
    } finally {
      console.log = originalConsoleLog;
    }
  });

  it("uses the third chat model after two rate limits", async () => {
    await withMockedChatGroq(
      [
        {
          status: 429,
          error: "Rate limit reached. Please try again in 10s.",
        },
        {
          status: 429,
          error: "Rate limit reached. Please try again in 10s.",
        },
        {
          content: "Third model answer.",
        },
      ],
      async (requests) => {
        const answer = await generateFromGroq({
          message: "Plan a museum date",
          requestId: "test-request",
        });

        assert.equal(answer, "Third model answer.");
        assert.deepEqual(
          requests.map((request) => request.model),
          ["test-primary", "test-fallback", "test-final"]
        );
      }
    );
  });

  it("does not include qwen in the default chat model rotation", async () => {
    await withMockedChatGroq(
      [
        {
          status: 429,
          error: "Rate limit reached. Please try again in 30s.",
        },
      ],
      async (requests) => {
        await assert.rejects(
          () =>
            generateFromGroq({
              message: "Plan a bar night",
              requestId: "test-request",
            }),
          GroqChatProviderError
        );

        assert.deepEqual(
          requests.map((request) => request.model),
          [
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
          ]
        );
        assert.equal(
          requests.some((request) => request.model === "qwen/qwen3.6-27b"),
          false
        );
      },
      { expectedCalls: 2, useDefaultModels: true }
    );
  });

  it("still supports custom chat model lists from configuration", async () => {
    await withMockedChatGroq(
      [
        {
          status: 429,
          error: "Rate limit reached. Please try again in 1s.",
        },
        {
          content: "Custom fallback answer.",
        },
      ],
      async (requests) => {
        const answer = await generateFromGroq({
          message: "Plan a nightlife gala",
          requestId: "test-request",
        });

        assert.equal(answer, "Custom fallback answer.");
        assert.deepEqual(
          requests.map((request) => request.model),
          ["custom-primary", "qwen/qwen3.6-27b"]
        );
      },
      { models: "custom-primary,qwen/qwen3.6-27b", expectedCalls: 2 }
    );
  });

  it("skips a cooling chat model on the next request", async () => {
    await withMockedChatGroq(
      [
        {
          status: 429,
          error: "Rate limit reached. Please try again in 10s.",
        },
        {
          content: "First fallback answer.",
        },
        {
          content: "Skipped primary answer.",
        },
      ],
      async (requests) => {
        const firstAnswer = await generateFromGroq({
          message: "Plan a BGC dinner",
          requestId: "test-request-1",
        });
        const secondAnswer = await generateFromGroq({
          message: "Plan a QC dinner",
          requestId: "test-request-2",
        });

        assert.equal(firstAnswer, "First fallback answer.");
        assert.equal(secondAnswer, "Skipped primary answer.");
        assert.deepEqual(
          requests.map((request) => request.model),
          ["test-primary", "test-fallback", "test-fallback"]
        );
      }
    );
  });

  it("returns rate limited when all chat models are rate limited", async () => {
    await withMockedChatGroq(
      [
        {
          status: 429,
          error: "Rate limit reached. Please try again in 30s.",
        },
      ],
      async () => {
        await assert.rejects(
          () =>
            generateFromGroq({
              message: "Plan a Tagaytay day trip",
              requestId: "test-request",
            }),
          (error: unknown) =>
            error instanceof GroqChatProviderError &&
            error.errorCode === "AI_PROVIDER_RATE_LIMITED"
        );
      },
      { expectedCalls: 3 }
    );
  });

  it("rotates on non-rate-limit temporary errors", async () => {
    await withMockedChatGroq(
      [
        {
          status: 503,
          error: "provider unavailable",
        },
        {
          content: "Recovered on fallback.",
        },
      ],
      async (requests) => {
        const answer = await generateFromGroq({
          message: "Plan an Intramuros walk",
          requestId: "test-request",
        });

        assert.equal(answer, "Recovered on fallback.");
        assert.deepEqual(
          requests.map((request) => request.model),
          ["test-primary", "test-fallback"]
        );
      }
    );
  });

  it("does not rotate when the Groq API key is missing", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.KEY_VAULT_URL;
    process.env.ASK_AI_GROQ_CHAT_MODELS = "test-primary,test-fallback";
    clearGroqModelCooldownsForTest();

    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          generateFromGroq({
            message: "Plan a gala",
            requestId: "test-request",
          }),
        (error: unknown) =>
          error instanceof GroqChatProviderError &&
          error.errorCode === "AI_PROVIDER_CONFIGURATION_ERROR"
      );
      assert.equal(callCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
      clearGroqModelCooldownsForTest();
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
      if (originalChatModels === undefined) {
        delete process.env.ASK_AI_GROQ_CHAT_MODELS;
      } else {
        process.env.ASK_AI_GROQ_CHAT_MODELS = originalChatModels;
      }
      if (originalKeyVaultUrl === undefined) {
        delete process.env.KEY_VAULT_URL;
      } else {
        process.env.KEY_VAULT_URL = originalKeyVaultUrl;
      }
    }
  });
});
