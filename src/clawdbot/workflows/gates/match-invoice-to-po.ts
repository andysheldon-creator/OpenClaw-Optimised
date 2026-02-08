/**
 * BIZ-049 (#141) — Approval gate: Match invoice to purchase order
 *
 * Defines the approval gate type for the invoice-to-PO matching workflow.
 * When an invoice is received, this gate pauses execution until a finance
 * team member verifies that the invoice line items match the corresponding
 * purchase order within acceptable tolerance.
 */

// ---------------------------------------------------------------------------
// Matching result types
// ---------------------------------------------------------------------------

/** How closely a line item matches its PO counterpart. */
export type MatchStatus =
  | "exact" // Amount and description match perfectly
  | "within_tolerance" // Amount differs by less than the configured threshold
  | "over_threshold" // Amount exceeds the tolerance — requires approval
  | "unmatched"; // No corresponding PO line item found

/** A single line-item match result. */
export type InvoicePoLineMatch = {
  /** Invoice line item description. */
  invoiceDescription: string;
  /** Invoice line item amount. */
  invoiceAmount: number;
  /** Matched PO line item description (null if unmatched). */
  poDescription: string | null;
  /** Matched PO line item amount (null if unmatched). */
  poAmount: number | null;
  /** Absolute variance between invoice and PO amounts. */
  variance: number;
  /** Percentage variance (0-100). */
  variancePercent: number;
  /** Match classification. */
  status: MatchStatus;
};

// ---------------------------------------------------------------------------
// Gate configuration
// ---------------------------------------------------------------------------

/** Configuration for the invoice-to-PO matching approval gate. */
export type InvoicePoGateConfig = {
  /**
   * Maximum allowed variance percentage before requiring approval.
   * Line items within this threshold auto-approve.
   * Default: 5 (5%).
   */
  tolerancePercent: number;
  /**
   * Maximum allowed absolute variance amount (in invoice currency)
   * before requiring approval, regardless of percentage.
   * Default: 500.
   */
  toleranceAbsolute: number;
  /**
   * Whether unmatched invoice lines (no PO counterpart) require approval.
   * Default: true.
   */
  requireApprovalForUnmatched: boolean;
  /**
   * Role required to approve this gate.
   * Empty string means any authorized user.
   */
  approverRole: string;
  /**
   * Timeout in minutes before the approval request auto-expires.
   * Default: 2880 (48 hours).
   */
  timeoutMinutes: number;
};

/** Sensible defaults for the invoice-to-PO gate. */
export const DEFAULT_INVOICE_PO_GATE_CONFIG: InvoicePoGateConfig = {
  tolerancePercent: 5,
  toleranceAbsolute: 500,
  requireApprovalForUnmatched: true,
  approverRole: "finance-approver",
  timeoutMinutes: 2880,
};

// ---------------------------------------------------------------------------
// Gate input / output
// ---------------------------------------------------------------------------

/** Data snapshot attached to the approval request for reviewer context. */
export type InvoicePoGateSnapshot = {
  /** Invoice number being matched. */
  invoiceNumber: string;
  /** Purchase order number being matched against. */
  poNumber: string;
  /** Vendor name on the invoice. */
  vendorName: string;
  /** Invoice currency code. */
  currency: string;
  /** Total invoice amount. */
  invoiceTotal: number;
  /** Total PO amount. */
  poTotal: number;
  /** Line-by-line match results. */
  lineMatches: InvoicePoLineMatch[];
  /** Number of lines that require manual review. */
  linesRequiringReview: number;
  /** Overall match score (0.0 to 1.0). */
  overallMatchScore: number;
  /** ISO-8601 timestamp of when the matching was performed. */
  matchedAt: string;
};

/** Result after the gate decision is made. */
export type InvoicePoGateResult = {
  /** Whether the match was approved. */
  approved: boolean;
  /** The user who made the decision. */
  approver: string;
  /** ISO-8601 timestamp of the decision. */
  decidedAt: string;
  /** Optional comment from the approver. */
  comment?: string;
  /** Whether any line items were adjusted during review. */
  adjustmentsMade: boolean;
  /** Adjusted line items, if any. */
  adjustedLines?: Array<{
    lineIndex: number;
    originalAmount: number;
    adjustedAmount: number;
    reason: string;
  }>;
};

// ---------------------------------------------------------------------------
// Matching logic (pure function, no side effects)
// ---------------------------------------------------------------------------

/**
 * Classify a single line-item match based on the gate configuration.
 *
 * @param invoiceAmount - Amount on the invoice line.
 * @param poAmount - Amount on the PO line (null if unmatched).
 * @param config - Gate tolerance configuration.
 * @returns The match status for this line.
 */
export function classifyMatch(
  invoiceAmount: number,
  poAmount: number | null,
  config: InvoicePoGateConfig = DEFAULT_INVOICE_PO_GATE_CONFIG,
): MatchStatus {
  if (poAmount === null) {
    return "unmatched";
  }

  const variance = Math.abs(invoiceAmount - poAmount);
  const variancePercent = poAmount === 0 ? (variance > 0 ? 100 : 0) : (variance / poAmount) * 100;

  if (variance === 0) {
    return "exact";
  }
  if (variancePercent <= config.tolerancePercent && variance <= config.toleranceAbsolute) {
    return "within_tolerance";
  }
  return "over_threshold";
}

/**
 * Determine whether the gate should require manual approval based on
 * the overall match results.
 *
 * @param lineMatches - Array of line match results.
 * @param config - Gate configuration.
 * @returns True if manual approval is required.
 */
export function requiresApproval(
  lineMatches: InvoicePoLineMatch[],
  config: InvoicePoGateConfig = DEFAULT_INVOICE_PO_GATE_CONFIG,
): boolean {
  return lineMatches.some((line) => {
    if (line.status === "over_threshold") {
      return true;
    }
    if (line.status === "unmatched" && config.requireApprovalForUnmatched) {
      return true;
    }
    return false;
  });
}
