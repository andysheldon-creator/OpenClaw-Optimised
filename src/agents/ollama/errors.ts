/**
 * Error types for Ollama context management.
 *
 * Follows the pattern established by FailoverError in src/agents/failover-error.ts:
 * - Named error class with stable code string
 * - Machine-readable fields for programmatic handling
 * - User-safe message
 */

export type OverBudgetErrorCode = "over_budget";

/**
 * Error thrown when assembled prompt exceeds token budget.
 *
 * This is a hard-fail error - the request MUST NOT be sent to Ollama.
 * The caller should either:
 * 1. Reduce the prompt size (fewer chunks, shorter system prompt)
 * 2. Increase the budget (if model supports larger context)
 * 3. Use chunking/summarization strategy
 */
export class OverBudgetError extends Error {
  readonly code: OverBudgetErrorCode = "over_budget";
  /** Estimated tokens in the assembled prompt */
  readonly estimatedTokens: number;
  /** Maximum allowed tokens (budget) */
  readonly budgetTokens: number;
  /** How many tokens over budget */
  readonly overBy: number;

  constructor(params: { estimatedTokens: number; budgetTokens: number; message?: string }) {
    const overBy = params.estimatedTokens - params.budgetTokens;
    const defaultMessage =
      `Prompt exceeds token budget: ${params.estimatedTokens} tokens estimated, ` +
      `${params.budgetTokens} allowed (over by ${overBy})`;
    super(params.message ?? defaultMessage);
    this.name = "OverBudgetError";
    this.estimatedTokens = params.estimatedTokens;
    this.budgetTokens = params.budgetTokens;
    this.overBy = overBy;
  }
}

/**
 * Type guard for OverBudgetError.
 */
export function isOverBudgetError(err: unknown): err is OverBudgetError {
  return err instanceof OverBudgetError;
}

/**
 * Error thrown when Ollama API request fails.
 */
export class OllamaApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly endpoint: string;

  constructor(params: { message: string; code: string; status?: number; endpoint: string }) {
    super(params.message);
    this.name = "OllamaApiError";
    this.code = params.code;
    this.status = params.status;
    this.endpoint = params.endpoint;
  }
}

/**
 * Type guard for OllamaApiError.
 */
export function isOllamaApiError(err: unknown): err is OllamaApiError {
  return err instanceof OllamaApiError;
}
