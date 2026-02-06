/**
 * Agent run state persistence for gateway restarts.
 *
 * This module handles serializing in-flight chat run state to disk so that
 * conversations can survive gateway restarts. The persisted state includes:
 * - Chat run registry entries (sessionKey, clientRunId mappings)
 * - Text buffers (accumulated response text)
 * - Abort controller metadata (without the actual AbortController)
 * - Agent run sequence numbers
 * - Agent run contexts
 *
 * AbortController objects cannot be serialized; they are recreated on restore.
 */

import fs from "node:fs";
import path from "node:path";
import type { VerboseLevel } from "../auto-reply/thinking.js";
import { CONFIG_DIR } from "../utils.js";

export const GATEWAY_STATE_DIR = path.join(CONFIG_DIR, "gateway-state");
export const CHAT_RUNS_STATE_PATH = path.join(GATEWAY_STATE_DIR, "chat-runs.json");

/** Maximum age of a persisted run before it's considered stale (5 minutes). */
export const MAX_RUN_AGE_MS = 5 * 60 * 1000;

/** Interval between periodic state flushes (10 seconds). */
export const PERSIST_INTERVAL_MS = 10 * 1000;

/**
 * Persisted form of a chat abort controller entry.
 * Note: The actual AbortController cannot be serialized.
 */
export type PersistedChatAbortEntry = {
  sessionId: string;
  sessionKey: string;
  startedAtMs: number;
  expiresAtMs: number;
};

/**
 * Persisted form of a chat run entry in the registry queue.
 */
export type PersistedChatRunEntry = {
  sessionKey: string;
  clientRunId: string;
};

/**
 * Persisted agent run context.
 */
export type PersistedAgentRunContext = {
  sessionKey?: string;
  verboseLevel?: VerboseLevel;
  isHeartbeat?: boolean;
};

/**
 * Complete persisted state for a single chat run.
 */
export type PersistedChatRun = {
  /** Agent bus runId (sessionId in chat run registry) */
  sessionId: string;
  /** Gateway chat runId */
  clientRunId: string;
  /** Session store key */
  sessionKey: string;
  /** When the run started */
  startedAtMs: number;
  /** When the run expires (for timeout) */
  expiresAtMs: number;
  /** Last sequence number emitted */
  lastSeq: number;
  /** Accumulated response text buffer */
  textBuffer: string;
  /** Last delta sent timestamp */
  lastDeltaSentAtMs: number;
  /** Agent run context */
  agentContext: PersistedAgentRunContext;
  /** Last activity timestamp (for staleness check) */
  lastActivityMs: number;
};

/**
 * State file schema with version for future migrations.
 */
export type PersistedChatRunsFile = {
  version: 1;
  persistedAtMs: number;
  runs: PersistedChatRun[];
};

/**
 * Parameters for collecting state to persist.
 */
export type ChatRunStateSource = {
  /** Chat run registry: sessionId -> queue of { sessionKey, clientRunId } */
  chatRunRegistry: {
    peek: (sessionId: string) => { sessionKey: string; clientRunId: string } | undefined;
  };
  /** All active session IDs (keys from the internal registry map) */
  getActiveSessions: () => string[];
  /** Chat abort controllers: runId -> entry */
  chatAbortControllers: Map<
    string,
    {
      sessionId: string;
      sessionKey: string;
      startedAtMs: number;
      expiresAtMs: number;
    }
  >;
  /** Text buffers: clientRunId -> accumulated text */
  chatRunBuffers: Map<string, string>;
  /** Delta sent timestamps: clientRunId -> timestamp */
  chatDeltaSentAt: Map<string, number>;
  /** Agent run sequence numbers: runId -> seq */
  agentRunSeq: Map<string, number>;
  /** Get agent run context by runId */
  getAgentRunContext: (runId: string) => PersistedAgentRunContext | undefined;
};

/**
 * Collect chat run state from runtime maps into serializable form.
 */
