/**
 * DingTalk inbound message handling
 */

import type { DingTalkInboundMessage } from "./types.js";

export interface ParsedMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  conversationId: string;
  conversationType: "direct" | "group";
  timestamp: number;
  isAtBot: boolean;
  sessionWebhook?: string;
}

/**
 * Parse incoming DingTalk webhook message
 */
export function parseInboundMessage(payload: DingTalkInboundMessage): ParsedMessage | null {
  try {
    // Only handle text messages for now
    if (payload.msgtype !== "text" || !payload.text?.content) {
      return null;
    }

    return {
      messageId: payload.msgId,
      senderId: payload.senderId,
      senderName: payload.senderNick,
      text: payload.text.content,
      conversationId: payload.conversationId,
      conversationType: payload.conversationType === "1" ? "direct" : "group",
      timestamp: payload.createAt,
      isAtBot: payload.isInAtList ?? false,
      sessionWebhook: payload.sessionWebhook,
    };
  } catch {
    return null;
  }
}

/**
 * Extract @mentions from message text
 */
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  const atPattern = /@(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = atPattern.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Remove @mentions from message text
 */
export function stripMentions(text: string): string {
  return text.replace(/@\S+/g, "").trim();
}
