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
import {
  GeminiServiceError,
  generateGeminiResponse,
} from "../services/geminiService";

type GeminiTestBody = {
  prompt?: string;
  userType?: string;
};

function getGeminiErrorMessage(status: number): string {
  switch (status) {
    case 403:
      return "Gemini API request was denied.";
    case 429:
      return "Gemini API rate limit reached.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Gemini API is currently unavailable.";
    default:
      return "Failed to generate Gemini response.";
  }
}

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

    if (error instanceof GeminiServiceError) {
      return {
        status: error.status,
        jsonBody: {
          message: getGeminiErrorMessage(error.status),
          error: error.message,
        },
      };
    }

    return {
      status: 400,
      jsonBody: {
        message: "Invalid request body.",
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
