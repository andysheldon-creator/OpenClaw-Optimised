/**
 * Scoring configuration defaults and resolution.
 */
import type {
  ScoringConfig,
  ScoringOverride,
  ScoringThresholdProfile,
  ScoringWeights,
} from "./types.js";

// ────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  novelty: 0.25,
  impact: 0.3,
  relational: 0.15,
  temporal: 0.1,
  userIntent: 0.2,
};

export const DEFAULT_SCORING_THRESHOLDS: ScoringThresholdProfile = {
  captureThreshold: 0.35,
  graphPersistThreshold: 0.55,
  llmEvalThreshold: 0.4,
};

export const DEFAULT_SCORING_OVERRIDES: ScoringOverride[] = [
  // Always capture experience_capture (user explicit requests)
  { toolPattern: "experience_capture", decision: "always_capture" },
  // Always skip low-value reads
  { toolPattern: "memory_search", maxScore: 0.15 },
  { toolPattern: "memory_recall", maxScore: 0.15 },
  { toolPattern: "memory_get", maxScore: 0.1 },
  // External messaging is always important
  { toolPattern: "message", minScore: 0.6 },
  { toolPattern: "sessions_send", minScore: 0.55 },
  // Voice calls are highly significant
  { toolPattern: "voice_call", minScore: 0.7 },
  // Cron management has moderate importance
  { toolPattern: "cron", minScore: 0.4 },
];

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_SCORING_WEIGHTS,
  thresholds: DEFAULT_SCORING_THRESHOLDS,
  overrides: DEFAULT_SCORING_OVERRIDES,
};

// ────────────────────────────────────────────────────────────────────────────
// Named Threshold Profiles
// ────────────────────────────────────────────────────────────────────────────

export const THRESHOLD_PROFILES: Record<string, ScoringThresholdProfile> = {
  /** Default balanced profile */
  balanced: {
    captureThreshold: 0.35,
    graphPersistThreshold: 0.55,
    llmEvalThreshold: 0.4,
  },
  /** Aggressive capture — more memories, higher token cost */
  aggressive: {
    captureThreshold: 0.2,
    graphPersistThreshold: 0.4,
    llmEvalThreshold: 0.25,
  },
  /** Conservative capture — fewer memories, lower token cost */
  conservative: {
    captureThreshold: 0.5,
    graphPersistThreshold: 0.7,
    llmEvalThreshold: 0.55,
  },
  /** Minimal — only capture highly significant events */
  minimal: {
    captureThreshold: 0.65,
    graphPersistThreshold: 0.8,
    llmEvalThreshold: 0.7,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Config Resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a partial scoring config into a complete config with defaults.
 */
export function resolveScoringConfig(partial?: Partial<ScoringConfig>): ScoringConfig {
  if (!partial) {
    return { ...DEFAULT_SCORING_CONFIG };
  }

  return {
    weights: {
      ...DEFAULT_SCORING_WEIGHTS,
      ...partial.weights,
    },
    thresholds: {
      ...DEFAULT_SCORING_THRESHOLDS,
      ...partial.thresholds,
    },
    overrides: partial.overrides ?? DEFAULT_SCORING_OVERRIDES,
  };
}

/**
 * Normalize weights so they sum to 1.0.
 */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.novelty + weights.impact + weights.relational + weights.temporal + weights.userIntent;
  if (sum === 0) {
    // Equal weights as fallback
    return { novelty: 0.2, impact: 0.2, relational: 0.2, temporal: 0.2, userIntent: 0.2 };
  }
  return {
    novelty: weights.novelty / sum,
    impact: weights.impact / sum,
    relational: weights.relational / sum,
    temporal: weights.temporal / sum,
    userIntent: weights.userIntent / sum,
  };
}
