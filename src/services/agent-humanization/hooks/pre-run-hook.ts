/**
 * Pre-Run Hook — Called before each LLM turn
 *
 * Loads agent profile from humanization service, checks current energy level,
 * and injects relevant context into the system prompt (past mistakes to avoid,
 * relationship context, intuition matches).
 *
 * Returns an enrichment object that can be appended to the system prompt.
 * If humanization is disabled/unavailable, returns empty enrichment (no-op).
 */

import type { AgentMemory, AgentRelationship, IntuitionRule, MemoryType } from "../models/types.js";
import {
  isHumanizationEnabled,
  getHumanizationService,
  type HumanizationServiceLike,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreRunEnrichment {
  /** Extra text to append to the system prompt (empty string = no-op). */
  systemPromptSuffix: string;
  /** Current energy level (0-1). Undefined when humanization is off. */
  energyLevel?: number;
  /** True when the hook suggests the session should be compacted. */
  suggestCompaction: boolean;
  /** Matched intuition rules for the current context. */
  matchedRules: IntuitionRule[];
  /** Relationship context for a target agent (if applicable). */
  relationshipContext?: AgentRelationship;
}

const EMPTY_ENRICHMENT: PreRunEnrichment = {
  systemPromptSuffix: "",
  suggestCompaction: false,
  matchedRules: [],
};

export interface PreRunHookParams {
  agentId: string;
  /** The session key, used to detect context switches. */
  sessionKey?: string;
  /** Optional target agent ID (for inter-agent interactions). */
  targetAgentId?: string;
  /** Contextual hints about the current task (used for intuition matching). */
  taskContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State — lightweight in-memory tracking per agent for context switch detection
// ---------------------------------------------------------------------------

const lastSessionByAgent = new Map<string, string>();

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * Execute the pre-run hook. Designed to complete within 50ms for the
 * synchronous path — all heavy work (profile loading) is cached in the
 * humanization service's Redis layer.
 */
export async function preRunHook(params: PreRunHookParams): Promise<PreRunEnrichment> {
  if (!isHumanizationEnabled()) {
    return EMPTY_ENRICHMENT;
  }

  const service = getHumanizationService();
  if (!service) {
    return EMPTY_ENRICHMENT;
  }

  try {
    return await buildEnrichment(service, params);
  } catch (err) {
    // Never block the pipeline — log and return no-op.
    console.error(
      `[humanization:pre-run] Error building enrichment for ${params.agentId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return EMPTY_ENRICHMENT;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function buildEnrichment(
  service: HumanizationServiceLike,
  params: PreRunHookParams,
): Promise<PreRunEnrichment> {
  const { agentId, sessionKey, targetAgentId, taskContext } = params;

  const profile = await service.getAgentProfile(agentId);

  const sections: string[] = [];
  const matchedRules: IntuitionRule[] = [];
  let suggestCompaction = false;
  let relationshipContext: AgentRelationship | undefined;

  // --- Energy check ---
  const energy = profile.currentEnergy;
  if (energy) {
    if (energy.energyLevel < 0.3) {
      sections.push(
        `⚡ ENERGY WARNING: Your energy is critically low (${(energy.energyLevel * 100).toFixed(0)}%). ` +
          `Consider requesting session compaction or deferring complex tasks.`,
      );
      suggestCompaction = true;
    } else if (energy.energyLevel < 0.5) {
      sections.push(
        `⚡ Energy: moderate (${(energy.energyLevel * 100).toFixed(0)}%). Prioritise simpler tasks.`,
      );
    }

    // Detect context switch
    if (sessionKey) {
      const prevSession = lastSessionByAgent.get(agentId);
      if (prevSession && prevSession !== sessionKey) {
        sections.push(
          `🔄 Context switch detected (previous session: ${prevSession}). ` +
            `Extra cognitive cost applied. Stay focused on this context.`,
        );
      }
      lastSessionByAgent.set(agentId, sessionKey);
    }
  }

  // --- Past mistakes to avoid ---
  const recentMistakes = extractMistakeMemories(profile.memory);
  if (recentMistakes.length > 0) {
    sections.push(
      `⚠️ AVOID REPEATING:\n` +
        recentMistakes
          .slice(0, 5)
          .map((m) => `  - ${m.title}: ${m.content}`)
          .join("\n"),
    );
  }

  // --- Relationship context ---
  if (targetAgentId) {
    const rel = profile.relationships.find(
      (r: AgentRelationship) =>
        r.otherAgentId === targetAgentId ||
        (r as unknown as Record<string, unknown>).other_agent_id === targetAgentId,
    );
    if (rel) {
      relationshipContext = rel;
      const trustLabel =
        rel.trustScore > 0.8
          ? "high trust"
          : rel.trustScore > 0.5
            ? "moderate trust"
            : rel.trustScore > 0.3
              ? "low trust"
              : "very low trust";
      sections.push(
        `🤝 Relationship with ${targetAgentId}: ${trustLabel} (${(rel.trustScore * 100).toFixed(0)}%), ` +
          `quality: ${rel.collaborationQuality}, ${rel.interactionCount} interactions.`,
      );
    }
  }

  // --- Intuition matches ---
  if (taskContext && profile.intuitionRules.length > 0) {
    const matched = matchIntuitionRules(profile.intuitionRules, taskContext);
    matchedRules.push(...matched);

    if (matched.length > 0) {
      sections.push(
        `💡 INTUITION MATCHES:\n` +
          matched
            .slice(0, 3)
            .map(
              (r) =>
                `  - ${r.patternName} (${(r.accuracyRate * 100).toFixed(0)}% accurate): ${r.recommendedAction}`,
            )
            .join("\n"),
      );
    }
  }

  // --- Reputation context ---
  if (profile.reputation) {
    const rep = profile.reputation;
    if (rep.trend === "declining") {
      sections.push(`📉 REPUTATION: Declining trend. Focus on quality and reliability this turn.`);
    }
  }

  const systemPromptSuffix =
    sections.length > 0
      ? `\n\n<!-- Agent Humanization Context -->\n${sections.join("\n\n")}\n<!-- End Humanization Context -->`
      : "";

  return {
    systemPromptSuffix,
    energyLevel: energy?.energyLevel,
    suggestCompaction,
    matchedRules,
    relationshipContext,
  };
}

function extractMistakeMemories(memories: AgentMemory[]): AgentMemory[] {
  return memories.filter(
    (m) =>
      m.memoryType === ("mistake" as MemoryType) ||
      (m as unknown as Record<string, unknown>).memory_type === "mistake",
  );
}

function matchIntuitionRules(
  rules: IntuitionRule[],
  context: Record<string, unknown>,
): IntuitionRule[] {
  return rules
    .filter((rule) => {
      if (!rule.triggerConditions || typeof rule.triggerConditions !== "object") {
        return false;
      }
      const conditions = rule.triggerConditions;
      const keys = Object.keys(conditions);
      if (keys.length === 0) {
        return false;
      }

      let matches = 0;
      for (const key of keys) {
        if (context[key] === conditions[key]) {
          matches++;
        }
      }
      // Require at least 50% match
      return matches / keys.length >= 0.5;
    })
    .filter((rule) => rule.accuracyRate >= 0.5) // Only suggest rules that have been > 50% accurate
    .toSorted((a, b) => b.accuracyRate - a.accuracyRate)
    .slice(0, 5);
}
