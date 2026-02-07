/**
 * Hybrid Retriever (Component 10)
 *
 * Blends results from canonical store (SQLite FTS), graph (Graphiti),
 * and vector (Graphiti vector or pgvector) sources.
 * Gracefully degrades when optional sources are unavailable.
 */

import type { MeridiaDbBackend, RecordQueryResult } from "../db/backend.js";
import type { RetrievalIntent } from "./intent.js";
import type { ScoredResult } from "./ranker.js";
import type { VectorSearchAdapter } from "./vector-adapter.js";
import { rankResults } from "./ranker.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type AvailableSources = {
  /** Always available: canonical SQLite store */
  canonical: MeridiaDbBackend;
  /** Optional: vector search adapter */
  vector?: VectorSearchAdapter;
  // Graph search would go here when implemented
};

export type HybridRetrievalResult = {
  results: ScoredResult[];
  sourceCounts: {
    canonical: number;
    graph: number;
    vector: number;
  };
};

// ────────────────────────────────────────────────────────────────────────────
// Hybrid retrieval
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve from all available sources and blend results.
 */
export async function hybridRetrieve(
  intent: RetrievalIntent,
  sources: AvailableSources,
): Promise<HybridRetrievalResult> {
  const allResults: ScoredResult[] = [];
  const counts = { canonical: 0, graph: 0, vector: 0 };

  // 1. Always: canonical store (SQLite FTS or filtered query)
  const canonicalResults = await canonicalSearch(intent, sources.canonical);
  allResults.push(...canonicalResults);
  counts.canonical = canonicalResults.length;

  // 2. Optional: vector similarity search
  if (sources.vector && intent.query) {
    try {
      const available = await sources.vector.isAvailable();
      if (available) {
        const vectorResults = await vectorSearch(intent, sources.vector, sources.canonical);
        allResults.push(...vectorResults);
        counts.vector = vectorResults.length;
      }
    } catch {
      // Vector search failure is non-fatal
    }
  }

  // 3. Rank and deduplicate
  const ranked = rankResults(allResults, intent.maxResults);

  return { results: ranked, sourceCounts: counts };
}

// ────────────────────────────────────────────────────────────────────────────
// Source-specific retrieval
// ────────────────────────────────────────────────────────────────────────────

async function canonicalSearch(
  intent: RetrievalIntent,
  backend: MeridiaDbBackend,
): Promise<ScoredResult[]> {
  let results: RecordQueryResult[];

  const filters = {
    sessionKey: intent.sessionKey,
    toolName: intent.toolName,
    minScore: intent.minScore,
    limit: intent.maxResults,
    tag: intent.tag,
  };

  if (intent.query) {
    results = await backend.searchRecords(intent.query, filters);
  } else if (intent.timeWindow) {
    results = await backend.getRecordsByDateRange(
      intent.timeWindow.from,
      intent.timeWindow.to,
      filters,
    );
  } else if (intent.sessionKey) {
    results = await backend.getRecordsBySession(intent.sessionKey, {
      limit: intent.maxResults,
    });
  } else {
    results = await backend.getRecentRecords(intent.maxResults, filters);
  }

  return results.map((r) => ({
    record: r.record,
    source: "canonical" as const,
    sourceScore: r.rank,
    finalScore: r.record.capture.score,
  }));
}

async function vectorSearch(
  intent: RetrievalIntent,
  adapter: VectorSearchAdapter,
  backend: MeridiaDbBackend,
): Promise<ScoredResult[]> {
  if (!intent.query) return [];

  const matches = await adapter.search(intent.query, {
    topK: Math.min(intent.maxResults, 10),
    minSimilarity: 0.3,
  });

  // Resolve matched IDs to full records from canonical store
  const results: ScoredResult[] = [];
  for (const match of matches) {
    try {
      const record = await backend.getRecordById(match.id);
      if (record) {
        results.push({
          record: record.record,
          source: "vector",
          sourceScore: match.similarity,
          finalScore: match.similarity,
        });
      }
    } catch {
      // Skip unresolvable vector matches
    }
  }

  return results;
}
