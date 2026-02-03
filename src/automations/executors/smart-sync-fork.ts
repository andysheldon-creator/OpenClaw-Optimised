/**
 * Smart Sync Fork Executor - Synchronizes fork repositories with upstream.
 *
 * Handles git operations including cloning, fetching, merging/rebasing,
 * conflict detection, and pull request creation.
 */

import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AutomationRunnerResult } from "../runner.js";
import type { AutomationServiceState } from "../service/state.js";
import type {
  SmartSyncForkConfig,
  AutomationArtifact,
  AutomationMilestone,
  AutomationConflict,
} from "../types.js";
import { ArtifactStorage } from "../artifacts.js";
import { emitAutomationProgress } from "../events.js";

// Import simple-git dynamically to avoid namespace issues
let simpleGitInstance: any;
try {
  simpleGitInstance = require("simple-git");
} catch {
  // simple-git might not be available in all environments
}

/**
 * Branch status analysis result.
 */
interface BranchStatus {
  /** Whether fork is ahead of upstream */
  ahead: boolean;
  /** Number of commits ahead */
  aheadCount: number;
  /** Whether fork is behind upstream */
  behind: boolean;
  /** Number of commits behind */
  behindCount: number;
  /** Whether branches have diverged */
  diverged: boolean;
}

/**
 * Conflict type detected during sync.
 */
type ConflictType =
  | "merge-conflict"
  | "rebase-conflict"
  | "cherry-pick-conflict"
  | "diverged"
  | "auth"
  | "network";

/**
 * Executor for smart-sync-fork automations.
 */
export class SmartSyncForkExecutor {
  private readonly artifacts: AutomationArtifact[] = [];
  private readonly milestones: AutomationMilestone[] = [];
  private readonly conflicts: AutomationConflict[] = [];
  private artifactStorage: ArtifactStorage;
  private git: any; // simple-git SimpleGit instance
  private tempDir: string;
  private octokit?: Octokit;

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

    this.tempDir = path.join(
      tmpdir(),
      `clawdbrain-automation-${this.runId}-${crypto.randomUUID().slice(0, 8)}`,
    );
    this.git = simpleGitInstance ? simpleGitInstance.default() : null;

    if (!this.git) {
      throw new Error("simple-git is not available. Please ensure it is installed.");
    }

