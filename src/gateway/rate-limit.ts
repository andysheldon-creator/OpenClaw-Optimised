/**
 * Rate Limiter — token bucket algorithm for gateway authentication.
 *
 * Prevents brute-force attacks on gateway authentication by limiting the
 * number of connection attempts per IP address within a time window.
 *
 * Addresses MITRE ATLAS AML.CS0048 (Exposed Control Interfaces).
 */

type Bucket = {
  tokens: number;
  lastRefill: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

export type RateLimiterOptions = {
  /** Maximum tokens (attempts) per bucket. Default: 5 */
  maxTokens?: number;
  /** Refill interval in milliseconds. Default: 60_000 (1 minute) */
  refillIntervalMs?: number;
  /** Extra tokens consumed on auth failure (penalty). Default: 1 */
  failurePenalty?: number;
  /** Stale entry cleanup interval in milliseconds. Default: 300_000 (5 min) */
  cleanupIntervalMs?: number;
};

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private readonly failurePenalty: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: RateLimiterOptions) {
    this.maxTokens = options?.maxTokens ?? 5;
    this.refillIntervalMs = options?.refillIntervalMs ?? 60_000;
    this.failurePenalty = options?.failurePenalty ?? 1;

    const cleanupMs = options?.cleanupIntervalMs ?? 300_000;
    if (cleanupMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
      // Allow the Node process to exit without waiting for cleanup.
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Check whether a request from the given key (typically IP) is allowed.
   * Consumes one token if allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time.
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      const refills = Math.floor(elapsed / this.refillIntervalMs);
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refills);
      bucket.lastRefill += refills * this.refillIntervalMs;
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    // Not allowed — calculate retry time.
    const msUntilRefill = this.refillIntervalMs - (now - bucket.lastRefill);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, msUntilRefill),
    };
  }

  /**
   * Apply an extra penalty for a failed authentication attempt.
   * Consumes additional tokens from the bucket.
   */
  penalize(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.max(0, bucket.tokens - this.failurePenalty);
    }
  }

  /**
   * Remove stale buckets that have fully refilled (no longer rate-limited).
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      const elapsed = now - bucket.lastRefill;
      if (elapsed >= this.refillIntervalMs && bucket.tokens >= this.maxTokens - 1) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stop the cleanup interval timer. */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Number of tracked IPs (for testing). */
  get size(): number {
    return this.buckets.size;
  }
}
