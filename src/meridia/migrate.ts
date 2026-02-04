/**
 * Meridia JSONL → SQLite migration.
 *
 * Reads existing JSONL files from `~/.openclaw/meridia/` and inserts them
 * into the SQLite database.  JSONL files are kept as backup — this is an
 * additive migration, not destructive.
 */

import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import { insertRecordsBatch, insertTraceEventsBatch, openMeridiaDb } from "./db.js";
import { resolveMeridiaDir } from "./storage.js";

// ─── Types ───────────────────────────────────────────────────────────

export type MigrationResult = {
  recordsFound: number;
  recordsInserted: number;
  traceEventsFound: number;
  traceEventsInserted: number;
  filesProcessed: number;
  errors: Array<{ file: string; line: number; error: string }>;
  durationMs: number;
};

export type MigrationProgress = {
  phase: "records" | "trace" | "done";
  currentFile: string;
  filesProcessed: number;
  totalFiles: number;
  recordsFound: number;
  recordsInserted: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Read a JSONL file and parse each line, yielding parsed objects.
 */
function readJsonlFile<T>(filePath: string): Array<{ line: number; data: T; error?: string }> {
  const results: Array<{ line: number; data: T; error?: string }> = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return results;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line) as T;
      results.push({ line: i + 1, data: parsed });
    } catch (err) {
      results.push({
        line: i + 1,
        data: null as unknown as T,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/**
 * List all JSONL files in a directory (non-recursive).
 */
function listJsonlFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Validate that a parsed object looks like a MeridiaExperienceRecord.
 */
function isExperienceRecord(obj: unknown): obj is MeridiaExperienceRecord {
  if (!obj || typeof obj !== "object") return false;
  const rec = obj as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.ts === "string" &&
    rec.tool !== null &&
    typeof rec.tool === "object" &&
    rec.evaluation !== null &&
    typeof rec.evaluation === "object"
  );
}

/**
 * Validate that a parsed object looks like a MeridiaTraceEvent.
 */
function isTraceEvent(obj: unknown): obj is MeridiaTraceEvent {
  if (!obj || typeof obj !== "object") return false;
  const evt = obj as Record<string, unknown>;
  return typeof evt.type === "string" && typeof evt.ts === "string";
}

// ─── Migration ───────────────────────────────────────────────────────

/**
 * Migrate all JSONL data to SQLite.
 *
 * @param params.cfg - OpenClaw config for directory resolution
 * @param params.db - Optional pre-opened database handle
 * @param params.onProgress - Optional progress callback
 * @param params.meridiaDir - Override meridia directory
 */
export function migrateJsonlToSqlite(params?: {
  cfg?: OpenClawConfig;
  db?: DatabaseSync;
  meridiaDir?: string;
  onProgress?: (progress: MigrationProgress) => void;
}): MigrationResult {
  const startedAt = Date.now();
  const meridiaDir = params?.meridiaDir ?? resolveMeridiaDir(params?.cfg);
  const db = params?.db ?? openMeridiaDb({ cfg: params?.cfg });

  const result: MigrationResult = {
    recordsFound: 0,
    recordsInserted: 0,
    traceEventsFound: 0,
    traceEventsInserted: 0,
    filesProcessed: 0,
    errors: [],
    durationMs: 0,
  };

  // ── Phase 1: Experiential records ──
  const recordsDir = path.join(meridiaDir, "records", "experiential");
  const recordFiles = listJsonlFiles(recordsDir);
  const traceDir = path.join(meridiaDir, "trace");
  const traceFiles = listJsonlFiles(traceDir);
  const totalFiles = recordFiles.length + traceFiles.length;

  for (const filePath of recordFiles) {
    params?.onProgress?.({
      phase: "records",
      currentFile: path.basename(filePath),
      filesProcessed: result.filesProcessed,
      totalFiles,
      recordsFound: result.recordsFound,
      recordsInserted: result.recordsInserted,
    });

    const entries = readJsonlFile<MeridiaExperienceRecord>(filePath);
    const validRecords: MeridiaExperienceRecord[] = [];

    for (const entry of entries) {
      if (entry.error) {
        result.errors.push({
          file: filePath,
          line: entry.line,
          error: entry.error,
        });
        continue;
      }

      if (isExperienceRecord(entry.data)) {
        validRecords.push(entry.data);
        result.recordsFound++;
      } else {
        result.errors.push({
          file: filePath,
          line: entry.line,
          error: "Invalid record structure",
        });
      }
    }

    if (validRecords.length > 0) {
      const inserted = insertRecordsBatch(db, validRecords);
      result.recordsInserted += inserted;
    }

    result.filesProcessed++;
  }

  // ── Phase 2: Trace events ──
  for (const filePath of traceFiles) {
    params?.onProgress?.({
      phase: "trace",
      currentFile: path.basename(filePath),
      filesProcessed: result.filesProcessed,
      totalFiles,
      recordsFound: result.recordsFound,
      recordsInserted: result.recordsInserted,
    });

    const entries = readJsonlFile<MeridiaTraceEvent>(filePath);
    const validEvents: MeridiaTraceEvent[] = [];

    for (const entry of entries) {
      if (entry.error) {
        result.errors.push({
          file: filePath,
          line: entry.line,
          error: entry.error,
        });
        continue;
      }

      if (isTraceEvent(entry.data)) {
        validEvents.push(entry.data);
        result.traceEventsFound++;
      } else {
        result.errors.push({
          file: filePath,
          line: entry.line,
          error: "Invalid trace event structure",
        });
      }
    }

    if (validEvents.length > 0) {
      const inserted = insertTraceEventsBatch(db, validEvents);
      result.traceEventsInserted += inserted;
    }

    result.filesProcessed++;
  }

  params?.onProgress?.({
    phase: "done",
    currentFile: "",
    filesProcessed: result.filesProcessed,
    totalFiles,
    recordsFound: result.recordsFound,
    recordsInserted: result.recordsInserted,
  });

  result.durationMs = Date.now() - startedAt;
  return result;
}

/**
 * Check if migration has already been performed.
 */
export function isMigrated(db: DatabaseSync): boolean {
  try {
    const row = db
      .prepare(`SELECT value FROM meridia_meta WHERE key = 'jsonl_migration_completed'`)
      .get() as { value: string } | undefined;
    return row?.value === "true";
  } catch {
    return false;
  }
}

/**
 * Mark migration as completed.
 */
export function markMigrationComplete(db: DatabaseSync, result: MigrationResult): void {
  db.prepare(
    `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('jsonl_migration_completed', 'true')`,
  ).run();
  db.prepare(
    `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('jsonl_migration_ts', ?)`,
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('jsonl_migration_result', ?)`,
  ).run(JSON.stringify(result));
}
