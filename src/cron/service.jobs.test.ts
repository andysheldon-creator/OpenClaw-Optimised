import { describe, expect, it } from "vitest";
import type { CronServiceState } from "./service/state.js";
import type { CronJob, CronJobPatch } from "./types.js";
import { applyJobPatch, recomputeNextRuns } from "./service/jobs.js";

function makeFakeState(jobs: CronJob[], nowMs: number): CronServiceState {
  return {
    deps: {
      nowMs: () => nowMs,
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      storePath: "/tmp/test-cron.json",
      cronEnabled: true,
      enqueueSystemEvent: () => {},
      requestHeartbeatNow: () => {},
      runIsolatedAgentJob: async () => ({ status: "ok" }),
    },
    store: { version: 1, jobs },
    timer: null,
    running: false,
    op: Promise.resolve(),
    warnedDisabled: false,
    storeLoadedAtMs: nowMs,
    storeFileMtimeMs: null,
  };
}

function makeEveryJob(opts: {
  id: string;
  everyMs: number;
  anchorMs?: number;
  nextRunAtMs?: number;
  enabled?: boolean;
}): CronJob {
  const now = Date.now();
  return {
    id: opts.id,
    name: opts.id,
    enabled: opts.enabled ?? true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: {
      kind: "every",
      everyMs: opts.everyMs,
      ...(opts.anchorMs != null ? { anchorMs: opts.anchorMs } : {}),
    },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "ping" },
    state: {
      ...(opts.nextRunAtMs != null ? { nextRunAtMs: opts.nextRunAtMs } : {}),
    },
  };
}

describe("runDueJobs - priority sorting", () => {
  it("runs shorter-interval jobs before longer-interval jobs", async () => {
    const executionOrder: string[] = [];
    const now = 1_000_000;

    // Create a state where the isolated job runner records execution order.
    const state = makeFakeState([], now);
    state.deps.onEvent = (evt) => {
      if (evt.action === "started") {
        executionOrder.push(evt.jobId);
      }
    };
    // Make runIsolatedAgentJob record order and return immediately.
    state.deps.runIsolatedAgentJob = async ({ job }) => {
      return { status: "ok", summary: job.name };
    };

    // 2-hour analysis (should run SECOND)
    const slowJob = makeEveryJob({
      id: "slow-2h",
      everyMs: 2 * 60 * 60 * 1000,
      nextRunAtMs: now - 100,
    });
    // 5-minute heartbeat (should run FIRST)
    const fastJob = makeEveryJob({ id: "fast-5m", everyMs: 5 * 60 * 1000, nextRunAtMs: now - 100 });

    // Insert slow job first to ensure sort is doing the work (not insertion order)
    state.store = { version: 1, jobs: [slowJob, fastJob] };

    // Make both jobs isolated so executeJob calls runIsolatedAgentJob
    slowJob.sessionTarget = "isolated";
    slowJob.payload = { kind: "agentTurn", message: "analyze" };
    fastJob.sessionTarget = "isolated";
    fastJob.payload = { kind: "agentTurn", message: "heartbeat" };

    const { runDueJobs } = await import("./service/timer.js");
    await runDueJobs(state);

    expect(executionOrder).toEqual(["fast-5m", "slow-2h"]);
  });
});

describe("runDueJobs - failure isolation", () => {
  it("continues executing remaining jobs when one job throws", async () => {
    const executionOrder: string[] = [];
    const now = 1_000_000;

    const state = makeFakeState([], now);
    state.deps.onEvent = (evt) => {
      if (evt.action === "started") {
        executionOrder.push(evt.jobId);
      }
    };
    state.deps.runIsolatedAgentJob = async ({ job }) => {
      if (job.id === "boom") {
        throw new Error("agent crashed");
      }
      return { status: "ok", summary: job.name };
    };

    const jobA = makeEveryJob({ id: "ok-first", everyMs: 60_000, nextRunAtMs: now - 100 });
    const jobBoom = makeEveryJob({ id: "boom", everyMs: 120_000, nextRunAtMs: now - 100 });
    const jobC = makeEveryJob({ id: "ok-after", everyMs: 180_000, nextRunAtMs: now - 100 });
    // Make all isolated
    for (const j of [jobA, jobBoom, jobC]) {
      j.sessionTarget = "isolated";
      j.payload = { kind: "agentTurn", message: "test" };
    }
    state.store = { version: 1, jobs: [jobA, jobBoom, jobC] };

    const { runDueJobs } = await import("./service/timer.js");
    await runDueJobs(state);

    // All three should have been attempted (not just the first two)
    expect(executionOrder).toEqual(["ok-first", "boom", "ok-after"]);
    // The failed job should have its state cleaned up by executeJob's internal catch
    expect(jobBoom.state.runningAtMs).toBeUndefined();
    expect(jobBoom.state.lastStatus).toBe("error");
    expect(jobBoom.state.lastError).toContain("agent crashed");
  });
});

