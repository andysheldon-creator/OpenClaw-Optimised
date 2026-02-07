/**
 * Fanout Dispatcher (Component 9)
 *
 * Runs async side effects (graph sync, vector indexing) after capture.
 * Fire-and-forget with error isolation—failures don't block capture.
 */

import type { ExperienceKit } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type FanoutTarget = "graph" | "vector" | "compaction";

export type FanoutHandler = (kit: ExperienceKit) => Promise<void>;

export type FanoutResult = {
  target: FanoutTarget;
  success: boolean;
  error?: string;
  durationMs: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fanout dispatcher for async side effects after capture.
 * Each handler runs independently; failures are isolated.
 */
export class FanoutDispatcher {
  private handlers = new Map<FanoutTarget, FanoutHandler>();

  /**
   * Register a handler for a fanout target.
   */
  register(target: FanoutTarget, handler: FanoutHandler): void {
    this.handlers.set(target, handler);
  }

  /**
   * Dispatch a kit to all registered (or specified) targets.
   * Returns results for each target. Failures are logged, not thrown.
   */
  async dispatch(kit: ExperienceKit, targets?: FanoutTarget[]): Promise<FanoutResult[]> {
    const targetList = targets ?? Array.from(this.handlers.keys());
    const results: FanoutResult[] = [];

    // Run all targets concurrently with error isolation
    const promises = targetList.map(async (target) => {
      const handler = this.handlers.get(target);
      if (!handler) {
        return { target, success: false, error: "No handler registered", durationMs: 0 };
      }

      const start = Date.now();
      try {
        await handler(kit);
        return { target, success: true, durationMs: Date.now() - start };
      } catch (err) {
        return {
          target,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    });

    const settled = await Promise.all(promises);
    results.push(...settled);

    return results;
  }

  /**
   * Check which targets have registered handlers.
   */
  getRegisteredTargets(): FanoutTarget[] {
    return Array.from(this.handlers.keys());
  }
}
