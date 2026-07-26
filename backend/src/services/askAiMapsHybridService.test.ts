import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GoogleGenAI } from "@google/genai";
import { askAiMapsModelFallbacksForTest } from "./askAiMapsHybridService";

function createIntent(overrides: Record<string, unknown> = {}) {
  return {
    rawQuery: "cafes in Makati",
    normalizedQuery: "cafes in makati",
    queryType: "general_discovery",
    categoryIntent: "cafe",
    galaIntents: [],
    searchAreaText: "Makati, Philippines",
    city: "Makati",
    province: "Metro Manila",
    nearMe: false,
    strictCategory: false,
    strictness: "soft",
    budgetIntent: "unknown",
    budgetAmount: null,
    budgetPerPerson: undefined,
    userLocation: null,
    ...overrides,
  };
}

function createPlace(overrides: Record<string, unknown> = {}) {
  return {
    id: "place-1",
    name: "Test Cafe",
    reason: "Recommended based on your map search.",
    whyThisFits: "Recommended based on your map search.",
    category: "Cafe",
    displayCategory: "Cafe",
    rawCategory: "Cafe",
    address: "Makati",
    lat: null,
    lng: null,
    latitude: null,
    longitude: null,
    hasPin: false,
    coordinateStatus: "missing_coordinates",
    coordinateConfidence: "none",
    matchConfidence: "medium",
    coordinates: null,
    rating: 4.5,
    reviewCount: 100,
    openingHoursSummary: null,
    googleMapsUri: null,
    googlePlaceId: null,
    geoapifyPlaceId: null,
    optionalDetails: {
      categoryText: "Cafe",
      addressText: "Makati",
      reviewSignals: [],
      openingHoursSummary: null,
    },
    source: {
      recommendation: "gemini_map_grounding",
      coordinates: "none",
      details: "gemini_map_grounding",
    },
    verification: {
      nameMatched: true,
      locationMatched: true,
      categoryMatched: true,
      coordinateVerified: false,
    },
    matchScore: 70,
    distanceKm: null,
    exactMatch: true,
    mediumMatch: false,
    isFallback: false,
    resultTier: "exact",
    relevanceSignals: ["google_maps_grounded"],
    ...overrides,
  };
}

describe("Ask AI Maps model fallback configuration", () => {
  const originalGeminiModels = process.env.ASK_AI_MAPS_GEMINI_MODELS;

  it("uses free-tier Gemini defaults", () => {
    delete process.env.ASK_AI_MAPS_GEMINI_MODELS;

    assert.deepEqual(
      askAiMapsModelFallbacksForTest.getConfiguredModelList(
        "ASK_AI_MAPS_GEMINI_MODELS",
        ["gemini-2.5-flash-lite", "gemini-2.5-flash"]
      ),
      ["gemini-2.5-flash-lite", "gemini-2.5-flash"]
    );

    if (originalGeminiModels === undefined) {
      delete process.env.ASK_AI_MAPS_GEMINI_MODELS;
    } else {
      process.env.ASK_AI_MAPS_GEMINI_MODELS = originalGeminiModels;
    }
  });

  it("dedupes configured model lists", () => {
    process.env.ASK_AI_MAPS_GEMINI_MODELS = " first-model, second-model, first-model ,, ";

    assert.deepEqual(
      askAiMapsModelFallbacksForTest.getConfiguredModelList(
        "ASK_AI_MAPS_GEMINI_MODELS",
        ["default-model"]
      ),
      ["first-model", "second-model"]
    );

    if (originalGeminiModels === undefined) {
      delete process.env.ASK_AI_MAPS_GEMINI_MODELS;
    } else {
      process.env.ASK_AI_MAPS_GEMINI_MODELS = originalGeminiModels;
    }
  });
});

