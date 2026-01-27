import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGatewayRateLimiter,
  DEFAULT_RATE_LIMIT_CONFIG,
  GatewayRateLimiter,
  resolveRateLimitConfig,
} from "./rate-limit.js";

describe("rate-limit config resolution", () => {
  it("uses defaults when no config provided", () => {
    const resolved = resolveRateLimitConfig();
    expect(resolved).toEqual(DEFAULT_RATE_LIMIT_CONFIG);
  });

  it("merges partial config with defaults", () => {
    const resolved = resolveRateLimitConfig({
      enabled: false,
      unauthenticated: 30,
    });
    expect(resolved.enabled).toBe(false);
    expect(resolved.unauthenticated).toBe(30);
    expect(resolved.authenticated).toBe(DEFAULT_RATE_LIMIT_CONFIG.authenticated);
    expect(resolved.channelMessages).toBe(DEFAULT_RATE_LIMIT_CONFIG.channelMessages);
  });

  it("respects all config overrides", () => {
    const config = {
      enabled: true,
      unauthenticated: 10,
      authenticated: 100,
      channelMessages: 50,
      burstMultiplier: 3,
      authFailuresBeforeBackoff: 3,
      authBackoffBaseMs: 500,
      authBackoffMaxMs: 30000,
    };
    const resolved = resolveRateLimitConfig(config);
    expect(resolved).toEqual(config);
  });
});

