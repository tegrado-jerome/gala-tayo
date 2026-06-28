import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { checkGuestRateLimit } from "../utils/rateLimit";

function getClientIp(request: HttpRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "127.0.0.1";
}

export async function rateLimitTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing guest rate limit...");

  const ipAddress = getClientIp(request);
  const result = checkGuestRateLimit(ipAddress);

  if (!result.allowed) {
    return {
      status: 429,
      jsonBody: {
        message: "Guest daily limit reached.",
        ipAddress,
        ...result,
      },
    };
  }

  return {
    status: 200,
    jsonBody: {
      message: "Guest request allowed.",
      ipAddress,
      ...result,
    },
  };
}

app.http("rateLimitTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "rate-limit-test",
  handler: rateLimitTest,
});