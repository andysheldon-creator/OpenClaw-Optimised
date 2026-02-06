/**
 * GAP 2: Autonomia com Risco — Autonomy Manager
 *
 * Manages risk-based autonomy levels for agent decision-making.
 * Each agent has configurable thresholds:
 * - LOW risk → FULL autonomy (just do it)
 * - MEDIUM risk → PROPOSE_THEN_DECIDE (announce, then act if no objection)
 * - HIGH risk → ASK_THEN_WAIT (get explicit approval)
 *
 * Autonomy can expand as agents build trust through their track record.
 */

import type postgres from "postgres";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";
import { AutonomyType, RiskLevel, type AutonomyConfig } from "../models/types.js";

const AUTONOMY_CACHE_TTL = 1800; // 30 minutes

/** Default autonomy tiers for new agents */
const DEFAULT_AUTONOMY_CONFIG: Omit<
  AutonomyConfig,
  "id" | "agentId" | "createdAt" | "updatedAt"
>[] = [
  {
    riskLevel: RiskLevel.LOW,
    autonomyType: AutonomyType.FULL,
    definition: "Less than 2 hours impact",
  },
  {
    riskLevel: RiskLevel.MEDIUM,
    autonomyType: AutonomyType.PROPOSE_THEN_DECIDE,
    definition: "2-48 hours impact",
  },
  {
    riskLevel: RiskLevel.HIGH,
    autonomyType: AutonomyType.ASK_THEN_WAIT,
    definition: "More than 48 hours impact",
  },
];

/**
 * Manages agent autonomy levels based on risk assessment.
 */
export class AutonomyManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load autonomy configuration for an agent.
   * Falls back to sensible defaults if none configured.
   */
  async loadAutonomyConfig(agentId: string): Promise<unknown[]> {
    return unifiedCacheGetOrSet(
      `humanization:autonomy:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_autonomy_config
          WHERE agent_id = ${agentId}
        `;
        return rows.length > 0
          ? (rows as unknown[])
          : DEFAULT_AUTONOMY_CONFIG.map((c) => ({
              ...c,
              risk_level: c.riskLevel,
              autonomy_type: c.autonomyType,
            }));
      },
      { ttlSeconds: AUTONOMY_CACHE_TTL },
    );
  }

  /**
   * Determine the autonomy level for a specific risk level.
   */
  async getAutonomyLevel(agentId: string, riskLevel: string): Promise<AutonomyType> {
    const config = await this.loadAutonomyConfig(agentId);
    const match = config.find(
      (c: unknown) => (c as Record<string, unknown>).risk_level === riskLevel,
    );
    return (
      ((match as Record<string, unknown> | undefined)?.autonomy_type as AutonomyType) ??
      AutonomyType.ASK_THEN_WAIT
    );
  }

  /**
   * Log a decision made by the agent for tracking and learning.
   */
  async logDecision(
    agentId: string,
    decisionType: string,
    autonomyLevel: AutonomyType,
    timestamp: Date,
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_decision_log (time, agent_id, decision_type, decision_quality, decision_time)
      VALUES (${timestamp}, ${agentId}, ${decisionType}, 'pending', ${timestamp})
    `;
  }

  /**
   * Update autonomy config — e.g., after trust increases,
   * an agent might get higher autonomy for medium-risk tasks.
   */
  async updateAutonomyConfig(
    agentId: string,
    riskLevel: string,
    autonomyType: AutonomyType,
    definition?: string,
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_autonomy_config (agent_id, risk_level, autonomy_type, definition)
      VALUES (${agentId}, ${riskLevel}, ${autonomyType}, ${definition ?? ""})
      ON CONFLICT (agent_id, risk_level)
      DO UPDATE SET
        autonomy_type = EXCLUDED.autonomy_type,
        definition = COALESCE(EXCLUDED.definition, agent_autonomy_config.definition),
        updated_at = CURRENT_TIMESTAMP
    `;
    await unifiedCacheDelete(`humanization:autonomy:${agentId}`);
  }
}
