/**
 * GAP 1: Contexto Persistente — Memory Manager
 *
 * Responsible for storing and retrieving persistent agent memories:
 * decisions made, mistakes learned from, recognized patterns,
 * person insights, and project-specific patterns.
 *
 * Memories decay over time (retention_score) and are ranked by importance,
 * allowing agents to recall the most relevant context for any situation.
 */

import type postgres from "postgres";
import type { AgentMemory, PersonInsight } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const MEMORY_CACHE_TTL = 600; // 10 minutes

/**
 * Manages persistent agent memory — the foundation of contextual awareness.
 */
export class MemoryManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load top memories for an agent, ranked by importance and recency.
   * Uses cache-aside pattern with unified cache.
   */
  async loadAgentMemory(agentId: string, limit = 50): Promise<AgentMemory[]> {
    return unifiedCacheGetOrSet(
      `humanization:memory:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_memory
          WHERE agent_id = ${agentId}
          ORDER BY importance DESC, created_at DESC
          LIMIT ${limit}
        `;
        return rows as unknown as AgentMemory[];
      },
      { ttlSeconds: MEMORY_CACHE_TTL },
    );
  }

  /**
   * Store a new memory for an agent.
   * Uses UPSERT to avoid duplicates on (agent_id, memory_type, title).
   */
  async storeMemory(memory: Omit<AgentMemory, "id" | "createdAt" | "updatedAt">): Promise<void> {
    await this.sql`
      INSERT INTO agent_memory (agent_id, memory_type, title, content, context, importance, retention_score)
      VALUES (
        ${memory.agentId},
        ${memory.memoryType},
        ${memory.title},
        ${memory.content},
        ${JSON.stringify(memory.context ?? {})},
        ${memory.importance},
        ${memory.retentionScore}
      )
      ON CONFLICT (agent_id, memory_type, title)
      DO UPDATE SET
        content = EXCLUDED.content,
        context = EXCLUDED.context,
        importance = EXCLUDED.importance,
        retention_score = EXCLUDED.retention_score,
        updated_at = CURRENT_TIMESTAMP
    `;
    await unifiedCacheDelete(`humanization:memory:${memory.agentId}`);
  }

  /**
   * Load person-specific insights (communication style, preferences, etc.).
   */
  async getPersonInsights(agentId: string, personId: string): Promise<PersonInsight[]> {
    return unifiedCacheGetOrSet(
      `humanization:person-insights:${agentId}:${personId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_person_insights
          WHERE agent_id = ${agentId} AND person_id = ${personId}
          ORDER BY confidence DESC
        `;
        return rows as unknown as PersonInsight[];
      },
      { ttlSeconds: MEMORY_CACHE_TTL },
    );
  }

  /**
   * Store or update a person insight.
   */
  async storePersonInsight(insight: Omit<PersonInsight, "id" | "lastUpdated">): Promise<void> {
    await this.sql`
      INSERT INTO agent_person_insights (agent_id, person_id, insight_type, insight_text, confidence, evidence_count)
      VALUES (
        ${insight.agentId},
        ${insight.personId},
        ${insight.insightType},
        ${insight.insightText},
        ${insight.confidence},
        ${insight.evidenceCount}
      )
      ON CONFLICT (agent_id, person_id, insight_type)
      DO UPDATE SET
        insight_text = EXCLUDED.insight_text,
        confidence = EXCLUDED.confidence,
        evidence_count = agent_person_insights.evidence_count + 1,
        last_updated = CURRENT_TIMESTAMP
    `;
    await unifiedCacheDelete(`humanization:person-insights:${insight.agentId}:${insight.personId}`);
  }

  /**
   * Decay old memories — reduce retention_score over time.
   * Call periodically (e.g., daily) to let unimportant memories fade.
   */
  async decayMemories(agentId: string, decayFactor = 0.95): Promise<number> {
    const result = await this.sql`
      UPDATE agent_memory
      SET retention_score = retention_score * ${decayFactor},
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = ${agentId}
        AND retention_score > 0.1
      RETURNING id
    `;
    await unifiedCacheDelete(`humanization:memory:${agentId}`);
    return result.length;
  }
}