describe("GatewayRateLimiter", () => {
  let limiter: GatewayRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    limiter?.close();
    vi.useRealTimers();
  });

  describe("basic rate limiting", () => {
    it("allows requests when rate limit is disabled", () => {
      limiter = createGatewayRateLimiter({ enabled: false });
      for (let i = 0; i < 1000; i++) {
        const result = limiter.checkRequest("client1", false);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(Infinity);
      }
    });

    it("allows unlimited authenticated requests when authenticated=0", () => {
      limiter = createGatewayRateLimiter({ authenticated: 0 });
      for (let i = 0; i < 1000; i++) {
        const result = limiter.checkRequest("client1", true);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(Infinity);
      }
    });

    it("blocks unauthenticated requests after burst limit", () => {
      limiter = createGatewayRateLimiter({
        unauthenticated: 10,
        burstMultiplier: 2,
      });

      // Should allow 20 requests (10 * 2 burst)
      for (let i = 0; i < 20; i++) {
        const result = limiter.checkRequest("client1", false);
        expect(result.allowed).toBe(true);
      }

      // 21st request should be blocked
      const blocked = limiter.checkRequest("client1", false);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("rate_limit");
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it("refills tokens over time", () => {
      limiter = createGatewayRateLimiter({
        unauthenticated: 60, // 1 per second
        burstMultiplier: 1,
      });

      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        limiter.checkRequest("client1", false);
      }

      const blocked = limiter.checkRequest("client1", false);
      expect(blocked.allowed).toBe(false);

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000);

      // Should have ~30 tokens refilled
      for (let i = 0; i < 30; i++) {
        const result = limiter.checkRequest("client1", false);
        expect(result.allowed).toBe(true);
      }
    });

    it("tracks separate buckets per client", () => {
      limiter = createGatewayRateLimiter({
        unauthenticated: 5,
        burstMultiplier: 1,
      });

      // Exhaust client1's tokens
      for (let i = 0; i < 5; i++) {
        limiter.checkRequest("client1", false);
      }
      expect(limiter.checkRequest("client1", false).allowed).toBe(false);

      // client2 should still have tokens
      expect(limiter.checkRequest("client2", false).allowed).toBe(true);
    });
  });

  describe("channel message rate limiting", () => {
    it("limits channel messages separately from client requests", () => {
      limiter = createGatewayRateLimiter({
        channelMessages: 5,
        burstMultiplier: 1,
      });

      // Exhaust channel messages
      for (let i = 0; i < 5; i++) {
        const result = limiter.checkChannelMessage("telegram:123");
        expect(result.allowed).toBe(true);
      }

      const blocked = limiter.checkChannelMessage("telegram:123");
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("rate_limit");

      // Different channel should still work
      expect(limiter.checkChannelMessage("telegram:456").allowed).toBe(true);
    });

    it("allows unlimited channel messages when channelMessages=0", () => {
      limiter = createGatewayRateLimiter({ channelMessages: 0 });
      for (let i = 0; i < 1000; i++) {
        expect(limiter.checkChannelMessage("telegram:123").allowed).toBe(true);
      }
    });
  });

  describe("auth failure backoff", () => {
    it("does not apply backoff before threshold", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 5,
      });

      // Record 4 failures
      for (let i = 0; i < 4; i++) {
        limiter.recordAuthFailure("client1");
      }

      const result = limiter.checkRequest("client1", false);
      expect(result.allowed).toBe(true);
    });

    it("applies backoff after threshold failures", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 3,
        authBackoffBaseMs: 1000,
      });

      // Record 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        limiter.recordAuthFailure("client1");
      }

      const result = limiter.checkRequest("client1", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("auth_backoff");
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("applies exponential backoff for subsequent failures", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 1,
        authBackoffBaseMs: 1000,
        authBackoffMaxMs: 60000,
      });

      // First failure at threshold
      limiter.recordAuthFailure("client1");
      const state1 = limiter.getAuthBackoffState("client1");
      expect(state1?.backoffUntilMs).toBeGreaterThan(Date.now());

      // Wait for backoff to expire
      vi.advanceTimersByTime(1100);

      // Second failure
      limiter.recordAuthFailure("client1");
      const state2 = limiter.getAuthBackoffState("client1");

      // Backoff should be ~2x longer
      expect(state2?.failures).toBe(2);
    });

    it("respects max backoff limit", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 1,
        authBackoffBaseMs: 10000,
        authBackoffMaxMs: 20000,
      });

      // Record many failures
      for (let i = 0; i < 10; i++) {
        limiter.recordAuthFailure("client1");
        vi.advanceTimersByTime(100);
      }

      const state = limiter.getAuthBackoffState("client1");
      const backoffDuration = state!.backoffUntilMs - Date.now();
      expect(backoffDuration).toBeLessThanOrEqual(20000);
    });

    it("clears backoff after successful auth", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 1,
        authBackoffBaseMs: 1000,
      });

      limiter.recordAuthFailure("client1");
      expect(limiter.getAuthBackoffState("client1")).not.toBeNull();

      limiter.clearAuthFailure("client1");
      expect(limiter.getAuthBackoffState("client1")).toBeNull();
    });

    it("resets failure counter after 10 minute gap", () => {
      limiter = createGatewayRateLimiter({
        authFailuresBeforeBackoff: 3,
        authBackoffBaseMs: 1000,
      });

      // Record 2 failures
      limiter.recordAuthFailure("client1");
      limiter.recordAuthFailure("client1");

      // Wait 11 minutes
      vi.advanceTimersByTime(11 * 60 * 1000);

      // This should reset counter and count as first failure
      limiter.recordAuthFailure("client1");

      // Should not be in backoff yet
      const result = limiter.checkRequest("client1", false);
      expect(result.allowed).toBe(true);
    });
  });

  describe("config updates", () => {
    it("updates config at runtime", () => {
      limiter = createGatewayRateLimiter({ enabled: true });
      expect(limiter.getConfig().enabled).toBe(true);

      limiter.updateConfig({ enabled: false });
      expect(limiter.getConfig().enabled).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("cleans up stale buckets", () => {
      limiter = createGatewayRateLimiter();

      // Create some buckets
      limiter.checkRequest("client1", false);
      limiter.checkRequest("client2", false);

      // Advance time past cleanup threshold (10 min)
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Trigger cleanup (normally happens on interval, but we can check indirectly)
      // After cleanup, new requests should create fresh buckets
      const result = limiter.checkRequest("client1", false);
      expect(result.allowed).toBe(true);
    });
  });
});

describe("createGatewayRateLimiter", () => {
  it("creates a limiter instance", () => {
    const limiter = createGatewayRateLimiter();
    expect(limiter).toBeInstanceOf(GatewayRateLimiter);
    limiter.close();
  });
});