export function collectChatRunState(source: ChatRunStateSource): PersistedChatRun[] {
  const runs: PersistedChatRun[] = [];
  const now = Date.now();

  // Iterate over all active abort controllers (they represent active runs)
  for (const [runId, entry] of source.chatAbortControllers) {
    const chatLink = source.chatRunRegistry.peek(entry.sessionId);
    const clientRunId = chatLink?.clientRunId ?? runId;
    const sessionKey = chatLink?.sessionKey ?? entry.sessionKey;

    const run: PersistedChatRun = {
      sessionId: entry.sessionId,
      clientRunId,
      sessionKey,
      startedAtMs: entry.startedAtMs,
      expiresAtMs: entry.expiresAtMs,
      lastSeq: source.agentRunSeq.get(runId) ?? 0,
      textBuffer: source.chatRunBuffers.get(clientRunId) ?? "",
      lastDeltaSentAtMs: source.chatDeltaSentAt.get(clientRunId) ?? 0,
      agentContext: source.getAgentRunContext(runId) ?? {},
      lastActivityMs: now,
    };

    runs.push(run);
  }

  return runs;
}

/**
 * Serialize and write chat run state to disk.
 */
export async function persistChatRunState(runs: PersistedChatRun[]): Promise<void> {
  const stateFile: PersistedChatRunsFile = {
    version: 1,
    persistedAtMs: Date.now(),
    runs,
  };

  await fs.promises.mkdir(GATEWAY_STATE_DIR, { recursive: true });

  // Write to temp file first, then atomic rename
  const tmp = `${CHAT_RUNS_STATE_PATH}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(stateFile, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, CHAT_RUNS_STATE_PATH);

  // Best-effort backup
  try {
    await fs.promises.copyFile(CHAT_RUNS_STATE_PATH, `${CHAT_RUNS_STATE_PATH}.bak`);
  } catch {
    // Ignore backup failures
  }
}

/**
 * Load persisted chat run state from disk.
 * Returns empty array if no state file exists or if it's corrupted.
 */
export async function loadPersistedChatRunState(): Promise<PersistedChatRun[]> {
  try {
    const raw = await fs.promises.readFile(CHAT_RUNS_STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PersistedChatRunsFile;

    if (parsed.version !== 1) {
      // Unknown version, try backup
      return await loadFromBackup();
    }

    if (!Array.isArray(parsed.runs)) {
      return await loadFromBackup();
    }

    // Filter out stale runs (older than MAX_RUN_AGE_MS)
    const now = Date.now();
    const validRuns = parsed.runs.filter((run) => {
      if (!run.sessionId || !run.clientRunId || !run.sessionKey) {
        return false;
      }
      const age = now - (run.lastActivityMs ?? run.startedAtMs ?? 0);
      return age < MAX_RUN_AGE_MS;
    });

    return validRuns;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    // Try backup on parse error
    return await loadFromBackup();
  }
}

async function loadFromBackup(): Promise<PersistedChatRun[]> {
  try {
    const raw = await fs.promises.readFile(`${CHAT_RUNS_STATE_PATH}.bak`, "utf-8");
    const parsed = JSON.parse(raw) as PersistedChatRunsFile;
    if (parsed.version === 1 && Array.isArray(parsed.runs)) {
      const now = Date.now();
      return parsed.runs.filter((run) => {
        if (!run.sessionId || !run.clientRunId || !run.sessionKey) {
          return false;
        }
        const age = now - (run.lastActivityMs ?? run.startedAtMs ?? 0);
        return age < MAX_RUN_AGE_MS;
      });
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Clear persisted state file (call after successful restore or on clean start).
 */
export async function clearPersistedChatRunState(): Promise<void> {
  try {
    await fs.promises.unlink(CHAT_RUNS_STATE_PATH);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Create a periodic flush timer for chat run state.
 */
export function createChatRunStatePersistTimer(params: {
  collectState: () => PersistedChatRun[];
  log: { debug: (msg: string) => void; warn: (msg: string) => void };
  intervalMs?: number;
}): ReturnType<typeof setInterval> {
  const intervalMs = params.intervalMs ?? PERSIST_INTERVAL_MS;
  let prevRunIds = "";

  return setInterval(async () => {
    try {
      const runs = params.collectState();
      if (runs.length > 0) {
        await persistChatRunState(runs);
        const runIds = runs
          .map((r) => r.clientRunId)
          .sort()
          .join(",");
        if (runIds !== prevRunIds) {
          const runSummary = runs
            .map((r) => `${r.sessionKey}/${r.clientRunId.slice(-8)}`)
            .join(", ");
          params.log.debug(`persisting ${runs.length} chat run(s): [${runSummary}]`);
          prevRunIds = runIds;
        }
      } else if (prevRunIds) {
        params.log.debug("no active chat runs to persist");
        prevRunIds = "";
      }
    } catch (err) {
      params.log.warn(`failed to persist chat run state: ${String(err)}`);
    }
  }, intervalMs);
}
