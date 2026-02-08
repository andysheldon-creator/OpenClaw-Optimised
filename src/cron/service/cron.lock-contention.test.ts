import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CronJob } from "../types.js";
import { saveCronStore } from "../store.js";
import * as ops from "./ops.js";
import { createCronServiceState } from "./state.js";
import { onTimer } from "./timer.js";

function createTestLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms)),
  ]);
}

describe("cron service lock", () => {
  it("does not block list() while a long job is executing (timer path)", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-lock-test-"));
    try {
      const storePath = path.join(base, "cron", "jobs.json");

      let started!: () => void;
      const startedP = new Promise<void>((r) => (started = r));

      let finish!: () => void;
      const finishP = new Promise<void>((r) => (finish = r));

      const job: CronJob = {
        id: "job1",
        name: "slow job",
        enabled: true,
        createdAtMs: 0,
        updatedAtMs: 0,
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: { kind: "agentTurn", message: "do slow thing" },
        state: { nextRunAtMs: 0 },
      };

      await saveCronStore(storePath, { version: 1, jobs: [job] });

      const state = createCronServiceState({
        log: createTestLogger(),
        storePath,
        cronEnabled: true,
        enqueueSystemEvent: () => {},
        requestHeartbeatNow: () => {},
        runIsolatedAgentJob: async () => {
          started();
          await finishP;
          return { status: "ok", summary: "done" };
        },
      });

      const timerP = onTimer(state);

      // Wait until the job actually begins executing (i.e. we are in phase 2).
      await withTimeout(startedP, 500, "job started");

      // If onTimer incorrectly holds the store lock across executeJob, this list()
      // would block until finish().
      const jobs = await withTimeout(ops.list(state), 100, "ops.list while job running");
      expect(jobs.map((j) => j.id)).toEqual(["job1"]);

      finish();
      await withTimeout(timerP, 2000, "timer completes");
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
