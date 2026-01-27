/**
 * Gateway Rate Limiting
 *
 * Implements configurable rate limiting for the gateway server:
 * - Per-client request rate limiting (token bucket algorithm)
 * - Exponential backoff after repeated auth failures
 * - Separate limits for authenticated vs unauthenticated requests
 * - Channel message rate limiting
 *
 * Defaults are generous for power users while preventing abuse:
 * - Unauthenticated: 60 req/min (prevents brute-force)
 * - Authenticated: unlimited by default
 * - Channel messages: 200/min per channel
 */

import type { GatewayRateLimitConfig } from "../config/types.gateway.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("rate-limit");

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
  reason?: "rate_limit" | "auth_backoff";
};

export type ResolvedRateLimitConfig = Required<GatewayRateLimitConfig>;

/** Default rate limit configuration (generous for power users) */
export const DEFAULT_RATE_LIMIT_CONFIG: ResolvedRateLimitConfig = {
  enabled: true,
  unauthenticated: 60, // 60 req/min for unauthenticated (prevents brute-force)
  authenticated: 0, // 0 = unlimited for authenticated users
  channelMessages: 200, // 200 msg/min per channel
  burstMultiplier: 2, // Allow 2x burst for short spikes
  authFailuresBeforeBackoff: 5, // Start backoff after 5 failures
  authBackoffBaseMs: 1000, // 1 second base delay
  authBackoffMaxMs: 60000, // Max 1 minute delay
};

/** Internal state for a rate limit bucket */
type RateBucket = {
  tokens: number;
  lastRefillMs: number;
  maxTokens: number;
  refillRatePerMs: number;
};

/** Auth failure tracking per client */
type AuthFailureState = {
  failures: number;
  lastFailureMs: number;
  backoffUntilMs: number;
};

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gateway rate limiter with per-client tracking.
 * Uses token bucket algorithm for smooth rate limiting with burst support.
 */
