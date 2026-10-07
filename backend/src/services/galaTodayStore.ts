import { randomUUID } from "crypto";
import { MemoryCache } from "../utils/memoryCache";
import { getR2Text, putR2Text, deleteR2Object } from "../utils/r2ImageStorage";
import type { GalaTodayPost } from "../utils/galaTodayCore";

// Gala Today's state lives in R2 as small JSON objects, so it needs no Redis (whose free quota runs out).
// Posts are public content and the last-run note has no secrets; the public media domain can't list keys.
export const POSTS_OBJECT = "gala-today/posts-v4.json";
export const LAST_RUN_OBJECT = "gala-today/last-run.json";
export const LOCK_OBJECT = "gala-today/lock.json";
// Drafts plus editor passes can take minutes; a lock older than this belongs to a run that died.
export const LOCK_STALE_MS = 420_000;

export type LastRun = { at: string; trigger: string; result: string };

/** The few object operations the store needs; R2 in production, a fake in tests. */
export type JsonObjects = {
  /** Null when the object doesn't exist; throws when storage can't be reached. */
  get(key: string): Promise<{ body: string; etag: string } | null>;
  /** False when the condition failed; throws on other errors. */
  put(key: string, body: string, condition?: { ifNoneMatch?: "*"; ifMatch?: string }): Promise<boolean>;
  delete(key: string): Promise<void>;
};

type StoreOptions = {
  objects: JsonObjects;
  /** The posts from before the move to R2 (the old Redis key). May fail; it's only tried once. */
  readLegacyPosts: () => Promise<GalaTodayPost[] | null>;
  /** The copy the frontend ships (committed daily). May fail. */
  readBundledPosts: () => Promise<GalaTodayPost[] | null>;
  now?: () => number;
};

const parse = <T>(body: string): T | null => {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
};

export function createGalaTodayStore({ objects, readLegacyPosts, readBundledPosts, now = Date.now }: StoreOptions) {
  const memory = new MemoryCache(10, now);
  let seed: Promise<GalaTodayPost[]> | null = null;
  let running = false;

  /** First run without an R2 object: the old Redis list, else the bundled posts, else none. Never throws. */
  function migrationSeed() {
    seed ??= (async () => {
      const legacy = await readLegacyPosts().catch(() => null);
      if (Array.isArray(legacy) && legacy.length) return legacy;
      const bundled = await readBundledPosts().catch(() => null);
      return Array.isArray(bundled) ? bundled : [];
    })();
    return seed;
  }

  /**
   * Newest first. `memoryTtlSeconds` lets page reads reuse this instance's copy and never throws (falls back to the
   * last copy, else none). Without it (the generator) it reads R2 and throws when R2 is down, so a failed read can
   * never be saved over the real list.
   */
  async function readPosts({ memoryTtlSeconds }: { memoryTtlSeconds?: number } = {}): Promise<GalaTodayPost[]> {
    const remembered = memoryTtlSeconds ? memory.get<GalaTodayPost[]>(POSTS_OBJECT) : undefined;
    if (remembered) return remembered;
    try {
      const stored = await objects.get(POSTS_OBJECT);
      const posts = stored ? parse<GalaTodayPost[]>(stored.body) : await migrationSeed();
      if (!Array.isArray(posts)) throw new Error("Gala Today posts object is unreadable.");
      memory.set(POSTS_OBJECT, posts, 120);
      return posts;
    } catch (error) {
      if (!memoryTtlSeconds) throw error;
      return memory.get<GalaTodayPost[]>(POSTS_OBJECT) ?? [];
    }
  }

  async function savePosts(posts: GalaTodayPost[]): Promise<void> {
    await objects.put(POSTS_OBJECT, JSON.stringify(posts));
    memory.set(POSTS_OBJECT, posts, 120);
  }

  async function readLastRun({ memoryTtlSeconds }: { memoryTtlSeconds?: number } = {}): Promise<LastRun | null> {
    // Wrapped so "no note yet" is remembered too.
    const remembered = memoryTtlSeconds ? memory.get<{ lastRun: LastRun | null }>(LAST_RUN_OBJECT) : undefined;
    if (remembered) return remembered.lastRun;
    const stored = await objects.get(LAST_RUN_OBJECT).catch(() => null);
    const lastRun = stored ? parse<LastRun>(stored.body) : null;
    if (memoryTtlSeconds) memory.set(LAST_RUN_OBJECT, { lastRun }, memoryTtlSeconds);
    return lastRun;
  }

  /** Best effort: the note is diagnostics only. */
  async function saveLastRun(lastRun: LastRun): Promise<boolean> {
    try {
      await objects.put(LAST_RUN_OBJECT, JSON.stringify(lastRun));
      memory.set(LAST_RUN_OBJECT, { lastRun }, 120);
      return true;
    } catch {
      return false;
    }
  }

  const lockBody = (token: string) => JSON.stringify({ token, at: new Date(now()).toISOString() });
  const lockToken = async () => parse<{ token?: string }>((await objects.get(LOCK_OBJECT))?.body ?? "")?.token ?? null;

  /**
   * Create-only put. A lock older than LOCK_STALE_MS belongs to a run that died (e.g. a deploy restart): it is
   * deleted and re-created with the same create-only put, so at most one of two racing runs gets it. (R2 refused
   * the If-Match replace live, which left a dead lock blocking every run.) The read-back confirms we hold it.
   */
  async function acquire(): Promise<string | null> {
    const token = randomUUID();
    let taken = await objects.put(LOCK_OBJECT, lockBody(token), { ifNoneMatch: "*" });
    if (!taken) {
      const current = await objects.get(LOCK_OBJECT);
      if (!current) taken = await objects.put(LOCK_OBJECT, lockBody(token), { ifNoneMatch: "*" });
      else {
        const at = Date.parse(parse<{ at?: string }>(current.body)?.at ?? "");
        if (Number.isFinite(at) && now() - at < LOCK_STALE_MS) return null;
        await objects.delete(LOCK_OBJECT);
        taken = await objects.put(LOCK_OBJECT, lockBody(token), { ifNoneMatch: "*" });
      }
    }
    return taken && (await lockToken()) === token ? token : null;
  }

  /** Only removes the lock if it is still ours (a run past the stale time may have lost it to another). */
  async function release(token: string) {
    if ((await lockToken()) === token) await objects.delete(LOCK_OBJECT);
  }

  /** Runs `run` only when no other generator is running (here or on another instance); null when one is. */
  async function withLock<T>(run: () => Promise<T>): Promise<T | null> {
    if (running) return null;
    running = true;
    try {
      const token = await acquire();
      if (!token) return null;
      try {
        return await run();
      } finally {
        await release(token).catch(() => undefined);
      }
    } finally {
      running = false;
    }
  }

  return { readPosts, savePosts, readLastRun, saveLastRun, withLock };
}

export const r2JsonObjects: JsonObjects = {
  get: getR2Text,
  put: (key, body, condition) => putR2Text(key, body, condition),
  delete: deleteR2Object,
};
