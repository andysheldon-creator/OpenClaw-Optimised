import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import path from "node:path";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "../../src/meridia/types.js";
import { resolveMeridiaPluginConfig } from "../../src/meridia/config.js";
import { createBackend } from "../../src/meridia/db/index.js";
import {
  type HookEvent,
  asObject,
  resolveHookConfig,
  safeFileKey,
  nowIso,
  resolveSessionIdFromEntry,
} from "../../src/meridia/event.js";
import { resolveMeridiaDir, dateKeyUtc } from "../../src/meridia/paths.js";
import {
  appendJsonl,
  readJsonIfExists,
  resolveTraceJsonlPath,
  writeJson,
} from "../../src/meridia/storage.js";

type BufferV1 = {
  version: 1;
  sessionId?: string;
  sessionKey?: string;
  createdAt: string;
  updatedAt: string;
  toolResultsSeen: number;
  captured: number;
  lastSeenAt?: string;
  lastCapturedAt?: string;
  recentCaptures: Array<{ ts: string; toolName: string; score: number; recordId: string }>;
  recentEvaluations: Array<{
    ts: string;
    toolName: string;
    score: number;
    recommendation: "capture" | "skip";
    reason?: string;
  }>;
  lastError?: { ts: string; toolName: string; message: string };
};

const handler = async (event: HookEvent): Promise<void> => {
  if (event.type !== "command") {
    return;
  }
  if (event.action !== "new" && event.action !== "stop") {
    return;
  }

  const context = asObject(event.context) ?? {};
  const cfg = (context.cfg as OpenClawConfig | undefined) ?? undefined;
  const hookCfg = resolveHookConfig(cfg, "session-end");
  if (hookCfg?.enabled !== true) {
    return;
  }

  const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : event.sessionKey;
  const sessionId =
    (typeof context.sessionId === "string" && context.sessionId.trim()
      ? context.sessionId.trim()
      : undefined) ??
    resolveSessionIdFromEntry(context.previousSessionEntry) ??
    resolveSessionIdFromEntry(context.sessionEntry);
  const runId = typeof context.runId === "string" ? context.runId : undefined;

  const meridiaDir = resolveMeridiaDir(cfg, "session-end");
  const dateKey = dateKeyUtc(event.timestamp);
  const ts = nowIso();
  const tracePath = resolveTraceJsonlPath({ meridiaDir, date: event.timestamp });
  const writeTraceJsonl = resolveMeridiaPluginConfig(cfg).debug.writeTraceJsonl;

  const bufferKey = safeFileKey(sessionId ?? sessionKey ?? event.sessionKey ?? "unknown");
  const bufferPath = path.join(meridiaDir, "buffers", `${bufferKey}.json`);
  const buffer = await readJsonIfExists<BufferV1>(bufferPath);

  const summaryDir = path.join(meridiaDir, "sessions", dateKey);
  const summaryPath = path.join(
    summaryDir,
    `${ts.replaceAll(":", "-")}-${sessionId ?? "unknown"}.json`,
  );
  const summary = {
    ts,
    action: event.action,
    sessionId,
    sessionKey,
    buffer,
  };
  await writeJson(summaryPath, summary);

  const recordId = crypto.randomUUID();
  const record: MeridiaExperienceRecord = {
    id: recordId,
    ts,
    kind: "session_end",
    session: { id: sessionId, key: sessionKey, runId },
    tool: {
      name: `command:${event.action}`,
      callId: `session-${event.action}-${recordId.slice(0, 8)}`,
      isError: false,
    },
    capture: {
      score: 1,
      evaluation: {
        kind: "heuristic",
        score: 1,
        reason: "session_end_snapshot",
      },
    },
    content: {
      summary: `Session ${event.action} snapshot`,
    },
    data: { summary },
  };

  const traceEvent: MeridiaTraceEvent = {
    id: crypto.randomUUID(),
    ts,
    kind: "session_end_snapshot",
    session: { id: sessionId, key: sessionKey, runId },
    paths: { summaryPath },
    decision: { decision: "capture", recordId },
  };

  try {
    const backend = createBackend({ cfg, hookKey: "session-end" });
    backend.insertExperienceRecord(record);
    backend.insertTraceEvent(traceEvent);
  } catch {
    // ignore
  }

  if (writeTraceJsonl) {
    await appendJsonl(tracePath, traceEvent);
  }
};

export default handler;
