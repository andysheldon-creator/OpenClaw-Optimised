import { markdownToTelegramHtmlChunks } from "../../../telegram/format.js";
import { sendMediaGroupTelegram, sendMessageTelegram } from "../../../telegram/send.js";
import type { ChannelOutboundAdapter } from "../types.js";

function parseReplyToMessageId(replyToId?: string | null) {
  if (!replyToId) return undefined;
  const parsed = Number.parseInt(replyToId, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseThreadId(threadId?: string | number | null) {
  if (threadId == null) return undefined;
  if (typeof threadId === "number") {
    return Number.isFinite(threadId) ? Math.trunc(threadId) : undefined;
  }
  const trimmed = threadId.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const telegramOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: markdownToTelegramHtmlChunks,
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const messageThreadId = parseThreadId(threadId);
    const result = await send(to, text, {
      verbose: false,
      textMode: "html",
      messageThreadId,
      replyToMessageId,
      accountId: accountId ?? undefined,
    });
    return { channel: "telegram", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const messageThreadId = parseThreadId(threadId);
    const result = await send(to, text, {
      verbose: false,
      mediaUrl,
      textMode: "html",
      messageThreadId,
      replyToMessageId,
      accountId: accountId ?? undefined,
    });
    return { channel: "telegram", ...result };
  },
  sendPayload: async ({ to, payload, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const sendGroup = deps?.sendMediaGroupTelegram ?? sendMediaGroupTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const messageThreadId = parseThreadId(threadId);
    const telegramData = payload.channelData?.telegram as
      | { buttons?: Array<Array<{ text: string; callback_data: string }>>; quoteText?: string }
      | undefined;
    const quoteText =
      typeof telegramData?.quoteText === "string" ? telegramData.quoteText : undefined;
    const text = payload.text ?? "";
    const mediaUrls = payload.mediaUrls?.length
      ? payload.mediaUrls
      : payload.mediaUrl
        ? [payload.mediaUrl]
        : [];
    const baseOpts = {
      verbose: false,
      textMode: "html" as const,
      messageThreadId,
      replyToMessageId,
      quoteText,
      accountId: accountId ?? undefined,
    };

    if (mediaUrls.length === 0) {
      const result = await send(to, text, {
        ...baseOpts,
        buttons: telegramData?.buttons,
      });
      return { channel: "telegram", ...result };
    }

    // Use media group (album) for 2-10 images - sends as a single album
    if (mediaUrls.length >= 2 && mediaUrls.length <= 10) {
      const groupResult = await sendGroup(to, mediaUrls, text, {
        messageThreadId,
        replyToMessageId,
        accountId: accountId ?? undefined,
      });
      // If there are buttons, send them in a follow-up message (media groups don't support buttons)
      if (telegramData?.buttons?.length) {
        await send(to, "", {
          ...baseOpts,
          buttons: telegramData.buttons,
        });
      }
      return {
        channel: "telegram",
        messageId: groupResult.messageIds[0] ?? "unknown",
        messageIds: groupResult.messageIds,
        chatId: groupResult.chatId,
      };
    }

    // Single media or fallback for >10 items: send one at a time
    let finalResult: Awaited<ReturnType<typeof send>> | undefined;
    for (let i = 0; i < mediaUrls.length; i += 1) {
      const mediaUrl = mediaUrls[i];
      const isFirst = i === 0;
      finalResult = await send(to, isFirst ? text : "", {
        ...baseOpts,
        mediaUrl,
        ...(isFirst ? { buttons: telegramData?.buttons } : {}),
      });
    }
    return { channel: "telegram", ...(finalResult ?? { messageId: "unknown", chatId: to }) };
  },
  sendMediaGroup: async ({ to, mediaUrls, caption, accountId, deps, replyToId, threadId }) => {
    const sendGroup = deps?.sendMediaGroupTelegram ?? sendMediaGroupTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const messageThreadId = parseThreadId(threadId);
    const result = await sendGroup(to, mediaUrls, caption, {
      messageThreadId,
      replyToMessageId,
      accountId: accountId ?? undefined,
    });
    // Return first message ID as the main one
    return {
      channel: "telegram",
      messageId: result.messageIds[0] ?? "unknown",
      messageIds: result.messageIds,
      chatId: result.chatId,
    };
  },
};
