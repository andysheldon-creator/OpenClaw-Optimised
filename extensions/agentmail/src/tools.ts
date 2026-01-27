import type { ChannelAgentTool } from "clawdbot/plugin-sdk";
import { AgentMailToolkit } from "agentmail-toolkit/clawdbot";

import { getAgentMailClient } from "./client.js";

/**
 * Returns all AgentMail agent tools.
 */
export function createAgentMailTools(): ChannelAgentTool[] {
  const client = getAgentMailClient();
  const toolkit = new AgentMailToolkit(client);
  return toolkit.getTools();
}
