import { loadConfig } from "../config/config.js";
import { callGateway } from "../gateway/call.js";
import { emitAgentEvent, onAgentEvent } from "../infra/agent-events.js";
import { isSubagentSessionKey } from "../routing/session-key.js";
import { type DeliveryContext, normalizeDeliveryContext } from "../utils/delivery-context.js";
import { runSubagentAnnounceFlow, type SubagentRunOutcome } from "./subagent-announce.js";
import {
  loadSubagentRegistryFromDisk,
  saveSubagentRegistryToDisk,
} from "./subagent-registry.store.js";
import { resolveAgentTimeoutMs } from "./timeout.js";

export type SubagentUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
  toolCalls: number;
};

export type SubagentProgress = {
  percent: number;
  status: string;
  detail?: string;
  lastUpdate: number;
};

export type SubagentRunRecord = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep" | "idle";
  label?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: SubagentRunOutcome;
  archiveAtMs?: number;
  cleanupCompletedAt?: number;
  cleanupHandled?: boolean;
  /** Accumulated resource usage for this run. */
  usage?: SubagentUsage;
  /** Real-time progress tracking. */
  progress?: SubagentProgress;
};

const subagentRuns = new Map<string, SubagentRunRecord>();
let sweeper: NodeJS.Timeout | null = null;
let listenerStarted = false;
let listenerStop: (() => void) | null = null;
// Use var to avoid TDZ when init runs across circular imports during bootstrap.
var restoreAttempted = false;

function persistSubagentRuns() {
  try {
    saveSubagentRegistryToDisk(subagentRuns);
  } catch {
    // ignore persistence failures
  }
}

const resumedRuns = new Set<string>();

function resumeSubagentRun(runId: string) {
  if (!runId || resumedRuns.has(runId)) {
    return;
  }
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  if (entry.cleanupCompletedAt) {
    return;
  }

  if (typeof entry.endedAt === "number" && entry.endedAt > 0) {
    if (!beginSubagentCleanup(runId)) {
      return;
    }
    const requesterOrigin = normalizeDeliveryContext(entry.requesterOrigin);
    void runSubagentAnnounceFlow({
      childSessionKey: entry.childSessionKey,
      childRunId: entry.runId,
      requesterSessionKey: entry.requesterSessionKey,
      requesterOrigin,
      requesterDisplayKey: entry.requesterDisplayKey,
      task: entry.task,
      timeoutMs: 30_000,
      cleanup: entry.cleanup,
      waitForCompletion: false,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      label: entry.label,
      outcome: entry.outcome,
    }).then((didAnnounce) => {
      finalizeSubagentCleanup(runId, entry.cleanup, didAnnounce);
    });
    resumedRuns.add(runId);
    return;
  }

  // Wait for completion again after restart.
  const cfg = loadConfig();
  const waitTimeoutMs = resolveSubagentWaitTimeoutMs(cfg, undefined);
  void waitForSubagentCompletion(runId, waitTimeoutMs);
  resumedRuns.add(runId);
}

function restoreSubagentRunsOnce() {
  if (restoreAttempted) {
    return;
  }
  restoreAttempted = true;

  // Always ensure listener is initialized to capture new spawn events
  ensureListener();

  try {
    const restored = loadSubagentRegistryFromDisk();
    if (restored.size === 0) {
      return;
    }
    for (const [runId, entry] of restored.entries()) {
      if (!runId || !entry) {
        continue;
      }
      // Keep any newer in-memory entries.
      if (!subagentRuns.has(runId)) {
        subagentRuns.set(runId, entry);
      }
    }

    // Mark orphaned runs (started but never finished before gateway restart)
    // as failed so they don't appear permanently stuck as "running".
    const now = Date.now();
    const ORPHAN_THRESHOLD_MS = 5 * 60_000; // 5 minutes
    for (const [_runId, entry] of subagentRuns.entries()) {
      if (entry.outcome || entry.cleanupCompletedAt) {
        continue;
      }
      const anchor = entry.startedAt ?? entry.createdAt ?? 0;
      if (anchor > 0 && now - anchor > ORPHAN_THRESHOLD_MS && !entry.endedAt) {
        entry.endedAt = now;
        entry.outcome = {
          status: "error",
          error: "Orphaned: gateway restarted before run completed",
        };
      }
    }
    persistSubagentRuns();

    // Resume pending work.
    if ([...subagentRuns.values()].some((entry) => entry.archiveAtMs)) {
      startSweeper();
    }
    for (const runId of subagentRuns.keys()) {
      resumeSubagentRun(runId);
    }
  } catch {
    // ignore restore failures
  }
}

