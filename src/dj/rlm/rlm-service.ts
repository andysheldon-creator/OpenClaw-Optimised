/**
 * RLM Service for DJ Assistant
 *
 * Implements bounded iterative refinement with explicit caps,
 * BudgetGovernor integration, and Notion audit trail.
 */

import type { BudgetProfileId } from "../../budget/types.js";
import type { NotionService } from "../notion/index.js";
import { BudgetGovernor, createBudgetGovernor, createDeepGovernor } from "../../budget/governor.js";
import { createRlmStore, type RlmStore } from "./rlm-store.js";
import {
  DEFAULT_RLM_CONFIG,
  RLM_MAX_DEPTH,
  RLM_MAX_ITERATIONS,
  RLM_MAX_SUBAGENTS,
  type RefinementDecision,
  type RlmConfig,
  type RlmHistoryResult,
  type RlmIteration,
  type RlmResult,
  type RlmRunOptions,
  type RlmServiceConfig,
  type RlmSession,
  type RlmSessionId,
  type RlmStatusResult,
  type RlmStopReason,
} from "./rlm-types.js";

// =============================================================================
// RLM Service Class
// =============================================================================

export interface RlmExecutor {
  /**
   * Execute a single iteration of the RLM loop.
   * This is injected to allow different execution strategies.
   */
  execute(
    input: string,
    context: { iterationNumber: number; previousOutput?: string },
  ): Promise<{
    output: string;
    tokensUsed: number;
    toolCallsUsed: number;
    subagentSpawned?: boolean;
  }>;

  /**
   * Evaluate whether the output needs refinement.
   */
  evaluateRefinement(
    task: string,
    output: string,
    iterationNumber: number,
  ): Promise<RefinementDecision>;
}

export class RlmService {
  private notionService?: NotionService;
  private config: RlmServiceConfig;
  private store: RlmStore;
  private executor?: RlmExecutor;

  constructor(config: RlmServiceConfig = {}) {
    this.config = config;
    this.store = createRlmStore({
      rlmSessionsDbId: config.notionRlmDbId,
    });
  }

  /**
   * Set the Notion service (dependency injection).
   */
  setNotionService(service: NotionService): void {
    this.notionService = service;
    this.store.setNotionService(service);
  }

  /**
   * Set the executor (dependency injection).
   */
  setExecutor(executor: RlmExecutor): void {
    this.executor = executor;
  }

  /**
   * Run an RLM session for a given task.
   */
  async run(task: string, options: RlmRunOptions = {}): Promise<RlmResult> {
    // Validate and apply caps
    const config = this.validateAndApplyCaps({
      maxDepth: options.maxDepth ?? this.config.defaultMaxDepth ?? DEFAULT_RLM_CONFIG.maxDepth,
      maxSubagents:
        options.maxSubagents ?? this.config.defaultMaxSubagents ?? DEFAULT_RLM_CONFIG.maxSubagents,
      maxIterations:
        options.maxIterations ??
        this.config.defaultMaxIterations ??
        DEFAULT_RLM_CONFIG.maxIterations,
      budgetProfile:
        options.budgetProfile ??
        this.config.defaultBudgetProfile ??
        DEFAULT_RLM_CONFIG.budgetProfile,
    });

    // Create session
    const session = await this.store.createSession(task, config, {
      skipNotion: options.skipNotionLog,
    });

    // Create budget governor for this session
    const governor = this.createGovernor(config.budgetProfile);

    // Run iteration loop
    const result = await this.runIterationLoop(session, config, governor, options);

    // Complete session
    await this.store.completeSession(session.sessionId, result, {
      skipNotion: options.skipNotionLog,
    });

    // Mark governor complete
    governor.complete();

    return result;
  }

  /**
   * Get status of a session.
   */
  async getStatus(sessionId: RlmSessionId): Promise<RlmStatusResult> {
    const session = await this.store.getSession(sessionId);

    if (!session) {
      return {
        success: false,
        message: `Session not found: ${sessionId}`,
      };
    }

    return {
      success: true,
      session,
      message: `Session ${sessionId}: ${session.status}`,
    };
  }

