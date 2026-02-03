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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbrain-cron-lock-free-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type IsolatedResult = { status: "ok" | "error" | "skipped"; summary?: string };

describe("CronService lock-free reads", () => {
  let store: Awaited<ReturnType<typeof makeStorePath>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-13T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
    store = await makeStorePath();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await store.cleanup();
  });

  function makeCron(runIsolatedAgentJob: () => Promise<IsolatedResult>) {
    return new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob,
    });
  }

  async function addIsolatedJob(cron: CronService) {
    // Schedule far in the future so the timer doesn't auto-fire.
    const atMs = Date.parse("2025-12-14T00:00:00.000Z");
    return await cron.add({
      name: "slow isolated job",
      enabled: true,
      schedule: { kind: "at", atMs },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "hello" },
    });
  }

  it("status() returns immediately while a job is executing", async () => {
    const deferred = createDeferred<IsolatedResult>();
    const runIsolatedAgentJob = vi.fn(() => deferred.promise);
    const cron = makeCron(runIsolatedAgentJob);

    await cron.start();
    const job = await addIsolatedJob(cron);

    // Force-run (don't await — blocks on the deferred).
    const runPromise = cron.run(job.id, "force");
    // Drain microtasks so Phase 1 (locked) completes and Phase 2 (unlocked) starts.
    await Promise.resolve();
    await Promise.resolve();

    // status() should resolve immediately — no lock contention.
    const statusResult = await cron.status();
    expect(statusResult.enabled).toBe(true);
    expect(statusResult.jobs).toBe(1);

    // Unblock the job.
    deferred.resolve({ status: "ok", summary: "done" });
    await runPromise;
    cron.stop();
  });

  it("list() returns immediately while a job is executing and shows runningAtMs", async () => {
    const deferred = createDeferred<IsolatedResult>();
    const runIsolatedAgentJob = vi.fn(() => deferred.promise);
    const cron = makeCron(runIsolatedAgentJob);

    await cron.start();
    const job = await addIsolatedJob(cron);

    const runPromise = cron.run(job.id, "force");
    await Promise.resolve();
    await Promise.resolve();

    // list() should resolve immediately and the running job should have runningAtMs.
    const jobs = await cron.list({ includeDisabled: true });
    expect(jobs.length).toBe(1);
    expect(typeof jobs[0].state.runningAtMs).toBe("number");

    deferred.resolve({ status: "ok", summary: "done" });
    await runPromise;
    cron.stop();
  });

  it("run() unblocks reads during execution", async () => {
    const deferred = createDeferred<IsolatedResult>();
    const runIsolatedAgentJob = vi.fn(() => deferred.promise);
    const cron = makeCron(runIsolatedAgentJob);

    await cron.start();
    const job = await addIsolatedJob(cron);

    const runPromise = cron.run(job.id, "force");
    await Promise.resolve();
    await Promise.resolve();

    // Both status() and list() should resolve while the job is still executing.
    const statusResult = await cron.status();
    expect(statusResult.enabled).toBe(true);

    const jobs = await cron.list({ includeDisabled: true });
    expect(jobs.length).toBe(1);

    deferred.resolve({ status: "ok", summary: "done" });
    const runResult = await runPromise;
    expect(runResult).toEqual({ ok: true, ran: true });

    cron.stop();
  });
});
