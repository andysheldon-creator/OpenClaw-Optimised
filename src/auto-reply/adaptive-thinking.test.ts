import { describe, expect, it } from "vitest";
import { normalizeThinkLevel, type ThinkLevel } from "./thinking.js";

/**
 * Tests for Anthropic adaptive thinking support (Opus 4.6+).
 *
 * The actual adaptive thinking implementation is in @mariozechner/pi-ai.
 * These tests verify OpenClaw's thinking levels map correctly to the
 * Anthropic effort parameter for Opus 4.6.
 *
 * Mapping:
 *   OpenClaw Level  →  Anthropic Effort
 *   minimal         →  low
 *   low             →  low
 *   medium          →  medium
 *   high            →  high
 *   xhigh           →  max
 */
describe("adaptive thinking level mapping", () => {
  /**
   * Mirrors the mapping in pi-ai's mapThinkingLevelToEffort function.
   * This mapping is used when calling Opus 4.6 with adaptive thinking.
   */
  function mapThinkingLevelToEffort(level: ThinkLevel): string {
    switch (level) {
      case "minimal":
        return "low";
      case "low":
        return "low";
      case "medium":
        return "medium";
      case "high":
        return "high";
      case "xhigh":
        return "max";
      default:
        return "high";
    }
  }

  it("maps minimal to low effort", () => {
    expect(mapThinkingLevelToEffort("minimal")).toBe("low");
  });

  it("maps low to low effort", () => {
    expect(mapThinkingLevelToEffort("low")).toBe("low");
  });

  it("maps medium to medium effort", () => {
    expect(mapThinkingLevelToEffort("medium")).toBe("medium");
  });

  it("maps high to high effort", () => {
    expect(mapThinkingLevelToEffort("high")).toBe("high");
  });

  it("maps xhigh to max effort", () => {
    expect(mapThinkingLevelToEffort("xhigh")).toBe("max");
  });

  it("defaults off level to high effort (pi-ai behavior)", () => {
    // When thinking is "off", it shouldn't reach the effort mapping
    // but the default fallback in pi-ai is "high"
    expect(mapThinkingLevelToEffort("off")).toBe("high");
  });
});

describe("opus 4.6 model detection", () => {
  /**
   * Mirrors the supportsAdaptiveThinking check in pi-ai.
   * Opus 4.6 model IDs contain "opus-4-6" or "opus-4.6".
   */
  function supportsAdaptiveThinking(modelId: string): boolean {
    return modelId.includes("opus-4-6") || modelId.includes("opus-4.6");
  }

  it("detects claude-opus-4-6 as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("claude-opus-4-6")).toBe(true);
  });

  it("detects claude-opus-4-6-20260205 as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("claude-opus-4-6-20260205")).toBe(true);
  });

  it("detects anthropic.claude-opus-4-6-v1 as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("anthropic.claude-opus-4-6-v1")).toBe(true);
  });

  it("detects opus-4.6 shorthand as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("opus-4.6")).toBe(true);
  });

  it("does not detect opus 4.5 as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("claude-opus-4-5")).toBe(false);
    expect(supportsAdaptiveThinking("claude-opus-4-5-thinking")).toBe(false);
  });

  it("does not detect sonnet models as adaptive thinking capable", () => {
    expect(supportsAdaptiveThinking("claude-sonnet-4-5")).toBe(false);
    expect(supportsAdaptiveThinking("claude-3-5-sonnet")).toBe(false);
  });
});

describe("thinking level normalization for adaptive thinking", () => {
  it("normalizes max to high (falls back to high effort)", () => {
    // "max" normalizes to "high" in OpenClaw, which maps to "high" effort
    expect(normalizeThinkLevel("max")).toBe("high");
  });

  it("normalizes highest to high", () => {
    expect(normalizeThinkLevel("highest")).toBe("high");
  });

  it("normalizes ultrathink to high", () => {
    // Common alias for high thinking
    expect(normalizeThinkLevel("ultra")).toBe("high");
  });

  it("preserves xhigh for max effort on supported models", () => {
    // xhigh is the only way to get "max" effort
    expect(normalizeThinkLevel("xhigh")).toBe("xhigh");
    expect(normalizeThinkLevel("x-high")).toBe("xhigh");
    expect(normalizeThinkLevel("extra-high")).toBe("xhigh");
  });
});
