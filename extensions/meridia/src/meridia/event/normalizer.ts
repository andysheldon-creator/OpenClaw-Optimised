/**
 * Event Normalizer (Component 1)
 *
 * Converts hook/tool payloads into typed MeridiaEvent envelopes.
 * Extracted from inline parsing in hooks to provide a single, typed entry point.
 */

import crypto from "node:crypto";

// ────────────────────────────────────────────────────────────────────────────
// Types
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
  provenance: {
    source: "hook" | "tool" | "system";
    traceId?: string;
  };
};

// ────────────────────────────────────────────────────────────────────────────
// Hook event shapes
// ────────────────────────────────────────────────────────────────────────────

type HookEvent = {
  type: string;
  action: string;
  timestamp: Date;
  sessionKey?: string;
  context?: unknown;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function str(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Normalizers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a tool:result hook event into a MeridiaEvent.
 */
export function normalizeToolResult(event: HookEvent): MeridiaEvent | null {
  if (event.type !== "agent" || event.action !== "tool:result") return null;

  const ctx = asObject(event.context) ?? {};
  const toolName = str(ctx.toolName);
  const toolCallId = str(ctx.toolCallId);
  if (!toolName || !toolCallId) return null;

  const sessionId = str(ctx.sessionId);
  const sessionKey = str(ctx.sessionKey) ?? event.sessionKey;
  const runId = str(ctx.runId);
  const meta = str(ctx.meta);
  const isError = Boolean(ctx.isError);

  return {
    id: crypto.randomUUID(),
    kind: "tool_result",
    ts: new Date().toISOString(),
    session: { key: sessionKey, id: sessionId, runId },
    tool: { name: toolName, callId: toolCallId, isError, meta },
    payload: { args: ctx.args, result: ctx.result },
    provenance: { source: "hook" },
  };
}

/**
 * Normalize a session boundary event (command:new, command:stop).
 */
export function normalizeSessionBoundary(event: HookEvent): MeridiaEvent | null {
  if (event.type !== "command") return null;
  if (event.action !== "new" && event.action !== "stop") return null;

  const ctx = asObject(event.context) ?? {};
  const sessionId = str(ctx.sessionId);
  const sessionKey = str(ctx.sessionKey) ?? event.sessionKey;
  const runId = str(ctx.runId);

  return {
    id: crypto.randomUUID(),
    kind: "session_boundary",
    ts: new Date().toISOString(),
    session: { key: sessionKey, id: sessionId, runId },
    payload: { action: event.action, context: ctx },
    provenance: { source: "hook" },
  };
}

/**
 * Normalize a bootstrap event.
 */
export function normalizeBootstrap(event: HookEvent): MeridiaEvent | null {
  if (event.type !== "agent" || event.action !== "bootstrap") return null;

  const ctx = asObject(event.context) as {
    bootstrapFiles?: unknown[];
    cfg?: unknown;
    sessionKey?: string;
  } | null;

  return {
    id: crypto.randomUUID(),
    kind: "session_boundary",
    ts: new Date().toISOString(),
    session: { key: ctx?.sessionKey ?? event.sessionKey },
    payload: ctx,
    provenance: { source: "hook" },
  };
}

/**
 * Normalize a manual capture tool invocation into a MeridiaEvent.
 */
export function normalizeManualCapture(params: {
  topic: string;
  reason?: string;
  significance?: number;
  toolName?: string;
  sessionKey?: string;
  context?: string;
  tags?: string[];
}): MeridiaEvent {
  return {
    id: crypto.randomUUID(),
    kind: "manual_capture",
    ts: new Date().toISOString(),
    session: { key: params.sessionKey },
    tool: { name: params.toolName ?? "experience_capture" },
    payload: params,
    provenance: { source: "tool" },
  };
}

/**
 * Extract the OpenClawConfig from a hook event's context.
 */
export function extractConfig(event: HookEvent): unknown | undefined {
  const ctx = asObject(event.context);
  return ctx?.cfg;
}