function resolveArchiveAfterMs(cfg?: ReturnType<typeof loadConfig>) {
  const config = cfg ?? loadConfig();
  const minutes = config.agents?.defaults?.subagents?.archiveAfterMinutes ?? 60;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }
  return Math.max(1, Math.floor(minutes)) * 60_000;
}

function resolveSubagentWaitTimeoutMs(
  cfg: ReturnType<typeof loadConfig>,
  runTimeoutSeconds?: number,
) {
  return resolveAgentTimeoutMs({ cfg, overrideSeconds: runTimeoutSeconds });
}

function startSweeper() {
  if (sweeper) {
    return;
  }
  sweeper = setInterval(() => {
    void sweepSubagentRuns();
  }, 60_000);
  sweeper.unref?.();
}

function stopSweeper() {
  if (!sweeper) {
    return;
  }
  clearInterval(sweeper);
  sweeper = null;
}

async function sweepSubagentRuns() {
  const now = Date.now();
  let mutated = false;
  for (const [runId, entry] of subagentRuns.entries()) {
    if (!entry.archiveAtMs || entry.archiveAtMs > now) {
      continue;
    }
    subagentRuns.delete(runId);
    mutated = true;
    try {
      await callGateway({
        method: "sessions.delete",
        params: { key: entry.childSessionKey, deleteTranscript: true },
        timeoutMs: 10_000,
      });
    } catch {
      // ignore
    }
  }
  if (mutated) {
    persistSubagentRuns();
  }
  if (subagentRuns.size === 0) {
    stopSweeper();
  }
}

function ensureListener() {
  if (listenerStarted) {
    return;
  }
  listenerStarted = true;
  listenerStop = onAgentEvent((evt) => {
    if (!evt) {
      return;
    }
    // Track tool calls for usage accumulation
    if (evt.stream === "tool") {
      const entry = subagentRuns.get(evt.runId);
      if (entry && evt.data?.phase === "start") {
        if (!entry.usage) {
          entry.usage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costUsd: 0,
            durationMs: 0,
            toolCalls: 0,
          };
        }
        entry.usage.toolCalls += 1;
      }
      return;
    }
    if (evt.stream !== "lifecycle") {
      return;
    }
    const entry = subagentRuns.get(evt.runId);
    if (!entry) {
      return;
    }
    const phase = evt.data?.phase;
    if (phase === "start") {
      const startedAt = typeof evt.data?.startedAt === "number" ? evt.data.startedAt : undefined;
      if (startedAt) {
        entry.startedAt = startedAt;
        persistSubagentRuns();
      }
      return;
    }
    if (phase !== "end" && phase !== "error") {
      return;
    }
    const endedAt = typeof evt.data?.endedAt === "number" ? evt.data.endedAt : Date.now();
    entry.endedAt = endedAt;
    if (phase === "error") {
      const error = typeof evt.data?.error === "string" ? evt.data.error : undefined;
      entry.outcome = { status: "error", error };
    } else {
      entry.outcome = { status: "ok" };
    }
    persistSubagentRuns();

    if (!beginSubagentCleanup(evt.runId)) {
      return;
    }
    const requesterOrigin = normalizeDeliveryContext(entry.requesterOrigin);
    void runSubagentAnnounceFlow({
      childSessionKey: entry.childSessionKey,
      childRunId: entry.runId,
      requesterSessionKey: entry.requesterSessionKey,
      requesterOrigin,
      requesterDisplayKey: entry.requesterDisplayKey,
      task: entry.task,
      timeoutMs: 30_000,
      cleanup: entry.cleanup,
      waitForCompletion: false,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      label: entry.label,
      outcome: entry.outcome,
    }).then((didAnnounce) => {
      finalizeSubagentCleanup(evt.runId, entry.cleanup, didAnnounce);
    });
  });
}

function deleteChildSession(childSessionKey: string) {
  void callGateway({
    method: "sessions.delete",
    params: { key: childSessionKey, deleteTranscript: true },
    timeoutMs: 10_000,
  }).catch(() => {
    // Ignore session deletion failures — the archive sweeper is a fallback.
  });
}

