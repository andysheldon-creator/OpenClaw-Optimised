/**
 * Retry with Exponential Backoff — Better Error Recovery
 *
 * Retries transient failures (network, timeout, rate limit) with exponential backoff.
 * Excludes non-retryable errors (401, 400, 404).
 */
import { logVerbose } from "../globals.js";

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 4 → delays of 1s, 2s, 4s, 8s) */
  maxRetries: number;
  /** Base delay in ms (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 8000) */
  maxDelayMs: number;
  /** Jitter factor 0-1 (default: 0.2) */
  jitterFactor: number;
  /** Label for logging */
  label?: string;
}

export interface RetryMetadata {
  attempts: number;
  totalDelayMs: number;
  delays: number[];
  finalStatus: "success" | "failed";
  errors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitterFactor: 0.2,
};

/** HTTP status codes that should NOT be retried */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

/** Error codes that indicate transient failures */
const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

function getStatusFromError(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const s =
    (err as { status?: unknown; statusCode?: unknown }).status ??
    (err as { statusCode?: unknown }).statusCode;
  return typeof s === "number" ? s : undefined;
}

function getCodeFromError(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const c = (err as { code?: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

function getMessageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Determine if an error is retryable (transient).
 */
export function isRetryableError(err: unknown): boolean {
  const status = getStatusFromError(err);

  // Non-retryable HTTP statuses
  if (status !== undefined && NON_RETRYABLE_STATUSES.has(status)) {
    return false;
  }

  // Rate limit is retryable
  if (status === 429 || status === 503 || status === 502) {
    return true;
  }

  // Timeout/network codes are retryable
  const code = getCodeFromError(err)?.toUpperCase();
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  // Timeout errors
  const msg = getMessageFromError(err).toLowerCase();
  if (
    /timeout|timed out|deadline exceeded|network|econnreset|socket hang up|fetch failed/i.test(msg)
  ) {
    return true;
  }

  // Server errors (5xx) are generally retryable
  if (status !== undefined && status >= 500) {
    return true;
  }

  return false;
}

/**
 * Calculate backoff delay with jitter.
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on transient failures.
 *
 * Returns the result and retry metadata for logging.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<{ result: T; metadata: RetryMetadata }> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  const label = cfg.label ?? "retry";
  const metadata: RetryMetadata = {
    attempts: 0,
    totalDelayMs: 0,
    delays: [],
    finalStatus: "failed",
    errors: [],
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    metadata.attempts = attempt + 1;

    if (attempt > 0) {
      const delay = calculateBackoff(attempt - 1, cfg);
      metadata.delays.push(delay);
      metadata.totalDelayMs += delay;
      logVerbose(`${label}: retry attempt ${attempt}/${cfg.maxRetries}, backoff ${delay}ms`);
      await sleep(delay);
    }

    try {
      const result = await fn();
      metadata.finalStatus = "success";
      if (attempt > 0) {
        logVerbose(
          `${label}: succeeded after ${attempt} retries (total delay: ${metadata.totalDelayMs}ms)`,
        );
      }
      return { result, metadata };
    } catch (err) {
      lastError = err;
      const errMsg = getMessageFromError(err);
      metadata.errors.push(errMsg);

      if (!isRetryableError(err)) {
        logVerbose(
          `${label}: non-retryable error (${getStatusFromError(err) ?? "unknown"}): ${errMsg}`,
        );
        break;
      }

      if (attempt === cfg.maxRetries) {
        logVerbose(`${label}: exhausted all ${cfg.maxRetries} retries`);
        break;
      }
    }
  }

  metadata.finalStatus = "failed";
  throw Object.assign(lastError instanceof Error ? lastError : new Error(String(lastError)), {
    retryMetadata: metadata,
  });
}
