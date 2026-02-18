/**
 * TaskRunner — orchestrates autonomous long-running tasks.
 *
 * Uses a standalone setInterval timer (like startHeartbeatRunner) to
 * periodically advance all in-progress tasks by one step each. Each step
 * is executed as an isolated agent turn via runCronIsolatedAgentTurn().
 *
 * Tasks are persisted to disk after every step for crash resilience.
 * Progress reports are sent to the user's preferred channel.
 */

import type { CliDeps } from "../cli/deps.js";
import type { ClawdisConfig } from "../config/config.js";
import {
  type RunCronAgentTurnResult,
  runCronIsolatedAgentTurn,
} from "../cron/isolated-agent.js";
import type { CronJob } from "../cron/types.js";
import { createSubsystemLogger } from "../logging.js";

import {
  type ProgressReporterDeps,
  reportCompletion,
  reportFailure,
  reportProgress,
  shouldReportProgress,
} from "./progress-reporter.js";
import {
  addTask,
  findTask,
  listTasks as listTasksFromStore,
  loadTaskStore,
  resolveTaskStorePath,
  saveTaskStore,
  updateTask,
} from "./store.js";
import {
  DEFAULT_STEP_INTERVAL_MS,
  MAX_RESULT_LENGTH,
  type Task,
  type TaskCreate,
  type TaskStatus,
  type TaskStoreFile,
} from "./types.js";

const log = createSubsystemLogger("tasks");

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of tasks that can be in_progress simultaneously. */
const DEFAULT_MAX_CONCURRENT_TASKS = 3;

/** Safety limit on steps per task to prevent runaway tasks. */
const DEFAULT_MAX_STEPS_PER_TASK = 50;

// ─── TaskRunner ──────────────────────────────────────────────────────────────

export type TaskRunnerDeps = {
  cfg: ClawdisConfig;
  cliDeps: CliDeps;
  storePath?: string;
  progressDeps?: ProgressReporterDeps;
};

let timer: ReturnType<typeof setInterval> | null = null;
let advancing = false;
let cachedStore: TaskStoreFile | null = null;
let deps: TaskRunnerDeps | null = null;

/**
 * Optional hook called when a board agent task completes.
 * Registered by the board system to save agent memory and check meeting completion.
 */
let agentTaskCompleteHook: ((task: Task) => Promise<void>) | null = null;

/**
 * Register a callback for board agent task completion.
 * Called from agent-tasks.ts during startup.
 */
export function onAgentTaskComplete(
  hook: (task: Task) => Promise<void>,
): void {
  agentTaskCompleteHook = hook;
}

/**
 * Start the task runner. Loads the store and begins periodic advancement.
 */
export async function startTaskRunner(
  runnerDeps: TaskRunnerDeps,
): Promise<void> {
  deps = runnerDeps;
  const storePath = deps.storePath ?? resolveTaskStorePath();
  cachedStore = await loadTaskStore(storePath);

  // Resume any tasks that were in_progress when the process was last killed.
  // They stay in_progress and the runner will pick them up on the next tick.
  const inProgress = cachedStore.tasks.filter(
    (t) => t.status === "in_progress",
  );
  if (inProgress.length > 0) {
    log.info(
      `Resuming ${inProgress.length} in-progress task(s) from previous run`,
    );
  }

  const intervalMs =
    deps.cfg.tasks?.defaultStepIntervalMs ?? DEFAULT_STEP_INTERVAL_MS;

  timer = setInterval(() => {
    void advanceAllTasks();
  }, intervalMs);
  timer.unref?.();

  log.info(
    `Task runner started (interval=${intervalMs}ms, store=${storePath})`,
  );
}

/**
 * Stop the task runner and persist the final state.
 */
export async function stopTaskRunner(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (cachedStore && deps) {
    const storePath = deps.storePath ?? resolveTaskStorePath();
    await saveTaskStore(storePath, cachedStore);
  }
  log.info("Task runner stopped");
}

// ─── Advancement ─────────────────────────────────────────────────────────────

/**
 * Advance all in-progress tasks by one step each.
 * Serialized: only one advancement cycle runs at a time.
 */
export async function advanceAllTasks(): Promise<void> {
  if (advancing || !deps || !cachedStore) return;
  advancing = true;

  try {
    const maxConcurrent =
      deps.cfg.tasks?.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;

    // Find tasks to advance
    const pending = cachedStore.tasks.filter((t) => t.status === "pending");
    const inProgress = cachedStore.tasks.filter(
      (t) => t.status === "in_progress",
    );

    // Promote pending tasks to in_progress (up to the concurrency limit)
    const slotsAvailable = maxConcurrent - inProgress.length;
    for (let i = 0; i < Math.min(slotsAvailable, pending.length); i++) {
      const task = pending[i];
      updateTask(cachedStore, task.id, { status: "in_progress" });
    }

    // Advance all in_progress tasks
    const tasksToAdvance = cachedStore.tasks.filter(
      (t) => t.status === "in_progress",
    );

    for (const task of tasksToAdvance) {
      try {
        await advanceTask(task.id);
      } catch (err) {
        log.error(
          `Failed to advance task ${task.id} (${task.name}): ${String(err)}`,
        );
      }
    }
  } finally {
    advancing = false;
  }
}

