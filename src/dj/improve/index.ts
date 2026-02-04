/**
 * Improve (Self-Improvement Mode) Module for DJ Assistant
 *
 * Exports for PR-only governance with strict security guardrails.
 */

// Types
export {
  DEFAULT_BLOCKLIST,
  DEFAULT_IMPROVE_CONFIG,
  MAX_PR_LINES,
  NEVER_AUTO_MERGE,
  type BlocklistCheckResult,
  type CreatePrOptions,
  type CreatePrResult,
  type ImproveConfig,
  type ImproveOpportunityId,
  type ImprovePlan,
  type ImprovePlanId,
  type ImprovePlanStatus,
  type ImproveServiceConfig,
  type ImproveStatusResult,
  type ImprovementOpportunity,
  type OpportunityConfidence,
  type OpportunityType,
  type PlanOptions,
  type ScanOptions,
  type ScanResult,
} from "./improve-types.js";

// Sources (scanning and filtering)
export {
  buildFullBlocklist,
  calculateTotalLines,
  checkBlocklist,
  filterByBlocklist,
  filterByScope,
  filterToLineBudget,
  generateOpportunityId,
  isValidOpportunityId,
  matchesScope,
  sortOpportunities,
} from "./improve-sources.js";

// Service
export {
  createImproveService,
  generatePlanId,
  ImproveService,
  isValidPlanId,
} from "./improve-service.js";
