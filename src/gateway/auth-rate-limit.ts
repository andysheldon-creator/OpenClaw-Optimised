/**
 * Auth brute-force protection.
 *
 * Tracks failed authentication attempts per IP using a token-bucket. Only
 * failed attempts consume tokens. When tokens are exhausted the IP is
 * locked out until refill. Successful auth resets the bucket.
 *
 * Shared between HTTP and WebSocket auth paths.
 */

import type { ResolvedRateLimitsAuthConfig } from "../config/types.gateway.js";
import { RateLimiter } from "../infra/rate-limiter.js";

export type AuthRateLimitResult = {
  /** Whether the auth attempt is allowed. */
  allowed: boolean;
  /** Milliseconds until the lockout expires (set when denied). */
  retryAfterMs?: number;
};

/**
 * Auth brute-force rate limiter.
 *
 * Uses a token-bucket where `maxFailures` is the burst capacity and the
 * bucket refills every `windowMinutes`. Only failed auth attempts consume
 * tokens; `recordSuccess` resets the bucket for that IP.
 */
export class AuthRateLimiter {
  private readonly limiter: RateLimiter;
  private readonly enabled: boolean;

  constructor(config: ResolvedRateLimitsAuthConfig, enabled = true) {
    this.enabled = enabled;
    this.limiter = new RateLimiter({
      maxTokens: config.maxFailures,
      refillRate: config.maxFailures,
      refillIntervalMs: config.windowMinutes * 60 * 1000,
    });
  }

  /**
   * Check whether an auth attempt from `ip` is allowed.
   * Read-only: does NOT consume a token.
   */
  checkAuthAllowed(ip: string): AuthRateLimitResult {
    if (!this.enabled) {
      return { allowed: true };
    }
    const result = this.limiter.peek(ip);
    if (result.allowed) {
      return { allowed: true };
    }
    return { allowed: false, retryAfterMs: result.retryAfterMs };
  }

  /**
   * Record a failed auth attempt for `ip`.
   * Consumes one token from the bucket.
   */
  recordFailure(ip: string): void {
    if (!this.enabled) {
      return;
    }
    this.limiter.check(ip);
  }

  /** Record a successful auth for `ip` — resets the failure count. */
  recordSuccess(ip: string): void {
    if (!this.enabled) {
      return;
    }
    this.limiter.reset(ip);
  }

  /** Stop the internal GC timer. */
  destroy(): void {
    this.limiter.destroy();
  }

  /** Visible for testing — number of tracked buckets. */
  get size(): number {
    return this.limiter.size;
  }
}
