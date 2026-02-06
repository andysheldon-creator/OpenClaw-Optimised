import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import type { XmtpAgentRuntime } from "./types.js";
import { resolveXmtpAccount, type CoreConfig } from "./accounts.js";
import { getXmtpRuntime } from "./runtime.js";

const CHANNEL_ID = "xmtp";
const agents = new Map<string, XmtpAgentRuntime>();

/**
 * Set the agent runtime for an account (called from channel.ts during startAccount)
 */
export function setClientForAccount(accountId: string, agent: XmtpAgentRuntime | null): void {
  if (agent) {
    agents.set(accountId, agent);
  } else {
    agents.delete(accountId);
  }
}

/**
 * Get the agent runtime for an account
 */
export function getClientForAccount(accountId: string): XmtpAgentRuntime | undefined {
  return agents.get(accountId);
}

/**
 * Get the agent runtime for an account or throw
 */
export function getAgentOrThrow(accountId: string): XmtpAgentRuntime {
  const agent = agents.get(accountId);
  if (!agent) {
    throw new Error(`XMTP agent not running for account ${accountId}. Is the gateway started?`);
  }
  return agent;
}

export const xmtpOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getXmtpRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,

  sendText: async ({ cfg, to, text, accountId }) => {
    const account = resolveXmtpAccount({ cfg: cfg as CoreConfig, accountId });
    const agent = getAgentOrThrow(account.accountId);
    if (!agent.sendText) {
      throw new Error(
        `XMTP agent not running for account ${account.accountId}. Is the gateway started?`,
      );
    }
    await agent.sendText(to, text);
    return { channel: CHANNEL_ID, messageId: `xmtp-${Date.now()}` };
  },

  sendMedia: async ({ cfg, to, accountId, mediaUrl, text }) => {
    const account = resolveXmtpAccount({ cfg: cfg as CoreConfig, accountId });
    const agent = getAgentOrThrow(account.accountId);
    const url = mediaUrl ?? text ?? "";
    if (typeof agent.sendRemoteAttachment === "function") {
      await agent.sendRemoteAttachment(to, url);
    } else if (typeof agent.sendText === "function") {
      await agent.sendText(to, url);
    } else {
      throw new Error("sendMedia not supported: no sendRemoteAttachment or sendText on agent");
    }
    return { channel: CHANNEL_ID, messageId: `xmtp-${Date.now()}` };
  },
};
