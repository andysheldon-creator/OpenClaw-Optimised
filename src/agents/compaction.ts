import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { estimateTokens, generateSummary } from "@mariozechner/pi-coding-agent";
import { DEFAULT_CONTEXT_TOKENS } from "./defaults.js";
import { repairToolUseResultPairing } from "./session-transcript-repair.js";

/**
 * Base ratio for chunk size relative to context window.
 * 40% of context window is a safe default for most models.
 */
export const BASE_CHUNK_RATIO = 0.4;

/**
 * Minimum allowed chunk ratio to prevent chunks from becoming too small.
 * 15% ensures chunks remain large enough to contain meaningful context.
 */
export const MIN_CHUNK_RATIO = 0.15;

/**
 * Safety margin multiplier for token estimation.
 * 20% buffer accounts for estimateTokens() inaccuracy across different tokenizers.
 * This prevents chunk sizes from exceeding model limits due to estimation errors.
 */
export const SAFETY_MARGIN = 1.2;

/**
 * Maximum individual message size as ratio of context window.
 * Messages larger than 50% of context cannot be safely summarized.
 */
export const MAX_SINGLE_MESSAGE_RATIO = 0.5;

/**
 * Minimum number of messages to consider for summarization.
 * Summarizing fewer messages than this provides diminishing returns.
 */
export const MIN_MESSAGES_FOR_SUMMARY = 2;

/**
 * Default fallback message when summarization returns empty or fails.
 */
const DEFAULT_SUMMARY_FALLBACK = "No prior history.";

/**
 * Default number of parts to split messages into for staged summarization.
 */
const DEFAULT_PARTS = 2;

/**
 * Instruction template for merging partial summaries.
 */
const MERGE_SUMMARIES_INSTRUCTIONS =
  "Merge these partial summaries into a single cohesive summary. Preserve decisions," +
  " TODOs, open questions, and any constraints.";

/**
 * Safely estimates the total token count for an array of messages.
 * Handles edge cases like null/undefined messages and estimation failures.
 *
 * @param messages - Array of messages to estimate
 * @returns Total estimated token count with safety margin applied
 */
export function estimateMessagesTokens(messages: AgentMessage[]): number {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  try {
    const rawEstimate = messages.reduce((sum, message) => {
      // Handle null/undefined messages gracefully
      if (!message) {
        return sum;
      }
      return sum + estimateTokens(message);
    }, 0);

    // Apply safety margin and ensure non-negative, finite result
    const safeEstimate = Math.floor(rawEstimate * SAFETY_MARGIN);
    return Number.isFinite(safeEstimate) && safeEstimate >= 0 ? safeEstimate : 0;
  } catch (error) {
    console.warn("Token estimation failed, returning conservative estimate:", error);
    // Fallback: rough estimate based on message count
    return messages.length * 100;
  }
}

/**
 * Validates that a number is a positive, finite integer suitable for token counts.
 * @param value - The value to validate
 * @param defaultValue - Default to return if validation fails
 * @returns Validated positive integer
 */
function validateTokenCount(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }
  const intValue = Math.max(0, Math.floor(value));
  return Number.isFinite(intValue) ? intValue : defaultValue;
}

/**
 * Calculates a safe chunk size based on context window with adaptive reduction.
 * Reduces chunk size when dealing with large average message sizes.
 *
 * @param contextWindow - The total context window size in tokens
 * @param avgMessageTokens - Average tokens per message
 * @returns Safe chunk size in tokens
 */
export function calculateSafeChunkSize(contextWindow: number, avgMessageTokens: number): number {
  const safeWindow = validateTokenCount(contextWindow, 8192);
  const safeAvg = validateTokenCount(avgMessageTokens, 100);

  // Start with base ratio
  let chunkRatio = BASE_CHUNK_RATIO;

  // Reduce ratio for large messages to avoid exceeding limits
  const avgRatio = safeAvg / safeWindow;
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    chunkRatio = Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return Math.floor(safeWindow * chunkRatio);
}

/**
 * Normalizes the parts parameter to a valid integer between 1 and messageCount.
 * Handles edge cases: NaN, Infinity, negative values, and values exceeding messageCount.
 *
 * @param parts - Desired number of parts
 * @param messageCount - Total number of messages available
 * @returns Validated number of parts (1 to messageCount)
 */
