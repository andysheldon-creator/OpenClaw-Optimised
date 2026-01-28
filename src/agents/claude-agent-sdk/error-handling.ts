/**
 * Error handling and retry logic for the Claude Agent SDK.
 *
 * Provides error classification, retry strategies, and failover support
 * for CCSDK agent runs.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk/error");

/**
 * Error classification for CCSDK errors.
 */
export type CcsdkErrorKind =
  | "rate_limit"
  | "context_overflow"
  | "auth_failure"
  | "network"
  | "timeout"
  | "tool_error"
  | "unknown";

/**
 * Error patterns for classification.
 */
const ERROR_PATTERNS: Array<{ pattern: RegExp; kind: CcsdkErrorKind }> = [
  // Rate limiting
  { pattern: /rate.?limit|too many requests|429/i, kind: "rate_limit" },
  { pattern: /overloaded|capacity|throttl/i, kind: "rate_limit" },
  { pattern: /resource has been exhausted/i, kind: "rate_limit" },

  // Context overflow
  { pattern: /context.?(?:window|length|overflow)|too.?(?:long|large)/i, kind: "context_overflow" },
  { pattern: /exceeds.*(?:context|token|max)/i, kind: "context_overflow" },
  { pattern: /maximum.*(?:context|token)/i, kind: "context_overflow" },
  { pattern: /prompt.*too.*long/i, kind: "context_overflow" },

  // Auth failures
  { pattern: /auth(?:entication|orization)?.*(?:failed|error|invalid)/i, kind: "auth_failure" },
  { pattern: /invalid.*(?:api.?key|token|credential)/i, kind: "auth_failure" },
  { pattern: /401|403|forbidden|unauthorized/i, kind: "auth_failure" },
  { pattern: /permission.*denied/i, kind: "auth_failure" },

  // Network errors
  { pattern: /network|connection|connect.*(?:error|failed|refused)/i, kind: "network" },
  { pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH/i, kind: "network" },
  { pattern: /socket.*(?:error|closed|hang)/i, kind: "network" },
  { pattern: /fetch.*failed/i, kind: "network" },

  // Timeout
  { pattern: /timeout|timed.?out|deadline.*exceeded/i, kind: "timeout" },
  { pattern: /ETIMEDOUT|ESOCKETTIMEDOUT/i, kind: "timeout" },
  { pattern: /request.*abort/i, kind: "timeout" },

  // Tool errors
  { pattern: /tool.*(?:error|failed|execution)/i, kind: "tool_error" },
  { pattern: /mcp.*(?:error|failed)/i, kind: "tool_error" },
];

/**
 * Classify an error into a known category.
 */
export function classifyError(error: unknown): CcsdkErrorKind {
  if (!error) return "unknown";

  // Extract error details
  const message = getErrorMessage(error);
  const name = getErrorName(error);
  const status = getStatusCode(error);
  const code = getErrorCode(error);

  // Check status codes first
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth_failure";
  if (status === 408) return "timeout";

  // Check error codes
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "timeout";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND") return "network";

  // Check error name
  if (name === "TimeoutError") return "timeout";
  if (name === "AbortError") return "timeout";

  // Check message patterns
  const textToCheck = `${message} ${name} ${code ?? ""}`;
  for (const { pattern, kind } of ERROR_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return kind;
    }
  }

  return "unknown";
}

/**
 * Extract error message from unknown error.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

/**
 * Extract error name from unknown error.
 */
function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * Extract HTTP status code from error.
 */
function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status =
    (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  if (typeof status === "number") return status;
  if (typeof status === "string" && /^\d+$/.test(status)) {
    return Number(status);
  }
  return undefined;
}

/**
 * Extract error code from error.
 */
function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.trim()) {
    return code.trim();
  }
  return undefined;
}

/**
 * Retry options.
 */
export type RetryOptions = {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Base backoff delay in milliseconds. */
  backoffMs: number;
  /** Maximum backoff delay in milliseconds. */
  maxBackoffMs?: number;
  /** Backoff multiplier (default: 2 for exponential backoff). */
  backoffMultiplier?: number;
  /** Error kinds that should trigger a retry. */
  retryOn: CcsdkErrorKind[];
  /** Optional abort signal. */
  abortSignal?: AbortSignal;
  /** Optional callback for retry events. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

/**
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  backoffMs: 1000,
  maxBackoffMs: 30_000,
  backoffMultiplier: 2,
  retryOn: ["rate_limit", "network", "timeout"],
};

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxRetries = options.maxRetries;
  const backoffMs = options.backoffMs;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const multiplier = options.backoffMultiplier ?? 2;
  const retryOn = new Set(options.retryOn);

  let lastError: unknown;
  let delay = backoffMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort before each attempt
    if (options.abortSignal?.aborted) {
      throw new Error("Aborted");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorKind = classifyError(error);

      // Don't retry non-retryable errors
      if (!retryOn.has(errorKind)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        log.warn(`All ${maxRetries} retry attempts exhausted`, {
          errorKind,
          lastError: getErrorMessage(error),
        });
        throw error;
      }

      // Calculate delay with jitter
      const jitter = Math.random() * 0.2 * delay; // 0-20% jitter
      const effectiveDelay = Math.min(delay + jitter, maxBackoffMs);

      log.debug(`Retry attempt ${attempt + 1}/${maxRetries} in ${Math.round(effectiveDelay)}ms`, {
        errorKind,
        error: getErrorMessage(error),
      });

      // Notify callback
      options.onRetry?.(attempt + 1, error, effectiveDelay);

      // Wait before retry
      await sleep(effectiveDelay, options.abortSignal);

      // Increase delay for next attempt
      delay = Math.min(delay * multiplier, maxBackoffMs);
    }
  }

  throw lastError;
}

/**
 * Sleep for a duration, respecting abort signal.
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Classify error and determine if it's retryable.
 */
export function isRetryableError(
  error: unknown,
  retryableKinds: CcsdkErrorKind[] = ["rate_limit", "network", "timeout"],
): boolean {
  const kind = classifyError(error);
  return retryableKinds.includes(kind);
}

/**
 * Get a human-readable description of an error kind.
 */
export function describeErrorKind(kind: CcsdkErrorKind): string {
  switch (kind) {
    case "rate_limit":
      return "Rate limit exceeded";
    case "context_overflow":
      return "Context window overflow";
    case "auth_failure":
      return "Authentication failed";
    case "network":
      return "Network error";
    case "timeout":
      return "Request timed out";
    case "tool_error":
      return "Tool execution error";
    case "unknown":
    default:
      return "Unknown error";
  }
}

/**
 * CCSDK-specific error with classification.
 */
export class CcsdkError extends Error {
  readonly kind: CcsdkErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    kind: CcsdkErrorKind,
    options?: {
      status?: number;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "CcsdkError";
    this.kind = kind;
    this.status = options?.status;
    this.code = options?.code;
  }
}

/**
 * Check if an error is a CcsdkError.
 */
export function isCcsdkError(error: unknown): error is CcsdkError {
  return error instanceof CcsdkError;
}

/**
 * Coerce an unknown error to a CcsdkError.
 */
export function toCcsdkError(error: unknown): CcsdkError {
  if (isCcsdkError(error)) return error;

  const kind = classifyError(error);
  const message = getErrorMessage(error) || describeErrorKind(kind);
  const status = getStatusCode(error);
  const code = getErrorCode(error);

  return new CcsdkError(message, kind, {
    status,
    code,
    cause: error instanceof Error ? error : undefined,
  });
}
