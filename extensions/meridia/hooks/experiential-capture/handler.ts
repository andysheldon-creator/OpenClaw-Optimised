import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import path from "node:path";
import type {
  MeridiaToolResultContext,
  MeridiaTraceEvent,
  CaptureDecision,
} from "../../src/meridia/types.js";
import { collectArtifacts } from "../../src/meridia/artifacts/collector.js";
import { classifyMemoryType } from "../../src/meridia/classifier.js";
import { resolveMeridiaPluginConfig } from "../../src/meridia/config.js";
import { extractTextForAnalysis, detectContentSignals } from "../../src/meridia/content-signals.js";
import { createBackend } from "../../src/meridia/db/index.js";
import { evaluateHeuristic, evaluateWithLlm } from "../../src/meridia/evaluate.js";
import {
  type HookEvent,
  asObject,
  resolveHookConfig,
  readNumber,
  readPositiveNumber,
  readString,
  readBoolean,
  safeFileKey,
} from "../../src/meridia/event.js";
// V2 components
import { normalizeToolResult } from "../../src/meridia/event/normalizer.js";
import {
  checkGates,
  ensureBuffer,
  pruneOldEntries,
  recordCapture,
  recordEvaluation,
  type SessionBuffer,
  type GatesConfig,
} from "../../src/meridia/gates/budget.js";
import { buildExperienceKit, kitToLegacyRecord } from "../../src/meridia/kit/builder.js";
import { resolveMeridiaDir } from "../../src/meridia/paths.js";
import { extractPhenomenology } from "../../src/meridia/phenomenology/extractor.js";
import { sanitizeForPersistence } from "../../src/meridia/sanitize/redact.js";
import {
  appendJsonl,
  resolveTraceJsonlPath,
  writeJson,
  readJsonIfExists,
} from "../../src/meridia/storage.js";

// Local helpers removed — shared via event.js imports

function resolveBufferPath(
  meridiaDir: string,
  sessionId?: string,
  sessionKey?: string,
  eventSessionKey?: string,
) {
  const bufferKey = safeFileKey(sessionId ?? sessionKey ?? eventSessionKey ?? "unknown");
  return path.join(meridiaDir, "buffers", `${bufferKey}.json`);
}

async function loadBuffer(
  bufferPath: string,
  sessionId?: string,
  sessionKey?: string,
): Promise<SessionBuffer> {
  const existing = await readJsonIfExists<SessionBuffer>(bufferPath);
  return ensureBuffer(existing ?? { sessionId, sessionKey });
}

