import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { touchRedisKeepAlive } from "../services/redisCacheService";

let cacheCheck: { at: number; state: "ok" | "down" } | null = null;

/** One SET at most once a minute per instance, so this public check can't burn cache commands. */
async function cacheState(): Promise<"ok" | "down"> {
  if (cacheCheck && Date.now() - cacheCheck.at < 60_000) return cacheCheck.state;
  cacheCheck = { at: Date.now(), state: (await touchRedisKeepAlive()) ? "ok" : "down" };
  return cacheCheck.state;
}

export async function health(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Health check requested.");
  // One SET shows whether the cache still accepts writes (a used-up free plan fails quietly elsewhere).
  const cache = request.query.get("cache") === "1" ? await cacheState() : undefined;

  return {
    status: 200,
    jsonBody: {
      status: "ok",
      service: "galatayo-api",
      timestamp: new Date().toISOString(),
      ...(cache ? { cache } : {}),
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
