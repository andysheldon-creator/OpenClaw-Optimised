import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { guardSessionManager } from "./session-tool-result-guard-wrapper.js";

function assistantToolCall(id: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name: "exec", arguments: {} }],
    stopReason: "toolUse",
  } as AgentMessage;
}

function toolResult(id: string, text: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    content: [{ type: "text", text }],
    isError: false,
  } as AgentMessage;
}

describe("waitForIdle before flush prevents premature synthetic results", () => {
  it("should not flush pending tool results while agent is still executing tools", async () => {
    // Simulates the race condition: a tool call is registered but the tool
    // hasn't finished executing yet. If we flush immediately, we get a
    // synthetic error. If we wait for idle first, the real result arrives.
    const sm = guardSessionManager(SessionManager.inMemory());

    // Assistant makes a tool call (from a retry after overloaded_error)
    sm.appendMessage(assistantToolCall("call_retry_1"));

    // Simulate: tool is still executing (result hasn't arrived yet)
    // If we flush now, we'd get a synthetic error — this is the bug
    const entriesBefore = sm
      .getEntries()
      .filter((e) => e.type === "message")
      .map((e) => (e as { message: AgentMessage }).message);

    // Only the assistant message should exist, no synthetic result yet
    expect(entriesBefore.length).toBe(1);
    expect(entriesBefore[0].role).toBe("assistant");

    // Now the real tool result arrives (tool finished executing)
    sm.appendMessage(toolResult("call_retry_1", "command output here"));

    const entriesAfter = sm
      .getEntries()
      .filter((e) => e.type === "message")
      .map((e) => (e as { message: AgentMessage }).message);

    // Should have assistant + real tool result, no synthetic error
    expect(entriesAfter.length).toBe(2);
    expect(entriesAfter[1].role).toBe("toolResult");
    expect((entriesAfter[1] as { isError?: boolean }).isError).not.toBe(true);
    expect((entriesAfter[1] as { content?: Array<{ text?: string }> }).content?.[0]?.text).toBe(
      "command output here",
    );
  });

  it("flush inserts synthetic error when tool result never arrives", () => {
    // Validates that flush still works correctly for genuinely orphaned tool calls
    const sm = guardSessionManager(SessionManager.inMemory());

    sm.appendMessage(assistantToolCall("call_orphan_1"));

    // Tool never executes — flush should insert synthetic error
    sm.flushPendingToolResults?.();

    const entries = sm
      .getEntries()
      .filter((e) => e.type === "message")
      .map((e) => (e as { message: AgentMessage }).message);

    expect(entries.length).toBe(2);
    expect(entries[1].role).toBe("toolResult");
    expect((entries[1] as { isError?: boolean }).isError).toBe(true);
    expect((entries[1] as { content?: Array<{ text?: string }> }).content?.[0]?.text).toContain(
      "missing tool result",
    );
  });

  it("flush is a no-op after real tool result arrives", () => {
    // If the tool result arrived in time, flush should do nothing
    const sm = guardSessionManager(SessionManager.inMemory());

    sm.appendMessage(assistantToolCall("call_ok_1"));
    sm.appendMessage(toolResult("call_ok_1", "success"));

    // Flush after result already arrived — should be a no-op
    sm.flushPendingToolResults?.();

    const entries = sm
      .getEntries()
      .filter((e) => e.type === "message")
      .map((e) => (e as { message: AgentMessage }).message);

    // Should still be just 2 messages, no extra synthetic result
    expect(entries.length).toBe(2);
    expect(entries[0].role).toBe("assistant");
    expect(entries[1].role).toBe("toolResult");
    expect((entries[1] as { isError?: boolean }).isError).not.toBe(true);
  });
});
