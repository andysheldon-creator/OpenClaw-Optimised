/**
 * Feishu channel message actions
 * @module channels/plugins/actions/feishu
 */

import * as lark from "@larksuiteoapi/node-sdk";

import { createActionGate, jsonResult, readStringParam } from "../../../agents/tools/common.js";
import { listEnabledFeishuAccounts, resolveFeishuAccount } from "../../../feishu/accounts.js";
import { sendTextMessage, replyMessage } from "../../../feishu/send.js";
import type { ChannelMessageActionAdapter, ChannelMessageActionName } from "../types.js";

const providerId = "feishu";

/**
 * Create a Lark client from resolved account
 */
function createClientFromAccount(account: { appId: string; appSecret: string }): lark.Client {
  return new lark.Client({
    appId: account.appId,
    appSecret: account.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });
}

/**
 * Parse send message parameters from tool arguments
 */
function readFeishuSendParams(params: Record<string, unknown>) {
  const to = readStringParam(params, "to", { required: true });
  const message = readStringParam(params, "message", { required: true, allowEmpty: false });
  const replyTo = readStringParam(params, "replyTo");
  return { to, message, replyTo };
}

/**
 * Feishu channel message action adapter
 */
export const feishuMessageActions: ChannelMessageActionAdapter = {
  /**
   * List available actions for this channel
   */
  listActions: ({ cfg }) => {
    const accounts = listEnabledFeishuAccounts(cfg);
    if (accounts.length === 0) {return [];}

    const gate = createActionGate(cfg.channels?.feishu?.actions);
    const actions = new Set<ChannelMessageActionName>(["send"]);

    if (gate("reactions")) {
      actions.add("react");
    }

    return Array.from(actions);
  },

  /**
   * Check if channel supports interactive buttons
   */
  supportsButtons: ({ cfg }) => {
    const accounts = listEnabledFeishuAccounts(cfg);
    if (accounts.length === 0) {return false;}
    // Feishu supports card buttons
    const gate = createActionGate(cfg.channels?.feishu?.actions);
    return gate("cards", true);
  },

  /**
   * Extract send parameters from tool call
   */
  extractToolSend: ({ args }) => {
    const action = typeof args.action === "string" ? args.action.trim() : "";
    if (action !== "sendMessage") {return null;}
    const to = typeof args.to === "string" ? args.to : undefined;
    if (!to) {return null;}
    const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
    return { to, accountId };
  },

  /**
   * Handle channel actions
   */
  handleAction: async ({ action, params, cfg, accountId }) => {
    // Resolve account
    const account = resolveFeishuAccount({
      cfg,
      accountId: accountId ?? undefined,
    });

    if (!account) {
      throw new Error("No Feishu account configured or available.");
    }

    // Create Lark client
    const client = createClientFromAccount(account);

    if (action === "send") {
      const { to, message, replyTo } = readFeishuSendParams(params);

      if (replyTo) {
        // Reply to existing message
        const result = await replyMessage(client, replyTo, message);
        return jsonResult({
          ok: true,
          messageId: result.messageId,
          chatId: result.chatId,
        });
      } else {
        // Send new message to chat
        const result = await sendTextMessage(client, to, message);
        return jsonResult({
          ok: true,
          messageId: result.messageId,
          chatId: result.chatId,
        });
      }
    }

    if (action === "react") {
      // Feishu reactions are handled differently
      // For now, just acknowledge the action
      throw new Error("Feishu reactions are not yet implemented.");
    }

    throw new Error(`Action "${action}" is not supported for provider ${providerId}.`);
  },
};
