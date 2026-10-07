import { app, InvocationContext, Timer } from "@azure/functions";
import { touchRedisKeepAlive } from "../services/redisCacheService";

// Upstash deletes free databases after 14 days without commands; one SET a day is enough.
export async function redisKeepAlive(
  _timer: Timer,
  context: InvocationContext
): Promise<void> {
  if (await touchRedisKeepAlive()) {
    context.log("Redis keep-alive succeeded.");
  } else {
    context.warn("Redis keep-alive failed; the cache may be unreachable.");
  }
}

app.timer("redisKeepAlive", {
  schedule: "0 0 3 * * *",
  handler: redisKeepAlive,
});
