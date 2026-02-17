/**
 * Tests for FB-013: Trust-Weighted RAG Retrieval
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

const {
  computeTrustAdjustedScore,
  applyTrustWeighting,
  getTrustWeightConfig,
} = await import("./trust-weighted-retrieval.js");

describe("FB-013: Trust-Weighted Retrieval", () => {
  describe("computeTrustAdjustedScore", () => {
    it("boosts high-trust high-similarity items", () => {
      const score = computeTrustAdjustedScore(0.9, 1.0);
      expect(score).toBeGreaterThan(0.9);
    });

    it("penalises low-trust items", () => {
      const highTrust = computeTrustAdjustedScore(0.8, 1.0);
      const lowTrust = computeTrustAdjustedScore(0.8, 0.3);
      expect(lowTrust).toBeLessThan(highTrust);
    });

    it("returns pure similarity when disabled", () => {
      const score = computeTrustAdjustedScore(0.75, 0.1, {
        ...getTrustWeightConfig(),
        enabled: false,
      });
      expect(score).toBe(0.75);
    });

    it("clamps result to [0, 1]", () => {
      const score = computeTrustAdjustedScore(1.0, 1.0);
      expect(score).toBeLessThanOrEqual(1.0);
      expect(score).toBeGreaterThanOrEqual(0.0);
    });

    it("handles zero trust gracefully", () => {
      const score = computeTrustAdjustedScore(0.5, 0.0);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(0.5); // penalised
    });
  });

  describe("applyTrustWeighting", () => {
    const items = [
      { item: "web-fact", similarityScore: 0.9, trustLevel: 0.3 },
      { item: "user-fact", similarityScore: 0.7, trustLevel: 1.0 },
      { item: "tool-fact", similarityScore: 0.8, trustLevel: 0.7 },
    ];

    it("re-ranks items by trust-adjusted score", () => {
      const result = applyTrustWeighting(items);
      // User fact (high trust) should rank higher than web fact (low trust)
      // despite lower similarity
      const userIdx = result.findIndex((r) => r.item === "user-fact");
      const webIdx = result.findIndex((r) => r.item === "web-fact");
      expect(userIdx).toBeLessThan(webIdx);
    });

    it("filters items below minimum trust", () => {
      const result = applyTrustWeighting(items, { minTrustLevel: 0.5 });
      expect(result.find((r) => r.item === "web-fact")).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it("returns all items when disabled", () => {
      const result = applyTrustWeighting(items, { enabled: false });
      expect(result).toHaveLength(3);
      expect(result[0].adjustedScore).toBe(result[0].similarityScore);
    });

    it("handles empty input", () => {
      expect(applyTrustWeighting([])).toEqual([]);
    });
  });

  describe("getTrustWeightConfig", () => {
    it("returns defaults", () => {
      const config = getTrustWeightConfig();
      expect(config.enabled).toBe(true);
      expect(config.trustBlendFactor).toBe(0.3);
    });

    it("merges overrides", () => {
      const config = getTrustWeightConfig({ minTrustLevel: 0.5 });
      expect(config.minTrustLevel).toBe(0.5);
      expect(config.enabled).toBe(true);
    });
  });
});
