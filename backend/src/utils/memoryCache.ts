/**
 * A small per-instance cache with expiry, kept in front of Redis so hot reads skip the network (and the
 * Upstash command quota). Values are shared by reference between requests: callers must not mutate them.
 * Oldest entries are dropped first once `maxEntries` is reached.
 */
export class MemoryCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now
  ) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    if (!(ttlSeconds > 0) || value === null || value === undefined) return;
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      this.pruneExpired();
      while (this.entries.size >= this.maxEntries) {
        this.entries.delete(this.entries.keys().next().value as string);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
