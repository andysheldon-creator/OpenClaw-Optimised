/**
 * Redis client for OpenClaw caching.
 * Works with Redis from Docker, Homebrew, or any external source.
 */

import Redis from "ioredis";

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectTimeout?: number;
  maxRetriesPerRequest?: number;
};

let redis: Redis | null = null;

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? "openclaw:",
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? 10000),
    maxRetriesPerRequest: 3,
  };
}

export function getRedis(): Redis {
  if (redis) {
    return redis;
  }

  const config = getRedisConfig();

  redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    keyPrefix: config.keyPrefix,
    connectTimeout: config.connectTimeout,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) {
        return null;
      }
      return Math.min(times * 200, 1000);
    },
  });

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export async function isRedisConnected(): Promise<boolean> {
  try {
    const client = getRedis();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export { Redis };
