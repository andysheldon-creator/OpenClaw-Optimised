import type { HeartbeatRunResult } from "../../infra/heartbeat-wake.js";
import type { CronJob } from "../types.js";
import type { CronEvent, CronServiceState } from "./state.js";
import { computeJobNextRunAtMs, nextWakeAtMs, resolveJobPayloadTextForMain } from "./jobs.js";
import { locked } from "./locked.js";
import { ensureLoaded, persist } from "./store.js";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function armTimer(state: CronServiceState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
  if (!state.deps.cronEnabled) {
    return;
  }
  const nextAt = nextWakeAtMs(state);
  if (!nextAt) {
    return;
  }
  const delay = Math.max(nextAt - state.deps.nowMs(), 0);
  // Avoid TimeoutOverflowWarning when a job is far in the future.
  const clampedDelay = Math.min(delay, MAX_TIMEOUT_MS);
  state.timer = setTimeout(() => {
    void onTimer(state).catch((err) => {
      state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
    });
  }, clampedDelay);
}

export async function onTimer(state: CronServiceState) {
  if (state.running) {
    return;
  }
  state.running = true;
  try {
    await locked(state, async () => {
      await ensureLoaded(state, { forceReload: true });
      await runDueJobs(state);
      try {
        await persist(state);
      } catch (err) {
        // Persist failure must not prevent re-arming the timer.
        // In-memory state is authoritative; disk will be retried next tick.
        state.deps.log.error({ err: String(err) }, "cron: persist failed, will retry next tick");
      }
      // armTimer MUST always run, even if persist failed, otherwise the
      // entire cron subsystem stops permanently until a gateway restart.
      armTimer(state);
    });
  } catch (err) {
    // If locked/ensureLoaded itself fails (corrupt JSON, disk I/O error),
    // re-arm the timer so the system retries on the next tick instead of
    // dying silently.  Use a fixed retry delay (60s) since nextWakeAtMs
    // may not be computable from a corrupted store.
    state.deps.log.error({ err: String(err) }, "cron: timer tick failed, scheduling retry");
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      void onTimer(state).catch((retryErr) => {
        state.deps.log.error({ err: String(retryErr) }, "cron: retry tick also failed");
      });
    }, 60_000);
  } finally {
    state.running = false;
  }
}

/**
 * Returns the effective interval in milliseconds for sorting purposes.
 * Shorter intervals run first so fast jobs (heartbeats) aren't blocked
 * behind slow ones (multi-hour analyses) when several are due at once.
 */
function jobSortIntervalMs(job: CronJob): number {
  if (job.schedule.kind === "every") {
    return job.schedule.everyMs;
  }
  // "at" (one-shot) jobs: treat as highest priority (run immediately).
  if (job.schedule.kind === "at") {
    return 0;
  }
  // "cron" expression: use a large default so "every" jobs sort first.
  return Number.MAX_SAFE_INTEGER;
}

export async function runDueJobs(state: CronServiceState) {
  if (!state.store) {
    return;
  }
  const now = state.deps.nowMs();
  const due = state.store.jobs.filter((j) => {
    if (!j.enabled) {
      return false;
    }
    if (typeof j.state.runningAtMs === "number") {
      return false;
    }
    const next = j.state.nextRunAtMs;
    return typeof next === "number" && now >= next;
  });
  // Sort by interval ascending so fast jobs (e.g. 5-minute heartbeat)
  // always run before slow ones (e.g. 2-hour analysis) when multiple
  // jobs are due simultaneously (common after gateway restarts).
  due.sort((a, b) => jobSortIntervalMs(a) - jobSortIntervalMs(b));
  for (const job of due) {
    try {
      await executeJob(state, job, now, { forced: false });
    } catch (err) {
      // Isolate per-job failures: one job's uncaught error must not
      // prevent remaining due jobs from executing.
      state.deps.log.error(
        { err: String(err), jobId: job.id, jobName: job.name },
        "cron: executeJob threw unexpectedly, continuing with next job",
      );
      // Best-effort cleanup: clear runningAtMs so the job isn't stuck.
      job.state.runningAtMs = undefined;
      job.state.lastStatus = "error";
      job.state.lastError = `uncaught: ${String(err)}`;
    }
  }
}