function finalizeSubagentCleanup(
  runId: string,
  cleanup: "delete" | "keep" | "idle",
  didAnnounce: boolean,
) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  const childSessionKey = entry.childSessionKey;
  if (cleanup === "delete") {
    subagentRuns.delete(runId);
    persistSubagentRuns();
    deleteChildSession(childSessionKey);
    return;
  }
  if (cleanup === "idle") {
    // Idle mode: keep session alive for follow-up instructions.
    // Reset archive timer from completion time (not creation time).
    const cfg = loadConfig();
    const archiveAfterMs = resolveArchiveAfterMs(cfg);
    if (archiveAfterMs) {
      entry.archiveAtMs = Date.now() + archiveAfterMs;
    }
    entry.cleanupCompletedAt = Date.now();
    persistSubagentRuns();
    startSweeper();
    return;
  }
  // cleanup === "keep": delete after successful announce only.
  if (!didAnnounce) {
    // Allow retry on the next wake if the announce failed.
    entry.cleanupHandled = false;
    persistSubagentRuns();
    return;
  }
  entry.cleanupCompletedAt = Date.now();
  persistSubagentRuns();
  deleteChildSession(childSessionKey);
}

function beginSubagentCleanup(runId: string) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return false;
  }
  if (entry.cleanupCompletedAt) {
    return false;
  }
  if (entry.cleanupHandled) {
    return false;
  }
  entry.cleanupHandled = true;
  persistSubagentRuns();
  return true;
}

export function updateSubagentUsage(runId: string, delta: Partial<SubagentUsage>) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  if (!entry.usage) {
    entry.usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      durationMs: 0,
      toolCalls: 0,
    };
  }
  if (delta.inputTokens) {
    entry.usage.inputTokens += delta.inputTokens;
  }
  if (delta.outputTokens) {
    entry.usage.outputTokens += delta.outputTokens;
  }
  if (delta.cacheReadTokens) {
    entry.usage.cacheReadTokens += delta.cacheReadTokens;
  }
  if (delta.cacheWriteTokens) {
    entry.usage.cacheWriteTokens += delta.cacheWriteTokens;
  }
  if (delta.costUsd) {
    entry.usage.costUsd += delta.costUsd;
  }
  if (delta.durationMs) {
    entry.usage.durationMs += delta.durationMs;
  }
  if (delta.toolCalls) {
    entry.usage.toolCalls += delta.toolCalls;
  }
  persistSubagentRuns();

  // Broadcast usage update for real-time hierarchy tracking
  emitAgentEvent({
    runId,
    stream: "lifecycle",
    sessionKey: entry.childSessionKey,
    data: {
      phase: "usage-update",
      usage: entry.usage,
    },
  });
}

export function registerSubagentRun(params: {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep" | "idle";
  label?: string;
  runTimeoutSeconds?: number;
}) {
  const now = Date.now();
  const cfg = loadConfig();
  const archiveAfterMs = resolveArchiveAfterMs(cfg);
  const archiveAtMs = archiveAfterMs ? now + archiveAfterMs : undefined;
  const waitTimeoutMs = resolveSubagentWaitTimeoutMs(cfg, params.runTimeoutSeconds);
  const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
  subagentRuns.set(params.runId, {
    runId: params.runId,
    childSessionKey: params.childSessionKey,
    requesterSessionKey: params.requesterSessionKey,
    requesterOrigin,
    requesterDisplayKey: params.requesterDisplayKey,
    task: params.task,
    cleanup: params.cleanup,
    label: params.label,
    createdAt: now,
    startedAt: now,
    archiveAtMs,
    cleanupHandled: false,
  });
  ensureListener();
  persistSubagentRuns();

  // Emit spawn event for real-time hierarchy tracking
  emitAgentEvent({
    runId: params.runId,
    stream: "lifecycle",
    sessionKey: params.childSessionKey,
    data: {
      phase: "spawn",
      parentSessionKey: params.requesterSessionKey,
      childSessionKey: params.childSessionKey,
      label: params.label,
      task: params.task,
      createdAt: now,
    },
  });
  if (archiveAfterMs) {
    startSweeper();
  }
  // Wait for subagent completion via gateway RPC (cross-process).
  // The in-process lifecycle listener is a fallback for embedded runs.
  void waitForSubagentCompletion(params.runId, waitTimeoutMs);
}

