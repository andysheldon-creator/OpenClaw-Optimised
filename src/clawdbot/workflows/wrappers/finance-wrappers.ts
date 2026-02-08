/**
 * Finance workflow wrapper types — Business Skill Packs
 *
 * Covers:
 *   - BIZ-044 (#134) Invoice processing workflow wrapper
 *   - BIZ-047 (#137) Expense report approval workflow wrapper
 *   - BIZ-050 (#140) Budget variance alert workflow wrapper
 *   - BIZ-053 (#143) Revenue reconciliation workflow wrapper
 *
 * Each wrapper type defines the orchestration shape for its Finance
 * workflow, including inputs, outputs, step definitions, and execution state.
 */

import type {
  PaymentTerms,
  InvoiceLineItem,
  MoneyAmount,
  ExpenseLine,
  BudgetVarianceLine,
  RevenueSource,
  ReconciliationDiscrepancy,
} from "../gates/finance-gates.js";
import type { RetryPolicy, ErrorHandler } from "../retry-policy.js";
import type { WorkflowTrigger } from "../trigger.js";

// ---------------------------------------------------------------------------
// Shared wrapper types
// ---------------------------------------------------------------------------

/** Execution status for a workflow run. */
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

/** Common fields shared by all Finance workflow wrappers. */
export type FinanceWrapperBase = {
  /** Workflow definition ID (template). */
  workflowId: string;
  /** Unique execution / run ID. */
  runId: string;
  /** Current execution status. */
  status: WorkflowRunStatus;
  /** Trigger that initiated this run. */
  trigger: WorkflowTrigger;
  /** Retry policy applied to recoverable steps. */
  retryPolicy: RetryPolicy;
  /** Error handler for unrecoverable failures. */
  errorHandler: ErrorHandler;
  /** ISO-8601 timestamp when the run started. */
  startedAt: string;
  /** ISO-8601 timestamp when the run completed (if finished). */
  completedAt?: string;
  /** Wall-clock duration in milliseconds (set on completion). */
  durationMs?: number;
};

// ---------------------------------------------------------------------------
// BIZ-044 (#134) — Invoice processing workflow wrapper
// ---------------------------------------------------------------------------

/** Step identifiers for the invoice processing workflow. */
export type InvoiceProcessingStep =
  | "receive_invoice"
  | "extract_data"
  | "match_purchase_order"
  | "validate_line_items"
  | "apply_gl_codes"
  | "approval_gate"
  | "schedule_payment"
  | "update_ledger"
  | "notify_accounts_payable";

/** Input parameters for the invoice processing workflow. */
export type InvoiceProcessingInput = {
  /** Source of the invoice (e.g. "email", "upload", "api"). */
  source: string;
  /** Raw invoice document URL or file path. */
  documentUrl: string;
  /** Vendor name (if known in advance). */
  vendorName?: string;
  /** Whether to attempt automatic PO matching. */
  autoMatchPo: boolean;
  /** Notification channel for accounts payable. */
  notificationChannel: string;
};

/** Output produced by the invoice processing workflow. */
export type InvoiceProcessingOutput = {
  /** Vendor name extracted from the invoice. */
  vendorName: string;
  /** Invoice number. */
  invoiceNumber: string;
  /** Invoice date (ISO-8601). */
  invoiceDate: string;
  /** Payment terms detected. */
  paymentTerms: PaymentTerms;
  /** Extracted line items. */
  lineItems: InvoiceLineItem[];
  /** Total invoice amount. */
  totalAmount: MoneyAmount;
  /** Whether a matching PO was found. */
  poMatched: boolean;
  /** PO number (if matched). */
  poNumber?: string;
  /** Data extraction confidence (0-1). */
  extractionConfidence: number;
  /** Payment scheduled date (ISO-8601). */
  paymentScheduledDate: string;
  /** Summary message. */
  summaryMessage: string;
};

/**
 * Workflow wrapper for invoice processing.
 * Orchestrates receiving invoices from multiple sources, extracting
 * data with OCR/AI, matching against purchase orders, validating
 * line items, applying GL codes, gating on finance approval, then
 * scheduling payment and updating the ledger.
 */
export type InvoiceProcessingWrapper = FinanceWrapperBase & {
  kind: "invoice_processing";
  input: InvoiceProcessingInput;
  output?: InvoiceProcessingOutput;
  currentStep: InvoiceProcessingStep;
};

// ---------------------------------------------------------------------------
// BIZ-047 (#137) — Expense report approval workflow wrapper
// ---------------------------------------------------------------------------

/** Step identifiers for the expense report workflow. */
export type ExpenseReportStep =
  | "receive_submission"
  | "validate_receipts"
  | "check_policy_limits"
  | "categorise_expenses"
  | "calculate_totals"
  | "approval_gate"
  | "process_reimbursement"
  | "update_ledger"
  | "notify_submitter";

/** Input parameters for the expense report workflow. */
export type ExpenseReportInput = {
  /** Employee who submitted the report. */
  submitterName: string;
  /** Submitter's email. */
  submitterEmail: string;
  /** Report title or description. */
  reportTitle: string;
  /** Expense lines submitted. */
  expenses: ExpenseLine[];
  /** Manager who should approve (role or user ID). */
  approverManager: string;
  /** Notification channel. */
  notificationChannel: string;
};

