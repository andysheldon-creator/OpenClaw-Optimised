/**
 * File-based persistence for automations.
 *
 * Provides atomic read/write operations for the automations store,
 * with automatic backups and migration support.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AutomationStoreFile } from "./types.js";
import { CONFIG_DIR } from "../utils.js";

/** Default directory for automations state */
export const DEFAULT_AUTOMATIONS_DIR = path.join(CONFIG_DIR, "automations");

/** Default path to the automations store file */
export const DEFAULT_AUTOMATIONS_STORE_PATH = path.join(
  DEFAULT_AUTOMATIONS_DIR,
  "automations.json",
);

/**
 * Resolve the automations store path from a potentially relative path.
 * Expands ~ to home directory and resolves relative paths.
 */
export function resolveAutomationsStorePath(storePath?: string): string {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(raw.replace("~", os.homedir()));
    }
    return path.resolve(raw);
  }
  return DEFAULT_AUTOMATIONS_STORE_PATH;
}

/**
 * Default history retention: 30 days
 */
const DEFAULT_HISTORY_RETENTION_DAYS = 30;

/**
 * Default maximum runs per automation: 100
 */
const DEFAULT_HISTORY_MAX_RUNS = 100;

/**
 * Load the automations store from disk.
 * Returns a valid store structure even if the file doesn't exist or is corrupt.
 */
export async function loadAutomationsStore(storePath: string): Promise<AutomationStoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AutomationStoreFile> | null;

    // Validate or default automations array
    const automations = Array.isArray(parsed?.automations)
      ? parsed.automations.filter(Boolean)
      : [];

    // Validate or default run history
    const runHistory = Array.isArray(parsed?.runHistory) ? parsed.runHistory.filter(Boolean) : [];

    return {
      version: 1,
      automations: automations,
      runHistory: runHistory,
      historyRetentionDays: parsed?.historyRetentionDays ?? DEFAULT_HISTORY_RETENTION_DAYS,
      historyMaxRunsPerAutomation: parsed?.historyMaxRunsPerAutomation ?? DEFAULT_HISTORY_MAX_RUNS,
    };
  } catch {
    // File doesn't exist or is corrupt - return empty store
    return {
      version: 1,
      automations: [],
      runHistory: [],
      historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS,
      historyMaxRunsPerAutomation: DEFAULT_HISTORY_MAX_RUNS,
    };
  }
}

/**
 * Save the automations store to disk atomically.
 * Uses a temp file + rename pattern to ensure atomicity.
 * Creates a backup as a best-effort operation.
 */
export async function saveAutomationsStore(
  storePath: string,
  store: AutomationStoreFile,
): Promise<void> {
  // Ensure the directory exists
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });

  // Write to a temporary file first
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");

  // Atomic rename
  await fs.promises.rename(tmp, storePath);

  // Best-effort backup
  try {
    await fs.promises.copyFile(storePath, `${storePath}.bak`);
  } catch {
    // Ignore backup errors
  }
}

/**
 * Remove old run history based on retention policy.
 * Cleans up runs older than historyRetentionDays and enforces
 * historyMaxRunsPerAutomation limit.
 */
export function cleanOldHistory(store: AutomationStoreFile): void {
  const nowMs = Date.now();
  const retentionMs = store.historyRetentionDays * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - retentionMs;

  // Group runs by automation ID
  const runsByAutomation = new Map<string, typeof store.runHistory>();
  for (const run of store.runHistory) {
    const runs = runsByAutomation.get(run.automationId) ?? [];
    runs.push(run);
    runsByAutomation.set(run.automationId, runs);
  }

  // Filter runs: keep recent runs and enforce per-automation limit
  const cleanedRuns: typeof store.runHistory = [];
  for (const run of store.runHistory) {
    const runTimeMs = run.startedAt.getTime();

    // Skip runs older than retention period
    if (runTimeMs < cutoffMs) {
      continue;
    }

    // Get all runs for this automation and sort by time (newest first)
    const automationRuns = runsByAutomation.get(run.automationId) ?? [];
    const sortedRuns = [...automationRuns].toSorted(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );

    // Find position of this run in sorted list
    const position = sortedRuns.findIndex((r) => r.id === run.id);

    // Keep if within max runs limit
    if (position < store.historyMaxRunsPerAutomation) {
      cleanedRuns.push(run);
    }
  }

  store.runHistory = cleanedRuns;
}
