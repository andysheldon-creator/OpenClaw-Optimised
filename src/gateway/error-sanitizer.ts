/**
 * Error sanitization for gateway HTTP responses.
 *
 * SECURITY: Prevents internal error details (stack traces, file paths,
 * configuration values) from leaking to API clients.
 *
 * All external-facing error messages go through this module.
 */

/** Patterns that indicate internal implementation details in error messages. */
const INTERNAL_PATTERNS = [
  // File system paths (Unix and Windows).
  /(?:\/(?:Users|home|var|tmp|app|etc|opt)\/\S+)/,
  /(?:[A-Z]:\\[\w\\]+)/,
  // Stack traces.
  /\bat\s+\S+\s+\(\S+:\d+:\d+\)/,
  /\bat\s+\S+\s+\(node:internal\//,
  // Node.js internals.
  /\bnode:internal\//,
  /\bnode_modules\//,
  // Environment variables.
  /\bprocess\.env\.\w+/,
  // Connection strings and URLs with credentials.
  /\b\w+:\/\/\w+:[^@]+@/,
  // Config file references.
  /\.json5?:\s*\d+:\d+/,
];

/** Known safe error categories that can be forwarded to clients. */
const SAFE_ERROR_PREFIXES = [
  "Missing ",
  "Invalid ",
  "Tool not ",
  "Rate limit ",
  "Unauthorized",
  "Method Not Allowed",
  "payload too large",
  "body too large",
  "invalid JSON",
  "unknown tool",
];

/**
 * Sanitize an error for external API responses.
 *
 * - If the error message looks safe (no internal details), returns it as-is.
 * - If the error message contains internal details, returns a generic message.
 * - Always preserves the error type/code for programmatic handling.
 *
 * @param err - The original error (Error, string, or unknown).
 * @param fallbackMessage - A generic message to use when the error is sanitized.
 * @returns A client-safe error message string.
 */
export function sanitizeErrorMessage(
  err: unknown,
  fallbackMessage = "An internal error occurred. Please try again.",
): string {
  const raw =
    err instanceof Error
      ? err.message
      : err == null
        ? ""
        : typeof err === "string"
          ? err
          : typeof err === "number" || typeof err === "boolean" || typeof err === "bigint"
            ? String(err)
            : (() => {
                try {
                  return JSON.stringify(err);
                } catch {
                  return "unstringifiable error";
                }
              })();

  // Empty or very short errors get the fallback.
  if (!raw || raw.length < 3) {
    return fallbackMessage;
  }

  // Check for known safe prefixes.
  for (const prefix of SAFE_ERROR_PREFIXES) {
    if (raw.startsWith(prefix)) {
      return raw;
    }
  }

  // Check for internal details that should not be exposed.
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(raw)) {
      return fallbackMessage;
    }
  }

  // Truncate excessively long error messages (may contain dump data).
  if (raw.length > 500) {
    return fallbackMessage;
  }

  return raw;
}

/**
 * Build a sanitized error response body for JSON APIs.
 *
 * @param err - The original error.
 * @param type - The error type/code for programmatic handling.
 * @param fallbackMessage - A generic message to use when the error is sanitized.
 */
export function buildSafeErrorResponse(
  err: unknown,
  type = "internal_error",
  fallbackMessage?: string,
): { error: { message: string; type: string } } {
  return {
    error: {
      message: sanitizeErrorMessage(err, fallbackMessage),
      type,
    },
  };
}
