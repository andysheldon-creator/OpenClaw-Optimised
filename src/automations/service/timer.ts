/**
 * Timer and execution orchestration for AutomationService.
 *
 * Manages the scheduling timer, executes due automations,
 * and coordinates the 3-phase execution pattern.
 */

import crypto from "node:crypto";
import type { Automation, AutomationEvent, AutomationRun } from "../types.js";
import type { AutomationServiceState } from "./state.js";
import {
  emitAutomationCancelled,
  emitAutomationCompleted,
  emitAutomationFailed,
  emitAutomationStarted,
} from "../events.js";
import { computeNextRunAtMs } from "../schedule.js";
import { locked } from "./locked.js";
import { ensureLoaded, persist } from "./store.js";

/** Maximum timeout value in JavaScript (2^31 - 1 ms) */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Arm the timer for the next scheduled automation run.
 * Clears any existing timer and schedules a new one.
 */
export function armTimer(state: AutomationServiceState): void {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;

  if (!state.deps.automationsEnabled) {
    return;
  }

  const nextAt = nextWakeAtMs(state);
  if (!nextAt) {
    return;
  }

  const delay = Math.max(nextAt - state.deps.nowMs(), 0);
  // Avoid TimeoutOverflowWarning when a job is far in the future
  const clampedDelay = Math.min(delay, MAX_TIMEOUT_MS);

  state.timer = setTimeout(() => {
    state._lastTimerRun = onTimer(state).catch((err) => {
      state.deps.log.error({ err: String(err) }, "automations: timer tick failed");
    });
  }, clampedDelay);

  state.timer.unref?.();
}

/**
 * Timer tick handler - finds due automations and executes them.
 * Uses a 3-phase pattern:
 * 1. (locked) Find due automations, mark them running, persist
 * 2. (unlocked) Execute each automation (long-running part)
 * 3. (locked) Persist final state, re-arm timer
 */
export async function onTimer(state: AutomationServiceState): Promise<void> {
  if (state.running) {
    return;
  }
  state.running = true;

  try {
    // Phase 1 (locked): find due automations, mark running, persist
    const dueAutomations = await locked(state, async () => {
      await ensureLoaded(state);
      if (!state.store) {
        return [];
      }

      const now = state.deps.nowMs();
      const due = state.store.automations.filter((a) => {
        if (!a.enabled) {
          return false;
        }
        if (typeof a.state.runningAtMs === "number") {
          return false;
        }
        const next = a.state.nextRunAtMs;
        return typeof next === "number" && now >= next;
      });

      // Mark each due automation as running
      const startedAt = state.deps.nowMs();
      for (const automation of due) {
        automation.state.runningAtMs = startedAt;
      }

      if (due.length > 0) {
        await persist(state);
      }
      return due;
    });

    // Phase 2 (unlocked): execute each automation
    const now = state.deps.nowMs();
    for (const automation of dueAutomations) {
      await executeAutomation(state, automation, now);
    }

    // Phase 3 (locked): persist final state, re-arm timer
    await locked(state, async () => {
      await persist(state);
      armTimer(state);
    });
  } finally {
    state.running = false;
  }
}

/**
 * Execute a single automation.
 * Creates a run record, emits events, and handles completion/failure.
 */
