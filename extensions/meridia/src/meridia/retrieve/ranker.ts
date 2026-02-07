/**
 * Result Ranker
 *
 * Blends and ranks results from multiple sources (canonical, graph, vector)
 * with configurable weights for significance, recency, and diversity.
 */

import type { MeridiaExperienceRecord } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ScoredResult = {
  record: MeridiaExperienceRecord;
  /** Source that produced this result */
  source: "canonical" | "graph" | "vector";
  /** Raw score from source (FTS rank, similarity, etc.) */
  sourceScore?: number;
  /** Final blended score */
  finalScore: number;
};

export type RankingWeights = {
  significance: number;
  recency: number;
  diversity: number;
  sourceScore: number;
};

const DEFAULT_WEIGHTS: RankingWeights = {
  significance: 0.35,
  recency: 0.25,
  diversity: 0.15,
  sourceScore: 0.25,
};

// ────────────────────────────────────────────────────────────────────────────
// Ranking
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rank and deduplicate results from multiple sources.
 */
export function rankResults(
  results: ScoredResult[],
  maxResults: number,
  weights?: Partial<RankingWeights>,
): ScoredResult[] {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const nowMs = Date.now();

  // Deduplicate by record ID (keep highest source score)
  const byId = new Map<string, ScoredResult>();
  for (const r of results) {
    const existing = byId.get(r.record.id);
    if (!existing || (r.sourceScore ?? 0) > (existing.sourceScore ?? 0)) {
      byId.set(r.record.id, r);
    }
  }

  const unique = Array.from(byId.values());

  // Compute final scores
  const scored = unique.map((r) => {
    const significance = r.record.capture.score;
    const recency = computeRecencyScore(r.record.ts, nowMs);
    const sourceScore = normalizeSourceScore(r.sourceScore ?? 0, r.source);

    const finalScore =
      w.significance * significance + w.recency * recency + w.sourceScore * sourceScore;

    return { ...r, finalScore };
  });

  // Sort by final score descending
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Apply diversity penalty (reduce score for same-tool clustering)
  const diversified = applyDiversityPenalty(scored, w.diversity);

  return diversified.slice(0, maxResults);
}

// ────────────────────────────────────────────────────────────────────────────
// Score components
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute a recency score with exponential decay.
 * Half-life: 24 hours. Score goes from 1.0 (now) to ~0 (old).
 */
function computeRecencyScore(isoTs: string, nowMs: number): number {
  const tsMs = Date.parse(isoTs);
  if (!Number.isFinite(tsMs)) return 0;
  const ageMs = nowMs - tsMs;
  if (ageMs <= 0) return 1;
  const halfLifeMs = 24 * 60 * 60 * 1000; // 24 hours
  return Math.exp((-Math.LN2 * ageMs) / halfLifeMs);
}

/**
 * Normalize source scores to 0–1 range.
 * FTS BM25 scores are negative (closer to 0 = better).
 * Vector similarity scores are already 0–1.
 */
function normalizeSourceScore(score: number, source: string): number {
  if (source === "canonical") {
    // BM25 scores: typically -20 to 0, closer to 0 = better
    return Math.max(0, Math.min(1, 1 + score / 20));
  }
  if (source === "vector") {
    // Cosine similarity: 0–1
    return Math.max(0, Math.min(1, score));
  }
  // Default: assume 0–1 range
  return Math.max(0, Math.min(1, score));
}

/**
 * Penalize results that cluster on the same tool to improve diversity.
 */
function applyDiversityPenalty(results: ScoredResult[], weight: number): ScoredResult[] {
  if (weight <= 0) return results;

  const toolSeen = new Map<string, number>();
  return results
    .map((r) => {
      const tool = r.record.tool?.name ?? "(none)";
      const count = toolSeen.get(tool) ?? 0;
      toolSeen.set(tool, count + 1);

      // Apply increasing penalty for repeated tools
      const penalty = count > 0 ? weight * Math.min(count * 0.1, 0.3) : 0;
      return { ...r, finalScore: r.finalScore - penalty };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
