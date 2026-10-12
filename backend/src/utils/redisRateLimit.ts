import { getRedisClient } from "../services/redisCacheService";
import { getClientIp } from "./clientIp";
import { MemoryCache } from "./memoryCache";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
};

export type WindowCounterStore = {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
};

function memoryCounterStore(cache: MemoryCache): WindowCounterStore {
  return {
    incr: async (key) => {
      const count = (cache.get<number>(key) ?? 0) + 1;
      cache.set(key, count, 24 * 60 * 60);
      return count;
    },
    expire: async (key, seconds) => {
      const count = cache.get<number>(key);
      if (count !== undefined) cache.set(key, count, seconds);
    },
  };
}

/** Per-instance counters: public reads use these instead of Redis, and Redis keys over their limit are remembered here. */
const localCounters = new MemoryCache(5000);
export const localCounterStore = memoryCounterStore(localCounters);

/**
 * Shared limits fall back to these per-instance counters while Redis is missing or failing, so auth, email and AI
 * limits still hold (fail closed, per SECURITY.md). Kept apart from the public-read counters so read traffic can't
 * evict them; each instance counts on its own, so the effective limit is the limit times the running instances.
 */
const fallbackCounterStore = memoryCounterStore(new MemoryCache(20_000));

/** After a Redis error, skip Redis for a minute instead of paying a failed round trip on every request. */
const REDIS_RETRY_AFTER_MS = 60_000;
let redisDownUntil = 0;

/**
 * Fixed-window counter: one INCR per request, plus an EXPIRE only on the window's first request. The key holds
 * the window number, so the reset time is known without asking Redis for the TTL.
 */
export async function countInFixedWindow(
  store: WindowCounterStore,
  key: string,
  maxRequests: number,
  windowSeconds: number,
  now = Date.now()
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowNumber = Math.floor(now / windowMs);
  const windowKey = `ratelimit:${key}:${windowNumber}`;
  const count = await store.incr(windowKey);

  if (count === 1) {
    await store.expire(windowKey, windowSeconds);
  }

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(maxRequests - count, 0),
    limit: maxRequests,
    resetAt: new Date((windowNumber + 1) * windowMs).toISOString(),
  };
}

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
  { now = Date.now(), store }: { now?: number; store?: WindowCounterStore } = {}
): Promise<RateLimitResult> {
  // A key already over its limit stays blocked until its window ends, without spending more Redis commands.
  const blockedKey = `blocked:${key}:${Math.floor(now / (windowSeconds * 1000))}`;
  const blockedUntil = localCounters.get<string>(blockedKey);

  if (blockedUntil) {
    return { allowed: false, remaining: 0, limit: maxRequests, resetAt: blockedUntil };
  }

  const redis = store ?? (now < redisDownUntil ? null : await getRedisClient());
  let result: RateLimitResult | null = null;

  if (redis) {
    try {
      result = await countInFixedWindow(redis, key, maxRequests, windowSeconds, now);
    } catch {
      if (!store) redisDownUntil = now + REDIS_RETRY_AFTER_MS;
    }
  }

  result ??= await countInFixedWindow(fallbackCounterStore, key, maxRequests, windowSeconds, now);

  if (!result.allowed) {
    localCounters.set(blockedKey, result.resetAt, Math.max((Date.parse(result.resetAt) - now) / 1000, 1));
  }

  return result;
}

export { getClientIp };

const TOO_MANY_REQUESTS = {
  allowed: false,
  response: {
    status: 429,
    jsonBody: { message: "Too many requests. Please try again later." },
  },
};

/** Shared limit across all instances (Redis, or per instance while Redis is down). Use for writes, auth and AI, where the limit protects something. */
export async function checkEndpointRateLimit(
  request: { headers: { get: (name: string) => string | null } },
  endpointName: string,
  maxRequests: number = 30,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; response?: { status: number; jsonBody: { message: string } } }> {
  const ip = getClientIp(request);
  const result = await checkRedisRateLimit(`endpoint:${endpointName}:${ip}`, maxRequests, windowSeconds);
  return result.allowed ? { allowed: true } : TOO_MANY_REQUESTS;
}

/**
 * Per-instance limit kept in memory, for public reads (place pages, lists, SEO). It still stops a single
 * client hammering an instance, but costs no Redis commands; each instance counts on its own.
 */
export async function checkPublicReadRateLimit(
  request: { headers: { get: (name: string) => string | null } },
  endpointName: string,
  maxRequests: number = 30,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; response?: { status: number; jsonBody: { message: string } } }> {
  const ip = getClientIp(request);
  const result = await countInFixedWindow(localCounterStore, `endpoint:${endpointName}:${ip}`, maxRequests, windowSeconds);
  return result.allowed ? { allowed: true } : TOO_MANY_REQUESTS;
}
