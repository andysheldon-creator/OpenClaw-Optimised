import type { CliDeps } from "../cli/deps.js";
import type { CronJob } from "../cron/types.js";
import { listAgentIds, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import {
  resolveAgentMainSessionKey,
  resolveStorePath,
  updateSessionStore,
} from "../config/sessions.js";
import { runCronIsolatedAgentTurn } from "../cron/isolated-agent.js";
import { appendCronRunLog, resolveCronRunLogPath } from "../cron/run-log.js";
import { CronService } from "../cron/service.js";
import { isCronRunSessionKey } from "../cron/service/sweeper.js";
import { resolveCronStorePath } from "../cron/store.js";
import { runHeartbeatOnce } from "../infra/heartbeat-runner.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { getChildLogger } from "../logging.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { defaultRuntime } from "../runtime.js";

const SWEEP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const STALE_THRESHOLD_MS = 10 * 60_000; // 10 minutes

export type GatewayCronState = {
  cron: CronService;
  storePath: string;
  cronEnabled: boolean;
  /** Stop the background :run: session sweeper. */
  stopSweeper?: () => void;
};

export function buildGatewayCronService(params: {
  cfg: ReturnType<typeof loadConfig>;
  deps: CliDeps;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
}): GatewayCronState {
  const cronLogger = getChildLogger({ module: "cron" });
  const storePath = resolveCronStorePath(params.cfg.cron?.store);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;

  const resolveCronAgent = (requested?: string | null) => {
    const runtimeConfig = loadConfig();
    const normalized =
      typeof requested === "string" && requested.trim() ? normalizeAgentId(requested) : undefined;
    const hasAgent =
      normalized !== undefined &&
      Array.isArray(runtimeConfig.agents?.list) &&
      runtimeConfig.agents.list.some(
        (entry) =>
          entry && typeof entry.id === "string" && normalizeAgentId(entry.id) === normalized,
      );
    const agentId = hasAgent ? normalized : resolveDefaultAgentId(runtimeConfig);
    return { agentId, cfg: runtimeConfig };
  };

  const cron = new CronService({
    storePath,
    cronEnabled,
    enqueueSystemEvent: (text, opts) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(opts?.agentId);
      const sessionKey = resolveAgentMainSessionKey({
        cfg: runtimeConfig,
        agentId,
      });
      enqueueSystemEvent(text, { sessionKey });
    },
    requestHeartbeatNow,
    runHeartbeatOnce: async (opts) => {
      const runtimeConfig = loadConfig();
      return await runHeartbeatOnce({
        cfg: runtimeConfig,
        reason: opts?.reason,
        deps: { ...params.deps, runtime: defaultRuntime },
      });
    },
    runIsolatedAgentJob: async ({ job, message }) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      return await runCronIsolatedAgentTurn({
        cfg: runtimeConfig,
        deps: params.deps,
        job,
        message,
        agentId,
        sessionKey: `cron:${job.id}`,
        lane: "cron",
      });
    },
    cleanupCronRunSession: async (sessionKey: string, job: CronJob) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      const sessStorePath = resolveStorePath(runtimeConfig.session?.store, { agentId });
      await updateSessionStore(sessStorePath, (store) => {
        delete store[sessionKey];
      });
    },
    log: getChildLogger({ module: "cron", storePath }),
    onEvent: (evt) => {
      params.broadcast("cron", evt, { dropIfSlow: true });
      if (evt.action === "finished") {
        const logPath = resolveCronRunLogPath({
          storePath,
          jobId: evt.jobId,
        });
        void appendCronRunLog(logPath, {
          ts: Date.now(),
          jobId: evt.jobId,
          action: "finished",
          status: evt.status,
          error: evt.error,
          summary: evt.summary,
          sessionId: evt.sessionId,
          sessionKey: evt.sessionKey,
          runAtMs: evt.runAtMs,
          durationMs: evt.durationMs,
          nextRunAtMs: evt.nextRunAtMs,
        }).catch((err) => {
          cronLogger.warn({ err: String(err), logPath }, "cron: run log append failed");
        });
      }
    },
  });

  // Start a background sweeper for stale :run: session entries.
  let stopSweeper: (() => void) | undefined;
  if (cronEnabled) {
    const sweepTimer = setInterval(() => {
      void sweepStaleCronRunSessions({
        cfg: loadConfig(),
        log: cronLogger,
      }).catch(() => {});
    }, SWEEP_INTERVAL_MS);
    sweepTimer.unref?.();
    stopSweeper = () => clearInterval(sweepTimer);
  }

  return { cron, storePath, cronEnabled, stopSweeper };
}

/**
 * Sweep stale `:run:` session entries from all agent session stores.
 * Deletes entries whose `updatedAt` is older than the stale threshold.
 */
async function sweepStaleCronRunSessions(params: {
  cfg: ReturnType<typeof loadConfig>;
  log: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}): Promise<number> {
  const { cfg, log } = params;
  const agentIds = listAgentIds(cfg);
  const now = Date.now();
  let removed = 0;

  for (const agentId of agentIds) {
    const sessStorePath = resolveStorePath(cfg.session?.store, { agentId });
    try {
      await updateSessionStore(sessStorePath, (store) => {
        for (const key of Object.keys(store)) {
          if (!isCronRunSessionKey(key)) {
            continue;
          }
          const entry = store[key];
          const updatedAt = entry?.updatedAt ?? 0;
          if (now - updatedAt > STALE_THRESHOLD_MS) {
            delete store[key];
            removed++;
          }
        }
      });
    } catch (err) {
      log.warn({ err: String(err), agentId }, "cron: sweeper failed to update session store");
    }
  }

  if (removed > 0) {
    log.info({ removed, agentIds }, "cron: swept stale :run: session entries");
  }
  return removed;
}
