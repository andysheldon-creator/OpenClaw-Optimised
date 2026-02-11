import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

describe("subscribeEmbeddedPiSession safeguards", () => {
  const createMockSession = () =>
    ({
      subscribe: vi.fn(() => vi.fn()),
    }) as unknown as AgentSession;

  it("aborts when max turns exceeded", async () => {
    const session = createMockSession();
    const onAbort = vi.fn();
    const onToolResult = vi.fn();

    const subscription = subscribeEmbeddedPiSession({
      session,
      runId: "test-run",
      onToolResult,
      onAbort,
      safeguards: { maxTurns: 2, loopDetection: false },
    });

    const handler = (session.subscribe as any).mock.calls[0][0];

    // Turn 1
    handler({ type: "tool_execution_start", toolName: "tool1", toolCallId: "1", args: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(onAbort).not.toHaveBeenCalled();

    // Turn 2
    handler({ type: "tool_execution_start", toolName: "tool2", toolCallId: "2", args: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(onAbort).not.toHaveBeenCalled();

    // Turn 3 (Exceeds maxTurns 2)
    handler({ type: "tool_execution_start", toolName: "tool3", toolCallId: "3", args: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(onAbort).toHaveBeenCalledWith(expect.stringContaining("Exceeded maximum of 2 turns"));
  });

  it("aborts when loop detected", async () => {
    const session = createMockSession();
    const onAbort = vi.fn();
    const onToolResult = vi.fn();

    const subscription = subscribeEmbeddedPiSession({
      session,
      runId: "test-run",
      onToolResult,
      onAbort,
      safeguards: { maxTurns: 10, loopDetection: true },
    });

    const handler = (session.subscribe as any).mock.calls[0][0];

    // Repeated tool usage
    const toolCall = { type: "tool_execution_start", toolName: "ls", args: { path: "." } };

    handler({ ...toolCall, toolCallId: "1" });
    await new Promise((r) => setTimeout(r, 0));
    handler({ ...toolCall, toolCallId: "2" });
    await new Promise((r) => setTimeout(r, 0));
    handler({ ...toolCall, toolCallId: "3" }); // 3rd repeat -> Abort
    await new Promise((r) => setTimeout(r, 0));

    expect(onAbort).toHaveBeenCalledWith(expect.stringContaining("Loop detected"));
  });

  it("does not abort for non-repeating tools", () => {
    const session = createMockSession();
    const onAbort = vi.fn();
    const onToolResult = vi.fn(); // Needed for emitToolSummary to be called

    const subscription = subscribeEmbeddedPiSession({
      session,
      runId: "test-run",
      onToolResult,
      onAbort,
      safeguards: { maxTurns: 10, loopDetection: true },
    });

    const handler = (session.subscribe as any).mock.calls[0][0];

    handler({
      type: "tool_execution_start",
      toolName: "ls",
      toolCallId: "1",
      args: { path: "dir1" },
    });
    handler({
      type: "tool_execution_start",
      toolName: "ls",
      toolCallId: "2",
      args: { path: "dir2" },
    });
    handler({
      type: "tool_execution_start",
      toolName: "ls",
      toolCallId: "3",
      args: { path: "dir1" },
    }); // Repeat, but not consecutive

    expect(onAbort).not.toHaveBeenCalled();
  });

  it("aborts when loop detected with read tool failures", async () => {
    const session = createMockSession();
    const onAbort = vi.fn();
    const onToolResult = vi.fn();

    // Simulate 5 repeated read calls that fail
    // We must manually trigger the subscription handler logic
    const subscription = subscribeEmbeddedPiSession({
      session,
      runId: "test-run",
      onToolResult,
      onAbort,
      safeguards: { maxTurns: 10, loopDetection: true },
    });

    // Re-fetch handler as subscribing creates a new one
    const actualHandler = (session.subscribe as any).mock.calls[0][0];

    for (let i = 0; i < 5; i++) {
      actualHandler({
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: `call-${i}`,
        args: { path: "/non-existent.txt" },
      });
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(onAbort).toHaveBeenCalledWith(expect.stringContaining("Loop detected"));
  });
});
