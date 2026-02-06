import fs from "node:fs/promises";
import type { WorkItem } from "./types.js";
import { type WorkQueueStore, getDefaultWorkQueueStore, resolveWorkQueueDbPath } from "./store.js";

export type RecoveryResult = {
  recovered: WorkItem[];
  failed: Array<{ itemId: string; error: string }>;
};

/**
 * Scan for in_progress work items and reset them to pending.
 * Called on gateway startup to recover from crashes/restarts.
 *
 * Accepts an optional store for testing; defaults to the global singleton.
 * When using the default store, skips recovery if the DB file doesn't exist
 * (avoids creating an empty SQLite DB on gateways that never use the work queue).
 */
export async function recoverOrphanedWorkItems(store?: WorkQueueStore): Promise<RecoveryResult> {
  if (!store) {
    // Skip if the work queue DB has never been created.
    const dbPath = resolveWorkQueueDbPath();
    try {
      await fs.access(dbPath);
    } catch {
      return { recovered: [], failed: [] };
    }
    store = await getDefaultWorkQueueStore();
  }

  const recovered: WorkItem[] = [];
  const failed: Array<{ itemId: string; error: string }> = [];

  const orphaned = await store.listItems({ status: "in_progress" });

  for (const item of orphaned) {
    try {
      const previousAssignment =
        item.assignedTo?.sessionKey ?? item.assignedTo?.agentId ?? "unknown";
      const updated = await store.updateItem(item.id, {
        status: "pending",
        statusReason: `Recovered after gateway restart (was assigned to ${previousAssignment})`,
        assignedTo: undefined,
        startedAt: undefined,
      });
      recovered.push(updated);
    } catch (err) {
      failed.push({
        itemId: item.id,
        error: String(err),
      });
    }
  }

  return { recovered, failed };
}
