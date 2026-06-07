/**
 * event-cache.ts
 *
 * Module-level in-memory TTL cache for Firestore event data.
 *
 * Why this exists:
 *   During induction, every student opens /attendance and selects their
 *   school + day + session. Each step previously fired a full Firestore
 *   collection scan. With 5,000+ students hitting simultaneously, that is
 *   5,000 × N document reads per step — a guaranteed quota breach.
 *
 *   Events are written by admins BEFORE the session starts and never
 *   change mid-session, so caching for 5 minutes is completely safe.
 *   All 5,000 students sharing a browser tab will reuse the same cached
 *   result, collapsing the load to ~1 Firestore read per cache window.
 *
 * Scope: module-level singleton — lives for the lifetime of the browser tab.
 * TTL:   5 minutes (EVENT_CACHE_TTL_MS).
 */

const EVENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class EventCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Return cached value if still valid, otherwise null. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Store a value with a TTL (defaults to EVENT_CACHE_TTL_MS). */
  set<T>(key: string, data: T, ttlMs: number = EVENT_CACHE_TTL_MS): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Invalidate cache entries.
   * - Pass no argument to clear everything.
   * - Pass a prefix string to clear all keys that start with it
   *   e.g. invalidate("days:") clears all day-number caches.
   */
  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Expose cache size for debug purposes. */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Singleton instance shared across all imports in this browser tab.
 * Admin pages can call `eventCache.invalidate()` after creating/updating
 * an event to ensure students see the freshest data immediately.
 */
export const eventCache = new EventCache();
