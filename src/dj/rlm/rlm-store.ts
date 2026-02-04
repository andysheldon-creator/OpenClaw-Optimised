/**
 * RLM Session Store for DJ Assistant
 *
 * Handles Notion persistence for RLM sessions and iterations.
 * Follows the same patterns as podcast-service for non-fatal writes.
 */

import { randomBytes } from "node:crypto";
import type { NotionService } from "../notion/index.js";
import type {
  RlmConfig,
  RlmIteration,
  RlmResult,
  RlmSession,
  RlmSessionId,
  RlmSessionStatus,
  RlmSessionSummary,
  RlmStopReason,
} from "./rlm-types.js";

// =============================================================================
// Session ID Generation
// =============================================================================

/**
 * Generate a unique RLM session ID.
 * Format: rlm-{8 random hex chars}
 */
export function generateRlmSessionId(): RlmSessionId {
  const suffix = randomBytes(4).toString("hex");
  return `rlm-${suffix}`;
}

/**
 * Validate an RLM session ID format.
 */
export function isValidRlmSessionId(id: string): id is RlmSessionId {
  return /^rlm-[a-f0-9]{8}$/.test(id);
}

// =============================================================================
// RLM Store Class
// =============================================================================

export interface RlmStoreConfig {
  /** Notion database ID for RLM sessions */
  rlmSessionsDbId?: string;
}

export class RlmStore {
  private notionService?: NotionService;
  private config: RlmStoreConfig;

  /** In-memory session cache (for fast access during active sessions) */
  private activeSessions: Map<RlmSessionId, RlmSession> = new Map();

  constructor(config: RlmStoreConfig = {}) {
    this.config = config;
  }

  /**
   * Set the Notion service (dependency injection).
   */
  setNotionService(service: NotionService): void {
    this.notionService = service;
  }

  /**
   * Create a new RLM session.
   * Stores in memory and optionally persists to Notion.
   */
  async createSession(
    task: string,
    config: RlmConfig,
    options: { skipNotion?: boolean } = {},
  ): Promise<RlmSession> {
    const sessionId = generateRlmSessionId();
    const now = new Date().toISOString();

    const session: RlmSession = {
      sessionId,
      task,
      config,
      iterations: [],
      status: "running",
      startedAt: now,
    };

    // Store in memory
    this.activeSessions.set(sessionId, session);

    // Persist to Notion (non-fatal)
    if (!options.skipNotion && this.notionService && this.config.rlmSessionsDbId) {
      try {
        const pageId = await this.notionService.createRlmSessionEntry({
          sessionId,
          task,
          status: "running",
          config,
          startedAt: now,
        });
        if (pageId) {
          session.notionPageId = pageId;
        }
      } catch (error) {
        // Non-fatal: log and continue
        console.warn(`[RlmStore] Failed to create Notion entry for ${sessionId}:`, error);
      }
    }

    return session;
  }

  /**
   * Record an iteration for a session.
   * Updates in-memory state and optionally syncs to Notion.
   */
  async recordIteration(
    sessionId: RlmSessionId,
    iteration: RlmIteration,
    options: { skipNotion?: boolean } = {},
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Add iteration to session
    session.iterations.push(iteration);

    // Update Notion (non-fatal)
    if (!options.skipNotion && this.notionService && session.notionPageId) {
      try {
        await this.notionService.updateRlmSessionEntry(session.notionPageId, {
          iterationCount: session.iterations.length,
          totalTokens: session.iterations.reduce((sum, i) => sum + i.tokensUsed, 0),
          totalToolCalls: session.iterations.reduce((sum, i) => sum + i.toolCallsUsed, 0),
        });
      } catch (error) {
        console.warn(`[RlmStore] Failed to update iteration for ${sessionId}:`, error);
      }
    }
  }

  /**
   * Complete a session with final result.
   */
  async completeSession(
    sessionId: RlmSessionId,
    result: RlmResult,
    options: { skipNotion?: boolean } = {},
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session state
    session.status = result.success ? "completed" : "error";
    session.completedAt = new Date().toISOString();
    session.finalOutput = result.output;
    session.stopReason = result.stopReason;

    // Update Notion (non-fatal)
    if (!options.skipNotion && this.notionService && session.notionPageId) {
      try {
        await this.notionService.updateRlmSessionEntry(session.notionPageId, {
          status: session.status,
          completedAt: session.completedAt,
          finalOutput: result.output.slice(0, 2000), // Truncate for Notion
          stopReason: result.stopReason,
          iterationCount: result.iterationCount,
          totalTokens: result.totalTokens,
          totalToolCalls: result.totalToolCalls,
          totalDurationMs: result.totalDurationMs,
        });
      } catch (error) {
        console.warn(`[RlmStore] Failed to complete session ${sessionId}:`, error);
      }
    }

    // Keep in memory for short-term access
    // Could add TTL cleanup later
  }

