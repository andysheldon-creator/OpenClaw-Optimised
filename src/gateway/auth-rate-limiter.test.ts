import { describe, it, expect, afterEach } from "vitest";
import { AuthRateLimiter } from "./auth-rate-limiter.js";

describe("AuthRateLimiter", () => {
  let limiter: AuthRateLimiter;

  afterEach(() => {
    limiter?.dispose();
  });

  it("allows requests under the threshold", () => {
    limiter = new AuthRateLimiter({ maxAttempts: 5, windowMs: 60_000, blockMs: 300_000 });
    const ip = "192.168.1.1";

    for (let i = 0; i < 4; i++) {
      limiter.recordFailure(ip);
    }

    expect(limiter.check(ip)).toBe(true);
    expect(limiter.isBlocked(ip)).toBe(false);
  });

  it("blocks after exceeding the threshold", () => {
    limiter = new AuthRateLimiter({ maxAttempts: 3, windowMs: 60_000, blockMs: 300_000 });
    const ip = "10.0.0.1";

    for (let i = 0; i < 3; i++) {
      limiter.recordFailure(ip);
    }

    expect(limiter.check(ip)).toBe(false);
    expect(limiter.isBlocked(ip)).toBe(true);
  });

  it("does not affect other IPs", () => {
    limiter = new AuthRateLimiter({ maxAttempts: 2, windowMs: 60_000, blockMs: 300_000 });

    limiter.recordFailure("1.1.1.1");
    limiter.recordFailure("1.1.1.1");

    expect(limiter.check("1.1.1.1")).toBe(false);
    expect(limiter.check("2.2.2.2")).toBe(true);
  });

  it("unblocks after block duration expires", () => {
    limiter = new AuthRateLimiter({ maxAttempts: 2, windowMs: 60_000, blockMs: 100 });
    const ip = "10.0.0.2";

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.check(ip)).toBe(false);

    // Wait for block to expire.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(limiter.check(ip)).toBe(true);
        expect(limiter.isBlocked(ip)).toBe(false);
        resolve();
      }, 150);
    });
  });

  it("reports correct size", () => {
    limiter = new AuthRateLimiter({ maxAttempts: 10, windowMs: 60_000, blockMs: 300_000 });

    limiter.recordFailure("a");
    limiter.recordFailure("b");
    limiter.recordFailure("c");

    expect(limiter.size).toBe(3);
  });

  it("allows unknown IPs", () => {
    limiter = new AuthRateLimiter();
    expect(limiter.check("never-seen")).toBe(true);
  });
});
