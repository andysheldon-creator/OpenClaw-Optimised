import { describe, expect, test } from "vitest";
import {
  clearAgentRunContext,
  emitAgentEvent,
  getAgentEventStats,
  getAgentRunContext,
  onAgentEvent,
  pruneOrphanedSeqByRun,
  registerAgentRunContext,
  resetAgentRunContextForTest,
} from "./agent-events.js";

describe("agent-events sequencing", () => {
  test("stores and clears run context", async () => {
    resetAgentRunContextForTest();
    registerAgentRunContext("run-1", { sessionKey: "main" });
    expect(getAgentRunContext("run-1")?.sessionKey).toBe("main");
    clearAgentRunContext("run-1");
    expect(getAgentRunContext("run-1")).toBeUndefined();
  });

  test("maintains monotonic seq per runId", async () => {
    const seen: Record<string, number[]> = {};
    const stop = onAgentEvent((evt) => {
      const list = seen[evt.runId] ?? [];
      seen[evt.runId] = list;
      list.push(evt.seq);
    });

    emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
    emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });
    emitAgentEvent({ runId: "run-2", stream: "lifecycle", data: {} });
    emitAgentEvent({ runId: "run-1", stream: "lifecycle", data: {} });

    stop();

    expect(seen["run-1"]).toEqual([1, 2, 3]);
    expect(seen["run-2"]).toEqual([1]);
  });

  test("preserves compaction ordering on the event bus", async () => {
    const phases: Array<string> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== "run-1") {
        return;
      }
      if (evt.stream !== "compaction") {
        return;
      }
      if (typeof evt.data?.phase === "string") {
        phases.push(evt.data.phase);
      }
    });

    emitAgentEvent({ runId: "run-1", stream: "compaction", data: { phase: "start" } });
    emitAgentEvent({
      runId: "run-1",
      stream: "compaction",
      data: { phase: "end", willRetry: false },
    });

    stop();

    expect(phases).toEqual(["start", "end"]);
  });

  test("clearAgentRunContext also clears seqByRun entry", () => {
    resetAgentRunContextForTest();

    // Register context and emit events (creates seqByRun entry)
    registerAgentRunContext("run-leak-test", { sessionKey: "main" });
    emitAgentEvent({ runId: "run-leak-test", stream: "lifecycle", data: { phase: "start" } });
    emitAgentEvent({ runId: "run-leak-test", stream: "lifecycle", data: { phase: "end" } });

    const statsBefore = getAgentEventStats();
    expect(statsBefore.seqByRunSize).toBeGreaterThan(0);
    expect(statsBefore.runContextSize).toBeGreaterThan(0);

    // Clear context should also clear seqByRun
    clearAgentRunContext("run-leak-test");

    const statsAfter = getAgentEventStats();
    expect(statsAfter.seqByRunSize).toBe(0);
    expect(statsAfter.runContextSize).toBe(0);
  });

  test("pruneOrphanedSeqByRun removes entries without context", () => {
    resetAgentRunContextForTest();

    // Create orphaned seqByRun entries by emitting events without registering context
    emitAgentEvent({ runId: "orphan-1", stream: "lifecycle", data: {} });
    emitAgentEvent({ runId: "orphan-2", stream: "lifecycle", data: {} });

    // Create a proper entry with context
    registerAgentRunContext("valid-run", { sessionKey: "main" });
    emitAgentEvent({ runId: "valid-run", stream: "lifecycle", data: {} });

    const statsBefore = getAgentEventStats();
    expect(statsBefore.seqByRunSize).toBe(3);
    expect(statsBefore.runContextSize).toBe(1);

    // Prune should remove orphaned entries
    const pruned = pruneOrphanedSeqByRun();
    expect(pruned).toBe(2);

    const statsAfter = getAgentEventStats();
    expect(statsAfter.seqByRunSize).toBe(1);
    expect(statsAfter.runContextSize).toBe(1);
  });
});
