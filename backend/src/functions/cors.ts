import { app, HttpRequest, InvocationContext, HttpResponseInit } from "@azure/functions";
import { buildCorsHeaders } from "../utils/cors";

export async function corsPreflightHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const origin = request.headers?.get?.("origin") ?? null;
  return {
    status: 204,
    headers: {
      ...buildCorsHeaders(origin),
      "Content-Length": "0",
    },
  };
}

app.http("corsPreflight", {
  methods: ["OPTIONS"],
  route: "{*path}",
  authLevel: "anonymous",
  handler: corsPreflightHandler,
});

app.hook.postInvocation(async (hookContext) => {
  const result = hookContext.result;
  if (!result || typeof result !== "object" || !("status" in result)) return;

  const maybeRequest = hookContext.inputs?.[0] as
    | { headers?: { get?: (name: string) => string | null } }
    | undefined;
  const origin = maybeRequest?.headers?.get?.("origin") ?? null;
  const response = result as HttpResponseInit;

  response.headers = {
    ...response.headers,
    ...buildCorsHeaders(origin),
  };
});
