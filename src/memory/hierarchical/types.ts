/**
 * Hierarchical Memory System Types
 *
 * A 2048-style compression system for long-running conversations.
 * Chunks of ~6k tokens are summarized to ~1k, then 6 summaries merge into 1.
 */

export type SummaryLevel = "L1" | "L2" | "L3";

export type SummaryEntry = {
  /** Unique ID within the level (e.g., "0001") */
  id: string;

  /** When this summary was created */
  createdAt: number;

  /** Estimated token count of the summary */
  tokenEstimate: number;

  /** What level this summary belongs to */
  level: SummaryLevel;

  /** Source level that was summarized */
  sourceLevel: "L0" | "L1" | "L2";

  /**
   * IDs of source items:
   * - For L1: entry IDs from the session JSONL
   * - For L2/L3: summary IDs from the lower level
   */
  sourceIds: string[];

  /** Session ID this summary originated from (for L1 only) */
  sourceSessionId?: string;

  /** If merged into a higher level, the ID of that summary */
  mergedInto: string | null;
};

export type SummaryIndex = {
  /** Schema version for migrations */
  version: 1;

  /** Agent this index belongs to */
  agentId: string;

  /** Last entry ID from JSONL that was summarized */
  lastSummarizedEntryId: string | null;

  /** Session ID of the last summarized entry */
  lastSummarizedSessionId: string | null;

  /** Summaries organized by level */
  levels: {
    L1: SummaryEntry[];
    L2: SummaryEntry[];
    L3: SummaryEntry[];
  };

  /** Worker state */
  worker: {
    lastRunAt: number | null;
    lastRunDurationMs: number | null;
    lastError: string | null;
  };
};

export type HierarchicalMemoryConfig = {
  /** Enable the hierarchical memory system (default: false) */
  enabled: boolean;

  /** How often the worker runs in milliseconds (default: 300000 = 5 min) */
  workerIntervalMs: number;

  /** Minimum tokens in a chunk before summarization (default: 6000) */
  chunkTokens: number;

  /** Target token count for summaries (default: 1000) */
  summaryTargetTokens: number;

  /** Number of summaries before merging to next level (default: 6) */
  mergeThreshold: number;

  /** Messages must be this many tokens behind current to be eligible (default: 30000) */
  pruningBoundaryTokens: number;

  /** Model to use for summarization (default: session's model) */
  model?: string;

  /** Maximum levels (default: 3) */
  maxLevels: number;
};

export const DEFAULT_HIERARCHICAL_MEMORY_CONFIG: HierarchicalMemoryConfig = {
  enabled: false,
  workerIntervalMs: 5 * 60 * 1000, // 5 minutes
  chunkTokens: 6000,
  summaryTargetTokens: 1000,
  mergeThreshold: 6,
  pruningBoundaryTokens: 30000,
  maxLevels: 3,
};

export function createEmptyIndex(agentId: string): SummaryIndex {
  return {
    version: 1,
    agentId,
    lastSummarizedEntryId: null,
    lastSummarizedSessionId: null,
    levels: {
      L1: [],
      L2: [],
      L3: [],
    },
    worker: {
      lastRunAt: null,
      lastRunDurationMs: null,
      lastError: null,
    },
  };
}

/** Get summaries that haven't been merged into a higher level */
export function getUnmergedSummaries(index: SummaryIndex, level: SummaryLevel): SummaryEntry[] {
  return index.levels[level].filter((s) => s.mergedInto === null);
}

/** Get all summaries for context injection (oldest to newest) */
export function getAllSummariesForContext(index: SummaryIndex): {
  L3: SummaryEntry[];
  L2: SummaryEntry[];
  L1: SummaryEntry[];
} {
  return {
    L3: getUnmergedSummaries(index, "L3"),
    L2: getUnmergedSummaries(index, "L2"),
    L1: getUnmergedSummaries(index, "L1"),
  };
}
