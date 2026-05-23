import { Redis } from "@upstash/redis";
import { getSecret } from "../config/keyVault";

let redisClient: Redis | null = null;

async function getRedisClient(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  const url = await getSecret("redis-rest-url");
  const token = await getSecret("redis-rest-token");

  if (!url) {
    throw new Error("Redis REST URL is missing from Key Vault.");
  }

  if (!token) {
    throw new Error("Redis REST token is missing from Key Vault.");
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  return await redis.get<T>(key);
}
