import { parseAgentSessionKey } from "../../../src/sessions/session-key-utils.js";

export type AgentSessionType = "cron" | "regular";

export type AgentSessionMeta = {
  agentId: string;
  agentIdLower: string;
  rest: string;
  type: AgentSessionType;
};

export function inferSessionType(sessionKey: string | undefined | null): AgentSessionType {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return "regular";
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("cron:")) return "cron";
  const parsed = parseAgentSessionKey(raw);
  if (!parsed) return "regular";
  return parsed.rest.toLowerCase().startsWith("cron:") ? "cron" : "regular";
}

export function parseAgentSessionMeta(
  sessionKey: string | undefined | null,
): AgentSessionMeta | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return null;
  const parsed = parseAgentSessionKey(raw);
  if (!parsed) return null;
  const type = inferSessionType(raw);
  const agentId = parsed.agentId.trim();
  return {
    agentId,
    agentIdLower: agentId.toLowerCase(),
    rest: parsed.rest,
    type,
  };
}

export function isAgentSessionKey(sessionKey: string | undefined | null): boolean {
  return Boolean(parseAgentSessionMeta(sessionKey));
}
