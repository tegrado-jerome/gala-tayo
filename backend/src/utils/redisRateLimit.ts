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

/** Per-instance counters: public reads use these instead of Redis, and Redis keys over their limit are remembered here. */
const localCounters = new MemoryCache(5000);

export const localCounterStore: WindowCounterStore = {
  incr: async (key) => {
    const count = (localCounters.get<number>(key) ?? 0) + 1;
    localCounters.set(key, count, 24 * 60 * 60);
    return count;
  },
  expire: async (key, seconds) => {
    const count = localCounters.get<number>(key);
    if (count !== undefined) localCounters.set(key, count, seconds);
  },
};

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

function openResult(maxRequests: number, windowSeconds: number): RateLimitResult {
  return { allowed: true, remaining: maxRequests, limit: maxRequests, resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString() };
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

  const counterStore = store ?? (await getRedisClient());

  if (!counterStore) {
    return openResult(maxRequests, windowSeconds);
  }

  try {
    const result = await countInFixedWindow(counterStore, key, maxRequests, windowSeconds, now);

    if (!result.allowed) {
      localCounters.set(blockedKey, result.resetAt, Math.max((Date.parse(result.resetAt) - now) / 1000, 1));
    }

    return result;
  } catch {
    return openResult(maxRequests, windowSeconds);
  }
}

export { getClientIp };

const TOO_MANY_REQUESTS = {
  allowed: false,
  response: {
    status: 429,
    jsonBody: { message: "Too many requests. Please try again later." },
  },
};

/** Shared limit across all instances (Redis). Use for writes, auth and AI, where the limit protects something. */
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
