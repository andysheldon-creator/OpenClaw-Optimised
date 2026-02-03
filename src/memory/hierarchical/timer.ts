/**
 * Timer for running the hierarchical memory worker periodically.
 */

import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveHierarchicalMemoryConfig } from "./config.js";
import { runHierarchicalMemoryWorker } from "./worker.js";

export type HierarchicalMemoryTimerHandle = {
  /** Stop the timer */
  stop: () => void;
  /** Get the last run result */
  getLastResult: () => WorkerRunInfo | null;
};

type WorkerRunInfo = {
  timestamp: number;
  success: boolean;
  chunksProcessed?: number;
  mergesPerformed?: number;
  error?: string;
  durationMs?: number;
};

let timerHandle: ReturnType<typeof setInterval> | null = null;
let lastResult: WorkerRunInfo | null = null;
let isRunning = false;

/**
 * Start the hierarchical memory worker timer.
 * Returns a handle to stop the timer.
 */
export function startHierarchicalMemoryTimer(params: {
  agentId: string;
  config: OpenClawConfig;
  log?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}): HierarchicalMemoryTimerHandle | null {
  const memoryConfig = resolveHierarchicalMemoryConfig(params.config);

  if (!memoryConfig.enabled) {
    return null;
  }

  // Stop any existing timer
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }

  const log = params.log ?? {
    info: console.log,
    warn: console.warn,
    error: console.error,
  };

  const runWorker = async () => {
    if (isRunning) {
      return; // Skip if previous run is still in progress
    }

    isRunning = true;
    try {
      const result = await runHierarchicalMemoryWorker({
        agentId: params.agentId,
        config: params.config,
      });

      lastResult = {
        timestamp: Date.now(),
        success: result.success,
        chunksProcessed: result.chunksProcessed,
        mergesPerformed: result.mergesPerformed,
        error: result.error,
        durationMs: result.durationMs,
      };

      if (result.skipped) {
        // Silent skip - lock held or disabled
        return;
      }

      if (result.success) {
        if ((result.chunksProcessed ?? 0) > 0 || (result.mergesPerformed ?? 0) > 0) {
          log.info(
            `hierarchical memory: processed ${result.chunksProcessed ?? 0} chunks, ` +
              `${result.mergesPerformed ?? 0} merges (${result.durationMs}ms)`,
          );
        }
      } else if (result.error) {
        log.error(`hierarchical memory worker failed: ${result.error}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      lastResult = {
        timestamp: Date.now(),
        success: false,
        error,
      };
      log.error(`hierarchical memory worker error: ${error}`);
    } finally {
      isRunning = false;
    }
  };

  // Run immediately on start
  void runWorker();

  // Then run on interval
  timerHandle = setInterval(() => {
    void runWorker();
  }, memoryConfig.workerIntervalMs);

  log.info(
    `hierarchical memory timer started (interval: ${Math.round(memoryConfig.workerIntervalMs / 1000)}s)`,
  );

  return {
    stop: () => {
      if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = null;
      }
    },
    getLastResult: () => lastResult,
  };
}

/**
 * Stop the hierarchical memory timer if running.
 */
export function stopHierarchicalMemoryTimer(): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

/**
 * Check if the timer is currently active.
 */
export function isTimerActive(): boolean {
  return timerHandle !== null;
}
