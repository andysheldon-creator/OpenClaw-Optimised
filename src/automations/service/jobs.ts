/**
 * Automation job management operations.
 *
 * Provides functions for creating, finding, updating, and validating
 * automations. Similar to CronService's jobs.ts.
 */

import crypto from "node:crypto";
import type { Automation, AutomationCreate, AutomationPatch } from "../types.js";
import type { AutomationServiceState } from "./state.js";
import { computeNextRunAtMs } from "../schedule.js";

const STUCK_RUN_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Find an automation by ID or throw an error.
 *
 * @param state - Service state
 * @param id - Automation ID
 * @returns The automation
 * @throws Error if automation not found
 */
export function findAutomationOrThrow(state: AutomationServiceState, id: string): Automation {
  const automation = state.store?.automations.find((a) => a.id === id);
  if (!automation) {
    throw new Error(`unknown automation id: ${id}`);
  }
  return automation;
}

/**
 * Compute the next run time for an automation.
 *
 * @param automation - The automation
 * @param nowMs - Current timestamp
 * @returns Next run timestamp or undefined
 */
export function computeAutomationNextRunAtMs(
  automation: Automation,
  nowMs: number,
): number | undefined {
  if (!automation.enabled) {
    return undefined;
  }

  // For one-shot "at" schedules, only run once
  if (automation.schedule.kind === "at") {
    if (automation.state.lastStatus === "success" && automation.state.lastRunAtMs) {
      return undefined;
    }
    return automation.schedule.atMs;
  }

  return computeNextRunAtMs(automation.schedule, nowMs);
}

/**
 * Recompute next run times for all automations in the store.
 * Also clears stuck "running" markers.
 *
 * @param state - Service state
 */
export function recomputeNextRuns(state: AutomationServiceState): void {
  if (!state.store) {
    return;
  }

  const now = state.deps.nowMs();

  for (const automation of state.store.automations) {
    if (!automation.enabled) {
      automation.state.nextRunAtMs = undefined;
      automation.state.runningAtMs = undefined;
      continue;
    }

    // Clear stuck running markers
    const runningAt = automation.state.runningAtMs;
    if (typeof runningAt === "number" && now - runningAt > STUCK_RUN_MS) {
      state.deps.log.warn(
        { automationId: automation.id, runningAtMs: runningAt },
        "automations: clearing stuck running marker",
      );
      automation.state.runningAtMs = undefined;
    }

    automation.state.nextRunAtMs = computeAutomationNextRunAtMs(automation, now);
  }
}

/**
 * Create a new automation from input.
 *
 * @param state - Service state
 * @param input - Automation creation input
 * @returns New automation with computed state
 */
export function createAutomation(
  state: AutomationServiceState,
  input: AutomationCreate,
): Automation {
  const now = state.deps.nowMs();
  const id = crypto.randomUUID();

  const automation: Automation = {
    id,
    agentId: input.agentId,
    name: normalizeRequiredName(input.name),
    description: normalizeOptionalText(input.description),
    enabled: input.enabled,
    status: input.status ?? "active",
    createdAtMs: now,
    updatedAtMs: now,
    schedule: input.schedule,
    type: input.type,
    tags: input.tags ?? [],
    config: input.config,
    state: {
      ...input.state,
    },
  };

  assertValidAutomation(automation);
  automation.state.nextRunAtMs = computeAutomationNextRunAtMs(automation, now);

  return automation;
}

/**
 * Apply a patch to an existing automation.
 *
 * @param automation - The automation to patch
 * @param patch - The patch to apply
 */
export function applyAutomationPatch(automation: Automation, patch: AutomationPatch): void {
  if ("name" in patch && patch.name) {
    automation.name = normalizeRequiredName(patch.name);
  }
  if ("description" in patch) {
    automation.description = normalizeOptionalText(patch.description);
  }
  if (typeof patch.enabled === "boolean") {
    automation.enabled = patch.enabled;
  }
  if ("status" in patch && patch.status) {
    automation.status = patch.status;
  }
  if ("schedule" in patch && patch.schedule) {
    automation.schedule = patch.schedule;
  }
  if ("type" in patch && patch.type) {
    automation.type = patch.type;
  }
  if ("tags" in patch && patch.tags) {
    automation.tags = patch.tags;
  }
  if ("config" in patch && patch.config) {
    automation.config = patch.config;
  }
  if ("agentId" in patch) {
    automation.agentId = patch.agentId;
  }
  if (patch.state) {
    automation.state = { ...automation.state, ...patch.state };
  }

  assertValidAutomation(automation);
}

/**
 * Check if an automation is due to run.
 *
 * @param automation - The automation to check
 * @param nowMs - Current timestamp
 * @param opts - Options with forced flag
 * @returns True if due to run
 */
export function isAutomationDue(
  automation: Automation,
  nowMs: number,
  opts: { forced: boolean },
): boolean {
  if (opts.forced) {
    return true;
  }
  return (
    automation.enabled &&
    typeof automation.state.nextRunAtMs === "number" &&
    nowMs >= automation.state.nextRunAtMs
  );
}

/**
 * Validate that an automation has a valid configuration.
 *
 * @param automation - The automation to validate
 * @throws Error if configuration is invalid
 */
function assertValidAutomation(automation: Automation): void {
  // Validate schedule matches config type
  const { type, config } = automation;

  if (type === "smart-sync-fork") {
    if (config.type !== "smart-sync-fork") {
      throw new Error(`automation type "${type}" requires config.type "smart-sync-fork"`);
    }
    const c = config;
    if (!c.forkRepoUrl || !c.upstreamRepoUrl || !c.forkBranch || !c.upstreamBranch) {
      throw new Error(
        "smart-sync-fork automation requires forkRepoUrl, upstreamRepoUrl, forkBranch, and upstreamBranch",
      );
    }
  } else if (type === "custom-script") {
    if (config.type !== "custom-script") {
      throw new Error(`automation type "${type}" requires config.type "custom-script"`);
    }
    const c = config;
    if (!c.script) {
      throw new Error("custom-script automation requires script (file path)");
    }
  } else if (type === "webhook") {
    if (config.type !== "webhook") {
      throw new Error(`automation type "${type}" requires config.type "webhook"`);
    }
    const c = config;
    if (!c.url) {
      throw new Error("webhook automation requires url");
    }
  }
}

/**
 * Normalize required name field.
 */
function normalizeRequiredName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("automation name is required");
  }
  return name.trim();
}

/**
 * Normalize optional text fields.
 */
function normalizeOptionalText(text: unknown): string | undefined {
  if (typeof text !== "string" || text.trim().length === 0) {
    return undefined;
  }
  return text.trim();
}
