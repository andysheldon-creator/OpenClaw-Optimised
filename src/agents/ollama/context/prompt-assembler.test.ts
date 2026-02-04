import { describe, expect, it } from "vitest";

import { isOverBudgetError } from "../errors.js";
import { assemblePrompt, createContextManager } from "./prompt-assembler.js";
import { createTokenEstimator } from "./token-estimator.js";
import type { ContextChunk } from "./chunk-selector.js";

describe("prompt-assembler", () => {
  // Note: maxContextTokens is clamped to MINIMUM_CONTEXT_TOKENS (16000)
  // So with reserveTokens: 100, maxPromptTokens = 16000 - 100 = 15900
  const estimator = createTokenEstimator({
    multiplier: 1.0,
    reserveTokens: 100,
    maxContextTokens: 16000, // Minimum allowed
  });

  const makeChunk = (id: string, text: string, score = 0): ContextChunk => ({
    id,
    text,
    source: `source-${id}`,
    score,
  });

  describe("assemblePrompt", () => {
    it("assembles prompt from components", () => {
      const result = assemblePrompt(
        {
          system: "You are helpful.",
          instructions: "Be concise.",
          userQuery: "Hello?",
          candidateChunks: [],
        },
        estimator,
      );

      expect(result.prompt).toContain("You are helpful.");
      expect(result.prompt).toContain("Be concise.");
      expect(result.prompt).toContain("Hello?");
      expect(result.manifest.withinBudget).toBe(true);
    });

    it("includes context chunks in prompt", () => {
      const result = assemblePrompt(
        {
          system: "System",
          instructions: "",
          userQuery: "Query",
          candidateChunks: [makeChunk("a", "Context A", 1), makeChunk("b", "Context B", 2)],
        },
        estimator,
      );

      expect(result.prompt).toContain("<context>");
      expect(result.prompt).toContain("Context A");
      expect(result.prompt).toContain("Context B");
      expect(result.prompt).toContain("</context>");
    });

    it("generates SHA256 prompt hash", () => {
      const result = assemblePrompt(
        {
          system: "System",
          instructions: "",
          userQuery: "Query",
          candidateChunks: [],
        },
        estimator,
      );

      // SHA256 hash is 64 hex characters
      expect(result.manifest.promptHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces deterministic hash for same input", () => {
      const input = {
        system: "System",
        instructions: "Instructions",
        userQuery: "Query",
        candidateChunks: [makeChunk("a", "Chunk", 1)],
      };

      const result1 = assemblePrompt(input, estimator);
      const result2 = assemblePrompt(input, estimator);

      expect(result1.manifest.promptHash).toBe(result2.manifest.promptHash);
    });

    it("tracks token counts in manifest", () => {
      const result = assemblePrompt(
        {
          system: "System prompt here",
          instructions: "Instructions here",
          userQuery: "User query here",
          candidateChunks: [makeChunk("a", "Context chunk", 1)],
        },
        estimator,
      );

      expect(result.manifest.systemTokens).toBeGreaterThan(0);
      expect(result.manifest.instructionsTokens).toBeGreaterThan(0);
      expect(result.manifest.userQueryTokens).toBeGreaterThan(0);
      expect(result.manifest.contextTokens).toBeGreaterThan(0);
      expect(result.manifest.totalTokens).toBe(
        result.manifest.systemTokens +
          result.manifest.instructionsTokens +
          result.manifest.userQueryTokens +
          result.manifest.contextTokens,
      );
    });

    it("throws OverBudgetError when prompt exceeds budget", () => {
      // With 4 chars per token and 1.0 multiplier:
      // Estimator has maxPromptTokens = 16000 - 100 = 15900
      // We need > 15900 tokens = > 63600 chars
      // 3 x 25000 chars = 75000 chars = 18750 tokens > 15900 budget
      const largeText = "A ".repeat(12500); // 25000 chars = 6250 tokens each

      expect(() =>
        assemblePrompt(
          {
            system: largeText,
            instructions: largeText,
            userQuery: largeText,
            candidateChunks: [],
          },
          estimator,
        ),
      ).toThrow();

      try {
        assemblePrompt(
          {
            system: largeText,
            instructions: largeText,
            userQuery: largeText,
            candidateChunks: [],
          },
          estimator,
        );
      } catch (err) {
        expect(isOverBudgetError(err)).toBe(true);
        if (isOverBudgetError(err)) {
          expect(err.estimatedTokens).toBeGreaterThan(err.budgetTokens);
          expect(err.overBy).toBeGreaterThan(0);
        }
      }
    });

    it("respects custom budget override", () => {
      // With default budget (900 tokens), this should pass
      const result = assemblePrompt(
        {
          system: "Short",
          instructions: "",
          userQuery: "Query",
          candidateChunks: [],
          budget: 1000,
        },
        estimator,
      );

      expect(result.manifest.withinBudget).toBe(true);

      // With tiny budget, should fail
      expect(() =>
        assemblePrompt(
          {
            system: "Short",
            instructions: "",
            userQuery: "Query",
            candidateChunks: [],
            budget: 1, // Impossibly small
          },
          estimator,
        ),
      ).toThrow();
    });

    it("excludes chunks that exceed remaining budget", () => {
      // With budget: 100 tokens and fixed components ~10 tokens
      // Remaining budget for chunks is ~90 tokens = ~360 chars
      // Large chunk with 2000 chars = 500 tokens won't fit
      const result = assemblePrompt(
        {
          system: "System",
          instructions: "",
          userQuery: "Query",
          candidateChunks: [
            makeChunk("small", "Small", 1),
            makeChunk("large", "A ".repeat(1000), 2), // 2000 chars = 500 tokens, too large
          ],
          budget: 100,
        },
        estimator,
      );

      // Large chunk should be excluded
      const largeChunk = result.manifest.chunks.find((c) => c.id === "large");
      expect(largeChunk?.included).toBe(false);
    });
  });

  describe("createContextManager", () => {
    it("creates manager with estimator and assemble function", () => {
      const manager = createContextManager({
        maxContextTokens: 32000, // Above MINIMUM_CONTEXT_TOKENS (16000)
        reserveTokens: 200,
      });

      expect(manager.estimator).toBeDefined();
      expect(manager.estimator.maxContextTokens).toBe(32000);
      expect(manager.estimator.reserveTokens).toBe(200);
      expect(typeof manager.assemble).toBe("function");
    });

    it("assemble function works correctly", () => {
      const manager = createContextManager();

      const result = manager.assemble({
        system: "System",
        instructions: "",
        userQuery: "Query",
        candidateChunks: [],
      });

      expect(result.prompt).toBeDefined();
      expect(result.manifest).toBeDefined();
    });
  });
});