function normalizeParts(parts: number, messageCount: number): number {
  // Handle invalid inputs
  if (typeof parts !== "number" || !Number.isFinite(parts) || parts <= 1) {
    return 1;
  }

  const safeMessageCount = Math.max(1, Math.floor(messageCount));
  const normalizedParts = Math.min(Math.max(1, Math.floor(parts)), safeMessageCount);

  return Number.isFinite(normalizedParts) ? normalizedParts : 1;
}

/**
 * Splits messages into chunks with roughly equal token distribution.
 * Attempts to create the requested number of parts while respecting token boundaries.
 *
 * Edge cases handled:
 * - Empty message array returns empty array
 * - Single message or single part returns single chunk
 * - Oversized messages that exceed target are included in their own chunk
 * - NaN/Infinity in parts parameter is normalized to valid value
 *
 * @param messages - Array of messages to split
 * @param parts - Desired number of chunks (default: 2)
 * @returns Array of message chunks
 */
export function splitMessagesByTokenShare(
  messages: AgentMessage[],
  parts = DEFAULT_PARTS,
): AgentMessage[][] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const normalizedParts = normalizeParts(parts, messages.length);
  if (normalizedParts <= 1) {
    return [messages];
  }

  const totalTokens = estimateMessagesTokens(messages);

  // Edge case: zero total tokens (all messages empty/invalid)
  if (totalTokens === 0) {
    // Split evenly by count instead
    const countPerChunk = Math.ceil(messages.length / normalizedParts);
    const result: AgentMessage[][] = [];
    for (let i = 0; i < messages.length; i += countPerChunk) {
      result.push(messages.slice(i, i + countPerChunk));
    }
    return result;
  }

  const targetTokens = totalTokens / normalizedParts;
  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    // Skip null/undefined messages
    if (!message) {
      continue;
    }

    const messageTokens = estimateTokens(message);

    // Check if we should start a new chunk (but not for the last chunk)
    const shouldStartNewChunk =
      chunks.length < normalizedParts - 1 &&
      current.length > 0 &&
      currentTokens + messageTokens > targetTokens;

    if (shouldStartNewChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Chunks messages such that no chunk exceeds maxTokens.
 * Oversized messages (larger than maxTokens) are placed in their own chunk.
 *
 * Edge cases handled:
 * - Invalid/negative maxTokens returns single chunk with all messages
 * - Empty message array returns empty array
 * - Null/undefined messages are skipped
 * - Oversized messages get their own isolated chunk
 *
 * @param messages - Array of messages to chunk
 * @param maxTokens - Maximum tokens allowed per chunk
 * @returns Array of message chunks respecting maxTokens limit
 */
export function chunkMessagesByMaxTokens(
  messages: AgentMessage[],
  maxTokens: number,
): AgentMessage[][] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // Validate maxTokens - if invalid, return all messages in single chunk
  const safeMaxTokens = validateTokenCount(maxTokens, 0);
  if (safeMaxTokens <= 0) {
    console.warn("Invalid maxTokens provided to chunkMessagesByMaxTokens:", maxTokens);
    return [messages];
  }

  const chunks: AgentMessage[][] = [];
  let currentChunk: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    // Skip null/undefined messages
    if (!message) {
      continue;
    }

    const messageTokens = estimateTokens(message);

    // Check if adding this message would exceed the limit
    const wouldExceedLimit =
      currentChunk.length > 0 && currentTokens + messageTokens > safeMaxTokens;

    if (wouldExceedLimit) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;

    // Handle oversized messages: they get their own isolated chunk
    if (messageTokens > safeMaxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Compute adaptive chunk ratio based on average message size.
 * When messages are large, we use smaller chunks to avoid exceeding model limits.
 */
export function computeAdaptiveChunkRatio(messages: AgentMessage[], contextWindow: number): number {
  if (messages.length === 0) {
    return BASE_CHUNK_RATIO;
  }

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;

  // Apply safety margin to account for estimation inaccuracy
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  // If average message is > 10% of context, reduce chunk ratio
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

/**
 * Determines if a single message is too large to be included in summarization.
 * A message exceeding 50% of the context window cannot be summarized safely
 * as it would leave insufficient room for the summary itself and other context.
 *
 * @param msg - The message to check
 * @param contextWindow - Total context window size in tokens
 * @returns True if the message is oversized and should be excluded from summarization
 */
export function isOversizedForSummary(msg: AgentMessage, contextWindow: number): boolean {
  if (!msg || typeof msg !== "object") {
    return false; // Invalid messages are not "oversized", they're just skipped
  }

  const safeContextWindow = validateTokenCount(contextWindow, 8192);
  const tokens = estimateTokens(msg) * SAFETY_MARGIN;
  return tokens > safeContextWindow * MAX_SINGLE_MESSAGE_RATIO;
}

async function summarizeChunks(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext["model"]>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const chunks = chunkMessagesByMaxTokens(params.messages, params.maxChunkTokens);
  let summary = params.previousSummary;

  for (const chunk of chunks) {
    summary = await generateSummary(
      chunk,
      params.model,
      params.reserveTokens,
      params.apiKey,
      params.signal,
      params.customInstructions,
      summary,
    );
  }

  return summary ?? DEFAULT_SUMMARY_FALLBACK;
}

/**
 * Summarizes messages with progressive fallback strategies for robustness.
 *
 * Fallback strategy:
 * 1. Try summarizing all messages
 * 2. If that fails, try summarizing only non-oversized messages
 * 3. If that also fails, return a placeholder noting what was omitted
 *
 * This ensures the system degrades gracefully when dealing with large contexts
 * or when the summarization service encounters issues.
 *
 * @param params - Summarization parameters
 * @returns Summary string (never throws - always returns at least a fallback)
 */
export async function summarizeWithFallback(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext["model"]>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  const { messages, contextWindow } = params;

  // Handle empty input
  if (!Array.isArray(messages) || messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  // Validate context window
  const safeContextWindow = validateTokenCount(contextWindow, 8192);

  // Attempt 1: Try full summarization with all messages
  try {
    return await summarizeChunks(params);
  } catch (fullError) {
    console.warn(
      `[summarizeWithFallback] Full summarization failed for ${messages.length} messages: ${
        fullError instanceof Error ? fullError.message : String(fullError)
      }`,
    );
  }

  // Attempt 2: Filter out oversized messages and retry
  const smallMessages: AgentMessage[] = [];
  const oversizedNotes: string[] = [];

  for (const msg of messages) {
    if (!msg) {
      continue;
    } // Skip null/undefined

    if (isOversizedForSummary(msg, safeContextWindow)) {
      const role = (msg as { role?: string }).role ?? "message";
      const tokens = estimateTokens(msg);
      const tokenK = Math.round(tokens / 1000);
      oversizedNotes.push(`[Large ${role} (~${tokenK}K tokens) omitted from summary]`);
    } else {
      smallMessages.push(msg);
    }
  }

  // Only try partial summarization if we have small messages to summarize
  if (smallMessages.length >= MIN_MESSAGES_FOR_SUMMARY) {
    try {
      const partialSummary = await summarizeChunks({
        ...params,
        messages: smallMessages,
      });
      const notes = oversizedNotes.length > 0 ? `\n\n${oversizedNotes.join("\n")}` : "";
      return partialSummary + notes;
    } catch (partialError) {
      console.warn(
        `[summarizeWithFallback] Partial summarization also failed (tried ${smallMessages.length} messages): ${
          partialError instanceof Error ? partialError.message : String(partialError)
        }`,
      );
    }
  }

  // Attempt 3: Final fallback - just describe what was present
  const oversizedCount = oversizedNotes.length;
  const totalCount = messages.length;

  if (params.previousSummary) {
    return (
      `${params.previousSummary}\n\n` +
      `[Context update: ${totalCount} new messages (${oversizedCount} oversized) could not be summarized]`
    );
  }

  return (
    `Context contained ${totalCount} messages (${oversizedCount} oversized). ` +
    `Summary unavailable due to size limits.`
  );
}

export async function summarizeInStages(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext["model"]>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
  parts?: number;
  minMessagesForSplit?: number;
}): Promise<string> {
  const { messages } = params;
  if (messages.length === 0) {
    return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const minMessagesForSplit = Math.max(2, params.minMessagesForSplit ?? 4);
  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, messages.length);
  const totalTokens = estimateMessagesTokens(messages);

  if (parts <= 1 || messages.length < minMessagesForSplit || totalTokens <= params.maxChunkTokens) {
    return summarizeWithFallback(params);
  }

  const splits = splitMessagesByTokenShare(messages, parts).filter((chunk) => chunk.length > 0);
  if (splits.length <= 1) {
    return summarizeWithFallback(params);
  }

  const partialSummaries: string[] = [];
  for (const chunk of splits) {
    partialSummaries.push(
      await summarizeWithFallback({
        ...params,
        messages: chunk,
        previousSummary: undefined,
      }),
    );
  }

  if (partialSummaries.length === 1) {
    return partialSummaries[0];
  }

  const summaryMessages: AgentMessage[] = partialSummaries.map((summary) => ({
    role: "user",
    content: summary,
    timestamp: Date.now(),
  }));

  const mergeInstructions = params.customInstructions
    ? `${MERGE_SUMMARIES_INSTRUCTIONS}\n\nAdditional focus:\n${params.customInstructions}`
    : MERGE_SUMMARIES_INSTRUCTIONS;

  return summarizeWithFallback({
    ...params,
    messages: summaryMessages,
    customInstructions: mergeInstructions,
  });
}

export function pruneHistoryForContextShare(params: {
  messages: AgentMessage[];
  maxContextTokens: number;
  maxHistoryShare?: number;
  parts?: number;
}): {
  messages: AgentMessage[];
  droppedMessagesList: AgentMessage[];
  droppedChunks: number;
  droppedMessages: number;
  droppedTokens: number;
  keptTokens: number;
  budgetTokens: number;
} {
  const maxHistoryShare = params.maxHistoryShare ?? 0.5;
  const budgetTokens = Math.max(1, Math.floor(params.maxContextTokens * maxHistoryShare));
  let keptMessages = params.messages;
  const allDroppedMessages: AgentMessage[] = [];
  let droppedChunks = 0;
  let droppedMessages = 0;
  let droppedTokens = 0;

  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, keptMessages.length);

  while (keptMessages.length > 0 && estimateMessagesTokens(keptMessages) > budgetTokens) {
    const chunks = splitMessagesByTokenShare(keptMessages, parts);
    if (chunks.length <= 1) {
      break;
    }
    const [dropped, ...rest] = chunks;
    const flatRest = rest.flat();

    // After dropping a chunk, repair tool_use/tool_result pairing to handle
    // orphaned tool_results (whose tool_use was in the dropped chunk).
    // repairToolUseResultPairing drops orphaned tool_results, preventing
    // "unexpected tool_use_id" errors from Anthropic's API.
    const repairReport = repairToolUseResultPairing(flatRest);
    const repairedKept = repairReport.messages;

    // Track orphaned tool_results as dropped (they were in kept but their tool_use was dropped)
    const orphanedCount = repairReport.droppedOrphanCount;

    droppedChunks += 1;
    droppedMessages += dropped.length + orphanedCount;
    droppedTokens += estimateMessagesTokens(dropped);
    // Note: We don't have the actual orphaned messages to add to droppedMessagesList
    // since repairToolUseResultPairing doesn't return them. This is acceptable since
    // the dropped messages are used for summarization, and orphaned tool_results
    // without their tool_use context aren't useful for summarization anyway.
    allDroppedMessages.push(...dropped);
    keptMessages = repairedKept;
  }

  return {
    messages: keptMessages,
    droppedMessagesList: allDroppedMessages,
    droppedChunks,
    droppedMessages,
    droppedTokens,
    keptTokens: estimateMessagesTokens(keptMessages),
    budgetTokens,
  };
}

export function resolveContextWindowTokens(model?: ExtensionContext["model"]): number {
  return Math.max(1, Math.floor(model?.contextWindow ?? DEFAULT_CONTEXT_TOKENS));
}
