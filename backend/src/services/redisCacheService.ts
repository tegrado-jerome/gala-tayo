import { AsyncLocalStorage } from "node:async_hooks";
import { Redis } from "@upstash/redis";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";
import { MemoryCache } from "../utils/memoryCache";

type JsonCacheOptions = {
  ttlSeconds?: number;
  /**
   * Keep the value in this instance's memory for this long, so repeat reads skip Redis. Only reads that pass it
   * use the memory copy; other reads always go to Redis.
   */
  memoryTtlSeconds?: number;
};

type ReadCacheOptions = Pick<JsonCacheOptions, "memoryTtlSeconds">;

const memoryCache = new MemoryCache(2000);

/** Upstash bills every command, including each one inside a pipeline or transaction. */
export function countRedisCommands(request: { path?: string[]; body?: unknown }): number {
  const batched = request.path?.some((segment) => segment === "pipeline" || segment === "multi-exec");
  return batched && Array.isArray(request.body) ? request.body.length : 1;
}

const commandCounter = new AsyncLocalStorage<{ commands: number }>();

/** Runs `run` while counting the Redis commands it sends (for the REDIS_DEBUG invocation log). */
export async function withRedisCommandCount<T>(run: () => Promise<T>): Promise<{ result: T; commands: number }> {
  const counter = { commands: 0 };
  const result = await commandCounter.run(counter, run);
  return { result, commands: counter.commands };
}

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
        const client = new Redis({
          url: config.url,
          token: config.token,
          retry: { retries: 1, backoff: () => 100 },
        });
        client.use((request, next) => {
          const counter = commandCounter.getStore();
          if (counter) counter.commands += countRedisCommands(request);
          return next(request);
        });
        return client;
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

/** One SET a day keeps a free Upstash database from being deleted for inactivity. */
export async function touchRedisKeepAlive(): Promise<boolean> {
  const client = await getRedisClient();

  if (!client) {
    return false;
  }

  try {
    return (await client.set("keepalive", new Date().toISOString(), { ex: 7 * 24 * 60 * 60 })) === "OK";
  } catch {
    return false;
  }
}

export async function getJsonCacheValue<T>(key: string, options: ReadCacheOptions = {}): Promise<T | null> {
  const remembered = options.memoryTtlSeconds ? memoryCache.get<T>(key) : undefined;
  if (remembered !== undefined) return remembered;

  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  try {
    const value = (await client.get<T>(key)) ?? null;
    if (options.memoryTtlSeconds) memoryCache.set(key, value, options.memoryTtlSeconds);
    return value;
  } catch {
    return null;
  }
}

/** Reads several keys with one MGET (one command); values line up with `keys`, null where missing. */
export async function getJsonCacheValues<T>(keys: string[], options: ReadCacheOptions = {}): Promise<Array<T | null>> {
  const values: Array<T | null> = keys.map((key) => (options.memoryTtlSeconds ? memoryCache.get<T>(key) ?? null : null));
  const missingIndexes = keys.flatMap((_, index) => (values[index] === null ? [index] : []));

  if (missingIndexes.length === 0) {
    return values;
  }

  const client = await getRedisClient();

  if (!client) {
    return values;
  }

  try {
    const fetched = await client.mget<Array<T | null>>(...missingIndexes.map((index) => keys[index]));
    missingIndexes.forEach((keyIndex, fetchedIndex) => {
      const value = fetched[fetchedIndex] ?? null;
      values[keyIndex] = value;
      if (options.memoryTtlSeconds) memoryCache.set(keys[keyIndex], value, options.memoryTtlSeconds);
    });
  } catch {
    // The cache is optional: callers load whatever is still null.
  }

  return values;
}

export async function setJsonCacheValue<T>(
  key: string,
  value: T,
  options: JsonCacheOptions = {}
): Promise<boolean> {
  if (options.memoryTtlSeconds) {
    // A copy, like Redis stores: the caller may still change the object it just cached.
    memoryCache.set(key, structuredClone(value), options.memoryTtlSeconds);
  } else {
    memoryCache.delete(key);
  }

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

/** Deletes the keys with one DEL. Other instances keep their memory copy until its short TTL ends. */
export async function deleteJsonCacheValue(...keys: string[]): Promise<boolean> {
  keys.forEach((key) => memoryCache.delete(key));

  if (keys.length === 0) {
    return true;
  }

  const client = await getRedisClient();

  if (!client) {
    return false;
  }

  try {
    await client.del(...keys);
    return true;
  } catch {
    return false;
  }
}
