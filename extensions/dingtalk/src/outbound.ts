/**
 * DingTalk outbound message sending
 */

import type { DingTalkConfig, DingTalkOutboundMessage, DingTalkWebhookResponse } from "./types.js";
import { generateSignature } from "./signature.js";

export interface SendMessageOptions {
  config: DingTalkConfig;
  message: DingTalkOutboundMessage;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
  response?: DingTalkWebhookResponse;
}

/**
 * Send message to DingTalk webhook
 */
export async function sendMessageDingTalk(options: SendMessageOptions): Promise<SendMessageResult> {
  const { config, message } = options;

  try {
    // Generate signature
    const { timestamp, sign } = generateSignature(config.secret);

    // Build webhook URL with signature
    const url = new URL(config.webhookUrl);
    url.searchParams.set("timestamp", timestamp.toString());
    url.searchParams.set("sign", sign);

    // Send POST request
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = (await response.json()) as DingTalkWebhookResponse;

    if (result.errcode !== 0) {
      return {
        success: false,
        error: `DingTalk API error ${result.errcode}: ${result.errmsg}`,
        response: result,
      };
    }

    return {
      success: true,
      response: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send text message
 */
export async function sendTextMessage(
  config: DingTalkConfig,
  text: string,
  options?: {
    atMobiles?: string[];
    atUserIds?: string[];
    atAll?: boolean;
  },
): Promise<SendMessageResult> {
  const message: DingTalkOutboundMessage = {
    msgtype: "text",
    text: { content: text },
  };

  if (options?.atMobiles || options?.atUserIds || options?.atAll) {
    message.at = {
      atMobiles: options.atMobiles,
      atUserIds: options.atUserIds,
      isAtAll: options.atAll,
    };
  }

  return sendMessageDingTalk({ config, message });
}

/**
 * Send markdown message
 */
export async function sendMarkdownMessage(
  config: DingTalkConfig,
  title: string,
  text: string,
  options?: {
    atMobiles?: string[];
    atUserIds?: string[];
    atAll?: boolean;
  },
): Promise<SendMessageResult> {
  const message: DingTalkOutboundMessage = {
    msgtype: "markdown",
    markdown: { title, text },
  };

  if (options?.atMobiles || options?.atUserIds || options?.atAll) {
    message.at = {
      atMobiles: options.atMobiles,
      atUserIds: options.atUserIds,
      isAtAll: options.atAll,
    };
  }

  return sendMessageDingTalk({ config, message });
}

/**
 * Chunk long messages to fit DingTalk's size limit (~20KB)
 */
export function chunkMessage(text: string, maxLength = 15000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at newline
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good newline, split at space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        // No good space, hard split
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}
