/**
 * Context injection for hierarchical memory.
 *
 * Loads summaries and formats them for injection into the system prompt.
 */

import { hasSummaries, loadSummaryContents, loadSummaryIndex } from "./storage.js";
import { getAllSummariesForContext } from "./types.js";

export type MemoryContext = {
  /** Formatted memory section to inject into system prompt */
  memorySection: string;
  /** Number of summaries at each level */
  counts: {
    L1: number;
    L2: number;
    L3: number;
  };
  /** Estimated token count of the memory section */
  tokenEstimate: number;
};

/**
 * Load and format hierarchical memory for system prompt injection.
 */
export async function loadMemoryContext(agentId?: string): Promise<MemoryContext | null> {
  // Quick check if there are any summaries
  if (!(await hasSummaries(agentId))) {
    return null;
  }

  const index = await loadSummaryIndex(agentId);
  const summaryContext = getAllSummariesForContext(index);

  // Load contents for each level
  const L3Contents = await loadSummaryContents(summaryContext.L3, agentId);
  const L2Contents = await loadSummaryContents(summaryContext.L2, agentId);
  const L1Contents = await loadSummaryContents(summaryContext.L1, agentId);

  // If no summaries at any level, return null
  if (L3Contents.length === 0 && L2Contents.length === 0 && L1Contents.length === 0) {
    return null;
  }

  // Format the memory section
  const memorySection = formatMemorySection(L3Contents, L2Contents, L1Contents);

  // Rough token estimate (4 chars per token)
  const tokenEstimate = Math.ceil(memorySection.length / 4);

  return {
    memorySection,
    counts: {
      L1: L1Contents.length,
      L2: L2Contents.length,
      L3: L3Contents.length,
    },
    tokenEstimate,
  };
}

/**
 * Format summaries into a memory section for the system prompt.
 */
function formatMemorySection(L3: string[], L2: string[], L1: string[]): string {
  const sections: string[] = [];

  sections.push("## My memories of our conversation\n");
  sections.push("(These are my autobiographical memories from our ongoing relationship.)\n");

  if (L3.length > 0) {
    sections.push("\n### Long-term memory\n");
    sections.push(L3.join("\n\n---\n\n"));
  }

  if (L2.length > 0) {
    sections.push("\n### Earlier context\n");
    sections.push(L2.join("\n\n---\n\n"));
  }

  if (L1.length > 0) {
    sections.push("\n### Recent memory\n");
    sections.push(L1.join("\n\n---\n\n"));
  }

  return sections.join("\n");
}

/**
 * Get the last summarized entry ID from the index.
 * Used to filter recent messages (only include those after this ID).
 */
export async function getLastSummarizedEntryId(agentId?: string): Promise<string | null> {
  try {
    const index = await loadSummaryIndex(agentId);
    return index.lastSummarizedEntryId;
  } catch {
    return null;
  }
}

/**
 * Check if hierarchical memory has any data for an agent.
 */
export async function hasMemoryData(agentId?: string): Promise<boolean> {
  return hasSummaries(agentId);
}

/**
 * Get summary statistics for display.
 */
export async function getMemoryStats(agentId?: string): Promise<{
  totalSummaries: number;
  levels: { L1: number; L2: number; L3: number };
  lastSummarizedAt: number | null;
  lastWorkerRun: number | null;
} | null> {
  try {
    const index = await loadSummaryIndex(agentId);

    const L1Count = index.levels.L1.length;
    const L2Count = index.levels.L2.length;
    const L3Count = index.levels.L3.length;

    if (L1Count === 0 && L2Count === 0 && L3Count === 0) {
      return null;
    }

    // Find most recent summary timestamp
    let lastSummarizedAt: number | null = null;
    for (const level of [index.levels.L1, index.levels.L2, index.levels.L3]) {
      for (const summary of level) {
        if (!lastSummarizedAt || summary.createdAt > lastSummarizedAt) {
          lastSummarizedAt = summary.createdAt;
        }
      }
    }

    return {
      totalSummaries: L1Count + L2Count + L3Count,
      levels: { L1: L1Count, L2: L2Count, L3: L3Count },
      lastSummarizedAt,
      lastWorkerRun: index.worker.lastRunAt,
    };
  } catch {
    return null;
  }
}
