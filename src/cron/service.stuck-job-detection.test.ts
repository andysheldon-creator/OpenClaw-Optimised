import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CronStoreFile } from "./types.js";
import { CronService } from "./service.js";
import { STUCK_RUN_MS } from "./service/jobs.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-stuck-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("CronService stuck job detection", () => {
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

  it("has a stuck timeout of 30 minutes", () => {
    expect(STUCK_RUN_MS).toBe(30 * 60 * 1000);
  });

  it("clears stuck running marker and records error after timeout", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({ status: "ok" as const }));

    const startTimeMs = Date.parse("2025-12-13T00:01:00.000Z");
    const jobId = "test-stuck-job-id";

    const storeData: CronStoreFile = {
      version: 1,
      jobs: [
        {
          id: jobId,
          name: "stuck job test",
          enabled: true,
          createdAtMs: Date.parse("2025-12-13T00:00:00.000Z"),
          updatedAtMs: Date.parse("2025-12-13T00:00:00.000Z"),
          schedule: { kind: "every", everyMs: 60_000 },
          sessionTarget: "isolated",
          wakeMode: "now",
          payload: { kind: "agentTurn", message: "test" },
          state: {
            runningAtMs: startTimeMs,
            nextRunAtMs: Date.parse("2025-12-13T00:02:00.000Z"),
          },
        },
      ],
    };

    await fs.mkdir(path.dirname(store.storePath), { recursive: true });
    await fs.writeFile(store.storePath, JSON.stringify(storeData), "utf8");

    vi.setSystemTime(new Date("2025-12-13T00:32:00.000Z"));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });
    await cron.start();

    expect(noopLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId }),
      "cron: clearing stuck running marker",
    );

    const jobsAfter = await cron.list();
    expect(jobsAfter[0].state.runningAtMs).toBeUndefined();
    expect(jobsAfter[0].state.lastStatus).toBe("error");
    expect(jobsAfter[0].state.lastError).toMatch(/stuck after \d+ minutes/);
    expect(jobsAfter[0].state.lastRunAtMs).toBe(startTimeMs);

    cron.stop();
    await store.cleanup();
  });

  it("does not clear running marker before timeout", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({ status: "ok" as const }));

    const startTimeMs = Date.parse("2025-12-13T00:01:00.000Z");
    const jobId = "test-running-job-id";

    const storeData: CronStoreFile = {
      version: 1,
      jobs: [
        {
          id: jobId,
          name: "running job test",
          enabled: true,
          createdAtMs: Date.parse("2025-12-13T00:00:00.000Z"),
          updatedAtMs: Date.parse("2025-12-13T00:00:00.000Z"),
          schedule: { kind: "every", everyMs: 60_000 },
          sessionTarget: "isolated",
          wakeMode: "now",
          payload: { kind: "agentTurn", message: "test" },
          state: {
            runningAtMs: startTimeMs,
            nextRunAtMs: Date.parse("2025-12-13T00:02:00.000Z"),
          },
        },
      ],
    };

    await fs.mkdir(path.dirname(store.storePath), { recursive: true });
    await fs.writeFile(store.storePath, JSON.stringify(storeData), "utf8");

    vi.setSystemTime(new Date("2025-12-13T00:20:00.000Z"));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });
    await cron.start();

    expect(noopLogger.warn).not.toHaveBeenCalled();

    const jobsAfter = await cron.list();
    expect(jobsAfter[0].state.runningAtMs).toBe(startTimeMs);
    expect(jobsAfter[0].state.lastStatus).toBeUndefined();

    cron.stop();
    await store.cleanup();
  });

  it("records stuck duration in error message", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({ status: "ok" as const }));

    const startTimeMs = Date.parse("2025-12-13T00:00:00.000Z");
    const jobId = "test-duration-job-id";

    const storeData: CronStoreFile = {
      version: 1,
      jobs: [
        {
          id: jobId,
          name: "duration test",
          enabled: true,
          createdAtMs: startTimeMs,
          updatedAtMs: startTimeMs,
          schedule: { kind: "every", everyMs: 60_000 },
          sessionTarget: "isolated",
          wakeMode: "now",
          payload: { kind: "agentTurn", message: "test" },
          state: {
            runningAtMs: startTimeMs,
            nextRunAtMs: Date.parse("2025-12-13T00:01:00.000Z"),
          },
        },
      ],
    };

    await fs.mkdir(path.dirname(store.storePath), { recursive: true });
    await fs.writeFile(store.storePath, JSON.stringify(storeData), "utf8");

    vi.setSystemTime(new Date("2025-12-13T00:45:00.000Z"));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });
    await cron.start();

    const jobsAfter = await cron.list();
    expect(jobsAfter[0].state.lastError).toContain("45 minutes");
    expect(jobsAfter[0].state.lastDurationMs).toBe(45 * 60 * 1000);

    cron.stop();
    await store.cleanup();
  });
});
