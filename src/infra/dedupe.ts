export type LruCache<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  has: (key: string) => boolean;
  delete: (key: string) => boolean;
  clear: () => void;
  size: () => number;
};

type LruCacheOptions = {
  /** Max entries before eviction (default: 1000) */
  maxSize?: number;
  /** TTL in ms; 0 = no expiry (default: 300_000 = 5 min) */
  ttlMs?: number;
};

/**
 * LRU cache with optional TTL. Thread-safe for single-threaded JS.
 * Used for caching Slack channel/user lookups to reduce API calls.
 */
export function createLruCache<T>(options: LruCacheOptions = {}): LruCache<T> {
  const maxSize = Math.max(1, options.maxSize ?? 1000);
  const ttlMs = options.ttlMs ?? 300_000;
  const cache = new Map<string, { value: T; expiresAt: number }>();

  const isExpired = (entry: { expiresAt: number }, now: number) =>
    ttlMs > 0 && entry.expiresAt < now;

  const evictOldest = () => {
    if (cache.size <= maxSize) return;
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  };

  return {
    get: (key) => {
      const entry = cache.get(key);
      if (!entry) return undefined;
      const now = Date.now();
      if (isExpired(entry, now)) {
        cache.delete(key);
        return undefined;
      }
      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, entry);
      return entry.value;
    },
    set: (key, value) => {
      cache.delete(key); // Remove if exists to update position
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      evictOldest();
    },
    has: (key) => {
      const entry = cache.get(key);
      if (!entry) return false;
      if (isExpired(entry, Date.now())) {
        cache.delete(key);
        return false;
      }
      return true;
    },
    delete: (key) => cache.delete(key),
    clear: () => cache.clear(),
    size: () => cache.size,
  };
}

export type DedupeCache = {
  check: (key: string | undefined | null, now?: number) => boolean;
  clear: () => void;
  size: () => number;
};

type DedupeCacheOptions = {
  ttlMs: number;
  maxSize: number;
};

export function createDedupeCache(options: DedupeCacheOptions): DedupeCache {
  const ttlMs = Math.max(0, options.ttlMs);
  const maxSize = Math.max(0, Math.floor(options.maxSize));
  const cache = new Map<string, number>();

  const touch = (key: string, now: number) => {
    cache.delete(key);
    cache.set(key, now);
  };

  const prune = (now: number) => {
    const cutoff = ttlMs > 0 ? now - ttlMs : undefined;
    if (cutoff !== undefined) {
      for (const [entryKey, entryTs] of cache) {
        if (entryTs < cutoff) {
          cache.delete(entryKey);
        }
      }
    }
    if (maxSize <= 0) {
      cache.clear();
      return;
    }
    while (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  };

  return {
    check: (key, now = Date.now()) => {
      if (!key) {
        return false;
      }
      const existing = cache.get(key);
      if (existing !== undefined && (ttlMs <= 0 || now - existing < ttlMs)) {
        touch(key, now);
        return true;
      }
      touch(key, now);
      prune(now);
      return false;
    },
    clear: () => {
      cache.clear();
    },
    size: () => cache.size,
  };
}
