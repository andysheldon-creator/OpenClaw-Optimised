/**
 * Cache infrastructure exports.
 */

export {
  getRedis,
  closeRedis,
  getRedisConfig,
  isRedisConnected,
  type RedisConfig,
} from "./redis.js";

export {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheGetOrSet,
  CACHE_KEYS,
  CACHE_TTL,
  type CacheOptions,
} from "./cache.js";
