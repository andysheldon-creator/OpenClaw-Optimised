import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { RateLimiter, RateLimitKeys } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    limiter.resetAll();
  });

  describe("check", () => {
    it("should allow requests within rate limit", () => {
      const limit = { max: 5, windowMs: 60000 };
      const key = "test:key";

      for (let i = 0; i < 5; i++) {
        const result = limiter.check(key, limit);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThanOrEqual(0);
      }
    });

    it("should deny requests exceeding rate limit", () => {
      const limit = { max: 3, windowMs: 60000 };
      const key = "test:key";

      // Consume all tokens
      limiter.check(key, limit);
      limiter.check(key, limit);
      limiter.check(key, limit);

      // Should be rate limited
      const result = limiter.check(key, limit);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("should track separate keys independently", () => {
      const limit = { max: 2, windowMs: 60000 };

      const result1 = limiter.check("key1", limit);
      const result2 = limiter.check("key2", limit);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should refill tokens after time window", () => {
      const limit = { max: 5, windowMs: 10000 }; // 5 requests per 10 seconds
      const key = "test:key";

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        limiter.check(key, limit);
      }

      // Should be rate limited
      expect(limiter.check(key, limit).allowed).toBe(false);

      // Advance time to allow refill
      vi.advanceTimersByTime(10000);

      // Should allow requests again
      const result = limiter.check(key, limit);
      expect(result.allowed).toBe(true);
    });

    it("should provide resetAt timestamp", () => {
      const limit = { max: 5, windowMs: 60000 };
      const key = "test:key";

      const now = Date.now();
      const result = limiter.check(key, limit);

      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(now);
    });
  });

  describe("peek", () => {
    it("should check limit without consuming tokens", () => {
      const limit = { max: 5, windowMs: 60000 };
      const key = "test:key";

      // Peek multiple times
      const result1 = limiter.peek(key, limit);
      const result2 = limiter.peek(key, limit);
      const result3 = limiter.peek(key, limit);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
      expect(result1.remaining).toBe(result2.remaining);
      expect(result2.remaining).toBe(result3.remaining);
    });

    it("should reflect consumed tokens from check", () => {
      const limit = { max: 5, windowMs: 60000 };
      const key = "test:key";

      limiter.check(key, limit); // Consume 1
      limiter.check(key, limit); // Consume 1

      const result = limiter.peek(key, limit);
      expect(result.remaining).toBe(3);
    });
  });

  describe("reset", () => {
    it("should reset specific key", () => {
      const limit = { max: 3, windowMs: 60000 };
      const key = "test:key";

      // Consume all tokens
      limiter.check(key, limit);
      limiter.check(key, limit);
      limiter.check(key, limit);

      expect(limiter.check(key, limit).allowed).toBe(false);

      // Reset
      limiter.reset(key);

      // Should allow requests again
      const result = limiter.check(key, limit);
      expect(result.allowed).toBe(true);
    });

    it("should not affect other keys", () => {
      const limit = { max: 2, windowMs: 60000 };

      limiter.check("key1", limit);
      limiter.check("key2", limit);

      limiter.reset("key1");

      // key1 should be reset
      expect(limiter.peek("key1", limit).remaining).toBe(2);
      // key2 should still have consumed token
      expect(limiter.peek("key2", limit).remaining).toBe(1);
    });
  });

  describe("resetAll", () => {
    it("should reset all keys", () => {
      const limit = { max: 3, windowMs: 60000 };

      limiter.check("key1", limit);
      limiter.check("key2", limit);
      limiter.check("key3", limit);

      limiter.resetAll();

      expect(limiter.peek("key1", limit).remaining).toBe(3);
      expect(limiter.peek("key2", limit).remaining).toBe(3);
      expect(limiter.peek("key3", limit).remaining).toBe(3);
    });
  });

  describe("LRU cache behavior", () => {
    it("should evict least recently used entries when cache is full", () => {
      const smallLimiter = new RateLimiter({ maxSize: 3 });
      const limit = { max: 5, windowMs: 60000 };

      // Add 3 entries
      smallLimiter.check("key1", limit);
      smallLimiter.check("key2", limit);
      smallLimiter.check("key3", limit);

      // Add 4th entry, should evict key1
      smallLimiter.check("key4", limit);

      // key1 should be evicted (fresh entry)
      expect(smallLimiter.peek("key1", limit).remaining).toBe(5);
      // key2, key3, key4 should have consumed tokens
      expect(smallLimiter.peek("key2", limit).remaining).toBe(4);
      expect(smallLimiter.peek("key3", limit).remaining).toBe(4);
      expect(smallLimiter.peek("key4", limit).remaining).toBe(4);
    });
  });

  describe("cleanup", () => {
    it("should clean up stale entries", () => {
      const limit = { max: 5, windowMs: 10000 };
      const key = "test:key";

      limiter.check(key, limit);

      // Advance past cleanup interval + TTL
      vi.advanceTimersByTime(180000); // 3 minutes (cleanup runs every 60s, TTL is 2min)

      // Trigger cleanup by checking
      limiter.check("trigger:cleanup", limit);

      // Original entry should be cleaned up (fresh entry)
      expect(limiter.peek(key, limit).remaining).toBe(5);
    });
  });

  describe("RateLimitKeys", () => {
    it("should generate unique keys for auth attempts", () => {
      const key1 = RateLimitKeys.authAttempt("192.168.1.1");
      const key2 = RateLimitKeys.authAttempt("192.168.1.2");

      expect(key1).toBe("auth:192.168.1.1");
      expect(key2).toBe("auth:192.168.1.2");
      expect(key1).not.toBe(key2);
    });

    it("should generate unique keys for device auth attempts", () => {
      const key1 = RateLimitKeys.authAttemptDevice("device-123");
      const key2 = RateLimitKeys.authAttemptDevice("device-456");

      expect(key1).toBe("auth:device:device-123");
      expect(key2).toBe("auth:device:device-456");
      expect(key1).not.toBe(key2);
    });

    it("should generate unique keys for connections", () => {
      const key = RateLimitKeys.connection("192.168.1.1");
      expect(key).toBe("conn:192.168.1.1");
    });

    it("should generate unique keys for requests", () => {
      const key = RateLimitKeys.request("192.168.1.1");
      expect(key).toBe("req:192.168.1.1");
    });

    it("should generate unique keys for pairing requests", () => {
      const key = RateLimitKeys.pairingRequest("telegram", "user123");
      expect(key).toBe("pair:telegram:user123");
    });

    it("should generate unique keys for webhook tokens", () => {
      const key = RateLimitKeys.webhookToken("token-abc");
      expect(key).toBe("hook:token:token-abc");
    });

    it("should generate unique keys for webhook paths", () => {
      const key = RateLimitKeys.webhookPath("/api/webhook");
      expect(key).toBe("hook:path:/api/webhook");
    });
  });

  describe("integration scenarios", () => {
    it("should handle burst traffic pattern", () => {
      const limit = { max: 10, windowMs: 60000 };
      const key = "burst:test";

      // Burst of 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.check(key, limit).allowed).toBe(true);
      }

      // 11th request should be rate limited
      expect(limiter.check(key, limit).allowed).toBe(false);
    });

    it("should handle sustained traffic under limit", () => {
      const limit = { max: 100, windowMs: 60000 }; // 100 req/min
      const key = "sustained:test";

      // 50 requests should all pass
      for (let i = 0; i < 50; i++) {
        expect(limiter.check(key, limit).allowed).toBe(true);
      }

      const result = limiter.peek(key, limit);
      expect(result.remaining).toBe(50);
    });

    it("should handle multiple IPs with different patterns", () => {
      const limit = { max: 5, windowMs: 60000 };

      // IP1: consume 3 tokens
      for (let i = 0; i < 3; i++) {
        limiter.check(RateLimitKeys.authAttempt("192.168.1.1"), limit);
      }

      // IP2: consume 5 tokens (rate limited)
      for (let i = 0; i < 5; i++) {
        limiter.check(RateLimitKeys.authAttempt("192.168.1.2"), limit);
      }

      // IP1 should still have capacity
      expect(limiter.check(RateLimitKeys.authAttempt("192.168.1.1"), limit).allowed).toBe(true);

      // IP2 should be rate limited
      expect(limiter.check(RateLimitKeys.authAttempt("192.168.1.2"), limit).allowed).toBe(false);
    });
  });
});
