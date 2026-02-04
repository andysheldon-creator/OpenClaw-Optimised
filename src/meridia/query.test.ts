import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MeridiaExperienceRecord } from "./types.js";
import {
  openMeridiaDb,
  closeMeridiaDb,
  insertRecordsBatch,
  insertTraceEvent,
  upsertSession,
} from "./db.js";
import {
  searchRecords,
  getRecordsByDateRange,
  getRecordsBySession,
  getRecentRecords,
  getRecordsByTool,
  getSessionSummary,
  getRecordById,
  listSessions,
  getToolStats,
  getTraceEvents,
} from "./query.js";

function makeTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meridia-query-test-"));
  return path.join(dir, "meridia.sqlite");
}

function makeRecord(
  overrides: Partial<MeridiaExperienceRecord> & { id: string },
): MeridiaExperienceRecord {
  return {
    id: overrides.id,
    ts: overrides.ts ?? "2025-06-15T12:00:00Z",
    sessionKey: overrides.sessionKey ?? "session-a",
    sessionId: overrides.sessionId ?? "sid-1",
    runId: overrides.runId ?? "run-1",
    tool: {
      name: overrides.tool?.name ?? "exec",
      callId: overrides.tool?.callId ?? "call-1",
      meta: overrides.tool?.meta,
      isError: overrides.tool?.isError ?? false,
    },
    data: {
      args: overrides.data?.args ?? { command: "test" },
      result: overrides.data?.result ?? "ok",
    },
    evaluation: {
      kind: overrides.evaluation?.kind ?? "heuristic",
      score: overrides.evaluation?.score ?? 0.7,
      recommendation: overrides.evaluation?.recommendation ?? "capture",
      reason: overrides.evaluation?.reason ?? "test_reason",
    },
  };
}

