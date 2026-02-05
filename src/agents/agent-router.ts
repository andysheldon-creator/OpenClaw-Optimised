/**
 * Agent Router
 *
 * Routes incoming requests to the appropriate agent based on various
 * identifiers (model name, metadata, headers).
 */

import type { IncomingMessage } from "node:http";

export type AgentRouterParams = {
  /** Model name from request */
  model?: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
  /** HTTP request object */
  req?: IncomingMessage;
};

/**
 * Resolve agent ID from request parameters
 *
 * Priority order:
 * 1. metadata.agentId (explicit in request body)
 * 2. x-agent-id header
 * 3. model name (if it looks like an agent ID)
 * 4. "default-agent" fallback
 */
export function resolveAgentIdFromRequest(params: AgentRouterParams): string {
  // Priority 1: Explicit agentId in metadata
  if (params.metadata?.agentId && typeof params.metadata.agentId === "string") {
    return params.metadata.agentId.trim();
  }

  // Priority 2: x-agent-id header
  if (params.req?.headers) {
    const agentIdHeader =
      params.req.headers["x-agent-id"] ||
      params.req.headers["x-openclaw-agent-id"];
    if (agentIdHeader && typeof agentIdHeader === "string") {
      return agentIdHeader.trim();
    }
  }

  // Priority 3: Model name (if it looks like an agent ID, not a model name)
  if (params.model && typeof params.model === "string") {
    const modelTrimmed = params.model.trim();
    // If model contains "agent" or ends with specific patterns, treat as agentId
    if (
      modelTrimmed.includes("-agent") ||
      modelTrimmed.includes("_agent") ||
      modelTrimmed.endsWith("-bot") ||
      modelTrimmed.endsWith("_bot")
    ) {
      return modelTrimmed;
    }
  }

  // Priority 4: Default fallback
  return "default-agent";
}

/**
 * Check if a tool is allowed for an agent based on its configuration
 */
export function isToolAllowedForAgent(params: {
  toolName: string;
  enabledTools?: string[];
  disabledTools?: string[];
}): boolean {
  const { toolName, enabledTools, disabledTools } = params;

  // If there's an explicit disabled list and tool is in it, reject
  if (disabledTools && disabledTools.length > 0) {
    if (disabledTools.includes(toolName)) {
      return false;
    }
  }

  // If there's an explicit enabled list, only allow tools in that list
  if (enabledTools && enabledTools.length > 0) {
    return enabledTools.includes(toolName);
  }

  // If no restrictions specified, allow all tools
  return true;
}

/**
 * Check if a channel is allowed for an agent
 */
export function isChannelAllowedForAgent(params: {
  channel: string;
  allowedChannels?: string[];
}): boolean {
  const { channel, allowedChannels } = params;

  // If no channel restrictions, allow all
  if (!allowedChannels || allowedChannels.length === 0) {
    return true;
  }

  // Check if channel is in allowed list
  return allowedChannels.includes(channel);
}
