/**
 * OBS-003 (#87) -- Error taxonomy
 *
 * Defines a structured error classification system for the Clawdbot runtime.
 * Every error is categorised by domain and severity, making it straightforward
 * to build dashboards, alerts, and automated remediation on top of a
 * consistent error vocabulary.
 */

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

/** High-level domain categories for classifying errors. */
export type ErrorCategory =
  | "tool"
  | "skill"
  | "workflow"
  | "network"
  | "auth"
  | "validation"
  | "timeout"
  | "quota"
  | "internal";

// ---------------------------------------------------------------------------
// Error severity
// ---------------------------------------------------------------------------

/** Severity levels that drive alerting and escalation policy. */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Classified error
// ---------------------------------------------------------------------------

/** An error enriched with taxonomy metadata. */
export type ClassifiedError = {
  /** Machine-readable error code (e.g. "TOOL_BROWSER_TIMEOUT"). */
  code: string;
  /** Human-readable error description. */
  message: string;
  /** Domain category. */
  category: ErrorCategory;
  /** Severity level. */
  severity: ErrorSeverity;
  /** Whether the error is typically safe to retry. */
  retryable: boolean;
  /** Suggested remediation action (displayed to operators). */
  remediation?: string;
  /** The original error, if available. */
  cause?: Error;
};

// ---------------------------------------------------------------------------
// Standard error codes
// ---------------------------------------------------------------------------

/** Entry in the error taxonomy lookup table. */
type TaxonomyEntry = {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  message: string;
  remediation?: string;
};

/**
 * Canonical error taxonomy -- maps machine-readable codes to their
 * classification metadata.
 *
 * Extend this constant when new error patterns emerge.
 */
export const errorTaxonomy: Readonly<Record<string, TaxonomyEntry>> = {
  // -- Tool errors ----------------------------------------------------------
  TOOL_NOT_FOUND: {
    category: "tool",
    severity: "high",
    retryable: false,
    message: "Requested tool is not registered.",
    remediation: "Verify the tool name in the skill manifest.",
  },
  TOOL_EXECUTION_FAILED: {
    category: "tool",
    severity: "medium",
    retryable: true,
    message: "Tool execution returned an error.",
    remediation: "Check tool logs for the underlying cause.",
  },
  TOOL_BROWSER_TIMEOUT: {
    category: "tool",
    severity: "medium",
    retryable: true,
    message: "Browser tool timed out waiting for a page or element.",
    remediation: "Increase step timeout or simplify the selector.",
  },

  // -- Skill errors ---------------------------------------------------------
  SKILL_LOAD_FAILED: {
    category: "skill",
    severity: "high",
    retryable: false,
    message: "Skill could not be loaded from the registry.",
    remediation: "Ensure the skill bundle is signed and the manifest is valid.",
  },
  SKILL_MANIFEST_INVALID: {
    category: "skill",
    severity: "high",
    retryable: false,
    message: "Skill manifest failed schema validation.",
    remediation: "Fix validation errors reported by the manifest schema checker.",
  },

  // -- Workflow errors ------------------------------------------------------
  WORKFLOW_STEP_FAILED: {
    category: "workflow",
    severity: "medium",
    retryable: true,
    message: "A workflow step failed during execution.",
    remediation: "Review step logs and retry policies.",
  },
  WORKFLOW_CYCLE_DETECTED: {
    category: "workflow",
    severity: "high",
    retryable: false,
    message: "A cycle was detected in the workflow graph.",
    remediation: "Remove circular dependencies in the workflow definition.",
  },

  // -- Network errors -------------------------------------------------------
  NETWORK_UNREACHABLE: {
    category: "network",
    severity: "high",
    retryable: true,
    message: "Target host is unreachable.",
    remediation: "Check network connectivity and DNS resolution.",
  },
  NETWORK_TLS_ERROR: {
    category: "network",
    severity: "high",
    retryable: false,
    message: "TLS handshake failed.",
    remediation: "Verify certificate validity and trust chain.",
  },

  // -- Auth errors ----------------------------------------------------------
  AUTH_TOKEN_EXPIRED: {
    category: "auth",
    severity: "medium",
    retryable: true,
    message: "Authentication token has expired.",
    remediation: "Refresh the token or re-authenticate.",
  },
  AUTH_PERMISSION_DENIED: {
    category: "auth",
    severity: "high",
    retryable: false,
    message: "Insufficient permissions for the requested action.",
    remediation: "Verify the skill's permission allowlist.",
  },

  // -- Validation errors ----------------------------------------------------
  VALIDATION_INPUT_INVALID: {
    category: "validation",
    severity: "low",
    retryable: false,
    message: "Input payload failed validation.",
    remediation: "Fix the input to match the expected schema.",
  },

  // -- Timeout errors -------------------------------------------------------
  TIMEOUT_STEP: {
    category: "timeout",
    severity: "medium",
    retryable: true,
    message: "Step exceeded its configured timeout.",
    remediation: "Increase the timeout or optimise the step.",
  },
  TIMEOUT_RUN: {
    category: "timeout",
    severity: "high",
    retryable: false,
    message: "Run exceeded its maximum allowed duration.",
    remediation: "Review total run timeout configuration.",
  },

  // -- Quota errors ---------------------------------------------------------
  QUOTA_EXCEEDED: {
    category: "quota",
    severity: "high",
    retryable: false,
    message: "Resource quota or rate limit exceeded.",
    remediation: "Wait for the quota to reset or request an increase.",
  },

  // -- Internal errors ------------------------------------------------------
  INTERNAL_STATE_CORRUPTION: {
    category: "internal",
    severity: "critical",
    retryable: false,
    message: "Internal state machine reached an invalid state.",
    remediation: "File a bug report with the run trace attached.",
  },
  INTERNAL_UNKNOWN: {
    category: "internal",
    severity: "critical",
    retryable: false,
    message: "An unexpected internal error occurred.",
    remediation: "Check runtime logs and file a bug report.",
  },
};

