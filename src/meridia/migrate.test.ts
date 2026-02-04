import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import { openMeridiaDb, closeMeridiaDb, getMeridiaDbStats } from "./db.js";
import { migrateJsonlToSqlite, isMigrated, markMigrationComplete } from "./migrate.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "meridia-migrate-test-"));
}

function makeRecord(id: string, ts: string, toolName: string = "exec"): MeridiaExperienceRecord {
  return {
    id,
    ts,
    sessionKey: "test-session",
    sessionId: "sid-1",
    runId: "run-1",
    tool: {
      name: toolName,
      callId: `call-${id}`,
      isError: false,
    },
    data: {
      args: { command: "test" },
      result: "ok",
    },
    evaluation: {
      kind: "heuristic",
      score: 0.7,
      recommendation: "capture",
      reason: "test",
    },
  };
}

function makeTraceEvent(ts: string): MeridiaTraceEvent {
  return {
    type: "tool_result",
    ts,
    sessionKey: "test-session",
    runId: "run-1",
    toolName: "exec",
    toolCallId: "c1",
    isError: false,
    decision: "capture",
    score: 0.7,
    threshold: 0.6,
  } as MeridiaTraceEvent;
}

function writeJsonlFile(filePath: string, records: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
}

describe("Meridia Migration", () => {
  let tmpDir: string;
  let dbPath: string;
  let meridiaDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmpDir = createTempDir();
    dbPath = path.join(tmpDir, "db", "meridia.sqlite");
    meridiaDir = path.join(tmpDir, "meridia");

    // Create meridia directory structure
    fs.mkdirSync(path.join(meridiaDir, "records", "experiential"), { recursive: true });
    fs.mkdirSync(path.join(meridiaDir, "trace"), { recursive: true });

    db = openMeridiaDb({ dbPath });
  });

  afterEach(() => {
    closeMeridiaDb();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("migrateJsonlToSqlite", () => {
    it("migrates experiential records", () => {
      const records = [
        makeRecord("r1", "2025-06-10T10:00:00Z"),
        makeRecord("r2", "2025-06-10T11:00:00Z"),
        makeRecord("r3", "2025-06-10T12:00:00Z"),
      ];
      writeJsonlFile(path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl"), records);

      const result = migrateJsonlToSqlite({ db, meridiaDir });

      expect(result.recordsFound).toBe(3);
      expect(result.recordsInserted).toBe(3);
      expect(result.errors.length).toBe(0);

      const stats = getMeridiaDbStats(db);
      expect(stats.recordCount).toBe(3);
    });

    it("migrates trace events", () => {
      const events = [
        makeTraceEvent("2025-06-10T10:00:00Z"),
        makeTraceEvent("2025-06-10T11:00:00Z"),
      ];
      writeJsonlFile(path.join(meridiaDir, "trace", "2025-06-10.jsonl"), events);

      const result = migrateJsonlToSqlite({ db, meridiaDir });

      expect(result.traceEventsFound).toBe(2);
      expect(result.traceEventsInserted).toBe(2);

      const stats = getMeridiaDbStats(db);
      expect(stats.traceCount).toBe(2);
    });

    it("handles multiple date files", () => {
      writeJsonlFile(path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl"), [
        makeRecord("r1", "2025-06-10T10:00:00Z"),
      ]);
      writeJsonlFile(path.join(meridiaDir, "records", "experiential", "2025-06-11.jsonl"), [
        makeRecord("r2", "2025-06-11T10:00:00Z"),
      ]);

      const result = migrateJsonlToSqlite({ db, meridiaDir });

      expect(result.recordsFound).toBe(2);
      expect(result.recordsInserted).toBe(2);
      expect(result.filesProcessed).toBe(2);
    });

    it("skips duplicate records on re-migration", () => {
      const records = [makeRecord("r1", "2025-06-10T10:00:00Z")];
      writeJsonlFile(path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl"), records);

      // First migration
      const result1 = migrateJsonlToSqlite({ db, meridiaDir });
      expect(result1.recordsInserted).toBe(1);

      // Second migration — should skip duplicates
      const result2 = migrateJsonlToSqlite({ db, meridiaDir });
      expect(result2.recordsFound).toBe(1);
      expect(result2.recordsInserted).toBe(0);

      const stats = getMeridiaDbStats(db);
      expect(stats.recordCount).toBe(1);
    });

    it("handles malformed JSONL lines gracefully", () => {
      const filePath = path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify(makeRecord("r1", "2025-06-10T10:00:00Z"))}\n` +
          `{invalid json\n` +
          `${JSON.stringify(makeRecord("r2", "2025-06-10T11:00:00Z"))}\n`,
        "utf-8",
      );

      const result = migrateJsonlToSqlite({ db, meridiaDir });

      expect(result.recordsFound).toBe(2);
      expect(result.recordsInserted).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].line).toBe(2);
    });

    it("handles empty directories", () => {
      const result = migrateJsonlToSqlite({ db, meridiaDir });

      expect(result.recordsFound).toBe(0);
      expect(result.recordsInserted).toBe(0);
      expect(result.traceEventsFound).toBe(0);
      expect(result.filesProcessed).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it("handles non-existent directories", () => {
      const result = migrateJsonlToSqlite({
        db,
        meridiaDir: path.join(tmpDir, "nonexistent"),
      });

      expect(result.recordsFound).toBe(0);
      expect(result.filesProcessed).toBe(0);
    });

    it("reports progress", () => {
      writeJsonlFile(path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl"), [
        makeRecord("r1", "2025-06-10T10:00:00Z"),
      ]);

      const progressUpdates: Array<{ phase: string }> = [];
      migrateJsonlToSqlite({
        db,
        meridiaDir,
        onProgress: (p) => progressUpdates.push({ phase: p.phase }),
      });

      expect(progressUpdates.some((p) => p.phase === "records")).toBe(true);
      expect(progressUpdates.some((p) => p.phase === "done")).toBe(true);
    });

    it("preserves original JSONL files", () => {
      const filePath = path.join(meridiaDir, "records", "experiential", "2025-06-10.jsonl");
      writeJsonlFile(filePath, [makeRecord("r1", "2025-06-10T10:00:00Z")]);

      migrateJsonlToSqlite({ db, meridiaDir });

      // JSONL file should still exist
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("isMigrated / markMigrationComplete", () => {
    it("returns false before migration", () => {
      expect(isMigrated(db)).toBe(false);
    });

    it("returns true after marking complete", () => {
      const result = migrateJsonlToSqlite({ db, meridiaDir });
      markMigrationComplete(db, result);
      expect(isMigrated(db)).toBe(true);
    });

    it("stores migration result", () => {
      const result = migrateJsonlToSqlite({ db, meridiaDir });
      markMigrationComplete(db, result);

      const row = db
        .prepare(`SELECT value FROM meridia_meta WHERE key = 'jsonl_migration_result'`)
        .get() as { value: string } | undefined;
      expect(row).toBeDefined();
      const stored = JSON.parse(row!.value);
      expect(stored.durationMs).toBeDefined();
    });
  });
});