const handler = async (event: HookEvent): Promise<void> => {
  if (event.type !== "agent" || event.action !== "tool:result") {
    return;
  }

  const context = asObject(event.context) ?? {};
  const cfg = (context.cfg as OpenClawConfig | undefined) ?? undefined;
  const hookCfg = resolveHookConfig(cfg, "experiential-capture");
  if (hookCfg?.enabled !== true) {
    return;
  }

  // ── Normalize event via Component 1 ───────────────────────────────────
  const meridiaEvent = normalizeToolResult(event);
  if (!meridiaEvent) return;

  const toolName = meridiaEvent.tool?.name ?? "";
  const toolCallId = meridiaEvent.tool?.callId ?? "";
  const sessionId = meridiaEvent.session?.id;
  const sessionKey = meridiaEvent.session?.key;
  const runId = meridiaEvent.session?.runId;
  const meta = meridiaEvent.tool?.meta;
  const isError = meridiaEvent.tool?.isError ?? false;
  const payload = meridiaEvent.payload as { args?: unknown; result?: unknown } | undefined;

  const meridiaDir = resolveMeridiaDir(cfg, "experiential-capture");
  const tracePath = resolveTraceJsonlPath({ meridiaDir, date: event.timestamp });
  const bufferPath = resolveBufferPath(meridiaDir, sessionId, sessionKey, event.sessionKey);
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const writeTraceJsonl = resolveMeridiaPluginConfig(cfg).debug.writeTraceJsonl;

  // ── Read config values (positive-only to prevent degenerate thresholds) ─
  const minThreshold = readPositiveNumber(
    hookCfg,
    ["min_significance_threshold", "minSignificanceThreshold", "threshold"],
    0.6,
  );
  const maxPerHour = readPositiveNumber(
    hookCfg,
    ["max_captures_per_hour", "maxCapturesPerHour"],
    10,
  );
  const minIntervalMs = readPositiveNumber(
    hookCfg,
    ["min_interval_ms", "minIntervalMs"],
    5 * 60 * 1000,
  );
  const evaluationTimeoutMs = readPositiveNumber(
    hookCfg,
    ["evaluation_timeout_ms", "evaluationTimeoutMs"],
    3500,
  );
  const evaluationModel =
    readString(hookCfg, ["evaluation_model", "evaluationModel", "model"]) ?? "";

  // Phenomenology config (V2)
  const phenomenologyEnabled = readBoolean(
    hookCfg,
    ["phenomenology_enabled", "phenomenologyEnabled"],
    true,
  );
  const phenomenologyModel = readString(hookCfg, [
    "phenomenology_model",
    "phenomenologyModel",
    "evaluation_model",
    "evaluationModel",
  ]);

  const gatesConfig: GatesConfig = { maxCapturesPerHour: maxPerHour, minIntervalMs };

  // Build legacy context for evaluate.ts
  const ctx: MeridiaToolResultContext = {
    session: { id: sessionId, key: sessionKey, runId },
    tool: { name: toolName, callId: toolCallId, meta, isError },
    args: payload?.args,
    result: payload?.result,
  };

  // Detect content signals for classification
  const analysisText = extractTextForAnalysis(ctx);
  const contentSignals = detectContentSignals(analysisText);

  // ── Load and update buffer ────────────────────────────────────────────
  let buffer = await loadBuffer(bufferPath, sessionId, sessionKey);
  buffer = pruneOldEntries(buffer, nowMs);
  buffer.toolResultsSeen += 1;
  buffer.lastSeenAt = now;
  buffer.updatedAt = now;

  // ── Gate check via Component 2 ────────────────────────────────────────
  const gateResult = checkGates(buffer, gatesConfig);

  // ── Pass 1: Significance evaluation (existing heuristic + optional LLM) ─
  let evaluation = evaluateHeuristic(ctx);
  if (cfg && evaluationModel) {
    try {
      evaluation = await evaluateWithLlm({
        cfg,
        ctx,
        modelRef: evaluationModel,
        timeoutMs: evaluationTimeoutMs,
      });
    } catch (err) {
      evaluation = {
        ...evaluation,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const shouldCapture = gateResult.allowed && evaluation.score >= minThreshold;

  // Record evaluation in buffer
  buffer = recordEvaluation(buffer, {
    toolName,
    score: evaluation.score,
    recommendation: shouldCapture ? "capture" : "skip",
    reason: evaluation.reason,
  });

  let recordId: string | undefined;
  if (shouldCapture) {
    recordId = meridiaEvent.id;

    // Classify memory type using content signals
    const classification = classifyMemoryType({
      ctx,
      signals: contentSignals,
      kind: "tool_result",
    });

    // ── Pass 2: Phenomenology extraction (V2 Component 4) ─────────────
    const phenomenology = phenomenologyEnabled
      ? await extractPhenomenology(meridiaEvent, evaluation.score, evaluation.reason, cfg, {
          llmEnabled: Boolean(phenomenologyModel),
          modelRef: phenomenologyModel,
        })
      : undefined;

    // ── Artifact collection (V2 Component 5) ──────────────────────────
    const artifacts = collectArtifacts(meridiaEvent);

    // ── Build CaptureDecision (V2) ────────────────────────────────────
    const captureDecision: CaptureDecision = {
      shouldCapture: true,
      significance: evaluation.score,
      threshold: minThreshold,
      mode: "full",
      reason: evaluation.reason,
    };

    // ── Build ExperienceKit via Component 6 ───────────────────────────
    const kit = buildExperienceKit({
      event: meridiaEvent,
      decision: captureDecision,
      phenomenology,
      summary: evaluation.reason,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    });

    // ── Sanitize before persistence (Component 12) ────────────────────
    if (kit.raw) {
      kit.raw = sanitizeForPersistence(kit.raw);
    }

    // ── Convert to legacy record for backward-compatible SQLite insert ─
    const record = kitToLegacyRecord(kit);

    // Enrich with memory classification
    record.memoryType = classification.memoryType;
    record.classification = {
      confidence: classification.confidence,
      reasons: classification.reasons,
    };

    try {
      const backend = createBackend({ cfg, hookKey: "experiential-capture" });
      await backend.insertExperienceRecord(record);
    } catch {
      // ignore
    }

    // Update buffer with capture info
    buffer = recordCapture(buffer, { toolName, score: evaluation.score, recordId });
  }

  // ── Trace event ───────────────────────────────────────────────────────
  const traceEvent: MeridiaTraceEvent = {
    id: crypto.randomUUID(),
    ts: now,
    kind: "tool_result_eval",
    session: { id: sessionId, key: sessionKey, runId },
    tool: { name: toolName, callId: toolCallId, meta, isError },
    decision: {
      decision: shouldCapture
        ? "capture"
        : !gateResult.allowed
          ? "skip"
          : evaluation.error
            ? "error"
            : "skip",
      score: evaluation.score,
      threshold: minThreshold,
      limited: !gateResult.allowed
        ? { reason: gateResult.reason ?? "min_interval", detail: gateResult.detail }
        : undefined,
      evaluation,
      recordId,
      error: evaluation.error,
    },
  };
  try {
    const backend = createBackend({ cfg, hookKey: "experiential-capture" });
    await backend.insertTraceEvent(traceEvent);
  } catch {
    // ignore
  }
  if (writeTraceJsonl) {
    await appendJsonl(tracePath, traceEvent);
  }
  await writeJson(bufferPath, buffer);
};

export default handler;
