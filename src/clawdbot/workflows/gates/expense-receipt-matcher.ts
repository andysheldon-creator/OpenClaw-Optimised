/**
 * BIZ-055 (#147) — Approval gate: Expense receipt matcher
 *
 * Defines the approval gate type for the expense receipt matching workflow.
 * When an expense claim is submitted, this gate pauses execution until a
 * manager verifies that the uploaded receipt matches the claimed expense
 * (amount, vendor, date, category).
 */

// ---------------------------------------------------------------------------
// Receipt data types
// ---------------------------------------------------------------------------

/** Data extracted from a receipt image/document. */
export type ReceiptData = {
  /** Vendor or merchant name from the receipt. */
  vendorName: string;
  /** Total amount on the receipt. */
  totalAmount: number;
  /** Currency code from the receipt. */
  currency: string;
  /** Date on the receipt (ISO-8601). */
  receiptDate: string;
  /** Tax amount if itemized on the receipt. */
  taxAmount: number | null;
  /** Payment method shown on receipt (e.g. "Visa ending 4242"). */
  paymentMethod: string | null;
  /** OCR confidence score for the extracted data (0.0 to 1.0). */
  extractionConfidence: number;
};

/** Data from the expense claim submitted by the employee. */
export type ExpenseClaimData = {
  /** Unique expense claim ID. */
  claimId: string;
  /** Employee who submitted the claim. */
  employeeId: string;
  /** Employee name. */
  employeeName: string;
  /** Claimed amount. */
  claimedAmount: number;
  /** Currency of the claim. */
  currency: string;
  /** Expense category (e.g. "travel", "meals", "software", "office-supplies"). */
  category: string;
  /** Description provided by the employee. */
  description: string;
  /** Date of the expense (ISO-8601). */
  expenseDate: string;
  /** Vendor name provided by the employee. */
  vendorName: string;
};

// ---------------------------------------------------------------------------
// Match result types
// ---------------------------------------------------------------------------

/** How well the receipt matches the expense claim. */
export type ExpenseMatchStatus =
  | "full_match" // All fields match within tolerance
  | "partial_match" // Some fields match, some differ
  | "amount_mismatch" // Amount differs beyond tolerance
  | "vendor_mismatch" // Vendor names do not match
  | "date_mismatch" // Dates differ by more than allowed
  | "no_receipt" // No receipt was provided
  | "low_confidence"; // OCR confidence too low for reliable matching

/** Detailed match result between a receipt and expense claim. */
export type ExpenseMatchResult = {
  /** Overall match status. */
  status: ExpenseMatchStatus;
  /** Whether the amount matches within tolerance. */
  amountMatch: boolean;
  /** Absolute variance between claimed and receipt amounts. */
  amountVariance: number;
  /** Whether the vendor names match (fuzzy). */
  vendorMatch: boolean;
  /** Whether the dates match within the allowed window. */
  dateMatch: boolean;
  /** Number of days between the claimed date and receipt date. */
  dateDifferenceD: number;
  /** Overall match confidence (0.0 to 1.0). */
  matchConfidence: number;
  /** List of specific issues found. */
  issues: string[];
};

// ---------------------------------------------------------------------------
// Gate configuration
// ---------------------------------------------------------------------------

/** Configuration for the expense receipt matcher approval gate. */
export type ExpenseReceiptGateConfig = {
  /**
   * Maximum allowed variance between claimed and receipt amounts.
   * Default: 5.00 (in claim currency).
   */
  amountToleranceAbsolute: number;
  /**
   * Maximum allowed percentage variance.
   * Default: 2 (2%).
   */
  amountTolerancePercent: number;
  /**
   * Maximum allowed date difference in days.
   * Default: 3.
   */
  dateDifferenceMaxDays: number;
  /**
   * Minimum OCR confidence required to trust the receipt extraction.
   * Below this threshold, the match is flagged as "low_confidence".
   * Default: 0.7.
   */
  minOcrConfidence: number;
  /**
   * Maximum claim amount that can be auto-approved without manager review.
   * Claims above this always require approval regardless of match quality.
   * Default: 250.
   */
  autoApproveMaxAmount: number;
  /**
   * Role required to approve flagged expense claims.
   * Default: "expense-approver".
   */
  approverRole: string;
  /**
   * Timeout in minutes before the request expires.
   * Default: 4320 (72 hours).
   */
  timeoutMinutes: number;
};

/** Sensible defaults for the expense receipt gate. */
export const DEFAULT_EXPENSE_RECEIPT_GATE_CONFIG: ExpenseReceiptGateConfig = {
  amountToleranceAbsolute: 5.0,
  amountTolerancePercent: 2,
  dateDifferenceMaxDays: 3,
  minOcrConfidence: 0.7,
  autoApproveMaxAmount: 250,
  approverRole: "expense-approver",
  timeoutMinutes: 4320,
};

// ---------------------------------------------------------------------------
// Gate snapshot
// ---------------------------------------------------------------------------

/** Data attached to the approval request for reviewer context. */
export type ExpenseReceiptGateSnapshot = {
  /** The expense claim details. */
  claim: ExpenseClaimData;
  /** The extracted receipt data (null if no receipt uploaded). */
  receipt: ReceiptData | null;
  /** The match result. */
  matchResult: ExpenseMatchResult;
  /** ISO-8601 timestamp of when the match was performed. */
  matchedAt: string;
};

