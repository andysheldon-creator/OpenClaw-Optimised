import { describe, expect, it } from "vitest";
import type { ScoringContext } from "./types.js";
import { DEFAULT_WEIGHTS } from "./defaults.js";
import {
  scoreNovelty,
  scoreImpact,
  scoreRelational,
  scoreTemporal,
  scoreUserIntent,
  computeAllFactors,
} from "./factors.js";

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
// Novelty
// ────────────────────────────────────────────────────────────────────────────

describe("scoreNovelty", () => {
  it("returns high score with no prior captures", () => {
    const result = scoreNovelty(makeCtx({ recentCaptures: [] }));
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.reason).toBe("no_prior_captures");
  });

  it("returns moderate score for first use of a new tool", () => {
    const recent = [
      { ts: new Date().toISOString(), toolName: "read", score: 0.5 },
      { ts: new Date().toISOString(), toolName: "write", score: 0.6 },
    ];
    const result = scoreNovelty(makeCtx({ recentCaptures: recent }));
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.reason).toBe("first_use_of_tool_in_session");
  });

  it("returns lower score for highly repetitive tool use", () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      ts: new Date(Date.now() - i * 500).toISOString(),
      toolName: "exec",
      score: 0.5,
    }));
    const result = scoreNovelty(makeCtx({ recentCaptures: recent }));
    expect(result.score).toBeLessThan(0.5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Impact
// ────────────────────────────────────────────────────────────────────────────

describe("scoreImpact", () => {
  it("scores errors as high impact", () => {
    const result = scoreImpact(makeCtx({ tool: { name: "exec", callId: "c1", isError: true } }));
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.reason).toBe("tool_error");
  });

  it("scores write tools as high impact", () => {
    const result = scoreImpact(makeCtx({ tool: { name: "write", callId: "c1", isError: false } }));
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("scores read tools as low impact", () => {
    const result = scoreImpact(makeCtx({ tool: { name: "read", callId: "c1", isError: false } }));
    expect(result.score).toBeLessThanOrEqual(0.3);
  });

  it("scores Slack tools as high impact", () => {
    for (const name of [
      "SlackRichMessage",
      "AskSlackQuestion",
      "AskSlackForm",
      "AskSlackConfirmation",
    ]) {
      const result = scoreImpact(makeCtx({ tool: { name, callId: "c1", isError: false } }));
      expect(result.score, `${name} should be high impact`).toBeGreaterThanOrEqual(0.6);
      expect(result.reason).toBe("high_impact_tool");
    }
  });

  it("scores memory_query as low impact", () => {
    const result = scoreImpact(
      makeCtx({ tool: { name: "memory_query", callId: "c1", isError: false } }),
    );
    expect(result.score).toBeLessThanOrEqual(0.25);
    expect(result.reason).toBe("low_impact_tool");
  });

  it("scores memory_context_pack as low impact", () => {
    const result = scoreImpact(
      makeCtx({ tool: { name: "memory_context_pack", callId: "c1", isError: false } }),
    );
    expect(result.score).toBeLessThanOrEqual(0.25);
    expect(result.reason).toBe("low_impact_tool");
  });

  it("detects high-impact meta keywords", () => {
    const result = scoreImpact(
      makeCtx({
        tool: { name: "exec", callId: "c1", isError: false, meta: "deploying to production" },
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.reason).toContain("high_impact_meta");
  });

  it("detects large results", () => {
    const result = scoreImpact(makeCtx({ result: "x".repeat(15000) }));
    expect(result.score).toBeGreaterThanOrEqual(0.5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Relational
// ────────────────────────────────────────────────────────────────────────────

describe("scoreRelational", () => {
  it("returns low score with no signals", () => {
    const result = scoreRelational(makeCtx());
    expect(result.score).toBeLessThanOrEqual(0.3);
    expect(result.reason).toBe("no_relational_signals");
  });

  it("boosts score for content tags", () => {
    const result = scoreRelational(makeCtx({ contentTags: ["user", "project", "deploy"] }));
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.reason).toContain("tags:");
  });

  it("detects relational keywords in summary", () => {
    const result = scoreRelational(
      makeCtx({ contentSummary: "Updated the user API endpoint for the project" }),
    );
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.reason).toContain("keywords:");
  });

  it("detects file paths in args", () => {
    const result = scoreRelational(
      makeCtx({ args: { path: "/Users/david/clawd/project/src/main.ts" } }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.35);
    expect(result.reason).toContain("paths:");
  });

  it("detects URLs in args", () => {
    const result = scoreRelational(
      makeCtx({ args: { url: "https://github.com/org/repo/pull/123" } }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.reason).toContain("urls:");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Temporal
// ────────────────────────────────────────────────────────────────────────────

describe("scoreTemporal", () => {
  it("returns a score in valid range", () => {
    const result = scoreTemporal(makeCtx());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("detects burst activity and lowers score", () => {
    const now = Date.now();
    const recentBurst = Array.from({ length: 4 }, (_, i) => ({
      ts: new Date(now - i * 5000).toISOString(), // 5 seconds apart
      toolName: "exec",
      score: 0.5,
    }));

    const result = scoreTemporal(makeCtx({ recentCaptures: recentBurst }));
    // Burst detection should lower the score
    expect(result.reason).toBe("burst_detected");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// User Intent
// ────────────────────────────────────────────────────────────────────────────

describe("scoreUserIntent", () => {
  it("returns maximum for user-marked-important", () => {
    const result = scoreUserIntent(makeCtx({ userMarkedImportant: true }));
    expect(result.score).toBe(1.0);
    expect(result.reason).toBe("user_marked_important");
  });

  it("returns high for experience_capture tool", () => {
    const result = scoreUserIntent(
      makeCtx({ tool: { name: "experience_capture", callId: "c1", isError: false } }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("detects intent keywords in meta", () => {
    const result = scoreUserIntent(
      makeCtx({
        tool: { name: "exec", callId: "c1", isError: false, meta: "remember this" },
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it("uses heuristic score for implicit intent", () => {
    const result = scoreUserIntent(
      makeCtx({ heuristicEval: { score: 0.8, reason: "high_score" } }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.reason).toBe("high_heuristic_implicit_intent");
  });

  it("returns low for no explicit intent", () => {
    const result = scoreUserIntent(makeCtx());
    expect(result.score).toBeLessThanOrEqual(0.3);
    expect(result.reason).toBe("no_explicit_intent");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Composite Computation
// ────────────────────────────────────────────────────────────────────────────

describe("computeAllFactors", () => {
  it("returns exactly 5 factors", () => {
    const factors = computeAllFactors(makeCtx(), DEFAULT_WEIGHTS);
    expect(factors).toHaveLength(5);
  });

  it("applies weights correctly", () => {
    const factors = computeAllFactors(makeCtx(), DEFAULT_WEIGHTS);
    for (const f of factors) {
      expect(f.weighted).toBeCloseTo(f.rawScore * f.weight, 5);
    }
  });

  it("all scores are in [0, 1]", () => {
    const factors = computeAllFactors(makeCtx(), DEFAULT_WEIGHTS);
    for (const f of factors) {
      expect(f.rawScore).toBeGreaterThanOrEqual(0);
      expect(f.rawScore).toBeLessThanOrEqual(1);
    }
  });
});
