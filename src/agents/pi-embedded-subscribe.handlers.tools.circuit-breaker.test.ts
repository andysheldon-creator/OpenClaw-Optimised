import { describe, expect, it, vi } from "vitest";
import { handleToolExecutionEnd } from "./pi-embedded-subscribe.handlers.tools.js";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";

function makeCtx(overrides?: {
  onConsecutiveToolErrors?: (count: number, lastError: string | undefined) => boolean;
  consecutiveToolErrorThreshold?: number;
}): EmbeddedPiSubscribeContext {
  return {
    params: {
      session: {} as any,
      runId: "test-run",
      onConsecutiveToolErrors: overrides?.onConsecutiveToolErrors,
      consecutiveToolErrorThreshold: overrides?.consecutiveToolErrorThreshold,
    },
    state: {
      assistantTexts: [],
      toolMetas: [],
      toolMetaById: new Map(),
      toolSummaryById: new Set(),
      lastToolError: undefined,
      consecutiveToolErrors: 0,
      blockReplyBreak: "text_end",
      reasoningMode: "off",
      includeReasoning: false,
      shouldEmitPartialReplies: false,
      streamReasoning: false,
      deltaBuffer: "",
      blockBuffer: "",
      blockState: { thinking: false, final: false, inlineCode: { inside: false } },
      partialBlockState: { thinking: false, final: false, inlineCode: { inside: false } },
      emittedAssistantUpdate: false,
      assistantMessageIndex: 0,
      lastAssistantTextMessageIndex: -1,
      assistantTextBaseline: 0,
      suppressBlockChunks: false,
      compactionInFlight: false,
      pendingCompactionRetry: 0,
      compactionRetryPromise: null,
      messagingToolSentTexts: [],
      messagingToolSentTextsNormalized: [],
      messagingToolSentTargets: [],
      pendingMessagingTexts: new Map(),
      pendingMessagingTargets: new Map(),
    },
    log: { debug: vi.fn(), warn: vi.fn() },
    blockChunker: null,
    shouldEmitToolResult: () => false,
    shouldEmitToolOutput: () => false,
    emitToolSummary: vi.fn(),
    emitToolOutput: vi.fn(),
    stripBlockTags: (text: string) => text,
    emitBlockChunk: vi.fn(),
    flushBlockReplyBuffer: vi.fn(),
    emitReasoningStream: vi.fn(),
    consumeReplyDirectives: () => null,
    consumePartialReplyDirectives: () => null,
    resetAssistantMessageState: vi.fn(),
    resetForCompactionRetry: vi.fn(),
    finalizeAssistantTexts: vi.fn(),
    trimMessagingToolSent: vi.fn(),
    ensureCompactionPromise: vi.fn(),
    noteCompactionRetry: vi.fn(),
    resolveCompactionRetry: vi.fn(),
    maybeResolveCompactionWait: vi.fn(),
    recordAssistantUsage: vi.fn(),
    incrementCompactionCount: vi.fn(),
    getUsageTotals: () => undefined,
    getCompactionCount: () => 0,
  } as unknown as EmbeddedPiSubscribeContext;
}

function makeErrorEvent(toolName = "exec") {
  return {
    type: "tool_execution_end" as const,
    toolName,
    toolCallId: `call-${Math.random().toString(36).slice(2)}`,
    isError: true,
    result: [{ type: "text" as const, text: "Error: something failed" }],
  };
}

function makeSuccessEvent(toolName = "exec") {
  return {
    type: "tool_execution_end" as const,
    toolName,
    toolCallId: `call-${Math.random().toString(36).slice(2)}`,
    isError: false,
    result: [{ type: "text" as const, text: "Success" }],
  };
}

describe("tool execution circuit breaker", () => {
  it("should increment consecutiveToolErrors on error", () => {
    const ctx = makeCtx();
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(ctx.state.consecutiveToolErrors).toBe(1);
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(ctx.state.consecutiveToolErrors).toBe(2);
  });

  it("should reset consecutiveToolErrors on success", () => {
    const ctx = makeCtx();
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(ctx.state.consecutiveToolErrors).toBe(2);
    handleToolExecutionEnd(ctx, makeSuccessEvent());
    expect(ctx.state.consecutiveToolErrors).toBe(0);
  });

  it("should trigger callback at threshold (default 3)", () => {
    const onConsecutiveToolErrors = vi.fn().mockReturnValue(true);
    const ctx = makeCtx({ onConsecutiveToolErrors });

    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(onConsecutiveToolErrors).not.toHaveBeenCalled();

    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(onConsecutiveToolErrors).toHaveBeenCalledTimes(1);
    expect(onConsecutiveToolErrors.mock.calls[0][0]).toBe(3);
  });

  it("should not trigger callback below threshold", () => {
    const onConsecutiveToolErrors = vi.fn().mockReturnValue(true);
    const ctx = makeCtx({ onConsecutiveToolErrors });

    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(onConsecutiveToolErrors).not.toHaveBeenCalled();
  });

  it("should respect custom threshold", () => {
    const onConsecutiveToolErrors = vi.fn().mockReturnValue(true);
    const ctx = makeCtx({ onConsecutiveToolErrors, consecutiveToolErrorThreshold: 5 });

    for (let i = 0; i < 4; i++) {
      handleToolExecutionEnd(ctx, makeErrorEvent());
    }
    expect(onConsecutiveToolErrors).not.toHaveBeenCalled();

    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(onConsecutiveToolErrors).toHaveBeenCalledTimes(1);
    expect(onConsecutiveToolErrors.mock.calls[0][0]).toBe(5);
  });

  it("should not trigger if no callback provided", () => {
    const ctx = makeCtx(); // no callback
    // Should not throw
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    expect(ctx.state.consecutiveToolErrors).toBe(3);
  });

  it("should reset counter after success breaks the streak", () => {
    const onConsecutiveToolErrors = vi.fn().mockReturnValue(true);
    const ctx = makeCtx({ onConsecutiveToolErrors });

    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeSuccessEvent()); // reset
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    // Only 2 consecutive errors — should not trigger
    expect(onConsecutiveToolErrors).not.toHaveBeenCalled();
  });

  it("should log warning when circuit breaker triggers", () => {
    const ctx = makeCtx({
      onConsecutiveToolErrors: () => true,
    });

    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());
    handleToolExecutionEnd(ctx, makeErrorEvent());

    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Circuit breaker"),
    );
  });
});