describe("Ask AI Maps Gemini model rotation", () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModels = process.env.ASK_AI_MAPS_GEMINI_MODELS;

  async function withMockedGemini(
    responses: Array<Record<string, unknown> | Error>,
    callback: (models: string[]) => Promise<void>
  ) {
    const models: string[] = [];
    let index = 0;

    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.ASK_AI_MAPS_GEMINI_MODELS = "test-gemini-primary,test-gemini-fallback";

    class FakeGoogleGenAI {
      models = {
        generateContent: async (request: { model: string }) => {
          models.push(request.model);
          const response = responses[index++] ?? responses.at(-1);
          if (response instanceof Error) throw response;
          return response;
        },
      };

      constructor(_options: { apiKey: string }) {}
    }

    askAiMapsModelFallbacksForTest.setGoogleGenAIConstructor(FakeGoogleGenAI as unknown as typeof GoogleGenAI);

    try {
      await callback(models);
    } finally {
      askAiMapsModelFallbacksForTest.setGoogleGenAIConstructor(null);
      if (originalGeminiApiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalGeminiApiKey;
      }
      if (originalGeminiModels === undefined) {
        delete process.env.ASK_AI_MAPS_GEMINI_MODELS;
      } else {
        process.env.ASK_AI_MAPS_GEMINI_MODELS = originalGeminiModels;
      }
    }
  }

  it("falls back when the first Gemini model returns no candidates", async () => {
    await withMockedGemini(
      [
        { text: JSON.stringify({ places: [] }), candidates: [] },
        {
          text: JSON.stringify({
            places: [{ name: "Fallback Cafe", category: "Cafe", address: "Makati" }],
          }),
          candidates: [],
        },
      ],
      async (models) => {
        const result = await askAiMapsModelFallbacksForTest.callGeminiMapsGrounding(createIntent() as never);

        assert.equal(result.modelUsed, "test-gemini-fallback");
        assert.equal(result.candidates[0]?.name, "Fallback Cafe");
        assert.deepEqual(models, ["models/test-gemini-primary", "models/test-gemini-fallback"]);
      }
    );
  });

  it("falls back when the first Gemini model throws", async () => {
    await withMockedGemini(
      [
        new Error("provider unavailable"),
        {
          text: JSON.stringify({
            places: [{ name: "Recovered Cafe", category: "Cafe", address: "Makati" }],
          }),
          candidates: [],
        },
      ],
      async () => {
        const result = await askAiMapsModelFallbacksForTest.callGeminiMapsGrounding(createIntent() as never);

        assert.equal(result.modelUsed, "test-gemini-fallback");
        assert.equal(result.candidates[0]?.name, "Recovered Cafe");
      }
    );
  });
});

describe("Ask AI Maps Groq why-this-fits rotation", () => {
  const originalFetch = globalThis.fetch;
  const originalGroqApiKey = process.env.GROQ_API_KEY;
  const originalGroqModels = process.env.ASK_AI_MAPS_GROQ_WHY_MODELS;

  async function withMockedGroq(
    responses: Array<{ status?: number; content?: string; error?: string }>,
    callback: (models: string[]) => Promise<void>
  ) {
    const models: string[] = [];
    let index = 0;

    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.ASK_AI_MAPS_GROQ_WHY_MODELS = "test-groq-primary,test-groq-fallback,test-groq-final";

    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      models.push(body.model ?? "");
      const response = responses[index++] ?? responses.at(-1);

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
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    try {
      await callback(models);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGroqApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalGroqApiKey;
      }
      if (originalGroqModels === undefined) {
        delete process.env.ASK_AI_MAPS_GROQ_WHY_MODELS;
      } else {
        process.env.ASK_AI_MAPS_GROQ_WHY_MODELS = originalGroqModels;
      }
    }
  }

  const validExplanation = JSON.stringify({
    explanations: {
      "0": "Pasok siya sa cafe search mo based on the map result. Good siyang i-check beside the other results para makita mo which one fits your exact lakad better.",
    },
  });

  it("uses the primary Groq why-this-fits model when it succeeds", async () => {
    await withMockedGroq(
      [{ content: validExplanation }],
      async (models) => {
        const result = await askAiMapsModelFallbacksForTest.generateWhyThisFitsBatch(
          [createPlace() as never],
          createIntent() as never
        );

        assert.ok(result?.["0"]);
        assert.deepEqual(models, ["test-groq-primary"]);
      }
    );
  });

  it("falls back on Groq rate limits", async () => {
    await withMockedGroq(
      [
        { status: 429, error: "rate limited" },
        { content: validExplanation },
      ],
      async (models) => {
        const result = await askAiMapsModelFallbacksForTest.generateWhyThisFitsBatch(
          [createPlace() as never],
          createIntent() as never
        );

        assert.ok(result?.["0"]);
        assert.deepEqual(models, ["test-groq-primary", "test-groq-fallback"]);
      }
    );
  });

  it("falls back on invalid Groq JSON", async () => {
    await withMockedGroq(
      [
        { content: "{ explanations:" },
        { content: validExplanation },
      ],
      async (models) => {
        const result = await askAiMapsModelFallbacksForTest.generateWhyThisFitsBatch(
          [createPlace() as never],
          createIntent() as never
        );

        assert.ok(result?.["0"]);
        assert.deepEqual(models, ["test-groq-primary", "test-groq-fallback"]);
      }
    );
  });

  it("returns null when all Groq why-this-fits models fail", async () => {
    await withMockedGroq(
      [{ status: 503, error: "unavailable" }],
      async (models) => {
        const result = await askAiMapsModelFallbacksForTest.generateWhyThisFitsBatch(
          [createPlace() as never],
          createIntent() as never
        );

        assert.equal(result, null);
        assert.deepEqual(models, ["test-groq-primary", "test-groq-fallback", "test-groq-final"]);
      }
    );
  });
});
