import { describe, it, expect, beforeEach } from "vitest";
import { MemoryWorkQueueBackend } from "./backend/memory-backend.js";
import { recoverOrphanedWorkItems } from "./recovery.js";
import { WorkQueueStore } from "./store.js";

describe("recoverOrphanedWorkItems", () => {
  let store: WorkQueueStore;

  beforeEach(async () => {
    const backend = new MemoryWorkQueueBackend();
    store = new WorkQueueStore(backend);
    await store.initialize();
  });

  it("resets in_progress items to pending", async () => {
    await store.createItem({
      agentId: "test-agent",
      title: "Test Task",
      status: "in_progress",
      assignedTo: { sessionKey: "agent:test:subagent:dead-uuid", agentId: "test-agent" },
      startedAt: new Date().toISOString(),
    });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0].status).toBe("pending");
    expect(result.recovered[0].assignedTo).toBeUndefined();
    expect(result.recovered[0].startedAt).toBeUndefined();
    expect(result.recovered[0].statusReason).toContain("Recovered after gateway restart");
    expect(result.recovered[0].statusReason).toContain("dead-uuid");
    expect(result.failed).toHaveLength(0);
  });

  it("leaves pending and completed items untouched", async () => {
    await store.createItem({ agentId: "test-agent", title: "Pending Task" });
    await store.createItem({
      agentId: "test-agent",
      title: "Done Task",
      status: "completed",
    });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    const allItems = await store.listItems({});
    const statuses = allItems.map((i) => i.status);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("completed");
  });

  it("recovers multiple in_progress items across queues", async () => {
    await store.createItem({
      agentId: "agent-a",
      title: "Task A",
      status: "in_progress",
      assignedTo: { agentId: "agent-a" },
    });
    await store.createItem({
      agentId: "agent-b",
      title: "Task B",
      status: "in_progress",
      assignedTo: { sessionKey: "agent:b:subagent:xyz" },
    });
    // This pending item should not be recovered
    await store.createItem({ agentId: "agent-c", title: "Task C" });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(2);
    expect(result.recovered.every((i) => i.status === "pending")).toBe(true);
    expect(result.recovered.every((i) => i.assignedTo === undefined)).toBe(true);
    expect(result.failed).toHaveLength(0);
  });

  it("returns empty result when no in_progress items exist", async () => {
    await store.createItem({ agentId: "test-agent", title: "Pending" });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("records the previous assignment in statusReason (agentId fallback)", async () => {
    await store.createItem({
      agentId: "worker-1",
      title: "Agent-only assignment",
      status: "in_progress",
      assignedTo: { agentId: "worker-1" },
    });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0].statusReason).toContain("worker-1");
  });

  it("records 'unknown' when assignedTo is empty", async () => {
    await store.createItem({
      agentId: "orphan-agent",
      title: "No assignment info",
      status: "in_progress",
    });

    const result = await recoverOrphanedWorkItems(store);

    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0].statusReason).toContain("unknown");
  });
});
