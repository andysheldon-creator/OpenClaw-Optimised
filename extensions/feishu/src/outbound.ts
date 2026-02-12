import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import { sendMediaFeishu } from "./media.js";
import { getFeishuRuntime } from "./runtime.js";
import { sendMessageFeishu, sendMarkdownCardFeishu, processMarkdownImages } from "./send.js";

/**
 * Detect if text contains markdown elements that benefit from card rendering.
 */
function shouldUseCard(text: string): boolean {
  // Code blocks (fenced)
  if (/```[\s\S]*?```/.test(text)) return true;
  // Tables (at least header + separator row with |)
  if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) return true;
  // Blockquotes
  if (/^>\s+/m.test(text)) return true;
  return false;
}

export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getFeishuRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ cfg, to, text, accountId }) => {
    const acct = accountId ?? undefined;

    if (shouldUseCard(text)) {
      try {
        // Pre-process images for card rendering
        const processed = await processMarkdownImages({ text, cfg, accountId: acct });
        const result = await sendMarkdownCardFeishu({ cfg, to, text: processed, accountId: acct });
        return { channel: "feishu", ...result };
      } catch {
        // Card failed, fall back to post message
      }
    }

    const result = await sendMessageFeishu({ cfg, to, text, accountId: acct });
    return { channel: "feishu", ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    // Send text first if provided
    if (text?.trim()) {
      const acct = accountId ?? undefined;
      if (shouldUseCard(text)) {
        try {
          const processed = await processMarkdownImages({ text, cfg, accountId: acct });
          await sendMarkdownCardFeishu({ cfg, to, text: processed, accountId: acct });
        } catch {
          await sendMessageFeishu({ cfg, to, text, accountId: acct });
        }
      } else {
        await sendMessageFeishu({ cfg, to, text, accountId: acct });
      }
    }

    // Upload and send media if URL provided
    if (mediaUrl) {
      try {
        const result = await sendMediaFeishu({
          cfg,
          to,
          mediaUrl,
          accountId: accountId ?? undefined,
        });
        return { channel: "feishu", ...result };
      } catch (err) {
        // Log the error for debugging
        console.error(`[feishu] sendMediaFeishu failed:`, err);
        // Fallback to URL link if upload fails
        const fallbackText = `\u{1F4CE} ${mediaUrl}`;
        const result = await sendMessageFeishu({
          cfg,
          to,
          text: fallbackText,
          accountId: accountId ?? undefined,
        });
        return { channel: "feishu", ...result };
      }
    }

    // No media URL, just return text result
    const result = await sendMessageFeishu({
      cfg,
      to,
      text: text ?? "",
      accountId: accountId ?? undefined,
    });
    return { channel: "feishu", ...result };
  },
};
