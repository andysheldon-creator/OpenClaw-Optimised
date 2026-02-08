/**
 * Node routing utilities for agent execution.
 *
 * This module provides functions to resolve and validate node targets
 * for routing agent execution to paired nodes.
 */

import { callGateway } from "../gateway/call.js";

export type ConnectedNode = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  caps?: string[];
  commands?: string[];
  connected: boolean;
};

export type NodeResolutionResult =
  | { ok: true; node: ConnectedNode }
  | {
      ok: false;
      error: string;
      code: "NOT_FOUND" | "NOT_CONNECTED" | "NO_AGENT_CAP" | "GATEWAY_ERROR";
    };

/**
 * Resolve a node by ID or display name.
 *
 * This function queries the gateway for available nodes and matches
 * by either exact nodeId or case-insensitive displayName.
 *
 * @param nodeIdOrName - The node ID or display name to resolve
 * @param timeoutMs - Optional timeout for the gateway call
 * @returns Resolution result with the matched node or error details
 */
export async function resolveNodeByIdOrName(
  nodeIdOrName: string,
  timeoutMs = 10_000,
): Promise<NodeResolutionResult> {
  const target = nodeIdOrName.trim();
  if (!target) {
    return { ok: false, error: "node target is empty", code: "NOT_FOUND" };
  }

  try {
    const response = await callGateway<{
      nodes: Array<{
        nodeId: string;
        displayName?: string;
        platform?: string;
        caps?: string[];
        commands?: string[];
        connected: boolean;
      }>;
    }>({
      method: "node.list",
      params: {},
      timeoutMs,
    });

    const nodes = response?.nodes ?? [];

    // Try exact nodeId match first
    let match = nodes.find((n) => n.nodeId === target);

    // Fall back to case-insensitive displayName match
    if (!match) {
      const lowerTarget = target.toLowerCase();
      match = nodes.find(
        (n) =>
          n.displayName?.toLowerCase() === lowerTarget || n.nodeId.toLowerCase() === lowerTarget,
      );
    }

    if (!match) {
      return {
        ok: false,
        error: `node "${target}" not found`,
        code: "NOT_FOUND",
      };
    }

    if (!match.connected) {
      return {
        ok: false,
        error: `node "${target}" is not connected`,
        code: "NOT_CONNECTED",
      };
    }

    // Check if node has agent.run capability
    const hasAgentCap = match.commands?.includes("agent.run") || match.caps?.includes("agent");

    if (!hasAgentCap) {
      return {
        ok: false,
        error: `node "${target}" does not support agent execution (requires agent.run command)`,
        code: "NO_AGENT_CAP",
      };
    }

    return { ok: true, node: match };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `failed to resolve node: ${message}`,
      code: "GATEWAY_ERROR",
    };
  }
}

/**
 * Invoke an agent run on a remote node.
 *
 * This function proxies an agent request to a paired node that has
 * the agent.run capability. The node must be running an OpenClaw
 * gateway or compatible agent runtime.
 *
 * @param params - Agent invocation parameters
 * @returns The result from the remote agent run
 */
export async function invokeAgentOnNode(params: {
  nodeId: string;
  message: string;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
  sessionKey?: string;
  agentId?: string;
  channel?: string;
  accountId?: string;
  threadId?: string;
  idempotencyKey: string;
  timeoutMs?: number;
  extraParams?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  runId?: string;
  error?: string;
  payload?: unknown;
}> {
  try {
    const response = await callGateway<{
      ok: boolean;
      payload?: {
        runId?: string;
        status?: string;
        error?: string;
      };
      error?: { message?: string };
    }>({
      method: "node.invoke",
      params: {
        nodeId: params.nodeId,
        command: "agent.run",
        params: {
          message: params.message,
          images: params.images?.length ? params.images : undefined,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          channel: params.channel,
          accountId: params.accountId,
          threadId: params.threadId,
          idempotencyKey: params.idempotencyKey,
          ...params.extraParams,
        },
        idempotencyKey: params.idempotencyKey,
        timeoutMs: params.timeoutMs ?? 300_000, // 5 min default for agent runs
      },
      timeoutMs: (params.timeoutMs ?? 300_000) + 10_000, // Add buffer for network overhead
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.error?.message ?? "node agent invocation failed",
      };
    }

    return {
      ok: true,
      runId: response.payload?.runId,
      payload: response.payload,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
