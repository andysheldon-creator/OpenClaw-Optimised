/**
 * Service operations for AutomationService.
 *
 * Implements all CRUD operations, execution, and lifecycle management.
 * Follows the same pattern as CronService's ops.ts.
 */

import type {
  Automation,
  AutomationCreate,
  AutomationDeleteResult,
  AutomationGetResult,
  AutomationHistoryResult,
  AutomationPatch,
  AutomationRunResult,
  AutomationStatusSummary,
} from "../types.js";
import type { AutomationServiceState } from "./state.js";
import {
  applyAutomationPatch,
  createAutomation,
  findAutomationOrThrow,
  isAutomationDue,
  recomputeNextRuns,
} from "./jobs.js";
import { locked } from "./locked.js";
import { ensureLoaded, persist, warnIfDisabled } from "./store.js";
import { armTimer, executeAutomation, nextWakeAtMs, stopTimer } from "./timer.js";

/**
 * Start the automation service.
 * Loads the store, computes next runs, arms the timer.
 */
export async function start(state: AutomationServiceState): Promise<void> {
  await locked(state, async () => {
    if (!state.deps.automationsEnabled) {
      state.deps.log.info({ enabled: false }, "automations: disabled");
      return;
    }

    await ensureLoaded(state);
    recomputeNextRuns(state);
    await persist(state);
    armTimer(state);

    state.deps.log.info(
      {
        enabled: true,
        automations: state.store?.automations.length ?? 0,
        nextWakeAtMs: nextWakeAtMs(state) ?? null,
      },
      "automations: started",
    );
  });
}

/**
 * Stop the automation service.
 * Clears the timer without waiting for pending operations.
 */
export function stop(state: AutomationServiceState): void {
  stopTimer(state);
}

/**
 * Get a status snapshot of the service.
 */
export async function status(state: AutomationServiceState): Promise<AutomationStatusSummary> {
  // Fast path: store already loaded — return snapshot without lock
  if (state.store) {
    return statusSnapshot(state);
  }

  return await locked(state, async () => {
    await ensureLoaded(state);
    return statusSnapshot(state);
  });
}

/** Lock-free snapshot of service status */
function statusSnapshot(state: AutomationServiceState): AutomationStatusSummary {
  return {
    enabled: state.deps.automationsEnabled,
    storePath: state.deps.storePath,
    automations: state.store?.automations.length ?? 0,
    nextWakeAtMs: state.deps.automationsEnabled ? (nextWakeAtMs(state) ?? null) : null,
  };
}

/**
 * List all automations.
 */
export async function list(_opts?: { includeDisabled?: boolean }): Promise<Automation[]> {
  // This will be bound to state when called from service
  throw new Error("list must be called with state");
}

/** List implementation that takes state */
export async function listImpl(
  state: AutomationServiceState,
  opts?: { includeDisabled?: boolean },
): Promise<Automation[]> {
  // Fast path: store already loaded
  if (state.store) {
    return listSnapshot(state, opts);
  }

  return await locked(state, async () => {
    await ensureLoaded(state);
    return listSnapshot(state, opts);
  });
}

/** Lock-free snapshot of automations list */
function listSnapshot(
  state: AutomationServiceState,
  opts?: { includeDisabled?: boolean },
): Automation[] {
  const includeDisabled = opts?.includeDisabled === true;
  const automations = (state.store?.automations ?? []).filter((a) => includeDisabled || a.enabled);
  return automations.toSorted((a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0));
}

/**
 * Get a single automation by ID.
 */
export async function get(state: AutomationServiceState, id: string): Promise<AutomationGetResult> {
  return await locked(state, async () => {
    await ensureLoaded(state);
    const automation = state.store?.automations.find((a) => a.id === id);
    return automation ?? null;
  });
}

/**
 * Create a new automation.
 */
export async function create(
  state: AutomationServiceState,
  input: AutomationCreate,
): Promise<Automation> {
  return await locked(state, async () => {
    warnIfDisabled(state, "create");
    await ensureLoaded(state);

    const automation = createAutomation(state, input);
    state.store?.automations.push(automation);

    await persist(state);
    armTimer(state);

    return automation;
  });
}

/**
 * Update an existing automation.
 */