describe("executeJob - consecutive error tracking", () => {
  it("increments consecutiveErrors on failure and resets on success", async () => {
    const now = 1_000_000;
    const state = makeFakeState([], now);
    let callCount = 0;
    state.deps.runIsolatedAgentJob = async () => {
      callCount++;
      if (callCount <= 2) {
        return { status: "error", error: "model unavailable" };
      }
      return { status: "ok", summary: "done" };
    };

    const job = makeEveryJob({ id: "flaky", everyMs: 300_000, nextRunAtMs: now - 100 });
    job.sessionTarget = "isolated";
    job.payload = { kind: "agentTurn", message: "test" };
    state.store = { version: 1, jobs: [job] };

    const { executeJob } = await import("./service/timer.js");

    // First failure
    await executeJob(state, job, now, { forced: false });
    expect(job.state.consecutiveErrors).toBe(1);

    // Second failure
    await executeJob(state, job, now, { forced: false });
    expect(job.state.consecutiveErrors).toBe(2);

    // Success resets
    await executeJob(state, job, now, { forced: false });
    expect(job.state.consecutiveErrors).toBe(0);
  });

  it("applies exponential backoff after 2+ consecutive errors", async () => {
    const now = 1_000_000;
    const interval = 300_000; // 5 minutes
    const state = makeFakeState([], now);
    state.deps.runIsolatedAgentJob = async () => {
      return { status: "error", error: "always fails" };
    };

    const job = makeEveryJob({ id: "broken", everyMs: interval, nextRunAtMs: now - 100 });
    job.sessionTarget = "isolated";
    job.payload = { kind: "agentTurn", message: "test" };
    state.store = { version: 1, jobs: [job] };

    const { executeJob } = await import("./service/timer.js");

    // First error: no backoff (consecutiveErrors becomes 1)
    await executeJob(state, job, now, { forced: false });
    const afterFirst = job.state.nextRunAtMs;
    expect(job.state.consecutiveErrors).toBe(1);

    // Second error: backoff kicks in (consecutiveErrors becomes 2)
    await executeJob(state, job, now, { forced: false });
    const afterSecond = job.state.nextRunAtMs;
    expect(job.state.consecutiveErrors).toBe(2);
    // Backoff should push nextRunAtMs further than the first error
    expect(afterSecond).toBeGreaterThan(afterFirst!);
  });
});

describe("recomputeNextRuns - stuck detection", () => {
  it("clears stuck marker based on job timeout, not hardcoded 2 hours", () => {
    const now = 1_000_000;
    const job = makeEveryJob({ id: "stuck", everyMs: 300_000 });
    job.sessionTarget = "isolated";
    job.payload = { kind: "agentTurn", message: "test", timeoutSeconds: 300 }; // 5-min timeout
    // Job started 31 minutes ago (> DEFAULT_STUCK_RUN_MS of 30min)
    job.state.runningAtMs = now - 31 * 60 * 1000;

    const state = makeFakeState([job], now);
    recomputeNextRuns(state);

    // Should be cleared (31min > 30min default)
    expect(job.state.runningAtMs).toBeUndefined();
  });

  it("uses 2x job timeout when it exceeds default stuck threshold", () => {
    const now = 1_000_000;
    const job = makeEveryJob({ id: "long-job", everyMs: 300_000 });
    job.sessionTarget = "isolated";
    job.payload = { kind: "agentTurn", message: "test", timeoutSeconds: 1800 }; // 30-min timeout
    // Job started 50 minutes ago (< 2 × 30min = 60min)
    job.state.runningAtMs = now - 50 * 60 * 1000;

    const state = makeFakeState([job], now);
    recomputeNextRuns(state);

    // Should NOT be cleared yet (50min < 60min = 2×30min)
    expect(job.state.runningAtMs).toBe(now - 50 * 60 * 1000);
  });
});

