/**
 * Transactional config changes with automatic rollback on startup failure.
 *
 * When a config change is applied with `rollbackOnFail: true`, a pending marker
 * is written before the change. On next startup, if the marker exists and the
 * gateway crashed quickly (within timeoutMs), the previous config is restored.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getLogger } from "../logging/logger.js";
import { CONFIG_PATH, STATE_DIR } from "./paths.js";

const log = getLogger();
const CONFIG_DIR = STATE_DIR;

const PENDING_MARKER_PATH = path.join(CONFIG_DIR, "config-pending.json");
const BACKUP_PATH = path.join(CONFIG_DIR, "openclaw.json.bak");
const FAILED_CONFIG_PATH = path.join(CONFIG_DIR, "openclaw.json.failed");
const ROLLBACK_HISTORY_PATH = path.join(CONFIG_DIR, "config-rollback-history.json");

// Dist backup paths (for code/schema rollback)
const DIST_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../");
const DIST_BACKUP_DIR = path.join(CONFIG_DIR, "dist.bak");

export interface ConfigPendingMarker {
  /** ISO timestamp when config change was applied */
  appliedAt: string;
  /** Path to backup file */
  rollbackTo: string;
  /** Path to dist backup (for code/schema rollback) */
  distBackupPath?: string;
  /** Crash detection window in ms */
  timeoutMs: number;
  /** What triggered the change */
  reason?: string;
  /** Session to notify on rollback */
  sessionKey?: string;
}

export interface PendingMarkerOptions {
  timeoutMs?: number;
  reason?: string;
  sessionKey?: string;
  /** Include dist in rollback (uses last-known-good backup) */
  includeDistRollback?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Backup the dist/ directory for code rollback.
 * Call this before building new code.
 */
export async function backupDist(): Promise<string | null> {
  try {
    // Remove old backup if exists
    await fs.rm(DIST_BACKUP_DIR, { recursive: true, force: true });
    await copyDir(DIST_DIR, DIST_BACKUP_DIR);
    log.info(`config-pending: backed up dist to ${DIST_BACKUP_DIR}`);
    return DIST_BACKUP_DIR;
  } catch (err) {
    log.warn(`config-pending: failed to backup dist: ${err}`);
    return null;
  }
}

/**
 * Restore dist/ from backup.
 */
async function restoreDist(backupPath: string): Promise<boolean> {
  try {
    await fs.rm(DIST_DIR, { recursive: true, force: true });
    await copyDir(backupPath, DIST_DIR);
    log.info(`config-pending: restored dist from ${backupPath}`);
    return true;
  } catch (err) {
    log.error(`config-pending: failed to restore dist: ${err}`);
    return false;
  }
}

/**
 * Write a pending marker before applying a config change.
 * Also backs up the current config to .bak.
 */
export async function writePendingMarker(opts: PendingMarkerOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Backup current config
  try {
    await fs.copyFile(CONFIG_PATH, BACKUP_PATH);
    log.debug(`config-pending: backed up config to ${BACKUP_PATH}`);
  } catch (err) {
    log.warn(`config-pending: failed to backup config: ${err}`);
    // Continue anyway - we'll still write the marker
  }

  // Check if we should include dist in rollback (uses existing last-known-good backup)
  let distBackupPath: string | undefined;
  if (opts.includeDistRollback) {
    try {
      await fs.access(DIST_BACKUP_DIR);
      distBackupPath = DIST_BACKUP_DIR;
      log.debug(`config-pending: will use existing dist backup at ${DIST_BACKUP_DIR}`);
    } catch {
      log.warn(
        `config-pending: dist rollback requested but no backup exists at ${DIST_BACKUP_DIR}`,
      );
    }
  }

  const marker: ConfigPendingMarker = {
    appliedAt: new Date().toISOString(),
    rollbackTo: BACKUP_PATH,
    distBackupPath,
    timeoutMs,
    reason: opts.reason,
    sessionKey: opts.sessionKey,
  };

  await fs.writeFile(PENDING_MARKER_PATH, JSON.stringify(marker, null, 2), "utf-8");
  log.debug(
    `config-pending: wrote pending marker (timeout=${timeoutMs}ms, distBackup=${!!distBackupPath})`,
  );
}

/**
 * Clear the pending marker (called after successful startup or rollback).
 */
export async function clearPendingMarker(): Promise<void> {
  try {
    await fs.unlink(PENDING_MARKER_PATH);
    log.debug("config-pending: cleared pending marker");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`config-pending: failed to clear pending marker: ${err}`);
    }
  }
}

export interface RollbackResult {
  /** Whether a rollback was performed */
  rolledBack: boolean;
  /** Error message if rollback occurred */
  error?: string;
  /** Session key to notify */
  sessionKey?: string;
  /** Reason from the original change */
  reason?: string;
  /** Path to the failed config file (if saved) */
  failedConfigPath?: string;
  /** Whether dist was also rolled back */
  distRolledBack?: boolean;
}

export interface RollbackHistoryEntry {
  /** ISO timestamp when rollback occurred */
  at: string;
  /** Reason from the original change */
  reason?: string;
  /** How long the gateway ran before crashing (ms) */
  elapsedMs: number;
  /** Path to the failed config file */
  failedConfigPath?: string;
  /** Whether dist was also rolled back */
  distRolledBack?: boolean;
}

/**
 * Append an entry to the rollback history file.
 */
