import type { SlackChannelData } from "../../../slack/types.js";
import type { ChannelOutboundAdapter } from "../types.js";
import { reactSlackMessage } from "../../../slack/actions.js";
import { blocksToPlainText } from "../../../slack/blocks/fallback.js";
import { validateAll } from "../../../slack/blocks/validation.js";
import { sendMessageSlack } from "../../../slack/send.js";

export const slackOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4000,
  sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendSlack ?? sendMessageSlack;
    // Use threadId fallback so routed tool notifications stay in the Slack thread.
    const threadTs = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text, {
      threadTs,
      accountId: accountId ?? undefined,
    });
    return { channel: "slack", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendSlack ?? sendMessageSlack;
    // Use threadId fallback so routed tool notifications stay in the Slack thread.
    const threadTs = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text, {
      mediaUrl,
      threadTs,
      accountId: accountId ?? undefined,
    });
    return { channel: "slack", ...result };
  },
  sendPayload: async ({ to, payload, accountId, deps, replyToId, threadId, cfg }) => {
    const send = deps?.sendSlack ?? sendMessageSlack;
    const threadTs = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const slackData = payload.channelData?.slack as SlackChannelData | undefined;
    const blocks = Array.isArray(slackData?.blocks) ? slackData?.blocks : undefined;
    const reactions = Array.isArray(slackData?.reactions) ? slackData?.reactions : [];
    const payloadText = payload.text ?? "";
    const fallbackFromBlocks = blocks ? blocksToPlainText(blocks).trim() : "";
    let fallbackText =
      payloadText.trim() ||
      (typeof slackData?.fallbackText === "string" ? slackData.fallbackText.trim() : "") ||
      fallbackFromBlocks ||
      payloadText;
    const mediaUrls = payload.mediaUrls?.length
      ? payload.mediaUrls
      : payload.mediaUrl
        ? [payload.mediaUrl]
        : [];

    if (blocks) {
      const validation = validateAll(blocks);
      if (!validation.valid) {
        throw new Error(`Invalid Slack blocks: ${validation.errors.join("; ")}`);
      }
    }
    if (!fallbackText.trim()) {
      fallbackText = "Message";
    }

    let result: Awaited<ReturnType<typeof send>> | undefined;
    if (mediaUrls.length > 0) {
      let first = true;
      for (const mediaUrl of mediaUrls) {
        const caption = first ? fallbackText : "";
        first = false;
        result = await send(to, caption, {
          mediaUrl,
          threadTs,
          accountId: accountId ?? undefined,
        });
      }
      if (blocks) {
        result = await send(to, fallbackText || "Message", {
          blocks,
          threadTs,
          accountId: accountId ?? undefined,
        });
      }
    } else if (blocks) {
      result = await send(to, fallbackText || "Message", {
        blocks,
        threadTs,
        accountId: accountId ?? undefined,
      });
    } else {
      result = await send(to, fallbackText, {
        threadTs,
        accountId: accountId ?? undefined,
      });
    }

    if (reactions.length > 0 && result?.channelId && result?.messageId) {
      await Promise.all(
        reactions.map(async (reaction) => {
          const emoji = typeof reaction === "string" ? reaction.trim() : "";
          if (!emoji) {
            return;
          }
          try {
            await reactSlackMessage(result.channelId, result.messageId, emoji, {
              accountId: accountId ?? undefined,
              config: cfg,
            });
          } catch {
            // Best-effort: ignore reaction failures.
          }
        }),
      );
    }

    return { channel: "slack", ...(result ?? { messageId: "unknown", channelId: "unknown" }) };
  },
};
