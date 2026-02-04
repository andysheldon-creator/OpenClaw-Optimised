import { describe, expect, it } from "vitest";

import { createTokenEstimator, estimateSegments } from "./token-estimator.js";

describe("token-estimator", () => {
  describe("createTokenEstimator", () => {
    it("uses default values when no config provided", () => {
      const estimator = createTokenEstimator();

      // Default multiplier is SAFETY_MARGIN (1.2)
      expect(estimator.multiplier).toBe(1.2);
      // Default reserve is 2000
      expect(estimator.reserveTokens).toBe(2000);
      // Default context is 32768
      expect(estimator.maxContextTokens).toBe(32768);
      // maxPromptTokens = maxContextTokens - reserveTokens
      expect(estimator.maxPromptTokens).toBe(32768 - 2000);
    });

    it("respects custom configuration", () => {
      const estimator = createTokenEstimator({
        multiplier: 1.5,
        reserveTokens: 1000,
        maxContextTokens: 16000,
      });

      expect(estimator.multiplier).toBe(1.5);
      expect(estimator.reserveTokens).toBe(1000);
      expect(estimator.maxContextTokens).toBe(16000);
      expect(estimator.maxPromptTokens).toBe(15000);
    });

    it("clamps maxContextTokens to minimum", () => {
      const estimator = createTokenEstimator({
        maxContextTokens: 1000, // Below minimum of 16000
      });

      // Should be clamped to MINIMUM_CONTEXT_TOKENS (16000)
      expect(estimator.maxContextTokens).toBe(16000);
    });

    it("estimates tokens with multiplier applied", () => {
      const estimator = createTokenEstimator({ multiplier: 1.0 });

      // Empty string should be 0
      expect(estimator.estimate("")).toBe(0);

      // Non-empty string should have tokens
      const tokens = estimator.estimate("Hello world");
      expect(tokens).toBeGreaterThan(0);
    });

    it("applies safety multiplier to estimates", () => {
      const estimator1 = createTokenEstimator({ multiplier: 1.0 });
      const estimator2 = createTokenEstimator({ multiplier: 2.0 });

      const text = "Hello world, this is a test.";
      const tokens1 = estimator1.estimate(text);
      const tokens2 = estimator2.estimate(text);

      // With 2x multiplier, estimate should be ~2x
      expect(tokens2).toBeGreaterThan(tokens1);
      expect(tokens2).toBeLessThanOrEqual(tokens1 * 2 + 1); // Allow for ceiling
    });
  });

  describe("estimateSegments", () => {
    it("estimates multiple segments and returns breakdown", () => {
      const estimator = createTokenEstimator({ multiplier: 1.0 });

      const result = estimateSegments(estimator, {
        system: "You are a helpful assistant.",
        instructions: "Answer concisely.",
        query: "What is 2+2?",
      });

      expect(result.system).toBeGreaterThan(0);
      expect(result.instructions).toBeGreaterThan(0);
      expect(result.query).toBeGreaterThan(0);
      expect(result.total).toBe(result.system + result.instructions + result.query);
    });

    it("handles empty segments", () => {
      const estimator = createTokenEstimator({ multiplier: 1.0 });

      const result = estimateSegments(estimator, {
        empty: "",
        nonEmpty: "Hello",
      });

      expect(result.empty).toBe(0);
      expect(result.nonEmpty).toBeGreaterThan(0);
      expect(result.total).toBe(result.nonEmpty);
    });
  });
});
