/**
 * GAP 8: Reputação & Accountability — Reputation Manager
 *
 * Tracks agent reputation across multiple dimensions:
 * - Reliability: Does the agent deliver on time?
 * - Quality: Is the output consistently good?
 * - Accountability: Does the agent acknowledge mistakes?
 * - Communication: Is the agent clear and responsive?
 * - Collaboration: Does the agent play well with others?
 *
 * Reputation decays slowly over time (configurable decay factor),
 * encouraging agents to maintain consistent performance.
 * The track record provides concrete evidence for reputation scores.
 */

import type postgres from "postgres";
import type { AgentReputation, TrackRecord } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const REPUTATION_CACHE_TTL = 1800; // 30 minutes

/**
 * Manages agent reputation and track record.
 */
export class ReputationManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load the agent's reputation profile.
   * Creates a default neutral profile for new agents.
   */
  async loadReputation(agentId: string): Promise<AgentReputation> {
    return unifiedCacheGetOrSet(
      `humanization:reputation:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_reputation
          WHERE agent_id = ${agentId}
        `;
        return (rows[0] as unknown as AgentReputation) ?? this.createDefaultReputation(agentId);
      },
      { ttlSeconds: REPUTATION_CACHE_TTL },
    );
  }

  /**
   * Load task delivery history for an agent.
   */
  async loadTrackRecord(agentId: string, limit = 10): Promise<TrackRecord[]> {
    return unifiedCacheGetOrSet(
      `humanization:track-record:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_track_record
          WHERE agent_id = ${agentId}
          ORDER BY completed_at DESC
          LIMIT ${limit}
        `;
        return rows as unknown as TrackRecord[];
      },
      { ttlSeconds: REPUTATION_CACHE_TTL },
    );
  }

  /**
   * Record a task completion for the agent's track record.
   * Also triggers a reputation recalculation.
   */
  async recordTaskCompletion(record: Omit<TrackRecord, "id">): Promise<void> {
    await this.sql`
      INSERT INTO agent_track_record (agent_id, task_id, task_name, category, planned_days, actual_days, quality_rating, delivered_status, completed_at, notes)
      VALUES (
        ${record.agentId},
        ${record.taskId},
        ${record.taskName ?? null},
        ${record.category ?? null},
        ${record.plannedDays},
        ${record.actualDays},
        ${record.qualityRating},
        ${record.deliveredStatus},
        ${record.completedAt},
        ${record.notes ?? null}
      )
    `;

    // Recalculate reputation based on new track record
    await this.recalculateReputation(record.agentId);

    await unifiedCacheDelete(`humanization:track-record:${record.agentId}`);
    await unifiedCacheDelete(`humanization:reputation:${record.agentId}`);
  }

  /**
   * Apply weekly reputation decay — prevents stale high scores.
   * Scores drift toward 0.5 (neutral) over time without new evidence.
   */
  async applyReputationDecay(agentId: string, decayFactor = 0.95): Promise<void> {
    await this.sql`
      UPDATE agent_reputation
      SET
        reliability_score = 0.5 + (reliability_score - 0.5) * ${decayFactor},
        accountability_score = 0.5 + (accountability_score - 0.5) * ${decayFactor},
        communication_score = 0.5 + (communication_score - 0.5) * ${decayFactor},
        collaboration_score = 0.5 + (collaboration_score - 0.5) * ${decayFactor},
        last_updated = CURRENT_TIMESTAMP
      WHERE agent_id = ${agentId}
    `;
    await unifiedCacheDelete(`humanization:reputation:${agentId}`);
  }

  /**
   * Recalculate reputation from the last N track records.
   */
  private async recalculateReputation(agentId: string): Promise<void> {
    const records = await this.sql`
      SELECT delivered_status, quality_rating
      FROM agent_track_record
      WHERE agent_id = ${agentId}
      ORDER BY completed_at DESC
      LIMIT 20
    `;

    if (records.length === 0) {
      return;
    }

    // Calculate reliability from delivery status
    const onTime = records.filter(
      (r: unknown) =>
        (r as Record<string, unknown>).delivered_status === "on_time" ||
        (r as Record<string, unknown>).delivered_status === "early",
    ).length;
    const reliabilityScore = onTime / records.length;

    // Calculate quality score
    const qualityMap: Record<string, number> = {
      excellent: 1.0,
      good: 0.75,
      average: 0.5,
      poor: 0.25,
    };
    const avgQuality =
      records.reduce(
        (sum: number, r: unknown) =>
          sum + (qualityMap[(r as Record<string, unknown>).quality_rating as string] ?? 0.5),
        0,
      ) / records.length;

    // Determine speed rating
    const speedRating =
      reliabilityScore > 0.8 ? "fast" : reliabilityScore > 0.6 ? "on_track" : "slow";
    const qualityRating =
      avgQuality > 0.8
        ? "excellent"
        : avgQuality > 0.6
          ? "good"
          : avgQuality > 0.4
            ? "average"
            : "poor";

    // Determine trend based on recent vs older performance
    const recentHalf = records.slice(0, Math.ceil(records.length / 2));
    const olderHalf = records.slice(Math.ceil(records.length / 2));
    const recentOnTime =
      recentHalf.filter(
        (r: unknown) =>
          (r as Record<string, unknown>).delivered_status === "on_time" ||
          (r as Record<string, unknown>).delivered_status === "early",
      ).length / (recentHalf.length || 1);
    const olderOnTime =
      olderHalf.filter(
        (r: unknown) =>
          (r as Record<string, unknown>).delivered_status === "on_time" ||
          (r as Record<string, unknown>).delivered_status === "early",
      ).length / (olderHalf.length || 1);
    const trend =
      recentOnTime > olderOnTime + 0.1
        ? "improving"
        : recentOnTime < olderOnTime - 0.1
          ? "declining"
          : "stable";

    await this.sql`
      INSERT INTO agent_reputation (agent_id, reliability_score, speed_rating, quality_rating, trend, last_updated)
      VALUES (${agentId}, ${reliabilityScore}, ${speedRating}, ${qualityRating}, ${trend}, CURRENT_TIMESTAMP)
      ON CONFLICT (agent_id)
      DO UPDATE SET
        reliability_score = ${reliabilityScore},
        speed_rating = ${speedRating},
        quality_rating = ${qualityRating},
        trend = ${trend},
        last_updated = CURRENT_TIMESTAMP
    `;
  }

  /** Default neutral reputation for new agents */
  private createDefaultReputation(agentId: string): AgentReputation {
    return {
      id: "",
      agentId,
      reliabilityScore: 0.5,
      speedRating: "unknown",
      qualityRating: "unknown",
      accountabilityScore: 0.5,
      communicationScore: 0.5,
      collaborationScore: 0.5,
      trend: "stable",
      lastUpdated: new Date(),
    };
  }
}
