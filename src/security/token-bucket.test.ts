import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { TokenBucket } from "./token-bucket.js";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with full capacity", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 }); // 1 token/sec
      expect(bucket.getTokens()).toBe(10);
    });
  });

  describe("consume", () => {
    it("should consume tokens successfully when available", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 });
      expect(bucket.consume(3)).toBe(true);
      expect(bucket.getTokens()).toBe(7);
    });

    it("should reject consumption when insufficient tokens", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 0.001 });
      expect(bucket.consume(10)).toBe(false);
      expect(bucket.getTokens()).toBe(5);
    });

    it("should consume exactly available tokens", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 0.001 });
      expect(bucket.consume(5)).toBe(true);
      expect(bucket.getTokens()).toBe(0);
    });
  });

  describe("refill", () => {
    it("should refill tokens based on elapsed time", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.002 }); // 2 tokens/sec
      bucket.consume(10); // Empty the bucket
      expect(bucket.getTokens()).toBe(0);

      vi.advanceTimersByTime(1000); // Advance 1 second = 2 tokens
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.getTokens()).toBeCloseTo(1, 1);
    });

    it("should not exceed capacity on refill", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.005 }); // 5 tokens/sec
      bucket.consume(5); // 5 tokens left

      vi.advanceTimersByTime(10000); // Advance 10 seconds (should refill 50 tokens)
      expect(bucket.getTokens()).toBe(10); // Capped at capacity
    });

    it("should handle partial second refills", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 }); // 1 token/sec
      bucket.consume(10); // Empty the bucket

      vi.advanceTimersByTime(500); // Advance 0.5 seconds = 0.5 tokens
      expect(bucket.getTokens()).toBe(0); // Tokens are floored, so still 0
    });
  });

  describe("getRetryAfterMs", () => {
    it("should return 0 when enough tokens available", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 });
      expect(bucket.getRetryAfterMs(5)).toBe(0);
    });

    it("should calculate retry time for insufficient tokens", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.002 }); // 2 tokens/sec
      bucket.consume(10); // Empty the bucket

      // Need 5 tokens, refill rate is 2/sec, so need 2.5 seconds
      const retryAfter = bucket.getRetryAfterMs(5);
      expect(retryAfter).toBeGreaterThanOrEqual(2400);
      expect(retryAfter).toBeLessThanOrEqual(2600);
    });

    it("should return Infinity when count exceeds capacity", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 });
      expect(bucket.getRetryAfterMs(15)).toBe(Infinity);
    });
  });

  describe("reset", () => {
    it("should restore bucket to full capacity", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.001 });
      bucket.consume(8);
      expect(bucket.getTokens()).toBe(2);

      bucket.reset();
      expect(bucket.getTokens()).toBe(10);
    });
  });

  describe("integration scenarios", () => {
    it("should handle burst followed by gradual refill", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 0.001 }); // 1 token/sec

      // Burst: consume all tokens
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(false); // Depleted

      // Wait and refill
      vi.advanceTimersByTime(2000); // 2 seconds = 2 tokens
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(true);
      expect(bucket.consume(1)).toBe(false); // Not enough yet
    });

    it("should maintain capacity during continuous consumption", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 0.005 }); // 5 tokens/sec

      // Consume 5 tokens per second (sustainable rate)
      for (let i = 0; i < 5; i++) {
        expect(bucket.consume(1)).toBe(true);
        vi.advanceTimersByTime(200); // 0.2 seconds = 1 token refill
      }

      // Should still have tokens available
      expect(bucket.getTokens()).toBeGreaterThan(0);
    });
  });
});
