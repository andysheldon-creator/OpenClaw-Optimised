/**
 * Simple file-based locking for the hierarchical memory worker.
 * Prevents concurrent runs from multiple processes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveSummariesDir } from "./storage.js";

const LOCK_FILENAME = ".worker.lock";
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

export type WorkerLock = {
  release: () => Promise<void>;
};

/** Acquire a lock for the summary worker. Returns null if already locked. */
export async function acquireSummaryLock(agentId?: string): Promise<WorkerLock | null> {
  const lockPath = path.join(resolveSummariesDir(agentId), LOCK_FILENAME);

  try {
    // Check for existing lock
    try {
      const stat = await fs.stat(lockPath);
      const age = Date.now() - stat.mtimeMs;

      if (age < LOCK_STALE_MS) {
        // Lock is held and not stale
        return null;
      }

      // Lock is stale, remove it
      await fs.unlink(lockPath).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      // Lock doesn't exist, proceed
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    // Create lock file with PID
    const lockContent = JSON.stringify({
      pid: process.pid,
      acquiredAt: Date.now(),
    });

    await fs.writeFile(lockPath, lockContent, { flag: "wx" });

    return {
      release: async () => {
        try {
          await fs.unlink(lockPath);
        } catch {
          // Ignore errors on release
        }
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // Another process created the lock between our check and write
      return null;
    }
    throw err;
  }
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
