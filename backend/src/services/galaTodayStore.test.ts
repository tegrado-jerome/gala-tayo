import assert from "node:assert/strict";
import { test } from "node:test";
import type { GalaTodayPost } from "../utils/galaTodayCore";
import { createGalaTodayStore, LAST_RUN_OBJECT, LOCK_OBJECT, LOCK_STALE_MS, POSTS_OBJECT, type JsonObjects } from "./galaTodayStore";

/** An in-memory object store with R2's conditional-put rules (If-None-Match: *, If-Match: etag). */
function fakeObjects() {
  const items = new Map<string, { body: string; etag: string }>();
  let version = 0;
  let down = false;
  const calls: string[] = [];
  const check = () => {
    if (down) throw new Error("storage down");
  };
  const objects: JsonObjects = {
    async get(key) {
      check();
      calls.push(`get ${key}`);
      return items.get(key) ?? null;
    },
    async put(key, body, condition) {
      check();
      calls.push(`put ${key}`);
      const current = items.get(key);
      if (condition?.ifNoneMatch === "*" && current) return false;
      if (condition?.ifMatch !== undefined && current?.etag !== condition.ifMatch) return false;
      version += 1;
      items.set(key, { body, etag: `"v${version}"` });
      return true;
    },
    async delete(key) {
      check();
      calls.push(`delete ${key}`);
      items.delete(key);
    },
  };
  return { objects, items, calls, setDown: (value: boolean) => (down = value) };
}

const post = (slug: string, date = "2026-10-07") => ({ slug, date, publishedAt: `${date}T00:00:00.000Z` }) as GalaTodayPost;

function setup(options: { legacy?: () => Promise<GalaTodayPost[] | null>; bundled?: () => Promise<GalaTodayPost[] | null> } = {}) {
  const fake = fakeObjects();
  let clock = Date.parse("2026-10-07T00:00:00Z");
  const sources = { legacy: 0, bundled: 0 };
  const store = createGalaTodayStore({
    objects: fake.objects,
    readLegacyPosts: () => {
      sources.legacy += 1;
      return options.legacy ? options.legacy() : Promise.resolve(null);
    },
    readBundledPosts: () => {
      sources.bundled += 1;
      return options.bundled ? options.bundled() : Promise.resolve(null);
    },
    now: () => clock,
  });
  return { store, fake, sources, advance: (ms: number) => (clock += ms) };
}

test("posts and the last-run note round-trip through storage", async () => {
  const { store, fake } = setup();
  await store.savePosts([post("b"), post("a")]);
  assert.deepEqual(JSON.parse(fake.items.get(POSTS_OBJECT)!.body).map((item: GalaTodayPost) => item.slug), ["b", "a"]);

  const fresh = createGalaTodayStore({ objects: fake.objects, readLegacyPosts: async () => null, readBundledPosts: async () => null });
  assert.deepEqual((await fresh.readPosts()).map((item) => item.slug), ["b", "a"]);

  assert.equal(await fresh.readLastRun(), null);
  assert.equal(await store.saveLastRun({ at: "2026-10-07T00:00:00Z", trigger: "timer", result: "posted b" }), true);
  assert.ok(fake.items.has(LAST_RUN_OBJECT));
  assert.deepEqual(await fresh.readLastRun(), { at: "2026-10-07T00:00:00Z", trigger: "timer", result: "posted b" });
});

test("page reads use the memory copy for about 120 s; generator reads always hit storage", async () => {
  const { store, fake, advance } = setup();
  await store.savePosts([post("a")]);
  fake.items.set(POSTS_OBJECT, { body: JSON.stringify([post("b"), post("a")]), etag: '"other"' });

  assert.equal((await store.readPosts({ memoryTtlSeconds: 120 })).length, 1);
  assert.equal((await store.readPosts()).length, 2);
  fake.items.set(POSTS_OBJECT, { body: JSON.stringify([post("c")]), etag: '"later"' });
  advance(121_000);
  assert.deepEqual((await store.readPosts({ memoryTtlSeconds: 120 })).map((item) => item.slug), ["c"]);
});

test("first read without an R2 object migrates the old Redis list, without writing", async () => {
  const { store, fake, sources } = setup({ legacy: async () => [post("from-redis")], bundled: async () => [post("bundled")] });
  assert.deepEqual((await store.readPosts()).map((item) => item.slug), ["from-redis"]);
  assert.equal(sources.bundled, 0);
  assert.equal(fake.items.size, 0);
  await store.readPosts();
  assert.equal(sources.legacy, 1, "the old key is only tried once");
});

test("Redis down: falls back to the bundled posts, then to none, and never throws", async () => {
  const bundledFirst = setup({ legacy: async () => Promise.reject(new Error("quota exceeded")), bundled: async () => [post("bundled")] });
  assert.deepEqual((await bundledFirst.store.readPosts()).map((item) => item.slug), ["bundled"]);

  const nothing = setup({ legacy: async () => Promise.reject(new Error("quota exceeded")), bundled: async () => Promise.reject(new Error("offline")) });
  assert.deepEqual(await nothing.store.readPosts(), []);
  assert.deepEqual(await nothing.store.readPosts({ memoryTtlSeconds: 120 }), []);
});

