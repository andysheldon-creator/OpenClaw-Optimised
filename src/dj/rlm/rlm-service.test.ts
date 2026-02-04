/**
 * Tests for RLM (Recursive Language Model) Service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefinementDecision, RlmExecutor } from "./rlm-types.js";
import { createRlmService, RlmService } from "./rlm-service.js";
import { generateRlmSessionId, isValidRlmSessionId } from "./rlm-store.js";
import {
  DEFAULT_RLM_CONFIG,
  RLM_MAX_DEPTH,
  RLM_MAX_ITERATIONS,
  RLM_MAX_SUBAGENTS,
} from "./rlm-types.js";

// =============================================================================
// Mock Executor
// =============================================================================

function createMockExecutor(
  options: {
    /** Number of iterations before marking as satisfactory */
    refineUntilIteration?: number;
    /** Fixed tokens per iteration */
    tokensPerIteration?: number;
    /** Fixed tool calls per iteration */
    toolCallsPerIteration?: number;
    /** Whether to spawn subagent on each iteration */
    spawnSubagent?: boolean;
    /** Custom output generator */
    outputGenerator?: (input: string, iterationNumber: number) => string;
    /** Force refinement decision */
    forceRefinement?: RefinementDecision;
  } = {},
): RlmExecutor {
  const refineUntil = options.refineUntilIteration ?? 1;

  return {
    execute: vi.fn(async (input: string, context: { iterationNumber: number }) => {
      const output = options.outputGenerator
        ? options.outputGenerator(input, context.iterationNumber)
        : `Output for iteration ${context.iterationNumber}`;

      return {
        output,
        tokensUsed: options.tokensPerIteration ?? 100,
        toolCallsUsed: options.toolCallsPerIteration ?? 1,
        subagentSpawned: options.spawnSubagent ?? false,
      };
    }),

    evaluateRefinement: vi.fn(async (_task: string, _output: string, iterationNumber: number) => {
      if (options.forceRefinement) {
        return options.forceRefinement;
      }

      if (iterationNumber >= refineUntil) {
        return {
          shouldRefine: false,
          reason: "satisfactory",
          confidence: 0.9,
        };
      }

      return {
        shouldRefine: true,
        reason: "needs_improvement",
        focusArea: "clarity",
        confidence: 0.7,
      };
    }),
  };
}

// =============================================================================
// Session ID Tests
// =============================================================================

