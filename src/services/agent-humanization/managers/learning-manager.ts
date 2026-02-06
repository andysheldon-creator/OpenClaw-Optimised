/**
 * GAP 3: Aprendizado Contínuo — Learning Manager
 *
 * Tracks agent learning over time: what worked, what failed,
 * lessons learned, and skill progression. Also tracks mistake patterns
 * to help agents avoid repeating errors.
 *
 * The learning loop:
 * 1. Agent performs a task
 * 2. Outcome is recorded (success/failure/partial)
 * 3. Patterns are extracted
 * 4. Future decisions are informed by past outcomes
 */

import type postgres from "postgres";
import type { MistakePattern } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const LEARNING_CACHE_TTL = 900; // 15 minutes

/**
 * Manages the continuous learning loop for agents.
 */
export class LearningManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Load learning progress — latest proficiency per skill.
   * Uses TimescaleDB DISTINCT ON for efficient latest-per-group.
   */
  async loadLearningProgress(agentId: string): Promise<unknown[]> {
    return unifiedCacheGetOrSet(
      `humanization:learning:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT DISTINCT ON (skill_name)
            skill_name,
            proficiency,
            improvement_rate,
            practice_hours
          FROM agent_learning_progress
          WHERE agent_id = ${agentId}
          ORDER BY skill_name, time DESC
        `;
        return rows as unknown[];
      },
      { ttlSeconds: LEARNING_CACHE_TTL },
    );
  }

  /**
   * Record a learning event — what worked, what failed, lessons.
   */
  async recordLearning(
    agentId: string,
    lesson: {
      lessonType: string;
      lesson: string;
      outcome: string;
      timestamp: Date;
    },
  ): Promise<void> {
    const today = lesson.timestamp.toISOString().split("T")[0];

    await this.sql`
      INSERT INTO agent_learning_logs (agent_id, log_date, what_worked, what_failed, lessons_learned, process_improvements)
      VALUES (
        ${agentId},
        ${today},
        ${lesson.outcome === "success" ? [lesson.lesson] : []},
        ${lesson.outcome === "failure" ? [lesson.lesson] : []},
        ${[lesson.lesson]},
        ${[]}
      )
      ON CONFLICT (agent_id, log_date)
      DO UPDATE SET
        what_worked = CASE
          WHEN ${lesson.outcome} = 'success'
          THEN array_append(agent_learning_logs.what_worked, ${lesson.lesson})
          ELSE agent_learning_logs.what_worked
        END,
        what_failed = CASE
          WHEN ${lesson.outcome} = 'failure'
          THEN array_append(agent_learning_logs.what_failed, ${lesson.lesson})
          ELSE agent_learning_logs.what_failed
        END,
        lessons_learned = array_append(agent_learning_logs.lessons_learned, ${lesson.lesson})
    `;
    await unifiedCacheDelete(`humanization:learning:${agentId}`);
  }

  /**
   * Track a mistake pattern — helps agents avoid repeating errors.
   * Increments occurrence count if pattern already exists.
   */
  async updateMistakePattern(
    agentId: string,
    mistakeType: string,
    description?: string,
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_mistake_patterns (agent_id, mistake_type, description, occurrences, last_occurrence)
      VALUES (${agentId}, ${mistakeType}, ${description ?? null}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (agent_id, mistake_type)
      DO UPDATE SET
        occurrences = agent_mistake_patterns.occurrences + 1,
        last_occurrence = CURRENT_TIMESTAMP,
        description = COALESCE(EXCLUDED.description, agent_mistake_patterns.description)
    `;
  }

  /**
   * Get recurring mistake patterns for an agent.
   * Useful for injecting "watch out for X" warnings into prompts.
   */
  async getMistakePatterns(agentId: string): Promise<MistakePattern[]> {
    return unifiedCacheGetOrSet(
      `humanization:mistakes:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_mistake_patterns
          WHERE agent_id = ${agentId}
          ORDER BY occurrences DESC
          LIMIT 20
        `;
        return rows as unknown as MistakePattern[];
      },
      { ttlSeconds: LEARNING_CACHE_TTL },
    );
  }

  /**
   * Mark a mistake pattern as fixed — the agent learned and won't repeat it.
   */
  async markMistakeFixed(agentId: string, mistakeType: string): Promise<void> {
    await this.sql`
      UPDATE agent_mistake_patterns
      SET fix_applied = true
      WHERE agent_id = ${agentId} AND mistake_type = ${mistakeType}
    `;
    await unifiedCacheDelete(`humanization:mistakes:${agentId}`);
  }
}
