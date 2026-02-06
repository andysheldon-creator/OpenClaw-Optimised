import { describe, expect, it } from "vitest";
import type { SessionResetPolicy } from "./reset.js";
import {
  DEFAULT_RESET_AT_HOUR,
  DEFAULT_RESET_MODE,
  evaluateSessionFreshness,
  resolveDailyResetAtMs,
  resolveSessionResetPolicy,
} from "./reset.js";
import { DEFAULT_IDLE_MINUTES } from "./types.js";

// ---------------------------------------------------------------------------
// resolveSessionResetPolicy
// ---------------------------------------------------------------------------
describe("resolveSessionResetPolicy", () => {
  it("returns daily mode + default atHour when no config is set", () => {
    const policy = resolveSessionResetPolicy({ resetType: "dm" });
    expect(policy.mode).toBe(DEFAULT_RESET_MODE);
    expect(policy.atHour).toBe(DEFAULT_RESET_AT_HOUR);
    expect(policy.idleMinutes).toBeUndefined();
    expect(policy.contextUsageThreshold).toBeUndefined();
    expect(policy.maxCompactions).toBeUndefined();
  });

  it("passes through contextUsageThreshold and maxCompactions from global reset config", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        reset: {
          mode: "daily",
          contextUsageThreshold: 0.85,
          maxCompactions: 5,
        },
      },
      resetType: "dm",
    });
    expect(policy.contextUsageThreshold).toBe(0.85);
    expect(policy.maxCompactions).toBe(5);
  });

  it("channel override replaces global (existing behavior)", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        reset: {
          mode: "daily",
          contextUsageThreshold: 0.85,
          maxCompactions: 5,
        },
      },
      resetType: "dm",
      resetOverride: {
        mode: "idle",
        idleMinutes: 120,
      },
    });
    expect(policy.mode).toBe("idle");
    expect(policy.idleMinutes).toBe(120);
    // Override doesn't set these, and without inherit they are NOT inherited from global
    expect(policy.contextUsageThreshold).toBeUndefined();
    expect(policy.maxCompactions).toBeUndefined();
  });

  it("inherit: true merges override with global -- both criteria appear in resolved policy", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        reset: {
          mode: "daily",
          atHour: 4,
          contextUsageThreshold: 0.85,
          maxCompactions: 5,
        },
      },
      resetType: "dm",
      resetOverride: {
        mode: "idle",
        idleMinutes: 240,
        maxCompactions: 3,
        inherit: true,
      },
    });
    // Override's explicit values win
    expect(policy.mode).toBe("idle");
    expect(policy.idleMinutes).toBe(240);
    expect(policy.maxCompactions).toBe(3);
    // Global's contextUsageThreshold falls through
    expect(policy.contextUsageThreshold).toBe(0.85);
  });

  it("inherit: true with conflicting fields -- override wins", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {
        reset: {
          mode: "daily",
          atHour: 6,
          contextUsageThreshold: 0.9,
          maxCompactions: 10,
        },
      },
      resetType: "dm",
      resetOverride: {
        mode: "idle",
        idleMinutes: 60,
        contextUsageThreshold: 0.7,
        maxCompactions: 2,
        inherit: true,
      },
    });
    expect(policy.mode).toBe("idle");
    expect(policy.idleMinutes).toBe(60);
    expect(policy.contextUsageThreshold).toBe(0.7);
    expect(policy.maxCompactions).toBe(2);
  });

  it("inherit: true with no global reset -- acts as plain override", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: {},
      resetType: "dm",
      resetOverride: {
        mode: "idle",
        idleMinutes: 120,
        inherit: true,
      },
    });
    expect(policy.mode).toBe("idle");
    expect(policy.idleMinutes).toBe(120);
  });

  it("passes idle default when mode is idle but no idleMinutes given", () => {
    const policy = resolveSessionResetPolicy({
      sessionCfg: { reset: { mode: "idle" } },
      resetType: "dm",
    });
    expect(policy.mode).toBe("idle");
    expect(policy.idleMinutes).toBe(DEFAULT_IDLE_MINUTES);
  });
});

