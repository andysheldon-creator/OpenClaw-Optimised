/**
 * Single source of truth for resolving Discord webhook identity for an agent.
 *
 * All send paths (reply delivery, outbound adapter, message tool) should use
 * this function instead of duplicating the lookup logic.
 */

import type { OpenClawConfig } from "../config/config.js";

export type AgentWebhookIdentity = {
  webhookUrl: string;
  username: string;
  avatarUrl?: string;
  /** Set when the webhook was resolved via parent channel (for thread sends). */
  threadId?: string;
};

/**
 * Extract a Discord channel ID from a target string.
 * Handles "channel:123456" prefix or raw snowflake IDs.
 */
function extractChannelId(target: string): string | null {
  if (target.startsWith("channel:")) {
    return target.slice("channel:".length);
  }
  if (/^\d{17,20}$/.test(target)) {
    return target;
  }
  return null;
}

/**
 * Resolve the webhook URL and display identity for an agent in a specific channel.
 *
 * Lookup order for webhook URL:
 * 1. Per-channel webhook: agent.discord.responseWebhooks[channelId]
 * 2. Default webhook: agent.discord.responseWebhook
 *
 * Username resolution (single source of truth):
 * - If agent.identity.name + agent.identity.theme → "Name · Theme"
 * - If agent.identity.name only → "Name"
 * - Fallback: agent.name ?? agent.id
 *
 * Avatar resolution:
 * - Prefer agent.identity.avatar
 * - Fallback: agent.discord.responseWebhookAvatar
 *
 * @returns webhook identity or null if no webhook is configured
 */
export function resolveAgentWebhook(
  cfg: OpenClawConfig,
  agentId: string | undefined,
  target: string,
): AgentWebhookIdentity | null {
  if (!agentId) return null;

  const agent = cfg.agents?.list?.find((a) => a.id === agentId);
  if (!agent?.discord) return null;

  const channelId = extractChannelId(target);
  const perChannelWebhook = channelId ? agent.discord.responseWebhooks?.[channelId] : null;

  const webhookUrl = perChannelWebhook ?? agent.discord.responseWebhook;
  if (!webhookUrl) return null;

  // Build username — prefer agent.name (full display name like "Seven · Senior Engineer"),
  // fall back to building from identity parts, then agent.id
  const username =
    agent.name ??
    (agent.identity?.theme
      ? `${agent.identity.name ?? agent.id} · ${agent.identity.theme}`
      : (agent.identity?.name ?? agent.id));

  // Avatar: prefer identity.avatar, fall back to discord-specific avatar
  const avatarUrl = agent.identity?.avatar ?? agent.discord.responseWebhookAvatar;

  return { webhookUrl, username, avatarUrl };
}

/**
 * Async version of resolveAgentWebhook that can resolve thread parents.
 *
 * If the target is a thread (no webhook found for the channel ID), fetches
 * the channel info to find the parent channel and retries with the parent's
 * webhook. Returns threadId so callers can pass it to ?thread_id= param.
 */
export async function resolveAgentWebhookAsync(
  cfg: OpenClawConfig,
  agentId: string | undefined,
  target: string,
): Promise<AgentWebhookIdentity | null> {
  // Try direct match first (fast path)
  const direct = resolveAgentWebhook(cfg, agentId, target);
  if (direct) return direct;

  // If no match, the target might be a thread ID — try to resolve parent
  const channelId = extractChannelId(target);
  if (!channelId) return null;

  try {
    const { fetchChannelInfoDiscord } = await import("./send.guild.js");
    const channelInfo = await fetchChannelInfoDiscord(channelId);
    const parentId = (channelInfo as { parent_id?: string }).parent_id;
    if (!parentId) return null;

    const parentResult = resolveAgentWebhook(cfg, agentId, parentId);
    if (!parentResult) return null;

    return { ...parentResult, threadId: channelId };
  } catch {
    // Channel fetch failed — return null, caller will fall back to bot API
    return null;
  }
}
