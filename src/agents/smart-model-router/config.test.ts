/**
 * Smart Model Router - Config Tests
 */

import { describe, it, expect } from "vitest";
import type { RoutingConfig } from "./types.js";
import {
  DEFAULT_ROUTING_CONFIG,
  MODELS,
  DEFAULT_PROVIDER,
  mergeConfig,
  validateConfig,
  DEFAULT_OVERRIDES,
} from "./config.js";

describe("config", () => {
  describe("DEFAULT_ROUTING_CONFIG", () => {
    it("has enabled set to false (opt-in routing)", () => {
      expect(DEFAULT_ROUTING_CONFIG.enabled).toBe(false);
    });

    it("uses Haiku as default model", () => {
      expect(DEFAULT_ROUTING_CONFIG.defaultModel).toBe(MODELS.HAIKU);
    });

    it("uses Anthropic as default provider", () => {
      expect(DEFAULT_ROUTING_CONFIG.defaultProvider).toBe(DEFAULT_PROVIDER);
    });

    it("has task-based routing for heartbeat/status/voice/cron", () => {
      expect(DEFAULT_ROUTING_CONFIG.tasks.heartbeat).toBe(MODELS.HAIKU);
      expect(DEFAULT_ROUTING_CONFIG.tasks.status).toBe(MODELS.HAIKU);
      expect(DEFAULT_ROUTING_CONFIG.tasks.voice).toBe(MODELS.HAIKU);
      expect(DEFAULT_ROUTING_CONFIG.tasks.cron).toBe(MODELS.HAIKU);
    });

    it("routes coding to Opus", () => {
      expect(DEFAULT_ROUTING_CONFIG.tasks.coding).toBe(MODELS.OPUS);
    });

    it("has correct thresholds", () => {
      expect(DEFAULT_ROUTING_CONFIG.thresholds.promptTokens.heavy).toBe(2000);
      expect(DEFAULT_ROUTING_CONFIG.thresholds.contextTokens.heavy).toBe(100000);
      expect(DEFAULT_ROUTING_CONFIG.thresholds.heavyModel).toBe(MODELS.OPUS);
    });

    it("has default overrides for @opus/@sonnet/@haiku", () => {
      const patterns = DEFAULT_ROUTING_CONFIG.overrides.map((o) => o.pattern);
      expect(patterns).toContain("@opus");
      expect(patterns).toContain("@sonnet");
      expect(patterns).toContain("@haiku");
    });
  });

  describe("MODELS", () => {
    it("defines correct model IDs", () => {
      expect(MODELS.HAIKU).toBe("claude-haiku-4");
      expect(MODELS.SONNET).toBe("claude-sonnet-4");
      expect(MODELS.OPUS).toBe("claude-opus-4-5");
    });
  });

  describe("DEFAULT_OVERRIDES", () => {
    it("has three default patterns", () => {
      expect(DEFAULT_OVERRIDES.length).toBe(3);
    });

    it("all patterns strip by default", () => {
      DEFAULT_OVERRIDES.forEach((override) => {
        expect(override.stripPattern).toBe(true);
      });
    });

    it("all patterns use default provider", () => {
      DEFAULT_OVERRIDES.forEach((override) => {
        expect(override.provider).toBe(DEFAULT_PROVIDER);
      });
    });
  });

  describe("mergeConfig", () => {
    it("returns defaults when no config provided", () => {
      const config = mergeConfig();
      expect(config).toEqual(DEFAULT_ROUTING_CONFIG);
    });

    it("returns defaults for undefined config", () => {
      const config = mergeConfig(undefined);
      expect(config).toEqual(DEFAULT_ROUTING_CONFIG);
    });

    it("merges top-level properties", () => {
      const config = mergeConfig({
        enabled: false,
        defaultModel: "custom-model",
      });

      expect(config.enabled).toBe(false);
      expect(config.defaultModel).toBe("custom-model");
      expect(config.defaultProvider).toBe(DEFAULT_PROVIDER); // Preserved
    });

    it("merges tasks", () => {
      const config = mergeConfig({
        tasks: {
          heartbeat: "custom-haiku",
        },
      });

      expect(config.tasks.heartbeat).toBe("custom-haiku");
      expect(config.tasks.status).toBe(MODELS.HAIKU); // Preserved
    });

    it("merges thresholds deeply", () => {
      const config = mergeConfig({
        thresholds: {
          promptTokens: { heavy: 1000 },
        },
      });

      expect(config.thresholds.promptTokens.heavy).toBe(1000);
      expect(config.thresholds.contextTokens.heavy).toBe(100000); // Preserved
      expect(config.thresholds.heavyModel).toBe(MODELS.OPUS); // Preserved
    });

    it("replaces overrides entirely", () => {
      const customOverrides = [{ pattern: "@gpt", model: "gpt-4", stripPattern: true }];

      const config = mergeConfig({
        overrides: customOverrides,
      });

      expect(config.overrides).toEqual(customOverrides);
    });

    it("replaces middleTier entirely", () => {
      const config = mergeConfig({
        middleTier: {
          enabled: true,
          model: "custom-sonnet",
        },
      });

      expect(config.middleTier?.enabled).toBe(true);
      expect(config.middleTier?.model).toBe("custom-sonnet");
    });

    it("replaces local entirely", () => {
      const config = mergeConfig({
        local: {
          enabled: true,
          provider: "custom",
          url: "http://custom:8080",
          triggers: ["@custom"],
        },
      });

      expect(config.local?.enabled).toBe(true);
      expect(config.local?.provider).toBe("custom");
    });
  });

  describe("validateConfig", () => {
    it("validates correct config", () => {
      const result = validateConfig(DEFAULT_ROUTING_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails for missing defaultModel", () => {
      const config = { ...DEFAULT_ROUTING_CONFIG, defaultModel: "" };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("defaultModel is required");
    });

    it("fails for missing defaultProvider", () => {
      const config = { ...DEFAULT_ROUTING_CONFIG, defaultProvider: "" };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("defaultProvider is required");
    });

    it("fails for invalid threshold type", () => {
      const config = {
        ...DEFAULT_ROUTING_CONFIG,
        thresholds: {
          ...DEFAULT_ROUTING_CONFIG.thresholds,
          promptTokens: { heavy: "not a number" as any },
        },
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("thresholds.promptTokens.heavy must be a number");
    });

    it("fails for non-array overrides", () => {
      const config = {
        ...DEFAULT_ROUTING_CONFIG,
        overrides: "not an array" as any,
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("overrides must be an array");
    });

    it("fails for override missing pattern", () => {
      const config = {
        ...DEFAULT_ROUTING_CONFIG,
        overrides: [{ pattern: "", model: "test", stripPattern: true }],
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("overrides[0].pattern is required");
    });

    it("fails for override missing model", () => {
      const config = {
        ...DEFAULT_ROUTING_CONFIG,
        overrides: [{ pattern: "@test", model: "", stripPattern: true }],
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("overrides[0].model is required");
    });

    it("collects multiple errors", () => {
      const config = {
        ...DEFAULT_ROUTING_CONFIG,
        defaultModel: "",
        defaultProvider: "",
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });
});
