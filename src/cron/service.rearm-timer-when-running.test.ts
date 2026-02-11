import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("CronService - timer re-arm when running (#12025)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-13T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-arms the timer when onTimer fires while a job is still running", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    // Simulate a slow isolated job that takes 90 seconds (longer than
    // MAX_TIMER_DELAY_MS = 60s).  Before the fix, the clamped 60s timer
    // would fire mid-execution, hit the `state.running` guard, return
    // without re-arming, and silently kill the scheduler.
    let resolveSlowJob: (v: { status: string }) => void;
    const runIsolatedAgentJob = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveSlowJob = resolve;
        }),
    );

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    // Add a recurring job that runs every 5 minutes.
    await cron.add({
      name: "slow recurring job",
      enabled: true,
      schedule: { kind: "every", everyMs: 5 * 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "do something slow" },
    });

    // Advance to when the job is due (5 minutes).
    vi.setSystemTime(new Date("2025-12-13T00:05:00.000Z"));
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    // The job should have started.
    expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);

    // Advance 60+ seconds while the job is still running.
    // This triggers the clamped timer.  Before the fix, this would kill
    // the scheduler.
    vi.setSystemTime(new Date("2025-12-13T00:06:01.000Z"));
    await vi.advanceTimersByTimeAsync(61_000);

    // Now complete the slow job.
    resolveSlowJob!({ status: "ok" });
    await vi.advanceTimersByTimeAsync(0);

    // The scheduler should still be alive.  Advance to the next occurrence
    // (10 minutes from start) and verify the job fires again.
    vi.setSystemTime(new Date("2025-12-13T00:10:00.000Z"));
    await vi.advanceTimersByTimeAsync(4 * 60_000);

    expect(runIsolatedAgentJob).toHaveBeenCalledTimes(2);

    cron.stop();
    await store.cleanup();
  });
});
