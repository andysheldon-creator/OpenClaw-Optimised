/**
 * Trust-Weighted RAG Retrieval (FB-013)
 *
 * Blends cosine similarity scores with trust levels from the memory
 * provenance system (FB-009) to produce trust-adjusted rankings.
 *
 * Low-trust content (e.g. web scrapes) gets its relevance score
 * penalised, while high-trust content (e.g. user-provided facts)
 * gets a boost. This prevents injection of untrusted content into
 * the agent's context via poisoned RAG stores.
 *
 * Depends on: FB-009 (memory source provenance)
 */

import { defaultRuntime } from "../runtime.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrustWeightConfig = {
  /** Whether trust weighting is enabled. Defaults to true. */
  enabled: boolean;
  /** Blend factor: 0.0 = pure similarity, 1.0 = pure trust. Defaults to 0.3. */
  trustBlendFactor: number;
  /** Minimum trust level to include in results. Items below are filtered. Defaults to 0.0 (no filter). */
  minTrustLevel: number;
  /** Penalty multiplier for low-trust items (trust < 0.5). Defaults to 0.7. */
  lowTrustPenalty: number;
  /** Boost multiplier for high-trust items (trust >= 0.8). Defaults to 1.15. */
  highTrustBoost: number;
};

export type ScoredItem<T> = {
  item: T;
  similarityScore: number;
  trustLevel: number;
  adjustedScore: number;
};

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: TrustWeightConfig = {
  enabled: true,
  trustBlendFactor: 0.3,
  minTrustLevel: 0.0,
  lowTrustPenalty: 0.7,
  highTrustBoost: 1.15,
};

// ─── Trust-Weighted Scoring ───────────────────────────────────────────────────

/**
 * Compute a trust-adjusted score by blending similarity and trust.
 *
 * Formula:
 *   base = similarity * (1 - blendFactor) + trust * blendFactor
 *   if trust < 0.5: base *= lowTrustPenalty
 *   if trust >= 0.8: base *= highTrustBoost
 *   final = clamp(0, 1)
 */
export function computeTrustAdjustedScore(
  similarityScore: number,
  trustLevel: number,
  config: TrustWeightConfig = DEFAULT_CONFIG,
): number {
  if (!config.enabled) return similarityScore;

  const blend = config.trustBlendFactor;
  let adjusted = similarityScore * (1 - blend) + trustLevel * blend;

  if (trustLevel < 0.5) {
    adjusted *= config.lowTrustPenalty;
  } else if (trustLevel >= 0.8) {
    adjusted *= config.highTrustBoost;
  }

  return Math.max(0, Math.min(1, adjusted));
}

/**
 * Apply trust weighting to an array of scored items.
 * Filters by minTrustLevel, recomputes scores, and re-sorts.
 */
export function applyTrustWeighting<T>(
  items: Array<{ item: T; similarityScore: number; trustLevel: number }>,
  config: Partial<TrustWeightConfig> = {},
): ScoredItem<T>[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    return items.map((i) => ({
      ...i,
      adjustedScore: i.similarityScore,
    }));
  }

  const scored = items
    // Filter by minimum trust
    .filter((i) => i.trustLevel >= cfg.minTrustLevel)
    // Compute adjusted scores
    .map((i) => ({
      ...i,
      adjustedScore: computeTrustAdjustedScore(
        i.similarityScore,
        i.trustLevel,
        cfg,
      ),
    }))
    // Sort by adjusted score (highest first)
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  if (scored.length !== items.length) {
    defaultRuntime.log?.(
      `[trust-retrieval] filtered ${items.length - scored.length} items below trust threshold ${cfg.minTrustLevel}`,
    );
  }

  return scored;
}

/**
 * Get the trust weight config with optional overrides.
 */
export function getTrustWeightConfig(
  overrides?: Partial<TrustWeightConfig>,
): TrustWeightConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
