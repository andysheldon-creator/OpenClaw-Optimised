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

describe("CronService timer re-arm after tick", () => {
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

  it("fires an every-type job across two consecutive ticks", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
    });

    await cron.start();
    const job = await cron.add({
      name: "every 10s check",
      enabled: true,
      schedule: { kind: "every", everyMs: 10_000 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "systemEvent", text: "tick" },
    });

    // Tick 1.
    const firstDueAt = job.state.nextRunAtMs!;
    vi.setSystemTime(new Date(firstDueAt + 5));
    await vi.runOnlyPendingTimersAsync();

    const jobs1 = await cron.list();
    const afterTick1 = jobs1.find((j) => j.id === job.id);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("tick", { agentId: undefined });
    expect(afterTick1?.state.lastStatus).toBe("ok");

    // Tick 2 -- verify the timer was re-armed after tick 1.
    enqueueSystemEvent.mockClear();
    const secondDueAt = afterTick1!.state.nextRunAtMs!;
    vi.setSystemTime(new Date(secondDueAt + 5));
    await vi.runOnlyPendingTimersAsync();

    const jobs2 = await cron.list();
    const afterTick2 = jobs2.find((j) => j.id === job.id);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("tick", { agentId: undefined });
    expect(afterTick2?.state.nextRunAtMs).toBeGreaterThanOrEqual(secondDueAt + 10_000);

    cron.stop();
    await store.cleanup();
  });
});
