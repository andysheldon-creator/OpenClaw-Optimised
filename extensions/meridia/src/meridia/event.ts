import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import type { MeridiaToolResultContext } from "./types.js";

// ────────────────────────────────────────────────────────────────────────────
// Hook Event Type (shared across all handlers)
// ────────────────────────────────────────────────────────────────────────────

export type HookEvent = {
  type: string;
  action: string;
  timestamp: Date;
  sessionKey?: string;
  context?: unknown;
};

// ────────────────────────────────────────────────────────────────────────────
// MeridiaEvent Envelope (per COMPONENT-MAP.md)
// ────────────────────────────────────────────────────────────────────────────

export type MeridiaEventKind =
  | "tool_result"
  | "user_message"
  | "assistant_message"
  | "session_boundary"
  | "manual_capture"
  | "manual_ingest";

export type MeridiaEvent = {
  id: string;
  kind: MeridiaEventKind;
  ts: string;
  session?: { key?: string; id?: string; runId?: string };
  channel?: { id?: string; type?: string };
  tool?: { name?: string; callId?: string; isError?: boolean; meta?: string };
  payload: unknown;
  provenance: { source: "hook" | "tool" | "system"; traceId?: string };
};

export type SessionContext = { sessionId?: string; sessionKey?: string; runId?: string };

// ────────────────────────────────────────────────────────────────────────────
// Type Guards
// ────────────────────────────────────────────────────────────────────────────

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Config Readers
// ────────────────────────────────────────────────────────────────────────────

export function resolveHookConfig(
  cfg: OpenClawConfig | undefined,
  hookKey: string,
): Record<string, unknown> | undefined {
  const entry = cfg?.hooks?.internal?.entries?.[hookKey] as Record<string, unknown> | undefined;
  return entry && typeof entry === "object" ? entry : undefined;
}

/** Read a number from config, trying multiple keys in order. */
export function readNumber(
  cfg: Record<string, unknown> | undefined,
  keys: string | string[],
  fallback: number,
): number {
  const keyList = typeof keys === "string" ? [keys] : keys;
  for (const key of keyList) {
    const value = cfg?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  for (const key of keyList) {
    const value = cfg?.[key];
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

/**
 * Read a positive number from config (must be > 0).
 * Equivalent to readNumber + positive guard.
 */
export function readPositiveNumber(
  cfg: Record<string, unknown> | undefined,
  keys: string | string[],
  fallback: number,
): number {
  const val = readNumber(cfg, keys, fallback);
  return val > 0 ? val : fallback;
}

/** Read a string from config, trying multiple keys in order. */
export function readString(
  cfg: Record<string, unknown> | undefined,
  keys: string | string[],
  fallback?: string,
): string | undefined {
  const keyList = typeof keys === "string" ? [keys] : keys;
  for (const key of keyList) {
    const raw = cfg?.[key];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return fallback;
}

/** Read a boolean from config. */
export function readBoolean(
  cfg: Record<string, unknown> | undefined,
  keys: string | string[],
  fallback: boolean,
): boolean {
  const keyList = typeof keys === "string" ? [keys] : keys;
  for (const key of keyList) {
    const val = cfg?.[key];
    if (typeof val === "boolean") {
      return val;
    }
  }
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Common Utilities
// ────────────────────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

export function safeFileKey(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
}

// ────────────────────────────────────────────────────────────────────────────
// Session Resolution
// ────────────────────────────────────────────────────────────────────────────

export function resolveSessionContext(
  event: HookEvent,
  context: Record<string, unknown>,
): SessionContext {
  const sessionId = typeof context.sessionId === "string" ? context.sessionId : undefined;
  const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : event.sessionKey;
  const runId = typeof context.runId === "string" ? context.runId : undefined;
  return { sessionId, sessionKey, runId };
}

/** Extract sessionId from an object (e.g. session entry). */
export function resolveSessionIdFromEntry(value: unknown): string | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  const sessionId = obj.sessionId;
  return typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Event Normalization
// ────────────────────────────────────────────────────────────────────────────

/** Normalize a tool:result hook event into a MeridiaEvent envelope. */
export function normalizeToolResultEvent(
  event: HookEvent,
  context: Record<string, unknown>,
): MeridiaEvent | null {
  const toolName = typeof context.toolName === "string" ? context.toolName : "";
  const toolCallId = typeof context.toolCallId === "string" ? context.toolCallId : "";
  if (!toolName || !toolCallId) {
    return null;
  }

  const { sessionId, sessionKey, runId } = resolveSessionContext(event, context);
  const meta = typeof context.meta === "string" ? context.meta : undefined;
  const isError = Boolean(context.isError);

  return {
    id: crypto.randomUUID(),
    kind: "tool_result",
    ts: nowIso(),
    session: { key: sessionKey, id: sessionId, runId },
    tool: { name: toolName, callId: toolCallId, isError, meta },
    payload: { args: context.args, result: context.result },
    provenance: { source: "hook" },
  };
}

/** Bridge a MeridiaEvent back to MeridiaToolResultContext for evaluate.ts compat. */
export function eventToToolResultContext(event: MeridiaEvent): MeridiaToolResultContext | null {
  if (event.kind !== "tool_result" || !event.tool?.name || !event.tool?.callId) {
    return null;
  }
  const payload = asObject(event.payload);
  return {
    session: event.session,
    tool: {
      name: event.tool.name,
      callId: event.tool.callId,
      meta: event.tool.meta,
      isError: event.tool.isError ?? false,
    },
    args: payload?.args,
    result: payload?.result,
  };
}