  /**
   * Get recent session history.
   */
  async getHistory(limit: number = 10): Promise<RlmHistoryResult> {
    const sessions = await this.store.listRecentSessions(limit);

    return {
      success: true,
      sessions,
      totalCount: sessions.length,
      message: `Found ${sessions.length} recent sessions`,
    };
  }

  /**
   * Stop a running session.
   */
  async stopSession(sessionId: RlmSessionId): Promise<RlmStatusResult> {
    try {
      await this.store.stopSession(sessionId, "user_cancelled");

      const session = await this.store.getSession(sessionId);
      return {
        success: true,
        session: session ?? undefined,
        message: `Session ${sessionId} stopped`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop session: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Validate configuration and apply hard caps.
   */
  private validateAndApplyCaps(config: RlmConfig): RlmConfig {
    return {
      maxDepth: Math.min(config.maxDepth, RLM_MAX_DEPTH),
      maxSubagents: Math.min(config.maxSubagents, RLM_MAX_SUBAGENTS),
      maxIterations: Math.min(config.maxIterations, RLM_MAX_ITERATIONS),
      budgetProfile: config.budgetProfile,
    };
  }

  /**
   * Create a budget governor for the given profile.
   */
  private createGovernor(profile: BudgetProfileId): BudgetGovernor {
    if (profile === "deep") {
      return createDeepGovernor();
    }
    return createBudgetGovernor({ profileId: profile });
  }

  /**
   * Run the main iteration loop.
   */
  private async runIterationLoop(
    session: RlmSession,
    config: RlmConfig,
    governor: BudgetGovernor,
    options: RlmRunOptions,
  ): Promise<RlmResult> {
    let currentInput = session.task;
    let previousOutput: string | undefined;
    let totalTokens = 0;
    let totalToolCalls = 0;
    let totalSubagents = 0;
    const startTime = Date.now();

    for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
      // Check budget before iteration
      const budgetCheck = governor.checkLimits();
      if (!budgetCheck.allowed) {
        return this.createResult(
          session,
          previousOutput ?? "",
          iteration - 1,
          totalTokens,
          totalToolCalls,
          Date.now() - startTime,
          "budget_exceeded",
        );
      }

      // Check if governor stopped
      if (governor.isStopped()) {
        const reason = governor.getStopReason();
        return this.createResult(
          session,
          previousOutput ?? "",
          iteration - 1,
          totalTokens,
          totalToolCalls,
          Date.now() - startTime,
          "budget_exceeded",
          reason?.message,
        );
      }

      // Execute iteration
      const iterationStart = Date.now();
      const iterationResult = await this.executeIteration(
        currentInput,
        iteration,
        previousOutput,
        governor,
      );

      // Track usage
      totalTokens += iterationResult.tokensUsed;
      totalToolCalls += iterationResult.toolCallsUsed;

      if (iterationResult.subagentSpawned) {
        totalSubagents += 1;

        // Check subagent cap
        if (totalSubagents > config.maxSubagents) {
          return this.createResult(
            session,
            iterationResult.output,
            iteration,
            totalTokens,
            totalToolCalls,
            Date.now() - startTime,
            "max_subagents",
          );
        }
      }

      // Record iteration
      const rlmIteration: RlmIteration = {
        iterationNumber: iteration,
        depth: 1, // Depth tracking would require nested calls
        input: currentInput,
        output: iterationResult.output,
        tokensUsed: iterationResult.tokensUsed,
        toolCallsUsed: iterationResult.toolCallsUsed,
        durationMs: Date.now() - iterationStart,
        subagentSpawned: iterationResult.subagentSpawned,
        startedAt: new Date(iterationStart).toISOString(),
        completedAt: new Date().toISOString(),
      };

      await this.store.recordIteration(session.sessionId, rlmIteration, {
        skipNotion: options.skipNotionLog,
      });

      previousOutput = iterationResult.output;

      // Check if more iterations needed
      const refinementDecision = await this.evaluateRefinementNeed(
        session.task,
        iterationResult.output,
        iteration,
        governor,
      );

      if (!refinementDecision.shouldRefine) {
        return this.createResult(
          session,
          iterationResult.output,
          iteration,
          totalTokens,
          totalToolCalls,
          Date.now() - startTime,
          refinementDecision.reason === "satisfactory" ? "completed" : "no_refinement",
        );
      }

      // Record why we're refining
      rlmIteration.refinementReason = refinementDecision.reason;

      // Prepare input for next iteration
      currentInput = refinementDecision.focusArea
        ? `${session.task}\n\nFocus on: ${refinementDecision.focusArea}\n\nPrevious output:\n${iterationResult.output}`
        : `${session.task}\n\nRefine based on: ${refinementDecision.reason}\n\nPrevious output:\n${iterationResult.output}`;
    }

    // Hit max iterations
    return this.createResult(
      session,
      previousOutput ?? "",
      config.maxIterations,
      totalTokens,
      totalToolCalls,
      Date.now() - startTime,
      "max_iterations",
    );
  }

  /**
   * Execute a single iteration.
   */
  private async executeIteration(
    input: string,
    iterationNumber: number,
    previousOutput: string | undefined,
    governor: BudgetGovernor,
  ): Promise<{
    output: string;
    tokensUsed: number;
    toolCallsUsed: number;
    subagentSpawned?: boolean;
  }> {
    if (this.executor) {
      // Record the LLM call for budget tracking
      const result = await this.executor.execute(input, { iterationNumber, previousOutput });

      // Record usage with governor
      governor.recordLlmCall({
        input: Math.floor(result.tokensUsed * 0.7), // Rough estimate
        output: Math.floor(result.tokensUsed * 0.3),
      });

      for (let i = 0; i < result.toolCallsUsed; i++) {
        governor.recordToolCall();
      }

      if (result.subagentSpawned) {
        governor.recordSubagentSpawn();
      }

      return result;
    }

    // Fallback: no executor configured
    // In real usage, an executor would be injected
    console.warn("[RlmService] No executor configured, returning placeholder");

    governor.recordLlmCall({ input: 100, output: 50 });

    return {
      output: `[Placeholder output for iteration ${iterationNumber}]\n\nNo executor configured. Input was:\n${input}`,
      tokensUsed: 150,
      toolCallsUsed: 0,
    };
  }

  /**
   * Evaluate whether output needs refinement.
   */
  private async evaluateRefinementNeed(
    task: string,
    output: string,
    iterationNumber: number,
    governor: BudgetGovernor,
  ): Promise<RefinementDecision> {
    if (this.executor) {
      // Record evaluation call
      governor.recordLlmCall({ input: 200, output: 50 });

      return this.executor.evaluateRefinement(task, output, iterationNumber);
    }

    // Fallback: simple heuristics
    // Stop after first iteration if no executor
    return {
      shouldRefine: false,
      reason: "satisfactory",
      confidence: 0.5,
    };
  }

  /**
   * Create a result object.
   */
  private createResult(
    session: RlmSession,
    output: string,
    iterationCount: number,
    totalTokens: number,
    totalToolCalls: number,
    totalDurationMs: number,
    stopReason: RlmStopReason,
    error?: string,
  ): RlmResult {
    // Determine if we stopped early (not a natural completion)
    const isNaturalCompletion = stopReason === "completed" || stopReason === "no_refinement";
    const stoppedEarly = !isNaturalCompletion;

    return {
      success: isNaturalCompletion,
      output,
      iterationCount,
      totalTokens,
      totalToolCalls,
      totalDurationMs,
      stoppedEarly,
      stopReason,
      sessionId: session.sessionId,
      error,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an RLM service instance.
 */
export function createRlmService(config: RlmServiceConfig = {}): RlmService {
  return new RlmService(config);
}
