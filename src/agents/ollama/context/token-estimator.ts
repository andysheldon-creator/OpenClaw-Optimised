/**
 * Token estimation with configurable safety margin for Ollama context management.
 *
 * Uses character-based heuristic (4 chars per token) which is the standard
 * approximation used throughout the codebase (see context-pruning/pruner.ts).
 *
 * The SAFETY_MARGIN from compaction.ts (1.2 = 20% buffer) is applied to account
 * for estimation inaccuracy.
 */
import { SAFETY_MARGIN } from "../../compaction.js";
import { DEFAULT_CONTEXT_TOKENS, MINIMUM_CONTEXT_TOKENS } from "../../defaults.js";

/**
 * Character-to-token ratio used for estimation.
 * This matches CHARS_PER_TOKEN_ESTIMATE in context-pruning/pruner.ts.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Track requested context sizes that have been clamped (warn once per unique value).
 * Prevents log spam while ensuring the warning is visible at least once.
 */
const clampedContextWarnings = new Set<number>();

/**
 * Estimate tokens for a plain text string.
 * Uses character-based heuristic: ~4 characters per token.
 */
function estimateStringTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface TokenEstimatorConfig {
  /** Token estimate multiplier for safety buffer. Default: SAFETY_MARGIN (1.2 = 20% buffer) */
  multiplier?: number;
  /** Tokens reserved for response generation. Default: 2000 */
  reserveTokens?: number;
  /** Maximum context window in tokens. Default: DEFAULT_CONTEXT_TOKENS (32768) */
  maxContextTokens?: number;
}

export interface TokenEstimator {
  /** Estimate tokens for a text string with safety multiplier applied */
  estimate: (text: string) => number;
  /** Maximum tokens available for prompt (maxContextTokens - reserveTokens) */
  maxPromptTokens: number;
  /** Total context window size */
  maxContextTokens: number;
  /** Tokens reserved for response */
  reserveTokens: number;
  /** Safety multiplier applied to estimates */
  multiplier: number;
}

/**
 * Create a token estimator with configurable safety margins.
 *
 * The estimator applies a safety multiplier (default 1.2 = 20% buffer) to account
 * for estimation inaccuracy. This is the same pattern used in compaction.ts.
 *
 * @param config - Configuration options
 * @returns TokenEstimator instance
 */
export function createTokenEstimator(config: TokenEstimatorConfig = {}): TokenEstimator {
  const multiplier = config.multiplier ?? SAFETY_MARGIN;
  const reserveTokens = config.reserveTokens ?? 2000;
  const requestedContextTokens = config.maxContextTokens ?? DEFAULT_CONTEXT_TOKENS;
  const maxContextTokens = Math.max(requestedContextTokens, MINIMUM_CONTEXT_TOKENS);

  // Warn once per unique requested value when clamping occurs
  if (requestedContextTokens < MINIMUM_CONTEXT_TOKENS) {
    if (!clampedContextWarnings.has(requestedContextTokens)) {
      clampedContextWarnings.add(requestedContextTokens);
      console.warn(
        `[ollama-context] maxContextTokens clamped: requested=${requestedContextTokens}, clamped=${maxContextTokens}, minimum=${MINIMUM_CONTEXT_TOKENS}`,
      );
    }
  }

  const maxPromptTokens = maxContextTokens - reserveTokens;

  return {
    estimate: (text: string) => Math.ceil(estimateStringTokens(text) * multiplier),
    maxPromptTokens,
    maxContextTokens,
    reserveTokens,
    multiplier,
  };
}

/**
 * Estimate tokens for multiple text segments and return breakdown.
 *
 * @param estimator - Token estimator instance
 * @param segments - Record of named text segments
 * @returns Record of token counts per segment plus total
 */
export function estimateSegments(
  estimator: TokenEstimator,
  segments: Record<string, string>,
): Record<string, number> & { total: number } {
  const result: Record<string, number> & { total: number } = { total: 0 };
  for (const [key, text] of Object.entries(segments)) {
    const tokens = estimator.estimate(text);
    result[key] = tokens;
    result.total += tokens;
  }
  return result;
}
