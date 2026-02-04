import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import {
  openMeridiaDb,
  closeMeridiaDb,
  ensureMeridiaSchema,
  insertRecord,
  insertRecordsBatch,
  insertTraceEvent,
  insertTraceEventsBatch,
  upsertSession,
  getMeridiaDbStats,
} from "./db.js";

function makeTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meridia-test-"));
  return path.join(dir, "meridia.sqlite");
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

function makeTrace(
  overrides?: Partial<MeridiaTraceEvent & { type: "tool_result" }>,
): MeridiaTraceEvent {
  return {
    type: "tool_result",
    ts: overrides?.ts ?? new Date().toISOString(),
    sessionKey: overrides?.sessionKey ?? "test-session",
    runId: overrides?.runId ?? "run-abc",
    toolName: overrides?.toolName ?? "exec",
    toolCallId: overrides?.toolCallId ?? "call-001",
    isError: overrides?.isError ?? false,
    decision: overrides?.decision ?? "capture",
    score: overrides?.score ?? 0.7,
    threshold: overrides?.threshold ?? 0.6,
  } as MeridiaTraceEvent;
}

describe("Meridia DB", () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = makeTempDbPath();
    db = openMeridiaDb({ dbPath });
  });

  afterEach(() => {
    closeMeridiaDb();
    try {
      const dir = path.dirname(dbPath);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("schema", () => {
    it("creates all required tables", () => {
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("meridia_records");
      expect(tableNames).toContain("meridia_sessions");
      expect(tableNames).toContain("meridia_trace");
      expect(tableNames).toContain("meridia_meta");
    });

    it("creates FTS virtual table", () => {
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'`)
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames.some((n) => n.includes("meridia_records_fts"))).toBe(true);
    });

    it("sets schema version", () => {
      const row = db.prepare(`SELECT value FROM meridia_meta WHERE key = 'schema_version'`).get() as
        | { value: string }
        | undefined;
      expect(row?.value).toBe("1");
    });

    it("is idempotent", () => {
      // Running schema creation again should not throw
      const result = ensureMeridiaSchema(db);
      expect(result.ftsAvailable).toBe(true);
    });
  });

  describe("insertRecord", () => {
    it("inserts a record", () => {
      const record = makeRecord({ id: "test-insert-1" });
      const inserted = insertRecord(db, record);
      expect(inserted).toBe(true);

      const row = db.prepare(`SELECT * FROM meridia_records WHERE id = ?`).get("test-insert-1") as
        | Record<string, unknown>
        | undefined;
      expect(row).toBeDefined();
      expect(row?.tool_name).toBe("exec");
      expect(row?.score).toBe(0.7);
    });

    it("skips duplicate ids", () => {
      const record = makeRecord({ id: "dup-test" });
      expect(insertRecord(db, record)).toBe(true);
      expect(insertRecord(db, record)).toBe(false);
    });

    it("stores is_error correctly", () => {
      const record = makeRecord({
        id: "error-test",
        tool: { name: "exec", callId: "c1", isError: true },
      });
      insertRecord(db, record);

      const row = db
        .prepare(`SELECT is_error FROM meridia_records WHERE id = ?`)
        .get("error-test") as {
        is_error: number;
      };
      expect(row.is_error).toBe(1);
    });

    it("stores full JSON data for roundtrip", () => {
      const record = makeRecord({ id: "json-test" });
      insertRecord(db, record);

      const row = db
        .prepare(`SELECT data_json FROM meridia_records WHERE id = ?`)
        .get("json-test") as {
        data_json: string;
      };
      const parsed = JSON.parse(row.data_json) as MeridiaExperienceRecord;
      expect(parsed.id).toBe("json-test");
      expect(parsed.tool.name).toBe("exec");
      expect(parsed.evaluation.score).toBe(0.7);
    });

    it("populates FTS index", () => {
      const record = makeRecord({
        id: "fts-test",
        evaluation: {
          kind: "heuristic",
          score: 0.8,
          recommendation: "capture",
          reason: "unique_search_term_xyz",
        },
      });
      insertRecord(db, record);

      const ftsRows = db
        .prepare(`SELECT * FROM meridia_records_fts WHERE meridia_records_fts MATCH ?`)
        .all('"unique_search_term_xyz"') as unknown[];
      expect(ftsRows.length).toBe(1);
    });
  });

  describe("insertRecordsBatch", () => {
    it("inserts multiple records in a transaction", () => {
      const records = Array.from({ length: 10 }, (_, i) => makeRecord({ id: `batch-${i}` }));

      const count = insertRecordsBatch(db, records);
      expect(count).toBe(10);

      const total = db.prepare(`SELECT COUNT(*) as cnt FROM meridia_records`).get() as {
        cnt: number;
      };
      expect(total.cnt).toBe(10);
    });

    it("handles duplicates within batch", () => {
      const record = makeRecord({ id: "batch-dup" });
      insertRecord(db, record);

      const records = [
        makeRecord({ id: "batch-dup" }), // duplicate
        makeRecord({ id: "batch-new" }), // new
      ];

      const count = insertRecordsBatch(db, records);
      expect(count).toBe(1);
    });
  });

  describe("insertTraceEvent", () => {
    it("inserts a trace event", () => {
      const event = makeTrace();
      insertTraceEvent(db, event);

      const row = db.prepare(`SELECT * FROM meridia_trace`).get() as
        | Record<string, unknown>
        | undefined;
      expect(row).toBeDefined();
      expect(row?.type).toBe("tool_result");
    });

    it("auto-increments id", () => {
      insertTraceEvent(db, makeTrace());
      insertTraceEvent(db, makeTrace());

      const rows = db.prepare(`SELECT id FROM meridia_trace ORDER BY id`).all() as Array<{
        id: number;
      }>;
      expect(rows.length).toBe(2);
      expect(rows[1].id).toBeGreaterThan(rows[0].id);
    });
  });

  describe("insertTraceEventsBatch", () => {
    it("inserts multiple events", () => {
      const events = Array.from({ length: 5 }, () => makeTrace());
      const count = insertTraceEventsBatch(db, events);
      expect(count).toBe(5);
    });
  });

  describe("upsertSession", () => {
    it("inserts a new session", () => {
      upsertSession(db, {
        sessionKey: "sess-1",
        startedAt: "2025-01-01T00:00:00Z",
        toolsUsed: ["exec", "write"],
        topics: ["deployment"],
        summary: "Deployed the app",
      });

      const row = db
        .prepare(`SELECT * FROM meridia_sessions WHERE session_key = ?`)
        .get("sess-1") as Record<string, unknown> | undefined;
      expect(row).toBeDefined();
      expect(row?.summary).toBe("Deployed the app");
      expect(JSON.parse(row?.tools_used as string)).toEqual(["exec", "write"]);
    });

    it("updates existing session without overwriting non-null fields", () => {
      upsertSession(db, {
        sessionKey: "sess-2",
        startedAt: "2025-01-01T00:00:00Z",
        summary: "First summary",
      });

      upsertSession(db, {
        sessionKey: "sess-2",
        endedAt: "2025-01-01T01:00:00Z",
        turnCount: 42,
      });

      const row = db
        .prepare(`SELECT * FROM meridia_sessions WHERE session_key = ?`)
        .get("sess-2") as Record<string, unknown> | undefined;
      expect(row?.started_at).toBe("2025-01-01T00:00:00Z");
      expect(row?.ended_at).toBe("2025-01-01T01:00:00Z");
      expect(row?.turn_count).toBe(42);
      expect(row?.summary).toBe("First summary");
    });
  });

  describe("getMeridiaDbStats", () => {
    it("returns correct counts", () => {
      insertRecordsBatch(db, [
        makeRecord({ id: "s1", ts: "2025-01-01T00:00:00Z" }),
        makeRecord({ id: "s2", ts: "2025-01-15T00:00:00Z" }),
      ]);
      insertTraceEvent(db, makeTrace());
      upsertSession(db, { sessionKey: "sess-stats" });

      const stats = getMeridiaDbStats(db);
      expect(stats.recordCount).toBe(2);
      expect(stats.traceCount).toBe(1);
      expect(stats.sessionCount).toBe(1);
      expect(stats.oldestRecord).toBe("2025-01-01T00:00:00Z");
      expect(stats.newestRecord).toBe("2025-01-15T00:00:00Z");
      expect(stats.schemaVersion).toBe("1");
    });

    it("handles empty database", () => {
      const stats = getMeridiaDbStats(db);
      expect(stats.recordCount).toBe(0);
      expect(stats.traceCount).toBe(0);
      expect(stats.sessionCount).toBe(0);
      expect(stats.oldestRecord).toBeNull();
      expect(stats.newestRecord).toBeNull();
    });
  });
});