describe("recomputeNextRuns", () => {
  it("preserves existing nextRunAtMs (does not push due jobs into the future)", () => {
    // Simulate: timer fires at T=300_000. The job was scheduled at T=300_000.
    // recomputeNextRuns is called (inside ensureLoaded forceReload).
    // BUG (before fix): nextRunAtMs gets reset to now+interval = 600_000.
    // FIX: nextRunAtMs stays at 300_000 so runDueJobs sees it as due.
    const T = 300_000;
    const interval = 300_000; // 5 minutes
    const job = makeEveryJob({
      id: "hb",
      everyMs: interval,
      nextRunAtMs: T, // due NOW
    });
    const state = makeFakeState([job], T);

    recomputeNextRuns(state);

    // Must NOT have changed to T + interval
    expect(job.state.nextRunAtMs).toBe(T);
  });

  it("computes nextRunAtMs when it is missing", () => {
    const now = 1_000_000;
    const interval = 60_000;
    const job = makeEveryJob({ id: "new", everyMs: interval });
    // nextRunAtMs is undefined (fresh job)
    expect(job.state.nextRunAtMs).toBeUndefined();

    const state = makeFakeState([job], now);
    recomputeNextRuns(state);

    // Should now be set to something in the future
    expect(typeof job.state.nextRunAtMs).toBe("number");
    expect(job.state.nextRunAtMs).toBeGreaterThan(now);
  });

  it("preserves past-due nextRunAtMs so runDueJobs fires them", () => {
    // Gateway was down. Job was due 10 minutes ago.
    const now = 1_000_000;
    const pastDue = now - 600_000; // 10 min ago
    const job = makeEveryJob({ id: "overdue", everyMs: 300_000, nextRunAtMs: pastDue });
    const state = makeFakeState([job], now);

    recomputeNextRuns(state);

    // Past-due value must be preserved (not pushed to now + interval)
    expect(job.state.nextRunAtMs).toBe(pastDue);
  });

  it("clears nextRunAtMs for disabled jobs", () => {
    const job = makeEveryJob({
      id: "disabled",
      everyMs: 60_000,
      nextRunAtMs: 999_999,
      enabled: false,
    });
    const state = makeFakeState([job], Date.now());

    recomputeNextRuns(state);

    expect(job.state.nextRunAtMs).toBeUndefined();
  });
});

describe("applyJobPatch", () => {
  it("clears delivery when switching to main session", () => {
    const now = Date.now();
    const job: CronJob = {
      id: "job-1",
      name: "job-1",
      enabled: true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "do it" },
      delivery: { mode: "announce", channel: "telegram", to: "123" },
      state: {},
    };

    const patch: CronJobPatch = {
      sessionTarget: "main",
      payload: { kind: "systemEvent", text: "ping" },
    };

    expect(() => applyJobPatch(job, patch)).not.toThrow();
    expect(job.sessionTarget).toBe("main");
    expect(job.payload.kind).toBe("systemEvent");
    expect(job.delivery).toBeUndefined();
  });

  it("maps legacy payload delivery updates onto delivery", () => {
    const now = Date.now();
    const job: CronJob = {
      id: "job-2",
      name: "job-2",
      enabled: true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "do it" },
      delivery: { mode: "announce", channel: "telegram", to: "123" },
      state: {},
    };

    const patch: CronJobPatch = {
      payload: {
        kind: "agentTurn",
        deliver: false,
        channel: "Signal",
        to: "555",
        bestEffortDeliver: true,
      },
    };

    expect(() => applyJobPatch(job, patch)).not.toThrow();
    expect(job.payload.kind).toBe("agentTurn");
    if (job.payload.kind === "agentTurn") {
      expect(job.payload.deliver).toBe(false);
      expect(job.payload.channel).toBe("Signal");
      expect(job.payload.to).toBe("555");
      expect(job.payload.bestEffortDeliver).toBe(true);
    }
    expect(job.delivery).toEqual({
      mode: "none",
      channel: "signal",
      to: "555",
      bestEffort: true,
    });
  });

  it("treats legacy payload targets as announce requests", () => {
    const now = Date.now();
    const job: CronJob = {
      id: "job-3",
      name: "job-3",
      enabled: true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "do it" },
      delivery: { mode: "none", channel: "telegram" },
      state: {},
    };

    const patch: CronJobPatch = {
      payload: { kind: "agentTurn", to: " 999 " },
    };

    expect(() => applyJobPatch(job, patch)).not.toThrow();
    expect(job.delivery).toEqual({
      mode: "announce",
      channel: "telegram",
      to: "999",
      bestEffort: undefined,
    });
  });
});
