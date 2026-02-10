import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PI_COMPACTION_RESERVE_RATIO,
  DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR,
  ensurePiCompactionReserveTokens,
  resolveCompactionReserveTokensFloor,
  resolveProactiveCompactionRatio,
} from "./pi-settings.js";

describe("ensurePiCompactionReserveTokens", () => {
  it("bumps reserveTokens when below floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 16_384,
      applyOverrides: vi.fn(),
    };

    const result = ensurePiCompactionReserveTokens({ settingsManager });

    expect(result).toEqual({
      didOverride: true,
      reserveTokens: DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR,
    });
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { reserveTokens: DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR },
    });
  });

  it("does not override when already above floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 50_000,
      applyOverrides: vi.fn(),
    };

    const result = ensurePiCompactionReserveTokens({ settingsManager });

    expect(result).toEqual({ didOverride: false, reserveTokens: 50_000 });
    expect(settingsManager.applyOverrides).not.toHaveBeenCalled();
  });

  it("uses adaptive reserve when context window is provided", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 16_384,
      applyOverrides: vi.fn(),
    };

    // With 200K context and 0.2 ratio → adaptive reserve = 40_000
    const result = ensurePiCompactionReserveTokens({
      settingsManager,
      contextWindowTokens: 200_000,
      proactiveCompactionRatio: 0.2,
    });

    expect(result).toEqual({ didOverride: true, reserveTokens: 40_000 });
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { reserveTokens: 40_000 },
    });
  });

  it("uses floor when it exceeds adaptive reserve", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 10_000,
      applyOverrides: vi.fn(),
    };

    // With 100K context and 0.2 ratio → adaptive = 20_000, but floor is 40_000
    const result = ensurePiCompactionReserveTokens({
      settingsManager,
      minReserveTokens: 40_000,
      contextWindowTokens: 100_000,
      proactiveCompactionRatio: 0.2,
    });

    expect(result).toEqual({ didOverride: true, reserveTokens: 40_000 });
  });

  it("respects custom proactiveCompactionRatio", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 10_000,
      applyOverrides: vi.fn(),
    };

    // With 200K context and 0.4 ratio → adaptive reserve = 80_000
    const result = ensurePiCompactionReserveTokens({
      settingsManager,
      contextWindowTokens: 200_000,
      proactiveCompactionRatio: 0.4,
    });

    expect(result).toEqual({ didOverride: true, reserveTokens: 80_000 });
  });
});

describe("resolveCompactionReserveTokensFloor", () => {
  it("returns the default when config is missing", () => {
    expect(resolveCompactionReserveTokensFloor()).toBe(DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR);
  });

  it("accepts configured floors, including zero", () => {
    expect(
      resolveCompactionReserveTokensFloor({
        agents: { defaults: { compaction: { reserveTokensFloor: 24_000 } } },
      }),
    ).toBe(24_000);
    expect(
      resolveCompactionReserveTokensFloor({
        agents: { defaults: { compaction: { reserveTokensFloor: 0 } } },
      }),
    ).toBe(0);
  });
});

describe("resolveProactiveCompactionRatio", () => {
  it("returns the default when config is missing", () => {
    expect(resolveProactiveCompactionRatio()).toBe(DEFAULT_PI_COMPACTION_RESERVE_RATIO);
  });

  it("accepts configured ratios within range", () => {
    expect(
      resolveProactiveCompactionRatio({
        agents: { defaults: { compaction: { proactiveCompactionRatio: 0.3 } } },
      }),
    ).toBe(0.3);
  });

  it("rejects out-of-range ratios and falls back to default", () => {
    expect(
      resolveProactiveCompactionRatio({
        agents: { defaults: { compaction: { proactiveCompactionRatio: 0.05 } } },
      }),
    ).toBe(DEFAULT_PI_COMPACTION_RESERVE_RATIO);
    expect(
      resolveProactiveCompactionRatio({
        agents: { defaults: { compaction: { proactiveCompactionRatio: 0.8 } } },
      }),
    ).toBe(DEFAULT_PI_COMPACTION_RESERVE_RATIO);
  });
});
