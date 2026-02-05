import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

// Mock heavy dependencies before importing the module under test
vi.mock("./model-catalog.js", () => ({
  loadModelCatalog: vi.fn().mockResolvedValue([]),
}));
vi.mock("./auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn().mockReturnValue({}),
}));
vi.mock("./model-auth.js", () => ({
  isProviderConfigured: vi.fn().mockReturnValue(true),
}));
vi.mock("./agent-scope.js", () => ({
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent-dir"),
}));

import { scoreMicroModelId, resolveMicroModelRef, resolveUtilityModelRef } from "./micro-model.js";
import { isProviderConfigured } from "./model-auth.js";
import { loadModelCatalog } from "./model-catalog.js";

const mockedLoadCatalog = vi.mocked(loadModelCatalog);
const mockedIsProviderConfigured = vi.mocked(isProviderConfigured);

function makeCfg(overrides?: Partial<OpenClawConfig>): OpenClawConfig {
  return { ...overrides } as OpenClawConfig;
}

describe("micro-model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadCatalog.mockResolvedValue([]);
    mockedIsProviderConfigured.mockReturnValue(true);
  });

  // ── scoreMicroModelId ──────────────────────────────────────────

  describe("scoreMicroModelId", () => {
    it("scores nano models highest", () => {
      expect(scoreMicroModelId("gpt-4.1-nano")).toBeGreaterThan(scoreMicroModelId("gpt-4.1-mini"));
    });

    it("scores mini > haiku > small", () => {
      const mini = scoreMicroModelId("gpt-4o-mini");
      const haiku = scoreMicroModelId("claude-haiku-4-5");
      const small = scoreMicroModelId("phi-small");
      expect(mini).toBeGreaterThan(haiku);
      expect(haiku).toBeGreaterThan(small);
    });

    it("penalizes opus and sonnet", () => {
      expect(scoreMicroModelId("claude-opus-4-5")).toBeLessThan(0);
      expect(scoreMicroModelId("claude-sonnet-4-5")).toBeLessThan(0);
    });

    it("gives positive score to fast/lite/turbo", () => {
      expect(scoreMicroModelId("gemini-2.0-flash")).toBeGreaterThan(0);
      expect(scoreMicroModelId("some-turbo-model")).toBeGreaterThan(0);
      expect(scoreMicroModelId("model-lite")).toBeGreaterThan(0);
    });

    it("returns 0 for unmatched models", () => {
      expect(scoreMicroModelId("some-unknown-model")).toBe(0);
    });
  });

  // ── resolveMicroModelRef ───────────────────────────────────────

  describe("resolveMicroModelRef", () => {
    it("returns cheapest available model from catalog", async () => {
      mockedLoadCatalog.mockResolvedValue([
        { id: "claude-opus-4-5", name: "Opus", provider: "anthropic" },
        { id: "gpt-4.1-nano", name: "Nano", provider: "openai" },
        { id: "claude-haiku-4-5", name: "Haiku", provider: "anthropic" },
      ]);
      const result = await resolveMicroModelRef(makeCfg());
      expect(result).toEqual({ provider: "openai", model: "gpt-4.1-nano" });
    });

    it("returns null when catalog is empty", async () => {
      mockedLoadCatalog.mockResolvedValue([]);
      const result = await resolveMicroModelRef(makeCfg());
      expect(result).toBeNull();
    });

    it("returns null when no model has positive score", async () => {
      mockedLoadCatalog.mockResolvedValue([
        { id: "claude-opus-4-5", name: "Opus", provider: "anthropic" },
        { id: "claude-sonnet-4-5", name: "Sonnet", provider: "anthropic" },
      ]);
      const result = await resolveMicroModelRef(makeCfg());
      expect(result).toBeNull();
    });

    it("returns null when no provider has auth", async () => {
      mockedLoadCatalog.mockResolvedValue([
        { id: "gpt-4.1-nano", name: "Nano", provider: "openai" },
      ]);
      mockedIsProviderConfigured.mockReturnValue(false);
      const result = await resolveMicroModelRef(makeCfg());
      expect(result).toBeNull();
    });

    it("uses 'main' as default agent id when none provided", async () => {
      const { resolveAgentDir } = await import("./agent-scope.js");
      mockedLoadCatalog.mockResolvedValue([
        { id: "gpt-4.1-nano", name: "Nano", provider: "openai" },
      ]);
      await resolveMicroModelRef(makeCfg());
      expect(resolveAgentDir).toHaveBeenCalledWith(expect.anything(), "main");
    });
  });

  // ── resolveUtilityModelRef ─────────────────────────────────────

  describe("resolveUtilityModelRef", () => {
    it("returns per-feature model when set", async () => {
      const cfg = makeCfg({
        agents: {
          defaults: {
            utility: {
              slugGenerator: { model: "openai/gpt-4.1-nano" },
            },
          },
        },
      });
      const result = await resolveUtilityModelRef({ cfg, feature: "slugGenerator" });
      expect(result).toEqual({ provider: "openai", model: "gpt-4.1-nano" });
    });

    it("falls to global utilityModel when per-feature is unset", async () => {
      const cfg = makeCfg({
        agents: {
          defaults: {
            utilityModel: "anthropic/claude-haiku-4-5",
          },
        },
      });
      const result = await resolveUtilityModelRef({ cfg, feature: "slugGenerator" });
      expect(result).toEqual({ provider: "anthropic", model: "claude-haiku-4-5" });
    });

    it("falls to micro-auto when no config is set", async () => {
      mockedLoadCatalog.mockResolvedValue([
        { id: "gpt-4.1-nano", name: "Nano", provider: "openai" },
      ]);
      const result = await resolveUtilityModelRef({ cfg: makeCfg() });
      expect(result).toEqual({ provider: "openai", model: "gpt-4.1-nano" });
    });

    it("falls to primary model when micro-auto returns null", async () => {
      // Empty catalog → micro-auto returns null → falls to primary
      mockedLoadCatalog.mockResolvedValue([]);
      const result = await resolveUtilityModelRef({ cfg: makeCfg() });
      // Primary model defaults to anthropic/claude-opus-4-5
      expect(result).toEqual({ provider: "anthropic", model: "claude-opus-4-5" });
    });

    it("resolves alias strings via model catalog", async () => {
      const cfg = makeCfg({
        agents: {
          defaults: {
            models: {
              "openai/gpt-4.1-nano": { alias: "micro" },
            },
            utilityModel: "micro",
          },
        },
      });
      const result = await resolveUtilityModelRef({ cfg });
      expect(result).toEqual({ provider: "openai", model: "gpt-4.1-nano" });
    });

    it("per-feature config takes precedence over global utilityModel", async () => {
      const cfg = makeCfg({
        agents: {
          defaults: {
            utilityModel: "anthropic/claude-haiku-4-5",
            utility: {
              sessionDescription: { model: "openai/gpt-4.1-mini" },
            },
          },
        },
      });
      const result = await resolveUtilityModelRef({ cfg, feature: "sessionDescription" });
      expect(result).toEqual({ provider: "openai", model: "gpt-4.1-mini" });
    });

    it("handles provider/model format in per-feature config", async () => {
      const cfg = makeCfg({
        agents: {
          defaults: {
            utility: {
              slugGenerator: { model: "google/gemini-2.0-flash" },
            },
          },
        },
      });
      const result = await resolveUtilityModelRef({ cfg, feature: "slugGenerator" });
      expect(result).toEqual({ provider: "google", model: "gemini-2.0-flash" });
    });
  });
});
