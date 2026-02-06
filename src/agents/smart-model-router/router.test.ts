/**
 * Smart Model Router - Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { RoutingContext, RoutingConfig } from "./types.js";
import { MODELS, DEFAULT_PROVIDER } from "./config.js";
import { ModelRouter, createModelRouter, getGlobalRouter, resetGlobalRouter } from "./router.js";

describe("ModelRouter", () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter({ enabled: true }); // Enable for most tests
    resetGlobalRouter();
  });

  describe("constructor", () => {
    it("creates router with default config (disabled by default)", () => {
      const defaultRouter = new ModelRouter();
      expect(defaultRouter.isEnabled()).toBe(false);
      expect(defaultRouter.getConfig().defaultModel).toBe(MODELS.HAIKU);
    });

    it("accepts custom config", () => {
      const customRouter = new ModelRouter({
        enabled: false,
        defaultModel: MODELS.OPUS,
      });
      expect(customRouter.isEnabled()).toBe(false);
    });
  });

  describe("selectModel - disabled routing", () => {
    it("returns default model when disabled", () => {
      router.setEnabled(false);
      const result = router.selectModel({ message: "hello" });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("disabled");
    });
  });

  describe("selectModel - task-based routing", () => {
    it("routes heartbeat to Haiku", () => {
      const result = router.selectModel({
        message: "heartbeat check",
        isHeartbeat: true,
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:heartbeat");
    });

    it("routes /status command to Haiku", () => {
      const result = router.selectModel({
        message: "/status",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:status");
    });

    it("routes /sessions command to Haiku", () => {
      const result = router.selectModel({
        message: "/sessions list",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:status");
    });

    it("routes voice context to Haiku", () => {
      const result = router.selectModel({
        message: "tell me a story",
        ttsEnabled: true,
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:voice");
    });

    it("routes cron session to Haiku", () => {
      const result = router.selectModel({
        message: "scheduled task",
        sessionType: "cron",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:cron");
    });

    it("routes explicit taskType", () => {
      const result = router.selectModel({
        message: "any message",
        taskType: "heartbeat",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:heartbeat");
    });
  });

  describe("selectModel - explicit overrides", () => {
    it("detects @opus and selects Opus", () => {
      const result = router.selectModel({
        message: "@opus analyze this code",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("override:claude-opus-4-5");
      expect(result.wasExplicitOverride).toBe(true);
      expect(result.cleanedMessage).toBe("analyze this code");
    });

    it("detects @sonnet and selects Sonnet", () => {
      const result = router.selectModel({
        message: "@sonnet help me with this",
      });

      expect(result.model.model).toBe(MODELS.SONNET);
      expect(result.rule).toBe("override:claude-sonnet-4");
      expect(result.wasExplicitOverride).toBe(true);
    });

    it("detects @haiku and selects Haiku", () => {
      const result = router.selectModel({
        message: "@haiku quick question",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("override:claude-haiku-4");
      expect(result.wasExplicitOverride).toBe(true);
    });

    it("is case-insensitive", () => {
      const result = router.selectModel({
        message: "@OPUS this is important",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });

    it("strips tag from message", () => {
      const result = router.selectModel({
        message: "Please @opus help me debug",
      });

      expect(result.cleanedMessage).toBe("Please help me debug");
    });

    it("first override wins with multiple tags", () => {
      const result = router.selectModel({
        message: "@opus @haiku which one?",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });

    it("overrides take precedence over task type", () => {
      const result = router.selectModel({
        message: "@opus check status",
        isHeartbeat: true,
      });

      // Task routing happens first, so heartbeat wins
      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("task:heartbeat");
    });
  });

  describe("selectModel - coding agent routing", () => {
    it("routes coding-agent to Opus", () => {
      const result = router.selectModel({
        message: "refactor this function",
        agentId: "coding-agent",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("task:coding");
    });

    it('matches agent IDs containing "coding"', () => {
      const result = router.selectModel({
        message: "help",
        agentId: "my-coding-helper",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });

    it('matches agent IDs containing "code"', () => {
      const result = router.selectModel({
        message: "help",
        agentId: "code-assistant",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });

    it("is case-insensitive for agent ID", () => {
      const result = router.selectModel({
        message: "help",
        agentId: "CODING-AGENT",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });
  });

  describe("selectModel - subagent routing", () => {
    it("routes subagent session type to Opus", () => {
      const result = router.selectModel({
        message: "complex task",
        sessionType: "subagent",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("task:subagent");
    });

    it("detects subagent from session key", () => {
      const result = router.selectModel({
        message: "task",
        sessionKey: "agent:main:subagent:abc123",
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("subagent");
    });
  });

  describe("selectModel - length-based routing", () => {
    it("routes long prompts (>2000 tokens) to Opus", () => {
      const result = router.selectModel({
        message: "analyze this",
        promptTokens: 2500,
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("length:prompt>2000");
    });

    it("routes large context (>100k tokens) to Opus", () => {
      const result = router.selectModel({
        message: "summarize",
        contextTokens: 150000,
      });

      expect(result.model.model).toBe(MODELS.OPUS);
      expect(result.rule).toBe("length:context>100000");
    });

    it("does not trigger for small prompts", () => {
      const result = router.selectModel({
        message: "hello",
        promptTokens: 100,
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("default");
    });

    it("prompt threshold takes precedence over context", () => {
      const result = router.selectModel({
        message: "test",
        promptTokens: 2500,
        contextTokens: 50000, // Below threshold
      });

      expect(result.rule).toBe("length:prompt>2000");
    });
  });

  describe("selectModel - default routing", () => {
    it("uses Haiku for general requests", () => {
      const result = router.selectModel({
        message: "hello world",
      });

      expect(result.model.model).toBe(MODELS.HAIKU);
      expect(result.rule).toBe("default");
      expect(result.wasExplicitOverride).toBe(false);
    });

    it("preserves original message", () => {
      const result = router.selectModel({
        message: "hello world",
      });

      expect(result.cleanedMessage).toBe("hello world");
    });
  });

  describe("metrics", () => {
    it("tracks requests by model", () => {
      router.selectModel({ message: "test1" });
      router.selectModel({ message: "@opus test2" });
      router.selectModel({ message: "test3", isHeartbeat: true });

      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.requestsByModel.get("anthropic/claude-haiku-4")).toBe(2);
      expect(metrics.requestsByModel.get("anthropic/claude-opus-4-5")).toBe(1);
    });

    it("tracks requests by rule", () => {
      router.selectModel({ message: "test1" });
      router.selectModel({ message: "test2", isHeartbeat: true });
      router.selectModel({ message: "test3", isHeartbeat: true });

      const metrics = router.getMetrics();
      expect(metrics.requestsByRule.get("default")).toBe(1);
      expect(metrics.requestsByRule.get("task:heartbeat")).toBe(2);
    });

    it("estimates cost savings", () => {
      // Route to Haiku (cheap)
      router.selectModel({ message: "test", promptTokens: 1000 });

      const metrics = router.getMetrics();
      expect(metrics.estimatedSavings).toBeGreaterThan(0);
    });

    it("resets metrics", () => {
      router.selectModel({ message: "test" });
      router.resetMetrics();

      const metrics = router.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });

    it("formats metrics summary", () => {
      router.selectModel({ message: "test1", promptTokens: 100 });
      router.selectModel({ message: "@opus test2" });

      const summary = router.getMetricsSummary();
      expect(summary).toContain("haiku");
      expect(summary).toContain("saved");
    });
  });

  describe("configuration", () => {
    it("allows custom thresholds", () => {
      const customRouter = new ModelRouter({
        enabled: true,
        thresholds: {
          promptTokens: { heavy: 500 },
          contextTokens: { heavy: 50000 },
          heavyModel: MODELS.OPUS,
        },
      });

      const result = customRouter.selectModel({
        message: "test",
        promptTokens: 600,
      });

      expect(result.model.model).toBe(MODELS.OPUS);
    });

    it("allows custom task models", () => {
      const customRouter = new ModelRouter({
        enabled: true,
        tasks: {
          heartbeat: MODELS.SONNET,
        },
      });

      const result = customRouter.selectModel({
        message: "test",
        isHeartbeat: true,
      });

      expect(result.model.model).toBe(MODELS.SONNET);
    });

    it("allows custom override patterns", () => {
      const customRouter = new ModelRouter({
        enabled: true,
        overrides: [
          {
            pattern: "@gpt4",
            model: "gpt-4",
            provider: "openai",
            stripPattern: true,
          },
        ],
      });

      const result = customRouter.selectModel({
        message: "@gpt4 hello",
      });

      expect(result.model.provider).toBe("openai");
      expect(result.model.model).toBe("gpt-4");
    });
  });

  describe("global router", () => {
    it("returns same instance", () => {
      const r1 = getGlobalRouter();
      const r2 = getGlobalRouter();
      expect(r1).toBe(r2);
    });

    it("can be reset", () => {
      const r1 = getGlobalRouter();
      resetGlobalRouter();
      const r2 = getGlobalRouter();
      expect(r1).not.toBe(r2);
    });
  });

  describe("createModelRouter", () => {
    it("creates new router instance", () => {
      const r1 = createModelRouter();
      const r2 = createModelRouter();
      expect(r1).not.toBe(r2);
    });
  });

  describe("edge cases", () => {
    it("handles empty message", () => {
      const result = router.selectModel({ message: "" });
      expect(result.model.model).toBe(MODELS.HAIKU);
    });

    it("handles undefined context values", () => {
      const result = router.selectModel({
        message: "test",
        promptTokens: undefined,
        contextTokens: undefined,
        agentId: undefined,
      });
      expect(result.model.model).toBe(MODELS.HAIKU);
    });

    it("handles message with only whitespace", () => {
      const result = router.selectModel({ message: "   " });
      expect(result.model.model).toBe(MODELS.HAIKU);
    });

    it("handles special characters in message", () => {
      const result = router.selectModel({
        message: "@opus foo$bar^baz",
      });
      expect(result.wasExplicitOverride).toBe(true);
      expect(result.cleanedMessage).toContain("foo$bar^baz");
    });
  });
});
