/**
 * GAP 5: Intuição & Julgamento — Intuition Manager
 *
 * Manages pattern-action rules that let agents develop "gut feelings."
 * When an agent encounters a situation that matches known patterns,
 * it can leverage past outcomes to make faster, more confident decisions.
 *
 * Over time, accuracy rates improve as the agent confirms or corrects
 * its intuitive responses, creating a feedback loop of refinement.
 */

import type postgres from "postgres";
import type { IntuitionRule } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const INTUITION_CACHE_TTL = 1200; // 20 minutes

/**
 * Manages pattern-based intuition rules for agents.
 */
export class IntuitionManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load the agent's intuition rules, ranked by accuracy.
   */
  async loadIntuitionRules(agentId: string): Promise<IntuitionRule[]> {
    return unifiedCacheGetOrSet(
      `humanization:intuition:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_intuition_rules
          WHERE agent_id = ${agentId}
          ORDER BY accuracy_rate DESC
          LIMIT 20
        `;
        return rows as unknown as IntuitionRule[];
      },
      { ttlSeconds: INTUITION_CACHE_TTL },
    );
  }

  /**
   * Match current context against known intuition rules.
   * Returns rules that match with a score > 0.5, sorted by match quality.
   */
  matchIntuitionRules(rules: unknown[], context: unknown): unknown[] {
    return rules
      .map((rule) => {
        const r = rule as Record<string, unknown>;
        return {
          ...r,
          matchScore: this.calculateMatchScore(
            r.trigger_conditions ?? r.triggerConditions,
            context,
          ),
        };
      })
      .filter((r) => r.matchScore > 0.5)
      .toSorted((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Record the outcome of a pattern match — did the intuition prove correct?
   * This feeds back into accuracy_rate for continuous refinement.
   */
  async recordPatternOutcome(
    agentId: string,
    ruleId: string,
    outcome: "correct" | "incorrect" | "partial",
    context?: Record<string, unknown>,
  ): Promise<void> {
    // Record the match
    await this.sql`
      INSERT INTO agent_pattern_matches (agent_id, rule_id, matched_context, action_taken, outcome)
      VALUES (${agentId}, ${ruleId}, ${JSON.stringify(context ?? {})}, 'applied', ${outcome})
    `;

    // Update accuracy rate on the rule
    const isCorrect = outcome === "correct" ? 1 : 0;
    await this.sql`
      UPDATE agent_intuition_rules
      SET
        times_triggered = times_triggered + 1,
        times_correct = times_correct + ${isCorrect},
        accuracy_rate = (times_correct + ${isCorrect})::float / (times_triggered + 1)
      WHERE id = ${ruleId} AND agent_id = ${agentId}
    `;
    await unifiedCacheDelete(`humanization:intuition:${agentId}`);
  }

  /**
   * Create a new intuition rule from an observed pattern.
   */
  async createIntuitionRule(
    agentId: string,
    rule: {
      patternName: string;
      patternDescription: string;
      triggerConditions: Record<string, unknown>;
      recommendedAction: string;
      initialConfidence?: number;
    },
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_intuition_rules (agent_id, pattern_name, pattern_description, trigger_conditions, recommended_action, action_confidence)
      VALUES (
        ${agentId},
        ${rule.patternName},
        ${rule.patternDescription},
        ${JSON.stringify(rule.triggerConditions)},
        ${rule.recommendedAction},
        ${rule.initialConfidence ?? 0.5}
      )
      ON CONFLICT (agent_id, pattern_name)
      DO UPDATE SET
        pattern_description = EXCLUDED.pattern_description,
        trigger_conditions = EXCLUDED.trigger_conditions,
        recommended_action = EXCLUDED.recommended_action
    `;
    await unifiedCacheDelete(`humanization:intuition:${agentId}`);
  }

  /**
   * Calculate how well a context matches trigger conditions.
   * Returns 0-1 score based on proportion of matching keys.
   */
  private calculateMatchScore(conditions: unknown, context: unknown): number {
    if (!conditions || !context) {
      return 0;
    }
    const condObj = conditions as Record<string, unknown>;
    const ctxObj = context as Record<string, unknown>;
    let matches = 0;
    const keys = Object.keys(condObj);
    if (keys.length === 0) {
      return 0;
    }
    for (const key of keys) {
      if (ctxObj[key] === condObj[key]) {
        matches++;
      }
    }
    return matches / keys.length;
  }
}
