import crypto from "node:crypto";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { NeuronWaveTraceEntry, NeuronWavesConfig } from "./types.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveStorePath,
} from "../config/sessions.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { upsertBacklogItem } from "./backlog.js";
import { resolveNeuronWavesConfigFromEnv } from "./config.js";
import { appendLedgerEvent, appendPolicyHistory, writeSnapshot } from "./learning/index.js";
import { loadNeuronWavesPolicy, saveNeuronWavesPolicy } from "./policy/index.js";
import { tryPostGhPrComment } from "./reporters/github-gh.js";
import { appendNeuronWaveTrace, loadNeuronWavesState, saveNeuronWavesState } from "./state.js";

const log = createSubsystemLogger("neuronwaves");

export type NeuronWavesRunner = {
  stop: () => void;
  updateConfig: (cfg: OpenClawConfig) => void;
};

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * Math.max(0, maxExclusive));
}

function computeNextRunAt(nowMs: number, cfg: NeuronWavesConfig) {
  const jitter = cfg.jitterMs > 0 ? randInt(cfg.jitterMs) : 0;
  return nowMs + cfg.baseIntervalMs + jitter;
}

function resolveLastActivityAtMs(cfg: OpenClawConfig, agentId: string): number {
  // Best-effort heuristic: use session store updatedAt for main session.
  const sessionCfg = cfg.session;
  const storePath = resolveStorePath(sessionCfg?.store, { agentId });
  const store = loadSessionStore(storePath);
  const mainKey = resolveAgentMainSessionKey({ cfg, agentId });
  const entry = store[mainKey];
  return entry?.updatedAt ?? 0;
}

