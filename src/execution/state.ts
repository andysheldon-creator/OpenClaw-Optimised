/**
 * State Service for the Agent Execution Layer.
 *
 * Provides unified session state persistence after execution. Consolidates logic
 * previously scattered across:
 * - updateSessionStoreAfterAgentRun() in src/commands/agent/session-store.ts
 * - persistSessionUsageUpdate() in src/auto-reply/reply/session-usage.ts
 * - incrementCompactionCount() in src/auto-reply/reply/session-updates.ts
 *
 * @see docs/design/plans/opus/01-agent-execution-layer.md
 */

import type { ExecutionRequest, RuntimeContext, TurnOutcome, UsageMetrics } from "./types.js";
import { setCliSessionId } from "../agents/cli-session.js";
import { lookupContextTokens } from "../agents/context.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import {
  resolveSessionTranscriptPath,
  updateSessionStoreEntry,
  type SessionEntry,
  type SessionSystemPromptReport,
} from "../config/sessions.js";
import { logVerbose } from "../globals.js";
import { queueSessionDescriptionRefresh } from "../sessions/session-description.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for state persistence.
 */
export interface StatePersistOptions {
  /** CLI provider session ID (for CLI runtimes). */
  cliSessionId?: string;
  /** Claude SDK session ID (for native session resume). */
  claudeSdkSessionId?: string;
  /** System prompt report to persist. */
  systemPromptReport?: SessionSystemPromptReport;
  /** Context token override from config. */
  contextTokensOverride?: number;
  /** Whether the run was aborted. */
  aborted?: boolean;
  /** Label for logging. */
  logLabel?: string;
}

/**
 * Result of compaction state update.
 */
export interface CompactionUpdateResult {
  /** New compaction count after increment. */
  compactionCount: number;
  /** Whether the update was successful. */
  success: boolean;
}

/**
 * Options for compaction state update.
 */
export interface CompactionUpdateOptions {
  /** Session key for the session to update. */
  sessionKey: string;
  /** Path to the session store file. */
  storePath: string;
  /** Timestamp for the update (defaults to Date.now()). */
  now?: number;
  /** Token count after compaction - if provided, updates session token counts. */
  tokensAfter?: number;
}

/**
 * StateService interface for session state persistence.
 */
export interface StateService {
  /**
   * Persist session state after execution.
   *
   * Update rules (in order):
   * 1. Acquire session lock (via updateSessionStoreEntry)
   * 2. Persist provider and model from runtime metadata
   * 3. Persist token counts (input, output, cache read, cache write)
   * 4. Update CLI session ID if provided
   * 5. Update Claude SDK session ID if provided
   * 6. Increment turn count
   * 7. Update updatedAt timestamp
   * 8. Release lock (via updateSessionStoreEntry)
   *
   * @param request - The execution request
   * @param outcome - The turn outcome with usage metrics
   * @param context - The runtime context with provider/model info
   * @param options - Additional options (session IDs, etc.)
   */
  persist(
    request: ExecutionRequest,
    outcome: TurnOutcome,
    context: RuntimeContext,
    options?: StatePersistOptions,
  ): Promise<void>;

  /**
   * Resolve the transcript file path for a session.
   *
   * @param sessionId - The session identifier
   * @param agentId - Optional agent identifier
   * @returns Absolute path to the transcript file
   */
  resolveTranscriptPath(sessionId: string, agentId?: string): string;

  /**
   * Update compaction count after session compaction.
   *
   * @param options - Compaction update options
   * @returns The new compaction count, or undefined if update failed
   */
  incrementCompactionCount(
    options: CompactionUpdateOptions,
  ): Promise<CompactionUpdateResult | undefined>;
}

// ---------------------------------------------------------------------------
// Logger Type
// ---------------------------------------------------------------------------

