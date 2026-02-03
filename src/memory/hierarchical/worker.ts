/**
 * Background worker for hierarchical memory summarization.
 *
 * Runs on a timer, finds eligible chunks, summarizes them,
 * and merges summaries when thresholds are reached.
 */

import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { getApiKeyForModel } from "../../agents/model-auth.js";
import { loadConfig } from "../../config/config.js";
import { loadSessionStore } from "../../config/sessions.js";
import { resolveSessionFilePath, resolveStorePath } from "../../config/sessions/paths.js";
import { resolveHierarchicalMemoryConfig } from "./config.js";
import { acquireSummaryLock } from "./lock.js";
import {
  generateNextSummaryId,
  loadSummaryContents,
  loadSummaryIndex,
  saveSummaryIndex,
  writeSummary,
} from "./storage.js";
import {
  type ChunkToSummarize,
  estimateMessagesTokens,
  getNextLevel,
  getSourceLevel,
  mergeSummaries,
  summarizeChunk,
  type SummarizationParams,
} from "./summarize.js";
import {
  getAllSummariesForContext,
  getUnmergedSummaries,
  type HierarchicalMemoryConfig,
  type SummaryEntry,
  type SummaryIndex,
} from "./types.js";

export type WorkerResult = {
  success: boolean;
  skipped?: "disabled" | "lock_held" | "no_session";
  chunksProcessed?: number;
  mergesPerformed?: number;
  error?: string;
  durationMs?: number;
};

/**
 * Run the hierarchical memory worker for an agent.
 */
export async function runHierarchicalMemoryWorker(params: {
  agentId: string;
  config?: OpenClawConfig;
  signal?: AbortSignal;
}): Promise<WorkerResult> {
  const startTime = Date.now();
  const config = params.config ?? loadConfig();
  const memoryConfig = resolveHierarchicalMemoryConfig(config);

  if (!memoryConfig.enabled) {
    return { success: true, skipped: "disabled" };
  }

  // Acquire lock to prevent concurrent runs
  const lock = await acquireSummaryLock(params.agentId);
  if (!lock) {
    return { success: true, skipped: "lock_held" };
  }

  try {
    const result = await runWorkerWithLock({
      agentId: params.agentId,
      config,
      memoryConfig,
      signal: params.signal,
    });

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await lock.release();
  }
}

