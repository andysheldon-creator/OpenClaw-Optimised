/**
 * Prompt assembly with budget enforcement and manifest generation.
 *
 * HARD FAIL: Throws OverBudgetError if assembled prompt exceeds budget.
 * The request MUST NOT be sent to Ollama if over budget.
 */
import { createHash } from "node:crypto";

import { OverBudgetError } from "../errors.js";
import {
  buildChunkManifest,
  selectChunks,
  type ChunkManifestEntry,
  type ContextChunk,
  type SelectionMode,
} from "./chunk-selector.js";
import {
  createTokenEstimator,
  type TokenEstimator,
  type TokenEstimatorConfig,
} from "./token-estimator.js";

/**
 * Input for prompt assembly.
 */
export interface AssembleInput {
  /** System prompt (instructions for the model) */
  system: string;
  /** Additional instructions (task-specific guidance) */
  instructions: string;
  /** User's query/message */
  userQuery: string;
  /** Candidate context chunks to include */
  candidateChunks: ContextChunk[];
  /** Override max prompt tokens (default: estimator.maxPromptTokens) */
  budget?: number;
  /** Chunk selection mode */
  selectionMode?: SelectionMode;
}

/**
 * Manifest documenting what was included in the prompt.
 */
export interface PromptManifest {
  /** SHA256 hash of the assembled prompt */
  promptHash: string;
  /** Tokens used by system prompt */
  systemTokens: number;
  /** Tokens used by instructions */
  instructionsTokens: number;
  /** Tokens used by user query */
  userQueryTokens: number;
  /** Tokens used by context chunks */
  contextTokens: number;
  /** Total tokens in assembled prompt */
  totalTokens: number;
  /** Budget that was enforced */
  budgetTokens: number;
  /** Whether prompt fits within budget */
  withinBudget: boolean;
  /** Detailed chunk manifest */
  chunks: ChunkManifestEntry[];
}

/**
 * Result of prompt assembly.
 */
export interface AssembleResult {
  /** The assembled prompt string */
  prompt: string;
  /** Manifest documenting the assembly */
  manifest: PromptManifest;
}

/**
 * Compute SHA256 hash of a string.
 */
function computePromptHash(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

/**
 * Assemble a prompt from components with budget enforcement.
 *
 * HARD FAIL: Throws OverBudgetError if the assembled prompt exceeds the budget.
 * This ensures no oversized prompts are sent to Ollama.
 *
 * @param input - Assembly input with system, instructions, query, and chunks
 * @param estimator - Token estimator for counting
 * @returns Assembly result with prompt and manifest
 * @throws OverBudgetError if prompt exceeds budget
 */
export function assemblePrompt(input: AssembleInput, estimator: TokenEstimator): AssembleResult {
  const budget = input.budget ?? estimator.maxPromptTokens;

  // Estimate fixed components
  const systemTokens = estimator.estimate(input.system);
  const instructionsTokens = estimator.estimate(input.instructions);
  const userQueryTokens = estimator.estimate(input.userQuery);
  const fixedTokens = systemTokens + instructionsTokens + userQueryTokens;

  // Budget remaining for context chunks
  const chunkBudget = budget - fixedTokens;

  // Select chunks within remaining budget
  const selectionResult = selectChunks(
    input.candidateChunks,
    Math.max(0, chunkBudget),
    estimator,
    input.selectionMode,
  );

  // Build chunk manifest
  const chunkManifest = buildChunkManifest(input.candidateChunks, selectionResult, estimator);

  // Calculate total tokens
  const contextTokens = selectionResult.totalTokens;
  const totalTokens = fixedTokens + contextTokens;

  // HARD FAIL: Check budget
  const withinBudget = totalTokens <= budget;
  if (!withinBudget) {
    throw new OverBudgetError({
      estimatedTokens: totalTokens,
      budgetTokens: budget,
    });
  }

  // Assemble the prompt
  const contextText = selectionResult.included.map((c) => c.text).join("\n\n");
  const prompt = [
    input.system,
    input.instructions,
    contextText ? `<context>\n${contextText}\n</context>` : "",
    input.userQuery,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Compute hash for deduplication/logging
  const promptHash = computePromptHash(prompt);

  const manifest: PromptManifest = {
    promptHash,
    systemTokens,
    instructionsTokens,
    userQueryTokens,
    contextTokens,
    totalTokens,
    budgetTokens: budget,
    withinBudget,
    chunks: chunkManifest,
  };

  return { prompt, manifest };
}

/**
 * Create a context manager with pre-configured estimator.
 *
 * @param config - Token estimator configuration
 * @returns Object with estimator and assemble function
 */
export function createContextManager(config?: TokenEstimatorConfig) {
  const estimator = createTokenEstimator(config);

  return {
    estimator,
    /**
     * Assemble a prompt with budget enforcement.
     * @throws OverBudgetError if prompt exceeds budget
     */
    assemble: (input: AssembleInput) => assemblePrompt(input, estimator),
  };
}
