/**
 * GAP 7: Conflito & Negociação — Negotiation Manager
 *
 * Provides assertiveness guidance for agents when they encounter
 * concerns about deadlines, scope, design, or resource conflicts.
 * Each concern has a recommended response based on severity:
 * - CRITICAL → Push back hard, escalate immediately
 * - HIGH → Express concern respectfully but firmly
 * - MEDIUM → Note concern, stay open to discussion
 * - LOW → Document for reference, don't block progress
 *
 * Also tracks conflict history to inform future negotiations.
 */

import type postgres from "postgres";
import type { AssertivenessRule, ConflictHistory } from "../models/types.js";
import { unifiedCacheGetOrSet } from "../../../infra/cache/unified-cache.js";

const NEGOTIATION_CACHE_TTL = 1800; // 30 minutes

/** Default assertiveness responses by concern level */
const DEFAULT_ASSERTIVENESS: Record<string, string> = {
  critical: "🔴 **This is critical.** You MUST push back and escalate immediately.",
  high: '🟡 **This is important.** Express your concern respectfully: "I have concerns about..."',
  medium: "🟠 **Note your concern** but be open to discussion.",
  low: "🟢 You can live with this, but document your concern for future reference.",
};

/**
 * Manages conflict resolution and negotiation strategies for agents.
 */
export class NegotiationManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load assertiveness rules for an agent.
   */
  async loadAssertivenessRules(agentId: string): Promise<AssertivenessRule[]> {
    return unifiedCacheGetOrSet(
      `humanization:assertiveness:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_assertiveness_rules
          WHERE agent_id = ${agentId}
        `;
        return rows as unknown as AssertivenessRule[];
      },
      { ttlSeconds: NEGOTIATION_CACHE_TTL },
    );
  }

  /**
   * Get recommended response for a specific concern type and level.
   */
  getRecommendedResponse(
    rules: AssertivenessRule[],
    concernType: string,
    concernLevel: string,
  ): string {
    const rule = rules.find((r: unknown) => {
      const row = r as Record<string, unknown>;
      return (
        (row.concern_type ?? (r as AssertivenessRule).concernType) === concernType &&
        (row.concern_level ?? (r as AssertivenessRule).concernLevel) === concernLevel
      );
    });

    if (rule) {
      return (
        ((rule as unknown as Record<string, unknown>).recommended_response as string) ??
        rule.recommendedResponse
      );
    }
    return DEFAULT_ASSERTIVENESS[concernLevel] ?? "Express your concern constructively.";
  }

  /**
   * Record a conflict event for learning and future reference.
   */
  async recordConflict(
    agentId: string,
    conflict: {
      type: string;
      level: string;
      otherAgentId?: string;
      description?: string;
      timestamp: Date;
    },
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_conflict_history (agent_id, other_agent_id, conflict_type, description, resolution)
      VALUES (
        ${agentId},
        ${conflict.otherAgentId ?? null},
        ${conflict.type},
        ${conflict.description ?? `${conflict.type} concern at ${conflict.level} level`},
        'waiting'
      )
    `;
  }

  /**
   * Resolve a conflict — record the outcome for future learning.
   */
  async resolveConflict(
    conflictId: string,
    resolution: "agreed" | "escalated" | "resolved",
    outcome?: string,
    resolvedBy?: string,
  ): Promise<void> {
    await this.sql`
      UPDATE agent_conflict_history
      SET
        resolution = ${resolution},
        outcome = ${outcome ?? null},
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = ${resolvedBy ?? null}
      WHERE id = ${conflictId}
    `;
  }

  /**
   * Get conflict history for an agent — useful for detecting
   * recurring patterns with specific collaborators.
   */
  async getConflictHistory(agentId: string, limit = 20): Promise<ConflictHistory[]> {
    return unifiedCacheGetOrSet(
      `humanization:conflicts:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_conflict_history
          WHERE agent_id = ${agentId}
          ORDER BY resolved_at DESC NULLS FIRST
          LIMIT ${limit}
        `;
        return rows as unknown as ConflictHistory[];
      },
      { ttlSeconds: NEGOTIATION_CACHE_TTL },
    );
  }
}