async function runWorkerWithLock(params: {
  agentId: string;
  config: OpenClawConfig;
  memoryConfig: HierarchicalMemoryConfig;
  signal?: AbortSignal;
}): Promise<Omit<WorkerResult, "durationMs">> {
  const { agentId, config, memoryConfig, signal } = params;

  try {
    // Load current state
    const index = await loadSummaryIndex(agentId);

    // Find the current session
    const storePath = resolveStorePath(config.session?.store, { agentId });
    const sessionStore = loadSessionStore(storePath);
    const mainSessionKey = `agent:${agentId}:main`;
    const sessionEntry = sessionStore[mainSessionKey];

    if (!sessionEntry?.sessionId) {
      return { success: true, skipped: "no_session" };
    }

    const sessionFile = resolveSessionFilePath(sessionEntry.sessionId, sessionEntry, { agentId });

    // Get summarization params
    const summarization = await resolveSummarizationParams({
      config,
      memoryConfig,
      sessionEntry,
      agentId,
    });

    if (!summarization) {
      return {
        success: false,
        error: "Failed to resolve summarization parameters (no API key?)",
      };
    }

    // Phase 1: Find and summarize eligible chunks
    const chunks = await findEligibleChunks({
      sessionFile,
      lastSummarizedEntryId: index.lastSummarizedEntryId,
      memoryConfig,
      sessionId: sessionEntry.sessionId,
    });

    let chunksProcessed = 0;
    for (const chunk of chunks) {
      if (signal?.aborted) {
        break;
      }

      // Load prior summaries for context
      const summaryContext = getAllSummariesForContext(index);
      const priorSummaries = [
        ...(await loadSummaryContents(summaryContext.L3, agentId)),
        ...(await loadSummaryContents(summaryContext.L2, agentId)),
        ...(await loadSummaryContents(summaryContext.L1, agentId)),
      ];

      // Summarize the chunk
      const summaryContent = await summarizeChunk({
        chunk,
        priorSummaries,
        config: memoryConfig,
        summarization,
      });

      // Create and save the summary entry
      const summaryId = generateNextSummaryId(index, "L1");
      const entry: SummaryEntry = {
        id: summaryId,
        level: "L1",
        createdAt: Date.now(),
        tokenEstimate: Math.ceil(summaryContent.length / 4), // Rough estimate
        sourceLevel: "L0",
        sourceIds: chunk.entryIds,
        sourceSessionId: chunk.sessionId,
        mergedInto: null,
      };

      await writeSummary(entry, summaryContent, agentId);
      index.levels.L1.push(entry);
      index.lastSummarizedEntryId = chunk.entryIds[chunk.entryIds.length - 1];
      index.lastSummarizedSessionId = chunk.sessionId;

      chunksProcessed++;
    }

    // Phase 2: Check for merges at each level
    let mergesPerformed = 0;

    for (const level of ["L1", "L2"] as const) {
      if (signal?.aborted) {
        break;
      }

      const merged = await maybeMergeLevel({
        index,
        level,
        memoryConfig,
        summarization,
        agentId,
      });

      if (merged) {
        mergesPerformed++;
      }
    }

    // Save updated index
    index.worker.lastRunAt = Date.now();
    index.worker.lastError = null;
    await saveSummaryIndex(index, agentId);

    return {
      success: true,
      chunksProcessed,
      mergesPerformed,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Try to save error state
    try {
      const index = await loadSummaryIndex(agentId);
      index.worker.lastRunAt = Date.now();
      index.worker.lastError = errorMessage;
      await saveSummaryIndex(index, agentId);
    } catch {
      // Ignore save errors
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Find chunks of messages eligible for summarization.
 */
async function findEligibleChunks(params: {
  sessionFile: string;
  lastSummarizedEntryId: string | null;
  memoryConfig: HierarchicalMemoryConfig;
  sessionId: string;
}): Promise<ChunkToSummarize[]> {
  const { sessionFile, lastSummarizedEntryId, memoryConfig, sessionId } = params;

  let sessionManager: SessionManager;
  try {
    sessionManager = SessionManager.open(sessionFile);
  } catch {
    return []; // Session file doesn't exist or is invalid
  }

  try {
    const context = sessionManager.buildSessionContext();
    const messages = context.messages;

    if (messages.length === 0) {
      return [];
    }

    // Estimate total tokens
    const totalTokens = estimateMessagesTokens(messages);

    // Only consider messages that are past the pruning boundary
    // (i.e., old enough that they've been through context pruning)
    const pruningBoundary = totalTokens - memoryConfig.pruningBoundaryTokens;
    if (pruningBoundary <= 0) {
      return []; // Not enough history yet
    }

    // Find messages to consider (after lastSummarizedEntryId, before pruning boundary)
    const entries = sessionManager.getEntries();
    let startIndex = 0;

    if (lastSummarizedEntryId) {
      const lastIdx = entries.findIndex((e) => e.id === lastSummarizedEntryId);
      if (lastIdx >= 0) {
        startIndex = lastIdx + 1;
      }
    }

    // Build chunks
    const chunks: ChunkToSummarize[] = [];
    let currentChunk: ChunkToSummarize = {
      messages: [],
      entryIds: [],
      sessionId,
      tokenEstimate: 0,
    };

    let runningTokens = 0;
    for (let i = startIndex; i < entries.length; i++) {
      const entry = entries[i];

      // Skip non-message entries
      if (entry.type !== "message") {
        continue;
      }

      const msg = entry.message as { role: string; content?: unknown };
      const msgTokens = estimateMessagesTokens([msg]);

      // Check if we're past the pruning boundary
      runningTokens += msgTokens;
      if (runningTokens > pruningBoundary) {
        break; // Stop - remaining messages are too recent
      }

      currentChunk.messages.push(msg);
      currentChunk.entryIds.push(entry.id);
      currentChunk.tokenEstimate += msgTokens;

      // Check if chunk is big enough
      if (currentChunk.tokenEstimate >= memoryConfig.chunkTokens) {
        // Ensure we end on a complete turn (assistant message)
        if (msg.role === "assistant") {
          chunks.push(currentChunk);
          currentChunk = {
            messages: [],
            entryIds: [],
            sessionId,
            tokenEstimate: 0,
          };
        }
      }
    }

    // Don't add partial chunks - they'll be picked up next time

    return chunks;
  } finally {
    // SessionManager doesn't have dispose in all versions, but we're done with it
  }
}

/**
 * Merge summaries at a level if threshold is reached.
 */
async function maybeMergeLevel(params: {
  index: SummaryIndex;
  level: "L1" | "L2";
  memoryConfig: HierarchicalMemoryConfig;
  summarization: SummarizationParams;
  agentId: string;
}): Promise<boolean> {
  const { index, level, memoryConfig, summarization, agentId } = params;

  const unmerged = getUnmergedSummaries(index, level);

  if (unmerged.length < memoryConfig.mergeThreshold) {
    return false; // Not enough to merge yet
  }

  const nextLevel = getNextLevel(level);
  if (!nextLevel) {
    return false; // Already at max level
  }

  // Load summary contents
  const summaryContents = await loadSummaryContents(unmerged, agentId);

  // Load older context (higher levels)
  const olderContext: string[] = [];
  if (nextLevel === "L2") {
    olderContext.push(...(await loadSummaryContents(index.levels.L3, agentId)));
  }
  if (nextLevel === "L3") {
    // L3 has no older context
  }

  // Merge summaries
  const mergedContent = await mergeSummaries({
    summaries: summaryContents,
    olderContext,
    config: memoryConfig,
    summarization,
  });

  // Create merged entry
  const mergedId = generateNextSummaryId(index, nextLevel);
  const mergedEntry: SummaryEntry = {
    id: mergedId,
    level: nextLevel,
    createdAt: Date.now(),
    tokenEstimate: Math.ceil(mergedContent.length / 4),
    sourceLevel: getSourceLevel(nextLevel),
    sourceIds: unmerged.map((s) => s.id),
    mergedInto: null,
  };

  // Save merged summary
  await writeSummary(mergedEntry, mergedContent, agentId);
  index.levels[nextLevel].push(mergedEntry);

  // Mark source summaries as merged
  for (const summary of unmerged) {
    summary.mergedInto = mergedId;
  }

  return true;
}

/**
 * Resolve parameters needed for summarization.
 */
async function resolveSummarizationParams(params: {
  config: OpenClawConfig;
  memoryConfig: HierarchicalMemoryConfig;
  sessionEntry: { model?: string };
  agentId: string;
}): Promise<SummarizationParams | null> {
  const { config, memoryConfig, sessionEntry } = params;

  // Determine model to use
  const modelSpec =
    memoryConfig.model ?? sessionEntry.model ?? "anthropic/claude-sonnet-4-20250514";
  const [provider, model] = modelSpec.includes("/")
    ? modelSpec.split("/", 2)
    : ["anthropic", modelSpec];

  // Get API key
  const apiKeyInfo = await getApiKeyForModel({
    model: { provider, id: model } as Parameters<typeof getApiKeyForModel>[0]["model"],
    cfg: config,
    agentDir: undefined,
  });

  if (!apiKeyInfo.apiKey) {
    return null;
  }

  return {
    model,
    provider,
    apiKey: apiKeyInfo.apiKey,
  };
}
