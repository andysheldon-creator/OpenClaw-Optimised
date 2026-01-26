/**
 * Discord Presence Registry
 *
 * A simple registry for presence managers that can be accessed by both
 * the Discord provider and the Discord extension plugin.
 */

import type { PresenceManager } from "./monitor/presence-manager.js";

// Global registry for presence managers
const presenceManagers = new Map<string, PresenceManager>();

/**
 * Register a presence manager for an account
 */
export function registerPresenceManager(accountId: string, manager: PresenceManager): void {
  presenceManagers.set(accountId, manager);
}

/**
 * Unregister a presence manager for an account
 */
export function unregisterPresenceManager(accountId: string): void {
  presenceManagers.delete(accountId);
}

/**
 * Get a presence manager for an account
 */
export function getPresenceManager(accountId: string): PresenceManager | undefined {
  return presenceManagers.get(accountId);
}

/**
 * Get all registered presence managers
 */
export function getAllPresenceManagers(): Map<string, PresenceManager> {
  return presenceManagers;
}
