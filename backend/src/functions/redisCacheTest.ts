import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getRedisCacheStatus, probeRedisCache } from "../services/redisCacheService";

export async function redisCacheTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Testing Redis cache connection...");

  const cacheKey = `debug:redis-cache-test:${randomUUID()}`;
  const cacheValue = new Date().toISOString();

  try {
    const status = await getRedisCacheStatus();
    const probe = await probeRedisCache(cacheKey, cacheValue);

    return {
      status: 200,
      jsonBody: {
        message: "Redis cache probe completed.",
        status,
        probe,
        cacheKey,
      },
    };
  } catch (error) {
    context.error(error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to probe Redis cache.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("redisCacheTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "redis-cache-test",
  handler: redisCacheTest,
});
