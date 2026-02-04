import { describe, expect, it } from "vitest";

import { buildChunkManifest, selectChunks, type ContextChunk } from "./chunk-selector.js";
import { createTokenEstimator } from "./token-estimator.js";

describe("chunk-selector", () => {
  const estimator = createTokenEstimator({ multiplier: 1.0 });

  const makeChunk = (id: string, text: string, score = 0): ContextChunk => ({
    id,
    text,
    source: `source-${id}`,
    score,
  });

  describe("selectChunks", () => {
    it("selects chunks within budget", () => {
      const chunks = [makeChunk("a", "Hello world", 1), makeChunk("b", "Goodbye world", 2)];

      const result = selectChunks(chunks, 1000, estimator);

      expect(result.included).toHaveLength(2);
      expect(result.excluded).toHaveLength(0);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it("excludes chunks that exceed budget", () => {
      const chunks = [
        makeChunk("a", "Short", 1),
        makeChunk("b", "A ".repeat(1000), 2), // Large chunk
      ];

      // Small budget that fits only the short chunk
      const result = selectChunks(chunks, 50, estimator);

      // Higher score chunk (b) is tried first but doesn't fit
      // Lower score chunk (a) fits
      expect(result.included.some((c) => c.id === "a")).toBe(true);
      expect(result.excluded.some((e) => e.chunk.id === "b")).toBe(true);
    });

    it("sorts by score descending", () => {
      const chunks = [
        makeChunk("low", "Low score", 1),
        makeChunk("high", "High score", 10),
        makeChunk("mid", "Mid score", 5),
      ];

      const result = selectChunks(chunks, 10000, estimator);

      // All should be included, in score order
      expect(result.included[0].id).toBe("high");
      expect(result.included[1].id).toBe("mid");
      expect(result.included[2].id).toBe("low");
    });

    it("tie-breaks by ID ascending", () => {
      const chunks = [
        makeChunk("c", "Same score C", 5),
        makeChunk("a", "Same score A", 5),
        makeChunk("b", "Same score B", 5),
      ];

      const result = selectChunks(chunks, 10000, estimator);

      // Same score, so sorted by ID: a, b, c
      expect(result.included[0].id).toBe("a");
      expect(result.included[1].id).toBe("b");
      expect(result.included[2].id).toBe("c");
    });

    it("is deterministic - same input produces same output", () => {
      const chunks = [
        makeChunk("x", "Chunk X", 3),
        makeChunk("y", "Chunk Y", 3),
        makeChunk("z", "Chunk Z", 5),
      ];

      const result1 = selectChunks(chunks, 10000, estimator);
      const result2 = selectChunks(chunks, 10000, estimator);

      expect(result1.included.map((c) => c.id)).toEqual(result2.included.map((c) => c.id));
    });

    it("handles empty chunks array", () => {
      const result = selectChunks([], 1000, estimator);

      expect(result.included).toHaveLength(0);
      expect(result.excluded).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it("handles zero budget", () => {
      const chunks = [makeChunk("a", "Hello", 1)];

      const result = selectChunks(chunks, 0, estimator);

      expect(result.included).toHaveLength(0);
      expect(result.excluded).toHaveLength(1);
      expect(result.excluded[0].reason).toContain("over_budget");
    });

    describe("strict_provenance mode", () => {
      it("excludes chunks without provenance", () => {
        const chunks = [
          makeChunk("no-prov", "No provenance", 10),
          {
            ...makeChunk("with-prov", "With provenance", 5),
            provenance: { page: 1 },
          },
        ];

        const result = selectChunks(chunks, 10000, estimator, "strict_provenance");

        expect(result.included).toHaveLength(1);
        expect(result.included[0].id).toBe("with-prov");
        expect(result.excluded).toHaveLength(1);
        expect(result.excluded[0].reason).toBe("missing_provenance");
      });

      it("accepts chunks with any provenance field", () => {
        const chunks = [
          { ...makeChunk("page", "Page prov", 1), provenance: { page: 1 } },
          {
            ...makeChunk("offset", "Offset prov", 2),
            provenance: { offsetStart: 0, offsetEnd: 10 },
          },
          { ...makeChunk("block", "Block prov", 3), provenance: { blockName: "intro" } },
        ];

        const result = selectChunks(chunks, 10000, estimator, "strict_provenance");

        expect(result.included).toHaveLength(3);
      });
    });
  });

  describe("buildChunkManifest", () => {
    it("builds manifest for all chunks", () => {
      const chunks = [makeChunk("a", "Hello", 5), makeChunk("b", "World", 3)];

      const result = selectChunks(chunks, 10000, estimator);
      const manifest = buildChunkManifest(chunks, result, estimator);

      expect(manifest).toHaveLength(2);
      expect(manifest.find((m) => m.id === "a")?.included).toBe(true);
      expect(manifest.find((m) => m.id === "b")?.included).toBe(true);
    });

    it("includes exclusion reasons", () => {
      const chunks = [
        makeChunk("a", "A ".repeat(1000), 1), // Large
      ];

      const result = selectChunks(chunks, 10, estimator);
      const manifest = buildChunkManifest(chunks, result, estimator);

      expect(manifest[0].included).toBe(false);
      expect(manifest[0].reason).toContain("over_budget");
    });
  });
});
