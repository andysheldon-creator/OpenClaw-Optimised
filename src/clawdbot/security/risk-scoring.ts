/**
 * SEC-007 (#81) — Approval risk scoring
 *
 * Quantitative risk assessment for actions that require approval.
 * Each action is scored against a set of weighted risk factors, producing
 * a composite risk score and a human-readable risk level. Approval UIs
 * can use the score to prioritise reviews and surface high-risk items.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discrete risk level derived from the composite score. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** A single risk factor contributing to the overall score. */
export type RiskFactor = {
  /** Identifier of the factor (e.g. `"external_network"`, `"pii_present"`). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Raw score contribution (0 - 100). */
  score: number;
  /** Weight multiplier (0.0 - 1.0). Higher = more influential. */
  weight: number;
  /** Optional explanation of why this factor was triggered. */
  reason?: string;
};

/** The result of scoring an action's risk. */
export type RiskScore = {
  /** Composite score (0 - 100). */
  score: number;
  /** Derived risk level. */
  level: RiskLevel;
  /** Individual factors that contributed to the score. */
  factors: RiskFactor[];
  /** ISO-8601 timestamp of when the score was calculated. */
  calculatedAt: string;
};

/** Context describing the action to be scored. */
export type RiskContext = {
  /** Tool or runner being invoked (e.g. `"email-runner"`, `"cli-runner"`). */
  tool: string;
  /** Target environment (e.g. `"dev"`, `"staging"`, `"prod"`). */
  environment: string;
  /** Whether the action accesses or transmits PII. */
  involvesPii: boolean;
  /** Whether the action reaches external networks. */
  externalNetwork: boolean;
  /** Whether the action mutates state (write / delete / send). */
  mutatesState: boolean;
  /** Whether the action involves financial transactions. */
  financial: boolean;
  /** Additional context for custom factor evaluators. */
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Level thresholds
// ---------------------------------------------------------------------------

/** Score thresholds for each risk level (inclusive lower bound). */
const LEVEL_THRESHOLDS: readonly { level: RiskLevel; min: number }[] = [
  { level: "critical", min: 80 },
  { level: "high", min: 60 },
  { level: "medium", min: 30 },
  { level: "low", min: 0 },
];

// ---------------------------------------------------------------------------
// Built-in factor evaluators
// ---------------------------------------------------------------------------

type FactorEvaluator = (ctx: RiskContext) => RiskFactor | null;

const BUILTIN_EVALUATORS: readonly FactorEvaluator[] = [
  // Production environment factor.
  (ctx) =>
    ctx.environment === "prod"
      ? {
          id: "prod_environment",
          label: "Production environment",
          score: 40,
          weight: 1.0,
          reason: "Action targets a production environment.",
        }
      : null,

  // External network factor.
  (ctx) =>
    ctx.externalNetwork
      ? {
          id: "external_network",
          label: "External network access",
          score: 30,
          weight: 0.8,
          reason: "Action reaches external networks.",
        }
      : null,

  // PII involvement factor.
  (ctx) =>
    ctx.involvesPii
      ? {
          id: "pii_present",
          label: "PII involvement",
          score: 35,
          weight: 0.9,
          reason: "Action accesses or transmits PII.",
        }
      : null,

  // State mutation factor.
  (ctx) =>
    ctx.mutatesState
      ? {
          id: "mutates_state",
          label: "State mutation",
          score: 20,
          weight: 0.7,
          reason: "Action modifies persistent state.",
        }
      : null,

  // Financial transaction factor.
  (ctx) =>
    ctx.financial
      ? {
          id: "financial",
          label: "Financial transaction",
          score: 50,
          weight: 1.0,
          reason: "Action involves financial transactions.",
        }
      : null,
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Calculate a composite risk score for an action based on its context.
 *
 * The score is a weighted average of all triggered risk factors, normalised
 * to the 0-100 range. A risk level is derived from configurable thresholds.
 *
 * @param context            - Description of the action to score.
 * @param customEvaluators   - Optional additional evaluators beyond built-ins.
 * @returns The computed risk score with contributing factors.
 */
export function calculateRiskScore(
  context: RiskContext,
  customEvaluators: readonly FactorEvaluator[] = [],
): RiskScore {
  const evaluators = [...BUILTIN_EVALUATORS, ...customEvaluators];
  const factors: RiskFactor[] = [];

  for (const evaluate of evaluators) {
    const factor = evaluate(context);
    if (factor) {
      factors.push(factor);
    }
  }

  // Weighted average — if no factors fire, score is 0.
  let totalWeight = 0;
  let weightedSum = 0;

  for (const f of factors) {
    weightedSum += f.score * f.weight;
    totalWeight += f.weight;
  }

  const score = totalWeight > 0 ? Math.min(100, Math.round(weightedSum / totalWeight)) : 0;

  // Derive the risk level from thresholds.
  let level: RiskLevel = "low";
  for (const threshold of LEVEL_THRESHOLDS) {
    if (score >= threshold.min) {
      level = threshold.level;
      break;
    }
  }

  return {
    score,
    level,
    factors,
    calculatedAt: new Date().toISOString(),
  };
}
