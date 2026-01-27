/**
 * Feishu message sending utilities
 */

import type { ClawdbotConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { formatErrorMessage } from "../infra/errors.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveFeishuAccount } from "./accounts.js";
import {
  createFeishuClient,
  type FeishuSendMessageResult,
  type FeishuPostContent,
} from "./client.js";

export type SendFeishuMessageParams = {
  to: string;
  text: string;
  accountId?: string | null;
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  /** Receive ID type: chat_id (default), open_id, user_id, union_id, email */
  receiveIdType?: "chat_id" | "open_id" | "user_id" | "union_id" | "email";
  /** Message type: text (default) or post */
  msgType?: "text" | "post";
  /** For post messages, the post content */
  postContent?: FeishuPostContent;
  /** Reply to a specific message */
  replyToMessageId?: string;
};

export type SendFeishuMessageResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Send a message via Feishu
 */
export async function sendMessageFeishu(
  params: SendFeishuMessageParams,
): Promise<SendFeishuMessageResult> {
  const cfg = params.config ?? loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: params.accountId,
  });

  if (account.credentials.source === "none") {
    return {
      success: false,
      error: `Feishu credentials missing for account "${account.accountId}" (set channels.feishu.appId/appSecret or FEISHU_APP_ID/FEISHU_APP_SECRET env vars).`,
    };
  }

  if (!account.enabled) {
    return {
      success: false,
      error: `Feishu account "${account.accountId}" is disabled.`,
    };
  }

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  try {
    let result: FeishuSendMessageResult;

    if (params.replyToMessageId) {
      // Reply to a specific message
      const content =
        params.msgType === "post" && params.postContent
          ? JSON.stringify({ post: params.postContent })
          : JSON.stringify({ text: params.text });

      result = await client.replyMessage(
        params.replyToMessageId,
        params.msgType ?? "text",
        content,
      );
    } else if (params.msgType === "post" && params.postContent) {
      // Send a post (rich text) message
      result = await client.sendPostMessage(
        params.to,
        params.postContent,
        params.receiveIdType ?? "chat_id",
      );
    } else {
      // Send a text message
      result = await client.sendTextMessage(
        params.to,
        params.text,
        params.receiveIdType ?? "chat_id",
      );
    }

    return {
      success: true,
      messageId: result.message_id,
    };
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    params.runtime?.error?.(`feishu: send failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * React to a message (Feishu supports reactions via emoji)
 * Note: This requires additional API permissions
 */
export async function reactMessageFeishu(params: {
  messageId: string;
  emoji: string;
  accountId?: string | null;
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
}): Promise<{ success: boolean; error?: string }> {
  const cfg = params.config ?? loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: params.accountId,
  });

  if (account.credentials.source === "none") {
    return {
      success: false,
      error: `Feishu credentials missing for account "${account.accountId}".`,
    };
  }

  const client = createFeishuClient(account.credentials);

  try {
    // Feishu reaction API endpoint
    await client.request("POST", `/im/v1/messages/${params.messageId}/reactions`, {
      body: {
        reaction_type: {
          emoji_type: params.emoji,
        },
      },
    });

    return { success: true };
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    params.runtime?.error?.(`feishu: react failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete a message
 */
export async function deleteMessageFeishu(params: {
  messageId: string;
  accountId?: string | null;
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
}): Promise<{ success: boolean; error?: string }> {
  const cfg = params.config ?? loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: params.accountId,
  });

  if (account.credentials.source === "none") {
    return {
      success: false,
      error: `Feishu credentials missing for account "${account.accountId}".`,
    };
  }

  const client = createFeishuClient(account.credentials);

  try {
    await client.deleteMessage(params.messageId);
    return { success: true };
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    params.runtime?.error?.(`feishu: delete failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Edit/update a message
 */
export async function editMessageFeishu(params: {
  messageId: string;
  text: string;
  accountId?: string | null;
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  msgType?: "text" | "post";
  postContent?: FeishuPostContent;
}): Promise<{ success: boolean; error?: string }> {
  const cfg = params.config ?? loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: params.accountId,
  });

  if (account.credentials.source === "none") {
    return {
      success: false,
      error: `Feishu credentials missing for account "${account.accountId}".`,
    };
  }

  const client = createFeishuClient(account.credentials);

  try {
    const content =
      params.msgType === "post" && params.postContent
        ? JSON.stringify({ post: params.postContent })
        : JSON.stringify({ text: params.text });

    await client.updateMessage(params.messageId, params.msgType ?? "text", content);
    return { success: true };
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    params.runtime?.error?.(`feishu: edit failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
