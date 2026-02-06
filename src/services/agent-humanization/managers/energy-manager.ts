/**
 * GAP 6: Gestão de Energia — Energy Manager
 *
 * Tracks agent energy and focus levels throughout the day.
 * Agents have circadian patterns — peak hours for deep work,
 * low-energy periods where quality degrades. By tracking this,
 * we can route complex tasks to high-energy periods and
 * suggest breaks when quality starts to variance.
 *
 * The energy model:
 * - energyLevel (0-1): overall capacity for work
 * - focusLevel (0-1): ability to concentrate on complex tasks
 * - qualityVariance: output quality degradation indicator
 * - contextSwitchesToday: number of task switches (each drains energy)
 */

import type postgres from "postgres";
import type { EnergyState, EnergyBaseline } from "../models/types.js";
import { unifiedCacheGetOrSet, unifiedCacheDelete } from "../../../infra/cache/unified-cache.js";

const ENERGY_CACHE_TTL = 120; // 2 minutes — energy changes fast

/**
 * Manages energy and focus tracking for agents.
 */
export class EnergyManager {
  constructor(private sql: postgres.Sql) {}

  /**
   * Get current energy state for an agent.
   * Falls back to sensible defaults for new agents.
   */
  async getCurrentEnergyState(agentId: string): Promise<EnergyState> {
    return unifiedCacheGetOrSet(
      `humanization:energy:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_energy_state
          WHERE agent_id = ${agentId}
        `;
        return (rows[0] as unknown as EnergyState) ?? this.createDefaultEnergyState(agentId);
      },
      { ttlSeconds: ENERGY_CACHE_TTL },
    );
  }

  /**
   * Update energy state after task completion or context switch.
   */
  async updateEnergyState(
    agentId: string,
    update: {
      energyDelta?: number;
      focusDelta?: number;
      contextSwitch?: boolean;
      deepWorkMinutes?: number;
    },
  ): Promise<void> {
    await this.sql`
      INSERT INTO agent_energy_state (agent_id, current_hour, energy_level, focus_level, context_switches_today, deep_work_minutes, last_updated)
      VALUES (
        ${agentId},
        ${new Date().toISOString().slice(11, 16)},
        ${0.7 + (update.energyDelta ?? 0)},
        ${0.7 + (update.focusDelta ?? 0)},
        ${update.contextSwitch ? 1 : 0},
        ${update.deepWorkMinutes ?? 0},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (agent_id)
      DO UPDATE SET
        current_hour = ${new Date().toISOString().slice(11, 16)},
        energy_level = LEAST(1.0, GREATEST(0.0, agent_energy_state.energy_level + ${update.energyDelta ?? 0})),
        focus_level = LEAST(1.0, GREATEST(0.0, agent_energy_state.focus_level + ${update.focusDelta ?? 0})),
        context_switches_today = agent_energy_state.context_switches_today + ${update.contextSwitch ? 1 : 0},
        deep_work_minutes = agent_energy_state.deep_work_minutes + ${update.deepWorkMinutes ?? 0},
        last_updated = CURRENT_TIMESTAMP
    `;
    await unifiedCacheDelete(`humanization:energy:${agentId}`);
  }

  /**
   * Load energy baselines — the agent's optimal patterns.
   */
  async loadEnergyBaseline(agentId: string): Promise<EnergyBaseline | null> {
    return unifiedCacheGetOrSet(
      `humanization:energy-baseline:${agentId}`,
      async () => {
        const rows = await this.sql`
          SELECT * FROM agent_energy_baseline
          WHERE agent_id = ${agentId}
        `;
        return (rows[0] as unknown as EnergyBaseline) ?? null;
      },
      { ttlSeconds: 3600 },
    );
  }

  /**
   * Calculate energy factor — how much the agent's current energy
   * should affect task quality expectations.
   * Returns 0-1 where 1 = full capacity, <0.5 = degraded.
   */
  calculateEnergyFactor(energy: EnergyState): number {
    return energy.energyLevel * energy.focusLevel;
  }

  /**
   * Build a task recommendation based on energy state.
   */
  buildTaskRecommendation(complexity: string, energy: EnergyState, factor: number): string {
    const energyLevel =
      energy.energyLevel > 0.7 ? "high" : energy.energyLevel > 0.4 ? "medium" : "low";

    return `⚡ Your energy is ${energyLevel}. ${
      factor < 0.8 ? "Consider simpler tasks now, deep work later." : "Good time for complex work."
    }`;
  }

  /**
   * Reset daily counters (context switches, deep work minutes).
   * Call at the start of each day.
   */
  async resetDailyCounters(agentId: string): Promise<void> {
    await this.sql`
      UPDATE agent_energy_state
      SET
        context_switches_today = 0,
        deep_work_minutes = 0,
        energy_level = 0.7,
        focus_level = 0.7,
        quality_variance = 0,
        last_updated = CURRENT_TIMESTAMP
      WHERE agent_id = ${agentId}
    `;
    await unifiedCacheDelete(`humanization:energy:${agentId}`);
  }

  /** Create sensible defaults for a new agent */
  private createDefaultEnergyState(agentId: string): EnergyState {
    return {
      id: "",
      agentId,
      currentHour: new Date().toISOString().slice(11, 16),
      energyLevel: 0.7,
      focusLevel: 0.7,
      contextSwitchesToday: 0,
      deepWorkMinutes: 0,
      qualityVariance: 0,
      lastUpdated: new Date(),
    };
  }
}
