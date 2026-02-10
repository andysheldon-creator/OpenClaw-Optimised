import { describe, it, expect, vi } from "vitest";
import {
  clearAgentRunContext,
  emitAgentEvent,
  getAgentEventStats,
  pruneOrphanedSeqByRun,
  registerAgentRunContext,
  resetAgentRunContextForTest,
} from "../infra/agent-events.js";
import {
  createAgentEventHandler,
  createChatRunState,
  createToolEventRecipientRegistry,
} from "./server-chat.js";

describe("agentRunSeq cleanup on lifecycle end", () => {
  it("deletes runId from agentRunSeq when lifecycle phase is end", () => {
    const broadcast = vi.fn();
    const broadcastToConnIds = vi.fn();
    const nodeSendToSession = vi.fn();
    const clearAgentRunContextMock = vi.fn();
    const agentRunSeq = new Map<string, number>();
    const chatRunState = createChatRunState();
    const toolEventRecipients = createToolEventRecipientRegistry();

    // Pre-populate agentRunSeq to simulate an active run
    agentRunSeq.set("run-1", 5);
    agentRunSeq.set("run-2", 3);

    const handler = createAgentEventHandler({
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      agentRunSeq,
      chatRunState,
      resolveSessionKeyForRun: () => "session-1",
      clearAgentRunContext: clearAgentRunContextMock,
      toolEventRecipients,
    });

    // Emit lifecycle end event for run-1
    handler({
      runId: "run-1",
      seq: 6,
      stream: "lifecycle",
      ts: Date.now(),
      data: { phase: "end" },
    });

    // Verify agentRunSeq entry was deleted for run-1 but not run-2
    expect(agentRunSeq.has("run-1")).toBe(false);
    expect(agentRunSeq.has("run-2")).toBe(true);
    // Verify clearAgentRunContext was called
    expect(clearAgentRunContextMock).toHaveBeenCalledWith("run-1");
  });

  it("deletes runId from agentRunSeq when lifecycle phase is error", () => {
    const broadcast = vi.fn();
    const broadcastToConnIds = vi.fn();
    const nodeSendToSession = vi.fn();
    const clearAgentRunContextMock = vi.fn();
    const agentRunSeq = new Map<string, number>();
    const chatRunState = createChatRunState();
    const toolEventRecipients = createToolEventRecipientRegistry();

    agentRunSeq.set("run-error", 10);

    const handler = createAgentEventHandler({
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      agentRunSeq,
      chatRunState,
      resolveSessionKeyForRun: () => "session-1",
      clearAgentRunContext: clearAgentRunContextMock,
      toolEventRecipients,
    });

    handler({
      runId: "run-error",
      seq: 11,
      stream: "lifecycle",
      ts: Date.now(),
      data: { phase: "error", error: "test error" },
    });

    expect(agentRunSeq.has("run-error")).toBe(false);
    expect(clearAgentRunContextMock).toHaveBeenCalledWith("run-error");
  });

  it("does not delete agentRunSeq entry for non-terminal lifecycle phases", () => {
    const broadcast = vi.fn();
    const broadcastToConnIds = vi.fn();
    const nodeSendToSession = vi.fn();
    const clearAgentRunContextMock = vi.fn();
    const agentRunSeq = new Map<string, number>();
    const chatRunState = createChatRunState();
    const toolEventRecipients = createToolEventRecipientRegistry();

    agentRunSeq.set("run-active", 2);

    const handler = createAgentEventHandler({
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      agentRunSeq,
      chatRunState,
      resolveSessionKeyForRun: () => "session-1",
      clearAgentRunContext: clearAgentRunContextMock,
      toolEventRecipients,
    });

    // Emit lifecycle start event (non-terminal)
    handler({
      runId: "run-active",
      seq: 3,
      stream: "lifecycle",
      ts: Date.now(),
      data: { phase: "start" },
    });

    // Entry should still exist
    expect(agentRunSeq.has("run-active")).toBe(true);
    expect(clearAgentRunContextMock).not.toHaveBeenCalled();
  });
});

describe("seqByRun memory leak fix", () => {
  it("clearAgentRunContext cleans up seqByRun entries", () => {
    resetAgentRunContextForTest();

    // Emit events which creates seqByRun entries
    registerAgentRunContext("test-run", { sessionKey: "test" });
    emitAgentEvent({ runId: "test-run", stream: "lifecycle", data: {} });

    const before = getAgentEventStats();
    expect(before.seqByRunSize).toBe(1);

    // Clearing context should also clear seqByRun
    clearAgentRunContext("test-run");

    const after = getAgentEventStats();
    expect(after.seqByRunSize).toBe(0);
  });

  it("pruneOrphanedSeqByRun removes orphaned entries", () => {
    resetAgentRunContextForTest();

    // Create orphans (events without registered context)
    emitAgentEvent({ runId: "orphan-a", stream: "lifecycle", data: {} });
    emitAgentEvent({ runId: "orphan-b", stream: "lifecycle", data: {} });

    // Create valid entry
    registerAgentRunContext("valid", { sessionKey: "s" });
    emitAgentEvent({ runId: "valid", stream: "lifecycle", data: {} });

    expect(getAgentEventStats().seqByRunSize).toBe(3);

    const pruned = pruneOrphanedSeqByRun();
    expect(pruned).toBe(2);
    expect(getAgentEventStats().seqByRunSize).toBe(1);
  });
});