export async function executeAutomation(
  state: AutomationServiceState,
  automation: Automation,
  nowMs: number,
  opts?: { forced?: boolean },
): Promise<void> {
  const startedAt = state.deps.nowMs();
  const runId = crypto.randomUUID();

  // Ensure runningAtMs is set (may have been set in Phase 1)
  if (typeof automation.state.runningAtMs !== "number") {
    automation.state.runningAtMs = startedAt;
  }
  automation.state.lastError = undefined;

  // Create run record
  const run: AutomationRun = {
    id: runId,
    automationId: automation.id,
    automationName: automation.name,
    startedAt: new Date(startedAt),
    status: "running",
    milestones: [],
    artifacts: [],
    conflicts: [],
    triggeredBy: opts?.forced ? "manual" : "schedule",
  };

  // Track the run for cancellation
  const controller = new AbortController();
  state.runningRuns.set(runId, {
    automationId: automation.id,
    runId,
    startedAt,
    controller,
  });

  // Emit started event
  emitAutomationStarted(state, automation.id, runId);

  // Finish handler - updates state and emits completion event
  const finish = async (
    status: "success" | "error" | "cancelled" | "blocked",
    err?: string,
    artifacts?: import("../types.js").AutomationArtifact[],
    conflicts?: import("../types.js").AutomationConflict[],
  ) => {
    const endedAt = state.deps.nowMs();

    // Update automation state
    automation.state.runningAtMs = undefined;
    automation.state.lastRunAtMs = startedAt;
    automation.state.lastStatus = status;
    automation.state.lastDurationMs = Math.max(0, endedAt - startedAt);
    automation.state.lastError = err;
    automation.state.lastRunId = runId;

    // Update run record
    run.completedAt = new Date(endedAt);
    run.status = status;
    run.error = err;
    if (artifacts) {
      run.artifacts = artifacts;
    }
    if (conflicts) {
      run.conflicts = conflicts;
    }

    // Save run to history
    if (state.store) {
      state.store.runHistory.push(run);
    }

    // Emit completion event
    switch (status) {
      case "success":
        emitAutomationCompleted(state, automation.id, runId, artifacts);
        break;
      case "error":
        emitAutomationFailed(state, automation.id, runId, err ?? "Unknown error");
        break;
      case "blocked":
        // Conflicts should be provided
        break;
      case "cancelled":
        emitAutomationCancelled(state, automation.id, runId);
        break;
    }

    // Remove from running runs
    state.runningRuns.delete(runId);

    // Update next run time for recurring automations
    if (automation.enabled && status === "success") {
      if (automation.schedule.kind === "at") {
        // One-shot automation - disable after successful run
        automation.enabled = false;
        automation.state.nextRunAtMs = undefined;
      } else {
        // Recurring automation - compute next run
        automation.state.nextRunAtMs = computeNextRunAtMs(automation.schedule, endedAt);
      }
    } else {
      automation.state.nextRunAtMs = undefined;
    }
  };

  try {
    // TODO: Implement actual automation execution based on type
    // For now, we'll delegate to runIsolatedAgentJob
    const result = await state.deps.runIsolatedAgentJob({
      automation,
      message: `Execute automation: ${automation.name}`,
    });

    if (result.status === "ok") {
      await finish("success", undefined, result.artifacts, result.conflicts);
    } else if (result.status === "skipped") {
      await finish("success", result.summary, result.artifacts, result.conflicts);
    } else {
      await finish("error", result.error, result.artifacts, result.conflicts);
    }
  } catch (err) {
    await finish("error", String(err));
  } finally {
    automation.updatedAtMs = nowMs;
  }
}

/**
 * Stop the timer without triggering any more scheduled runs.
 */
export function stopTimer(state: AutomationServiceState): void {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
}

/**
 * Get the timestamp of the next scheduled run across all automations.
 */
export function nextWakeAtMs(state: AutomationServiceState): number | undefined {
  const automations = state.store?.automations ?? [];
  const enabled = automations.filter((a) => a.enabled && typeof a.state.nextRunAtMs === "number");

  if (enabled.length === 0) {
    return undefined;
  }

  return enabled.reduce(
    (min, a) => Math.min(min, a.state.nextRunAtMs as number),
    enabled[0].state.nextRunAtMs as number,
  );
}

/**
 * Emit an automation event to any registered event handler.
 */
export function emit(state: AutomationServiceState, evt: AutomationEvent): void {
  try {
    state.deps.onEvent?.(evt);
  } catch {
    // Ignore event handler errors
  }
}
