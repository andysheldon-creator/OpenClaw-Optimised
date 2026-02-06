import type { OpenClawConfig } from "../config/config.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
import { resolveAgentWorkspaceDir } from "./agent-scope.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "./workspace.js";

export type WorkspaceFallbackReason = "missing" | "blank" | "invalid_type";

export type ResolveRunWorkspaceResult = {
  workspaceDir: string;
  usedFallback: boolean;
  fallbackReason?: WorkspaceFallbackReason;
  agentId: string;
};

function resolveRunAgentId(params: { sessionKey?: string; agentId?: string }): string {
  const explicit =
    typeof params.agentId === "string" && params.agentId.trim()
      ? normalizeAgentId(params.agentId)
      : undefined;
  if (explicit) {
    return explicit;
  }
  return resolveAgentIdFromSessionKey(params.sessionKey);
}

export function resolveRunWorkspaceDir(params: {
  workspaceDir: unknown;
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): ResolveRunWorkspaceResult {
  const requested = params.workspaceDir;
  const agentId = resolveRunAgentId(params);
  if (typeof requested === "string") {
    const trimmed = requested.trim();
    if (trimmed) {
      return {
        workspaceDir: resolveUserPath(trimmed),
        usedFallback: false,
        agentId,
      };
    }
  }

  const fallbackReason: WorkspaceFallbackReason =
    requested == null ? "missing" : typeof requested === "string" ? "blank" : "invalid_type";
  const fallbackWorkspace = params.config
    ? resolveAgentWorkspaceDir(params.config, agentId)
    : DEFAULT_AGENT_WORKSPACE_DIR;
  return {
    workspaceDir: resolveUserPath(fallbackWorkspace),
    usedFallback: true,
    fallbackReason,
    agentId,
  };
}
