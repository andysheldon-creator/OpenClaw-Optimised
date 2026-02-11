/**
 * Summarization logic for hierarchical memory.
 *
 * Uses the LLM to generate autobiographical summaries of conversation chunks.
 */

import type { HierarchicalMemoryConfig, SummaryLevel } from "./types.js";
import {
  buildChunkSummarizationPrompt,
  buildMergeSummariesPrompt,
  MERGE_SUMMARIES_SYSTEM,
  SUMMARIZE_CHUNK_SYSTEM,
} from "./prompts.js";

export type SummarizationParams = {
  /** Model to use for summarization */
  model: string;
  /** Provider for the model */
  provider: string;
  /** API key for the provider */
  apiKey: string;
  /** Resolved OpenClaw config (avoids re-reading config from disk) */
  config: import("../../config/types.openclaw.js").OpenClawConfig;
  /** Abort signal */
  signal?: AbortSignal;
  /** Target token count for the summary */
  targetTokens?: number;
};

export type ChunkToSummarize = {
  /** Messages in this chunk */
  messages: Array<{ role: string; content?: unknown }>;
  /** Entry IDs covered by this chunk */
  entryIds: string[];
  /** Session ID these entries came from */
  sessionId: string;
  /** Estimated token count of the chunk */
  tokenEstimate: number;
};

/**
 * Estimate tokens for an array of messages.
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content?: unknown }>,
): number {
  let total = 0;
  for (const msg of messages) {
    // Simple estimation based on content length
    const content =
      typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    // Rough estimate: 4 chars per token
    total += Math.ceil(content.length / 4);
  }
  return total;
}

/**
 * Summarize a chunk of conversation messages.
 */
export async function summarizeChunk(params: {
  chunk: ChunkToSummarize;
  priorSummaries: string[];
  config: HierarchicalMemoryConfig;
  summarization: SummarizationParams;
}): Promise<string> {
  const { chunk, priorSummaries, config, summarization } = params;

  const prompt = buildChunkSummarizationPrompt({
    priorSummaries,
    messages: chunk.messages,
  });

  const summary = await callLlmForSummary({
    systemPrompt: SUMMARIZE_CHUNK_SYSTEM,
    userPrompt: prompt,
    targetTokens: config.summaryTargetTokens,
    model: summarization.model,
    provider: summarization.provider,
    apiKey: summarization.apiKey,
    config: summarization.config,
    signal: summarization.signal,
  });

  return summary;
}

/**
 * Merge multiple summaries into one.
 */
export async function mergeSummaries(params: {
  summaries: string[];
  olderContext: string[];
  config: HierarchicalMemoryConfig;
  summarization: SummarizationParams;
}): Promise<string> {
  const { summaries, olderContext, config, summarization } = params;

  const prompt = buildMergeSummariesPrompt({
    summaries,
    olderContext: olderContext.length > 0 ? olderContext : undefined,
  });

  const merged = await callLlmForSummary({
    systemPrompt: MERGE_SUMMARIES_SYSTEM,
    userPrompt: prompt,
    targetTokens: config.summaryTargetTokens,
    model: summarization.model,
    provider: summarization.provider,
    apiKey: summarization.apiKey,
    config: summarization.config,
    signal: summarization.signal,
  });

  return merged;
}

/**
 * Call the LLM to generate a summary.
 * Uses completeSimple for a straightforward non-streaming completion.
 */
async function callLlmForSummary(params: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  provider: string;
  apiKey: string;
  config: import("../../config/types.openclaw.js").OpenClawConfig;
  signal?: AbortSignal;
  targetTokens?: number;
}): Promise<string> {
  // Import dynamically to avoid circular dependencies
  const { completeSimple } = await import("@mariozechner/pi-ai");
  const { resolveModel } = await import("../../agents/pi-embedded-runner/model.js");
  const { resolveOpenClawAgentDir } = await import("../../agents/agent-paths.js");

  const config = params.config;
  const agentDir = resolveOpenClawAgentDir();

  const { model } = resolveModel(params.provider, params.model, agentDir, config);

  if (!model) {
    throw new Error(`Failed to resolve model: ${params.provider}/${params.model}`);
  }

  const maxTokens = params.targetTokens ?? 1000;

  const res = await completeSimple(
    model,
    {
      systemPrompt: params.systemPrompt,
      messages: [
        {
          role: "user",
          content: params.userPrompt,
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: params.apiKey,
      maxTokens,
      signal: params.signal,
    },
  );

  // Extract text from the response
  const textContent = res.content.find(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  return textContent?.text?.trim() ?? "";
}

/**
 * Determine the source level for a target level.
 */
export function getSourceLevel(targetLevel: SummaryLevel): "L0" | "L1" | "L2" {
  switch (targetLevel) {
    case "L1":
      return "L0";
    case "L2":
      return "L1";
    case "L3":
      return "L2";
  }
}

/**
 * Get the next level up from a given level.
 */
export function getNextLevel(level: SummaryLevel): SummaryLevel | null {
  switch (level) {
    case "L1":
      return "L2";
    case "L2":
      return "L3";
    case "L3":
      return null; // No level above L3
  }
}
