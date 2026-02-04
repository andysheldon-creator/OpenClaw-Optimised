/**
 * Recursive Language Model (RLM) Types for DJ Assistant
 *
 * Type definitions for bounded iterative refinement with explicit caps,
 * BudgetGovernor integration, and Notion audit trail.
 */

import type { BudgetProfileId } from "../../budget/types.js";

// =============================================================================
// Hard Caps (enforced at validation)
// =============================================================================

/** Maximum allowed depth for recursion */
export const RLM_MAX_DEPTH = 4;

/** Maximum allowed subagents per session */
export const RLM_MAX_SUBAGENTS = 3;

/** Maximum allowed iterations per session */
export const RLM_MAX_ITERATIONS = 10;

// =============================================================================
// Session ID
// =============================================================================

/** RLM Session ID format: rlm-xxxx */
export type RlmSessionId = `rlm-${string}`;

// =============================================================================
// Configuration
// =============================================================================

export interface RlmConfig {
  /** Maximum recursion depth (default: 2, max: 4) */
  maxDepth: number;
  /** Maximum subagent spawns (default: 0, max: 3) */
  maxSubagents: number;
  /** Maximum iterations (default: 3, max: 10) */
  maxIterations: number;
  /** Budget profile for each iteration */
  budgetProfile: BudgetProfileId;
}

/** Default RLM configuration */
export const DEFAULT_RLM_CONFIG: RlmConfig = {
  maxDepth: 2,
  maxSubagents: 0,
  maxIterations: 3,
  budgetProfile: "normal",
};

// =============================================================================
// Iteration Tracking
// =============================================================================

export interface RlmIteration {
  /** Iteration number (1-indexed) */
  iterationNumber: number;
  /** Current recursion depth */
  depth: number;
  /** Input for this iteration */
  input: string;
  /** Output from this iteration */
  output: string;
  /** Why refinement was triggered (if applicable) */
  refinementReason?: string;
  /** Tokens used in this iteration (input + output) */
  tokensUsed: number;
  /** Tool calls made in this iteration */
  toolCallsUsed: number;
  /** Duration of this iteration in milliseconds */
  durationMs: number;
  /** Whether a subagent was spawned in this iteration */
  subagentSpawned?: boolean;
  /** When iteration started */
  startedAt: string;
  /** When iteration completed */
  completedAt: string;
}

// =============================================================================
// Session State
// =============================================================================

export type RlmSessionStatus = "running" | "completed" | "stopped" | "error";

export interface RlmSession {
  /** Unique session identifier */
  sessionId: RlmSessionId;
  /** Original task description */
  task: string;
  /** Session configuration (with validated caps) */
  config: RlmConfig;
  /** All iterations in this session */
  iterations: RlmIteration[];
  /** Current session status */
  status: RlmSessionStatus;
  /** Why session stopped (if stopped early) */
  stopReason?: RlmStopReason;
  /** When session started */
  startedAt: string;
  /** When session completed (if finished) */
  completedAt?: string;
  /** Final output (if completed successfully) */
  finalOutput?: string;
  /** Notion page ID for audit trail */
  notionPageId?: string;
}

export type RlmStopReason =
  | "completed" // Task successfully completed
  | "max_iterations" // Hit iteration cap
  | "max_depth" // Hit depth cap
  | "max_subagents" // Hit subagent cap
  | "budget_exceeded" // BudgetGovernor stopped
  | "user_cancelled" // User requested stop
  | "error" // Unrecoverable error
  | "no_refinement"; // Output deemed satisfactory

// =============================================================================
// Operation Results
// =============================================================================

export interface RlmResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** Final output text */
  output: string;
  /** Number of iterations executed */
  iterationCount: number;
  /** Total tokens used across all iterations */
  totalTokens: number;
  /** Total tool calls across all iterations */
  totalToolCalls: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Whether stopped before natural completion */
  stoppedEarly: boolean;
  /** Why stopped (if stopped early) */
  stopReason?: RlmStopReason;
  /** Session ID for audit trail */
  sessionId: RlmSessionId;
  /** Error message if failed */
  error?: string;
}

export interface RlmStatusResult {
  success: boolean;
  session?: RlmSession;
  message: string;
}

export interface RlmHistoryResult {
  success: boolean;
  sessions: RlmSessionSummary[];
  totalCount: number;
  message: string;
}

export interface RlmSessionSummary {
  sessionId: RlmSessionId;
  task: string;
  status: RlmSessionStatus;
  iterationCount: number;
  totalTokens: number;
  startedAt: string;
  completedAt?: string;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface RlmServiceConfig {
  /** Default budget profile (default: "normal") */
  defaultBudgetProfile?: BudgetProfileId;
  /** Default max depth (default: 2) */
  defaultMaxDepth?: number;
  /** Default max iterations (default: 3) */
  defaultMaxIterations?: number;
  /** Default max subagents (default: 0) */
  defaultMaxSubagents?: number;
  /** Notion database ID for RLM sessions */
  notionRlmDbId?: string;
}

// =============================================================================
// Run Options
// =============================================================================

export interface RlmRunOptions {
  /** Override max depth for this run */
  maxDepth?: number;
  /** Override max subagents for this run */
  maxSubagents?: number;
  /** Override max iterations for this run */
  maxIterations?: number;
  /** Override budget profile for this run */
  budgetProfile?: BudgetProfileId;
  /** Skip Notion logging for this run */
  skipNotionLog?: boolean;
}

// =============================================================================
// Refinement Decision
// =============================================================================

export interface RefinementDecision {
  /** Whether to refine (continue iterating) */
  shouldRefine: boolean;
  /** Reason for decision */
  reason: string;
  /** Suggested focus for next iteration (if refining) */
  focusArea?: string;
  /** Confidence in decision (0-1) */
  confidence: number;
}