test("the first publish after migration keeps the migrated posts", async () => {
  const { store, fake } = setup({ legacy: async () => [post("old")] });
  const posts = await store.readPosts();
  await store.savePosts([post("new"), ...posts]);
  assert.deepEqual(JSON.parse(fake.items.get(POSTS_OBJECT)!.body).map((item: GalaTodayPost) => item.slug), ["new", "old"]);
});

test("storage down: page reads return the last copy, the generator read throws so nothing is overwritten", async () => {
  const { store, fake } = setup();
  await store.savePosts([post("a")]);
  fake.setDown(true);
  assert.deepEqual((await store.readPosts({ memoryTtlSeconds: 120 })).map((item) => item.slug), ["a"]);
  await assert.rejects(store.readPosts(), /storage down/);
  assert.equal(await store.readLastRun({ memoryTtlSeconds: 120 }), null);
  assert.equal(await store.saveLastRun({ at: "x", trigger: "timer", result: "y" }), false);
});

test("lock: one holder at a time, released after the run", async () => {
  const { store, fake } = setup();
  let inside = false;
  const result = await store.withLock(async () => {
    inside = fake.items.has(LOCK_OBJECT);
    // A second run on this instance and one on another instance (same storage) both back off.
    const other = createGalaTodayStore({ objects: fake.objects, readLegacyPosts: async () => null, readBundledPosts: async () => null, now: () => Date.parse("2026-10-07T00:01:00Z") });
    assert.equal(await store.withLock(async () => "same instance"), null);
    assert.equal(await other.withLock(async () => "other instance"), null);
    return "ran";
  });
  assert.equal(result, "ran");
  assert.equal(inside, true);
  assert.equal(fake.items.has(LOCK_OBJECT), false);
  assert.equal(await store.withLock(async () => "again"), "again");
});

test("lock: released even when the run throws", async () => {
  const { store, fake } = setup();
  await assert.rejects(store.withLock(async () => Promise.reject(new Error("boom"))), /boom/);
  assert.equal(fake.items.has(LOCK_OBJECT), false);
});

test("lock: a fresh lock blocks, a stale one (older than 420 s) is taken over", async () => {
  const { store, fake, advance } = setup();
  fake.items.set(LOCK_OBJECT, { body: JSON.stringify({ token: "dead-run", at: "2026-10-07T00:00:00.000Z" }), etag: '"dead"' });
  assert.equal(await store.withLock(async () => "early"), null);
  advance(LOCK_STALE_MS - 1000);
  assert.equal(await store.withLock(async () => "still early"), null);
  advance(2000);
  assert.equal(await store.withLock(async () => "took over"), "took over");
  assert.equal(fake.items.has(LOCK_OBJECT), false);
});

test("lock: an unreadable lock counts as stale", async () => {
  const { store, fake } = setup();
  fake.items.set(LOCK_OBJECT, { body: "not json", etag: '"bad"' });
  assert.equal(await store.withLock(async () => "ran"), "ran");
});

test("lock: a run that outlived the stale time doesn't delete the next holder's lock", async () => {
  const { store, fake, advance } = setup();
  await store.withLock(async () => {
    advance(LOCK_STALE_MS + 1000);
    const other = createGalaTodayStore({ objects: fake.objects, readLegacyPosts: async () => null, readBundledPosts: async () => null, now: () => Date.parse("2026-10-07T00:07:01Z") });
    // The other instance takes over the stale lock and is still running when the first one finishes.
    fake.items.set(LOCK_OBJECT, { body: JSON.stringify({ token: "next-holder", at: "2026-10-07T00:07:01.000Z" }), etag: '"next"' });
    assert.equal(await other.withLock(async () => "blocked"), null);
  });
  assert.equal(JSON.parse(fake.items.get(LOCK_OBJECT)!.body).token, "next-holder");
});

test("lock: a store that ignores the condition is caught by the read-back", async () => {
  const fake = fakeObjects();
  const lax: JsonObjects = { ...fake.objects, put: (key, body) => fake.objects.put(key, body) };
  const store = createGalaTodayStore({ objects: lax, readLegacyPosts: async () => null, readBundledPosts: async () => null });
  const original = lax.get;
  // Another run writes its lock between our put and the read-back.
  lax.get = async (key) => {
    if (key === LOCK_OBJECT) fake.items.set(LOCK_OBJECT, { body: JSON.stringify({ token: "someone-else", at: new Date().toISOString() }), etag: '"x"' });
    return original(key);
  };
  assert.equal(await store.withLock(async () => "ran"), null);
  assert.equal(JSON.parse(fake.items.get(LOCK_OBJECT)!.body).token, "someone-else");
});

test("lock: storage down is an error, not 'another run holds the lock'", async () => {
  const { store, fake } = setup();
  fake.setDown(true);
  await assert.rejects(store.withLock(async () => "ran"), /storage down/);
  fake.setDown(false);
  assert.equal(await store.withLock(async () => "ran"), "ran");
});
