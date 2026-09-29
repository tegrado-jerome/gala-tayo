import { Redis } from "@upstash/redis";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";

type JsonCacheOptions = {
  ttlSeconds?: number;
};

let redisClientPromise: Promise<Redis | null> | null = null;

async function readOptionalSecret(secretName: string): Promise<string | null> {
  try {
    const value = await getSecret(secretName);
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  } catch {
    return null;
  }
}

async function resolveRedisConfig(): Promise<{ url: string; token: string } | null> {
  const [kvUrl, kvToken, legacyKvUrl, legacyKvToken] = await Promise.all([
    readOptionalSecret(KEY_VAULT_SECRET_NAMES.REDIS_REST_URL),
    readOptionalSecret(KEY_VAULT_SECRET_NAMES.REDIS_REST_TOKEN),
    readOptionalSecret(KEY_VAULT_SECRET_NAMES.UPSTASH_REDIS_REST_URL),
    readOptionalSecret(KEY_VAULT_SECRET_NAMES.UPSTASH_REDIS_REST_TOKEN),
  ]);

  const url =
    kvUrl ??
    process.env.REDIS_REST_URL?.trim() ??
    legacyKvUrl ??
    process.env.UPSTASH_REDIS_REST_URL?.trim() ??
    null;
  const token =
    kvToken ??
    process.env.REDIS_REST_TOKEN?.trim() ??
    legacyKvToken ??
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ??
    null;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export async function getRedisClient(): Promise<Redis | null> {
  if (!redisClientPromise) {
    redisClientPromise = resolveRedisConfig()
      .then((config) => {
        if (!config) {
          return null;
        }

        // The cache is optional, so fail fast instead of the SDK's default
        // five retries with exponential backoff (~4s per call when Redis is down).
        return new Redis({
          url: config.url,
          token: config.token,
          retry: { retries: 1, backoff: () => 100 },
        });
      })
      .catch(() => null);
  }

  return redisClientPromise;
}

export async function getRedisCacheStatus(): Promise<{
  configured: boolean;
  available: boolean;
}> {
  const config = await resolveRedisConfig();
  const client = await getRedisClient();

  return {
    configured: Boolean(config),
    available: Boolean(client),
  };
}

export async function probeRedisCache(key: string, value: string): Promise<{
  ok: boolean;
  wrote: boolean;
  readBack: string | null;
}> {
  const client = await getRedisClient();

  if (!client) {
    return {
      ok: false,
      wrote: false,
      readBack: null,
    };
  }

  try {
    await client.set(key, value, { ex: 600 });
    const readBack = await client.get<string>(key);

    return {
      ok: readBack === value,
      wrote: true,
      readBack: readBack ?? null,
    };
  } catch {
    return {
      ok: false,
      wrote: false,
      readBack: null,
    };
  }
}

export async function getJsonCacheValue<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  try {
    const value = await client.get<T>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setJsonCacheValue<T>(
  key: string,
  value: T,
  options: JsonCacheOptions = {}
): Promise<boolean> {
  const client = await getRedisClient();

  if (!client) {
    return false;
  }

  try {
    if (typeof options.ttlSeconds === "number" && options.ttlSeconds > 0) {
      await client.set(key, value, { ex: options.ttlSeconds });
      return true;
    }

    await client.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export async function deleteJsonCacheValue(key: string): Promise<boolean> {
  const client = await getRedisClient();

  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}