export type StateServiceLogger = {
  debug?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type StateServiceOptions = {
  /** Optional logger for debug output and error reporting. */
  logger?: StateServiceLogger;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Default StateService implementation.
 *
 * Consolidates session state updates from multiple entry points into a single
 * consistent implementation. Uses existing session store locking mechanism.
 */
export class DefaultStateService implements StateService {
  private logger?: StateServiceLogger;

  constructor(options: StateServiceOptions = {}) {
    this.logger = options.logger;
  }

  async persist(
    request: ExecutionRequest,
    outcome: TurnOutcome,
    context: RuntimeContext,
    options: StatePersistOptions = {},
  ): Promise<void> {
    const { sessionKey } = request;
    const storePath = this.resolveStorePath(request);

    if (!storePath || !sessionKey) {
      this.logger?.debug?.(`[StateService] skipping persist - missing storePath or sessionKey`);
      return;
    }

    const label = options.logLabel ? `${options.logLabel} ` : "";
    const { usage } = outcome;

    // Check if we have meaningful usage data to persist
    const hasUsage = hasNonzeroUsageMetrics(usage);

    // Determine if we should update (has usage, or has model/context info)
    const shouldUpdate = hasUsage || context.model || context.provider;
    if (!shouldUpdate) {
      this.logger?.debug?.(`[StateService] ${label}no data to persist`);
      return;
    }

    try {
      const next = await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          return this.buildUpdatePatch(entry, outcome, context, options);
        },
      });

      if (next) {
        // Queue async session description refresh
        queueSessionDescriptionRefresh({ storePath, sessionKey, entry: next });
        this.logger?.debug?.(`[StateService] ${label}persisted state for session ${sessionKey}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error?.(`[StateService] ${label}failed to persist state: ${message}`);
      logVerbose(`failed to persist ${label}state update: ${message}`);
    }
  }

  resolveTranscriptPath(sessionId: string, agentId?: string): string {
    return resolveSessionTranscriptPath(sessionId, agentId);
  }

  async incrementCompactionCount(
    options: CompactionUpdateOptions,
  ): Promise<CompactionUpdateResult | undefined> {
    const { sessionKey, storePath, now = Date.now(), tokensAfter } = options;

    if (!storePath || !sessionKey) {
      return undefined;
    }

    try {
      let nextCount = 0;
      const next = await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          nextCount = (entry.compactionCount ?? 0) + 1;

          const updates: Partial<SessionEntry> = {
            compactionCount: nextCount,
            updatedAt: now,
          };

          // If tokensAfter is provided, update the cached token counts
          // to reflect post-compaction state
          if (tokensAfter != null && tokensAfter > 0) {
            updates.totalTokens = tokensAfter;
            // Clear input/output breakdown since we only have the total estimate
            updates.inputTokens = undefined;
            updates.outputTokens = undefined;
          }

          return updates;
        },
      });

      if (next) {
        this.logger?.debug?.(
          `[StateService] incremented compaction count to ${nextCount} for session ${sessionKey}`,
        );
        return { compactionCount: nextCount, success: true };
      }

      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error?.(`[StateService] failed to increment compaction count: ${message}`);
      logVerbose(`failed to increment compaction count: ${message}`);
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the session store path from the request.
   * Currently returns undefined as this needs to be passed through the request.
   */
  private resolveStorePath(request: ExecutionRequest): string | undefined {
    // The store path should be provided via request context or resolved from config
    // For now, we expect it to be passed through. In the future, this could be
    // resolved from the request's agentId and config.
    return (request as unknown as { storePath?: string }).storePath;
  }

  /**
   * Build the session entry update patch.
   */
  private buildUpdatePatch(
    entry: SessionEntry,
    outcome: TurnOutcome,
    context: RuntimeContext,
    options: StatePersistOptions,
  ): Partial<SessionEntry> {
    const { usage } = outcome;
    const hasUsage = hasNonzeroUsageMetrics(usage);

    // Resolve context tokens
    const contextTokens =
      options.contextTokensOverride ?? lookupContextTokens(context.model) ?? DEFAULT_CONTEXT_TOKENS;

    // Build base patch
    const patch: Partial<SessionEntry> = {
      modelProvider: context.provider ?? entry.modelProvider,
      model: context.model ?? entry.model,
      contextTokens: contextTokens ?? entry.contextTokens,
      turnCount: (entry.turnCount ?? 0) + 1,
      updatedAt: Date.now(),
    };

    // Add token usage if available
    if (hasUsage) {
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const cacheRead = usage.cacheReadTokens ?? 0;
      const cacheWrite = usage.cacheWriteTokens ?? 0;
      const promptTokens = inputTokens + cacheRead + cacheWrite;

      patch.inputTokens = inputTokens;
      patch.outputTokens = outputTokens;
      patch.totalTokens = promptTokens > 0 ? promptTokens : inputTokens;
    }

    // Add system prompt report if provided
    if (options.systemPromptReport) {
      patch.systemPromptReport = options.systemPromptReport;
    }

    // Add aborted flag if set
    if (options.aborted !== undefined) {
      patch.abortedLastRun = options.aborted;
    }

    // Handle CLI provider session ID
    if (options.cliSessionId && context.provider) {
      const nextEntry = { ...entry, ...patch };
      setCliSessionId(nextEntry, context.provider, options.cliSessionId);
      patch.cliSessionIds = nextEntry.cliSessionIds;
      patch.claudeCliSessionId = nextEntry.claudeCliSessionId;
    }

    // Handle Claude SDK session ID (for native session resume)
    if (options.claudeSdkSessionId) {
      patch.claudeSdkSessionId = options.claudeSdkSessionId;
    }

    return patch;
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Check if usage metrics have non-zero values.
 */
export function hasNonzeroUsageMetrics(usage: UsageMetrics): boolean {
  return (
    (usage.inputTokens != null && usage.inputTokens > 0) ||
    (usage.outputTokens != null && usage.outputTokens > 0) ||
    (usage.cacheReadTokens != null && usage.cacheReadTokens > 0) ||
    (usage.cacheWriteTokens != null && usage.cacheWriteTokens > 0)
  );
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a StateService instance.
 *
 * @param options - Service options
 * @returns StateService instance
 */
export function createStateService(options: StateServiceOptions = {}): StateService {
  return new DefaultStateService(options);
}
