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

describe("CronService catches up overdue jobs after restart", () => {
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

  it("catches up an overdue every-type job after gateway restart", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    // Phase 1: Start, add a job, let it fire once.
    const cron1 = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
    });

    await cron1.start();
    const job = await cron1.add({
      name: "every 10s check",
      enabled: true,
      schedule: { kind: "every", everyMs: 10_000 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "systemEvent", text: "tick" },
    });

    const firstDueAt = job.state.nextRunAtMs!;
    expect(firstDueAt).toBe(Date.parse("2025-12-13T00:00:00.000Z") + 10_000);

    // Let the first tick fire (same pattern as service.every-jobs-fire.test.ts).
    vi.setSystemTime(new Date(firstDueAt + 5));
    await vi.runOnlyPendingTimersAsync();

    const jobs1 = await cron1.list();
    const updated1 = jobs1.find((j) => j.id === job.id);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("tick", { agentId: undefined });
    expect(updated1?.state.lastStatus).toBe("ok");

    const secondDueAt = updated1!.state.nextRunAtMs!;
    expect(secondDueAt).toBeGreaterThanOrEqual(firstDueAt + 10_000);

    // Phase 2: Stop and restart with nowMs far in the future (overdue).
    cron1.stop();

    const enqueue2 = vi.fn();
    const restartTime = secondDueAt + 50_000;

    const cron2 = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: enqueue2,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      nowMs: () => restartTime,
    });

    await cron2.start();

    // The overdue job should have been caught up during start().
    expect(enqueue2).toHaveBeenCalledWith("tick", { agentId: undefined });

    const jobs2 = await cron2.list();
    const updated2 = jobs2.find((j) => j.id === job.id);
    expect(updated2?.state.nextRunAtMs).toBeGreaterThan(restartTime);

    cron2.stop();
    await store.cleanup();
  });

  it("does not catch up a job that is not yet due after restart", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const cron1 = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
    });

    await cron1.start();
    const job = await cron1.add({
      name: "every 10s check",
      enabled: true,
      schedule: { kind: "every", everyMs: 10_000 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "systemEvent", text: "tick" },
    });

    const firstDueAt = job.state.nextRunAtMs!;

    // Let the first tick fire.
    vi.setSystemTime(new Date(firstDueAt + 5));
    await vi.runOnlyPendingTimersAsync();

    const jobs1 = await cron1.list();
    const updated = jobs1.find((j) => j.id === job.id);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("tick", { agentId: undefined });

    const persistedNext = updated!.state.nextRunAtMs!;

    // Phase 2: restart BEFORE the next due time using nowMs override.
    cron1.stop();

    const enqueue2 = vi.fn();
    const notOverdueTime = persistedNext - 5_000;

    const cron2 = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: enqueue2,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      nowMs: () => notOverdueTime,
    });

    await cron2.start();

    // No catch-up should happen -- the job is not overdue.
    expect(enqueue2).not.toHaveBeenCalled();

    cron2.stop();
    await store.cleanup();
  });
});
