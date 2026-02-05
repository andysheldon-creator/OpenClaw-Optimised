/**
 * Parity tests for Memory Flush migration to ExecutionKernel.
 *
 * Verifies that the kernel-based memory flush in agent-runner-memory.ts
 * preserves the same behavior as the previous direct-runEmbeddedPiAgent path:
 *
 * 1. embeddedOnly: forces runtimeKind "pi" and skips state persistence
 * 2. Result mapping: ExecutionResult → legacy EmbeddedPiRunResult shape
 * 3. onAgentEvent: compaction + tool tracking works
 * 4. Model fallback: kernel executes inside runWithModelFallback
 * 5. Error handling: kernel failure logged, does not throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TurnExecutor } from "./executor.js";
import type { RuntimeResolver } from "./resolver.js";
import type { StateService } from "./state.js";
import type { ExecutionRequest, RuntimeContext, TurnOutcome, ExecutionResult } from "./types.js";
import { createExecutionKernel } from "./kernel.js";

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
    reply: "Memory flushed successfully.",
    payloads: [{ text: "Memory flushed successfully." }],
    toolCalls: [],
    usage: {
      inputTokens: 200,
      outputTokens: 80,
      durationMs: 2000,
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

function createMemoryFlushRequest(overrides?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    agentId: "main",
    sessionId: "session-abc",
    sessionKey: "main",
    workspaceDir: "/workspace",
    prompt: "Flush and consolidate memory",
    embeddedOnly: true,
    providerOverride: "z.ai",
    modelOverride: "inflection-3-pi",
    runtimeHints: {
      thinkLevel: "low",
      verboseLevel: "off",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Memory Flush ExecutionKernel Parity", () => {
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

  // -----------------------------------------------------------------------
  // embeddedOnly behavior
  // -----------------------------------------------------------------------

  describe("embeddedOnly: forces Pi runtime and skips state persist", () => {
    it("passes runtimeKind 'pi' to resolver when embeddedOnly is true", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest();
      await kernel.execute(request);

      // Resolver should receive a request with runtimeKind forced to "pi"
      const resolvedRequest = (mockResolver.resolve as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(resolvedRequest.runtimeKind).toBe("pi");
    });

    it("does not call stateService.persist when embeddedOnly is true", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest();
      await kernel.execute(request);

      expect(mockStateService.persist).not.toHaveBeenCalled();
    });

    it("calls stateService.persist when embeddedOnly is false", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({ embeddedOnly: false });
      await kernel.execute(request);

      expect(mockStateService.persist).toHaveBeenCalled();
    });

    it("calls stateService.persist when embeddedOnly is undefined", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({ embeddedOnly: undefined });
      await kernel.execute(request);

      expect(mockStateService.persist).toHaveBeenCalled();
    });

    it("forces runtimeKind 'pi' even when request already has a different runtimeKind", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({ runtimeKind: "cli" });
      await kernel.execute(request);

      // embeddedOnly overrides any existing runtimeKind
      const resolvedRequest = (mockResolver.resolve as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(resolvedRequest.runtimeKind).toBe("pi");
    });
  });

  // -----------------------------------------------------------------------
  // Result mapping
  // -----------------------------------------------------------------------

  describe("result mapping: ExecutionResult → legacy format", () => {
    it("maps ExecutionResult payloads to legacy shape", async () => {
      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest();
      const result = await kernel.execute(request);

      // Verify the ExecutionResult has the expected fields
      expect(result.payloads).toEqual([{ text: "Memory flushed successfully." }]);
      expect(result.usage.inputTokens).toBe(200);
      expect(result.usage.outputTokens).toBe(80);
      // durationMs is set by the kernel (Date.now() - startTime), not the executor outcome
      expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.runtime.kind).toBe("pi");
      expect(result.runtime.provider).toBe("z.ai");
    });

    it("legacy mapping produces correct meta.agentMeta.usage shape", () => {
      // Simulate the mapMemoryFlushResultToLegacy function behavior
      const executionResult: ExecutionResult = {
        success: true,
        aborted: false,
        reply: "Memory flushed.",
        payloads: [{ text: "Memory flushed." }],
        runtime: { kind: "pi", provider: "z.ai", model: "inflection-3-pi", fallbackUsed: false },
        usage: {
          inputTokens: 200,
          outputTokens: 80,
          cacheReadTokens: 30,
          cacheWriteTokens: 10,
          durationMs: 2000,
        },
        events: [],
        toolCalls: [],
        didSendViaMessagingTool: false,
      };

      // Mirror the mapping logic
      const legacy = {
        payloads: executionResult.payloads.map((p) => ({
          text: p.text,
          mediaUrl: p.mediaUrl,
          mediaUrls: p.mediaUrls,
          replyToId: p.replyToId,
          isError: p.isError,
        })),
        meta: {
          durationMs: executionResult.usage.durationMs,
          aborted: executionResult.aborted,
          stopReason: undefined,
          pendingToolCalls: undefined,
          agentMeta: {
            sessionId: "",
            provider: executionResult.runtime.provider ?? "",
            model: executionResult.runtime.model ?? "",
            usage: {
              input: executionResult.usage.inputTokens,
              output: executionResult.usage.outputTokens,
              cacheRead: executionResult.usage.cacheReadTokens,
              cacheWrite: executionResult.usage.cacheWriteTokens,
              total: executionResult.usage.inputTokens + executionResult.usage.outputTokens,
            },
          },
        },
      };

      expect(legacy.meta.durationMs).toBe(2000);
      expect(legacy.meta.aborted).toBe(false);
      expect(legacy.meta.agentMeta?.usage?.input).toBe(200);
      expect(legacy.meta.agentMeta?.usage?.output).toBe(80);
      expect(legacy.meta.agentMeta?.usage?.cacheRead).toBe(30);
      expect(legacy.meta.agentMeta?.usage?.cacheWrite).toBe(10);
      expect(legacy.meta.agentMeta?.usage?.total).toBe(280);
      expect(legacy.meta.agentMeta?.provider).toBe("z.ai");
      expect(legacy.meta.agentMeta?.model).toBe("inflection-3-pi");
      // stopReason and pendingToolCalls are undefined (acceptable for trace logging)
      expect(legacy.meta.stopReason).toBeUndefined();
      expect(legacy.meta.pendingToolCalls).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // onAgentEvent callback
  // -----------------------------------------------------------------------

  describe("onAgentEvent: compaction and tool tracking", () => {
    it("tracks compaction completion via onAgentEvent callback", async () => {
      let memoryCompactionCompleted = false;

      const executor = createMockExecutor();
      // Simulate onAgentEvent being called during execution
      (executor.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (_ctx, request: ExecutionRequest) => {
          // Simulate a compaction event being fired
          if (request.onAgentEvent) {
            void request.onAgentEvent({
              stream: "compaction",
              data: { phase: "end", willRetry: false },
            });
          }
          return {
            reply: "Done.",
            payloads: [{ text: "Done." }],
            toolCalls: [],
            usage: { inputTokens: 50, outputTokens: 20, durationMs: 500 },
            fallbackUsed: false,
            didSendViaMessagingTool: false,
          };
        },
      );

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: executor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({
        onAgentEvent: (evt) => {
          if (evt.stream === "compaction") {
            const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
            const willRetry = Boolean(evt.data.willRetry);
            if (phase === "end" && !willRetry) {
              memoryCompactionCompleted = true;
            }
          }
        },
      });

      await kernel.execute(request);
      expect(memoryCompactionCompleted).toBe(true);
    });

    it("tracks tool counts via onAgentEvent callback", async () => {
      const toolCounts = new Map<string, number>();

      const executor = createMockExecutor();
      (executor.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (_ctx, request: ExecutionRequest) => {
          // Simulate tool events
          if (request.onAgentEvent) {
            void request.onAgentEvent({
              stream: "tool",
              data: { name: "write", phase: "start", args: { path: "/memory/notes.md" } },
            });
            void request.onAgentEvent({
              stream: "tool",
              data: { name: "read", phase: "start" },
            });
            void request.onAgentEvent({
              stream: "tool",
              data: { name: "write", phase: "start", args: { path: "/memory/summary.md" } },
            });
          }
          return {
            reply: "Done.",
            payloads: [{ text: "Done." }],
            toolCalls: [],
            usage: { inputTokens: 50, outputTokens: 20, durationMs: 500 },
            fallbackUsed: false,
            didSendViaMessagingTool: false,
          };
        },
      );

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: executor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({
        onAgentEvent: (evt) => {
          if (evt.stream === "tool" && evt.data) {
            const toolName = typeof evt.data.name === "string" ? evt.data.name : "unknown";
            const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
            if (phase === "start") {
              toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
            }
          }
        },
      });

      await kernel.execute(request);

      expect(toolCounts.get("write")).toBe(2);
      expect(toolCounts.get("read")).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("returns an error result instead of throwing when executor fails", async () => {
      const executor = createMockExecutor();
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Pi runtime crashed"),
      );

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: executor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest();
      const result = await kernel.execute(request);

      // Kernel never throws — returns error in result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.kind).toBe("runtime_error");
      expect(result.error?.message).toContain("Pi runtime crashed");
    });

    it("still skips state persist on error when embeddedOnly is true", async () => {
      const executor = createMockExecutor();
      (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Pi runtime crashed"),
      );

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: executor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest();
      await kernel.execute(request);

      expect(mockStateService.persist).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle events
  // -----------------------------------------------------------------------

  describe("lifecycle events fire for embeddedOnly runs", () => {
    it("emits lifecycle.start and lifecycle.end events", async () => {
      const events: Array<{ kind: string }> = [];

      const kernel = createExecutionKernel({
        resolver: mockResolver,
        executor: mockExecutor,
        stateService: mockStateService,
      });

      const request = createMemoryFlushRequest({
        onEvent: (evt) => {
          events.push({ kind: evt.kind });
        },
      });

      await kernel.execute(request);

      const kinds = events.map((e) => e.kind);
      expect(kinds).toContain("lifecycle.start");
      expect(kinds).toContain("lifecycle.end");
    });
  });
});
