import { markdownToTelegramHtmlChunks } from "../../../telegram/format.js";
import { sendMessageTelegram } from "../../../telegram/send.js";
import type { ChannelOutboundAdapter } from "../types.js";

function parseReplyToMessageId(replyToId?: string | null) {
  if (!replyToId) return undefined;
  const parsed = Number.parseInt(replyToId, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseThreadId(threadId?: string | number | null): number | undefined {
  if (threadId == null) return undefined;
  if (typeof threadId === "number") return threadId;
  const parsed = Number.parseInt(threadId, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const telegramOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: markdownToTelegramHtmlChunks,
  textChunkLimit: 4000,
  resolveTarget: ({ to }) => {
    const trimmed = to?.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: new Error("Delivering to Telegram requires --to <chatId>"),
      };
    }
    return { ok: true, to: trimmed };
  },
  sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const result = await send(to, text, {
      verbose: false,
      textMode: "html",
      messageThreadId: parseThreadId(threadId),
      replyToMessageId,
      accountId: accountId ?? undefined,
    });
    return { channel: "telegram", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const result = await send(to, text, {
      verbose: false,
      mediaUrl,
      textMode: "html",
      messageThreadId: parseThreadId(threadId),
      replyToMessageId,
      accountId: accountId ?? undefined,
    });
    return { channel: "telegram", ...result };
  },
};