// ---------------------------------------------------------------------------
// Matching logic (pure functions)
// ---------------------------------------------------------------------------

/**
 * Perform a fuzzy vendor name match.
 * Compares lowercase, trimmed names and checks for substring containment.
 */
export function vendorNamesMatch(claimVendor: string, receiptVendor: string): boolean {
  const a = claimVendor.toLowerCase().trim();
  const b = receiptVendor.toLowerCase().trim();
  if (a === b) {
    return true;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  return false;
}

/**
 * Match an expense claim against a receipt and produce a detailed result.
 *
 * @param claim - The expense claim data.
 * @param receipt - The extracted receipt data (null if no receipt).
 * @param config - Gate configuration.
 * @returns Detailed match result.
 */
export function matchExpenseToReceipt(
  claim: ExpenseClaimData,
  receipt: ReceiptData | null,
  config: ExpenseReceiptGateConfig = DEFAULT_EXPENSE_RECEIPT_GATE_CONFIG,
): ExpenseMatchResult {
  if (!receipt) {
    return {
      status: "no_receipt",
      amountMatch: false,
      amountVariance: claim.claimedAmount,
      vendorMatch: false,
      dateMatch: false,
      dateDifferenceD: 0,
      matchConfidence: 0,
      issues: ["No receipt provided with the expense claim."],
    };
  }

  // Check OCR confidence
  if (receipt.extractionConfidence < config.minOcrConfidence) {
    return {
      status: "low_confidence",
      amountMatch: false,
      amountVariance: Math.abs(claim.claimedAmount - receipt.totalAmount),
      vendorMatch: false,
      dateMatch: false,
      dateDifferenceD: 0,
      matchConfidence: receipt.extractionConfidence,
      issues: [
        `OCR confidence (${(receipt.extractionConfidence * 100).toFixed(0)}%) is below minimum threshold (${(config.minOcrConfidence * 100).toFixed(0)}%).`,
      ],
    };
  }

  const issues: string[] = [];

  // Amount comparison
  const amountVariance = Math.abs(claim.claimedAmount - receipt.totalAmount);
  const amountVariancePercent =
    receipt.totalAmount > 0
      ? (amountVariance / receipt.totalAmount) * 100
      : amountVariance > 0
        ? 100
        : 0;
  const amountMatch =
    amountVariance <= config.amountToleranceAbsolute &&
    amountVariancePercent <= config.amountTolerancePercent;
  if (!amountMatch) {
    issues.push(
      `Amount mismatch: claimed ${claim.currency} ${claim.claimedAmount}, receipt shows ${receipt.currency} ${receipt.totalAmount} (variance: ${amountVariance.toFixed(2)}).`,
    );
  }

  // Vendor comparison
  const vendorMatch = vendorNamesMatch(claim.vendorName, receipt.vendorName);
  if (!vendorMatch) {
    issues.push(
      `Vendor mismatch: claimed "${claim.vendorName}", receipt shows "${receipt.vendorName}".`,
    );
  }

  // Date comparison
  const claimDate = new Date(claim.expenseDate);
  const receiptDate = new Date(receipt.receiptDate);
  const dateDiffMs = Math.abs(claimDate.getTime() - receiptDate.getTime());
  const dateDifferenceD = Math.round(dateDiffMs / 86_400_000);
  const dateMatch = dateDifferenceD <= config.dateDifferenceMaxDays;
  if (!dateMatch) {
    issues.push(
      `Date mismatch: claimed ${claim.expenseDate}, receipt shows ${receipt.receiptDate} (${dateDifferenceD} days apart).`,
    );
  }

  // Determine overall status
  let status: ExpenseMatchStatus;
  if (amountMatch && vendorMatch && dateMatch) {
    status = "full_match";
  } else if (!amountMatch) {
    status = "amount_mismatch";
  } else if (!vendorMatch) {
    status = "vendor_mismatch";
  } else if (!dateMatch) {
    status = "date_mismatch";
  } else {
    status = "partial_match";
  }

  // Compute overall confidence
  const factors = [amountMatch ? 1 : 0, vendorMatch ? 1 : 0, dateMatch ? 1 : 0];
  const matchConfidence = factors.reduce((s, f) => s + f, 0) / factors.length;

  return {
    status,
    amountMatch,
    amountVariance: Math.round(amountVariance * 100) / 100,
    vendorMatch,
    dateMatch,
    dateDifferenceD,
    matchConfidence: Math.round(matchConfidence * 100) / 100,
    issues,
  };
}

/**
 * Determine whether manual approval is needed for this expense claim.
 *
 * @param claim - The expense claim.
 * @param matchResult - The match result.
 * @param config - Gate configuration.
 * @returns True if manual approval is required.
 */
export function requiresApproval(
  claim: ExpenseClaimData,
  matchResult: ExpenseMatchResult,
  config: ExpenseReceiptGateConfig = DEFAULT_EXPENSE_RECEIPT_GATE_CONFIG,
): boolean {
  // Always require approval above the auto-approve threshold
  if (claim.claimedAmount > config.autoApproveMaxAmount) {
    return true;
  }
  // Require approval for anything other than a full match
  if (matchResult.status !== "full_match") {
    return true;
  }
  return false;
}
