import { describe, expect, it } from "vitest";
import type { ScoringContext, ScoringConfig } from "./types.js";
import {
  calculateFactors,
  scoreNovelty,
  scoreImpact,
  scoreRelational,
  scoreTemporal,
  scoreUserIntent,
} from "./factors.js";
import {
  evaluateMemoryRelevance,
  shouldCapture,
  shouldPersistToGraph,
  shouldUseLlmEval,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SCORING_WEIGHTS,
  normalizeWeights,
  resolveScoringConfig,
  THRESHOLD_PROFILES,
} from "./index.js";

// ────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    tool: { name: "exec", callId: "test-1", isError: false },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Config Tests
// ────────────────────────────────────────────────────────────────────────────

describe("scoring/config", () => {
  it("resolveScoringConfig returns defaults when no input", () => {
    const config = resolveScoringConfig();
    expect(config.weights).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(config.thresholds).toEqual(DEFAULT_SCORING_CONFIG.thresholds);
  });

  it("resolveScoringConfig merges partial weights", () => {
    const config = resolveScoringConfig({ weights: { ...DEFAULT_SCORING_WEIGHTS, novelty: 0.5 } });
    expect(config.weights.novelty).toBe(0.5);
    expect(config.weights.impact).toBe(DEFAULT_SCORING_WEIGHTS.impact);
  });

  it("normalizeWeights makes weights sum to 1.0", () => {
    const weights = normalizeWeights({
      novelty: 2,
      impact: 2,
      relational: 2,
      temporal: 2,
      userIntent: 2,
    });
    const sum =
      weights.novelty + weights.impact + weights.relational + weights.temporal + weights.userIntent;
    expect(sum).toBeCloseTo(1.0);
  });

  it("normalizeWeights handles all-zero weights", () => {
    const weights = normalizeWeights({
      novelty: 0,
      impact: 0,
      relational: 0,
      temporal: 0,
      userIntent: 0,
    });
    expect(weights.novelty).toBe(0.2);
    expect(weights.impact).toBe(0.2);
  });

  it("THRESHOLD_PROFILES provides named profiles", () => {
    expect(THRESHOLD_PROFILES.balanced.captureThreshold).toBeLessThan(
      THRESHOLD_PROFILES.conservative.captureThreshold,
    );
    expect(THRESHOLD_PROFILES.aggressive.captureThreshold).toBeLessThan(
      THRESHOLD_PROFILES.balanced.captureThreshold,
    );
    expect(THRESHOLD_PROFILES.minimal.captureThreshold).toBeGreaterThan(
      THRESHOLD_PROFILES.conservative.captureThreshold,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Factor Scorer Tests
// ────────────────────────────────────────────────────────────────────────────

describe("scoring/factors", () => {
  describe("scoreNovelty", () => {
    it("errors score higher for novelty", () => {
      const errorCtx = makeCtx({ tool: { name: "exec", callId: "1", isError: true } });
      const normalCtx = makeCtx({ tool: { name: "exec", callId: "1", isError: false } });
      expect(scoreNovelty(errorCtx)).toBeGreaterThan(scoreNovelty(normalCtx));
    });

    it("read-only tools have low novelty", () => {
      const readCtx = makeCtx({ tool: { name: "read", callId: "1", isError: false } });
      expect(scoreNovelty(readCtx)).toBeLessThanOrEqual(0.25);
    });

    it("side-effect tools have higher novelty", () => {
      const writeCtx = makeCtx({ tool: { name: "write", callId: "1", isError: false } });
      const readCtx = makeCtx({ tool: { name: "memory_search", callId: "1", isError: false } });
      expect(scoreNovelty(writeCtx)).toBeGreaterThan(scoreNovelty(readCtx));
    });
  });

  describe("scoreImpact", () => {
    it("file writes have high impact", () => {
      const writeCtx = makeCtx({ tool: { name: "write", callId: "1", isError: false } });
      expect(scoreImpact(writeCtx)).toBeGreaterThanOrEqual(0.7);
    });

    it("git push has very high impact", () => {
      const pushCtx = makeCtx({
        tool: { name: "exec", callId: "1", isError: false },
        args: { command: "git push origin main" },
      });
      expect(scoreImpact(pushCtx)).toBeGreaterThanOrEqual(0.7);
    });

    it("read operations have low impact", () => {
      const readCtx = makeCtx({ tool: { name: "read", callId: "1", isError: false } });
      expect(scoreImpact(readCtx)).toBeLessThanOrEqual(0.15);
    });

    it("messaging has high impact", () => {
      const msgCtx = makeCtx({ tool: { name: "message", callId: "1", isError: false } });
      expect(scoreImpact(msgCtx)).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe("scoreRelational", () => {
    it("external tools score higher for relational", () => {
      const msgCtx = makeCtx({ tool: { name: "message", callId: "1", isError: false } });
      const readCtx = makeCtx({ tool: { name: "read", callId: "1", isError: false } });
      expect(scoreRelational(msgCtx)).toBeGreaterThan(scoreRelational(readCtx));
    });

    it("known entities in result increase relational score", () => {
      const ctx = makeCtx({
        tool: { name: "exec", callId: "1", isError: false },
        result: "David reviewed the PR and approved it",
        knownEntities: ["David"],
      });
      expect(scoreRelational(ctx)).toBeGreaterThanOrEqual(0.4);
    });

    it("multiple entity hits increase score further", () => {
      const singleCtx = makeCtx({
        tool: { name: "exec", callId: "1", isError: false },
        result: "David reviewed the code",
        knownEntities: ["David", "Alice"],
      });
      const doubleCtx = makeCtx({
        tool: { name: "exec", callId: "1", isError: false },
        result: "David and Alice reviewed the code",
        knownEntities: ["David", "Alice"],
      });
      expect(scoreRelational(doubleCtx)).toBeGreaterThan(scoreRelational(singleCtx));
    });
  });

  describe("scoreTemporal", () => {
    it("persistent changes have high temporal value", () => {
      const writeCtx = makeCtx({ tool: { name: "write", callId: "1", isError: false } });
      expect(scoreTemporal(writeCtx)).toBeGreaterThanOrEqual(0.7);
    });

    it("read operations have low temporal value", () => {
      const readCtx = makeCtx({ tool: { name: "memory_search", callId: "1", isError: false } });
      expect(scoreTemporal(readCtx)).toBeLessThanOrEqual(0.15);
    });

    it("memory_store has high temporal value", () => {
      const storeCtx = makeCtx({ tool: { name: "memory_store", callId: "1", isError: false } });
      expect(scoreTemporal(storeCtx)).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("scoreUserIntent", () => {
    it("explicit capture returns maximum score", () => {
      const ctx = makeCtx({ explicitCapture: true });
      expect(scoreUserIntent(ctx)).toBe(1.0);
    });

    it("experience_capture tool scores high", () => {
      const ctx = makeCtx({ tool: { name: "experience_capture", callId: "1", isError: false } });
      expect(scoreUserIntent(ctx)).toBeGreaterThanOrEqual(0.9);
    });

    it("importance tags boost score", () => {
      const ctx = makeCtx({ tags: ["important", "decision"] });
      expect(scoreUserIntent(ctx)).toBeGreaterThanOrEqual(0.7);
    });

    it("no intent signals score low", () => {
      const ctx = makeCtx();
      expect(scoreUserIntent(ctx)).toBeLessThanOrEqual(0.2);
    });
  });

  describe("calculateFactors", () => {
    it("returns all five factors", () => {
      const ctx = makeCtx();
      const factors = calculateFactors(ctx);
      expect(factors).toHaveProperty("novelty");
      expect(factors).toHaveProperty("impact");
      expect(factors).toHaveProperty("relational");
      expect(factors).toHaveProperty("temporal");
      expect(factors).toHaveProperty("userIntent");
    });

    it("all factors are in [0, 1]", () => {
      const ctx = makeCtx({
        tool: { name: "message", callId: "1", isError: true },
        knownEntities: ["Alice"],
        result: "Alice responded with approval",
        explicitCapture: true,
      });
      const factors = calculateFactors(ctx);
      for (const [, value] of Object.entries(factors)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Main Scoring Function Tests
// ────────────────────────────────────────────────────────────────────────────

describe("evaluateMemoryRelevance", () => {
  it("returns a valid ScoringResult", () => {
    const ctx = makeCtx();
    const result = evaluateMemoryRelevance(ctx);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.factors).toBeDefined();
    expect(result.weights).toBeDefined();
    expect(result.reason).toBeTruthy();
    expect(result.method).toBeTruthy();
  });

  it("file writes score higher than reads", () => {
    const writeResult = evaluateMemoryRelevance(
      makeCtx({ tool: { name: "write", callId: "1", isError: false } }),
    );
    const readResult = evaluateMemoryRelevance(
      makeCtx({ tool: { name: "read", callId: "1", isError: false } }),
    );
    expect(writeResult.score).toBeGreaterThan(readResult.score);
  });

  it("errors boost scores", () => {
    const errorResult = evaluateMemoryRelevance(
      makeCtx({ tool: { name: "exec", callId: "1", isError: true } }),
    );
    const normalResult = evaluateMemoryRelevance(
      makeCtx({ tool: { name: "exec", callId: "1", isError: false } }),
    );
    expect(errorResult.score).toBeGreaterThan(normalResult.score);
  });

  it("explicit capture triggers override", () => {
    const ctx = makeCtx({ tool: { name: "experience_capture", callId: "1", isError: false } });
    const result = evaluateMemoryRelevance(ctx);
    expect(result.score).toBe(1.0);
    expect(result.method).toBe("override");
    expect(result.overrideApplied?.decision).toBe("always_capture");
  });

  it("memory_search gets capped by override", () => {
    const ctx = makeCtx({ tool: { name: "memory_search", callId: "1", isError: false } });
    const result = evaluateMemoryRelevance(ctx);
    expect(result.score).toBeLessThanOrEqual(0.15);
  });

  it("custom config overrides defaults", () => {
    const ctx = makeCtx({ tool: { name: "read", callId: "1", isError: false } });
    const config: Partial<ScoringConfig> = {
      overrides: [{ toolPattern: "read", fixedScore: 0.99 }],
    };
    const result = evaluateMemoryRelevance(ctx, config);
    expect(result.score).toBeCloseTo(0.99);
    expect(result.method).toBe("override");
  });

  it("always_skip override returns 0", () => {
    const ctx = makeCtx({ tool: { name: "exec", callId: "1", isError: false } });
    const config: Partial<ScoringConfig> = {
      overrides: [{ toolPattern: "exec", decision: "always_skip" }],
    };
    const result = evaluateMemoryRelevance(ctx, config);
    expect(result.score).toBe(0);
    expect(result.method).toBe("override");
  });

  it("minScore override lifts floor", () => {
    const ctx = makeCtx({ tool: { name: "message", callId: "1", isError: false } });
    const result = evaluateMemoryRelevance(ctx);
    // With default override, message has minScore 0.60
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("includes durationMs", () => {
    const result = evaluateMemoryRelevance(makeCtx());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Threshold Helper Tests
// ────────────────────────────────────────────────────────────────────────────

describe("threshold helpers", () => {
  it("shouldCapture returns true for scores above threshold", () => {
    expect(shouldCapture(0.5)).toBe(true);
    expect(shouldCapture(0.1)).toBe(false);
  });

  it("shouldPersistToGraph returns true for high scores", () => {
    expect(shouldPersistToGraph(0.7)).toBe(true);
    expect(shouldPersistToGraph(0.3)).toBe(false);
  });

  it("shouldUseLlmEval returns true for medium scores", () => {
    expect(shouldUseLlmEval(0.5)).toBe(true);
    expect(shouldUseLlmEval(0.2)).toBe(false);
  });

  it("custom thresholds are respected", () => {
    const config: Partial<ScoringConfig> = {
      thresholds: { captureThreshold: 0.9, graphPersistThreshold: 0.95, llmEvalThreshold: 0.92 },
    };
    expect(shouldCapture(0.85, config)).toBe(false);
    expect(shouldCapture(0.95, config)).toBe(true);
  });
});
