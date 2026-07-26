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
  generateFromGroq,
  parsePromptGuardDecision,
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
    responses: Array<{ status?: number; content?: string; error?: string }>,
    callback: () => Promise<void>
  ): Promise<void> {
    let callCount = 0;
    process.env.GROQ_API_KEY = "test-groq-key";
    globalThis.fetch = (async () => {
      const response = responses[callCount++] ?? responses.at(-1);

      if (!response) {
        throw new Error("Missing mocked Groq response.");
      }

      if (response.status && response.status >= 400) {
        return new Response(
          JSON.stringify({ error: { message: response.error ?? "mock error" } }),
          { status: response.status }
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
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      await callback();
      assert.equal(callCount, responses.length);
    } finally {
      globalThis.fetch = originalFetch;
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

  it("does not retry provider rate limits", async () => {
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
      }
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

describe("Ask AI chatbot generation scope", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GROQ_API_KEY;

  it("sends a valid latest prompt to generation even when prior history is unrelated", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";

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
      if (originalApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalApiKey;
      }
    }
  });
});