export function startNeuronWavesRunner(opts: { cfg: OpenClawConfig }): NeuronWavesRunner {
  const state = {
    cfg: opts.cfg,
    timer: null as NodeJS.Timeout | null,
    stopped: false,
  };

  const schedule = (delayMs: number) => {
    if (state.stopped) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => void tick(), Math.max(1_000, delayMs));
    state.timer.unref?.();
  };

  const tick = async () => {
    const nwCfg = resolveNeuronWavesConfigFromEnv();
    const agentId = resolveDefaultAgentId(state.cfg);
    const workspaceDir = resolveAgentWorkspaceDir(state.cfg, agentId);

    if (!nwCfg.enabled) {
      schedule(60_000);
      return;
    }

    const nowMs = Date.now();
    const lastActivityAtMs = resolveLastActivityAtMs(state.cfg, agentId);
    const inactivityMs = lastActivityAtMs ? nowMs - lastActivityAtMs : Number.POSITIVE_INFINITY;

    const persisted = await loadNeuronWavesState(workspaceDir);
    const due = persisted.nextRunAtMs <= 0 || nowMs >= persisted.nextRunAtMs;

    // single-flight guard
    if (
      persisted.running &&
      nowMs - persisted.running.startedAtMs < Math.max(30_000, nwCfg.maxWaveMs)
    ) {
      schedule(30_000);
      return;
    }

    if (inactivityMs < nwCfg.inactivityMs) {
      // user active recently; check again later
      const nextDelay = Math.min(5 * 60_000, nwCfg.baseIntervalMs);
      await appendNeuronWaveTrace(workspaceDir, {
        atMs: nowMs,
        agentId,
        status: "skipped",
        reason: "active",
        inactivityMs,
        nextRunAtMs: persisted.nextRunAtMs,
      } satisfies NeuronWaveTraceEntry);
      schedule(nextDelay);
      return;
    }

    if (!due) {
      schedule(Math.max(5_000, persisted.nextRunAtMs - nowMs));
      return;
    }

    const runId = crypto.randomUUID();
    const nextRunAtMs = computeNextRunAt(nowMs, nwCfg);
    await saveNeuronWavesState(workspaceDir, {
      nextRunAtMs,
      running: { startedAtMs: nowMs, id: runId },
    });

    await appendLedgerEvent({
      workspaceDir,
      kind: "wave.started",
      payload: {
        runId,
        inactivityMs,
        nextRunAtMs,
      },
      nowMs,
    });

    // MVP wave: record a trace + optionally post a PR comment.
    // Also enqueue a backlog item and schedule an immediate nudge (via next tick)
    // when the user is inactive.
    const backlogItem = await upsertBacklogItem(workspaceDir, {
      id: `nw:${runId}`,
      createdAtMs: nowMs,
      title: "NeuronWaves: implement planner/actions (next)",
      nextStep: "Add backlog execution + safe action runner; ingest outcomes into CoreMemories.",
      status: "open",
      priority: "medium",
      context: nwCfg.pr ? { pr: nwCfg.pr } : undefined,
      lastNudgedAtMs: nowMs,
    });

    await appendLedgerEvent({
      workspaceDir,
      kind: "action.planned",
      payload: {
        runId,
        action: { kind: "noop", summary: `Backlog item created: ${backlogItem.id}` },
      },
      nowMs,
    });

    const trace: NeuronWaveTraceEntry = {
      atMs: nowMs,
      agentId,
      status: "ran",
      reason: "due",
      inactivityMs,
      nextRunAtMs,
      notes:
        "NeuronWave tick ran (MVP). Recorded trace + backlog. Future versions will add planner + safe execution; no preemption.",
      decisions: [
        {
          title: "MVP tick",
          why: "NeuronWaves enabled, user inactive, and nextRunAt reached.",
          risk: "low",
          action: { kind: "noop", reason: `Backlog item created: ${backlogItem.id}` },
        },
      ],
    };

    await appendNeuronWaveTrace(workspaceDir, trace);

    await appendLedgerEvent({
      workspaceDir,
      kind: "action.result",
      payload: { runId, ok: true, summary: "MVP tick completed" },
      nowMs,
    });

    // Auto-policy learning hook (minimal v1): if devLevel=3 and user chose unlimited,
    // allow the system to widen caps based on its own experience. This is intentionally
    // conservative for now: it only records snapshots and history when changes happen.
    const policy = await loadNeuronWavesPolicy(workspaceDir);
    if (policy.mode === "dev" && (policy.devLevel ?? 1) === 3) {
      // Example: if limits are undefined-like (shouldn't happen), normalize them.
      const normalized = {
        ...policy,
        limits: {
          outboundPerHour: policy.limits.outboundPerHour ?? null,
          spendUsdPerDay: policy.limits.spendUsdPerDay ?? null,
        },
      };
      if (JSON.stringify(normalized) !== JSON.stringify(policy)) {
        const evt = await appendLedgerEvent({
          workspaceDir,
          kind: "policy.updated",
          payload: { runId, reason: "normalize-limits" },
          nowMs,
        });
        await appendPolicyHistory(workspaceDir, {
          atMs: nowMs,
          reason: "auto:normalize-limits",
          ledgerEventId: evt.id,
          from: policy,
          to: normalized,
        });
        await writeSnapshot(workspaceDir, { atMs: nowMs, kind: "policy", data: normalized });
        await saveNeuronWavesPolicy(workspaceDir, normalized);
      }
    }

    if (nwCfg.postPrComments && nwCfg.pr) {
      const body =
        "NeuronWave tick (MVP)\n\n" +
        `- agent: ${agentId}\n` +
        `- inactivity: ${Math.round(inactivityMs / 1000)}s\n` +
        `- next run: ${new Date(nextRunAtMs).toISOString()}\n` +
        "\nNext: implement planner + safe actions + CoreMemories ingestion.";

      const res = await tryPostGhPrComment({
        repo: nwCfg.pr.repo,
        prNumber: nwCfg.pr.number,
        body,
      });
      if (!res.ok) {
        log.debug(`pr comment skipped: ${res.reason}`);
      }
    }

    // release lock
    await saveNeuronWavesState(workspaceDir, { nextRunAtMs });

    // immediate nudge: schedule an extra near-immediate tick
    schedule(2_000);
  };

  const updateConfig = (cfg: OpenClawConfig) => {
    state.cfg = cfg;
  };

  // start quickly; tick will decide whether to run
  schedule(5_000);

  const stop = () => {
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  };

  return { stop, updateConfig };
}
