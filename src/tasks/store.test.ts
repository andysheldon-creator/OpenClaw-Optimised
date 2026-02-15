import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addTask,
  findTask,
  listTasks,
  loadTaskStore,
  removeTask,
  resolveTaskStorePath,
  saveTaskStore,
  updateTask,
} from "./store.js";
import type { TaskCreate, TaskStoreFile } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let storePath: string;

function makeCreate(overrides: Partial<TaskCreate> = {}): TaskCreate {
  return {
    name: "test task",
    description: "unit test task",
    steps: [
      { description: "step 1", prompt: "do step 1" },
      { description: "step 2", prompt: "do step 2" },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-tasks-test-"));
  storePath = resolveTaskStorePath(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── resolveTaskStorePath ──────────────────────────────────────────────────────

describe("resolveTaskStorePath", () => {
  it("uses the provided base directory", () => {
    const result = resolveTaskStorePath(tmpDir);
    expect(result).toContain("tasks");
    expect(result).toContain("tasks.json");
    expect(path.resolve(result).startsWith(path.resolve(tmpDir))).toBe(true);
  });
});

// ── loadTaskStore ─────────────────────────────────────────────────────────────

describe("loadTaskStore", () => {
  it("returns empty store when file does not exist", async () => {
    const store = await loadTaskStore(storePath);
    expect(store.version).toBe(1);
    expect(store.tasks).toEqual([]);
  });

  it("returns empty store when file contains invalid JSON", async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, "not-json{{{", "utf8");
    const store = await loadTaskStore(storePath);
    expect(store.version).toBe(1);
    expect(store.tasks).toEqual([]);
  });

  it("returns empty store when file has no tasks array", async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify({ version: 1 }), "utf8");
    const store = await loadTaskStore(storePath);
    expect(store.tasks).toEqual([]);
  });

  it("loads valid store from disk", async () => {
    const storeData: TaskStoreFile = {
      version: 1,
      tasks: [
        {
          id: "abc",
          name: "persisted task",
          description: "test",
          status: "pending",
          createdAtMs: 1000,
          updatedAtMs: 1000,
          reportChannel: "last",
          reportEverySteps: 1,
          steps: [],
          currentStepIndex: 0,
          sessionKey: "task:abc",
          stepIntervalMs: 30000,
          maxRetries: 2,
          timeoutPerStepMs: 600000,
          progressReports: [],
        },
      ],
    };
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(storeData), "utf8");
    const store = await loadTaskStore(storePath);
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0].id).toBe("abc");
    expect(store.tasks[0].name).toBe("persisted task");
  });
});

// ── saveTaskStore ─────────────────────────────────────────────────────────────

describe("saveTaskStore", () => {
  it("creates directories and persists store to disk", async () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    await saveTaskStore(storePath, store);
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.tasks).toEqual([]);
  });

  it("overwrites existing store on disk", async () => {
    const store1: TaskStoreFile = { version: 1, tasks: [] };
    await saveTaskStore(storePath, store1);

    const store2 = await loadTaskStore(storePath);
    addTask(store2, makeCreate({ name: "added" }));
    await saveTaskStore(storePath, store2);

    const reloaded = await loadTaskStore(storePath);
    expect(reloaded.tasks).toHaveLength(1);
    expect(reloaded.tasks[0].name).toBe("added");
  });

  it("handles concurrent saves via lock serialization", async () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    // Fire multiple saves concurrently — all should succeed without corruption
    await Promise.all([
      saveTaskStore(storePath, { ...store, tasks: [] }),
      saveTaskStore(storePath, { ...store, tasks: [] }),
      saveTaskStore(storePath, { ...store, tasks: [] }),
    ]);
    const result = await loadTaskStore(storePath);
    expect(result.version).toBe(1);
  });
});

// ── addTask ───────────────────────────────────────────────────────────────────