async function waitForSubagentCompletion(runId: string, waitTimeoutMs: number) {
  try {
    const timeoutMs = Math.max(1, Math.floor(waitTimeoutMs));
    const wait = await callGateway<{
      status?: string;
      startedAt?: number;
      endedAt?: number;
      error?: string;
    }>({
      method: "agent.wait",
      params: {
        runId,
        timeoutMs,
      },
      timeoutMs: timeoutMs + 10_000,
    });
    if (wait?.status !== "ok" && wait?.status !== "error") {
      return;
    }
    const entry = subagentRuns.get(runId);
    if (!entry) {
      return;
    }
    let mutated = false;
    if (typeof wait.startedAt === "number") {
      entry.startedAt = wait.startedAt;
      mutated = true;
    }
    if (typeof wait.endedAt === "number") {
      entry.endedAt = wait.endedAt;
      mutated = true;
    }
    if (!entry.endedAt) {
      entry.endedAt = Date.now();
      mutated = true;
    }
    const waitError = typeof wait.error === "string" ? wait.error : undefined;
    entry.outcome =
      wait.status === "error" ? { status: "error", error: waitError } : { status: "ok" };
    mutated = true;
    if (mutated) {
      persistSubagentRuns();
    }
    if (!beginSubagentCleanup(runId)) {
      return;
    }
    const requesterOrigin = normalizeDeliveryContext(entry.requesterOrigin);
    void runSubagentAnnounceFlow({
      childSessionKey: entry.childSessionKey,
      childRunId: entry.runId,
      requesterSessionKey: entry.requesterSessionKey,
      requesterOrigin,
      requesterDisplayKey: entry.requesterDisplayKey,
      task: entry.task,
      timeoutMs: 30_000,
      cleanup: entry.cleanup,
      waitForCompletion: false,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      label: entry.label,
      outcome: entry.outcome,
    }).then((didAnnounce) => {
      finalizeSubagentCleanup(runId, entry.cleanup, didAnnounce);
    });
  } catch {
    // ignore
  }
}

export function resetSubagentRegistryForTests() {
  subagentRuns.clear();
  resumedRuns.clear();
  stopSweeper();
  restoreAttempted = false;
  if (listenerStop) {
    listenerStop();
    listenerStop = null;
  }
  listenerStarted = false;
  persistSubagentRuns();
}

export function addSubagentRunForTests(entry: SubagentRunRecord) {
  subagentRuns.set(entry.runId, entry);
  persistSubagentRuns();
}

export function releaseSubagentRun(runId: string) {
  const didDelete = subagentRuns.delete(runId);
  if (didDelete) {
    persistSubagentRuns();
  }
  if (subagentRuns.size === 0) {
    stopSweeper();
  }
}

export function listSubagentRunsForRequester(requesterSessionKey: string): SubagentRunRecord[] {
  const key = requesterSessionKey.trim();
  if (!key) {
    return [];
  }
  return [...subagentRuns.values()].filter((entry) => entry.requesterSessionKey === key);
}

export function listAllSubagentRuns(): SubagentRunRecord[] {
  return [...subagentRuns.values()];
}

export function initSubagentRegistry() {
  restoreSubagentRunsOnce();
}

export function updateSubagentProgress(
  runId: string,
  update: { percent: number; status: string; detail?: string },
) {
  const entry = subagentRuns.get(runId);
  if (!entry) {
    return;
  }
  const percent = Math.max(0, Math.min(100, Math.floor(update.percent)));
  const status = update.status.trim();
  const detail = update.detail?.trim();

  entry.progress = {
    percent,
    status,
    detail,
    lastUpdate: Date.now(),
  };

  persistSubagentRuns();

  // Broadcast progress update for real-time hierarchy tracking
  emitAgentEvent({
    runId,
    stream: "lifecycle",
    sessionKey: entry.childSessionKey,
    data: {
      phase: "progress-update",
      progress: entry.progress,
    },
  });
}

export function getSubagentProgress(runId: string): SubagentProgress | null {
  const entry = subagentRuns.get(runId);
  return entry?.progress ?? null;
}

export function getSubagentRunById(runId: string): SubagentRunRecord | null {
  return subagentRuns.get(runId) ?? null;
}

export function getSubagentRunBySessionKey(sessionKey: string): SubagentRunRecord | null {
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey === sessionKey) {
      return entry;
    }
  }
  return null;
}

/**
 * Walk up the subagent spawn chain to find the root (main) session key.
 * This is the webchat session where the human is — all agent activity
 * should be visible there.
 */
export function resolveRootSessionKey(sessionKey: string): string {
  let current = sessionKey;
  const visited = new Set<string>();
  while (isSubagentSessionKey(current) && !visited.has(current)) {
    visited.add(current);
    const run = getSubagentRunBySessionKey(current);
    if (!run?.requesterSessionKey) {
      break;
    }
    current = run.requesterSessionKey;
  }
  return current;
}
