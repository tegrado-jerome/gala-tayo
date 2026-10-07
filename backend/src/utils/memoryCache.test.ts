import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryCache } from "./memoryCache";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("returns a value until its TTL ends", () => {
  const time = clock();
  const cache = new MemoryCache(10, time.now);
  cache.set("places", [1, 2], 60);
  assert.deepEqual(cache.get("places"), [1, 2]);
  time.advance(59_999);
  assert.deepEqual(cache.get("places"), [1, 2]);
  time.advance(1);
  assert.equal(cache.get("places"), undefined);
  assert.equal(cache.size, 0);
});

test("keeps falsy values but never null, undefined or a zero TTL", () => {
  const cache = new MemoryCache();
  cache.set("count", 0, 60);
  cache.set("list", [], 60);
  cache.set("missing", null, 60);
  cache.set("unset", undefined, 60);
  cache.set("no-ttl", "x", 0);
  assert.equal(cache.get("count"), 0);
  assert.deepEqual(cache.get("list"), []);
  assert.equal(cache.get("missing"), undefined);
  assert.equal(cache.get("unset"), undefined);
  assert.equal(cache.get("no-ttl"), undefined);
});

test("drops expired entries first, then the oldest, when full", () => {
  const time = clock();
  const cache = new MemoryCache(3, time.now);
  cache.set("short", 1, 1);
  cache.set("a", 2, 60);
  cache.set("b", 3, 60);
  time.advance(2_000);
  cache.set("c", 4, 60);
  assert.equal(cache.get("short"), undefined);
  assert.deepEqual([cache.get("a"), cache.get("b"), cache.get("c")], [2, 3, 4]);

  cache.set("d", 5, 60);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 3);
});

test("re-setting a key refreshes its value and TTL", () => {
  const time = clock();
  const cache = new MemoryCache(10, time.now);
  cache.set("k", "old", 10);
  time.advance(9_000);
  cache.set("k", "new", 10);
  time.advance(9_000);
  assert.equal(cache.get("k"), "new");
});

test("delete and clear remove entries", () => {
  const cache = new MemoryCache();
  cache.set("a", 1, 60);
  cache.set("b", 2, 60);
  cache.delete("a");
  assert.equal(cache.get("a"), undefined);
  cache.clear();
  assert.equal(cache.get("b"), undefined);
});
