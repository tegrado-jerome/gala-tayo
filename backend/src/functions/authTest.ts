import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";

export async function authTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing JWT validation...");

  try {
    const user = await validateJwt(request);

    return {
      status: 200,
      jsonBody: {
        message: "JWT is valid.",
        user,
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

app.http("authTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth-test",
  handler: authTest,
});