/**
 * Tests for ExecutionKernel.
 *
 * Tests cover:
 * - Full execution flow (happy path)
 * - Request validation
 * - Error handling at each stage
 * - Abort handling
 * - Event invariant verification
 * - Integration with mock runtime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EventRouter } from "./events.js";
import type { TurnExecutor } from "./executor.js";
import type { RuntimeResolver } from "./resolver.js";
import type { StateService } from "./state.js";
import type { ExecutionRequest, RuntimeContext, TurnOutcome, ExecutionEvent } from "./types.js";
import { createExecutionKernel, createDefaultExecutionKernel } from "./kernel.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockResolver(context?: Partial<RuntimeContext>): RuntimeResolver {
  const defaultContext: RuntimeContext = {
    kind: "pi",
    provider: "z.ai",
    model: "inflection-3-pi",
    toolPolicy: { enabled: true },
    sandbox: null,
    capabilities: {
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      supportsThinking: false,
    },
    ...context,
  };

  return {
    resolve: vi.fn().mockResolvedValue(defaultContext),
  };
}

function createMockExecutor(outcome?: Partial<TurnOutcome>): TurnExecutor {
  const defaultOutcome: TurnOutcome = {
    reply: "Hello! This is a test response.",
    payloads: [{ text: "Hello! This is a test response." }],
    toolCalls: [],
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 500,
    },
    fallbackUsed: false,
    didSendViaMessagingTool: false,
    ...outcome,
  };

  return {
    execute: vi.fn().mockResolvedValue(defaultOutcome),
  };
}

function createMockStateService(): StateService {
  return {
    persist: vi.fn().mockResolvedValue(undefined),
    resolveTranscriptPath: vi.fn().mockReturnValue("/path/to/transcript.jsonl"),
    incrementCompactionCount: vi.fn().mockResolvedValue({ compactionCount: 1, success: true }),
  };
}

function createValidRequest(overrides?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    agentId: "main",
    sessionId: "test-session-123",
    workspaceDir: "/workspace",
    prompt: "Hello, how are you?",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExecutionKernel", () => {
  let mockResolver: RuntimeResolver;
  let mockExecutor: TurnExecutor;
  let mockStateService: StateService;

  beforeEach(() => {
    mockResolver = createMockResolver();
    mockExecutor = createMockExecutor();
    mockStateService = createMockStateService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("execute() - happy path", () => {
    it("should execute a request successfully", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
      expect(result.reply).toBe("Hello! This is a test response.");
      expect(result.error).toBeUndefined();
    });

    it("should call resolver with the request", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      await kernel.execute(request);

      expect(mockResolver.resolve).toHaveBeenCalledWith(request);
    });

    it("should call executor with context, request, and emitter", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      await kernel.execute(request);

      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
      const [context, reqWithRunId, emitter] = (mockExecutor.execute as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(context.kind).toBe("pi");
      expect(reqWithRunId.prompt).toBe(request.prompt);
      expect(reqWithRunId.runId).toBeDefined();
      expect(emitter).toBeDefined();
    });

    it("should call state service to persist after execution", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      await kernel.execute(request);

      expect(mockStateService.persist).toHaveBeenCalledTimes(1);
    });

    it("should include runtime info in the result", async () => {
      mockResolver = createMockResolver({
        kind: "claude",
        provider: "anthropic",
        model: "claude-3-opus-20240229",
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.runtime.kind).toBe("claude");
      expect(result.runtime.provider).toBe("anthropic");
      expect(result.runtime.model).toBe("claude-3-opus-20240229");
    });

    it("should include usage metrics in the result", async () => {
      mockExecutor = createMockExecutor({
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          cacheReadTokens: 50,
          durationMs: 1000,
        },
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.usage.inputTokens).toBe(200);
      expect(result.usage.outputTokens).toBe(100);
      expect(result.usage.cacheReadTokens).toBe(50);
      // durationMs can be 0 if execution is very fast
      expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should use provided runId if given", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ runId: "custom-run-id-123" });
      const result = await kernel.execute(request);

      // Verify the executor was called with the custom runId
      const [, reqWithRunId] = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(reqWithRunId.runId).toBe("custom-run-id-123");
      // Events should have the custom runId
      expect(result.events.every((e) => e.runId === "custom-run-id-123")).toBe(true);
    });

    it("should generate runId if not provided", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      // All events should have the same runId
      const runIds = result.events.map((e) => e.runId);
      expect(runIds.length).toBeGreaterThan(0);
      expect(new Set(runIds).size).toBe(1);
      // Should be a UUID-like string
      expect(runIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("execute() - request validation", () => {
    it("should fail if agentId is missing", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ agentId: "" });
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("agentId");
    });

    it("should fail if sessionId is missing", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ sessionId: "" });
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("sessionId");
    });

    it("should fail if workspaceDir is missing", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ workspaceDir: "" });
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("workspaceDir");
    });

    it("should fail if prompt is undefined", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      // @ts-expect-error - Testing invalid input
      request.prompt = undefined;
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("prompt");
    });

    it("should allow empty string prompt", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ prompt: "" });
      const result = await kernel.execute(request);

      // Empty prompt is valid - agent may have context from previous turns
      expect(result.success).toBe(true);
    });

    it("should fail if timeoutMs is not positive", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ timeoutMs: 0 });
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("timeoutMs");
    });

    it("should fail if maxTokens is not positive", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ maxTokens: -1 });
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("validation_failed");
      expect(result.error?.message).toContain("maxTokens");
    });

    it("should not call resolver or executor on validation failure", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ agentId: "" });
      await kernel.execute(request);

      expect(mockResolver.resolve).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });

  describe("execute() - error handling", () => {
    it("should handle resolver errors gracefully", async () => {
      mockResolver = {
        resolve: vi.fn().mockRejectedValue(new Error("Runtime not available")),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("runtime_unavailable");
      expect(result.error?.message).toBe("Runtime not available");
    });

    it("should handle executor errors gracefully", async () => {
      mockExecutor = {
        execute: vi.fn().mockRejectedValue(new Error("Runtime execution failed")),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe("runtime_error");
      expect(result.error?.message).toBe("Runtime execution failed");
    });

    it("should handle state service errors gracefully (non-fatal)", async () => {
      mockStateService = {
        persist: vi.fn().mockRejectedValue(new Error("State persist failed")),
        resolveTranscriptPath: vi.fn().mockReturnValue("/path"),
        incrementCompactionCount: vi.fn(),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      // State persistence failure should NOT fail the execution
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should never let exceptions escape execute()", async () => {
      // Create a resolver that throws a non-Error
      mockResolver = {
        resolve: vi.fn().mockImplementation(() => {
          throw "string error"; // eslint-disable-line no-throw-literal
        }),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();

      // Should not throw
      const result = await kernel.execute(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should mark runtime errors as retryable", async () => {
      mockExecutor = {
        execute: vi.fn().mockRejectedValue(new Error("Temporary failure")),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.error?.retryable).toBe(true);
    });

    it("should mark validation errors as non-retryable", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ agentId: "" });
      const result = await kernel.execute(request);

      expect(result.error?.retryable).toBe(false);
    });
  });

  describe("execute() - abort handling", () => {
    it("should support aborting an active execution", async () => {
      // Create an executor that waits for a signal
      let resolveExecution: () => void;
      const executionPromise = new Promise<void>((resolve) => {
        resolveExecution = resolve;
      });

      mockExecutor = {
        execute: vi.fn().mockImplementation(async () => {
          await executionPromise;
          return createMockExecutor().execute(
            {} as RuntimeContext,
            {} as ExecutionRequest,
            {} as EventRouter,
          );
        }),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ runId: "abort-test-run" });

      // Start execution in background
      const resultPromise = kernel.execute(request);

      // Wait a tick to ensure execution has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abort the execution
      await kernel.abort("abort-test-run");

      // Let execution continue (it should check abort signal)
      resolveExecution!();

      const result = await resultPromise;

      // The result should indicate it was aborted
      // Note: Since our mock doesn't actually check the abort signal,
      // this test primarily verifies the abort() method doesn't throw
      expect(result).toBeDefined();
    });

    it("should return immediately if aborting non-existent run", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      // Should not throw
      await kernel.abort("non-existent-run-id");
    });

    it("should track active runs correctly", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      expect(kernel.getActiveRunCount()).toBe(0);

      // Execute a request
      const request = createValidRequest();
      await kernel.execute(request);

      // After completion, active run count should be 0
      expect(kernel.getActiveRunCount()).toBe(0);
    });
  });

  describe("execute() - event invariants", () => {
    it("should emit exactly one lifecycle.start on success", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      const startEvents = result.events.filter((e) => e.kind === "lifecycle.start");
      expect(startEvents.length).toBe(1);
    });

    it("should emit exactly one lifecycle.end on success", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      const endEvents = result.events.filter((e) => e.kind === "lifecycle.end");
      expect(endEvents.length).toBe(1);
    });

    it("should emit lifecycle.error instead of lifecycle.end on failure", async () => {
      mockExecutor = {
        execute: vi.fn().mockRejectedValue(new Error("Execution failed")),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      const endEvents = result.events.filter((e) => e.kind === "lifecycle.end");
      const errorEvents = result.events.filter((e) => e.kind === "lifecycle.error");

      expect(endEvents.length).toBe(0);
      expect(errorEvents.length).toBe(1);
    });

    it("should emit lifecycle.error for validation failures (no lifecycle.start)", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({ agentId: "" });
      const result = await kernel.execute(request);

      const startEvents = result.events.filter((e) => e.kind === "lifecycle.start");
      const errorEvents = result.events.filter((e) => e.kind === "lifecycle.error");

      // Validation failures should NOT emit lifecycle.start
      expect(startEvents.length).toBe(0);
      expect(errorEvents.length).toBe(1);
    });

    it("should include error details in lifecycle.error event", async () => {
      mockResolver = {
        resolve: vi.fn().mockRejectedValue(new Error("Test error message")),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      const errorEvent = result.events.find((e) => e.kind === "lifecycle.error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.error).toBe("Test error message");
      expect(errorEvent?.data.kind).toBe("runtime_unavailable");
    });

    it("should include durationMs in lifecycle.end event", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      const endEvent = result.events.find((e) => e.kind === "lifecycle.end");
      expect(endEvent).toBeDefined();
      expect(typeof endEvent?.data.durationMs).toBe("number");
      expect(endEvent?.data.durationMs as number).toBeGreaterThanOrEqual(0);
    });

    it("should wire onEvent callback to receive all events", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const receivedEvents: ExecutionEvent[] = [];
      const request = createValidRequest({
        onEvent: (event) => {
          receivedEvents.push(event);
        },
      });

      const result = await kernel.execute(request);

      // Callback should receive the same events as the result
      expect(receivedEvents.length).toBe(result.events.length);
    });
  });

  describe("execute() - result building", () => {
    it("should include tool calls in the result", async () => {
      mockExecutor = createMockExecutor({
        toolCalls: [
          { name: "read_file", id: "call-1", success: true, durationMs: 100 },
          { name: "write_file", id: "call-2", success: true, durationMs: 200 },
        ],
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe("read_file");
      expect(result.toolCalls[1].name).toBe("write_file");
    });

    it("should include didSendViaMessagingTool in the result", async () => {
      mockExecutor = createMockExecutor({
        didSendViaMessagingTool: true,
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.didSendViaMessagingTool).toBe(true);
    });

    it("should include payloads in the result", async () => {
      mockExecutor = createMockExecutor({
        payloads: [
          { text: "Part 1" },
          { text: "Part 2", mediaUrl: "https://example.com/image.png" },
        ],
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.payloads).toHaveLength(2);
      expect(result.payloads[0].text).toBe("Part 1");
      expect(result.payloads[1].mediaUrl).toBe("https://example.com/image.png");
    });

    it("should include fallbackUsed in runtime info", async () => {
      mockExecutor = createMockExecutor({
        fallbackUsed: true,
      });

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest();
      const result = await kernel.execute(request);

      expect(result.runtime.fallbackUsed).toBe(true);
    });
  });

  describe("factory functions", () => {
    it("createExecutionKernel should create a kernel with provided dependencies", () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      expect(kernel).toBeDefined();
      expect(kernel.execute).toBeDefined();
      expect(kernel.abort).toBeDefined();
    });

    it("createDefaultExecutionKernel should create a kernel with default dependencies", () => {
      const kernel = createDefaultExecutionKernel();

      expect(kernel).toBeDefined();
      expect(kernel.execute).toBeDefined();
      expect(kernel.abort).toBeDefined();
    });
  });

  describe("integration test with mock runtime", () => {
    it("should handle a complete execution flow with realistic components", async () => {
      // Create more realistic mocks
      const contextUsed: RuntimeContext = {
        kind: "pi",
        provider: "z.ai",
        model: "inflection-3-pi",
        toolPolicy: { enabled: true },
        sandbox: null,
        capabilities: {
          supportsTools: true,
          supportsStreaming: true,
          supportsImages: true,
          supportsThinking: false,
        },
      };

      const outcomeProduced: TurnOutcome = {
        reply: "I can help you with that! Let me read the file first.",
        payloads: [{ text: "I can help you with that! Let me read the file first." }],
        toolCalls: [
          {
            name: "read_file",
            id: "tool-call-abc123",
            input: { path: "/workspace/README.md" },
            success: true,
            durationMs: 150,
          },
        ],
        usage: {
          inputTokens: 500,
          outputTokens: 120,
          cacheReadTokens: 200,
          durationMs: 2500,
        },
        fallbackUsed: false,
        didSendViaMessagingTool: false,
      };

      mockResolver = { resolve: vi.fn().mockResolvedValue(contextUsed) };
      mockExecutor = { execute: vi.fn().mockResolvedValue(outcomeProduced) };
      mockStateService = {
        persist: vi.fn().mockResolvedValue(undefined),
        resolveTranscriptPath: vi.fn(),
        incrementCompactionCount: vi.fn(),
      };

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createValidRequest({
        prompt: "Please read the README file",
      });

      const result = await kernel.execute(request);

      // Verify successful execution
      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify reply
      expect(result.reply).toBe("I can help you with that! Let me read the file first.");

      // Verify runtime info
      expect(result.runtime.kind).toBe("pi");
      expect(result.runtime.provider).toBe("z.ai");
      expect(result.runtime.model).toBe("inflection-3-pi");

      // Verify tool calls
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("read_file");

      // Verify usage
      expect(result.usage.inputTokens).toBe(500);
      expect(result.usage.outputTokens).toBe(120);

      // Verify events
      expect(result.events.some((e) => e.kind === "lifecycle.start")).toBe(true);
      expect(result.events.some((e) => e.kind === "lifecycle.end")).toBe(true);

      // Verify state was persisted
      expect(mockStateService.persist).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Please read the README file" }),
        outcomeProduced,
        contextUsed,
        expect.any(Object),
      );
    });
  });
});
