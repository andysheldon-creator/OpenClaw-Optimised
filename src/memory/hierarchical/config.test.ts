import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { isHierarchicalMemoryEnabled, resolveHierarchicalMemoryConfig } from "./config.js";
import { DEFAULT_HIERARCHICAL_MEMORY_CONFIG } from "./types.js";

describe("resolveHierarchicalMemoryConfig", () => {
  it("returns defaults when config is undefined", () => {
    const result = resolveHierarchicalMemoryConfig(undefined);
    expect(result).toEqual(DEFAULT_HIERARCHICAL_MEMORY_CONFIG);
  });

  it("returns defaults when hierarchicalMemory is missing", () => {
    const result = resolveHierarchicalMemoryConfig({} as OpenClawConfig);
    expect(result).toEqual(DEFAULT_HIERARCHICAL_MEMORY_CONFIG);
  });

  it("resolves workerInterval string '10m' to 600000ms", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { enabled: true, workerInterval: "10m" } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.workerIntervalMs).toBe(600_000);
  });

  it("resolves workerInterval '30s' to 30000ms", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { workerInterval: "30s" } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.workerIntervalMs).toBe(30_000);
  });

  it("falls back to workerIntervalMs when workerInterval is invalid", () => {
    const cfg = {
      agents: {
        defaults: {
          hierarchicalMemory: { workerInterval: "garbage", workerIntervalMs: 120_000 },
        },
      },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.workerIntervalMs).toBe(120_000);
  });

  it("falls back to default when both workerInterval and workerIntervalMs are missing", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { enabled: true } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.workerIntervalMs).toBe(DEFAULT_HIERARCHICAL_MEMORY_CONFIG.workerIntervalMs);
  });

  it("preserves partial overrides, filling gaps with defaults", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { chunkTokens: 3000 } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.chunkTokens).toBe(3000);
    expect(result.mergeThreshold).toBe(DEFAULT_HIERARCHICAL_MEMORY_CONFIG.mergeThreshold);
    expect(result.summaryTargetTokens).toBe(DEFAULT_HIERARCHICAL_MEMORY_CONFIG.summaryTargetTokens);
  });

  it("passes through model when specified", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { model: "openai/gpt-4o" } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.model).toBe("openai/gpt-4o");
  });

  it("leaves model undefined when not specified", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { enabled: true } } },
    } as OpenClawConfig;
    const result = resolveHierarchicalMemoryConfig(cfg);
    expect(result.model).toBeUndefined();
  });
});

describe("isHierarchicalMemoryEnabled", () => {
  it("returns false when config is undefined", () => {
    expect(isHierarchicalMemoryEnabled(undefined)).toBe(false);
  });

  it("returns false when hierarchicalMemory is missing", () => {
    expect(isHierarchicalMemoryEnabled({} as OpenClawConfig)).toBe(false);
  });

  it("returns true when explicitly enabled", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { enabled: true } } },
    } as OpenClawConfig;
    expect(isHierarchicalMemoryEnabled(cfg)).toBe(true);
  });

  it("returns false when explicitly disabled", () => {
    const cfg = {
      agents: { defaults: { hierarchicalMemory: { enabled: false } } },
    } as OpenClawConfig;
    expect(isHierarchicalMemoryEnabled(cfg)).toBe(false);
  });
});
