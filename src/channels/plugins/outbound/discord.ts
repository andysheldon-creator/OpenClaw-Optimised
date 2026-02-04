import type { ChannelOutboundAdapter, ChannelOutboundContext } from "../types.js";
import { sendMessageDiscord, sendPollDiscord } from "../../../discord/send.js";
import { sendDiscordWebhook } from "../../../discord/send.webhook.js";
import { resolveAgentWebhook as resolveAgentWebhookShared } from "../../../discord/webhook-identity.js";

const log = {
  warn: (...args: unknown[]) => console.warn("[discord-outbound]", ...args),
};

/** Resolve webhook for this outbound context using the shared identity resolver. */
function resolveAgentWebhook(ctx: ChannelOutboundContext) {
  return resolveAgentWebhookShared(ctx.cfg, ctx.agentId ?? undefined, ctx.to);
}

/**
 * Resolve thread ID from context for webhook sends.
 * Discord webhooks use ?thread_id= query param for thread messages.
 */
function resolveThreadId(ctx: ChannelOutboundContext): string | undefined {
  const threadId = ctx.threadId;
  if (threadId == null || threadId === "") return undefined;
  return String(threadId);
}

export const discordOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2000,
  pollMaxOptions: 10,
  sendText: async (ctx) => {
    const { to, text, accountId, deps, replyToId } = ctx;

    // Check for agent webhook routing
    const webhook = resolveAgentWebhook(ctx);
    if (webhook) {
      try {
        const result = await sendDiscordWebhook(webhook.webhookUrl, text, {
          username: webhook.username,
          avatarUrl: webhook.avatarUrl,
          replyTo: replyToId ?? undefined,
          threadId: resolveThreadId(ctx),
        });
        return { channel: "discord", ...result };
      } catch (err) {
        // Graceful fallback: log error and fall through to bot send
        log.warn(
          "webhook send failed, falling back to bot:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Fall back to bot send
    const send = deps?.sendDiscord ?? sendMessageDiscord;
    const result = await send(to, text, {
      verbose: false,
      replyTo: replyToId ?? undefined,
      accountId: accountId ?? undefined,
    });
    return { channel: "discord", ...result };
  },
  sendMedia: async (ctx) => {
    const { to, text, mediaUrl, accountId, deps, replyToId } = ctx;

    // Check for agent webhook routing
    const webhook = resolveAgentWebhook(ctx);
    if (webhook) {
      try {
        const result = await sendDiscordWebhook(webhook.webhookUrl, text, {
          username: webhook.username,
          avatarUrl: webhook.avatarUrl,
          mediaUrl,
          replyTo: replyToId ?? undefined,
          threadId: resolveThreadId(ctx),
        });
        return { channel: "discord", ...result };
      } catch (err) {
        // Graceful fallback: log error and fall through to bot send
        log.warn(
          "webhook media send failed, falling back to bot:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Fall back to bot send
    const send = deps?.sendDiscord ?? sendMessageDiscord;
    const result = await send(to, text, {
      verbose: false,
      mediaUrl,
      replyTo: replyToId ?? undefined,
      accountId: accountId ?? undefined,
    });
    return { channel: "discord", ...result };
  },
  sendPoll: async ({ to, poll, accountId }) =>
    await sendPollDiscord(to, poll, {
      accountId: accountId ?? undefined,
    }),
};
