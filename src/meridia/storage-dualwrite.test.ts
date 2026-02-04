import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import { openMeridiaDb, closeMeridiaDb, getMeridiaDbStats } from "./db.js";
import { appendExperientialRecord, appendTraceEvent, setSqliteEnabled } from "./storage.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "meridia-dualwrite-test-"));
}

function makeRecord(overrides?: Partial<MeridiaExperienceRecord>): MeridiaExperienceRecord {
  return {
    id: overrides?.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: overrides?.ts ?? new Date().toISOString(),
    sessionKey: overrides?.sessionKey ?? "test-session",
    sessionId: overrides?.sessionId ?? "sess-123",
    runId: overrides?.runId ?? "run-abc",
    tool: {
      name: overrides?.tool?.name ?? "exec",
      callId: overrides?.tool?.callId ?? "call-001",
      meta: overrides?.tool?.meta,
      isError: overrides?.tool?.isError ?? false,
    },
    data: {
      args: overrides?.data?.args ?? { command: "ls -la" },
      result: overrides?.data?.result ?? "file1.txt\nfile2.txt",
    },
    evaluation: {
      kind: overrides?.evaluation?.kind ?? "heuristic",
      score: overrides?.evaluation?.score ?? 0.7,
      recommendation: overrides?.evaluation?.recommendation ?? "capture",
      reason: overrides?.evaluation?.reason ?? "shell_exec",
      model: overrides?.evaluation?.model,
    },
  };
}

function makeTrace(): MeridiaTraceEvent {
  return {
    type: "tool_result",
    ts: new Date().toISOString(),
    sessionKey: "test-session",
    runId: "run-abc",
    toolName: "exec",
    toolCallId: "call-001",
    isError: false,
    decision: "capture",
    score: 0.7,
    threshold: 0.6,
  } as MeridiaTraceEvent;
}

describe("Meridia dual-write storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    closeMeridiaDb();
    setSqliteEnabled(undefined); // reset
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("appendExperientialRecord", () => {
    it("writes to JSONL file", async () => {
      setSqliteEnabled(false); // disable SQLite to test JSONL alone
      const jsonlPath = path.join(tempDir, "records", "test.jsonl");
      const record = makeRecord();

      await appendExperientialRecord(jsonlPath, record);

      const content = fs.readFileSync(jsonlPath, "utf-8").trim();
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe(record.id);
      expect(parsed.tool.name).toBe("exec");
    });

    it("writes to both JSONL and SQLite when enabled", async () => {
      setSqliteEnabled(true);
      const dbPath = path.join(tempDir, "meridia.sqlite");
      const jsonlPath = path.join(tempDir, "records", "test.jsonl");
      const record = makeRecord();

      // Pre-open the db so the singleton resolves to our temp path
      const db = openMeridiaDb({ dbPath });

      // Use a cfg that resolves meridia dir to tempDir
      // Since appendExperientialRecord internally opens the db,
      // we need to ensure it finds our temp db. We do this by
      // setting OPENCLAW_STATE_DIR so resolveMeridiaDir picks up tempDir.
      const origEnv = process.env.OPENCLAW_STATE_DIR;
      // The meridia dir is at <stateDir>/meridia, so set state dir to parent
      const stateDir = path.join(tempDir, "state");
      const meridiaDir = path.join(stateDir, "meridia");
      fs.mkdirSync(meridiaDir, { recursive: true });
      // Copy the db to the expected location
      closeMeridiaDb(); // close the temp db
      const dbPathInState = path.join(meridiaDir, "meridia.sqlite");

      process.env.OPENCLAW_STATE_DIR = stateDir;
      try {
        const jsonlPathInState = path.join(meridiaDir, "records", "test.jsonl");
        await appendExperientialRecord(jsonlPathInState, record);

        // Check JSONL was written
        const content = fs.readFileSync(jsonlPathInState, "utf-8").trim();
        const parsed = JSON.parse(content);
        expect(parsed.id).toBe(record.id);

        // Check SQLite was written
        const db2 = openMeridiaDb({ dbPath: dbPathInState });
        const stats = getMeridiaDbStats(db2);
        expect(stats.recordCount).toBe(1);
      } finally {
        if (origEnv !== undefined) {
          process.env.OPENCLAW_STATE_DIR = origEnv;
        } else {
          delete process.env.OPENCLAW_STATE_DIR;
        }
      }
    });

    it("JSONL still written even if SQLite fails", async () => {
      setSqliteEnabled(true);
      const jsonlPath = path.join(tempDir, "records", "test.jsonl");
      const record = makeRecord();

      // Force a bad state dir so SQLite open will fail
      const origEnv = process.env.OPENCLAW_STATE_DIR;
      process.env.OPENCLAW_STATE_DIR = "/nonexistent/path/that/wont/exist";
      closeMeridiaDb(); // clear cached db

      try {
        // Should not throw — SQLite failure is non-fatal
        await appendExperientialRecord(jsonlPath, record);

        const content = fs.readFileSync(jsonlPath, "utf-8").trim();
        const parsed = JSON.parse(content);
        expect(parsed.id).toBe(record.id);
      } finally {
        if (origEnv !== undefined) {
          process.env.OPENCLAW_STATE_DIR = origEnv;
        } else {
          delete process.env.OPENCLAW_STATE_DIR;
        }
      }
    });
  });

  describe("appendTraceEvent", () => {
    it("writes trace event to JSONL file", async () => {
      setSqliteEnabled(false);
      const jsonlPath = path.join(tempDir, "trace", "test.jsonl");
      const trace = makeTrace();

      await appendTraceEvent(jsonlPath, trace);

      const content = fs.readFileSync(jsonlPath, "utf-8").trim();
      const parsed = JSON.parse(content);
      expect(parsed.type).toBe("tool_result");
      expect(parsed.decision).toBe("capture");
    });
  });
});
