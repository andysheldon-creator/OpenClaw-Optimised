import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimiter } from "./rate-limit.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({
      maxTokens: 3,
      refillIntervalMs: 10_000,
      failurePenalty: 1,
      cleanupIntervalMs: 0, // disable auto-cleanup for tests
    });
  });

  afterEach(() => {
    limiter.dispose();
    vi.useRealTimers();
  });

  it("allows requests within the token limit", () => {
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("rejects requests exceeding the token limit", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different IPs independently", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
    // Different IP should still be allowed
    expect(limiter.check("5.6.7.8").allowed).toBe(true);
  });

  it("refills tokens after the interval", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    // Advance time past the refill interval
    vi.advanceTimersByTime(10_000);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("penalize() consumes extra tokens", () => {
    limiter.check("1.2.3.4"); // 2 tokens left
    limiter.penalize("1.2.3.4"); // 1 token left
    limiter.check("1.2.3.4"); // 0 tokens left
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
  });

  it("penalize() does not go below zero", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.penalize("1.2.3.4"); // already at 0
    // After refill, should still work
    vi.advanceTimersByTime(10_000);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("retryAfterMs returns correct value", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");

    vi.advanceTimersByTime(3_000); // 3 seconds elapsed
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    // Should be approximately 7 seconds (10s - 3s)
    expect(result.retryAfterMs).toBeLessThanOrEqual(7_000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("reports size correctly", () => {
    expect(limiter.size).toBe(0);
    limiter.check("1.2.3.4");
    expect(limiter.size).toBe(1);
    limiter.check("5.6.7.8");
    expect(limiter.size).toBe(2);
  });

  it("multiple refill intervals restore multiple tokens", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    // Advance by 2 intervals = should refill 2 tokens
    vi.advanceTimersByTime(20_000);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
  });

  it("does not exceed max tokens on long waits", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");

    // Wait a very long time
    vi.advanceTimersByTime(100_000);

    // Should have at most maxTokens (3)
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
  });
});
