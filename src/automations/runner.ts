/**
 * AutomationRunner - Execution engine for automations.
 *
 * Handles the execution of different automation types with progress
 * tracking, artifact collection, and conflict detection.
 */

import crypto from "node:crypto";
import type { AutomationServiceState } from "./service/state.js";
import type {
  Automation,
  AutomationArtifact,
  AutomationConflict,
  AutomationMilestone,
} from "./types.js";
import { emitAutomationProgress } from "./events.js";
import { CustomScriptExecutor } from "./executors/custom-script.js";
import { SmartSyncForkExecutor } from "./executors/smart-sync-fork.js";
import { WebhookExecutor } from "./executors/webhook.js";

/**
 * Execution result from an automation run.
 */
export type AutomationRunnerResult = {
  /** Final status of the run */
  status: "success" | "error" | "blocked";
  /** Timeline of execution milestones */
  milestones: AutomationMilestone[];
  /** Artifacts produced during execution */
  artifacts: AutomationArtifact[];
  /** Conflicts detected during execution */
  conflicts: AutomationConflict[];
  /** Error message if execution failed */
  error?: string;
};

/**
 * Runner for executing automations.
 *
 * Orchestrates the full lifecycle of an automation run including
 * progress tracking, artifact collection, and conflict resolution.
 */
export class AutomationRunner {
  private readonly milestones: AutomationMilestone[] = [];
  private readonly artifacts: AutomationArtifact[] = [];
  private readonly conflicts: AutomationConflict[] = [];
  private currentMilestone = 0;

  constructor(
    private readonly state: AutomationServiceState,
    private readonly automation: Automation,
    private readonly runId: string,
    private readonly startedAt: number,
  ) {}

  /**
   * Execute the automation and return the result.
   */
  async execute(): Promise<AutomationRunnerResult> {
    try {
      // Determine execution strategy based on automation type
      switch (this.automation.config.type) {
        case "smart-sync-fork":
          return await this.executeSmartSyncFork();
        case "custom-script":
          return await this.executeCustomScript();
        case "webhook":
          return await this.executeWebhook();
        default: {
          const _exhaustive: never = this.automation.config;
          return {
            status: "error",
            milestones: [],
            artifacts: [],
            conflicts: [],
            error: "Unknown automation type",
          };
        }
      }
    } catch (err) {
      return {
        status: "error",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: this.conflicts,
        error: String(err),
      };
    }
  }

  /**
   * Execute a smart-sync-fork automation.
   */
  private async executeSmartSyncFork(): Promise<AutomationRunnerResult> {
    const executor = new SmartSyncForkExecutor(
      this.state,
      this.automation,
      this.runId,
      this.startedAt,
    );
    return await executor.execute();
  }

  /**
   * Execute a custom-script automation.
   */
  private async executeCustomScript(): Promise<AutomationRunnerResult> {
    const executor = new CustomScriptExecutor(
      this.state,
      this.automation,
      this.runId,
      this.startedAt,
    );
    return await executor.execute();
  }

  /**
   * Execute a webhook automation.
   */
  private async executeWebhook(): Promise<AutomationRunnerResult> {
    const executor = new WebhookExecutor(this.state, this.automation, this.runId, this.startedAt);
    return await executor.execute();
  }

  /**
   * Add a milestone to the timeline.
   */
  private addMilestone(title: string): void {
    const milestone: AutomationMilestone = {
      id: crypto.randomUUID(),
      title,
      status: "completed",
      timestamp: new Date().toISOString(),
    };

    // Mark previous milestone as completed
    if (this.milestones.length > 0) {
      this.milestones[this.milestones.length - 1].status = "completed";
    }

    // Add new milestone as current
    milestone.status = "current";
    this.milestones.push(milestone);
  }

  /**
   * Emit progress event with percentage.
   */
  private emitProgress(percentage: number): void {
    const currentMilestone = this.milestones[this.milestones.length - 1];
    emitAutomationProgress(
      this.state,
      this.automation.id,
      this.runId,
      currentMilestone.title,
      percentage,
    );
  }
}