// ---------------------------------------------------------------------------
// evaluateSessionFreshness
// ---------------------------------------------------------------------------
describe("evaluateSessionFreshness", () => {
  const basePolicy: SessionResetPolicy = {
    mode: "daily",
    atHour: DEFAULT_RESET_AT_HOUR,
  };

  // -- existing daily/idle behavior (regression coverage) --

  it("marks fresh when updatedAt is after daily reset boundary", () => {
    const now = Date.now();
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy: basePolicy,
    });
    expect(result.fresh).toBe(true);
    expect(result.staleReason).toBeUndefined();
  });

  it("marks stale (daily) when updatedAt is before daily reset boundary", () => {
    const now = Date.now();
    const dailyResetAt = resolveDailyResetAtMs(now, DEFAULT_RESET_AT_HOUR);
    const result = evaluateSessionFreshness({
      updatedAt: dailyResetAt - 60_000,
      now,
      policy: basePolicy,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("daily");
  });

  it("marks stale (idle) when idle window expired", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = { mode: "idle", atHour: 4, idleMinutes: 30 };
    const result = evaluateSessionFreshness({
      updatedAt: now - 31 * 60_000,
      now,
      policy,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("idle");
  });

  it("marks fresh when idle window has not expired", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = { mode: "idle", atHour: 4, idleMinutes: 30 };
    const result = evaluateSessionFreshness({
      updatedAt: now - 10 * 60_000,
      now,
      policy,
    });
    expect(result.fresh).toBe(true);
  });

  // -- context usage --

  it("marks stale (context-usage) when totalTokens/contextTokens >= threshold", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      totalTokens: 170_000,
      contextTokens: 200_000,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("context-usage");
    expect(result.contextUsage).toBe(0.85);
  });

  it("marks fresh when context usage is below threshold", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      totalTokens: 50_000,
      contextTokens: 200_000,
    });
    expect(result.fresh).toBe(true);
    expect(result.contextUsage).toBe(0.25);
  });

  it("skips context-usage check when token data is missing", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
    });
    expect(result.fresh).toBe(true);
    expect(result.contextUsage).toBeUndefined();
  });

  it("skips context-usage check when contextTokens is 0", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      totalTokens: 100_000,
      contextTokens: 0,
    });
    expect(result.fresh).toBe(true);
    expect(result.contextUsage).toBeUndefined();
  });

  // -- compaction count --

  it("marks stale (compactions) when compactionCount >= maxCompactions", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      maxCompactions: 5,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      compactionCount: 5,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("compactions");
    expect(result.compactionCount).toBe(5);
  });

  it("marks fresh when compactionCount is below maxCompactions", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      maxCompactions: 5,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      compactionCount: 3,
    });
    expect(result.fresh).toBe(true);
  });

  it("skips compaction check when compactionCount is undefined", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      maxCompactions: 5,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
    });
    expect(result.fresh).toBe(true);
  });

  it("maxCompactions = 0 triggers stale on any compaction count >= 0", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      maxCompactions: 0,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      compactionCount: 0,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("compactions");
  });

  // -- staleReason populated correctly --

  it("reports staleReason correctly for each criterion", () => {
    const now = Date.now();
    // idle stale
    const idleResult = evaluateSessionFreshness({
      updatedAt: now - 120 * 60_000,
      now,
      policy: { mode: "idle", atHour: 4, idleMinutes: 60 },
    });
    expect(idleResult.staleReason).toBe("idle");
  });

  // -- OR logic --

  it("OR logic: one criterion stale + others fresh = stale", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
      maxCompactions: 10,
    };
    // Only context usage triggers stale
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      totalTokens: 180_000,
      contextTokens: 200_000,
      compactionCount: 1,
    });
    expect(result.fresh).toBe(false);
    expect(result.staleReason).toBe("context-usage");
  });

  it("all criteria fresh = fresh", () => {
    const now = Date.now();
    const policy: SessionResetPolicy = {
      mode: "idle",
      atHour: 4,
      idleMinutes: 240,
      contextUsageThreshold: 0.85,
      maxCompactions: 10,
    };
    const result = evaluateSessionFreshness({
      updatedAt: now - 1_000,
      now,
      policy,
      totalTokens: 50_000,
      contextTokens: 200_000,
      compactionCount: 2,
    });
    expect(result.fresh).toBe(true);
    expect(result.staleReason).toBeUndefined();
  });
});