/** Output produced by the expense report workflow. */
export type ExpenseReportOutput = {
  /** Validated expense lines. */
  validatedExpenses: ExpenseLine[];
  /** Total amount for reimbursement. */
  totalAmount: MoneyAmount;
  /** Whether the report exceeds any policy limit. */
  exceedsPolicy: boolean;
  /** Policy violations detected. */
  policyViolations: string[];
  /** Reimbursement reference (if processed). */
  reimbursementRef?: string;
  /** Summary message for the submitter. */
  summaryMessage: string;
};

/**
 * Workflow wrapper for expense report approval.
 * Orchestrates receiving the submission, validating receipts,
 * checking policy limits, categorising expenses, gating on
 * manager approval, processing reimbursement, and notifying
 * the submitter.
 */
export type ExpenseReportWrapper = FinanceWrapperBase & {
  kind: "expense_report";
  input: ExpenseReportInput;
  output?: ExpenseReportOutput;
  currentStep: ExpenseReportStep;
};

// ---------------------------------------------------------------------------
// BIZ-050 (#140) — Budget variance alert workflow wrapper
// ---------------------------------------------------------------------------

/** Step identifiers for the budget variance alert workflow. */
export type BudgetVarianceStep =
  | "fetch_budget_data"
  | "fetch_actual_spend"
  | "calculate_variances"
  | "apply_thresholds"
  | "approval_gate"
  | "update_forecast"
  | "notify_stakeholders"
  | "generate_report";

/** Input parameters for the budget variance alert workflow. */
export type BudgetVarianceInput = {
  /** Reporting period (e.g. "2026-Q1", "2026-01"). */
  reportingPeriod: string;
  /** Variance threshold percentage that triggers an alert. */
  thresholdPercent: number;
  /** Budget categories to monitor (empty = all). */
  categories: string[];
  /** Whether to include forecasted adjustments. */
  includeForecast: boolean;
  /** Notification channel for stakeholders. */
  notificationChannel: string;
};

/** Output produced by the budget variance alert workflow. */
export type BudgetVarianceOutput = {
  /** Budget lines with notable variance. */
  variances: BudgetVarianceLine[];
  /** Total budget for the period. */
  totalBudget: MoneyAmount;
  /** Total actual spend for the period. */
  totalActual: MoneyAmount;
  /** Whether the forecast was updated. */
  forecastUpdated: boolean;
  /** URL to the variance report. */
  reportUrl: string;
  /** Summary message for stakeholder notification. */
  summaryMessage: string;
};

/**
 * Workflow wrapper for budget variance alerts.
 * Orchestrates fetching budget and actual spend data, calculating
 * variances, applying threshold filters, gating on finance controller
 * approval, updating the forecast, and notifying stakeholders.
 */
export type BudgetVarianceWrapper = FinanceWrapperBase & {
  kind: "budget_variance";
  input: BudgetVarianceInput;
  output?: BudgetVarianceOutput;
  currentStep: BudgetVarianceStep;
};

// ---------------------------------------------------------------------------
// BIZ-053 (#143) — Revenue reconciliation workflow wrapper
// ---------------------------------------------------------------------------

/** Step identifiers for the revenue reconciliation workflow. */
export type RevenueReconciliationStep =
  | "fetch_revenue_sources"
  | "normalise_transactions"
  | "match_transactions"
  | "identify_discrepancies"
  | "approval_gate"
  | "apply_adjustments"
  | "close_period"
  | "notify_finance_team";

/** Input parameters for the revenue reconciliation workflow. */
export type RevenueReconciliationInput = {
  /** Reconciliation period (ISO-8601 date range or month). */
  reconciliationPeriod: string;
  /** Revenue sources to include. */
  sources: RevenueSource[];
  /** Tolerance for auto-matching (minor currency units). */
  matchingToleranceMinor: number;
  /** Whether to auto-apply adjustments below tolerance. */
  autoApplySmallAdjustments: boolean;
  /** Notification channel for the finance team. */
  notificationChannel: string;
};

/** Output produced by the revenue reconciliation workflow. */
export type RevenueReconciliationOutput = {
  /** Total expected revenue. */
  expectedRevenue: MoneyAmount;
  /** Total actual revenue found. */
  actualRevenue: MoneyAmount;
  /** Discrepancies requiring review. */
  discrepancies: ReconciliationDiscrepancy[];
  /** Whether all transactions were matched. */
  fullyReconciled: boolean;
  /** Adjustments applied. */
  adjustmentsApplied: number;
  /** Whether the period was closed. */
  periodClosed: boolean;
  /** Summary message for finance team notification. */
  summaryMessage: string;
};

/**
 * Workflow wrapper for revenue reconciliation.
 * Orchestrates fetching revenue data from multiple sources,
 * normalising transactions, matching them, identifying discrepancies,
 * gating on finance manager approval, applying adjustments,
 * closing the period, and notifying the finance team.
 */
export type RevenueReconciliationWrapper = FinanceWrapperBase & {
  kind: "revenue_reconciliation";
  input: RevenueReconciliationInput;
  output?: RevenueReconciliationOutput;
  currentStep: RevenueReconciliationStep;
};

// ---------------------------------------------------------------------------
// Discriminated union of all Finance wrappers
// ---------------------------------------------------------------------------

/** Union of all Finance workflow wrapper configurations. */
export type FinanceWorkflowWrapper =
  | InvoiceProcessingWrapper
  | ExpenseReportWrapper
  | BudgetVarianceWrapper
  | RevenueReconciliationWrapper;
