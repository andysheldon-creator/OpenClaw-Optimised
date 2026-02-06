import type { OpenClawConfig } from "../config/config.js";
import { redactIdentifier } from "../logging/redact-identifier.js";
import {
  classifySessionKeyShape,
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "./agent-scope.js";

export type WorkspaceFallbackReason = "missing" | "blank" | "invalid_type";
type AgentIdSource = "explicit" | "session_key" | "default";

export type ResolveRunWorkspaceResult = {
  workspaceDir: string;
  usedFallback: boolean;
  fallbackReason?: WorkspaceFallbackReason;
  agentId: string;
  agentIdSource: AgentIdSource;
  malformedSessionKey: boolean;
};

function resolveRunAgentId(params: {
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): {
  agentId: string;
  agentIdSource: AgentIdSource;
  malformedSessionKey: boolean;
} {
  const explicit =
    typeof params.agentId === "string" && params.agentId.trim()
      ? normalizeAgentId(params.agentId)
      : undefined;
  if (explicit) {
    return { agentId: explicit, agentIdSource: "explicit", malformedSessionKey: false };
  }

  const defaultAgentId = resolveDefaultAgentId(params.config ?? {});
  const rawSessionKey = params.sessionKey?.trim() ?? "";
  const shape = classifySessionKeyShape(rawSessionKey);
  if (shape === "missing") {
    return {
      agentId: defaultAgentId || DEFAULT_AGENT_ID,
      agentIdSource: "default",
      malformedSessionKey: false,
    };
  }

  const parsed = parseAgentSessionKey(rawSessionKey);
  if (parsed?.agentId) {
    return {
      agentId: normalizeAgentId(parsed.agentId),
      agentIdSource: "session_key",
      malformedSessionKey: false,
    };
  }

  return {
    agentId: defaultAgentId || DEFAULT_AGENT_ID,
    agentIdSource: "default",
    malformedSessionKey: shape === "malformed_agent",
  };
}

export function redactRunIdentifier(value: string | undefined): string {
  return redactIdentifier(value, { len: 12 });
}

export function resolveRunWorkspaceDir(params: {
  workspaceDir: unknown;
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): ResolveRunWorkspaceResult {
  const requested = params.workspaceDir;
  const { agentId, agentIdSource, malformedSessionKey } = resolveRunAgentId({
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    config: params.config,
  });
  if (typeof requested === "string") {
    const trimmed = requested.trim();
    if (trimmed) {
      return {
        workspaceDir: resolveUserPath(trimmed),
        usedFallback: false,
        agentId,
        agentIdSource,
        malformedSessionKey,
      };
    }
  }

  const fallbackReason: WorkspaceFallbackReason =
    requested == null ? "missing" : typeof requested === "string" ? "blank" : "invalid_type";
  const fallbackWorkspace = resolveAgentWorkspaceDir(params.config ?? {}, agentId);
  return {
    workspaceDir: resolveUserPath(fallbackWorkspace),
    usedFallback: true,
    fallbackReason,
    agentId,
    agentIdSource,
    malformedSessionKey,
  };
}