describe("Meridia Query API", () => {
  let dbPath: string;
  let db: DatabaseSync;

  // Seed data
  const seedRecords: MeridiaExperienceRecord[] = [
    makeRecord({
      id: "r1",
      ts: "2025-06-10T10:00:00Z",
      sessionKey: "session-a",
      tool: { name: "exec", callId: "c1", isError: false },
      evaluation: {
        kind: "heuristic",
        score: 0.7,
        recommendation: "capture",
        reason: "shell_exec",
      },
      data: { args: { command: "npm test" }, result: "All tests passed" },
    }),
    makeRecord({
      id: "r2",
      ts: "2025-06-10T11:00:00Z",
      sessionKey: "session-a",
      tool: { name: "write", callId: "c2", isError: false },
      evaluation: {
        kind: "llm",
        score: 0.85,
        recommendation: "capture",
        reason: "critical_file_write",
      },
      data: { args: { path: "config.json" }, result: "written" },
    }),
    makeRecord({
      id: "r3",
      ts: "2025-06-11T09:00:00Z",
      sessionKey: "session-b",
      tool: { name: "exec", callId: "c3", isError: true },
      evaluation: {
        kind: "heuristic",
        score: 0.55,
        recommendation: "capture",
        reason: "tool_error",
      },
      data: { args: { command: "deploy" }, result: "Error: connection refused" },
    }),
    makeRecord({
      id: "r4",
      ts: "2025-06-12T14:00:00Z",
      sessionKey: "session-b",
      tool: { name: "message", callId: "c4", isError: false },
      evaluation: {
        kind: "llm",
        score: 0.9,
        recommendation: "capture",
        reason: "external_communication",
      },
      data: { args: { channel: "#general" }, result: "sent" },
    }),
    makeRecord({
      id: "r5",
      ts: "2025-06-13T08:00:00Z",
      sessionKey: "session-c",
      tool: { name: "read", callId: "c5", isError: false },
      evaluation: {
        kind: "heuristic",
        score: 0.3,
        recommendation: "skip",
        reason: "filesystem_read",
      },
    }),
  ];

  beforeEach(() => {
    dbPath = makeTempDbPath();
    db = openMeridiaDb({ dbPath });
    insertRecordsBatch(db, seedRecords);
  });

  afterEach(() => {
    closeMeridiaDb();
    try {
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("searchRecords", () => {
    it("finds records by tool name", () => {
      const results = searchRecords(db, "exec");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.record.tool.name === "exec")).toBe(true);
    });

    it("finds records by reason text", () => {
      const results = searchRecords(db, "critical_file_write");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].record.id).toBe("r2");
    });

    it("finds records by data content", () => {
      const results = searchRecords(db, "connection refused");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.record.id === "r3")).toBe(true);
    });

    it("returns empty for no matches", () => {
      const results = searchRecords(db, "nonexistent_term_xyz123");
      expect(results.length).toBe(0);
    });

    it("returns empty for empty query", () => {
      const results = searchRecords(db, "");
      expect(results.length).toBe(0);
    });

    it("respects filters", () => {
      const results = searchRecords(db, "exec", { sessionKey: "session-a" });
      expect(results.every((r) => r.record.sessionKey === "session-a")).toBe(true);
    });
  });

  describe("getRecordsByDateRange", () => {
    it("returns records within range", () => {
      const results = getRecordsByDateRange(db, "2025-06-10T00:00:00Z", "2025-06-10T23:59:59Z");
      expect(results.length).toBe(2);
      expect(results.every((r) => r.record.ts.startsWith("2025-06-10"))).toBe(true);
    });

    it("returns all records for wide range", () => {
      const results = getRecordsByDateRange(db, "2025-01-01", "2025-12-31");
      expect(results.length).toBe(5);
    });

    it("returns empty for range with no records", () => {
      const results = getRecordsByDateRange(db, "2024-01-01", "2024-12-31");
      expect(results.length).toBe(0);
    });

    it("respects filters", () => {
      const results = getRecordsByDateRange(db, "2025-06-10", "2025-06-12T23:59:59Z", {
        toolName: "exec",
      });
      expect(results.every((r) => r.record.tool.name === "exec")).toBe(true);
    });
  });

  describe("getRecordsBySession", () => {
    it("returns records for a session", () => {
      const results = getRecordsBySession(db, "session-a");
      expect(results.length).toBe(2);
      expect(results.every((r) => r.record.sessionKey === "session-a")).toBe(true);
    });

    it("returns in ascending time order", () => {
      const results = getRecordsBySession(db, "session-a");
      expect(results[0].record.ts <= results[1].record.ts).toBe(true);
    });

    it("returns empty for unknown session", () => {
      const results = getRecordsBySession(db, "nonexistent");
      expect(results.length).toBe(0);
    });
  });

  describe("getRecentRecords", () => {
    it("returns most recent records", () => {
      const results = getRecentRecords(db, 3);
      expect(results.length).toBe(3);
      // Should be in descending time order
      expect(results[0].record.ts >= results[1].record.ts).toBe(true);
      expect(results[1].record.ts >= results[2].record.ts).toBe(true);
    });

    it("respects limit", () => {
      const results = getRecentRecords(db, 2);
      expect(results.length).toBe(2);
    });

    it("applies filters", () => {
      const results = getRecentRecords(db, 10, { toolName: "exec" });
      expect(results.every((r) => r.record.tool.name === "exec")).toBe(true);
    });

    it("filters by score", () => {
      const results = getRecentRecords(db, 10, { minScore: 0.8 });
      expect(results.every((r) => r.record.evaluation.score >= 0.8)).toBe(true);
    });

    it("filters by error status", () => {
      const results = getRecentRecords(db, 10, { isError: true });
      expect(results.length).toBe(1);
      expect(results[0].record.tool.isError).toBe(true);
    });
  });

  describe("getRecordsByTool", () => {
    it("returns records for a tool", () => {
      const results = getRecordsByTool(db, "exec");
      expect(results.length).toBe(2);
      expect(results.every((r) => r.record.tool.name === "exec")).toBe(true);
    });

    it("returns empty for unused tool", () => {
      const results = getRecordsByTool(db, "browser");
      expect(results.length).toBe(0);
    });
  });

  describe("getRecordById", () => {
    it("finds a record by ID", () => {
      const result = getRecordById(db, "r1");
      expect(result).not.toBeNull();
      expect(result?.record.id).toBe("r1");
      expect(result?.record.tool.name).toBe("exec");
    });

    it("returns null for unknown ID", () => {
      const result = getRecordById(db, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getSessionSummary", () => {
    it("builds summary from records when no session data exists", () => {
      const summary = getSessionSummary(db, "session-a");
      expect(summary).not.toBeNull();
      expect(summary?.sessionKey).toBe("session-a");
      expect(summary?.recordCount).toBe(2);
      expect(summary?.toolsUsed).toContain("exec");
      expect(summary?.toolsUsed).toContain("write");
    });

    it("uses stored session data when available", () => {
      upsertSession(db, {
        sessionKey: "session-a",
        startedAt: "2025-06-10T09:00:00Z",
        summary: "Testing session",
        topics: ["testing", "deployment"],
      });

      const summary = getSessionSummary(db, "session-a");
      expect(summary?.summary).toBe("Testing session");
      expect(summary?.topics).toEqual(["testing", "deployment"]);
      expect(summary?.recordCount).toBe(2);
    });

    it("returns null for unknown session", () => {
      const summary = getSessionSummary(db, "nonexistent");
      expect(summary).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("lists sessions with stats", () => {
      const sessions = listSessions(db);
      expect(sessions.length).toBe(3); // session-a, session-b, session-c

      const sessionA = sessions.find((s) => s.sessionKey === "session-a");
      expect(sessionA?.recordCount).toBe(2);
    });

    it("orders by most recent activity", () => {
      const sessions = listSessions(db);
      // session-c (June 13) should be first
      expect(sessions[0].sessionKey).toBe("session-c");
    });

    it("respects limit", () => {
      const sessions = listSessions(db, { limit: 2 });
      expect(sessions.length).toBe(2);
    });
  });

  describe("getToolStats", () => {
    it("returns aggregate stats by tool", () => {
      const stats = getToolStats(db);
      expect(stats.length).toBeGreaterThan(0);

      const execStats = stats.find((s) => s.toolName === "exec");
      expect(execStats?.count).toBe(2);
      expect(execStats?.errorCount).toBe(1);
    });
  });

  describe("getTraceEvents", () => {
    it("returns trace events", () => {
      insertTraceEvent(db, {
        type: "tool_result",
        ts: "2025-06-10T10:00:00Z",
        sessionKey: "session-a",
        runId: "run-1",
        toolName: "exec",
        toolCallId: "c1",
        isError: false,
        decision: "capture",
        score: 0.7,
        threshold: 0.6,
      } as any);

      const events = getTraceEvents(db, { sessionKey: "session-a" });
      expect(events.length).toBe(1);
    });

    it("filters by type", () => {
      insertTraceEvent(db, {
        type: "tool_result",
        ts: "2025-06-10T10:00:00Z",
        sessionKey: "s1",
        toolName: "exec",
        toolCallId: "c1",
        isError: false,
        decision: "capture",
      } as any);
      insertTraceEvent(db, {
        type: "session_end",
        ts: "2025-06-10T11:00:00Z",
        action: "stop",
        sessionKey: "s1",
      } as any);

      const results = getTraceEvents(db, { type: "session_end" });
      expect(results.length).toBe(1);
    });
  });
});