describe("addTask", () => {
  it("creates a task with UUID and session key", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(task.id).toBeDefined();
    expect(task.id.length).toBeGreaterThan(0);
    expect(task.sessionKey).toBe(`task:${task.id}`);
  });

  it("sets initial status to pending", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(task.status).toBe("pending");
  });

  it("assigns correct step indices and pending status", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(task.steps).toHaveLength(2);
    expect(task.steps[0].index).toBe(0);
    expect(task.steps[1].index).toBe(1);
    expect(task.steps[0].status).toBe("pending");
    expect(task.steps[1].status).toBe("pending");
  });

  it("uses default values when not provided", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(task.reportChannel).toBe("last");
    expect(task.reportEverySteps).toBe(1);
    expect(task.stepIntervalMs).toBe(30_000);
    expect(task.maxRetries).toBe(2);
    expect(task.timeoutPerStepMs).toBe(600_000);
    expect(task.currentStepIndex).toBe(0);
    expect(task.progressReports).toEqual([]);
  });

  it("respects provided overrides", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(
      store,
      makeCreate({
        reportChannel: "telegram",
        reportTo: "12345",
        reportEverySteps: 3,
        stepIntervalMs: 60_000,
        maxRetries: 5,
        timeoutPerStepMs: 300_000,
      }),
    );
    expect(task.reportChannel).toBe("telegram");
    expect(task.reportTo).toBe("12345");
    expect(task.reportEverySteps).toBe(3);
    expect(task.stepIntervalMs).toBe(60_000);
    expect(task.maxRetries).toBe(5);
    expect(task.timeoutPerStepMs).toBe(300_000);
  });

  it("pushes the task into the store's tasks array", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]).toBe(task);
  });

  it("generates unique IDs for multiple tasks", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const t1 = addTask(store, makeCreate({ name: "task 1" }));
    const t2 = addTask(store, makeCreate({ name: "task 2" }));
    expect(t1.id).not.toBe(t2.id);
    expect(store.tasks).toHaveLength(2);
  });

  it("sets timestamps", () => {
    const before = Date.now();
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    const after = Date.now();
    expect(task.createdAtMs).toBeGreaterThanOrEqual(before);
    expect(task.createdAtMs).toBeLessThanOrEqual(after);
    expect(task.updatedAtMs).toBe(task.createdAtMs);
  });
});

// ── findTask ──────────────────────────────────────────────────────────────────

describe("findTask", () => {
  it("returns the task if found", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    const found = findTask(store, task.id);
    expect(found).toBe(task);
  });

  it("returns undefined for missing ID", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    expect(findTask(store, "nonexistent")).toBeUndefined();
  });
});

// ── listTasks ─────────────────────────────────────────────────────────────────

describe("listTasks", () => {
  it("returns all tasks when no filter given", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    addTask(store, makeCreate({ name: "a" }));
    addTask(store, makeCreate({ name: "b" }));
    expect(listTasks(store)).toHaveLength(2);
  });

  it("returns a shallow copy (not the original array)", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    addTask(store, makeCreate());
    const result = listTasks(store);
    expect(result).not.toBe(store.tasks);
    expect(result).toEqual(store.tasks);
  });

  it("filters by status", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const t1 = addTask(store, makeCreate({ name: "a" }));
    addTask(store, makeCreate({ name: "b" }));
    t1.status = "completed";

    const completed = listTasks(store, { status: "completed" });
    expect(completed).toHaveLength(1);
    expect(completed[0].name).toBe("a");

    const pending = listTasks(store, { status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0].name).toBe("b");
  });

  it("returns empty array when no tasks match filter", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    addTask(store, makeCreate());
    expect(listTasks(store, { status: "failed" })).toEqual([]);
  });
});

// ── updateTask ────────────────────────────────────────────────────────────────

describe("updateTask", () => {
  it("patches the task and updates updatedAtMs", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    const origUpdated = task.updatedAtMs;

    const updated = updateTask(store, task.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
    expect(updated.updatedAtMs).toBeGreaterThanOrEqual(origUpdated);
    expect(updated.name).toBe("test task"); // preserved
  });

  it("throws if task not found", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    expect(() => updateTask(store, "missing-id", { status: "failed" })).toThrow(
      "Task not found: missing-id",
    );
  });

  it("replaces the task in the array", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    updateTask(store, task.id, { name: "renamed" });
    expect(store.tasks[0].name).toBe("renamed");
  });
});

// ── removeTask ────────────────────────────────────────────────────────────────

describe("removeTask", () => {
  it("removes the task and returns true", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate());
    expect(store.tasks).toHaveLength(1);
    const removed = removeTask(store, task.id);
    expect(removed).toBe(true);
    expect(store.tasks).toHaveLength(0);
  });

  it("returns false for missing ID", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    expect(removeTask(store, "missing")).toBe(false);
  });

  it("removes the correct task when multiple exist", () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const t1 = addTask(store, makeCreate({ name: "keep" }));
    const t2 = addTask(store, makeCreate({ name: "remove" }));
    removeTask(store, t2.id);
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0].id).toBe(t1.id);
  });
});

// ── Round-trip persistence ────────────────────────────────────────────────────

describe("round-trip persistence", () => {
  it("survives save → load with all fields intact", async () => {
    const store: TaskStoreFile = { version: 1, tasks: [] };
    const task = addTask(store, makeCreate({ name: "persist-me" }));
    task.status = "in_progress";
    task.currentStepIndex = 1;
    task.steps[0].status = "completed";
    task.steps[0].result = "step 1 done";

    await saveTaskStore(storePath, store);
    const loaded = await loadTaskStore(storePath);

    expect(loaded.tasks).toHaveLength(1);
    const loadedTask = loaded.tasks[0];
    expect(loadedTask.name).toBe("persist-me");
    expect(loadedTask.status).toBe("in_progress");
    expect(loadedTask.currentStepIndex).toBe(1);
    expect(loadedTask.steps[0].status).toBe("completed");
    expect(loadedTask.steps[0].result).toBe("step 1 done");
    expect(loadedTask.sessionKey).toBe(`task:${loadedTask.id}`);
  });
});