export async function executeJob(
  state: CronServiceState,
  job: CronJob,
  nowMs: number,
  opts: { forced: boolean },
) {
  const startedAt = state.deps.nowMs();
  job.state.runningAtMs = startedAt;
  job.state.lastError = undefined;
  emit(state, { jobId: job.id, action: "started", runAtMs: startedAt });

  let deleted = false;

  const finish = async (status: "ok" | "error" | "skipped", err?: string, summary?: string) => {
    const endedAt = state.deps.nowMs();
    job.state.runningAtMs = undefined;
    job.state.lastRunAtMs = startedAt;
    job.state.lastStatus = status;
    job.state.lastDurationMs = Math.max(0, endedAt - startedAt);
    job.state.lastError = err;

    // Track consecutive errors for backoff.  Reset on success or skip.
    if (status === "error") {
      job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
    } else {
      job.state.consecutiveErrors = 0;
    }

    const shouldDelete =
      job.schedule.kind === "at" && status === "ok" && job.deleteAfterRun === true;

    if (!shouldDelete) {
      if (job.schedule.kind === "at" && status === "ok") {
        // One-shot job completed successfully; disable it.
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      } else if (job.enabled) {
        let nextAt = computeJobNextRunAtMs(job, endedAt);
        // Exponential backoff for consecutive errors: add increasing delay
        // on top of the normal interval.  Prevents a broken job from
        // hammering the system while still allowing recovery.
        //
        // Schedule:
        //   2 errors: +1 min,  3 errors: +2 min,  4 errors: +4 min,
        //   5 errors: +8 min,  6 errors: +16 min, ..., cap: +1 hour
        if (
          status === "error" &&
          typeof nextAt === "number" &&
          (job.state.consecutiveErrors ?? 0) >= 2
        ) {
          const backoffMs = Math.min(
            2 ** ((job.state.consecutiveErrors ?? 2) - 2) * 60_000,
            60 * 60_000, // cap: 1 hour additional delay
          );
          nextAt += backoffMs;
          state.deps.log.warn(
            {
              jobId: job.id,
              consecutiveErrors: job.state.consecutiveErrors,
              backoffMs,
              nextRunAt: new Date(nextAt).toISOString(),
            },
            "cron: applying error backoff",
          );
        }
        job.state.nextRunAtMs = nextAt;
      } else {
        job.state.nextRunAtMs = undefined;
      }
    }

    emit(state, {
      jobId: job.id,
      action: "finished",
      status,
      error: err,
      summary,
      runAtMs: startedAt,
      durationMs: job.state.lastDurationMs,
      nextRunAtMs: job.state.nextRunAtMs,
    });

    if (shouldDelete && state.store) {
      state.store.jobs = state.store.jobs.filter((j) => j.id !== job.id);
      deleted = true;
      emit(state, { jobId: job.id, action: "removed" });
    }
  };

  try {
    if (job.sessionTarget === "main") {
      const text = resolveJobPayloadTextForMain(job);
      if (!text) {
        const kind = job.payload.kind;
        await finish(
          "skipped",
          kind === "systemEvent"
            ? "main job requires non-empty systemEvent text"
            : 'main job requires payload.kind="systemEvent"',
        );
        return;
      }
      state.deps.enqueueSystemEvent(text, { agentId: job.agentId });
      if (job.wakeMode === "now" && state.deps.runHeartbeatOnce) {
        const reason = `cron:${job.id}`;
        const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
        const maxWaitMs = 2 * 60_000;
        const waitStartedAt = state.deps.nowMs();

        let heartbeatResult: HeartbeatRunResult;
        for (;;) {
          heartbeatResult = await state.deps.runHeartbeatOnce({ reason });
          if (
            heartbeatResult.status !== "skipped" ||
            heartbeatResult.reason !== "requests-in-flight"
          ) {
            break;
          }
          if (state.deps.nowMs() - waitStartedAt > maxWaitMs) {
            heartbeatResult = {
              status: "skipped",
              reason: "timeout waiting for main lane to become idle",
            };
            break;
          }
          await delay(250);
        }

        if (heartbeatResult.status === "ran") {
          await finish("ok", undefined, text);
        } else if (heartbeatResult.status === "skipped") {
          await finish("skipped", heartbeatResult.reason, text);
        } else {
          await finish("error", heartbeatResult.reason, text);
        }
      } else {
        // wakeMode is "next-heartbeat" or runHeartbeatOnce not available
        state.deps.requestHeartbeatNow({ reason: `cron:${job.id}` });
        await finish("ok", undefined, text);
      }
      return;
    }

    if (job.payload.kind !== "agentTurn") {
      await finish("skipped", "isolated job requires payload.kind=agentTurn");
      return;
    }

    const res = await state.deps.runIsolatedAgentJob({
      job,
      message: job.payload.message,
    });

    // Post a short summary back to the main session so the user sees
    // the cron result without opening the isolated session.
    const summaryText = res.summary?.trim();
    const deliveryMode = job.delivery?.mode ?? "announce";
    if (summaryText && deliveryMode !== "none") {
      const prefix = "Cron";
      const label =
        res.status === "error" ? `${prefix} (error): ${summaryText}` : `${prefix}: ${summaryText}`;
      state.deps.enqueueSystemEvent(label, { agentId: job.agentId });
      if (job.wakeMode === "now") {
        state.deps.requestHeartbeatNow({ reason: `cron:${job.id}` });
      }
    }

    if (res.status === "ok") {
      await finish("ok", undefined, res.summary);
    } else if (res.status === "skipped") {
      await finish("skipped", undefined, res.summary);
    } else {
      await finish("error", res.error ?? "cron job failed", res.summary);
    }
  } catch (err) {
    await finish("error", String(err));
  } finally {
    job.updatedAtMs = nowMs;
    if (!opts.forced && job.enabled && !deleted && job.state.lastStatus !== "error") {
      // Keep nextRunAtMs in sync in case the schedule advanced during a long run.
      // Skip for errored jobs: finish() may have applied backoff that we must preserve.
      job.state.nextRunAtMs = computeJobNextRunAtMs(job, state.deps.nowMs());
    }
  }
}

export function wake(
  state: CronServiceState,
  opts: { mode: "now" | "next-heartbeat"; text: string },
) {
  const text = opts.text.trim();
  if (!text) {
    return { ok: false } as const;
  }
  state.deps.enqueueSystemEvent(text);
  if (opts.mode === "now") {
    state.deps.requestHeartbeatNow({ reason: "wake" });
  }
  return { ok: true } as const;
}

export function stopTimer(state: CronServiceState) {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = null;
}

export function emit(state: CronServiceState, evt: CronEvent) {
  try {
    state.deps.onEvent?.(evt);
  } catch {
    /* ignore */
  }
}
