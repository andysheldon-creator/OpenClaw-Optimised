/**
 * Cache abstraction with TTL support.
 * Provides a simple interface for caching with automatic expiration.
 */

import { getRedis } from "./redis.js";

export type CacheOptions = {
  ttlSeconds?: number;
};

const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const value = await redis.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
  try {
    const redis = getRedis();
    const ttl = options?.ttlSeconds ?? DEFAULT_TTL;
    const serialized = JSON.stringify(value);
    if (ttl > 0) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDeletePattern(pattern: string): Promise<number> {
  try {
    const redis = getRedis();
    const keys = await redis.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }
    // Remove prefix from keys as del() will add it back
    const config = await import("./redis.js").then((m) => m.getRedisConfig());
    const prefix = config.keyPrefix ?? "";
    const unprefixedKeys = keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k));
    return await redis.del(...unprefixedKeys);
  } catch {
    return 0;
  }
}

export async function cacheGetOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }
  const value = await factory();
  await cacheSet(key, value, options);
  return value;
}

// Cache keys for provider detection
export const CACHE_KEYS = {
  providerDetection: "providers:detection",
  providerStatus: (providerId: string) => `providers:status:${providerId}`,
  usageToday: (providerId: string) => `usage:today:${providerId}`,
  usageWeek: (providerId: string) => `usage:week:${providerId}`,
  usageMonth: (providerId: string) => `usage:month:${providerId}`,
} as const;

// TTL values in seconds
export const CACHE_TTL = {
  providerDetection: 300, // 5 minutes
  providerStatus: 60, // 1 minute
  usageStats: 60, // 1 minute
} as const;
