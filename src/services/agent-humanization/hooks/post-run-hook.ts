/**
 * Post-Run Hook — Called after each LLM turn completes
 *
 * Records the outcome (success/failure/partial based on response quality heuristics),
 * updates energy state (tokens consumed, context switches), extracts learnings if
 * applicable, updates reputation score incrementally, and detects patterns for
 * intuition rule creation.
 *
 * All updates are fire-and-forget — this hook must not block the pipeline.
 */

import type { EnergyState, DecisionLog } from "../models/types.js";
import {
  isHumanizationEnabled,
  getHumanizationService,
  fireAndForget,
  setCachedEnergy,
  getCachedEnergy,
  incrementMistakeCount,
  incrementSuccessCount,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunOutcome = "success" | "failure" | "partial";

export interface PostRunHookParams {
  agentId: string;
  sessionKey?: string;
  /** Duration of the LLM turn in milliseconds. */
  durationMs: number;
  /** Token usage from the run. */
  usage?: {
    input?: number;
    output?: number;
    total?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** Number of tool calls made during the turn. */
  toolCallCount?: number;
  /** Whether any tool calls returned errors. */
  hasToolErrors?: boolean;
  /** The assistant's final text output (for heuristic analysis). */
  assistantText?: string;
  /** Whether the run was aborted by the user. */
  aborted?: boolean;
  /** Whether this was an error response (context overflow, auth failure, etc.). */
  isError?: boolean;
  /** Error kind if applicable (context_overflow, role_ordering, etc.). */
  errorKind?: string;
  /** Whether the response was sent via messaging tool (fire-and-forget delivery). */
  didSendViaMessagingTool?: boolean;
  /** Previous session key — used to detect context switches. */
  previousSessionKey?: string;
}

export interface PostRunResult {
  /** The determined outcome of the run. */
  outcome: RunOutcome;
  /** Updated energy level after this turn. */
  energyLevel?: number;
  /** Whether a mistake pattern was detected (3+ occurrences). */
  mistakePatternDetected?: string;
  /** Whether an intuition rule candidate was detected (5+ successes). */
  intuitionCandidate?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base energy cost per LLM turn (as a fraction of 1.0). */
const BASE_TURN_COST = 0.02;

/** Additional energy cost per 1000 tokens. */
const COST_PER_1K_TOKENS = 0.005;

/** Additional energy cost per tool call. */
const COST_PER_TOOL_CALL = 0.008;

/** Extra cost for a context switch (different session). */
const CONTEXT_SWITCH_COST = 0.03;

/** Deep work bonus — reduces energy cost when staying on the same session. */
const DEEP_WORK_DISCOUNT = 0.3; // 30% less cost

/** Threshold for creating a mistake pattern entry. */
const MISTAKE_PATTERN_THRESHOLD = 3;

/** Threshold for creating an intuition rule candidate. */
const INTUITION_RULE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * Execute the post-run hook.
 *
 * The synchronous path determines the outcome and energy delta quickly.
 * Heavy DB writes are scheduled via fire-and-forget.
 */
export function postRunHook(params: PostRunHookParams): PostRunResult {
  if (!isHumanizationEnabled()) {
    return { outcome: "success" };
  }

  const outcome = determineOutcome(params);
  const energyDelta = calculateEnergyDelta(params);
  const newEnergyLevel = updateLocalEnergy(params.agentId, energyDelta);

  // Detect patterns synchronously
  const mistakePatternDetected = detectMistakePattern(params, outcome);
  const intuitionCandidate = detectIntuitionCandidate(params, outcome);

  // Schedule all DB writes as fire-and-forget
  fireAndForget("post-run:record", async () => {
    await recordOutcome(params, outcome, newEnergyLevel);
  });

  if (mistakePatternDetected) {
    fireAndForget("post-run:mistake-pattern", async () => {
      await recordMistakePattern(params.agentId, mistakePatternDetected);
    });
  }

  if (intuitionCandidate) {
    fireAndForget("post-run:intuition-candidate", async () => {
      await recordIntuitionCandidate(params.agentId, intuitionCandidate);
    });
  }

  return {
    outcome,
    energyLevel: newEnergyLevel,
    mistakePatternDetected,
    intuitionCandidate,
  };
}

// ---------------------------------------------------------------------------
// Outcome determination — quality heuristics
// ---------------------------------------------------------------------------

function determineOutcome(params: PostRunHookParams): RunOutcome {
  // Clear failures
  if (params.aborted) {
    return "failure";
  }
  if (params.isError) {
    return "failure";
  }
  if (params.errorKind === "context_overflow") {
    return "failure";
  }
  if (params.errorKind === "role_ordering") {
    return "failure";
  }

  // Check for error indicators in assistant text
  if (params.assistantText) {
    const text = params.assistantText.toLowerCase();
    // Explicit error/apology markers
    if (
      text.includes("i apologize") ||
      text.includes("i'm sorry, i can't") ||
      text.includes("error occurred")
    ) {
      return "partial";
    }
  }

  // Mixed tool call results
  if (params.hasToolErrors && params.toolCallCount && params.toolCallCount > 0) {
    // If some tools errored but not all, it's partial
    return "partial";
  }

  // Tool errors with no successful output
  if (params.hasToolErrors && !params.assistantText?.trim()) {
    return "failure";
  }

  // No output at all (shouldn't happen normally)
  if (!params.assistantText?.trim() && !params.didSendViaMessagingTool) {
    return "partial";
  }

  return "success";
}

// ---------------------------------------------------------------------------
// Energy model
// ---------------------------------------------------------------------------

function calculateEnergyDelta(params: PostRunHookParams): number {
  let cost = BASE_TURN_COST;

  // Token cost
  const totalTokens =
    params.usage?.total ?? (params.usage?.input ?? 0) + (params.usage?.output ?? 0);
  if (totalTokens > 0) {
    cost += (totalTokens / 1000) * COST_PER_1K_TOKENS;
  }

  // Tool call cost
  if (params.toolCallCount && params.toolCallCount > 0) {
    cost += params.toolCallCount * COST_PER_TOOL_CALL;
  }

  // Context switch penalty
  if (
    params.previousSessionKey &&
    params.sessionKey &&
    params.previousSessionKey !== params.sessionKey
  ) {
    cost += CONTEXT_SWITCH_COST;
  } else if (params.previousSessionKey && params.previousSessionKey === params.sessionKey) {
    // Deep work discount — same session, sequential turns
    cost *= 1 - DEEP_WORK_DISCOUNT;
  }

  // Cap the cost per turn at 0.15 to avoid energy crashing on big runs
  return -Math.min(cost, 0.15);
}

function updateLocalEnergy(agentId: string, delta: number): number {
  const current = getCachedEnergy(agentId);
  const currentLevel = current?.energyLevel ?? 0.7;
  const newLevel = Math.max(0, Math.min(1, currentLevel + delta));

  // Update the local cache
  const newState: EnergyState = {
    id: current?.id ?? "",
    agentId,
    currentHour: new Date().toISOString().slice(11, 16),
    energyLevel: newLevel,
    focusLevel: current?.focusLevel ?? 0.7,
    contextSwitchesToday:
      (current?.contextSwitchesToday ?? 0) + (delta < -CONTEXT_SWITCH_COST + 0.001 ? 0 : 0),
    deepWorkMinutes: current?.deepWorkMinutes ?? 0,
    qualityVariance: current?.qualityVariance ?? 0,
    lastUpdated: new Date(),
  };

  setCachedEnergy(agentId, newState);
  return newLevel;
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

function detectMistakePattern(params: PostRunHookParams, outcome: RunOutcome): string | undefined {
  if (outcome === "success") {
    return undefined;
  }

  // Categorize the error type
  const errorType = categorizeError(params);
  if (!errorType) {
    return undefined;
  }

  const count = incrementMistakeCount(params.agentId, errorType);
  if (count >= MISTAKE_PATTERN_THRESHOLD) {
    return errorType;
  }
  return undefined;
}

function detectIntuitionCandidate(
  params: PostRunHookParams,
  outcome: RunOutcome,
): string | undefined {
  if (outcome !== "success") {
    return undefined;
  }

  // Categorize the approach type based on what tools were used / task type
  const approachType = categorizeApproach(params);
  if (!approachType) {
    return undefined;
  }

  const count = incrementSuccessCount(params.agentId, approachType);
  if (count >= INTUITION_RULE_THRESHOLD) {
    return approachType;
  }
  return undefined;
}

function categorizeError(params: PostRunHookParams): string | undefined {
  if (params.errorKind) {
    return params.errorKind;
  }
  if (params.aborted) {
    return "user_abort";
  }
  if (params.hasToolErrors) {
    return "tool_execution_error";
  }
  if (params.assistantText?.toLowerCase().includes("i apologize")) {
    return "apology_response";
  }
  if (params.assistantText?.toLowerCase().includes("error occurred")) {
    return "runtime_error";
  }
  return "unknown_failure";
}

function categorizeApproach(params: PostRunHookParams): string | undefined {
  if (!params.sessionKey) {
    return undefined;
  }

  // Derive approach from tool usage pattern
  if (params.toolCallCount && params.toolCallCount > 3) {
    return "multi_tool_orchestration";
  }
  if (params.toolCallCount && params.toolCallCount > 0) {
    return "tool_assisted";
  }
  if (params.didSendViaMessagingTool) {
    return "messaging_delivery";
  }
  if ((params.usage?.output ?? 0) > 2000) {
    return "detailed_response";
  }
  return "direct_response";
}

// ---------------------------------------------------------------------------
// Async DB writes (fire-and-forget)
// ---------------------------------------------------------------------------

async function recordOutcome(
  params: PostRunHookParams,
  outcome: RunOutcome,
  energyLevel: number,
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  // Record decision log entry
  // This will be implemented when the service has the recordDecision method.
  // For now, we structure the data so it's ready for persistence.

  const _decisionLog: DecisionLog = {
    time: new Date(),
    agentId: params.agentId,
    decisionType: "autonomous",
    decisionQuality: outcomeToQuality(outcome),
    outcome: outcome === "success" ? "success" : outcome === "failure" ? "failure" : "partial",
    confidenceLevel: outcome === "success" ? 80 : outcome === "partial" ? 50 : 20,
    impactScore: undefined,
    context: {
      sessionKey: params.sessionKey,
      durationMs: params.durationMs,
      toolCallCount: params.toolCallCount,
      tokenUsage: params.usage?.total,
      energyLevel,
    },
  };

  // TODO: await service.recordDecision(decisionLog);
  // TODO: await service.updateEnergyState(params.agentId, { energyLevel });
  // TODO: await service.updateReputationIncremental(params.agentId, outcome);

  // For now, log so we know it would have been persisted.
  if (outcome !== "success") {
    console.debug(
      `[humanization:post-run] Recorded ${outcome} for ${params.agentId} (energy: ${(energyLevel * 100).toFixed(0)}%)`,
    );
  }
}

async function recordMistakePattern(agentId: string, errorType: string): Promise<void> {
  // TODO: Persist to agent_mistake_patterns table
  console.debug(
    `[humanization:post-run] Mistake pattern detected for ${agentId}: ${errorType} (3+ occurrences in 24h)`,
  );
}

async function recordIntuitionCandidate(agentId: string, approachType: string): Promise<void> {
  // TODO: Persist to agent_intuition_rules table
  console.debug(
    `[humanization:post-run] Intuition rule candidate for ${agentId}: ${approachType} (5+ successes)`,
  );
}

function outcomeToQuality(outcome: RunOutcome): DecisionLog["decisionQuality"] {
  switch (outcome) {
    case "success":
      return "good";
    case "partial":
      return "acceptable";
    case "failure":
      return "poor";
  }
}
