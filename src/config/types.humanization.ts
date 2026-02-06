/**
 * Configuration types for the Agent Humanization System.
 *
 * Enables agents to learn from mistakes, build intuition,
 * manage energy, navigate relationships, and earn trust.
 */

export type HumanizationAutonomyLevel = "FULL" | "PROPOSE_THEN_DECIDE" | "ASK_THEN_WAIT";

export type HumanizationConfig = {
  /** Enable the humanization system. Requires PostgreSQL. Default: false */
  enabled?: boolean;

  /** Energy tracking: measure agent workload and quality variance. Default: true */
  energyTracking?: boolean;

  /** Learning loop: extract patterns from outcomes. Default: true */
  learningLoop?: boolean;

  /** Weekly reputation decay factor (0-1). Prevents stale high scores. Default: 0.95 */
  reputationDecay?: number;

  /** Default autonomy levels by risk tier */
  autonomyDefaults?: HumanizationAutonomyDefaults;

  /** Pattern detection thresholds */
  patterns?: HumanizationPatternConfig;

  /** Energy model configuration */
  energy?: HumanizationEnergyConfig;
};

export type HumanizationAutonomyDefaults = {
  /** Autonomy for low-risk decisions. Default: "FULL" */
  low?: HumanizationAutonomyLevel;
  /** Autonomy for medium-risk decisions. Default: "PROPOSE_THEN_DECIDE" */
  medium?: HumanizationAutonomyLevel;
  /** Autonomy for high-risk decisions. Default: "ASK_THEN_WAIT" */
  high?: HumanizationAutonomyLevel;
};

export type HumanizationPatternConfig = {
  /** Minimum occurrences before creating a mistake pattern. Default: 3 */
  mistakeThreshold?: number;
  /** Minimum successes before creating an intuition rule. Default: 5 */
  intuitionThreshold?: number;
  /** Minimum interactions before calculating chemistry. Default: 3 */
  chemistryThreshold?: number;
};

export type HumanizationEnergyConfig = {
  /** Energy cost per 1000 tokens. Default: 0.01 */
  tokenCostPer1k?: number;
  /** Extra energy cost per context switch. Default: 0.05 */
  contextSwitchCost?: number;
  /** Energy threshold to suggest compaction. Default: 0.3 */
  compactionThreshold?: number;
  /** Maximum deep work minutes before break suggestion. Default: 120 */
  maxDeepWorkMinutes?: number;
};
