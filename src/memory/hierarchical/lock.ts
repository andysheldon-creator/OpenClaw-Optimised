/**
 * Simple file-based locking for the hierarchical memory worker.
 * Prevents concurrent runs from multiple processes.
 *
 * Atomicity is provided by `writeFile` with the `wx` flag (create-exclusive).
 * Only one process can successfully create the lock file; all others get EEXIST.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveSummariesDir } from "./storage.js";

const LOCK_FILENAME = ".worker.lock";
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

export type WorkerLock = {
  release: () => Promise<void>;
};

/** Try to create the lock file atomically. Returns null if it already exists. */
async function tryCreateLock(lockPath: string): Promise<WorkerLock | null> {
  const lockContent = JSON.stringify({
    pid: process.pid,
    acquiredAt: Date.now(),
  });

  try {
    await fs.writeFile(lockPath, lockContent, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return null;
    }
    throw err;
  }

  return {
    release: async () => {
      try {
        await fs.unlink(lockPath);
      } catch {
        // Ignore errors on release (file may already be removed)
      }
    },
  };
}

/** Acquire a lock for the summary worker. Returns null if already locked. */
export async function acquireSummaryLock(agentId?: string): Promise<WorkerLock | null> {
  const lockPath = path.join(resolveSummariesDir(agentId), LOCK_FILENAME);

  // Ensure directory exists
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  // First attempt: try to create the lock file
  const firstAttempt = await tryCreateLock(lockPath);
  if (firstAttempt) {
    return firstAttempt;
  }

  // Lock file exists — check if it's stale
  try {
    const stat = await fs.stat(lockPath);
    const age = Date.now() - stat.mtimeMs;

    if (age < LOCK_STALE_MS) {
      return null; // Lock is fresh, another process holds it
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Lock was released between our failed create and this stat — retry
      return tryCreateLock(lockPath);
    }
    throw err;
  }

  // Lock is stale — remove and retry. If another process also removes the stale
  // lock, unlink may fail (harmless). The subsequent tryCreateLock is atomic:
  // only one process wins the `wx` create.
  await fs.unlink(lockPath).catch(() => {});
  return tryCreateLock(lockPath);
}

/** Check if a lock is currently held (without acquiring) */
export async function isLockHeld(agentId?: string): Promise<boolean> {
  const lockPath = path.join(resolveSummariesDir(agentId), LOCK_FILENAME);

  try {
    const stat = await fs.stat(lockPath);
    const age = Date.now() - stat.mtimeMs;
    return age < LOCK_STALE_MS;
  } catch {
    return false;
  }
}
