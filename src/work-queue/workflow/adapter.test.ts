import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkerConfig } from "../../config/types.agents.js";
import type { WorkItem } from "../types.js";
import type { GatewayCallFn, WorkflowLogger, WorkflowState } from "./types.js";
import { MemoryWorkQueueBackend } from "../backend/memory-backend.js";
import { WorkQueueStore } from "../store.js";
import { WorkflowWorkerAdapter } from "./adapter.js";

// Shared mock for executeWorkflow, captured by the factory closure.
const mockExecuteWorkflow = vi.fn();

vi.mock("./engine.js", () => {
  // Return a real class so `new WorkerWorkflowEngine(...)` works.
  class MockWorkflowEngine {
    executeWorkflow = mockExecuteWorkflow;
  }
  return { WorkerWorkflowEngine: MockWorkflowEngine };
});

function makeSuccessState(itemId: string): WorkflowState {
  return {
    phase: "completed",
    workItemId: itemId,
    workItemTitle: "test",
    reviewIterations: [],
    discoveryResults: [],
    startedAt: Date.now() - 100,
    completedAt: Date.now(),
    executionProgress: { totalNodes: 1, completedNodes: 1, failedNodes: 0 },
  };
}

function makeFailedState(itemId: string, error?: string): WorkflowState {
  return {
    phase: "failed",
    workItemId: itemId,
    workItemTitle: "test",
    reviewIterations: [],
    discoveryResults: [],
    startedAt: Date.now() - 100,
    completedAt: Date.now(),
    error: error ?? "workflow failed",
    executionProgress: { totalNodes: 1, completedNodes: 0, failedNodes: 1 },
  };
}

const mockLog: WorkflowLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockCallGateway = vi.fn().mockResolvedValue({});

describe("WorkflowWorkerAdapter", () => {
  let store: WorkQueueStore;

  beforeEach(() => {
    vi.clearAllMocks();
    const backend = new MemoryWorkQueueBackend();
    store = new WorkQueueStore(backend);
  });

  function makeAdapter(configOverrides?: Partial<WorkerConfig>) {
    const config: WorkerConfig = {
      enabled: true,
      pollIntervalMs: 30,
      ...configOverrides,
    };
    return new WorkflowWorkerAdapter({
      agentId: "test-agent",
      config,
      deps: {
        store,
        callGateway: mockCallGateway as GatewayCallFn,
        log: mockLog,
      },
    });
  }

  it("starts and stops cleanly", async () => {
    const adapter = makeAdapter();
    expect(adapter.isRunning).toBe(false);

    await adapter.start();
    expect(adapter.isRunning).toBe(true);

    await adapter.stop();
    expect(adapter.isRunning).toBe(false);
  });

  it("does not double-start", async () => {
    const adapter = makeAdapter();
    await adapter.start();
    await adapter.start(); // should be a no-op
    expect(adapter.isRunning).toBe(true);
    await adapter.stop();
  });

  it("processes a work item via the workflow engine", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Workflow task",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter();
    await adapter.start();
    await new Promise((r) => setTimeout(r, 150));
    await adapter.stop();

    expect(mockExecuteWorkflow).toHaveBeenCalled();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.lastOutcome).toBe("success");
  });

  it("marks item failed when workflow fails", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Failing workflow",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeFailedState(item.id, "plan phase crashed"));

    const adapter = makeAdapter();
    await adapter.start();
    await new Promise((r) => setTimeout(r, 150));
    await adapter.stop();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.error?.message).toContain("plan phase crashed");
  });

  it("retries when maxRetries > 0 and not exhausted", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Retryable workflow",
      maxRetries: 2,
    });

    // First call fails, second succeeds.
    mockExecuteWorkflow
      .mockResolvedValueOnce(makeFailedState(item.id, "transient error"))
      .mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter();
    await adapter.start();
    await new Promise((r) => setTimeout(r, 300));
    await adapter.stop();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.lastOutcome).toBe("success");
  });

  it("filters by workstream", async () => {
    await store.createItem({
      agentId: "test-agent",
      title: "Alpha task",
      workstream: "alpha",
    });
    await store.createItem({
      agentId: "test-agent",
      title: "Beta task",
      workstream: "beta",
    });

    mockExecuteWorkflow.mockImplementation(async (item: WorkItem) => makeSuccessState(item.id));

    const adapter = makeAdapter({ workstreams: ["beta"] });
    await adapter.start();
    await new Promise((r) => setTimeout(r, 200));
    await adapter.stop();

    const items = await store.listItems({ queueId: "test-agent" });
    const alpha = items.find((i) => i.workstream === "alpha");
    const beta = items.find((i) => i.workstream === "beta");

    expect(beta?.status).toBe("completed");
    expect(alpha?.status).toBe("pending");
  });

  it("claims unscoped items when no workstreams are configured", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Workflow unscoped task",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter();
    await adapter.start();
    await new Promise((r) => setTimeout(r, 150));
    await adapter.stop();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("completed");
  });

  it("treats blank workstream entries as unscoped", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Workflow unscoped task with blank workstream config",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter({ workstreams: ["", "   "] });
    await adapter.start();
    await new Promise((r) => setTimeout(r, 150));
    await adapter.stop();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("completed");
  });

  it("claims from configured queueId when provided", async () => {
    const item = await store.createItem({
      agentId: "shared-queue",
      title: "Workflow queue override task",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter({ queueId: "shared-queue" });
    await adapter.start();
    await new Promise((r) => setTimeout(r, 200));
    await adapter.stop();

    const updated = await store.getItem(item.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.assignedTo?.agentId).toBe("test-agent");
  });

  it("exposes config and metrics", () => {
    const config: WorkerConfig = { enabled: true, pollIntervalMs: 100, thinking: "high" };
    const adapter = new WorkflowWorkerAdapter({
      agentId: "test-agent",
      config,
      deps: {
        store,
        callGateway: mockCallGateway as GatewayCallFn,
        log: mockLog,
      },
    });

    expect(adapter.getConfig()).toBe(config);
    expect(adapter.agentId).toBe("test-agent");
    expect(adapter.currentWorkItemId).toBeNull();

    const metrics = adapter.getMetrics();
    expect(metrics.agentId).toBe("test-agent");
    expect(metrics.totalProcessed).toBe(0);
  });

  it("records execution after processing", async () => {
    const item = await store.createItem({
      agentId: "test-agent",
      title: "Execution recording test",
    });

    mockExecuteWorkflow.mockResolvedValueOnce(makeSuccessState(item.id));

    const adapter = makeAdapter();
    await adapter.start();
    await new Promise((r) => setTimeout(r, 150));
    await adapter.stop();

    const executions = await store.listExecutions(item.id);
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[0]?.outcome).toBe("success");
    expect(executions[0]?.sessionKey).toContain("workflow:test-agent");
  });
});