/**
 * Advance a single task by executing its current step.
 */
async function advanceTask(taskId: string): Promise<void> {
  if (!deps || !cachedStore) return;

  const task = findTask(cachedStore, taskId);
  if (!task || task.status !== "in_progress") return;

  // Safety: check step bounds
  if (task.currentStepIndex >= task.steps.length) {
    completeTask(task);
    return;
  }

  const step = task.steps[task.currentStepIndex];
  if (!step) {
    completeTask(task);
    return;
  }

  // Mark step as in_progress
  step.status = "in_progress";
  step.startedAtMs = Date.now();
  await persist();

  // Build prompt with context from prior steps
  const prompt = buildStepPrompt(task, step);

  // Create a synthetic CronJob for runCronIsolatedAgentTurn
  const syntheticJob: CronJob = {
    id: `task-step-${task.id}-${step.index}`,
    name: `Task: ${task.name}`,
    description: step.description,
    enabled: true,
    createdAtMs: task.createdAtMs,
    updatedAtMs: Date.now(),
    schedule: { kind: "every", everyMs: task.stepIntervalMs },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: prompt,
      timeoutSeconds: Math.ceil(task.timeoutPerStepMs / 1000),
      deliver: false, // We handle delivery ourselves via ProgressReporter
    },
    state: {},
  };

  let result: RunCronAgentTurnResult;
  try {
    // Pass the agent's extra system prompt (personality + memory) if this
    // is a board agent task.  The field is stored in task.metadata by
    // createAgentTask() in agent-tasks.ts.
    const extraSystemPrompt =
      typeof task.metadata?.extraSystemPrompt === "string"
        ? task.metadata.extraSystemPrompt
        : undefined;

    result = await runCronIsolatedAgentTurn({
      cfg: deps.cfg,
      deps: deps.cliDeps,
      job: syntheticJob,
      message: prompt,
      sessionKey: task.sessionKey,
      lane: "tasks",
      extraSystemPrompt,
    });
  } catch (err) {
    step.status = "failed";
    step.error = String(err);
    step.completedAtMs = Date.now();

    // Check if we can retry
    const retryCount = step.retryCount ?? 0;
    if (retryCount < task.maxRetries) {
      step.retryCount = retryCount + 1;
      step.status = "pending";
      log.warn(
        `Task ${task.id} step ${step.index} failed, retrying (${step.retryCount}/${task.maxRetries})`,
      );
      await persist();
      return;
    }

    // No more retries — fail the task
    updateTask(cachedStore, task.id, {
      status: "failed",
      completedAtMs: Date.now(),
    });
    await persist();
    await reportFailure(deps.cfg, task, String(err), deps.progressDeps);
    return;
  }

  // Process the result
  if (result.status === "error") {
    const retryCount = step.retryCount ?? 0;
    if (retryCount < task.maxRetries) {
      step.retryCount = retryCount + 1;
      step.status = "pending";
      step.error = result.error;
      log.warn(
        `Task ${task.id} step ${step.index} errored, retrying (${step.retryCount}/${task.maxRetries}): ${result.error}`,
      );
      await persist();
      return;
    }

    step.status = "failed";
    step.error = result.error;
    step.completedAtMs = Date.now();
    updateTask(cachedStore, task.id, {
      status: "failed",
      completedAtMs: Date.now(),
    });
    await persist();
    await reportFailure(
      deps.cfg,
      task,
      result.error ?? "Unknown error",
      deps.progressDeps,
    );
    return;
  }

  // Step succeeded
  step.status = "completed";
  step.completedAtMs = Date.now();
  step.result = truncateResult(result.summary);

  // Advance to next step
  task.currentStepIndex += 1;
  task.updatedAtMs = Date.now();

  // Check if we should report progress
  if (shouldReportProgress(task, step)) {
    const report = await reportProgress(
      deps.cfg,
      task,
      step,
      deps.progressDeps,
    );
    if (report) {
      task.progressReports.push(report);
    }
  }

  // Check if the task is complete
  if (task.currentStepIndex >= task.steps.length) {
    completeTask(task);
  }

  await persist();
}

