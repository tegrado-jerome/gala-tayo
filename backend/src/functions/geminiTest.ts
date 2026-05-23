import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { buildGeminiPrompt } from "../utils/geminiPrompt";
import { generateGeminiResponse } from "../services/geminiService";

type GeminiTestBody = {
  prompt?: string;
  userType?: "guest" | "registered";
};

export async function geminiTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing Gemini API response...");

  try {
    const body = (await request.json()) as GeminiTestBody;

    if (!body.prompt || body.prompt.trim() === "") {
      return {
        status: 400,
        jsonBody: {
          message: "Prompt is required.",
        },
      };
    }

    const userType = body.userType ?? "guest";

    const geminiPrompt = buildGeminiPrompt({
      userPrompt: body.prompt.trim(),
      userType,
    });

    const geminiResponse = await generateGeminiResponse({
      prompt: geminiPrompt,
    });

    return {
      status: 200,
      jsonBody: {
        message: "Gemini response generated successfully.",
        userType,
        originalPrompt: body.prompt.trim(),
        geminiResponse,
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to generate Gemini response.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("geminiTest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "gemini/test",
  handler: geminiTest,
});