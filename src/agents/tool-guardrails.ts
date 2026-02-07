import type { OpenClawConfig } from "../config/config.js";
import type { AgentToolGuardrailsConfig } from "../config/types.agent-defaults.js";
import { normalizeToolName } from "./tool-policy.js";

type SessionGuardrailState = {
  totalCalls: number;
  minuteCalls: number[];
  perToolMinuteCalls: Map<string, number[]>;
  lastSeenAtMs: number;
};

const ONE_MINUTE_MS = 60_000;
const STALE_SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_TRACKED_SESSIONS = 2048;
const sessionStates = new Map<string, SessionGuardrailState>();

function cleanupSessionStates(nowMs: number) {
  for (const [sessionKey, state] of sessionStates) {
    if (nowMs - state.lastSeenAtMs > STALE_SESSION_MS) {
      sessionStates.delete(sessionKey);
    }
  }
  if (sessionStates.size <= MAX_TRACKED_SESSIONS) {
    return;
  }
  const entries = Array.from(sessionStates.entries()).sort(
    (a, b) => a[1].lastSeenAtMs - b[1].lastSeenAtMs,
  );
  const removeCount = sessionStates.size - MAX_TRACKED_SESSIONS;
  for (let index = 0; index < removeCount; index++) {
    const stale = entries[index];
    if (stale) {
      sessionStates.delete(stale[0]);
    }
  }
}

function pruneWindow(timestamps: number[], nowMs: number) {
  let drop = 0;
  while (drop < timestamps.length && nowMs - timestamps[drop] >= ONE_MINUTE_MS) {
    drop++;
  }
  if (drop > 0) {
    timestamps.splice(0, drop);
  }
}

function normalizeGuardrails(raw: AgentToolGuardrailsConfig | undefined) {
  if (!raw) {
    return undefined;
  }
  const maxToolCallsPerSession =
    typeof raw.maxToolCallsPerSession === "number" && raw.maxToolCallsPerSession > 0
      ? Math.floor(raw.maxToolCallsPerSession)
      : undefined;
  const maxToolCallsPerMinute =
    typeof raw.maxToolCallsPerMinute === "number" && raw.maxToolCallsPerMinute > 0
      ? Math.floor(raw.maxToolCallsPerMinute)
      : undefined;
  const toolBlocklist = new Set(
    (raw.toolBlocklist ?? [])
      .map((entry) => normalizeToolName(entry))
      .filter((entry): entry is string => Boolean(entry)),
  );
  const toolRateLimits = new Map<string, number>();
  for (const [toolNameRaw, limitRaw] of Object.entries(raw.toolRateLimits ?? {})) {
    const toolName = normalizeToolName(toolNameRaw);
    const maxPerMinute =
      typeof limitRaw?.maxPerMinute === "number" && limitRaw.maxPerMinute > 0
        ? Math.floor(limitRaw.maxPerMinute)
        : undefined;
    if (!toolName || !maxPerMinute) {
      continue;
    }
    toolRateLimits.set(toolName, maxPerMinute);
  }
  if (
    !maxToolCallsPerSession &&
    !maxToolCallsPerMinute &&
    toolBlocklist.size === 0 &&
    toolRateLimits.size === 0
  ) {
    return undefined;
  }
  return {
    maxToolCallsPerSession,
    maxToolCallsPerMinute,
    toolBlocklist,
    toolRateLimits,
  };
}

function getSessionState(sessionKey: string, nowMs: number): SessionGuardrailState {
  cleanupSessionStates(nowMs);
  const existing = sessionStates.get(sessionKey);
  if (existing) {
    existing.lastSeenAtMs = nowMs;
    return existing;
  }
  const created: SessionGuardrailState = {
    totalCalls: 0,
    minuteCalls: [],
    perToolMinuteCalls: new Map(),
    lastSeenAtMs: nowMs,
  };
  sessionStates.set(sessionKey, created);
  return created;
}

export function resolveToolGuardrailsFromConfig(
  cfg: OpenClawConfig | undefined,
): AgentToolGuardrailsConfig | undefined {
  return cfg?.agents?.defaults?.guardrails;
}

export function evaluateToolGuardrails(params: {
  toolName: string;
  sessionKey?: string;
  guardrails?: AgentToolGuardrailsConfig;
  nowMs?: number;
}): { allowed: true } | { allowed: false; reason: string } {
  const guardrails = normalizeGuardrails(params.guardrails);
  if (!guardrails) {
    return { allowed: true };
  }
  const toolName = normalizeToolName(params.toolName) ?? params.toolName.trim().toLowerCase();
  if (guardrails.toolBlocklist.has(toolName)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is blocked by agent guardrails.`,
    };
  }
  if (!params.sessionKey) {
    return { allowed: true };
  }

  const nowMs = params.nowMs ?? Date.now();
  const state = getSessionState(params.sessionKey, nowMs);
  pruneWindow(state.minuteCalls, nowMs);

  if (guardrails.maxToolCallsPerSession && state.totalCalls >= guardrails.maxToolCallsPerSession) {
    return {
      allowed: false,
      reason:
        `Tool call limit reached for this session (` + `${guardrails.maxToolCallsPerSession} max).`,
    };
  }

  if (
    guardrails.maxToolCallsPerMinute &&
    state.minuteCalls.length >= guardrails.maxToolCallsPerMinute
  ) {
    return {
      allowed: false,
      reason:
        `Tool rate limit reached for this session (` + `${guardrails.maxToolCallsPerMinute}/min).`,
    };
  }

  const toolMinuteCalls = state.perToolMinuteCalls.get(toolName) ?? [];
  pruneWindow(toolMinuteCalls, nowMs);
  const toolLimit = guardrails.toolRateLimits.get(toolName);
  if (toolLimit && toolMinuteCalls.length >= toolLimit) {
    state.perToolMinuteCalls.set(toolName, toolMinuteCalls);
    return {
      allowed: false,
      reason: `Tool "${toolName}" rate limit reached (${toolLimit}/min).`,
    };
  }

  state.totalCalls += 1;
  state.minuteCalls.push(nowMs);
  toolMinuteCalls.push(nowMs);
  state.perToolMinuteCalls.set(toolName, toolMinuteCalls);
  state.lastSeenAtMs = nowMs;

  return { allowed: true };
}

export function resetToolGuardrailStateForTests() {
  sessionStates.clear();
}
