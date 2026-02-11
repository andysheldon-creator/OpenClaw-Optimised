/**
 * In-memory sliding-window rate limiter for gateway authentication attempts.
 *
 * Tracks failed auth attempts per client IP and blocks IPs that exceed the
 * configured threshold within the time window. Successful auths are not counted.
 *
 * Defaults: 10 failures per 60 seconds → blocked for 5 minutes.
 * After the block expires the counter resets, giving the client a fresh window.
 */
export class AuthRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockMs: number;

  /** key = clientIp → { timestamps of recent failures, optional block-until } */
  private readonly state = new Map<
    string,
    { failures: number[]; blockedUntil?: number }
  >();

  /** Periodic cleanup interval handle. */
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts?: { maxAttempts?: number; windowMs?: number; blockMs?: number }) {
    this.maxAttempts = opts?.maxAttempts ?? 10;
    this.windowMs = opts?.windowMs ?? 60_000;
    this.blockMs = opts?.blockMs ?? 5 * 60_000;

    // Cleanup stale entries every 60 s to avoid unbounded memory growth.
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref(); // Don't keep the process alive.
    }
  }

  /**
   * Check whether a request from `clientIp` is allowed.
   * Returns `true` if the request may proceed, `false` if rate-limited.
   */
  check(clientIp: string): boolean {
    const now = Date.now();
    const entry = this.state.get(clientIp);
    if (!entry) {
      return true;
    }

    // Currently blocked?
    if (entry.blockedUntil && now < entry.blockedUntil) {
      return false;
    }

    // Block expired → reset.
    if (entry.blockedUntil && now >= entry.blockedUntil) {
      this.state.delete(clientIp);
      return true;
    }

    return true;
  }

  /** Record a failed authentication attempt for `clientIp`. */
  recordFailure(clientIp: string): void {
    const now = Date.now();
    let entry = this.state.get(clientIp);
    if (!entry) {
      entry = { failures: [] };
      this.state.set(clientIp, entry);
    }

    // If currently blocked, nothing to do.
    if (entry.blockedUntil && now < entry.blockedUntil) {
      return;
    }

    // Prune failures outside the window.
    const cutoff = now - this.windowMs;
    entry.failures = entry.failures.filter((t) => t > cutoff);
    entry.failures.push(now);

    // Exceeded threshold → block.
    if (entry.failures.length >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockMs;
      entry.failures = []; // Free memory; the block timestamp is what matters now.
    }
  }

  /** Remove entries whose block has expired and that have no recent failures. */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [ip, entry] of this.state) {
      if (entry.blockedUntil && now >= entry.blockedUntil) {
        this.state.delete(ip);
        continue;
      }
      if (!entry.blockedUntil) {
        entry.failures = entry.failures.filter((t) => t > cutoff);
        if (entry.failures.length === 0) {
          this.state.delete(ip);
        }
      }
    }
  }

  /** Stop the background cleanup timer (for tests). */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /** Current number of tracked IPs (for observability / tests). */
  get size(): number {
    return this.state.size;
  }

  /** Check if an IP is currently blocked (for tests / diagnostics). */
  isBlocked(clientIp: string): boolean {
    const entry = this.state.get(clientIp);
    if (!entry?.blockedUntil) {
      return false;
    }
    return Date.now() < entry.blockedUntil;
  }
}
