/**
 * SSE event emitters for automations.
 *
 * Emits events during automation lifecycle for real-time UI updates.
 */

import type { AutomationServiceState } from "./service/state.js";
import type { AutomationArtifact, AutomationConflict, AutomationEvent } from "./types.js";

/**
 * Emit an event when an automation starts running.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 */
export function emitAutomationStarted(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.started",
    timestamp: new Date(),
    data: {},
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}

/**
 * Emit a progress event during automation execution.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 * @param milestone - Title of the milestone reached
 * @param percentage - Optional completion percentage (0-100)
 */
export function emitAutomationProgress(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
  milestone: string,
  percentage?: number,
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.progress",
    timestamp: new Date(),
    data: {
      milestone,
      percentage,
    },
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}

/**
 * Emit an event when an automation completes successfully.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 * @param artifacts - Optional artifacts produced
 */
export function emitAutomationCompleted(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
  artifacts?: AutomationArtifact[],
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.completed",
    timestamp: new Date(),
    data: {
      artifacts,
    },
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}

/**
 * Emit an event when an automation fails.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 * @param error - Error message
 */
export function emitAutomationFailed(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
  error: string,
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.failed",
    timestamp: new Date(),
    data: {
      error,
    },
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}

/**
 * Emit an event when an automation is blocked by conflicts.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 * @param conflicts - List of conflicts blocking execution
 */
export function emitAutomationBlocked(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
  conflicts: AutomationConflict[],
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.blocked",
    timestamp: new Date(),
    data: {
      conflicts,
    },
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}

/**
 * Emit an event when an automation is cancelled.
 *
 * @param state - Service state containing the event emitter
 * @param automationId - ID of the automation
 * @param runId - ID of the run
 */
export function emitAutomationCancelled(
  state: AutomationServiceState,
  automationId: string,
  runId: string,
): void {
  const event: AutomationEvent = {
    automationId,
    runId,
    type: "automation.cancelled",
    timestamp: new Date(),
    data: {},
  };
  state.deps.emitAutomationEvent(event);
  state.deps.onEvent?.(event);
}
