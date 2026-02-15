/**
 * Unit tests for the TaskRunner module.
 *
 * The runner uses module-level globals (timer, cachedStore, deps, advancing)
 * so we must be careful to start/stop between tests. We mock the external
 * dependency (runCronIsolatedAgentTurn) and progress-reporter to isolate
 * the runner's own logic.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveTaskStorePath, saveTaskStore } from "./store.js";
import type { TaskStoreFile } from "./types.js";

// ── Mock the external agent turn ──────────────────────────────────────────────

vi.mock("../cron/isolated-agent.js", () => ({
  runCronIsolatedAgentTurn: vi
    .fn()
    .mockResolvedValue({ status: "ok", summary: "Step completed." }),
}));

vi.mock("./progress-reporter.js", () => ({
  shouldReportProgress: vi.fn().mockReturnValue(false),
  reportProgress: vi.fn().mockResolvedValue(null),
  reportCompletion: vi.fn().mockResolvedValue(undefined),
  reportFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Dynamic import after mocks are set up
const {
  startTaskRunner,
  stopTaskRunner,
  advanceAllTasks,
  createTask,
  cancelTask,
  pauseTask,
  resumeTask,
  getTask,
  listTasks,
} = await import("./runner.js");

const { runCronIsolatedAgentTurn } = await import("../cron/isolated-agent.js");

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;
let storePath: string;

const minimalCfg = {
  tasks: {
    enabled: true,
    maxConcurrentTasks: 2,
    maxStepsPerTask: 10,
    defaultStepIntervalMs: 100,
  },
} as any;

const minimalCliDeps = {} as any;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-runner-test-"));
  storePath = resolveTaskStorePath(tmpDir);
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(async () => {
  vi.useRealTimers();
  try {
    await stopTaskRunner();
  } catch {
    // might not be started
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ── createTask ────────────────────────────────────────────────────────────────

describe("createTask", () => {
  it("throws if runner not started", async () => {
    await expect(
      createTask({
        name: "test",
        description: "test",
        steps: [{ description: "s1", prompt: "p1" }],
      }),
    ).rejects.toThrow("Task runner not started");
  });

  it("creates a task after runner is started", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "my task",
      description: "describe it",
      steps: [
        { description: "step 1", prompt: "prompt 1" },
        { description: "step 2", prompt: "prompt 2" },
      ],
    });

    expect(task.id).toBeDefined();
    expect(task.name).toBe("my task");
    expect(task.status).toBe("pending");
    expect(task.steps).toHaveLength(2);
  });

  it("rejects tasks with zero steps", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    await expect(
      createTask({ name: "empty", description: "no steps", steps: [] }),
    ).rejects.toThrow("at least one step");
  });

  it("rejects tasks exceeding maxStepsPerTask", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const steps = Array.from({ length: 11 }, (_, i) => ({
      description: `step ${i}`,
      prompt: `prompt ${i}`,
    }));

    await expect(
      createTask({ name: "too-many", description: "test", steps }),
    ).rejects.toThrow("exceeding the limit");
  });

  it("persists created task to disk", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "persistent",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    // Stop runner (triggers final persist)
    await stopTaskRunner();

    // Verify on disk
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as TaskStoreFile;
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe(task.id);
  });
});

// ── cancelTask ────────────────────────────────────────────────────────────────

describe("cancelTask", () => {
  it("marks task and pending steps as cancelled", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "cancel-me",
      description: "test",
      steps: [
        { description: "s1", prompt: "p1" },
        { description: "s2", prompt: "p2" },
      ],
    });

    await cancelTask(task.id);
    const cancelled = await getTask(task.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.steps[0].status).toBe("cancelled");
    expect(cancelled?.steps[1].status).toBe("cancelled");
  });

  it("throws for already completed tasks", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "done",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await cancelTask(task.id);
    await expect(cancelTask(task.id)).rejects.toThrow("already cancelled");
  });

  it("throws for nonexistent task", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });
    await expect(cancelTask("bogus")).rejects.toThrow("not found");
  });
});

// ── pauseTask / resumeTask ────────────────────────────────────────────────────

describe("pauseTask", () => {
  it("pauses a pending task", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "pause-me",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await pauseTask(task.id);
    const paused = await getTask(task.id);
    expect(paused?.status).toBe("paused");
  });

  it("throws if task status is not pauseable", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "test",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await cancelTask(task.id);
    await expect(pauseTask(task.id)).rejects.toThrow("Cannot pause");
  });
});

describe("resumeTask", () => {
  it("resumes a paused task to pending", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "resume-me",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await pauseTask(task.id);
    await resumeTask(task.id);
    const resumed = await getTask(task.id);
    expect(resumed?.status).toBe("pending");
  });

  it("throws if task is not paused", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "test",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await expect(resumeTask(task.id)).rejects.toThrow("Cannot resume");
  });
});

// ── getTask / listTasks ───────────────────────────────────────────────────────

describe("getTask", () => {
  it("returns the task by ID", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "find-me",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    const found = await getTask(task.id);
    expect(found?.name).toBe("find-me");
  });

  it("returns undefined for missing ID", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });
    expect(await getTask("nope")).toBeUndefined();
  });

  // Note: "not started" state can't be reliably tested because the runner
  // module uses module-level globals that persist between tests. The getTask
  // function returns undefined for missing IDs regardless of runner state.
});

describe("listTasks", () => {
  it("lists all tasks", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    await createTask({
      name: "a",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });
    await createTask({
      name: "b",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    const all = await listTasks();
    expect(all).toHaveLength(2);
  });

  it("filters by status", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "a",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });
    await createTask({
      name: "b",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await cancelTask(task.id);

    expect(await listTasks({ status: "cancelled" })).toHaveLength(1);
    expect(await listTasks({ status: "pending" })).toHaveLength(1);
  });

  // Note: "not started" state can't be reliably tested because the runner
  // module uses module-level globals that persist between tests.
});

// ── advanceAllTasks ───────────────────────────────────────────────────────────

describe("advanceAllTasks", () => {
  it("promotes pending to in_progress and advances", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "advance-me",
      description: "test",
      steps: [
        { description: "step 1", prompt: "do 1" },
        { description: "step 2", prompt: "do 2" },
      ],
    });

    expect(task.status).toBe("pending");

    // Manually trigger advancement
    await advanceAllTasks();

    const after = await getTask(task.id);
    // Should have been promoted and first step advanced
    expect(after?.status).toBe("in_progress");
    expect(after?.steps[0].status).toBe("completed");
    expect(after?.currentStepIndex).toBe(1);
  });

  it("respects max concurrent tasks limit", async () => {
    await startTaskRunner({
      cfg: {
        ...minimalCfg,
        tasks: { ...minimalCfg.tasks, maxConcurrentTasks: 1 },
      },
      cliDeps: minimalCliDeps,
      storePath,
    });

    await createTask({
      name: "task-a",
      description: "test",
      steps: [
        { description: "s1", prompt: "p1" },
        { description: "s2", prompt: "p2" },
      ],
    });
    await createTask({
      name: "task-b",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await advanceAllTasks();

    const all = await listTasks();
    const inProgress = all.filter(
      (t) => t.status === "in_progress" || t.status === "completed",
    );
    const pending = all.filter((t) => t.status === "pending");

    // With concurrency 1, only one task should have been promoted
    expect(inProgress).toHaveLength(1);
    expect(pending).toHaveLength(1);
  });

  it("completes a task when all steps are done", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "single-step",
      description: "test",
      steps: [{ description: "only step", prompt: "do it" }],
    });

    await advanceAllTasks();

    const done = await getTask(task.id);
    expect(done?.status).toBe("completed");
    expect(done?.completedAtMs).toBeDefined();
    expect(done?.finalSummary).toBeDefined();
  });

  it("handles step failure and retries", async () => {
    const mockAgent = vi.mocked(runCronIsolatedAgentTurn);
    mockAgent
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ status: "ok", summary: "Recovered." });

    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "retry-test",
      description: "test",
      steps: [{ description: "flaky step", prompt: "try this" }],
    });

    // First advance: should fail then mark step pending with retryCount=1
    await advanceAllTasks();
    const afterFail = await getTask(task.id);
    expect(afterFail?.steps[0].retryCount).toBe(1);
    expect(afterFail?.steps[0].status).toBe("pending");

    // Second advance: should succeed
    await advanceAllTasks();
    const afterRetry = await getTask(task.id);
    expect(afterRetry?.status).toBe("completed");
    expect(afterRetry?.steps[0].status).toBe("completed");
  });

  it("fails task when retries exhausted", async () => {
    const mockAgent = vi.mocked(runCronIsolatedAgentTurn);
    mockAgent.mockRejectedValue(new Error("permanent failure"));

    await startTaskRunner({
      cfg: {
        ...minimalCfg,
        tasks: { ...minimalCfg.tasks, maxConcurrentTasks: 2 },
      },
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "doomed",
      description: "test",
      steps: [{ description: "bad step", prompt: "fail" }],
      maxRetries: 1,
    });

    // First advance: fail, retry scheduled (retryCount 1)
    await advanceAllTasks();
    const mid = await getTask(task.id);
    expect(mid?.steps[0].retryCount).toBe(1);

    // Second advance: fail again, retries exhausted → task fails
    await advanceAllTasks();
    const final = await getTask(task.id);
    expect(final?.status).toBe("failed");
    expect(final?.completedAtMs).toBeDefined();
  });

  it("handles error result from agent", async () => {
    const mockAgent = vi.mocked(runCronIsolatedAgentTurn);
    mockAgent.mockResolvedValue({
      status: "error",
      error: "agent returned error",
      summary: "",
    });

    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "error-result",
      description: "test",
      steps: [{ description: "erroring step", prompt: "err" }],
      maxRetries: 0,
    });

    await advanceAllTasks();
    const done = await getTask(task.id);
    expect(done?.status).toBe("failed");
    expect(done?.steps[0].error).toContain("agent returned error");
  });

  it("does not advance paused tasks", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const task = await createTask({
      name: "paused-task",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await pauseTask(task.id);
    await advanceAllTasks();

    const after = await getTask(task.id);
    expect(after?.status).toBe("paused");
    expect(after?.steps[0].status).toBe("pending");
  });
});

// ── startTaskRunner / stopTaskRunner ──────────────────────────────────────────

describe("startTaskRunner / stopTaskRunner", () => {
  it("resumes in-progress tasks from disk on startup", async () => {
    // Pre-populate the store with an in_progress task
    const store: TaskStoreFile = {
      version: 1,
      tasks: [
        {
          id: "resumed-1",
          name: "was in progress",
          description: "test",
          status: "in_progress",
          createdAtMs: 1000,
          updatedAtMs: 1000,
          reportChannel: "last",
          reportEverySteps: 1,
          steps: [
            {
              id: "s1",
              index: 0,
              description: "step 1",
              status: "in_progress",
              prompt: "do it",
              retryCount: 0,
            },
          ],
          currentStepIndex: 0,
          sessionKey: "task:resumed-1",
          stepIntervalMs: 30000,
          maxRetries: 2,
          timeoutPerStepMs: 600000,
          progressReports: [],
        },
      ],
    };
    await saveTaskStore(storePath, store);

    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    const tasks = await listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("in_progress");
    expect(tasks[0].name).toBe("was in progress");
  });

  it("persists final state on stop", async () => {
    await startTaskRunner({
      cfg: minimalCfg,
      cliDeps: minimalCliDeps,
      storePath,
    });

    await createTask({
      name: "survives-stop",
      description: "test",
      steps: [{ description: "s1", prompt: "p1" }],
    });

    await stopTaskRunner();

    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as TaskStoreFile;
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].name).toBe("survives-stop");
  });
});