    // Initialize Octokit if auth token is provided
    const config = this.automation.config as SmartSyncForkConfig;
    if (config.authToken) {
      this.octokit = new Octokit({ auth: config.authToken });
    }
  }

  /**
   * Execute the smart-sync-fork automation.
   */
  async execute(): Promise<AutomationRunnerResult> {
    const config = this.automation.config as SmartSyncForkConfig;

    try {
      // Milestone 1: Cloning fork repository
      this.addMilestone("Cloning fork repository");
      this.emitProgress(10);

      await this.cloneFork(config.forkRepoUrl);

      // Milestone 2: Adding upstream remote
      this.addMilestone("Adding upstream remote");
      this.emitProgress(20);

      await this.addUpstreamRemote(config.upstreamRepoUrl);

      // Milestone 3: Fetching upstream changes
      this.addMilestone("Fetching upstream changes");
      this.emitProgress(30);

      await this.fetchUpstream();

      // Milestone 4: Analyzing branch state
      this.addMilestone("Analyzing branch state");
      this.emitProgress(40);

      const status = await this.analyzeBranchStatus(config.forkBranch, config.upstreamBranch);

      // Milestone 5: Syncing using strategy
      this.addMilestone(`Syncing using ${config.strategy}`);
      this.emitProgress(50);

      await this.syncBranches(config, status);

      // Milestone 6: Pushing to fork
      this.addMilestone("Pushing to fork");
      this.emitProgress(70);

      await this.pushToFork(config.forkBranch);

      // Milestone 7: Creating pull request (if enabled)
      if (config.createPullRequest && this.octokit) {
        this.addMilestone("Creating pull request");
        this.emitProgress(80);

        const prUrl = await this.createPullRequest(config);
        if (prUrl) {
          const prArtifact = await this.artifactStorage.storeText(
            this.runId,
            "pull-request-url.txt",
            "text/plain",
            prUrl,
          );
          this.artifacts.push(prArtifact);
        }
      }

      // Generate diff and commit artifacts
      await this.generateSyncArtifacts(config);

      // Clean up temp directory
      await this.cleanup();

      // Milestone 8: Sync complete
      this.addMilestone("Sync complete");
      this.emitProgress(100);

      return {
        status: this.conflicts.length > 0 ? "blocked" : "success",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: this.conflicts,
      };
    } catch (err) {
      await this.cleanup();

      const error = err as Error;

      // Handle specific error types
      if ("code" in error) {
        const errorCode = (error as { code?: string }).code;

        if (errorCode === "ETIMEDOUT" || error.message.includes("timeout")) {
          return {
            status: "error",
            milestones: this.milestones,
            artifacts: this.artifacts,
            conflicts: this.conflicts,
            error: "Network timeout during git operation",
          };
        }

        if (errorCode === "EACCES" || errorCode === "EPERM") {
          return {
            status: "error",
            milestones: this.milestones,
            artifacts: this.artifacts,
            conflicts: this.conflicts,
            error: "Permission denied during git operation",
          };
        }
      }

      // Check for auth errors
      if (error.message.includes("Authentication") || error.message.includes("auth")) {
        this.conflicts.push({
          type: "auth",
          description: "Authentication failed for git operation",
          resolution: "Check git credentials or authToken",
        });
      }

      // Check for network errors
      if (error.message.includes("network") || error.message.includes("connect")) {
        this.conflicts.push({
          type: "network",
          description: "Network error during git operation",
          resolution: "Check network connectivity and repository URLs",
        });
      }

      return {
        status: this.conflicts.length > 0 ? "blocked" : "error",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: this.conflicts,
        error: error.message ?? String(err),
      };
    }
  }

  /**
   * Clone the fork repository to a temporary directory.
   */
  private async cloneFork(forkUrl: string): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });

    // Clone only the specific branch to reduce bandwidth
    const branch = (this.automation.config as SmartSyncForkConfig).forkBranch;
    await this.git.clone(forkUrl, this.tempDir, [
      "--depth",
      "1",
      "--branch",
      branch,
      "--single-branch",
    ]);

    // Change to the cloned directory
    this.git = simpleGitInstance.default(this.tempDir);
  }

  /**
   * Add the upstream repository as a remote.
   */
  private async addUpstreamRemote(upstreamUrl: string): Promise<void> {
    const remotes = await this.git.getRemotes(true);
    const hasUpstream = remotes.some((r: { name: string }) => r.name === "upstream");

    if (!hasUpstream) {
      await this.git.addRemote("upstream", upstreamUrl);
    }
  }

  /**
   * Fetch changes from the upstream repository.
   */
  private async fetchUpstream(): Promise<void> {
    const upstreamBranch = (this.automation.config as SmartSyncForkConfig).upstreamBranch;
    await this.git.fetch("upstream", upstreamBranch);
  }

  /**
   * Analyze the status of the fork branch relative to upstream.
   */
  private async analyzeBranchStatus(
    forkBranch: string,
    upstreamBranch: string,
  ): Promise<BranchStatus> {
    const forkRemote = "origin";
    const upstreamRemote = "upstream";

    // Get the revision lists
    const _forkRevList = await this.git.revparse([`${forkRemote}/${forkBranch}`]);
    const _upstreamRevList = await this.git.revparse([`${upstreamRemote}/${upstreamBranch}`]);

    // Count commits ahead and behind
    const aheadCount = await this.git.revparse([
      `${forkRemote}/${forkBranch}..${upstreamRemote}/${upstreamBranch}`,
      "--count",
    ]);
    const behindCount = await this.git.revparse([
      `${upstreamRemote}/${upstreamBranch}..${forkRemote}/${forkBranch}`,
      "--count",
    ]);

    const ahead = parseInt(aheadCount, 10) > 0;
    const behind = parseInt(behindCount, 10) > 0;
    const diverged = ahead && behind;

    return {
      ahead,
      aheadCount: parseInt(aheadCount, 10),
      behind,
      behindCount: parseInt(behindCount, 10),
      diverged,
    };
  }

  /**
   * Sync branches using the configured strategy.
   */
  private async syncBranches(config: SmartSyncForkConfig, status: BranchStatus): Promise<void> {
    const upstreamBranch = `upstream/${config.upstreamBranch}`;

    try {
      switch (config.strategy) {
        case "merge":
          await this.mergeStrategy(upstreamBranch, config.conflictResolution);
          break;

        case "rebase":
          await this.rebaseStrategy(upstreamBranch, config.conflictResolution);
          break;

        case "cherry-pick":
          await this.cherryPickStrategy(upstreamBranch, config.conflictResolution);
          break;

        default:
          throw new Error(`Unknown sync strategy: ${String(config.strategy)}`);
      }
    } catch (err) {
      const error = err as Error;

      // Check for merge conflicts
      if (error.message.includes("CONFLICT")) {
        const conflictType: ConflictType =
          config.strategy === "merge"
            ? "merge-conflict"
            : config.strategy === "rebase"
              ? "rebase-conflict"
              : "cherry-pick-conflict";

        await this.handleConflict(conflictType, config);
      } else if (status.diverged) {
        this.conflicts.push({
          type: "diverged",
          description: "Branches have diverged and cannot be automatically synchronized",
          resolution:
            config.conflictResolution === "fail"
              ? "Manual resolution required"
              : `Resolved using ${config.conflictResolution} strategy`,
        });

        if (config.conflictResolution === "fail") {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Perform merge strategy sync.
   */
  private async mergeStrategy(
    upstreamBranch: string,
    conflictResolution: SmartSyncForkConfig["conflictResolution"],
  ): Promise<void> {
    try {
      await this.git.merge([upstreamBranch]);
    } catch (err) {
      if ((err as Error).message.includes("CONFLICT")) {
        // Handle conflict based on resolution strategy
        if (conflictResolution === "prefer-theirs") {
          await this.git.raw(["checkout", "--theirs", "."]);
          await this.git.add(".");
          await this.git.commit(["--no-edit"]);
        } else if (conflictResolution === "prefer-ours") {
          await this.git.raw(["checkout", "--ours", "."]);
          await this.git.add(".");
          await this.git.commit(["--no-edit"]);
        } else {
          // fail - abort merge and throw
          await this.git.merge(["--abort"]);
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Perform rebase strategy sync.
   */
  private async rebaseStrategy(
    upstreamBranch: string,
    conflictResolution: SmartSyncForkConfig["conflictResolution"],
  ): Promise<void> {
    try {
      await this.git.rebase([upstreamBranch]);
    } catch (err) {
      if ((err as Error).message.includes("CONFLICT")) {
        // Handle conflict based on resolution strategy
        if (conflictResolution === "prefer-theirs") {
          await this.git.raw(["checkout", "--theirs", "."]);
          await this.git.add(".");
          await this.git.rebase(["--continue"]);
        } else if (conflictResolution === "prefer-ours") {
          await this.git.raw(["checkout", "--ours", "."]);
          await this.git.add(".");
          await this.git.rebase(["--continue"]);
        } else {
          // fail - abort rebase and throw
          await this.git.rebase(["--abort"]);
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Perform cherry-pick strategy sync.
   */
  private async cherryPickStrategy(
    upstreamBranch: string,
    conflictResolution: SmartSyncForkConfig["conflictResolution"],
  ): Promise<void> {
    // Get commits from upstream that are not in fork
    const commits = await this.git.log([`${upstreamBranch}..HEAD`]);

    for (const commit of commits.all) {
      try {
        // Use raw git cherry-pick command
        await this.git.raw(["cherry-pick", commit.hash]);
      } catch (err) {
        if ((err as Error).message.includes("CONFLICT")) {
          // Handle conflict based on resolution strategy
          if (conflictResolution === "prefer-theirs") {
            await this.git.raw(["checkout", "--theirs", "."]);
            await this.git.add(".");
            await this.git.raw(["cherry-pick", "--continue"]);
          } else if (conflictResolution === "prefer-ours") {
            await this.git.raw(["checkout", "--ours", "."]);
            await this.git.add(".");
            await this.git.raw(["cherry-pick", "--continue"]);
          } else {
            // fail - abort cherry-pick and throw
            await this.git.raw(["cherry-pick", "--abort"]);
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Handle a sync conflict.
   */
  private async handleConflict(type: ConflictType, config: SmartSyncForkConfig): Promise<void> {
    const conflict = {
      type,
      description: `Conflict detected during ${config.strategy} operation`,
      resolution:
        config.conflictResolution === "fail"
          ? "Manual resolution required"
          : `Auto-resolved using ${config.conflictResolution} strategy`,
    };

    this.conflicts.push(conflict);

    if (config.conflictResolution === "fail") {
      // Abort the current operation
      try {
        if (config.strategy === "merge") {
          await this.git.merge(["--abort"]);
        } else if (config.strategy === "rebase") {
          await this.git.rebase(["--abort"]);
        } else if (config.strategy === "cherry-pick") {
          await this.git.raw(["cherry-pick", "--abort"]);
        }
      } catch {
        // Ignore abort errors
      }

      throw new Error(`Conflict detected and conflict resolution is set to 'fail': ${type}`);
    }
  }

  /**
   * Push changes to the fork repository.
   */
  private async pushToFork(branch: string): Promise<void> {
    // Use force-with-lease for safer push
    await this.git.push("origin", branch, ["--force-with-lease"]);
  }

  /**
   * Create a pull request using GitHub API.
   */
  private async createPullRequest(config: SmartSyncForkConfig): Promise<string | null> {
    if (!this.octokit) {
      return null;
    }

    // Parse repository URLs to get owner/repo
    const forkMatch = config.forkRepoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/i);
    const upstreamMatch = config.upstreamRepoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/i);

    if (!forkMatch || !upstreamMatch) {
      return null;
    }

    const [, forkOwner, _forkRepo] = forkMatch;
    const [, upstreamOwner, upstreamRepo] = upstreamMatch;

    try {
      // Generate PR title and body from templates
      const title = this.interpolateTemplate(
        config.pullRequest?.titleTemplate ?? "Sync upstream changes from {upstreamBranch}",
        config,
      );

      const body = this.interpolateTemplate(
        config.pullRequest?.bodyTemplate ??
          "Automated sync from `{upstreamRepoUrl}` branch `{upstreamBranch}`",
        config,
      );

      const response = await this.octokit.rest.pulls.create({
        owner: upstreamOwner,
        repo: upstreamRepo,
        head: `${forkOwner}:${config.forkBranch}`,
        base: config.upstreamBranch,
        title,
        body,
        draft: config.pullRequest?.draft ?? false,
      });

      // Add labels, assignees, and reviewers if specified
      const prNumber = response.data.number;

      if (config.pullRequest?.labels && config.pullRequest.labels.length > 0) {
        await this.octokit.rest.issues.addLabels({
          owner: upstreamOwner,
          repo: upstreamRepo,
          issue_number: prNumber,
          labels: config.pullRequest.labels,
        });
      }

      if (config.pullRequest?.assignees && config.pullRequest.assignees.length > 0) {
        await this.octokit.rest.issues.addAssignees({
          owner: upstreamOwner,
          repo: upstreamRepo,
          issue_number: prNumber,
          assignees: config.pullRequest.assignees,
        });
      }

      if (config.pullRequest?.reviewers && config.pullRequest.reviewers.length > 0) {
        await this.octokit.rest.pulls.requestReviewers({
          owner: upstreamOwner,
          repo: upstreamRepo,
          pull_number: prNumber,
          reviewers: config.pullRequest.reviewers,
        });
      }

      return response.data.html_url;
    } catch (err) {
      // Log error but don't fail the automation
      console.error("Failed to create pull request:", err);
      return null;
    }
  }

  /**
   * Interpolate template variables.
   */
  private interpolateTemplate(template: string, config: SmartSyncForkConfig): string {
    return template
      .replace(/\{upstreamBranch\}/g, config.upstreamBranch)
      .replace(/\{forkBranch\}/g, config.forkBranch)
      .replace(/\{upstreamRepoUrl\}/g, config.upstreamRepoUrl)
      .replace(/\{forkRepoUrl\}/g, config.forkRepoUrl)
      .replace(/\{strategy\}/g, config.strategy)
      .replace(/\{conflictResolution\}/g, config.conflictResolution);
  }

  /**
   * Generate sync artifacts (diff, commits, etc.).
   */
  private async generateSyncArtifacts(config: SmartSyncForkConfig): Promise<void> {
    try {
      // Get diff between fork and upstream
      const upstreamBranch = `upstream/${config.upstreamBranch}`;
      const diff = await this.git.diff([upstreamBranch, config.forkBranch]);

      if (diff) {
        const diffArtifact = await this.artifactStorage.storeText(
          this.runId,
          "sync.diff",
          "text/plain",
          diff,
        );
        this.artifacts.push(diffArtifact);
      }

      // Get commit log
      const log = await this.git.log([`${upstreamBranch}..HEAD`, "--oneline"]);
      const logText = log.all
        .map((c: { hash: string; message: string }) => `${c.hash} ${c.message}`)
        .join("\n");

      if (logText) {
        const logArtifact = await this.artifactStorage.storeText(
          this.runId,
          "commits.txt",
          "text/plain",
          logText,
        );
        this.artifacts.push(logArtifact);
      }
    } catch {
      // Ignore artifact generation errors
    }
  }

  /**
   * Clean up temporary directory.
   */
  private async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
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