async function appendRollbackHistory(entry: RollbackHistoryEntry): Promise<void> {
  let history: RollbackHistoryEntry[] = [];
  try {
    const content = await fs.readFile(ROLLBACK_HISTORY_PATH, "utf-8");
    history = JSON.parse(content) as RollbackHistoryEntry[];
    if (!Array.isArray(history)) history = [];
  } catch {
    // File doesn't exist or invalid - start fresh
  }

  // Keep last 50 entries to prevent unbounded growth
  history = [...history.slice(-49), entry];
  await fs.writeFile(ROLLBACK_HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
  log.debug(`config-pending: appended rollback to history (${history.length} entries)`);
}

/**
 * Check for pending marker on startup and rollback if needed.
 * Should be called early in gateway startup, before loading config.
 *
 * Returns info about whether rollback occurred (for error injection).
 */
export async function checkPendingOnStartup(): Promise<RollbackResult> {
  let marker: ConfigPendingMarker;

  // Try to read the pending marker
  try {
    const content = await fs.readFile(PENDING_MARKER_PATH, "utf-8");
    marker = JSON.parse(content) as ConfigPendingMarker;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // No pending marker - normal startup
      return { rolledBack: false };
    }
    log.warn(`config-pending: failed to read pending marker: ${err}`);
    return { rolledBack: false };
  }

  // Check if we crashed within the timeout window
  const appliedAt = new Date(marker.appliedAt).getTime();
  const now = Date.now();
  const elapsed = now - appliedAt;

  if (elapsed >= marker.timeoutMs) {
    // Config change succeeded - clear marker and continue
    log.info(
      `config-pending: config change successful (ran for ${Math.round(elapsed / 1000)}s), clearing marker`,
    );
    await clearPendingMarker();
    return { rolledBack: false };
  }

  // We crashed too quickly - rollback needed
  log.warn(
    `config-pending: startup crash detected (elapsed=${elapsed}ms < timeout=${marker.timeoutMs}ms), rolling back`,
  );

  // Capture error from logs if possible
  let capturedError: string | undefined;
  try {
    // Try to read last few lines of the log file for context
    const logDir = process.env.OPENCLAW_LOG_DIR ?? "/tmp/openclaw";
    const today = new Date().toISOString().split("T")[0];
    const logPath = path.join(logDir, `openclaw-${today}.log`);
    const logContent = await fs.readFile(logPath, "utf-8").catch(() => "");
    const lines = logContent.split("\n").slice(-50);
    const errorLines = lines.filter(
      (line) => line.includes("error") || line.includes("Error") || line.includes("FATAL"),
    );
    if (errorLines.length > 0) {
      capturedError = errorLines.slice(-3).join("\n");
    }
  } catch {
    // Ignore log capture errors
  }

  // Save the failed config before restoring
  let failedConfigPath: string | undefined;
  try {
    await fs.copyFile(CONFIG_PATH, FAILED_CONFIG_PATH);
    failedConfigPath = FAILED_CONFIG_PATH;
    log.info(`config-pending: saved failed config to ${FAILED_CONFIG_PATH}`);
  } catch (err) {
    log.warn(`config-pending: failed to save failed config: ${err}`);
  }

  // Perform config rollback
  try {
    await fs.copyFile(marker.rollbackTo, CONFIG_PATH);
    log.info(`config-pending: restored config from ${marker.rollbackTo}`);
  } catch (err) {
    log.error(`config-pending: CRITICAL - failed to restore config: ${err}`);
    // Clear marker anyway to prevent rollback loop
    await clearPendingMarker();
    return {
      rolledBack: false,
      error: `Failed to restore config: ${err}`,
    };
  }

  // Perform dist rollback if we have a backup
  let distRolledBack = false;
  if (marker.distBackupPath) {
    distRolledBack = await restoreDist(marker.distBackupPath);
    if (!distRolledBack) {
      log.warn(`config-pending: dist rollback failed, continuing with config-only rollback`);
    }
  }

  // Append to rollback history
  try {
    await appendRollbackHistory({
      at: new Date().toISOString(),
      reason: marker.reason,
      elapsedMs: elapsed,
      failedConfigPath,
      distRolledBack,
    });
  } catch (err) {
    log.warn(`config-pending: failed to append to rollback history: ${err}`);
  }

  await clearPendingMarker();

  const distNote = distRolledBack ? " Code (dist/) was also rolled back." : "";
  const errorMsg = capturedError
    ? `Startup failed within ${marker.timeoutMs}ms of config change.${distNote}\nLast errors:\n${capturedError}`
    : `Startup failed within ${marker.timeoutMs}ms of config change (reason: ${marker.reason ?? "unknown"}).${distNote}`;

  return {
    rolledBack: true,
    error: errorMsg,
    sessionKey: marker.sessionKey,
    reason: marker.reason,
    failedConfigPath,
    distRolledBack,
  };
}

/**
 * Schedule clearing the pending marker after successful startup.
 * Also backs up dist/ as "last known good" for future rollbacks.
 * Call this once the gateway is confirmed running.
 */
export function schedulePendingMarkerClear(delayMs: number = 5000): void {
  setTimeout(async () => {
    try {
      const exists = await fs
        .access(PENDING_MARKER_PATH)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await clearPendingMarker();
        log.info("config-pending: startup confirmed successful, marker cleared");
      }

      // Backup current dist as "last known good" for future rollbacks
      await backupDist();
      log.info("config-pending: dist backed up as last-known-good");
    } catch (err) {
      log.warn(`config-pending: failed to clear marker or backup dist: ${err}`);
    }
  }, delayMs);
}
