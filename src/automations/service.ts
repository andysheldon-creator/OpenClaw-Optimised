/**
 * AutomationService - Main API facade for automations.
 *
 * Provides a high-level API for managing and executing automations.
 * Follows the same pattern as CronService.
 */

import type {
  Automation,
  AutomationCreate,
  AutomationDeleteResult,
  AutomationGetResult,
  AutomationHistoryResult,
  AutomationPatch,
  AutomationRunResult,
  AutomationServiceDeps,
  AutomationStatusSummary,
} from "./types.js";
import * as ops from "./service/ops.js";
import { createAutomationServiceState } from "./service/state.js";

// Re-export key types for consumers
export type {
  Automation,
  AutomationCreate,
  AutomationPatch,
  AutomationDeleteResult,
  AutomationHistoryResult,
  AutomationRunResult,
  AutomationStatusSummary,
} from "./types.js";
export type { AutomationServiceDeps } from "./types.js";

/**
 * AutomationService - Main service class for automations.
 *
 * Manages the lifecycle of automations including scheduling, execution,
 * persistence, and event emission.
 *
 * @example
 * ```ts
 * const service = new AutomationService({
 *   log: console,
 *   storePath: "~/.clawdbrain/automations/automations.json",
 *   automationsEnabled: true,
 *   emitAutomationEvent: (event) => gateway.broadcast(event),
 *   runIsolatedAgentJob: async ({ automation, message }) => { ... },
 * });
 *
 * await service.start();
 * const automations = await service.list();
 * await service.stop();
 * ```
 */
export class AutomationService {
  private readonly state: ReturnType<typeof createAutomationServiceState>;

  constructor(deps: AutomationServiceDeps) {
    this.state = createAutomationServiceState(deps);
  }

  /**
   * Start the automation service.
   * Loads the store, computes next runs, and arms the timer.
   */
  async start(): Promise<void> {
    await ops.start(this.state);
  }

  /**
   * Stop the automation service.
   * Clears the timer and stops scheduling new runs.
   */
  stop(): void {
    ops.stop(this.state);
  }

  /**
   * Get service status summary.
   */
  async status(): Promise<AutomationStatusSummary> {
    return await ops.status(this.state);
  }

  /**
   * List all automations.
   * @param opts - Options for filtering
   */
  async list(opts?: { includeDisabled?: boolean }): Promise<Automation[]> {
    return await ops.listImpl(this.state, opts);
  }

  /**
   * Get a single automation by ID.
   * @param id - Automation ID
   */
  async get(id: string): Promise<AutomationGetResult> {
    return await ops.get(this.state, id);
  }

  /**
   * Create a new automation.
   * @param input - Automation creation input
   */
  async create(input: AutomationCreate): Promise<Automation> {
    return await ops.create(this.state, input);
  }

  /**
   * Update an existing automation.
   * @param id - Automation ID
   * @param patch - Fields to update
   */
  async update(id: string, patch: AutomationPatch): Promise<Automation> {
    return await ops.update(this.state, id, patch);
  }

  /**
   * Delete an automation.
   * @param id - Automation ID
   */
  async delete(id: string): Promise<AutomationDeleteResult> {
    return await ops.delete_(this.state, id);
  }

  /**
   * Run an automation immediately.
   * @param id - Automation ID
   * @param opts - Options (force mode bypasses schedule check)
   */
  async run(id: string, opts?: { mode?: "force" }): Promise<AutomationRunResult> {
    return await ops.run(this.state, id, opts);
  }

  /**
   * Cancel a running automation.
   * @param runId - Run ID to cancel
   */
  async cancel(runId: string): Promise<{ ok: true; cancelled: boolean }> {
    return await ops.cancel(this.state, runId);
  }

  /**
   * Get run history for an automation.
   * @param automationId - Automation ID
   * @param opts - Options (limit for pagination)
   */
  async getHistory(
    automationId: string,
    opts?: { limit?: number },
  ): Promise<AutomationHistoryResult> {
    return await ops.getHistory(this.state, automationId, opts);
  }

  /**
   * Get a single run by ID.
   * @param runId - Run ID
   */
  async getRun(runId: string): Promise<import("./types.js").AutomationRun | null> {
    return await ops.getRun(this.state, runId);
  }

  /**
   * @internal Wait for the current timer execution to complete.
   * For testing only.
   */
  async _waitForTimerRun(): Promise<void> {
    if (this.state._lastTimerRun) {
      await this.state._lastTimerRun;
    }
  }
}