  /**
   * Stop a running session.
   */
  async stopSession(
    sessionId: RlmSessionId,
    reason: RlmStopReason,
    options: { skipNotion?: boolean } = {},
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = "stopped";
    session.completedAt = new Date().toISOString();
    session.stopReason = reason;

    // Update Notion (non-fatal)
    if (!options.skipNotion && this.notionService && session.notionPageId) {
      try {
        await this.notionService.updateRlmSessionEntry(session.notionPageId, {
          status: "stopped",
          completedAt: session.completedAt,
          stopReason: reason,
          iterationCount: session.iterations.length,
          totalTokens: session.iterations.reduce((sum, i) => sum + i.tokensUsed, 0),
        });
      } catch (error) {
        console.warn(`[RlmStore] Failed to stop session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Get a session by ID (from memory or Notion).
   */
  async getSession(sessionId: RlmSessionId): Promise<RlmSession | null> {
    // Check memory first
    const memorySession = this.activeSessions.get(sessionId);
    if (memorySession) {
      return memorySession;
    }

    // Try Notion if available
    if (this.notionService && this.config.rlmSessionsDbId) {
      try {
        const entry = await this.notionService.findRlmSessionById(sessionId);
        if (entry) {
          // Convert Notion entry back to session
          return this.notionEntryToSession(entry);
        }
      } catch (error) {
        console.warn(`[RlmStore] Failed to fetch session ${sessionId} from Notion:`, error);
      }
    }

    return null;
  }

  /**
   * List recent sessions (from Notion).
   */
  async listRecentSessions(limit: number = 10): Promise<RlmSessionSummary[]> {
    if (!this.notionService || !this.config.rlmSessionsDbId) {
      // Return from memory if no Notion
      return Array.from(this.activeSessions.values())
        .toSorted((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit)
        .map((session) => this.sessionToSummary(session));
    }

    try {
      const entries = await this.notionService.listRlmSessions(limit);
      return entries.map((entry) => ({
        sessionId: entry.sessionId as RlmSessionId,
        task: entry.task,
        status: entry.status,
        iterationCount: entry.iterationCount,
        totalTokens: entry.totalTokens,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
      }));
    } catch (error) {
      console.warn("[RlmStore] Failed to list sessions from Notion:", error);
      return [];
    }
  }

  /**
   * Get active session (from memory only).
   */
  getActiveSession(sessionId: RlmSessionId): RlmSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Clear completed sessions from memory.
   */
  clearCompletedSessions(): void {
    for (const [id, session] of this.activeSessions) {
      if (session.status !== "running") {
        this.activeSessions.delete(id);
      }
    }
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private sessionToSummary(session: RlmSession): RlmSessionSummary {
    return {
      sessionId: session.sessionId,
      task: session.task,
      status: session.status,
      iterationCount: session.iterations.length,
      totalTokens: session.iterations.reduce((sum, i) => sum + i.tokensUsed, 0),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  private notionEntryToSession(entry: {
    sessionId: string;
    task: string;
    status: RlmSessionStatus;
    config?: RlmConfig;
    startedAt: string;
    completedAt?: string;
    finalOutput?: string;
    stopReason?: string;
    notionPageId?: string;
  }): RlmSession {
    return {
      sessionId: entry.sessionId as RlmSessionId,
      task: entry.task,
      config: entry.config ?? {
        maxDepth: 2,
        maxSubagents: 0,
        maxIterations: 3,
        budgetProfile: "normal",
      },
      iterations: [], // Iterations aren't stored in detail in Notion
      status: entry.status,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      finalOutput: entry.finalOutput,
      stopReason: entry.stopReason as RlmStopReason | undefined,
      notionPageId: entry.notionPageId,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an RLM store instance.
 */
export function createRlmStore(config: RlmStoreConfig = {}): RlmStore {
  return new RlmStore(config);
}
