/**
 * RLM (Recursive Language Model) Module for DJ Assistant
 *
 * Exports for bounded iterative refinement with explicit caps,
 * BudgetGovernor integration, and Notion audit trail.
 */

// Types
export {
  DEFAULT_RLM_CONFIG,
  RLM_MAX_DEPTH,
  RLM_MAX_ITERATIONS,
  RLM_MAX_SUBAGENTS,
  type RefinementDecision,
  type RlmConfig,
  type RlmHistoryResult,
  type RlmIteration,
  type RlmResult,
  type RlmRunOptions,
  type RlmServiceConfig,
  type RlmSession,
  type RlmSessionId,
  type RlmSessionStatus,
  type RlmSessionSummary,
  type RlmStatusResult,
  type RlmStopReason,
} from "./rlm-types.js";

// Store
export {
  createRlmStore,
  generateRlmSessionId,
  isValidRlmSessionId,
  RlmStore,
  type RlmStoreConfig,
} from "./rlm-store.js";

// Service
export { createRlmService, RlmService, type RlmExecutor } from "./rlm-service.js";
