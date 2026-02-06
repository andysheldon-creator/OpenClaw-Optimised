import type { SessionConfig, SessionResetConfig } from "../types.base.js";
import { normalizeMessageChannel } from "../../utils/message-channel.js";
import { DEFAULT_IDLE_MINUTES } from "./types.js";

export type SessionResetMode = "daily" | "idle";
export type SessionResetType = "dm" | "group" | "thread";

export type SessionResetPolicy = {
  mode: SessionResetMode;
  atHour: number;
  idleMinutes?: number;
  contextUsageThreshold?: number;
  maxCompactions?: number;
};

export type SessionResetReason = "daily" | "idle" | "context-usage" | "compactions";

export type SessionFreshness = {
  fresh: boolean;
  dailyResetAt?: number;
  idleExpiresAt?: number;
  staleReason?: SessionResetReason;
  contextUsage?: number;
  compactionCount?: number;
};

export const DEFAULT_RESET_MODE: SessionResetMode = "daily";
export const DEFAULT_RESET_AT_HOUR = 4;

const THREAD_SESSION_MARKERS = [":thread:", ":topic:"];
const GROUP_SESSION_MARKERS = [":group:", ":channel:"];

export function isThreadSessionKey(sessionKey?: string | null): boolean {
  const normalized = (sessionKey ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return THREAD_SESSION_MARKERS.some((marker) => normalized.includes(marker));
}

export function resolveSessionResetType(params: {
  sessionKey?: string | null;
  isGroup?: boolean;
  isThread?: boolean;
}): SessionResetType {
  if (params.isThread || isThreadSessionKey(params.sessionKey)) {
    return "thread";
  }
  if (params.isGroup) {
    return "group";
  }
  const normalized = (params.sessionKey ?? "").toLowerCase();
  if (GROUP_SESSION_MARKERS.some((marker) => normalized.includes(marker))) {
    return "group";
  }
  return "dm";
}

export function resolveThreadFlag(params: {
  sessionKey?: string | null;
  messageThreadId?: string | number | null;
  threadLabel?: string | null;
  threadStarterBody?: string | null;
  parentSessionKey?: string | null;
}): boolean {
  if (params.messageThreadId != null) {
    return true;
  }
  if (params.threadLabel?.trim()) {
    return true;
  }
  if (params.threadStarterBody?.trim()) {
    return true;
  }
  if (params.parentSessionKey?.trim()) {
    return true;
  }
  return isThreadSessionKey(params.sessionKey);
}

export function resolveDailyResetAtMs(now: number, atHour: number): number {
  const normalizedAtHour = normalizeResetAtHour(atHour);
  const resetAt = new Date(now);
  resetAt.setHours(normalizedAtHour, 0, 0, 0);
  if (now < resetAt.getTime()) {
    resetAt.setDate(resetAt.getDate() - 1);
  }
  return resetAt.getTime();
}

export function resolveSessionResetPolicy(params: {
  sessionCfg?: SessionConfig;
  resetType: SessionResetType;
  resetOverride?: SessionResetConfig;
}): SessionResetPolicy {
  const sessionCfg = params.sessionCfg;
  const globalReset = sessionCfg?.reset;

  // When the override has `inherit: true`, merge: override values win, unset fields
  // fall through to the global session.reset config.
  const effectiveOverride =
    params.resetOverride?.inherit && globalReset
      ? {
          ...globalReset,
          ...stripUndefined(params.resetOverride),
        }
      : params.resetOverride;

  const baseReset = effectiveOverride ?? globalReset;
  const typeReset = effectiveOverride ? undefined : sessionCfg?.resetByType?.[params.resetType];
  const hasExplicitReset = Boolean(baseReset || sessionCfg?.resetByType);
  const legacyIdleMinutes = effectiveOverride ? undefined : sessionCfg?.idleMinutes;
  const mode =
    typeReset?.mode ??
    baseReset?.mode ??
    (!hasExplicitReset && legacyIdleMinutes != null ? "idle" : DEFAULT_RESET_MODE);
  const atHour = normalizeResetAtHour(
    typeReset?.atHour ?? baseReset?.atHour ?? DEFAULT_RESET_AT_HOUR,
  );
  const idleMinutesRaw = typeReset?.idleMinutes ?? baseReset?.idleMinutes ?? legacyIdleMinutes;

  let idleMinutes: number | undefined;
  if (idleMinutesRaw != null) {
    const normalized = Math.floor(idleMinutesRaw);
    if (Number.isFinite(normalized)) {
      idleMinutes = Math.max(normalized, 1);
    }
  } else if (mode === "idle") {
    idleMinutes = DEFAULT_IDLE_MINUTES;
  }

  const contextUsageThreshold =
    typeReset?.contextUsageThreshold ?? baseReset?.contextUsageThreshold;
  const maxCompactions = typeReset?.maxCompactions ?? baseReset?.maxCompactions;

  return { mode, atHour, idleMinutes, contextUsageThreshold, maxCompactions };
}

export function resolveChannelResetConfig(params: {
  sessionCfg?: SessionConfig;
  channel?: string | null;
}): SessionResetConfig | undefined {
  const resetByChannel = params.sessionCfg?.resetByChannel;
  if (!resetByChannel) {
    return undefined;
  }
  const normalized = normalizeMessageChannel(params.channel);
  const fallback = params.channel?.trim().toLowerCase();
  const key = normalized ?? fallback;
  if (!key) {
    return undefined;
  }
  return resetByChannel[key] ?? resetByChannel[key.toLowerCase()];
}

export function evaluateSessionFreshness(params: {
  updatedAt: number;
  now: number;
  policy: SessionResetPolicy;
  totalTokens?: number;
  contextTokens?: number;
  compactionCount?: number;
}): SessionFreshness {
  const dailyResetAt =
    params.policy.mode === "daily"
      ? resolveDailyResetAtMs(params.now, params.policy.atHour)
      : undefined;
  const idleExpiresAt =
    params.policy.idleMinutes != null
      ? params.updatedAt + params.policy.idleMinutes * 60_000
      : undefined;
  const staleDaily = dailyResetAt != null && params.updatedAt < dailyResetAt;
  const staleIdle = idleExpiresAt != null && params.now > idleExpiresAt;

  // Context-usage check: skip when token data is missing or contextTokens is 0.
  const contextUsage =
    params.totalTokens != null && params.contextTokens != null && params.contextTokens > 0
      ? params.totalTokens / params.contextTokens
      : undefined;
  const staleContext =
    contextUsage != null &&
    params.policy.contextUsageThreshold != null &&
    contextUsage >= params.policy.contextUsageThreshold;

  // Compaction count check: skip when compactionCount is undefined.
  const staleCompactions =
    params.compactionCount != null &&
    params.policy.maxCompactions != null &&
    params.compactionCount >= params.policy.maxCompactions;

  // OR logic: any criterion firing = stale.
  const stale = staleDaily || staleIdle || staleContext || staleCompactions;

  let staleReason: SessionResetReason | undefined;
  if (stale) {
    if (staleDaily) staleReason = "daily";
    else if (staleIdle) staleReason = "idle";
    else if (staleContext) staleReason = "context-usage";
    else if (staleCompactions) staleReason = "compactions";
  }

  return {
    fresh: !stale,
    dailyResetAt,
    idleExpiresAt,
    staleReason,
    contextUsage,
    compactionCount: params.compactionCount,
  };
}

/** Strip keys whose value is `undefined` so spread-merge doesn't clobber global values. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

function normalizeResetAtHour(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RESET_AT_HOUR;
  }
  const normalized = Math.floor(value);
  if (!Number.isFinite(normalized)) {
    return DEFAULT_RESET_AT_HOUR;
  }
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 23) {
    return 23;
  }
  return normalized;
}