export class GatewayRateLimiter {
  private config: ResolvedRateLimitConfig;
  private buckets: Map<string, RateBucket> = new Map();
  private authFailures: Map<string, AuthFailureState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<GatewayRateLimitConfig>) {
    this.config = resolveRateLimitConfig(config);

    // Periodic cleanup of stale entries (every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request should be allowed based on rate limits.
   *
   * @param clientId - Unique client identifier (IP address, session ID, etc.)
   * @param authenticated - Whether the client is authenticated
   * @returns Rate limit result with allowed status and metadata
   */
  checkRequest(clientId: string, authenticated: boolean): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }

    const now = Date.now();

    // Check auth backoff first (applies to all requests from blocked clients)
    const authState = this.authFailures.get(clientId);
    if (authState && authState.backoffUntilMs > now) {
      const retryAfterMs = authState.backoffUntilMs - now;
      log.debug("Request blocked by auth backoff", {
        clientId: clientId.slice(0, 16),
        retryAfterMs,
      });
      return {
        allowed: false,
        remaining: 0,
        resetMs: retryAfterMs,
        retryAfterMs,
        reason: "auth_backoff",
      };
    }

    // Determine rate limit based on auth status
    const ratePerMinute = authenticated ? this.config.authenticated : this.config.unauthenticated;

    // 0 = unlimited
    if (ratePerMinute === 0) {
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }

    const bucketKey = `${authenticated ? "auth" : "unauth"}:${clientId}`;
    const bucket = this.getOrCreateBucket(bucketKey, ratePerMinute);

    // Refill tokens based on elapsed time
    this.refillBucket(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetMs: Math.ceil((bucket.maxTokens - bucket.tokens) / bucket.refillRatePerMs),
      };
    }

    // Rate limited
    const resetMs = Math.ceil((1 - bucket.tokens) / bucket.refillRatePerMs);
    log.debug("Request rate limited", {
      clientId: clientId.slice(0, 16),
      authenticated,
      resetMs,
    });

    return {
      allowed: false,
      remaining: 0,
      resetMs,
      retryAfterMs: resetMs,
      reason: "rate_limit",
    };
  }

  /**
   * Check if a channel message should be allowed.
   *
   * @param channelKey - Unique channel identifier (e.g., "telegram:123")
   * @returns Rate limit result
   */
  checkChannelMessage(channelKey: string): RateLimitResult {
    if (!this.config.enabled || this.config.channelMessages === 0) {
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }

    const now = Date.now();
    const bucketKey = `channel:${channelKey}`;
    const bucket = this.getOrCreateBucket(bucketKey, this.config.channelMessages);

    this.refillBucket(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetMs: Math.ceil((bucket.maxTokens - bucket.tokens) / bucket.refillRatePerMs),
      };
    }

    const resetMs = Math.ceil((1 - bucket.tokens) / bucket.refillRatePerMs);
    log.warn("Channel message rate limited", { channelKey, resetMs });

    return {
      allowed: false,
      remaining: 0,
      resetMs,
      retryAfterMs: resetMs,
      reason: "rate_limit",
    };
  }

  /**
   * Record an authentication failure for exponential backoff.
   *
   * @param clientId - Unique client identifier
   */
  recordAuthFailure(clientId: string): void {
    const now = Date.now();
    const state = this.authFailures.get(clientId) ?? {
      failures: 0,
      lastFailureMs: 0,
      backoffUntilMs: 0,
    };

    // Reset counter if last failure was more than 10 minutes ago
    if (now - state.lastFailureMs > 10 * 60 * 1000) {
      state.failures = 0;
    }

    state.failures += 1;
    state.lastFailureMs = now;

    // Apply exponential backoff after threshold
    if (state.failures >= this.config.authFailuresBeforeBackoff) {
      const exponent = state.failures - this.config.authFailuresBeforeBackoff;
      const backoffMs = Math.min(
        this.config.authBackoffBaseMs * Math.pow(2, exponent),
        this.config.authBackoffMaxMs,
      );
      state.backoffUntilMs = now + backoffMs;

      log.warn("Auth failure backoff applied", {
        clientId: clientId.slice(0, 16),
        failures: state.failures,
        backoffMs,
      });
    }

    this.authFailures.set(clientId, state);
  }

  /**
   * Clear auth failure state after successful authentication.
   *
   * @param clientId - Unique client identifier
   */
  clearAuthFailure(clientId: string): void {
    this.authFailures.delete(clientId);
  }

  /**
   * Get current auth backoff state for a client.
   *
   * @param clientId - Unique client identifier
   * @returns Backoff state or null if not in backoff
   */
  getAuthBackoffState(clientId: string): { failures: number; backoffUntilMs: number } | null {
    const state = this.authFailures.get(clientId);
    if (!state || state.backoffUntilMs <= Date.now()) {
      return null;
    }
    return { failures: state.failures, backoffUntilMs: state.backoffUntilMs };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<GatewayRateLimitConfig>): void {
    this.config = resolveRateLimitConfig(config);
    log.info("Rate limit config updated", { enabled: this.config.enabled });
  }

  /**
   * Get current configuration.
   */
  getConfig(): ResolvedRateLimitConfig {
    return { ...this.config };
  }

  /**
   * Clean up resources.
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    this.authFailures.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private getOrCreateBucket(key: string, ratePerMinute: number): RateBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const maxTokens = ratePerMinute * this.config.burstMultiplier;
      bucket = {
        tokens: maxTokens, // Start full
        lastRefillMs: Date.now(),
        maxTokens,
        refillRatePerMs: ratePerMinute / (60 * 1000), // tokens per ms
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: RateBucket, now: number): void {
    const elapsedMs = now - bucket.lastRefillMs;
    if (elapsedMs <= 0) return;

    const tokensToAdd = elapsedMs * bucket.refillRatePerMs;
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.maxTokens);
    bucket.lastRefillMs = now;
  }

  private cleanup(): void {
    const now = Date.now();
    const staleThresholdMs = 10 * 60 * 1000; // 10 minutes

    // Clean up stale buckets
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > staleThresholdMs) {
        this.buckets.delete(key);
      }
    }

    // Clean up stale auth failures
    for (const [key, state] of this.authFailures) {
      if (now - state.lastFailureMs > staleThresholdMs && state.backoffUntilMs < now) {
        this.authFailures.delete(key);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve rate limit config with defaults.
 */
export function resolveRateLimitConfig(
  config?: Partial<GatewayRateLimitConfig>,
): ResolvedRateLimitConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_RATE_LIMIT_CONFIG.enabled,
    unauthenticated: config?.unauthenticated ?? DEFAULT_RATE_LIMIT_CONFIG.unauthenticated,
    authenticated: config?.authenticated ?? DEFAULT_RATE_LIMIT_CONFIG.authenticated,
    channelMessages: config?.channelMessages ?? DEFAULT_RATE_LIMIT_CONFIG.channelMessages,
    burstMultiplier: config?.burstMultiplier ?? DEFAULT_RATE_LIMIT_CONFIG.burstMultiplier,
    authFailuresBeforeBackoff:
      config?.authFailuresBeforeBackoff ?? DEFAULT_RATE_LIMIT_CONFIG.authFailuresBeforeBackoff,
    authBackoffBaseMs: config?.authBackoffBaseMs ?? DEFAULT_RATE_LIMIT_CONFIG.authBackoffBaseMs,
    authBackoffMaxMs: config?.authBackoffMaxMs ?? DEFAULT_RATE_LIMIT_CONFIG.authBackoffMaxMs,
  };
}

/**
 * Create a global rate limiter instance.
 * This is typically called once during gateway startup.
 */
export function createGatewayRateLimiter(
  config?: Partial<GatewayRateLimitConfig>,
): GatewayRateLimiter {
  return new GatewayRateLimiter(config);
}
