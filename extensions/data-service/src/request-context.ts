/**
 * Request-scoped context for multi-tenant support.
 *
 * For Wexa Coworker Web integration:
 * - Context (orgId/userId) MUST be set via data-service.setContext gateway method
 * - Context is stored per-session and automatically looked up during tool execution
 *
 * Architecture:
 * 1. Session-keyed Map stores context with TTL (primary storage)
 * 2. before_tool_call hook sets currentSessionKey for context lookup
 * 3. Tools call getRequestContext() to retrieve orgId/userId
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Context passed per-request for multi-tenant isolation */
export type DataServiceRequestContext = {
  orgId: string;
  userId: string;
  /** Optional project ID */
  projectId?: string;
  /** Optional API key override */
  apiKey?: string;
};

/** AsyncLocalStorage instance for request-scoped context (fallback) */
const requestContextStorage = new AsyncLocalStorage<DataServiceRequestContext>();

/**
 * Session-keyed context store.
 * Primary storage for multi-tenant context.
 * Key: sessionKey, Value: { context, expiresAt }
 */
const sessionContextStore = new Map<
  string,
  { context: DataServiceRequestContext; expiresAt: number }
>();

/** Context TTL in milliseconds (30 minutes for long-running sessions) */
const CONTEXT_TTL_MS = 30 * 60 * 1000;

/**
 * Current session key for the executing tool.
 * Set by the before_tool_call hook, cleared by after_tool_call.
 */
let currentSessionKey: string | undefined;

/**
 * Set the current session key (called by before_tool_call hook).
 */
export function setCurrentSessionKey(sessionKey: string | undefined): void {
  currentSessionKey = sessionKey;
}

/**
 * Clear the current session key (called by after_tool_call hook).
 */
export function clearCurrentSessionKey(): void {
  currentSessionKey = undefined;
}

/**
 * Get the current request context (orgId/userId).
 *
 * Lookup order:
 * 1. Session store using currentSessionKey (set by before_tool_call hook)
 * 2. Session store using provided sessionKey
 * 3. AsyncLocalStorage (fallback)
 *
 * Returns undefined if no context is set — tools should return an error.
 */
export function getRequestContext(sessionKey?: string): DataServiceRequestContext | undefined {
  // Primary: use currentSessionKey (set by before_tool_call hook)
  if (currentSessionKey) {
    const entry = sessionContextStore.get(currentSessionKey);
    if (entry && entry.expiresAt > Date.now()) {
      // Refresh TTL on access
      entry.expiresAt = Date.now() + CONTEXT_TTL_MS;
      return entry.context;
    }
    if (entry) {
      sessionContextStore.delete(currentSessionKey);
    }
  }

  // Try provided sessionKey
  if (sessionKey) {
    const entry = sessionContextStore.get(sessionKey);
    if (entry && entry.expiresAt > Date.now()) {
      entry.expiresAt = Date.now() + CONTEXT_TTL_MS;
      return entry.context;
    }
    if (entry) {
      sessionContextStore.delete(sessionKey);
    }
  }

  // Fallback: AsyncLocalStorage
  return requestContextStorage.getStore();
}

/**
 * Set context for a session key.
 * Called by data-service.setContext gateway method.
 */
export function setSessionContext(sessionKey: string, context: DataServiceRequestContext): void {
  sessionContextStore.set(sessionKey, {
    context,
    expiresAt: Date.now() + CONTEXT_TTL_MS,
  });

  // Periodic cleanup of expired entries (when store gets large)
  if (sessionContextStore.size > 100) {
    cleanupExpiredSessions();
  }
}

/**
 * Clear context for a session key.
 * Called by data-service.clearContext gateway method.
 */
export function clearSessionContext(sessionKey: string): void {
  sessionContextStore.delete(sessionKey);
}

/**
 * Get the number of active sessions with context.
 * Used by data-service.status gateway method.
 */
export function getSessionContextCount(): number {
  // Clean up expired entries first
  cleanupExpiredSessions();
  return sessionContextStore.size;
}

/**
 * Clean up expired session contexts.
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [key, entry] of sessionContextStore) {
    if (entry.expiresAt < now) {
      sessionContextStore.delete(key);
    }
  }
}

/**
 * Run a function with request context (AsyncLocalStorage).
 * Primarily for testing or special cases.
 */
export function runWithRequestContext<T>(context: DataServiceRequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Run an async function with request context (AsyncLocalStorage).
 * Primarily for testing or special cases.
 */
export function runWithRequestContextAsync<T>(
  context: DataServiceRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(context, fn);
}
