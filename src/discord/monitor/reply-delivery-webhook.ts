/**
 * Discord webhook reply delivery.
 *
 * When an agent has a responseWebhook configured, replies are sent through the
 * webhook instead of the bot API. This gives each agent its own visual identity
 * (name + avatar) in Discord.
 */

import type { ChunkMode } from "../../auto-reply/chunk.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import type { MarkdownTableMode } from "../../config/types.base.js";
import { convertMarkdownTables } from "../../markdown/tables.js";
import { chunkDiscordTextWithMode } from "../chunk.js";
import { sendDiscordWebhook } from "../send.webhook.js";

// Re-export the shared resolver so existing imports still work
export { resolveAgentWebhook as resolveAgentWebhookForChannel } from "../webhook-identity.js";

/**
 * Deliver a reply through a Discord webhook.
 *
 * Similar to deliverDiscordReply but sends through a webhook URL instead of
 * the bot API, allowing agents to have distinct visual identities.
 */
export async function deliverDiscordWebhookReply(params: {
  replies: ReplyPayload[];
  webhookUrl: string;
  username: string;
  avatarUrl?: string;
  textLimit: number;
  maxLinesPerMessage?: number;
  replyToId?: string;
  tableMode?: MarkdownTableMode;
  chunkMode?: ChunkMode;
}) {
  const chunkLimit = Math.min(params.textLimit, 2000);
  for (const payload of params.replies) {
    const mediaList = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
    const rawText = payload.text ?? "";
    const tableMode = params.tableMode ?? "code";
    const text = convertMarkdownTables(rawText, tableMode);
    if (!text && mediaList.length === 0) {
      continue;
    }
    const replyTo = params.replyToId?.trim() || undefined;

    if (mediaList.length === 0) {
      let isFirstChunk = true;
      const mode = params.chunkMode ?? "length";
      const chunks = chunkDiscordTextWithMode(text, {
        maxChars: chunkLimit,
        maxLines: params.maxLinesPerMessage,
        chunkMode: mode,
      });
      if (!chunks.length && text) {
        chunks.push(text);
      }
      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) {
          continue;
        }
        await sendDiscordWebhook(params.webhookUrl, trimmed, {
          username: params.username,
          avatarUrl: params.avatarUrl,
          replyTo: isFirstChunk ? replyTo : undefined,
        });
        isFirstChunk = false;
      }
      continue;
    }

    const firstMedia = mediaList[0];
    if (!firstMedia) {
      continue;
    }
    await sendDiscordWebhook(params.webhookUrl, text, {
      username: params.username,
      avatarUrl: params.avatarUrl,
      mediaUrl: firstMedia,
      replyTo,
    });
    for (const extra of mediaList.slice(1)) {
      await sendDiscordWebhook(params.webhookUrl, "", {
        username: params.username,
        avatarUrl: params.avatarUrl,
        mediaUrl: extra,
      });
    }
  }
}
