import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";
import { checkRegisteredUserRateLimit } from "../utils/rateLimit";

export async function registeredRateLimitTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing registered user rate limit...");

  try {
    const user = await validateJwt(request);
    const result = checkRegisteredUserRateLimit(user.id);

    if (!result.allowed) {
      return {
        status: 429,
        jsonBody: {
          message: "Registered user daily limit reached.",
          user,
          ...result,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "Registered user request allowed.",
        user,
        ...result,
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 401,
      jsonBody: {
        message: "Unauthorized.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("registeredRateLimitTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "registered-rate-limit-test",
  handler: registeredRateLimitTest,
});