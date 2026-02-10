/**
 * Token-bucket rate limiter for gateway HTTP endpoints.
 *
 * Provides per-IP rate limiting with configurable rates and burst sizes.
 * Automatically cleans up stale entries to prevent memory leaks.
 *
 * SECURITY: Prevents DoS attacks, credential brute-forcing, and LLM API abuse.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type RateLimitConfig = {
  /** Maximum requests per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Maximum number of tracked IPs before evicting oldest entries. */
  maxTrackedIps?: number;
};

type TokenBucket = {
  tokens: number;
  lastRefillAt: number;
  /** Number of times this IP was rate-limited (for monitoring). */
  hitCount: number;
};

const DEFAULT_MAX_TRACKED_IPS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxTrackedIps: number;
  private readonly refillRate: number; // tokens per ms
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.maxTrackedIps = config.maxTrackedIps ?? DEFAULT_MAX_TRACKED_IPS;
    this.refillRate = this.maxRequests / this.windowMs;

    // Start periodic cleanup of stale entries.
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Ensure the timer doesn't prevent process exit.
    // oxlint-disable-next-line typescript/no-explicit-any
    const timer = this.cleanupTimer as any;
    if (typeof timer?.unref === "function") {
      timer.unref();
    }
  }

  /**
   * Check if a request from the given IP is allowed.
   * Returns rate limit info for setting response headers.
   */
  consume(ip: string): {
    allowed: boolean;
    remaining: number;
    resetAtMs: number;
    limit: number;
    retryAfterMs?: number;
  } {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket) {
      // Evict oldest entry if we've hit the max tracked IPs.
      if (this.buckets.size >= this.maxTrackedIps) {
        this.evictOldest();
      }
      bucket = {
        tokens: this.maxRequests,
        lastRefillAt: now,
        hitCount: 0,
      };
      this.buckets.set(ip, bucket);
    }

    // Refill tokens based on elapsed time.
    const elapsed = now - bucket.lastRefillAt;
    if (elapsed > 0) {
      const refill = elapsed * this.refillRate;
      bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refill);
      bucket.lastRefillAt = now;
    }

    const resetAtMs = now + this.windowMs;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAtMs,
        limit: this.maxRequests,
      };
    }

    // Rate limited.
    bucket.hitCount += 1;
    const retryAfterMs = Math.ceil((1 - bucket.tokens) / this.refillRate);
    return {
      allowed: false,
      remaining: 0,
      resetAtMs,
      limit: this.maxRequests,
      retryAfterMs,
    };
  }

  /**
   * Set standard rate-limit response headers.
   */
  setHeaders(res: ServerResponse, info: ReturnType<RateLimiter["consume"]>): void {
    res.setHeader("X-RateLimit-Limit", String(info.limit));
    res.setHeader("X-RateLimit-Remaining", String(info.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(info.resetAtMs / 1000)));
    if (info.retryAfterMs !== undefined) {
      res.setHeader("Retry-After", String(Math.ceil(info.retryAfterMs / 1000)));
    }
  }

  /**
   * Send a 429 Too Many Requests response.
   */
  sendTooManyRequests(res: ServerResponse, info: ReturnType<RateLimiter["consume"]>): void {
    this.setHeaders(res, info);
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: {
          message: "Rate limit exceeded. Please retry after the indicated time.",
          type: "rate_limit_error",
          retryAfterMs: info.retryAfterMs,
        },
      }),
    );
  }

  /** Remove stale entries that have fully refilled and been idle. */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = this.windowMs * 2;
    for (const [ip, bucket] of this.buckets) {
      const idle = now - bucket.lastRefillAt;
      if (idle > staleThreshold && bucket.tokens >= this.maxRequests) {
        this.buckets.delete(ip);
      }
    }
  }

  /** Evict the oldest (least recently used) entry. */
  private evictOldest(): void {
    let oldestIp: string | undefined;
    let oldestTime = Infinity;
    for (const [ip, bucket] of this.buckets) {
      if (bucket.lastRefillAt < oldestTime) {
        oldestTime = bucket.lastRefillAt;
        oldestIp = ip;
      }
    }
    if (oldestIp) {
      this.buckets.delete(oldestIp);
    }
  }

  /** Stop the cleanup timer. Call when shutting down the server. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }

  /** Get current stats for monitoring. */
  stats(): { trackedIps: number; totalHits: number } {
    let totalHits = 0;
    for (const bucket of this.buckets.values()) {
      totalHits += bucket.hitCount;
    }
    return { trackedIps: this.buckets.size, totalHits };
  }
}

/**
 * Helper to resolve a client IP from an IncomingMessage for rate limiting.
 * Uses X-Forwarded-For with trusted proxy awareness.
 */
export function resolveRateLimitIp(
  req: IncomingMessage,
  resolveIp: (params: {
    remoteAddr?: string;
    forwardedFor?: string;
    realIp?: string;
    trustedProxies?: string[];
  }) => string | undefined,
  trustedProxies?: string[],
): string {
  const forwardedFor = Array.isArray(req.headers["x-forwarded-for"])
    ? req.headers["x-forwarded-for"][0]
    : req.headers["x-forwarded-for"];
  const realIp = Array.isArray(req.headers["x-real-ip"])
    ? req.headers["x-real-ip"][0]
    : req.headers["x-real-ip"];

  return (
    resolveIp({
      remoteAddr: req.socket?.remoteAddress,
      forwardedFor,
      realIp,
      trustedProxies,
    }) ??
    req.socket?.remoteAddress ??
    "unknown"
  );
}

/**
 * Create default rate limiters for different endpoint types.
 */
export function createDefaultRateLimiters(): {
  api: RateLimiter;
  auth: RateLimiter;
  hooks: RateLimiter;
} {
  return {
    /** General API endpoints (chat completions, tool invocations). */
    api: new RateLimiter({
      maxRequests: 60,
      windowMs: 60_000, // 60 requests per minute
    }),
    /** Authentication attempts (stricter to prevent brute-force). */
    auth: new RateLimiter({
      maxRequests: 10,
      windowMs: 60_000, // 10 auth attempts per minute
    }),
    /** Webhook endpoints. */
    hooks: new RateLimiter({
      maxRequests: 120,
      windowMs: 60_000, // 120 webhook calls per minute
    }),
  };
}
