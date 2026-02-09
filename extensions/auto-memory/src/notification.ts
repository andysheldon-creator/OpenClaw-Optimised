import type { OpenClawConfig } from "../../../src/config/config.js";
import type { PluginRuntime } from "../../../src/plugins/runtime/types.js";
import { routeReply } from "../../../src/auto-reply/reply/route-reply.js";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";

/**
 * Extract channel information from sessionKey
 * Format examples:
 * - agent:main:slack:channel:c123
 * - agent:main:telegram:group:123
 * - agent:main:discord:dm:u123
 * - agent:main:slack:channel:c1:thread:123
 * - agent:main:telegram:group:123:topic:99
 */
function extractChannelInfo(sessionKey: string): {
  provider?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
} {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return {};
  }

  const rest = parsed.rest || "";
  const parts = rest.split(":").filter(Boolean);

  if (parts.length < 2) {
    return {};
  }

  // First part is the provider (slack, telegram, discord, etc.)
  const provider = parts[0];
  // Second part is the type (channel, group, dm, etc.)
  const type = parts[1];
  // Third part is the ID
  const to = parts[2];

  if (!provider || !to) {
    return {};
  }

  // Extract optional thread/topic/account info
  let accountId: string | undefined;
  let threadId: string | number | undefined;

  for (let i = 3; i < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (key === "thread" || key === "topic") {
      threadId = value ? (isNaN(Number(value)) ? value : Number(value)) : undefined;
    } else if (key === "account") {
      accountId = value;
    }
  }

  return { provider, to, accountId, threadId };
}

export async function sendNotification(
  message: string,
  sessionKey: string | undefined,
  config: OpenClawConfig,
  runtime: PluginRuntime,
): Promise<{ success: boolean; error?: string }> {
  if (!sessionKey) {
    return { success: false, error: "No sessionKey provided" };
  }

  try {
    const channelInfo = extractChannelInfo(sessionKey);
    if (!channelInfo.provider || !channelInfo.to) {
      return {
        success: false,
        error: "Could not extract provider or destination from sessionKey",
      };
    }

    // Route the reply
    const result = await routeReply({
      payload: { text: message },
      channel: channelInfo.provider as any,
      to: channelInfo.to,
      accountId: channelInfo.accountId,
      threadId: channelInfo.threadId,
      cfg: config,
      sessionKey,
      mirror: false, // Don't mirror notification messages
    });

    if (!result.ok) {
      return { success: false, error: result.error || "Failed to send notification" };
    }

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
