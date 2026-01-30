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
    it("should initialize with full tokens", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.getTokens()).toBe(10);
    });

    it("should throw error for invalid max", () => {
      expect(() => new TokenBucket({ max: 0, refillRate: 1 })).toThrow("max must be positive");
      expect(() => new TokenBucket({ max: -1, refillRate: 1 })).toThrow("max must be positive");
    });

    it("should throw error for invalid refillRate", () => {
      expect(() => new TokenBucket({ max: 10, refillRate: 0 })).toThrow(
        "refillRate must be positive",
      );
      expect(() => new TokenBucket({ max: 10, refillRate: -1 })).toThrow(
        "refillRate must be positive",
      );
    });
  });

  describe("consume", () => {
    it("should consume tokens successfully when available", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.consume(3)).toBe(true);
      expect(bucket.getTokens()).toBe(7);
    });

    it("should reject consumption when insufficient tokens", () => {
      const bucket = new TokenBucket({ max: 5, refillRate: 1 });
      expect(bucket.consume(10)).toBe(false);
      expect(bucket.getTokens()).toBe(5);
    });

    it("should consume exactly available tokens", () => {
      const bucket = new TokenBucket({ max: 5, refillRate: 1 });
      expect(bucket.consume(5)).toBe(true);
      expect(bucket.getTokens()).toBe(0);
    });

    it("should reject consumption when count is zero", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.consume(0)).toBe(false);
    });

    it("should reject consumption when count is negative", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.consume(-1)).toBe(false);
    });
  });

  describe("refill", () => {
    it("should refill tokens based on elapsed time", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 2 }); // 2 tokens/sec
      bucket.consume(10); // Empty the bucket
      expect(bucket.getTokens()).toBe(0);

      vi.advanceTimersByTime(1000); // Advance 1 second
      expect(bucket.consume(1)).toBe(true); // Should refill 2 tokens
      expect(bucket.getTokens()).toBeCloseTo(1, 1);
    });

    it("should not exceed max tokens on refill", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 5 });
      bucket.consume(5); // 5 tokens left

      vi.advanceTimersByTime(10000); // Advance 10 seconds (should refill 50 tokens)
      expect(bucket.getTokens()).toBe(10); // Capped at max
    });

    it("should handle partial second refills", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      bucket.consume(10); // Empty the bucket

      vi.advanceTimersByTime(500); // Advance 0.5 seconds
      expect(bucket.getTokens()).toBeCloseTo(0.5, 1);
    });
  });

  describe("getRetryAfterMs", () => {
    it("should return 0 when enough tokens available", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.getRetryAfterMs(5)).toBe(0);
    });

    it("should calculate retry time for insufficient tokens", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 2 }); // 2 tokens/sec
      bucket.consume(10); // Empty the bucket

      // Need 5 tokens, refill rate is 2/sec, so need 2.5 seconds
      const retryAfter = bucket.getRetryAfterMs(5);
      expect(retryAfter).toBeGreaterThanOrEqual(2400);
      expect(retryAfter).toBeLessThanOrEqual(2600);
    });

    it("should return Infinity when count exceeds max", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      expect(bucket.getRetryAfterMs(15)).toBe(Infinity);
    });
  });

  describe("reset", () => {
    it("should restore bucket to full capacity", () => {
      const bucket = new TokenBucket({ max: 10, refillRate: 1 });
      bucket.consume(8);
      expect(bucket.getTokens()).toBe(2);

      bucket.reset();
      expect(bucket.getTokens()).toBe(10);
    });
  });

  describe("integration scenarios", () => {
    it("should handle burst followed by gradual refill", () => {
      const bucket = new TokenBucket({ max: 5, refillRate: 1 });

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
      const bucket = new TokenBucket({ max: 10, refillRate: 5 }); // 5 tokens/sec

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
