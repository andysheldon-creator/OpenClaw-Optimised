/**
 * GAP 4: Relacionamentos — Relationship Manager
 *
 * Tracks trust scores, collaboration quality, and interaction history
 * between agents. Enables agents to adapt their communication style
 * based on past interactions — formal with new collaborators,
 * efficient with trusted ones, careful with difficult ones.
 */

import type postgres from "postgres";
import type { AgentRelationship } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const RELATIONSHIP_CACHE_TTL = 1800; // 30 minutes

/**
 * Manages inter-agent relationships and collaboration quality.
 */
export class RelationshipManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load all relationships for an agent, ranked by trust.
   */
  async loadRelationships(agentId: string): Promise<AgentRelationship[]> {
    return unifiedCacheGetOrSet(
      `humanization:relationships:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_relationships
          WHERE agent_id = ${agentId}
          ORDER BY trust_score DESC
        `;
        return rows as unknown as AgentRelationship[];
      },
      { ttlSeconds: RELATIONSHIP_CACHE_TTL },
    );
  }

  /**
   * Get a specific relationship between two agents.
   */
  async getRelationship(agentId: string, otherAgentId: string): Promise<AgentRelationship | null> {
    const rows = await this.sql`
      SELECT * FROM agent_relationships
      WHERE agent_id = ${agentId} AND other_agent_id = ${otherAgentId}
      LIMIT 1
    `;
    return (rows[0] as unknown as AgentRelationship) ?? null;
  }

  /**
   * Update a relationship after an interaction.
   * Adjusts trust score and collaboration quality based on outcome.
   */
  async updateRelationship(
    agentId: string,
    otherAgentId: string,
    update: {
      outcome: "positive" | "negative" | "neutral";
      quality?: string;
      notes?: string;
    },
  ): Promise<void> {
    const trustDelta =
      update.outcome === "positive" ? 0.05 : update.outcome === "negative" ? -0.1 : 0;

    await this.sql`
      INSERT INTO agent_relationships (agent_id, other_agent_id, trust_score, collaboration_quality, interaction_count, positive_interactions, negative_interactions, last_interaction, notes)
      VALUES (
        ${agentId}, ${otherAgentId}, ${0.5 + trustDelta},
        ${update.quality ?? "unknown"}, 1,
        ${update.outcome === "positive" ? 1 : 0},
        ${update.outcome === "negative" ? 1 : 0},
        CURRENT_TIMESTAMP, ${update.notes ?? null}
      )
      ON CONFLICT (agent_id, other_agent_id)
      DO UPDATE SET
        trust_score = LEAST(1.0, GREATEST(0.0, agent_relationships.trust_score + ${trustDelta})),
        collaboration_quality = COALESCE(${update.quality ?? null}, agent_relationships.collaboration_quality),
        interaction_count = agent_relationships.interaction_count + 1,
        positive_interactions = agent_relationships.positive_interactions + ${update.outcome === "positive" ? 1 : 0},
        negative_interactions = agent_relationships.negative_interactions + ${update.outcome === "negative" ? 1 : 0},
        last_interaction = CURRENT_TIMESTAMP,
        notes = COALESCE(${update.notes ?? null}, agent_relationships.notes)
    `;
    await unifiedCacheDelete(`humanization:relationships:${agentId}`);
  }

  /**
   * Build interaction recommendation based on relationship history.
   */
  buildInteractionRecommendation(
    relationship: AgentRelationship | null,
    personInsights: unknown[],
    _interactionType: string,
  ): string {
    if (!relationship) {
      return "👤 First interaction with this person. Be formal and clear.";
    }

    let recommendation = "";
    const relRow = relationship as unknown as Record<string, unknown>;

    if (
      relationship.collaborationQuality === "excellent" ||
      relRow.collaboration_quality === "excellent"
    ) {
      recommendation = "🤝 Great collaboration history! This person is a strong collaborator. ";
    } else if (
      relationship.collaborationQuality === "poor" ||
      relRow.collaboration_quality === "poor"
    ) {
      recommendation =
        "⚠️ Past interactions were challenging. Proceed with extra care and clarity. ";
    }

    const commInsight = personInsights.find((i: unknown) => {
      const row = i as Record<string, unknown>;
      return (
        row.insightType === "communication_style" || row.insight_type === "communication_style"
      );
    });
    if (commInsight) {
      const row = commInsight as Record<string, unknown>;
      recommendation += `They prefer: ${String(row.insightText || row.insight_text)}`;
    }

    return recommendation;
  }
}
