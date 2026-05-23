import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  buildGeminiPrompt,
  isValidGeminiUserType,
} from "../utils/geminiPrompt";

type GeminiPromptTestBody = {
  prompt?: string;
  userType?: string;
};

export async function geminiPromptTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing GalaTayo Gemini prompt template...");

  try {
    const body = (await request.json()) as GeminiPromptTestBody;

    if (!body.prompt || body.prompt.trim() === "") {
      return {
        status: 400,
        jsonBody: {
          message: "Prompt is required.",
        },
      };
    }

    const userType = body.userType ?? "guest";

    if (!isValidGeminiUserType(userType)) {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid userType. Allowed values are guest or registered.",
        },
      };
    }

    const geminiPrompt = buildGeminiPrompt({
      userPrompt: body.prompt.trim(),
      userType,
    });

    return {
      status: 200,
      jsonBody: {
        message: "Gemini prompt generated successfully.",
        userType,
        originalPrompt: body.prompt.trim(),
        geminiPrompt,
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 400,
      jsonBody: {
        message: "Invalid request body.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("geminiPromptTest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "gemini/prompt-test",
  handler: geminiPromptTest,
});
