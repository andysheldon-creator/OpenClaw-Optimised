/**
 * SHARPS EDGE Builder Edition - Shared Types
 */

// Severity levels for the Nine Laws alert system
export enum Severity {
  INFO = "INFO",
  WARN = "WARN",
  BLOCK = "BLOCK",
  REJECT = "REJECT",
  CRITICAL = "CRITICAL",
}

// Project lifecycle states
export type ProjectStatus = "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETE" | "ARCHIVED";

// Project charter definition
export type ProjectCharter = {
  id: string;
  objective: string;
  scopeIn: string[];
  scopeOut: string[];
  guardrails: string[];
  successCriteria: string[];
};

// Conflict detection check result
export type ConflictResult =
  | { status: "PASS" }
  | { status: "BLOCK"; check: string; reason: string }
  | { status: "REJECT"; check: string; reason: string }
  | { status: "CRITICAL"; check: string; reason: string };

// Structured audit log entry
export type AuditLogEntry = {
  timestamp: string;
  severity: Severity;
  projectId: string;
  event: string;
  action: string;
  details: Record<string, unknown>;
  outcome: "pass" | "blocked" | "rejected" | "completed" | "failed";
};

// Cost tracking entry
export type CostEntry = {
  timestamp: string;
  projectId: string;
  toolName: string;
  estimatedCostUsd: number;
  cumulativeMonthUsd: number;
};

// Budget state persisted to disk
export type BudgetState = {
  month: string; // YYYY-MM
  totalSpentUsd: number;
  entries: CostEntry[];
  apiQuotas: Record<
    string,
    {
      limit: number;
      used: number;
      resetsAt: "daily" | "monthly";
    }
  >;
};

// Plugin configuration
export type SharpsEdgeConfig = {
  projectDir?: string;
  budgetMonthlyUsd?: number;
  budgetAlertThreshold?: number;
  conflictDetection?: {
    enabled?: boolean;
    strictMode?: boolean;
  };
  severityRouting?: Record<string, string>;
};

// Tools that modify state and should be conflict-checked
export const MODIFYING_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "exec",
  "shell",
  "bash",
  "run_command",
  "create_file",
  "delete_file",
  "move_file",
  "rename_file",
]);

// Default budget
export const DEFAULT_BUDGET_MONTHLY_USD = 200;
export const DEFAULT_BUDGET_ALERT_THRESHOLD = 0.8;
export const DEFAULT_BUDGET_BLOCK_THRESHOLD = 0.95;
