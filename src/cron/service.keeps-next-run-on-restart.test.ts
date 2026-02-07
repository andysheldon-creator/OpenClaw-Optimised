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

describe("CronService", () => {
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

  it("keeps nextRunAtMs after restart so missed cron runs stay due", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const runIsolatedAgentJob = vi.fn(async () => ({ status: "ok" }));
    let cronA: CronService | null = null;
    let cronB: CronService | null = null;

    try {
      vi.setSystemTime(new Date("2025-12-13T10:00:00.000Z"));
      cronA = new CronService({
        storePath: store.storePath,
        cronEnabled: true,
        log: noopLogger,
        enqueueSystemEvent,
        requestHeartbeatNow,
        runIsolatedAgentJob,
      });
      await cronA.start();

      const job = await cronA.add({
        name: "daily reminder",
        enabled: true,
        schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        payload: { kind: "systemEvent", text: "hello" },
      });
      const initialNextRunAtMs = job.state.nextRunAtMs;
      expect(initialNextRunAtMs).toBeTypeOf("number");

      cronA.stop();
      cronA = null;

      vi.setSystemTime(new Date("2025-12-14T10:00:00.000Z"));
      cronB = new CronService({
        storePath: store.storePath,
        cronEnabled: true,
        log: noopLogger,
        enqueueSystemEvent,
        requestHeartbeatNow,
        runIsolatedAgentJob,
      });
      await cronB.start();

      const jobs = await cronB.list({ includeDisabled: true });
      const restored = jobs.find((entry) => entry.id === job.id);
      expect(restored?.state.nextRunAtMs).toBe(initialNextRunAtMs);
    } finally {
      cronA?.stop();
      cronB?.stop();
      await store.cleanup();
    }
  });
});
