import { describe, expect, it } from "vitest";
import type { MeridiaToolResultContext } from "./types.js";
import {
  parsePhenomenology,
  extractHeuristicPhenomenology,
  evaluateHeuristic,
} from "./evaluate.js";

// ────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<MeridiaToolResultContext> = {}): MeridiaToolResultContext {
  return {
    tool: { name: "exec", callId: "test-call-1", isError: false },
    session: { key: "test-session", id: "test-id" },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// parsePhenomenology
// ────────────────────────────────────────────────────────────────────────────

describe("parsePhenomenology", () => {
  it("returns undefined for null input", () => {
    expect(parsePhenomenology(null)).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(parsePhenomenology("string")).toBeUndefined();
    expect(parsePhenomenology(42)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(parsePhenomenology({})).toBeUndefined();
  });

  it("parses valid emotional signature", () => {
    const result = parsePhenomenology({
      emotionalSignature: {
        primary: ["focused", "curious"],
        intensity: 0.8,
        valence: 0.3,
      },
    });
    expect(result).toBeDefined();
    expect(result!.emotionalSignature!.primary).toEqual(["focused", "curious"]);
    expect(result!.emotionalSignature!.intensity).toBe(0.8);
    expect(result!.emotionalSignature!.valence).toBe(0.3);
  });

  it("clamps intensity to 0..1", () => {
    const result = parsePhenomenology({
      emotionalSignature: { primary: ["test"], intensity: 1.5 },
    });
    expect(result!.emotionalSignature!.intensity).toBe(1);
  });

  it("clamps valence to -1..1", () => {
    const result = parsePhenomenology({
      emotionalSignature: { primary: ["test"], intensity: 0.5, valence: -2 },
    });
    expect(result!.emotionalSignature!.valence).toBe(-1);
  });

  it("defaults intensity to 0.5 when missing", () => {
    const result = parsePhenomenology({
      emotionalSignature: { primary: ["test"] },
    });
    expect(result!.emotionalSignature!.intensity).toBe(0.5);
  });

  it("ignores emotional signature with no primary emotions", () => {
    const result = parsePhenomenology({
      emotionalSignature: { primary: [], intensity: 0.5 },
    });
    expect(result).toBeUndefined();
  });

  it("filters non-string primary emotions", () => {
    const result = parsePhenomenology({
      emotionalSignature: { primary: ["valid", 42, null, "also-valid"] },
    });
    expect(result!.emotionalSignature!.primary).toEqual(["valid", "also-valid"]);
  });

  it("parses valid engagement quality", () => {
    const result = parsePhenomenology({ engagementQuality: "deep-flow" });
    expect(result!.engagementQuality).toBe("deep-flow");
  });

  it("rejects invalid engagement quality", () => {
    expect(parsePhenomenology({ engagementQuality: "invalid" })).toBeUndefined();
  });

  it("parses valid anchors", () => {
    const result = parsePhenomenology({
      anchors: [
        { phrase: "key concept", significance: "important for context" },
        { phrase: "with channel", significance: "sensory", sensoryChannel: "visual" },
      ],
    });
    expect(result!.anchors).toHaveLength(2);
    expect(result!.anchors![0].phrase).toBe("key concept");
    expect(result!.anchors![1].sensoryChannel).toBe("visual");
  });

  it("filters anchors missing required fields", () => {
    const result = parsePhenomenology({
      anchors: [
        { phrase: "valid", significance: "ok" },
        { phrase: "missing significance" },
        { significance: "missing phrase" },
      ],
    });
    expect(result!.anchors).toHaveLength(1);
  });

  it("parses uncertainties", () => {
    const result = parsePhenomenology({
      uncertainties: ["what is unclear", "needs investigation"],
    });
    expect(result!.uncertainties).toEqual(["what is unclear", "needs investigation"]);
  });

  it("filters non-string uncertainties", () => {
    const result = parsePhenomenology({
      uncertainties: ["valid", 42, null],
    });
    expect(result!.uncertainties).toEqual(["valid"]);
  });

  it("parses reconstitution hints", () => {
    const result = parsePhenomenology({
      reconstitutionHints: ["restore context by reviewing X"],
    });
    expect(result!.reconstitutionHints).toEqual(["restore context by reviewing X"]);
  });

  it("handles full phenomenology object", () => {
    const input = {
      emotionalSignature: {
        primary: ["focused"],
        secondary: ["curious"],
        intensity: 0.7,
        valence: 0.2,
        texture: "spacious",
      },
      engagementQuality: "engaged",
      anchors: [{ phrase: "concept", significance: "matters" }],
      uncertainties: ["unresolved thing"],
      reconstitutionHints: ["check this"],
    };
    const result = parsePhenomenology(input);
    expect(result).toBeDefined();
    expect(result!.emotionalSignature!.secondary).toEqual(["curious"]);
    expect(result!.emotionalSignature!.texture).toBe("spacious");
    expect(result!.engagementQuality).toBe("engaged");
    expect(result!.anchors).toHaveLength(1);
    expect(result!.uncertainties).toHaveLength(1);
    expect(result!.reconstitutionHints).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// extractHeuristicPhenomenology
// ────────────────────────────────────────────────────────────────────────────

describe("extractHeuristicPhenomenology", () => {
  it("generates error phenomenology for error context", () => {
    const ctx = makeCtx({ tool: { name: "exec", callId: "c1", isError: true } });
    const result = extractHeuristicPhenomenology(ctx, 0.55);
    expect(result.emotionalSignature!.primary).toContain("uncertain");
    expect(result.emotionalSignature!.valence).toBe(-0.3);
    expect(result.engagementQuality).toBe("struggling");
    expect(result.reconstitutionHints![0]).toContain("error");
  });

  it("generates high-score phenomenology", () => {
    const ctx = makeCtx();
    const result = extractHeuristicPhenomenology(ctx, 0.85);
    expect(result.emotionalSignature!.primary).toContain("focused");
    expect(result.emotionalSignature!.valence).toBe(0.2);
    expect(result.engagementQuality).toBe("engaged");
  });

  it("generates routine phenomenology for low scores", () => {
    const ctx = makeCtx({ tool: { name: "read", callId: "c1", isError: false } });
    const result = extractHeuristicPhenomenology(ctx, 0.3);
    expect(result.emotionalSignature!.primary).toContain("neutral");
    expect(result.engagementQuality).toBe("routine");
  });

  it("includes tool name as anchor", () => {
    const ctx = makeCtx({ tool: { name: "write", callId: "c1", isError: false } });
    const result = extractHeuristicPhenomenology(ctx, 0.6);
    expect(result.anchors![0].phrase).toBe("write");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// evaluateHeuristic (existing, verify backward compat)
// ────────────────────────────────────────────────────────────────────────────

describe("evaluateHeuristic", () => {
  it("scores exec tools at 0.5", () => {
    const result = evaluateHeuristic(
      makeCtx({ tool: { name: "exec", callId: "c", isError: false } }),
    );
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe("shell_exec");
  });

  it("scores write tools at 0.6", () => {
    const result = evaluateHeuristic(
      makeCtx({ tool: { name: "write", callId: "c", isError: false } }),
    );
    expect(result.score).toBe(0.6);
  });

  it("scores errors at 0.55", () => {
    const result = evaluateHeuristic(
      makeCtx({ tool: { name: "read", callId: "c", isError: true } }),
    );
    expect(result.score).toBe(0.55);
    expect(result.reason).toBe("tool_error");
  });

  it("does not include phenomenology (heuristic only)", () => {
    const result = evaluateHeuristic(makeCtx());
    expect(result.phenomenology).toBeUndefined();
  });
});
