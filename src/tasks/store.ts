/**
 * Disk-persisted task store.
 *
 * Tasks are stored as a single JSON file at ~/.clawdis/tasks/tasks.json.
 * All writes are atomic (write to temp file, then rename) and serialized
 * via a simple promise-based lock to prevent corruption from concurrent
 * writes.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CONFIG_DIR } from "../utils.js";

import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_REPORT_EVERY_STEPS,
  DEFAULT_STEP_INTERVAL_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  type Task,
  type TaskCreate,
  type TaskStatus,
  type TaskStep,
  type TaskStoreFile,
} from "./types.js";

// ─── Path Resolution ─────────────────────────────────────────────────────────

export function resolveTaskStorePath(baseDir?: string): string {
  const root = baseDir ?? CONFIG_DIR;
  return path.join(root, "tasks", "tasks.json");
}

// ─── Atomic JSON I/O ─────────────────────────────────────────────────────────

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJSONAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ─── Lock ────────────────────────────────────────────────────────────────────

let lock: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release: (() => void) | undefined;
  lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

// ─── Store Operations ────────────────────────────────────────────────────────

const EMPTY_STORE: TaskStoreFile = { version: 1, tasks: [] };

export async function loadTaskStore(storePath: string): Promise<TaskStoreFile> {
  const existing = await readJSON<TaskStoreFile>(storePath);
  if (!existing || !Array.isArray(existing.tasks)) {
    return { ...EMPTY_STORE, tasks: [] };
  }
  return { version: 1, tasks: existing.tasks };
}

export async function saveTaskStore(
  storePath: string,
  store: TaskStoreFile,
): Promise<void> {
  await withLock(async () => {
    await writeJSONAtomic(storePath, store);
  });
}

export function findTask(store: TaskStoreFile, id: string): Task | undefined {
  return store.tasks.find((t) => t.id === id);
}

export function listTasks(
  store: TaskStoreFile,
  filter?: { status?: TaskStatus },
): Task[] {
  if (!filter?.status) return [...store.tasks];
  return store.tasks.filter((t) => t.status === filter.status);
}

/**
 * Add a new task to the store. Returns the created Task.
 * Does NOT persist — caller must call saveTaskStore() after.
 */
export function addTask(store: TaskStoreFile, create: TaskCreate): Task {
  const now = Date.now();
  const taskId = randomUUID();

  const steps: TaskStep[] = create.steps.map((s, i) => ({
    id: randomUUID(),
    index: i,
    description: s.description,
    status: "pending" as TaskStatus,
    prompt: s.prompt,
    retryCount: 0,
  }));

  const task: Task = {
    id: taskId,
    name: create.name,
    description: create.description,
    status: "pending",
    createdAtMs: now,
    updatedAtMs: now,

    reportChannel: create.reportChannel ?? "last",
    reportTo: create.reportTo,
    reportTopicId: create.reportTopicId,
    reportEverySteps: create.reportEverySteps ?? DEFAULT_REPORT_EVERY_STEPS,

    steps,
    currentStepIndex: 0,
    sessionKey: `task:${taskId}`,

    stepIntervalMs: create.stepIntervalMs ?? DEFAULT_STEP_INTERVAL_MS,
    maxRetries: create.maxRetries ?? DEFAULT_MAX_RETRIES,
    timeoutPerStepMs: create.timeoutPerStepMs ?? DEFAULT_STEP_TIMEOUT_MS,

    progressReports: [],
    metadata: create.metadata,
  };

  store.tasks.push(task);
  return task;
}

/**
 * Update a task in the store by ID. Returns the updated Task.
 * Does NOT persist — caller must call saveTaskStore() after.
 * Throws if the task is not found.
 */
export function updateTask(
  store: TaskStoreFile,
  id: string,
  patch: Partial<Task>,
): Task {
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error(`Task not found: ${id}`);
  const updated = { ...store.tasks[idx], ...patch, updatedAtMs: Date.now() };
  store.tasks[idx] = updated;
  return updated;
}

/**
 * Remove a task from the store by ID. Returns true if removed.
 * Does NOT persist — caller must call saveTaskStore() after.
 */
export function removeTask(store: TaskStoreFile, id: string): boolean {
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.tasks.splice(idx, 1);
  return true;
}
