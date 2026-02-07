import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MIGRATIONS, runMigrations, getCurrentVersion } from "./migrations.js";

const require = createRequire(import.meta.url);

function openTestDb(dbPath: string) {
  const mod = require("node:sqlite") as typeof import("node:sqlite");
  const db = new mod.DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

describe("migrations", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "meridia-migration-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("applies all migrations to a fresh database", () => {
    const db = openTestDb(dbPath);
    const result = runMigrations(db);
    expect(result.applied.length).toBeGreaterThanOrEqual(2);
    expect(result.applied).toContain("baseline");
    expect(result.applied).toContain("add_vector");
    expect(result.current).toBe(MIGRATIONS.length);
    db.close();
  });

  it("skips already-applied migrations on existing v1 database", () => {
    const db = openTestDb(dbPath);

    // Simulate an existing v1 database by running baseline only
    db.exec(`CREATE TABLE IF NOT EXISTS meridia_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(
      `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('schema_version', '1')`,
    ).run();
    db.exec(`CREATE TABLE IF NOT EXISTS meridia_records (
      id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL,
      session_key TEXT, session_id TEXT, run_id TEXT,
      tool_name TEXT, tool_call_id TEXT, is_error INTEGER DEFAULT 0,
      score REAL, threshold REAL, eval_kind TEXT, eval_model TEXT, eval_reason TEXT,
      tags_json TEXT, data_json TEXT NOT NULL, data_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS meridia_trace (
      id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL,
      session_key TEXT, data_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Insert a test record to verify it survives
    db.prepare(`INSERT INTO meridia_records (id, ts, kind, data_json) VALUES (?, ?, ?, ?)`).run(
      "test-id",
      new Date().toISOString(),
      "tool_result",
      "{}",
    );

    const result = runMigrations(db);
    // Baseline should be skipped (v1 already applied)
    expect(result.applied).not.toContain("baseline");
    expect(result.applied).toContain("add_vector");
    expect(result.current).toBe(MIGRATIONS.length);

    // Verify data survived
    const row = db.prepare(`SELECT id FROM meridia_records WHERE id = ?`).get("test-id") as
      | { id: string }
      | undefined;
    expect(row?.id).toBe("test-id");

    db.close();
  });

  it("getCurrentVersion returns correct version", () => {
    const db = openTestDb(dbPath);
    expect(getCurrentVersion(db)).toBe(0);

    runMigrations(db);
    expect(getCurrentVersion(db)).toBe(MIGRATIONS.length);

    db.close();
  });

  it("migrations run in order", () => {
    // Verify MIGRATIONS are ordered by version
    for (let i = 1; i < MIGRATIONS.length; i++) {
      expect(MIGRATIONS[i].version).toBeGreaterThan(MIGRATIONS[i - 1].version);
    }
  });
});
