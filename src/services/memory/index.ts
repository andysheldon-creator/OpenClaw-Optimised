/**
 * Tiered Memory System — Public API
 *
 * Provides structured, long-term memory for the agent via the
 * retain/recall/reflect loop:
 *
 * - **Retain**: Extract facts from conversation messages → SQLite
 * - **Recall**: Query facts via FTS5, entity, temporal, or hybrid search
 * - **Reflect**: Periodically update entity summaries and opinion confidence
 *
 * Usage in pi-embedded-runner:
 * 1. After each turn: `backgroundRetain()` to store facts
 * 2. Before context assembly: `recallForContext()` to get relevant memory
 * 3. On startup: `initMemory()` to open DB and start reflect schedule
 * 4. On shutdown: `shutdownMemory()` to close DB and stop reflect
 */

export {
  buildMemoryContext,
  getRecallStats,
  hasMemoryData,
  isMemoryEnabled,
  type RecallItem,
  type RecallResult,
  recallDay,
  recallEntity,
  recallHybrid,
  recallLexical,
  recallOpinions,
  recallTemporal,
} from "./memory-recall.js";
export {
  maybeReflect,
  type ReflectResult,
  runReflect,
  startReflectSchedule,
  stopReflectSchedule,
} from "./memory-reflect.js";
export {
  backgroundRetain,
  type RetainResult,
  retainMessages,
} from "./memory-retain.js";

export {
  closeMemoryStore,
  type Entity,
  type EntityRef,
  type Fact,
  type FactType,
  getDb,
  getMemoryStats,
  type MemoryStats,
  type Opinion,
} from "./memory-store.js";

import { defaultRuntime } from "../../runtime.js";
import { isMemoryEnabled } from "./memory-recall.js";
import { startReflectSchedule, stopReflectSchedule } from "./memory-reflect.js";
import { closeMemoryStore, getDb, getMemoryStats } from "./memory-store.js";

/**
 * Initialise the tiered memory system.
 * Opens the SQLite database and starts the reflect schedule.
 */
export function initMemory(): void {
  if (!isMemoryEnabled()) {
    defaultRuntime.log?.(
      "[memory] tiered memory is disabled (ENABLE_MEMORY=false)",
    );
    return;
  }

  try {
    // Open database (creates tables if needed)
    getDb();

    const stats = getMemoryStats();
    defaultRuntime.log?.(
      `[memory] initialised: ${stats.factCount} facts, ${stats.entityCount} entities, ${stats.opinionCount} opinions`,
    );

    // Start periodic reflect
    startReflectSchedule();
  } catch (err) {
    defaultRuntime.log?.(`[memory] failed to initialise: ${String(err)}`);
  }
}

/**
 * Shut down the memory system gracefully.
 */
export function shutdownMemory(): void {
  stopReflectSchedule();
  closeMemoryStore();
}