describe("RLM Session ID", () => {
  describe("generateRlmSessionId", () => {
    it("should generate valid session IDs", () => {
      const id = generateRlmSessionId();
      expect(isValidRlmSessionId(id)).toBe(true);
      expect(id).toMatch(/^rlm-[a-f0-9]{8}$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRlmSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("isValidRlmSessionId", () => {
    it("should accept valid IDs", () => {
      expect(isValidRlmSessionId("rlm-12345678")).toBe(true);
      expect(isValidRlmSessionId("rlm-abcdef01")).toBe(true);
    });

    it("should reject invalid IDs", () => {
      expect(isValidRlmSessionId("rlm-1234567")).toBe(false); // too short
      expect(isValidRlmSessionId("rlm-123456789")).toBe(false); // too long
      expect(isValidRlmSessionId("RLM-12345678")).toBe(false); // wrong case
      expect(isValidRlmSessionId("session-12345678")).toBe(false); // wrong prefix
      expect(isValidRlmSessionId("rlm-ABCDEF01")).toBe(false); // uppercase hex
    });
  });
});

// =============================================================================
// Hard Cap Tests
// =============================================================================

describe("RLM Hard Caps", () => {
  it("should have correct default values", () => {
    expect(DEFAULT_RLM_CONFIG.maxDepth).toBe(2);
    expect(DEFAULT_RLM_CONFIG.maxSubagents).toBe(0);
    expect(DEFAULT_RLM_CONFIG.maxIterations).toBe(3);
    expect(DEFAULT_RLM_CONFIG.budgetProfile).toBe("normal");
  });

  it("should have correct maximum values", () => {
    expect(RLM_MAX_DEPTH).toBe(4);
    expect(RLM_MAX_SUBAGENTS).toBe(3);
    expect(RLM_MAX_ITERATIONS).toBe(10);
  });
});

// =============================================================================
// RLM Service Tests
// =============================================================================

describe("RlmService", () => {
  let service: RlmService;

  beforeEach(() => {
    service = createRlmService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("run", () => {
    it("should complete after one iteration when output is satisfactory", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const result = await service.run("Write a haiku about coding", {
        skipNotionLog: true,
      });

      expect(result.success).toBe(true);
      expect(result.iterationCount).toBe(1);
      expect(result.stopReason).toBe("completed");
      expect(result.stoppedEarly).toBe(false);
      expect(executor.execute).toHaveBeenCalledTimes(1);
    });

    it("should refine output through multiple iterations", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 3 });
      service.setExecutor(executor);

      const result = await service.run("Write a complex essay", {
        maxIterations: 5,
        skipNotionLog: true,
      });

      expect(result.success).toBe(true);
      expect(result.iterationCount).toBe(3);
      expect(result.stopReason).toBe("completed");
      expect(executor.execute).toHaveBeenCalledTimes(3);
    });

    it("should stop at max iterations cap", async () => {
      const executor = createMockExecutor({
        forceRefinement: {
          shouldRefine: true,
          reason: "always_refine",
          confidence: 1.0,
        },
      });
      service.setExecutor(executor);

      const result = await service.run("Endless refinement task", {
        maxIterations: 3,
        skipNotionLog: true,
      });

      expect(result.success).toBe(false);
      expect(result.iterationCount).toBe(3);
      expect(result.stopReason).toBe("max_iterations");
      expect(result.stoppedEarly).toBe(true);
    });

    it("should enforce max iterations hard cap", async () => {
      const executor = createMockExecutor({
        forceRefinement: {
          shouldRefine: true,
          reason: "always_refine",
          confidence: 1.0,
        },
      });
      service.setExecutor(executor);

      // Request 20 iterations, should be capped to RLM_MAX_ITERATIONS (10)
      const result = await service.run("Task with excessive iterations", {
        maxIterations: 20,
        skipNotionLog: true,
      });

      expect(result.iterationCount).toBe(RLM_MAX_ITERATIONS);
      expect(result.stopReason).toBe("max_iterations");
    });

    it("should stop when subagent cap is exceeded", async () => {
      const executor = createMockExecutor({
        spawnSubagent: true,
        refineUntilIteration: 5,
      });
      service.setExecutor(executor);

      const result = await service.run("Task requiring subagents", {
        maxSubagents: 2,
        maxIterations: 5,
        budgetProfile: "deep", // Use deep profile to avoid governor limits interfering
        skipNotionLog: true,
      });

      // Should stop after 3 iterations (0+1, 1+1, 2+1 = exceeds cap of 2)
      expect(result.iterationCount).toBe(3);
      expect(result.stopReason).toBe("max_subagents");
      expect(result.stoppedEarly).toBe(true);
    });

    it("should track total tokens across iterations", async () => {
      const tokensPerIteration = 150;
      const executor = createMockExecutor({
        tokensPerIteration,
        refineUntilIteration: 3,
      });
      service.setExecutor(executor);

      const result = await service.run("Multi-iteration task", {
        maxIterations: 5,
        skipNotionLog: true,
      });

      expect(result.iterationCount).toBe(3);
      expect(result.totalTokens).toBe(tokensPerIteration * 3);
    });

    it("should track total tool calls across iterations", async () => {
      const toolCallsPerIteration = 3;
      const executor = createMockExecutor({
        toolCallsPerIteration,
        refineUntilIteration: 2,
      });
      service.setExecutor(executor);

      const result = await service.run("Tool-intensive task", {
        maxIterations: 5,
        skipNotionLog: true,
      });

      expect(result.iterationCount).toBe(2);
      expect(result.totalToolCalls).toBe(toolCallsPerIteration * 2);
    });

    it("should generate unique session IDs", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const result1 = await service.run("Task 1", { skipNotionLog: true });
      const result2 = await service.run("Task 2", { skipNotionLog: true });

      expect(result1.sessionId).not.toBe(result2.sessionId);
      expect(isValidRlmSessionId(result1.sessionId)).toBe(true);
      expect(isValidRlmSessionId(result2.sessionId)).toBe(true);
    });

    it("should pass previous output to next iteration", async () => {
      const outputs: string[] = [];
      const executor = createMockExecutor({
        refineUntilIteration: 2,
        outputGenerator: (input: string, iteration: number) => {
          outputs.push(input);
          return `Output ${iteration}`;
        },
      });
      service.setExecutor(executor);

      await service.run("Initial task", { skipNotionLog: true });

      expect(outputs.length).toBe(2);
      expect(outputs[0]).toBe("Initial task"); // First iteration gets raw task
      expect(outputs[1]).toContain("Output 1"); // Second iteration gets previous output
    });
  });

  describe("getStatus", () => {
    it("should return session status", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const runResult = await service.run("Status test task", { skipNotionLog: true });
      const statusResult = await service.getStatus(runResult.sessionId);

      expect(statusResult.success).toBe(true);
      expect(statusResult.session).toBeDefined();
      expect(statusResult.session?.sessionId).toBe(runResult.sessionId);
      expect(statusResult.session?.task).toBe("Status test task");
    });

    it("should return error for non-existent session", async () => {
      const statusResult = await service.getStatus("rlm-00000000");

      expect(statusResult.success).toBe(false);
      expect(statusResult.message).toContain("not found");
    });
  });

  describe("getHistory", () => {
    it("should return recent sessions", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      await service.run("Task 1", { skipNotionLog: true });
      await service.run("Task 2", { skipNotionLog: true });
      await service.run("Task 3", { skipNotionLog: true });

      const historyResult = await service.getHistory(10);

      expect(historyResult.success).toBe(true);
      expect(historyResult.sessions.length).toBe(3);
    });

    it("should respect limit parameter", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      for (let i = 0; i < 5; i++) {
        await service.run(`Task ${i}`, { skipNotionLog: true });
      }

      const historyResult = await service.getHistory(2);

      expect(historyResult.success).toBe(true);
      expect(historyResult.sessions.length).toBeLessThanOrEqual(2);
    });
  });

  describe("stopSession", () => {
    it("should stop a session", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const runResult = await service.run("Stop test", { skipNotionLog: true });
      const stopResult = await service.stopSession(runResult.sessionId);

      expect(stopResult.success).toBe(true);
      expect(stopResult.session?.status).toBe("stopped");
    });
  });

  describe("budget profile integration", () => {
    it("should use normal profile by default", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const result = await service.run("Default profile task", { skipNotionLog: true });

      expect(result.success).toBe(true);
      // Budget profile is internal, but we can verify it ran successfully
    });

    it("should accept cheap profile", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const result = await service.run("Cheap profile task", {
        budgetProfile: "cheap",
        skipNotionLog: true,
      });

      expect(result.success).toBe(true);
    });

    it("should accept deep profile", async () => {
      const executor = createMockExecutor({ refineUntilIteration: 1 });
      service.setExecutor(executor);

      const result = await service.run("Deep profile task", {
        budgetProfile: "deep",
        skipNotionLog: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("no executor fallback", () => {
    it("should handle missing executor gracefully", async () => {
      // Don't set executor
      const result = await service.run("No executor task", { skipNotionLog: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain("No executor configured");
      expect(result.iterationCount).toBe(1);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe("createRlmService", () => {
  it("should create a service with default config", () => {
    const service = createRlmService();
    expect(service).toBeInstanceOf(RlmService);
  });

  it("should create a service with custom config", () => {
    const service = createRlmService({
      defaultMaxDepth: 3,
      defaultMaxIterations: 5,
      defaultMaxSubagents: 1,
      defaultBudgetProfile: "cheap",
    });
    expect(service).toBeInstanceOf(RlmService);
  });
});
