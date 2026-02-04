/**
 * Deterministic chunk selection for context assembly.
 *
 * Selection is deterministic: same inputs always produce same outputs.
 * - Sort by score descending
 * - Tie-break by chunk ID ascending (lexicographic)
 * - Include chunks until budget is exhausted
 */
import type { TokenEstimator } from "./token-estimator.js";

/**
 * A context chunk with provenance tracking.
 */
export interface ContextChunk {
  /** Stable unique identifier (required, used for deterministic tie-breaking) */
  id: string;
  /** Text content of the chunk */
  text: string;
  /** Source identifier (file path, document ID, URL, etc.) */
  source: string;
  /** Optional provenance metadata for traceability */
  provenance?: {
    /** Page number (for PDFs, documents) */
    page?: number;
    /** Start offset in source */
    offsetStart?: number;
    /** End offset in source */
    offsetEnd?: number;
    /** Block or section name */
    blockName?: string;
  };
  /** Retrieval score (higher = more relevant). Default: 0 */
  score?: number;
}

/**
 * Selection mode determines filtering behavior.
 */
export type SelectionMode = "default" | "strict_provenance";

/**
 * Result of chunk selection.
 */
export interface SelectionResult {
  /** Chunks included in the context (in selection order) */
  included: ContextChunk[];
  /** Chunks excluded with reasons */
  excluded: Array<{ chunk: ContextChunk; reason: string }>;
  /** Total tokens of included chunks */
  totalTokens: number;
}

/**
 * Entry in the selection manifest for logging/debugging.
 */
export interface ChunkManifestEntry {
  id: string;
  source: string;
  tokens: number;
  score: number;
  included: boolean;
  reason?: string;
  provenance?: ContextChunk["provenance"];
}

/**
 * Compare function for deterministic chunk ordering.
 * Sort by score descending, then by ID ascending for tie-breaking.
 */
function compareChunks(a: ContextChunk, b: ContextChunk): number {
  const scoreA = a.score ?? 0;
  const scoreB = b.score ?? 0;
  // Higher score first
  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }
  // Tie-break: lexicographic ID ascending
  return a.id.localeCompare(b.id);
}

/**
 * Check if chunk has complete provenance (all fields populated).
 */
function hasCompleteProvenance(chunk: ContextChunk): boolean {
  if (!chunk.provenance) return false;
  const p = chunk.provenance;
  return (
    p.page !== undefined ||
    (p.offsetStart !== undefined && p.offsetEnd !== undefined) ||
    p.blockName !== undefined
  );
}

/**
 * Select chunks deterministically within a token budget.
 *
 * @param chunks - Candidate chunks to select from
 * @param budget - Maximum tokens to include
 * @param estimator - Token estimator for counting
 * @param mode - Selection mode (default or strict_provenance)
 * @returns Selection result with included/excluded chunks and total tokens
 */
export function selectChunks(
  chunks: ContextChunk[],
  budget: number,
  estimator: TokenEstimator,
  mode: SelectionMode = "default",
): SelectionResult {
  const included: ContextChunk[] = [];
  const excluded: Array<{ chunk: ContextChunk; reason: string }> = [];
  let totalTokens = 0;

  // Sort deterministically: score desc, then ID asc
  const sorted = [...chunks].sort(compareChunks);

  for (const chunk of sorted) {
    // Check provenance requirement in strict mode
    if (mode === "strict_provenance" && !hasCompleteProvenance(chunk)) {
      excluded.push({ chunk, reason: "missing_provenance" });
      continue;
    }

    const chunkTokens = estimator.estimate(chunk.text);

    // Check budget
    if (totalTokens + chunkTokens > budget) {
      excluded.push({
        chunk,
        reason: `over_budget (need ${chunkTokens}, have ${budget - totalTokens} remaining)`,
      });
      continue;
    }

    // Include chunk
    included.push(chunk);
    totalTokens += chunkTokens;
  }

  return { included, excluded, totalTokens };
}

/**
 * Build manifest entries for all chunks (for logging).
 *
 * @param chunks - All candidate chunks
 * @param result - Selection result
 * @param estimator - Token estimator
 * @returns Array of manifest entries
 */
export function buildChunkManifest(
  chunks: ContextChunk[],
  result: SelectionResult,
  estimator: TokenEstimator,
): ChunkManifestEntry[] {
  const includedIds = new Set(result.included.map((c) => c.id));
  const excludedMap = new Map(result.excluded.map((e) => [e.chunk.id, e.reason]));

  return chunks.map((chunk) => ({
    id: chunk.id,
    source: chunk.source,
    tokens: estimator.estimate(chunk.text),
    score: chunk.score ?? 0,
    included: includedIds.has(chunk.id),
    reason: excludedMap.get(chunk.id),
    provenance: chunk.provenance,
  }));
}
