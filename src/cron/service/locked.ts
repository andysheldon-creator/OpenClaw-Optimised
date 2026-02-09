import type { CronServiceState } from "./state.js";

const storeLocks = new Map<string, Promise<void>>();

const resolveChain = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    () => undefined,
  );

/**
 * Timestamp (from state.deps.nowMs) when the current locked operation
 * started, or null if no operation is in progress. Checked by onTimer
 * to detect and log potentially stuck operations without using
 * setTimeout (which interferes with fake timers in tests).
 */
export let lockAcquiredAtMs: number | null = null;

/** Threshold after which the lock is considered potentially stuck. */
export const LOCK_WARN_MS = 2 * 60_000; // 2 minutes

export async function locked<T>(state: CronServiceState, fn: () => Promise<T>): Promise<T> {
  const storePath = state.deps.storePath;
  const storeOp = storeLocks.get(storePath) ?? Promise.resolve();

  const trackedFn = () => {
    lockAcquiredAtMs = state.deps.nowMs();
    return fn().finally(() => {
      lockAcquiredAtMs = null;
    });
  };

  const next = Promise.all([resolveChain(state.op), resolveChain(storeOp)]).then(trackedFn);

  // Keep the chain alive even when the operation fails.
  const keepAlive = resolveChain(next);
  state.op = keepAlive;
  storeLocks.set(storePath, keepAlive);

  return (await next) as T;
}
