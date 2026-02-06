/**
 * Tests for Clawdbot Integration Adapter
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ClawdbotModelRouterAdapter,
  getClawdbotModelRouter,
  resetClawdbotModelRouter,
  buildRoutingContextFromMsgContext,
} from "./clawdbot-adapter.js";

describe("ClawdbotModelRouterAdapter", () => {
  let adapter: ClawdbotModelRouterAdapter;

  beforeEach(() => {
    resetClawdbotModelRouter();
    adapter = new ClawdbotModelRouterAdapter({ enabled: true }); // Enable for most tests
  });

  describe("routeRequest", () => {
    it("routes heartbeat to Haiku", () => {
      const result = adapter.routeRequest({
        message: "heartbeat check",
        isHeartbeat: true,
      });

      expect(result.model).toBe("claude-haiku-4");
      expect(result.rule).toBe("task:heartbeat");
      expect(result.routingApplied).toBe(true);
    });

    it("routes status commands to Haiku", () => {
      const result = adapter.routeRequest({
        message: "/status",
      });

      expect(result.model).toBe("claude-haiku-4");
      expect(result.rule).toBe("task:status");
    });

    it("routes @opus override to Opus", () => {
      const result = adapter.routeRequest({
        message: "@opus Analyze this codebase",
      });

      expect(result.model).toBe("claude-opus-4-5");
      expect(result.rule).toBe("override:claude-opus-4-5");
      expect(result.cleanedMessage).toBe("Analyze this codebase");
      expect(result.wasExplicitOverride).toBe(true);
    });

    it("routes coding-agent to Opus", () => {
      const result = adapter.routeRequest({
        message: "refactor this function",
        agentId: "coding-agent",
      });

      expect(result.model).toBe("claude-opus-4-5");
      expect(result.rule).toBe("task:coding");
    });

    it("routes subagent sessions to Opus", () => {
      const result = adapter.routeRequest({
        message: "do something",
        sessionKey: "agent:coding-agent:subagent:abc123",
      });

      expect(result.model).toBe("claude-opus-4-5");
      expect(result.rule).toBe("task:subagent");
    });

    it("routes cron sessions to Haiku", () => {
      const result = adapter.routeRequest({
        message: "scheduled task",
        sessionKey: "cron:task1", // Cron prefix detected by adapter
      });

      expect(result.model).toBe("claude-haiku-4");
      expect(result.rule).toBe("task:cron");
    });

    it("defaults to Haiku for simple messages", () => {
      const result = adapter.routeRequest({
        message: "What is 2 + 2?",
      });

      expect(result.model).toBe("claude-haiku-4");
      expect(result.rule).toBe("default");
    });

    it("passes through when disabled with configured model", () => {
      adapter.setEnabled(false);

      const result = adapter.routeRequest({
        message: "test message",
        configuredModel: { provider: "anthropic", model: "claude-opus-4-5" },
        configuredProvider: "anthropic",
      });

      expect(result.model).toBe("claude-opus-4-5");
      expect(result.provider).toBe("anthropic");
      expect(result.rule).toBe("disabled");
      expect(result.routingApplied).toBe(false);
    });

    it("passes through with empty model when disabled and no configured model", () => {
      adapter.setEnabled(false);

      const result = adapter.routeRequest({
        message: "test message",
        // No configuredModel or configuredProvider
      });

      expect(result.model).toBe("");
      expect(result.provider).toBe("");
      expect(result.rule).toBe("disabled");
      expect(result.routingApplied).toBe(false);
    });
  });

  describe("detectSessionType", () => {
    it("detects subagent from session key", () => {
      const result = adapter.routeRequest({
        message: "test",
        sessionKey: "agent:coding-agent:subagent:12345",
      });

      expect(result.rule).toBe("task:subagent");
      expect(result.model).toBe("claude-opus-4-5");
    });

    it("routes cron session type to Haiku", () => {
      const result = adapter.routeRequest({
        message: "test",
        sessionKey: "cron:daily-check",
      });

      expect(result.model).toBe("claude-haiku-4");
      expect(result.rule).toBe("task:cron");
    });

    it("detects main session", () => {
      const result = adapter.routeRequest({
        message: "test",
        sessionKey: "agent:hal:main",
      });

      // Main sessions default to Haiku
      expect(result.model).toBe("claude-haiku-4");
    });
  });

  describe("metrics", () => {
    it("tracks requests by model", () => {
      adapter.routeRequest({ message: "test1" });
      adapter.routeRequest({ message: "test2" });
      adapter.routeRequest({ message: "@opus test3" });

      const metrics = adapter.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.requestsByModel.get("anthropic/claude-haiku-4")).toBe(2);
      expect(metrics.requestsByModel.get("anthropic/claude-opus-4-5")).toBe(1);
    });

    it("provides formatted summary", () => {
      adapter.routeRequest({ message: "test1" });
      adapter.routeRequest({ message: "@opus test2" });

      const summary = adapter.getMetricsSummary();
      expect(summary).toContain("claude-haiku-4");
      expect(summary).toContain("claude-opus-4-5");
      expect(summary).toContain("saved");
    });
  });
});

describe("getClawdbotModelRouter", () => {
  beforeEach(() => {
    resetClawdbotModelRouter();
  });

  it("returns singleton instance", () => {
    const router1 = getClawdbotModelRouter();
    const router2 = getClawdbotModelRouter();
    expect(router1).toBe(router2);
  });

  it("is disabled by default", () => {
    const router = getClawdbotModelRouter();
    expect(router.isEnabled()).toBe(false);
  });

  it("applies initial config to enable", () => {
    const router = getClawdbotModelRouter({
      enabled: true,
    });
    expect(router.isEnabled()).toBe(true);
  });
});

describe("buildRoutingContextFromMsgContext", () => {
  it("builds context from MsgContext-like object", () => {
    const ctx = buildRoutingContextFromMsgContext({
      Body: "@opus Analyze this",
      SessionKey: "agent:coding-agent:main",
      agentId: "coding-agent",
      isHeartbeat: false,
      ttsEnabled: false,
      channel: "telegram",
      configuredModel: { provider: "anthropic", model: "claude-opus-4-5" },
      configuredProvider: "anthropic",
    });

    expect(ctx.message).toBe("@opus Analyze this");
    expect(ctx.sessionKey).toBe("agent:coding-agent:main");
    expect(ctx.agentId).toBe("coding-agent");
    expect(ctx.isHeartbeat).toBe(false);
    expect(ctx.channel).toBe("telegram");
  });
});
