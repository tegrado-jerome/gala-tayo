import { getRedisClient } from "../services/redisCacheService";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string;
};

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = await getRedisClient();

  if (!client) {
    return { allowed: false, remaining: 0, limit: maxRequests, resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString() };
  }

  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / (windowSeconds * 1000))}`;

  try {
    const count = await client.incr(windowKey);

    if (count === 1) {
      await client.expire(windowKey, windowSeconds);
    }

    const ttl = await client.ttl(windowKey);
    const effectiveTtl = typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds;
    const resetAt = new Date(now + effectiveTtl * 1000).toISOString();
    const allowed = count <= maxRequests;
    const remaining = Math.max(maxRequests - count, 0);

    return { allowed, remaining, limit: maxRequests, resetAt };
  } catch {
    return { allowed: false, remaining: 0, limit: maxRequests, resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString() };
  }
}

export async function checkRedisCooldown(
  key: string,
  cooldownMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const client = await getRedisClient();

  if (!client) {
    return { allowed: false, retryAfterMs: cooldownMs };
  }

  const cooldownKey = `cooldown:${key}`;

  try {
    const existing = await client.get<number>(cooldownKey);

    if (existing) {
      const elapsed = Date.now() - existing;
      if (elapsed < cooldownMs) {
        return { allowed: false, retryAfterMs: cooldownMs - elapsed };
      }
    }

    await client.set(cooldownKey, Date.now(), { ex: Math.ceil(cooldownMs / 1000) });
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    return { allowed: false, retryAfterMs: cooldownMs };
  }
}

export function getClientIp(request: { headers: { get: (name: string) => string | null } }): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "127.0.0.1";
}

export async function checkEndpointRateLimit(
  request: { headers: { get: (name: string) => string | null } },
  endpointName: string,
  maxRequests: number = 30,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; response?: { status: number; jsonBody: { message: string } } }> {
  const ip = getClientIp(request);
  const result = await checkRedisRateLimit(`endpoint:${endpointName}:${ip}`, maxRequests, windowSeconds);

  if (!result.allowed) {
    return {
      allowed: false,
      response: {
        status: 429,
        jsonBody: { message: "Too many requests. Please try again later." },
      },
    };
  }

  return { allowed: true };
}
