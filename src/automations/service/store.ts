/**
 * Store operations for AutomationService.
 *
 * Provides functions for loading the store, persisting changes,
 * and warning when operations are performed while disabled.
 *
 * Follows the same pattern as CronService's store operations.
 */

import type { AutomationServiceState } from "./state.js";
import { cleanOldHistory, loadAutomationsStore, saveAutomationsStore } from "../store.js";

/** In-memory cache of loaded stores by path */
const storeCache = new Map<string, import("../types.js").AutomationStoreFile>();

/**
 * Ensure the store is loaded into memory.
 * Uses a cache to avoid reloading the same store multiple times.
 *
 * @param state - Service state to load the store into
 */
export async function ensureLoaded(state: AutomationServiceState): Promise<void> {
  if (state.store) {
    return;
  }

  const cached = storeCache.get(state.deps.storePath);
  if (cached) {
    state.store = cached;
    return;
  }

  const loaded = await loadAutomationsStore(state.deps.storePath);

  // Clean old history on load
  cleanOldHistory(loaded);

  state.store = loaded;
  storeCache.set(state.deps.storePath, state.store);
}

/**
 * Emit a warning if automations are disabled.
 * Only warns once to avoid spamming logs.
 *
 * @param state - Service state
 * @param action - The action being attempted
 */
export function warnIfDisabled(state: AutomationServiceState, action: string): void {
  if (state.deps.automationsEnabled) {
    return;
  }
  if (state.warnedDisabled) {
    return;
  }

  state.warnedDisabled = true;
  state.deps.log.warn(
    {
      enabled: false,
      action,
      storePath: state.deps.storePath,
    },
    "automations: disabled; automations will not run automatically",
  );
}

/**
 * Persist the current store state to disk.
 *
 * @param state - Service state containing the store to persist
 */
export async function persist(state: AutomationServiceState): Promise<void> {
  if (!state.store) {
    return;
  }
  await saveAutomationsStore(state.deps.storePath, state.store);
}
