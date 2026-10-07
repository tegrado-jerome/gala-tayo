import assert from "node:assert/strict";
import { test } from "node:test";
import { countRedisCommands } from "../services/redisCacheService";
import { checkPublicReadRateLimit, checkRedisRateLimit, countInFixedWindow, type WindowCounterStore } from "./redisRateLimit";

/** Counts the commands a limiter sends, like Upstash bills them. */
function fakeRedis() {
  const counts = new Map<string, number>();
  const commands: string[] = [];
  const store: WindowCounterStore = {
    incr: async (key) => {
      commands.push(`INCR ${key}`);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    },
    expire: async (key, seconds) => {
      commands.push(`EXPIRE ${key} ${seconds}`);
    },
  };
  return { store, commands };
}

const fromIp = (ip: string) => ({ headers: { get: (name: string) => (name === "x-forwarded-for" ? ip : null) } });

test("fixed window: one INCR per request, EXPIRE only on the first", async () => {
  const redis = fakeRedis();
  const now = Date.UTC(2026, 9, 7, 10, 0, 5);
  for (let i = 0; i < 3; i += 1) await countInFixedWindow(redis.store, "k", 5, 60, now);
  const windowNumber = Math.floor(now / 60_000);
  assert.deepEqual(redis.commands, [
    `INCR ratelimit:k:${windowNumber}`,
    `EXPIRE ratelimit:k:${windowNumber} 60`,
    `INCR ratelimit:k:${windowNumber}`,
    `INCR ratelimit:k:${windowNumber}`,
  ]);
});

test("fixed window: allows up to the limit, then blocks until the window ends", async () => {
  const redis = fakeRedis();
  const now = Date.UTC(2026, 9, 7, 10, 0, 5);
  const results = [];
  for (let i = 0; i < 4; i += 1) results.push(await countInFixedWindow(redis.store, "k", 3, 60, now));
  assert.deepEqual(results.map((result) => [result.allowed, result.remaining]), [[true, 2], [true, 1], [true, 0], [false, 0]]);
  assert.equal(results[3].resetAt, new Date(Date.UTC(2026, 9, 7, 10, 1, 0)).toISOString());

  const nextWindow = await countInFixedWindow(redis.store, "k", 3, 60, Date.UTC(2026, 9, 7, 10, 1, 0));
  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.remaining, 2);
});

test("a key over its limit stays blocked without more Redis commands", async () => {
  const redis = fakeRedis();
  const key = `blocked-test:${Math.random()}`;
  const now = Date.UTC(2026, 9, 7, 10, 0, 5);
  for (let i = 0; i < 2; i += 1) assert.equal((await checkRedisRateLimit(key, 2, 60, { now, store: redis.store })).allowed, true);
  assert.equal((await checkRedisRateLimit(key, 2, 60, { now, store: redis.store })).allowed, false);
  const sent = redis.commands.length;

  const again = await checkRedisRateLimit(key, 2, 60, { now: now + 10_000, store: redis.store });
  assert.equal(again.allowed, false);
  assert.equal(again.resetAt, new Date(Date.UTC(2026, 9, 7, 10, 1, 0)).toISOString());
  assert.equal(redis.commands.length, sent);

  assert.equal((await checkRedisRateLimit(key, 2, 60, { now: Date.UTC(2026, 9, 7, 10, 1, 0), store: redis.store })).allowed, true);
});

test("without Redis the shared limit stays open", async () => {
  const result = await checkRedisRateLimit(`no-redis:${Math.random()}`, 1, 60);
  assert.equal(result.allowed, true);
});

test("public read limit is per IP and per endpoint, in memory", async () => {
  const endpoint = `test-read-${Math.random()}`;
  for (let i = 0; i < 2; i += 1) assert.equal((await checkPublicReadRateLimit(fromIp("198.51.100.1"), endpoint, 2, 60)).allowed, true);
  const blocked = await checkPublicReadRateLimit(fromIp("198.51.100.1"), endpoint, 2, 60);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.response?.status, 429);
  assert.equal((await checkPublicReadRateLimit(fromIp("198.51.100.2"), endpoint, 2, 60)).allowed, true);
  assert.equal((await checkPublicReadRateLimit(fromIp("198.51.100.1"), `${endpoint}-other`, 2, 60)).allowed, true);
});

test("counts each command in a pipeline or transaction", () => {
  assert.equal(countRedisCommands({ path: [], body: ["incr", "k"] }), 1);
  assert.equal(countRedisCommands({ path: ["pipeline"], body: [["incr", "k"], ["expire", "k", 60]] }), 2);
  assert.equal(countRedisCommands({ path: ["multi-exec"], body: [["get", "a"], ["get", "b"], ["get", "c"]] }), 3);
  assert.equal(countRedisCommands({ body: ["mget", "a", "b", "c"] }), 1);
});
