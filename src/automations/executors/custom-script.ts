/**
 * Custom Script Executor - Executes user-defined scripts.
 *
 * Handles script execution with proper permission checking, timeout handling,
 * and artifact storage for stdout/stderr.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runCommandWithTimeout } from "../../process/exec.js";
import type { AutomationRunnerResult } from "../runner.js";
import type { CustomScriptConfig, AutomationArtifact, AutomationMilestone } from "../types.js";
import type { AutomationServiceState } from "../service/state.js";
import { ArtifactStorage } from "../artifacts.js";
import { emitAutomationProgress } from "../events.js";

/**
 * Executor for custom-script automations.
 */
export class CustomScriptExecutor {
  private readonly artifacts: AutomationArtifact[] = [];
  private readonly milestones: AutomationMilestone[] = [];
  private artifactStorage: ArtifactStorage;

  constructor(
    private readonly state: AutomationServiceState,
    private readonly automation: import("../types.js").Automation,
    private readonly runId: string,
    private readonly startedAt: number,
  ) {
    this.artifactStorage = new ArtifactStorage({
      artifactsDir: path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? ".",
        ".clawdbrain",
        "automations",
        "artifacts",
      ),
      baseUrl: "/api/artifacts",
    });
  }

  /**
   * Execute the custom script automation.
   */
  async execute(): Promise<AutomationRunnerResult> {
    const config = this.automation.config as CustomScriptConfig;

    try {
      // Milestone 1: Validating script path
      this.addMilestone("Validating script path");
      const scriptPath = await this.resolveScriptPath(config.script);

      // Milestone 2: Verifying script permissions
      this.addMilestone("Verifying script permissions");
      await this.ensureExecutable(scriptPath);
      this.emitProgress(10);

      // Milestone 3: Starting script execution
      this.addMilestone("Starting script execution");
      this.emitProgress(20);

      // Prepare environment
      const env = {
        ...process.env,
        ...config.environment,
      };

      const workingDir = config.workingDirectory
        ? path.resolve(config.workingDirectory)
        : process.cwd();

      // Build command arguments
      const args = config.args ?? [];
      const timeoutMs = config.timeoutMs ?? 30000; // Default 30 seconds

      // Milestone 4: Running...
      this.addMilestone("Running...");
      this.emitProgress(30);

      // Execute the script
      const result = await runCommandWithTimeout([scriptPath, ...args], {
        timeoutMs,
        cwd: workingDir,
        env,
      });

      // Store stdout and stderr as artifacts
      if (result.stdout) {
        const stdoutArtifact = await this.artifactStorage.storeText(
          this.runId,
          "stdout.txt",
          "text/plain",
          result.stdout,
        );
        this.artifacts.push(stdoutArtifact);
      }

      if (result.stderr) {
        const stderrArtifact = await this.artifactStorage.storeText(
          this.runId,
          "stderr.txt",
          "text/plain",
          result.stderr,
        );
        this.artifacts.push(stderrArtifact);
      }

      // Check exit code
      if (result.code !== 0) {
        this.addMilestone("Failed");
        return {
          status: "error",
          milestones: this.milestones,
          artifacts: this.artifacts,
          conflicts: [],
          error: `Script exited with code ${result.code}${result.stderr ? `: ${result.stderr}` : ""}`,
        };
      }

      // Milestone 5: Completed
      this.addMilestone("Completed");
      this.emitProgress(100);

      return {
        status: "success",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: [],
      };
    } catch (err) {
      const error = err as Error;

      // Handle specific error codes
      if ("code" in error) {
        const errorCode = (error as { code?: string }).code;

        if (errorCode === "ENOENT") {
          return {
            status: "error",
            milestones: this.milestones,
            artifacts: this.artifacts,
            conflicts: [],
            error: `Script not found: ${config.script}`,
          };
        }

        if (errorCode === "EACCES") {
          return {
            status: "error",
            milestones: this.milestones,
            artifacts: this.artifacts,
            conflicts: [],
            error: `Permission denied: ${config.script}`,
          };
        }

        if (errorCode === "ETIMEDOUT" || error.message.includes("timeout")) {
          return {
            status: "error",
            milestones: this.milestones,
            artifacts: this.artifacts,
            conflicts: [],
            error: `Script execution timed out after ${config.timeoutMs ?? 30000}ms`,
          };
        }
      }

      return {
        status: "error",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: [],
        error: error.message ?? String(err),
      };
    }
  }

  /**
   * Resolve the script path to an absolute path.
   */
  private async resolveScriptPath(script: string): Promise<string> {
    // Check if it's already an absolute path
    if (path.isAbsolute(script)) {
      // Verify the file exists
      try {
        await fs.access(script);
        return script;
      } catch {
        throw new Error(`Script not found: ${script}`);
      }
    }

    // Resolve relative to current working directory
    const resolved = path.resolve(process.cwd(), script);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      throw new Error(`Script not found: ${script}`);
    }
  }

  /**
   * Ensure the script file is executable.
   * Attempts to add execute permissions if not already set.
   */
  private async ensureExecutable(scriptPath: string): Promise<void> {
    try {
      const stats = await fs.stat(scriptPath);

      // Check if the file is executable
      const mode = stats.mode;
      const isExecutable = (mode & 0o111) !== 0;

      if (!isExecutable) {
        // Try to add execute permission
        try {
          await fs.chmod(scriptPath, mode | 0o111);
        } catch {
          throw new Error(`Script is not executable and chmod failed: ${scriptPath}`);
        }
      }
    } catch (err) {
      throw new Error(`Failed to check script permissions: ${err}`);
    }
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
