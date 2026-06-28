import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";

export async function authSession(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Checking auth session...");

  try {
    const user = await validateJwt(request);

    return {
      status: 200,
      jsonBody: {
        authenticated: true,
        user,
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 401,
      jsonBody: {
        authenticated: false,
        user: null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("authSession", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/session",
  handler: authSession,
});