function completeTask(task: Task): void {
  task.status = "completed";
  task.completedAtMs = Date.now();
  task.updatedAtMs = Date.now();

  // Build final summary from all step results
  const stepSummaries = task.steps
    .filter((s) => s.status === "completed" && s.result)
    .map((s) => `Step ${s.index + 1}: ${s.result?.slice(0, 200) ?? ""}`)
    .join("\n");
  task.finalSummary = stepSummaries || "All steps completed.";

  // Store the last completed step's full result for board meeting synthesis.
  const lastCompletedStep = [...task.steps]
    .reverse()
    .find((s) => s.status === "completed" && s.result);
  if (lastCompletedStep?.result) {
    task.finalResult = lastCompletedStep.result;
  }

  if (deps) {
    void reportCompletion(deps.cfg, task, deps.progressDeps);
  }

  // If this is a board agent task, fire the completion hook for memory + meeting tracking.
  if (task.metadata?.agentRole && agentTaskCompleteHook) {
    void agentTaskCompleteHook(task).catch((err) => {
      log.error(`Agent task complete hook failed for ${task.id}: ${String(err)}`);
    });
  }
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

function buildStepPrompt(
  task: Task,
  step: { index: number; description: string; prompt: string },
): string {
  const parts: string[] = [];
  parts.push(`[Task: ${task.name}]`);
  parts.push(`Description: ${task.description}`);
  parts.push(
    `Step ${step.index + 1} of ${task.steps.length}: ${step.description}`,
  );

  // Include results from prior completed steps for context
  const priorResults = task.steps
    .filter((s) => s.index < step.index && s.status === "completed" && s.result)
    .map((s) => `Step ${s.index + 1} result: ${s.result?.slice(0, 500) ?? ""}`);

  if (priorResults.length > 0) {
    parts.push("");
    parts.push("Prior step results:");
    parts.push(...priorResults);
  }

  parts.push("");
  parts.push(`Now execute: ${step.prompt}`);
  return parts.join("\n");
}

function truncateResult(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length > MAX_RESULT_LENGTH
    ? `${text.slice(0, MAX_RESULT_LENGTH - 1)}…`
    : text;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persist(): Promise<void> {
  if (!cachedStore || !deps) return;
  const storePath = deps.storePath ?? resolveTaskStorePath();
  await saveTaskStore(storePath, cachedStore);
}

// ─── Public Task Management API ──────────────────────────────────────────────

export async function createTask(create: TaskCreate): Promise<Task> {
  if (!deps || !cachedStore) {
    throw new Error("Task runner not started");
  }

  const maxSteps =
    deps.cfg.tasks?.maxStepsPerTask ?? DEFAULT_MAX_STEPS_PER_TASK;
  if (create.steps.length > maxSteps) {
    throw new Error(
      `Task has ${create.steps.length} steps, exceeding the limit of ${maxSteps}`,
    );
  }
  if (create.steps.length === 0) {
    throw new Error("Task must have at least one step");
  }

  const task = addTask(cachedStore, create);
  await persist();
  log.info(
    `Created task ${task.id}: "${task.name}" (${task.steps.length} steps)`,
  );
  return task;
}

export async function cancelTask(taskId: string): Promise<void> {
  if (!cachedStore) throw new Error("Task runner not started");
  const task = findTask(cachedStore, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === "completed" || task.status === "cancelled") {
    throw new Error(`Task is already ${task.status}`);
  }

  updateTask(cachedStore, taskId, {
    status: "cancelled",
    completedAtMs: Date.now(),
  });
  // Cancel any pending steps
  for (const step of task.steps) {
    if (step.status === "pending" || step.status === "in_progress") {
      step.status = "cancelled";
    }
  }
  await persist();
  log.info(`Cancelled task ${taskId}`);
}

export async function pauseTask(taskId: string): Promise<void> {
  if (!cachedStore) throw new Error("Task runner not started");
  const task = findTask(cachedStore, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "in_progress" && task.status !== "pending") {
    throw new Error(`Cannot pause task with status: ${task.status}`);
  }

  updateTask(cachedStore, taskId, { status: "paused" });
  await persist();
  log.info(`Paused task ${taskId}`);
}

export async function resumeTask(taskId: string): Promise<void> {
  if (!cachedStore) throw new Error("Task runner not started");
  const task = findTask(cachedStore, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "paused") {
    throw new Error(`Cannot resume task with status: ${task.status}`);
  }

  updateTask(cachedStore, taskId, { status: "pending" });
  await persist();
  log.info(`Resumed task ${taskId}`);
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  if (!cachedStore) return undefined;
  return findTask(cachedStore, taskId);
}

export async function listTasks(filter?: {
  status?: TaskStatus;
}): Promise<Task[]> {
  if (!cachedStore) return [];
  return listTasksFromStore(cachedStore, filter);
}
