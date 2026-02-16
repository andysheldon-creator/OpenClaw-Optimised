/**
 * Board of Directors — Telegram Forum Topic Management
 *
 * Creates and manages Telegram forum topics for each board agent.
 * Requires a Telegram supergroup with "Topics" enabled.
 */

import { resolveAllAgentDefs } from "./agents.js";
import type { BoardAgentDef, BoardAgentRole, TopicMapping } from "./types.js";

// ── Topic Configuration ──────────────────────────────────────────────────────

/** Icon colors available for Telegram forum topics. */
const TOPIC_ICON_COLORS: Record<BoardAgentRole, number> = {
  general: 0x6fb9f0, // Blue
  research: 0xffd67e, // Yellow/Gold
  content: 0xcb86db, // Purple
  finance: 0x8eee98, // Green
  strategy: 0xff93b2, // Pink
  critic: 0xfb6f5f, // Red/Orange
};

/**
 * Build the topic name for an agent.
 */
export function buildTopicName(agent: BoardAgentDef): string {
  return `${agent.emoji} ${agent.name}`;
}

/**
 * Build the list of topics that should exist for the board.
 * General agent gets the "General Discussion" topic.
 */
export function buildExpectedTopics(
  configAgents?: Array<{
    role: string;
    name?: string;
    emoji?: string;
  }>,
): Array<{ role: BoardAgentRole; name: string; iconColor: number }> {
  const agents = resolveAllAgentDefs(configAgents);
  return agents.map((agent) => ({
    role: agent.role,
    name: buildTopicName(agent),
    iconColor: TOPIC_ICON_COLORS[agent.role] ?? 0x6fb9f0,
  }));
}

// ── Topic Creation (via Telegram Bot API) ────────────────────────────────────

/**
 * Create forum topics for all board agents in a Telegram supergroup.
 *
 * This function calls the Telegram Bot API to create topics.
 * It requires:
 * 1. The group must be a supergroup with "Topics" enabled
 * 2. The bot must be an admin with "Manage Topics" permission
 *
 * Returns the topic mappings (topicId → agentRole).
 */
export async function createBoardTopics(params: {
  /** Telegram bot token. */
  botToken: string;
  /** Supergroup chat ID (must have topics enabled). */
  groupChatId: number | string;
  /** Board agent config overrides. */
  configAgents?: Array<{
    role: string;
    name?: string;
    emoji?: string;
  }>;
  /** Custom fetch for testing. */
  fetchFn?: typeof fetch;
}): Promise<TopicMapping[]> {
  const { botToken, groupChatId, configAgents, fetchFn = fetch } = params;
  const expectedTopics = buildExpectedTopics(configAgents);
  const mappings: TopicMapping[] = [];

  for (const topic of expectedTopics) {
    try {
      const response = await fetchFn(
        `https://api.telegram.org/bot${botToken}/createForumTopic`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: groupChatId,
            name: topic.name,
            icon_color: topic.iconColor,
          }),
        },
      );

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_thread_id: number; name: string };
        description?: string;
      };

      if (data.ok && data.result) {
        mappings.push({
          topicId: data.result.message_thread_id,
          agentRole: topic.role,
          topicName: data.result.name,
        });
      } else {
        // Topic creation failed — might already exist or permissions issue
        console.warn(
          `Failed to create topic for ${topic.role}: ${data.description ?? "unknown error"}`,
        );
      }
    } catch (err) {
      console.warn(`Error creating topic for ${topic.role}: ${String(err)}`);
    }
  }

  return mappings;
}

// ── Topic Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a Telegram message_thread_id to an agent role.
 */
export function resolveAgentFromTopicId(
  threadId: number,
  topicMappings: TopicMapping[],
): BoardAgentRole | undefined {
  const mapping = topicMappings.find((m) => m.topicId === threadId);
  return mapping?.agentRole;
}

/**
 * Get the topic ID for a specific agent role.
 */
export function getTopicIdForAgent(
  role: BoardAgentRole,
  topicMappings: TopicMapping[],
): number | undefined {
  const mapping = topicMappings.find((m) => m.agentRole === role);
  return mapping?.topicId;
}

/**
 * Convert topic mappings to a Map for fast lookup.
 */
export function topicMappingsToMap(
  mappings: TopicMapping[],
): Map<number, BoardAgentRole> {
  const map = new Map<number, BoardAgentRole>();
  for (const m of mappings) {
    map.set(m.topicId, m.agentRole);
  }
  return map;
}
