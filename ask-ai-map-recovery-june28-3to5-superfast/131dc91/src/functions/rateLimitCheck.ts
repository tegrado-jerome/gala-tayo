import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";
import {
  getGuestRateLimitStatus,
  getRegisteredUserRateLimitStatus,
} from "../utils/rateLimit";

function getClientIp(request: HttpRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "127.0.0.1";
}

export async function rateLimitCheck(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Checking rate limit status...");

  try {
    const user = await validateJwt(request);
    const result = getRegisteredUserRateLimitStatus(user.id);

    return {
      status: 200,
      jsonBody: {
        userType: "registered",
        user,
        ...result,
      },
    };
  } catch {
    const ipAddress = getClientIp(request);
    const result = getGuestRateLimitStatus(ipAddress);

    return {
      status: 200,
      jsonBody: {
        userType: "guest",
        ipAddress,
        ...result,
      },
    };
  }
}

app.http("rateLimitCheck", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "rate-limit/check",
  handler: rateLimitCheck,
});