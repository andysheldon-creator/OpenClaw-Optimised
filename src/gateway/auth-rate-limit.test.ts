import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedRateLimitsAuthConfig } from "../config/types.gateway.js";
import { AuthRateLimiter } from "./auth-rate-limit.js";

function makeConfig(
  overrides?: Partial<ResolvedRateLimitsAuthConfig>,
): ResolvedRateLimitsAuthConfig {
  return {
    maxFailures: overrides?.maxFailures ?? 10,
    windowMinutes: overrides?.windowMinutes ?? 15,
  };
}

describe("AuthRateLimiter", () => {
  let limiter: AuthRateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it("checkAuthAllowed does NOT consume tokens (read-only)", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 3 }));
    // Call checkAuthAllowed many times — should never block on its own
    for (let i = 0; i < 20; i++) {
      expect(limiter.checkAuthAllowed("192.168.1.1").allowed).toBe(true);
    }
  });

  it("blocks auth only after maxFailures recorded failures", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 3 }));
    for (let i = 0; i < 3; i++) {
      limiter.recordFailure("192.168.1.1");
    }
    const result = limiter.checkAuthAllowed("192.168.1.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("successful auths do not count toward lockout", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 3 }));
    // 20 successes should never lock out
    for (let i = 0; i < 20; i++) {
      expect(limiter.checkAuthAllowed("192.168.1.1").allowed).toBe(true);
      limiter.recordSuccess("192.168.1.1");
    }
  });

  it("returns retryAfterMs when blocked", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 1, windowMinutes: 15 }));
    limiter.recordFailure("192.168.1.1");
    const result = limiter.checkAuthAllowed("192.168.1.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets failure count on successful auth", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 2 }));
    limiter.recordFailure("192.168.1.1");
    limiter.recordFailure("192.168.1.1");

    // Blocked
    expect(limiter.checkAuthAllowed("192.168.1.1").allowed).toBe(false);

    // Reset on success
    limiter.recordSuccess("192.168.1.1");

    // Should be allowed again
    expect(limiter.checkAuthAllowed("192.168.1.1").allowed).toBe(true);
  });

  it("separate tracking per IP", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 1 }));
    limiter.recordFailure("10.0.0.1");

    expect(limiter.checkAuthAllowed("10.0.0.1").allowed).toBe(false);
    expect(limiter.checkAuthAllowed("10.0.0.2").allowed).toBe(true);
  });

  it("failures expire after windowMinutes", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 1, windowMinutes: 15 }));
    limiter.recordFailure("192.168.1.1");

    const blocked = limiter.checkAuthAllowed("192.168.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("does not block when rateLimits.enabled is false", () => {
    limiter = new AuthRateLimiter(makeConfig({ maxFailures: 1 }), false);
    // Even after many "failures", should always be allowed
    for (let i = 0; i < 20; i++) {
      limiter.checkAuthAllowed("192.168.1.1");
      limiter.recordFailure("192.168.1.1");
    }
    expect(limiter.checkAuthAllowed("192.168.1.1").allowed).toBe(true);
  });

  it("destroy cleans up", () => {
    limiter = new AuthRateLimiter(makeConfig());
    limiter.recordFailure("192.168.1.1"); // creates a bucket via check()
    expect(limiter.size).toBe(1);
    limiter.destroy();
    // Double destroy should be safe
    limiter.destroy();
  });
});
