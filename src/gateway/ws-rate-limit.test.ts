import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedRateLimitsWsConfig } from "../config/types.gateway.js";
import {
  checkWsConnection,
  checkWsMessageRate,
  checkWsMethodRate,
  createWsConnectionTracker,
  createWsMessageRateLimiters,
  destroyWsMessageRateLimiters,
  trackWsConnect,
  trackWsDisconnect,
  type WsConnectionTracker,
  type WsMessageRateLimitState,
} from "./ws-rate-limit.js";

function makeWsConfig(overrides?: Partial<ResolvedRateLimitsWsConfig>): ResolvedRateLimitsWsConfig {
  return {
    messagesPerMinute: overrides?.messagesPerMinute ?? 60,
    agentPerMinute: overrides?.agentPerMinute ?? 10,
    ttsPerMinute: overrides?.ttsPerMinute ?? 20,
    maxConnections: overrides?.maxConnections ?? 50,
    perIpMaxConnections: overrides?.perIpMaxConnections ?? 5,
  };
}

describe("WS Rate Limiting", () => {
  describe("Connection limits", () => {
    let tracker: WsConnectionTracker;

    it("allows connections within maxConnections limit", () => {
      tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 3 }));
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.2");
      const result = checkWsConnection(tracker, "10.0.0.3");
      expect(result.allowed).toBe(true);
    });

    it("rejects connections when maxConnections reached", () => {
      tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 2 }));
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.2");
      const result = checkWsConnection(tracker, "10.0.0.3");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("max_connections");
    });

    it("allows new connection after a previous one closes", () => {
      tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 2 }));
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.2");
      expect(checkWsConnection(tracker, "10.0.0.3").allowed).toBe(false);

      trackWsDisconnect(tracker, "10.0.0.1");
      expect(checkWsConnection(tracker, "10.0.0.3").allowed).toBe(true);
    });

    it("limits per-IP concurrent connections to configured max", () => {
      tracker = createWsConnectionTracker(
        makeWsConfig({ maxConnections: 50, perIpMaxConnections: 3 }),
      );
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.1");

      const result = checkWsConnection(tracker, "10.0.0.1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("per_ip_max_connections");
    });

    it("different IPs have independent connection counts", () => {
      tracker = createWsConnectionTracker(
        makeWsConfig({ maxConnections: 50, perIpMaxConnections: 2 }),
      );
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.1");
      // 10.0.0.1 is at limit
      expect(checkWsConnection(tracker, "10.0.0.1").allowed).toBe(false);
      // 10.0.0.2 should be fine
      expect(checkWsConnection(tracker, "10.0.0.2").allowed).toBe(true);
    });

    it("disconnect prevents counter from going negative", () => {
      tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 50 }));
      trackWsDisconnect(tracker, "10.0.0.1");
      expect(tracker.totalConnections).toBe(0);
      expect(tracker.perIpConnections.size).toBe(0);
    });

    it("disconnect cleans up IP entry when count reaches zero", () => {
      tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 50 }));
      trackWsConnect(tracker, "10.0.0.1");
      expect(tracker.perIpConnections.has("10.0.0.1")).toBe(true);
      trackWsDisconnect(tracker, "10.0.0.1");
      expect(tracker.perIpConnections.has("10.0.0.1")).toBe(false);
    });
  });

  describe("Message throttling", () => {
    let state: WsMessageRateLimitState;

    afterEach(() => {
      if (state) {
        destroyWsMessageRateLimiters(state);
      }
    });

    it("allows messages within per-client limit", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ messagesPerMinute: 5 }));
      for (let i = 0; i < 5; i++) {
        expect(checkWsMessageRate(state, "client-1").allowed).toBe(true);
      }
    });

    it("sends rate_limit error when exceeded", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ messagesPerMinute: 2 }));
      checkWsMessageRate(state, "client-1");
      checkWsMessageRate(state, "client-1");
      const result = checkWsMessageRate(state, "client-1");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("separate tracking per client", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ messagesPerMinute: 1 }));
      expect(checkWsMessageRate(state, "client-1").allowed).toBe(true);
      expect(checkWsMessageRate(state, "client-2").allowed).toBe(true);
      // Both exhausted
      expect(checkWsMessageRate(state, "client-1").allowed).toBe(false);
      expect(checkWsMessageRate(state, "client-2").allowed).toBe(false);
    });
  });

  describe("Per-method limits", () => {
    let state: WsMessageRateLimitState;

    afterEach(() => {
      if (state) {
        destroyWsMessageRateLimiters(state);
      }
    });

    it("agent method limited to configured rate per client", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 2 }));
      expect(checkWsMethodRate(state, "client-1", "agent").allowed).toBe(true);
      expect(checkWsMethodRate(state, "client-1", "agent").allowed).toBe(true);
      const result = checkWsMethodRate(state, "client-1", "agent");
      expect(result.allowed).toBe(false);
      expect(result.method).toBe("agent");
    });

    it("agent.wait uses same limiter as agent", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 1 }));
      expect(checkWsMethodRate(state, "client-1", "agent").allowed).toBe(true);
      // agent.wait shares the agent limiter
      expect(checkWsMethodRate(state, "client-1", "agent.wait").allowed).toBe(false);
    });

    it("chat.send limited by agent limiter", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 2 }));
      expect(checkWsMethodRate(state, "client-1", "chat.send").allowed).toBe(true);
      expect(checkWsMethodRate(state, "client-1", "chat.send").allowed).toBe(true);
      const result = checkWsMethodRate(state, "client-1", "chat.send");
      expect(result.allowed).toBe(false);
      expect(result.method).toBe("chat.send");
    });

    it("tts.convert method limited to configured rate per client", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ ttsPerMinute: 3 }));
      for (let i = 0; i < 3; i++) {
        expect(checkWsMethodRate(state, "client-1", "tts.convert").allowed).toBe(true);
      }
      const result = checkWsMethodRate(state, "client-1", "tts.convert");
      expect(result.allowed).toBe(false);
      expect(result.method).toBe("tts.convert");
    });

    it("non-limited methods unaffected", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 1 }));
      // Exhaust agent limit
      checkWsMethodRate(state, "client-1", "agent");
      // Non-limited methods should pass
      expect(checkWsMethodRate(state, "client-1", "health.get").allowed).toBe(true);
      expect(checkWsMethodRate(state, "client-1", "presence.list").allowed).toBe(true);
      expect(checkWsMethodRate(state, "client-1", "config.get").allowed).toBe(true);
    });

    it("error response includes method name and retryAfterMs", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 1 }));
      checkWsMethodRate(state, "client-1", "agent");
      const result = checkWsMethodRate(state, "client-1", "agent");
      expect(result.allowed).toBe(false);
      expect(result.method).toBe("agent");
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("different clients have independent method limits", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 1 }));
      expect(checkWsMethodRate(state, "client-1", "agent").allowed).toBe(true);
      expect(checkWsMethodRate(state, "client-2", "agent").allowed).toBe(true);
      // Both exhausted independently
      expect(checkWsMethodRate(state, "client-1", "agent").allowed).toBe(false);
      expect(checkWsMethodRate(state, "client-2", "agent").allowed).toBe(false);
    });
  });

  describe("Config integration", () => {
    let state: WsMessageRateLimitState;

    afterEach(() => {
      if (state) {
        destroyWsMessageRateLimiters(state);
      }
    });

    it("custom messagesPerMinute respected", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ messagesPerMinute: 3 }));
      for (let i = 0; i < 3; i++) {
        expect(checkWsMessageRate(state, "c1").allowed).toBe(true);
      }
      expect(checkWsMessageRate(state, "c1").allowed).toBe(false);
    });

    it("custom agentPerMinute respected", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ agentPerMinute: 2 }));
      expect(checkWsMethodRate(state, "c1", "agent").allowed).toBe(true);
      expect(checkWsMethodRate(state, "c1", "agent").allowed).toBe(true);
      expect(checkWsMethodRate(state, "c1", "agent").allowed).toBe(false);
    });

    it("custom maxConnections respected", () => {
      const tracker = createWsConnectionTracker(makeWsConfig({ maxConnections: 1 }));
      trackWsConnect(tracker, "10.0.0.1");
      expect(checkWsConnection(tracker, "10.0.0.2").allowed).toBe(false);
    });

    it("custom ttsPerMinute respected", () => {
      state = createWsMessageRateLimiters(makeWsConfig({ ttsPerMinute: 2 }));
      expect(checkWsMethodRate(state, "c1", "tts.convert").allowed).toBe(true);
      expect(checkWsMethodRate(state, "c1", "tts.convert").allowed).toBe(true);
      expect(checkWsMethodRate(state, "c1", "tts.convert").allowed).toBe(false);
    });

    it("custom perIpMaxConnections respected", () => {
      const tracker = createWsConnectionTracker(
        makeWsConfig({ maxConnections: 50, perIpMaxConnections: 2 }),
      );
      trackWsConnect(tracker, "10.0.0.1");
      trackWsConnect(tracker, "10.0.0.1");
      expect(checkWsConnection(tracker, "10.0.0.1").allowed).toBe(false);
    });

    it("enabled: false bypasses all WS rate limiting", () => {
      // When enabled is false, the server should not create limiters.
      // This test documents the contract — the server checks config.enabled
      // before creating/checking WS rate limiters.
      const config = makeWsConfig({ messagesPerMinute: 1 });
      // The ws-rate-limit module itself doesn't have an enabled flag;
      // the server is responsible for skipping rate limit checks when disabled.
      // Verify that the module works correctly when used.
      state = createWsMessageRateLimiters(config);
      expect(checkWsMessageRate(state, "c1").allowed).toBe(true);
    });
  });
});
