import { app, InvocationContext, Timer } from "@azure/functions";
import { probeRedisCache } from "../services/redisCacheService";

// Upstash deletes free databases after 14 days without commands.
export async function redisKeepAlive(
  _timer: Timer,
  context: InvocationContext
): Promise<void> {
  const result = await probeRedisCache("keepalive", new Date().toISOString());

  if (result.ok) {
    context.log("Redis keep-alive succeeded.");
  } else {
    context.warn("Redis keep-alive failed; the cache may be unreachable.");
  }
}

app.timer("redisKeepAlive", {
  schedule: "0 0 3 * * *",
  handler: redisKeepAlive,
});
