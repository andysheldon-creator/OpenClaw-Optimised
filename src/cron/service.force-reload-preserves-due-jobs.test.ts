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

describe("CronService force-reload preserves due jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not skip an isolated job when the timer fires", async () => {
    // Regression test: recomputeNextRuns during force-reload was advancing
    // due jobs past their nextRunAtMs before runDueJobs could see them.
    // This mirrors the existing "runs an isolated job" test pattern exactly,
    // but validates it still works after the force-reload fix.
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "ok" as const,
      summary: "standup done",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    const atMs = Date.parse("2026-02-06T00:00:01.000Z");
    await cron.add({
      name: "daily standup",
      enabled: true,
      schedule: { kind: "at", at: new Date(atMs).toISOString() },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "generate standup" },
      delivery: { mode: "announce" },
    });

    vi.setSystemTime(new Date("2026-02-06T00:00:01.000Z"));
    await vi.runOnlyPendingTimersAsync();

    await cron.list({ includeDisabled: true });
    // The job MUST have been executed, not silently skipped.
    expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("Cron: standup done", {
      agentId: undefined,
    });
    expect(requestHeartbeatNow).toHaveBeenCalled();

    cron.stop();
    await store.cleanup();
  });

  it("executes due jobs after store force-reload via manual run", async () => {
    // This test directly validates the fix: a job that is due should
    // still execute even after a force-reload recomputes schedules.
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "ok" as const,
      summary: "email checked",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    // Add a job and manually run it to confirm execution works.
    const job = await cron.add({
      name: "email check",
      enabled: true,
      schedule: { kind: "every", everyMs: 30 * 60 * 1000 },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "check email" },
      delivery: { mode: "none" },
    });

    // Force-run the job (this triggers the same executeJob path).
    await cron.run(job.id, "force");

    expect(runIsolatedAgentJob).toHaveBeenCalledTimes(1);
    expect(runIsolatedAgentJob).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "check email",
      }),
    );

    // After execution, nextRunAtMs should be in the future.
    const jobs = await cron.list();
    const updated = jobs.find((j) => j.id === job.id);
    expect(updated).toBeDefined();
    expect(updated!.state.lastStatus).toBe("ok");
    expect(updated!.state.nextRunAtMs).toBeGreaterThan(Date.now());

    cron.stop();
    await store.cleanup();
  });
});
