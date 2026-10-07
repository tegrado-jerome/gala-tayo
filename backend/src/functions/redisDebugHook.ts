import { app } from "@azure/functions";
import { withRedisCommandCount } from "../services/redisCacheService";

// REDIS_DEBUG=1 logs how many Redis commands each invocation sent, to find what eats the Upstash quota.
if (process.env.REDIS_DEBUG === "1") {
  app.hook.preInvocation((hookContext) => {
    const handler = hookContext.functionHandler;
    const context = hookContext.invocationContext;
    hookContext.functionHandler = async (...args: unknown[]) => {
      const { result, commands } = await withRedisCommandCount(() => Promise.resolve(handler(...(args as Parameters<typeof handler>))));
      context.log(`[redis] ${context.functionName}: ${commands} command(s)`);
      return result;
    };
  });
}