export async function update(
  state: AutomationServiceState,
  id: string,
  patch: AutomationPatch,
): Promise<Automation> {
  return await locked(state, async () => {
    warnIfDisabled(state, "update");
    await ensureLoaded(state);

    const automation = findAutomationOrThrow(state, id);
    const now = state.deps.nowMs();

    applyAutomationPatch(automation, patch);
    automation.updatedAtMs = now;

    if (automation.enabled) {
      automation.state.nextRunAtMs = require("../schedule.js").computeNextRunAtMs(
        automation.schedule,
        now,
      );
    } else {
      automation.state.nextRunAtMs = undefined;
      automation.state.runningAtMs = undefined;
    }

    await persist(state);
    armTimer(state);

    return automation;
  });
}

/**
 * Delete an automation.
 */
export async function delete_(
  state: AutomationServiceState,
  id: string,
): Promise<AutomationDeleteResult> {
  return await locked(state, async () => {
    warnIfDisabled(state, "delete");
    await ensureLoaded(state);

    if (!state.store) {
      return { ok: false, deleted: false };
    }

    const before = state.store.automations.length;
    state.store.automations = state.store.automations.filter((a) => a.id !== id);
    const deleted = state.store.automations.length !== before;

    await persist(state);
    armTimer(state);

    return { ok: true, deleted };
  });
}

/**
 * Run an automation immediately.
 * Uses a 3-phase pattern:
 * 1. (locked) Validate and mark running
 * 2. (unlocked) Execute automation
 * 3. (locked) Persist and re-arm timer
 */
export async function run(
  state: AutomationServiceState,
  id: string,
  opts?: { mode?: "force" },
): Promise<AutomationRunResult> {
  const forced = opts?.mode === "force";

  // Phase 1 (locked): validate, mark running
  const automation = await locked(state, async () => {
    warnIfDisabled(state, "run");
    await ensureLoaded(state);

    const a = findAutomationOrThrow(state, id);
    const now = state.deps.nowMs();
    const due = isAutomationDue(a, now, { forced });

    if (!due) {
      return null;
    }

    a.state.runningAtMs = state.deps.nowMs();
    return a;
  });

  if (!automation) {
    return { ok: true, ran: false, reason: "not-due" as const };
  }

  // Phase 2 (unlocked): execute
  const now = state.deps.nowMs();
  await executeAutomation(state, automation, now, { forced });

  // Phase 3 (locked): persist, re-arm timer
  await locked(state, async () => {
    await persist(state);
    armTimer(state);
  });

  return { ok: true, runId: automation.state.lastRunId ?? "" };
}

/**
 * Cancel a running automation.
 */
export async function cancel(
  state: AutomationServiceState,
  runId: string,
): Promise<{ ok: true; cancelled: boolean }> {
  return await locked(state, async () => {
    const runningRun = state.runningRuns.get(runId);
    if (!runningRun) {
      return { ok: true, cancelled: false };
    }

    // Abort the running automation
    runningRun.controller.abort();
    state.runningRuns.delete(runId);

    // Update automation state
    await ensureLoaded(state);
    const automation = state.store?.automations.find((a) => a.id === runningRun.automationId);
    if (automation) {
      automation.state.runningAtMs = undefined;
      automation.state.lastStatus = "cancelled";
      automation.state.lastRunId = runId;
    }

    await persist(state);
    armTimer(state);

    return { ok: true, cancelled: true };
  });
}

/**
 * Get run history for an automation.
 */
export async function getHistory(
  state: AutomationServiceState,
  automationId: string,
  opts?: { limit?: number },
): Promise<AutomationHistoryResult> {
  return await locked(state, async () => {
    await ensureLoaded(state);

    let runs = (state.store?.runHistory ?? []).filter((r) => r.automationId === automationId);

    // Sort by startedAt descending (newest first)
    runs = runs.toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply limit
    if (opts?.limit && opts.limit > 0) {
      runs = runs.slice(0, opts.limit);
    }

    return { runs };
  });
}

/**
 * Get a single run by ID.
 */
export async function getRun(
  state: AutomationServiceState,
  runId: string,
): Promise<import("../types.js").AutomationRun | null> {
  return await locked(state, async () => {
    await ensureLoaded(state);
    return state.store?.runHistory.find((r) => r.id === runId) ?? null;
  });
}
