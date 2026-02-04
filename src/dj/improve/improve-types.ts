/**
 * Self-Improvement Mode Types for DJ Assistant
 *
 * Type definitions for PR-only governance with scanning, planning,
 * and strict security guardrails.
 */

import type { BudgetProfileId } from "../../budget/types.js";

// =============================================================================
// Security Constants
// =============================================================================

/** Default blocklist - files that can NEVER be modified */
export const DEFAULT_BLOCKLIST = [
  "src/dj/web-policy.ts",
  "src/dj/web-operator.ts",
  "**/allowlist*.ts",
  "**/allowlist*.json",
  "**/*.env*",
  "**/credentials/**",
  "**/secrets/**",
  "**/.env",
  "**/.env.*",
  "**/config/secrets.*",
];

/** Maximum lines changed per PR */
export const MAX_PR_LINES = 500;

/** Never-auto-merge flag (enforced, cannot be overridden) */
export const NEVER_AUTO_MERGE = true;

// =============================================================================
// Plan ID
// =============================================================================

/** Improve Plan ID format: imp-xxxx */
export type ImprovePlanId = `imp-${string}`;

/** Improvement Opportunity ID format: opp-xxxx */
export type ImproveOpportunityId = `opp-${string}`;

// =============================================================================
// Configuration
// =============================================================================

export interface ImproveConfig {
  /** Allowed paths (glob patterns) */
  scope: string[];
  /** Additional blocklist paths (merged with DEFAULT_BLOCKLIST) */
  customBlocklist: string[];
  /** Maximum lines changed per PR (capped at MAX_PR_LINES) */
  maxPrLines: number;
  /** Budget profile for scanning/planning */
  budgetProfile: BudgetProfileId;
}

/** Default Improve configuration */
export const DEFAULT_IMPROVE_CONFIG: ImproveConfig = {
  scope: ["src/**/*.ts"],
  customBlocklist: [],
  maxPrLines: 500,
  budgetProfile: "normal",
};

// =============================================================================
// Improvement Opportunities
// =============================================================================

export type OpportunityType = "refactor" | "bugfix" | "performance" | "test" | "docs";

export type OpportunityConfidence = "high" | "medium" | "low";

export interface ImprovementOpportunity {
  /** Unique opportunity identifier */
  id: ImproveOpportunityId;
  /** Type of improvement */
  type: OpportunityType;
  /** File path */
  file: string;
  /** Line number (if applicable) */
  line?: number;
  /** Description of the improvement */
  description: string;
  /** Confidence level */
  confidence: OpportunityConfidence;
  /** Estimated lines changed */
  estimatedLines: number;
  /** Suggested changes (for preview) */
  suggestedChanges?: string;
  /** Why this improvement matters */
  rationale?: string;
}

// =============================================================================
// Improvement Plans
// =============================================================================

export type ImprovePlanStatus =
  | "draft"
  | "approved"
  | "executing"
  | "pr-created"
  | "merged"
  | "rejected";

export interface ImprovePlan {
  /** Unique plan identifier */
  planId: ImprovePlanId;
  /** All opportunities in this plan */
  opportunities: ImprovementOpportunity[];
  /** IDs of selected opportunities */
  selectedIds: ImproveOpportunityId[];
  /** Current plan status */
  status: ImprovePlanStatus;
  /** Total estimated lines */
  estimatedLines: number;
  /** PR URL (if created) */
  prUrl?: string;
  /** PR number (if created) */
  prNumber?: number;
  /** Branch name (if created) */
  branchName?: string;
  /** When plan was created */
  createdAt: string;
  /** When PR was merged (if applicable) */
  mergedAt?: string;
  /** Notion page ID for audit trail */
  notionPageId?: string;
  /** Last error (if any) */
  lastError?: string;
}

// =============================================================================
// Scan Results
// =============================================================================

export interface ScanResult {
  /** Number of files scanned */
  scannedFiles: number;
  /** Discovered opportunities */
  opportunities: ImprovementOpportunity[];
  /** Files that were blocked (matched blocklist) */
  blockedFiles: string[];
  /** Whether scan was truncated due to budget */
  truncated: boolean;
  /** Total estimated lines if all applied */
  totalEstimatedLines: number;
  /** When scan was performed */
  scannedAt: string;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface ImproveServiceConfig {
  /** Default scope paths */
  defaultScope?: string[];
  /** Default budget profile */
  defaultBudgetProfile?: BudgetProfileId;
  /** Notion Plans database ID */
  notionPlansDbId?: string;
  /** Notion Opportunities database ID */
  notionOpportunitiesDbId?: string;
  /** GitHub repository in owner/repo format */
  githubRepo?: string;
  /** Base branch for PRs */
  baseBranch?: string;
}

// =============================================================================
// Operation Results
// =============================================================================

export interface ScanOptions {
  /** Override scope paths */
  scope?: string[];
  /** Additional blocklist paths */
  customBlocklist?: string[];
  /** Budget profile for scanning */
  budgetProfile?: BudgetProfileId;
  /** Skip Notion logging */
  skipNotionLog?: boolean;
}

export interface PlanOptions {
  /** Opportunity IDs to include in plan */
  opportunityIds: ImproveOpportunityId[];
  /** Skip Notion logging */
  skipNotionLog?: boolean;
}

export interface CreatePrOptions {
  /** Plan ID to create PR from */
  planId: ImprovePlanId;
  /** Custom commit message */
  commitMessage?: string;
  /** Custom branch name */
  branchName?: string;
}

export interface ImproveStatusResult {
  success: boolean;
  plan?: ImprovePlan;
  currentScope: string[];
  blocklist: string[];
  message: string;
}

export interface CreatePrResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  message: string;
  error?: string;
}

// =============================================================================
// Blocklist Matching
// =============================================================================

export interface BlocklistCheckResult {
  /** Whether file is blocked */
  blocked: boolean;
  /** Which pattern matched (if blocked) */
  matchedPattern?: string;
  /** Why it's blocked (for user feedback) */
  reason?: string;
}