// ---------------------------------------------------------------------------
// Classification function
// ---------------------------------------------------------------------------

/**
 * Classify a raw error into a `ClassifiedError` using the taxonomy.
 *
 * The function attempts to match the error against known codes by inspecting
 * the error message and name. If no match is found, it falls back to
 * `INTERNAL_UNKNOWN`.
 *
 * @param error - The raw error to classify.
 * @param codeHint - Optional explicit error code to look up directly.
 * @returns A fully classified error with taxonomy metadata.
 */
export function classifyError(error: Error, codeHint?: string): ClassifiedError {
  // Direct lookup when a code hint is provided.
  if (codeHint && codeHint in errorTaxonomy) {
    const entry = errorTaxonomy[codeHint];
    return {
      code: codeHint,
      message: entry.message,
      category: entry.category,
      severity: entry.severity,
      retryable: entry.retryable,
      remediation: entry.remediation,
      cause: error,
    };
  }

  // Heuristic matching: scan the taxonomy for a code whose message
  // partially matches the error's message or name.
  const errorText = `${error.name}: ${error.message}`.toLowerCase();
  for (const [code, entry] of Object.entries(errorTaxonomy)) {
    // Simple substring check; production implementations may use more
    // sophisticated matching (regex, ML classifier, etc.).
    if (errorText.includes(code.toLowerCase().replaceAll("_", " "))) {
      return {
        code,
        message: entry.message,
        category: entry.category,
        severity: entry.severity,
        retryable: entry.retryable,
        remediation: entry.remediation,
        cause: error,
      };
    }
  }

  // Fallback to unknown internal error.
  const fallback = errorTaxonomy["INTERNAL_UNKNOWN"];
  return {
    code: "INTERNAL_UNKNOWN",
    message: fallback.message,
    category: fallback.category,
    severity: fallback.severity,
    retryable: fallback.retryable,
    remediation: fallback.remediation,
    cause: error,
  };
}
