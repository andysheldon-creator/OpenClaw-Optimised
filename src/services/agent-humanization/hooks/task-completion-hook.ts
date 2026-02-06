/**
 * Task Completion Hook — Called when a spawned sub-agent task completes
 *
 * Updates track record (planned vs actual time, quality estimate),
 * updates relationship scores between collaborating agents,
 * and records skill progression based on task type.
 *
 * This hook is triggered from the sub-agent registry when a child session
 * delivers its result back to the parent.
 */

import type { TrackRecord, LearningProgress } from "../models/types.js";
import {
  isHumanizationEnabled,
  getHumanizationService,
  fireAndForget,
  recordPairInteraction,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskCompletionParams {
  /** The agent that executed the task. */
  agentId: string;
  /** The agent that spawned the task. */
  requesterAgentId: string;
  /** Unique identifier for the task/session. */
  taskId: string;
  /** Human-readable label for the task. */
  taskLabel?: string;
  /** When the task was spawned. */
  spawnedAt: Date;
  /** When the task completed. */
  completedAt: Date;
  /** Planned timeout in seconds (0 = unlimited). */
  plannedTimeoutSeconds?: number;
  /** Whether the task completed successfully. */
  success: boolean;
  /** The result text (if any). */
  resultText?: string;
  /** Whether the task was killed due to timeout. */
  timedOut?: boolean;
  /** The cleanup mode requested. */
  cleanup?: "delete" | "keep" | "idle";
  /** Task category inferred from the task description. */
  taskCategory?: "feature" | "bugfix" | "refactor" | "infrastructure";
}

export interface TaskCompletionResult {
  /** Quality rating assigned to this task. */
  qualityRating: TrackRecord["qualityRating"];
  /** Delivery status. */
  deliveredStatus: TrackRecord["deliveredStatus"];
  /** Estimated duration in days. */
  actualDays: number;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * Process a task completion event. The synchronous path does quality estimation.
 * Heavy DB writes are fire-and-forget.
 */
export function taskCompletionHook(params: TaskCompletionParams): TaskCompletionResult {
  if (!isHumanizationEnabled()) {
    return {
      qualityRating: "average",
      deliveredStatus: params.success ? "on_time" : "failed",
      actualDays: 0,
    };
  }

  const qualityRating = estimateQuality(params);
  const deliveredStatus = estimateDeliveryStatus(params);
  const actualMs = params.completedAt.getTime() - params.spawnedAt.getTime();
  const actualDays = actualMs / (1000 * 60 * 60 * 24);

  // Fire-and-forget: update track record, relationships, and skill progression
  fireAndForget("task-completion:track-record", async () => {
    await updateTrackRecord(params, qualityRating, deliveredStatus, actualDays);
  });

  fireAndForget("task-completion:relationships", async () => {
    await updateRelationshipScores(params, qualityRating);
  });

  fireAndForget("task-completion:skills", async () => {
    await recordSkillProgression(params, qualityRating);
  });

  return { qualityRating, deliveredStatus, actualDays };
}

// ---------------------------------------------------------------------------
// Quality estimation heuristics
// ---------------------------------------------------------------------------

function estimateQuality(params: TaskCompletionParams): TrackRecord["qualityRating"] {
  if (!params.success) {
    return "poor";
  }
  if (params.timedOut) {
    return "poor";
  }

  const resultLength = params.resultText?.length ?? 0;

  // Very short results for a task may indicate incomplete work
  if (resultLength < 50 && !params.resultText?.toLowerCase().includes("complete")) {
    return "average";
  }

  // Check for error indicators in the result
  if (params.resultText) {
    const text = params.resultText.toLowerCase();
    if (text.includes("error") || text.includes("failed") || text.includes("could not")) {
      return "average";
    }
    if (text.includes("partial") || text.includes("incomplete")) {
      return "average";
    }
  }

  // Fast completion is good (completed well within planned timeout)
  if (params.plannedTimeoutSeconds && params.plannedTimeoutSeconds > 0) {
    const actualSeconds = (params.completedAt.getTime() - params.spawnedAt.getTime()) / 1000;
    const ratio = actualSeconds / params.plannedTimeoutSeconds;

    if (ratio < 0.3) {
      return "excellent";
    } // Done in less than 30% of allotted time
    if (ratio < 0.7) {
      return "good";
    } // Done in less than 70% of allotted time
    if (ratio < 1.0) {
      return "good";
    } // Done before timeout
  }

  // Substantive result text suggests thorough work
  if (resultLength > 500) {
    return "good";
  }
  if (resultLength > 200) {
    return "good";
  }

  return "good"; // Default to good for successful completions
}

function estimateDeliveryStatus(params: TaskCompletionParams): TrackRecord["deliveredStatus"] {
  if (!params.success) {
    return "failed";
  }
  if (params.timedOut) {
    return "late";
  }

  if (params.plannedTimeoutSeconds && params.plannedTimeoutSeconds > 0) {
    const actualSeconds = (params.completedAt.getTime() - params.spawnedAt.getTime()) / 1000;
    if (actualSeconds < params.plannedTimeoutSeconds * 0.5) {
      return "early";
    }
    if (actualSeconds < params.plannedTimeoutSeconds) {
      return "on_time";
    }
    return "late";
  }

  return "on_time";
}

// ---------------------------------------------------------------------------
// Async DB writes (fire-and-forget)
// ---------------------------------------------------------------------------

async function updateTrackRecord(
  params: TaskCompletionParams,
  qualityRating: TrackRecord["qualityRating"],
  deliveredStatus: TrackRecord["deliveredStatus"],
  actualDays: number,
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  const plannedDays = params.plannedTimeoutSeconds
    ? params.plannedTimeoutSeconds / (60 * 60 * 24)
    : actualDays; // If no planned time, assume planned = actual

  const _record: TrackRecord = {
    id: "",
    agentId: params.agentId,
    taskId: params.taskId,
    taskName: params.taskLabel,
    category: params.taskCategory,
    plannedDays,
    actualDays,
    qualityRating,
    deliveredStatus,
    completedAt: params.completedAt,
    notes: params.timedOut ? "Task timed out" : undefined,
  };

  // TODO: await service.insertTrackRecord(record);
  console.debug(
    `[humanization:task-completion] Track record: ${params.agentId} task=${params.taskId} ` +
      `quality=${qualityRating} status=${deliveredStatus} days=${actualDays.toFixed(3)}`,
  );
}

async function updateRelationshipScores(
  params: TaskCompletionParams,
  qualityRating: TrackRecord["qualityRating"],
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  // Skip self-relationships
  if (params.agentId === params.requesterAgentId) {
    return;
  }

  // Record the interaction in the in-memory tracker
  recordPairInteraction(params.agentId, params.requesterAgentId, {
    type: params.success ? "agree" : "challenge",
    timestamp: Date.now(),
    quality: qualityRating,
  });

  // Calculate relationship delta based on quality
  const qualityDelta: Record<string, number> = {
    excellent: 0.05,
    good: 0.02,
    average: 0,
    poor: -0.03,
  };

  const delta = qualityDelta[qualityRating] ?? 0;

  // TODO: await service.updateRelationship(params.agentId, params.requesterAgentId, {
  //   trustDelta: delta,
  //   interactionType: 'task_completion',
  //   quality: qualityRating,
  // });

  if (delta !== 0) {
    console.debug(
      `[humanization:task-completion] Relationship ${params.agentId}<->${params.requesterAgentId} ` +
        `trust delta: ${delta > 0 ? "+" : ""}${delta}`,
    );
  }
}

async function recordSkillProgression(
  params: TaskCompletionParams,
  qualityRating: TrackRecord["qualityRating"],
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  // Infer skill from task category
  const skillName = inferSkillFromTask(params);
  if (!skillName) {
    return;
  }

  // Quality maps to proficiency improvement
  const qualityToImprovement: Record<string, number> = {
    excellent: 0.02,
    good: 0.01,
    average: 0.005,
    poor: 0, // No improvement for poor quality — but no regression either
  };

  const improvement = qualityToImprovement[qualityRating] ?? 0;

  if (improvement > 0) {
    const _progress: LearningProgress = {
      time: new Date(),
      agentId: params.agentId,
      skillName,
      proficiency: improvement, // Will be added to current proficiency
      improvementRate: improvement,
      practiceHours: (params.completedAt.getTime() - params.spawnedAt.getTime()) / (1000 * 60 * 60),
    };

    // TODO: await service.recordLearningProgress(progress);
    console.debug(
      `[humanization:task-completion] Skill progression: ${params.agentId} ` +
        `skill=${skillName} improvement=${improvement}`,
    );
  }
}

function inferSkillFromTask(params: TaskCompletionParams): string | undefined {
  // Use explicit category if provided
  if (params.taskCategory) {
    return params.taskCategory;
  }

  // Try to infer from the task label
  const label = (params.taskLabel ?? "").toLowerCase();

  if (label.includes("test") || label.includes("spec")) {
    return "testing";
  }
  if (label.includes("refactor")) {
    return "refactor";
  }
  if (label.includes("fix") || label.includes("bug")) {
    return "bugfix";
  }
  if (label.includes("deploy") || label.includes("ci") || label.includes("infra")) {
    return "infrastructure";
  }
  if (label.includes("review") || label.includes("code review")) {
    return "code_review";
  }
  if (label.includes("doc") || label.includes("readme")) {
    return "documentation";
  }
  if (label.includes("design") || label.includes("architect")) {
    return "architecture";
  }
  if (label.includes("feature") || label.includes("implement") || label.includes("create")) {
    return "feature";
  }

  return "general";
}
