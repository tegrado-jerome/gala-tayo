import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteJsonCacheValue, getJsonCacheValue, getJsonCacheValues, setJsonCacheValue } from "./redisCacheService";

// No Redis is configured in unit tests, so these cover the in-memory layer on its own.

test("reads that opt in get the memory copy; others go to Redis", async () => {
  await setJsonCacheValue("test:memory:a", { places: [1, 2] }, { ttlSeconds: 60, memoryTtlSeconds: 60 });
  assert.deepEqual(await getJsonCacheValue("test:memory:a", { memoryTtlSeconds: 60 }), { places: [1, 2] });
  assert.equal(await getJsonCacheValue("test:memory:a"), null);
});

test("the memory copy is a snapshot, so later changes to the object do not leak in", async () => {
  const payload = { places: [1] };
  await setJsonCacheValue("test:memory:snapshot", payload, { memoryTtlSeconds: 60 });
  payload.places.push(2);
  assert.deepEqual(await getJsonCacheValue("test:memory:snapshot", { memoryTtlSeconds: 60 }), { places: [1] });
});

test("batch reads line up with the keys and keep empty lists", async () => {
  await setJsonCacheValue("test:memory:b1", ["x"], { memoryTtlSeconds: 60 });
  await setJsonCacheValue("test:memory:b2", [], { memoryTtlSeconds: 60 });
  assert.deepEqual(await getJsonCacheValues(["test:memory:b2", "test:memory:none", "test:memory:b1"], { memoryTtlSeconds: 60 }), [[], null, ["x"]]);
});

test("writing without a memory TTL or deleting drops the memory copy", async () => {
  await setJsonCacheValue("test:memory:c", 1, { memoryTtlSeconds: 60 });
  await setJsonCacheValue("test:memory:c", 2);
  assert.equal(await getJsonCacheValue("test:memory:c", { memoryTtlSeconds: 60 }), null);

  await setJsonCacheValue("test:memory:d", 1, { memoryTtlSeconds: 60 });
  await setJsonCacheValue("test:memory:e", 1, { memoryTtlSeconds: 60 });
  await deleteJsonCacheValue("test:memory:d", "test:memory:e");
  assert.deepEqual(await getJsonCacheValues(["test:memory:d", "test:memory:e"], { memoryTtlSeconds: 60 }), [null, null]);
});
