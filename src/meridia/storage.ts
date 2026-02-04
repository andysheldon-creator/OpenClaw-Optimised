import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import { resolveHookConfig } from "../hooks/config.js";
import { resolveUserPath } from "../utils.js";

export function dateKeyUtc(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function resolveOpenClawStateDir(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateDir) {
    return resolveUserPath(stateDir);
  }
  return path.join(os.homedir(), ".openclaw");
}

function readHookDirOverride(cfg: OpenClawConfig | undefined, hookKey: string): string | undefined {
  const hookCfg = resolveHookConfig(cfg, hookKey);
  const raw = (hookCfg?.dir as unknown) ?? (hookCfg?.path as unknown);
  const dir = typeof raw === "string" ? raw.trim() : "";
  return dir ? resolveUserPath(dir) : undefined;
}

export function resolveMeridiaDir(cfg?: OpenClawConfig, hookKey?: string): string {
  if (cfg) {
    if (hookKey) {
      const override = readHookDirOverride(cfg, hookKey);
      if (override) {
        return override;
      }
    } else {
      const keys = ["experiential-capture", "compaction", "session-end"];
      for (const key of keys) {
        const override = readHookDirOverride(cfg, key);
        if (override) {
          return override;
        }
      }
    }
  }
  return path.join(resolveOpenClawStateDir(), "meridia");
}

export async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code) {
      if ((err as { code?: string }).code === "ENOENT") {
        return null;
      }
    }
    throw err;
  }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

// ─── Dual-write support ─────────────────────────────────────────────
// These functions write to both JSONL (for backward compatibility) and
// SQLite (for structured queries).  SQLite failures are non-fatal.

let _sqliteEnabled: boolean | undefined;

/**
 * Check whether SQLite dual-write is enabled.
 * Defaults to true if node:sqlite is available.
 */
function isSqliteEnabled(): boolean {
  if (_sqliteEnabled !== undefined) return _sqliteEnabled;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:sqlite");
    _sqliteEnabled = true;
  } catch {
    _sqliteEnabled = false;
  }
  return _sqliteEnabled;
}

/**
 * Lazily import the db module to avoid loading sqlite at module parse time.
 */
async function getDbModule() {
  return await import("./db.js");
}

/**
 * Append an experiential record to both JSONL and SQLite.
 * JSONL write happens first (primary), SQLite is best-effort.
 */
export async function appendExperientialRecord(
  filePath: string,
  record: MeridiaExperienceRecord,
  cfg?: OpenClawConfig,
): Promise<void> {
  // Primary: JSONL
  await appendJsonl(filePath, record);

  // Secondary: SQLite (best-effort)
  if (isSqliteEnabled()) {
    try {
      const { openMeridiaDb, insertRecord } = await getDbModule();
      const db = openMeridiaDb({ cfg });
      insertRecord(db, record);
    } catch {
      // SQLite write failure is non-fatal — JSONL is the source of truth
    }
  }
}

/**
 * Append a trace event to both JSONL and SQLite.
 * JSONL write happens first (primary), SQLite is best-effort.
 */
export async function appendTraceEvent(
  filePath: string,
  event: MeridiaTraceEvent,
  cfg?: OpenClawConfig,
): Promise<void> {
  // Primary: JSONL
  await appendJsonl(filePath, event);

  // Secondary: SQLite (best-effort)
  if (isSqliteEnabled()) {
    try {
      const { openMeridiaDb, insertTraceEvent } = await getDbModule();
      const db = openMeridiaDb({ cfg });
      insertTraceEvent(db, event);
    } catch {
      // SQLite write failure is non-fatal — JSONL is the source of truth
    }
  }
}

/**
 * Force-enable or disable SQLite dual-write.  Mainly for testing.
 */
export function setSqliteEnabled(enabled: boolean | undefined): void {
  _sqliteEnabled = enabled;
}
