/**
 * Improve Service for DJ Assistant
 *
 * Implements PR-only governance for codebase improvements with
 * strict security guardrails.
 *
 * CRITICAL: This service NEVER auto-merges PRs. All PRs require human review.
 */

import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { BudgetProfileId } from "../../budget/types.js";
import type { NotionService } from "../notion/index.js";
import { BudgetGovernor, createBudgetGovernor } from "../../budget/governor.js";
import {
  buildFullBlocklist,
  calculateTotalLines,
  checkBlocklist,
  filterByBlocklist,
  filterToLineBudget,
  sortOpportunities,
} from "./improve-sources.js";
import {
  DEFAULT_IMPROVE_CONFIG,
  MAX_PR_LINES,
  NEVER_AUTO_MERGE,
  type CreatePrOptions,
  type CreatePrResult,
  type ImprovePlan,
  type ImprovePlanId,
  type ImprovePlanStatus,
  type ImproveServiceConfig,
  type ImproveStatusResult,
  type PlanOptions,
  type ScanOptions,
  type ScanResult,
} from "./improve-types.js";

const execAsync = promisify(exec);

// =============================================================================
// Plan ID Generation
// =============================================================================

/**
 * Generate a unique plan ID.
 * Format: imp-{8 random hex chars}
 */
export function generatePlanId(): ImprovePlanId {
  const suffix = randomBytes(4).toString("hex");
  return `imp-${suffix}`;
}

/**
 * Validate a plan ID format.
 */
export function isValidPlanId(id: string): id is ImprovePlanId {
  return /^imp-[a-f0-9]{8}$/.test(id);
}

// =============================================================================
// Improve Service Class
// =============================================================================

export class ImproveService {
  private notionService?: NotionService;
  private config: ImproveServiceConfig;
  private currentScope: string[];
  private plans: Map<ImprovePlanId, ImprovePlan> = new Map();
  private lastScanResult?: ScanResult;

  constructor(config: ImproveServiceConfig = {}) {
    this.config = config;
    this.currentScope = config.defaultScope ?? DEFAULT_IMPROVE_CONFIG.scope;
  }

  /**
   * Set the Notion service (dependency injection).
   */
  setNotionService(service: NotionService): void {
    this.notionService = service;
  }

  /**
   * Scan for improvement opportunities.
   */
  async scan(options: ScanOptions = {}): Promise<ScanResult> {
    const scope = options.scope ?? this.currentScope;
    const blocklist = buildFullBlocklist(options.customBlocklist);
    const profile = options.budgetProfile ?? this.config.defaultBudgetProfile ?? "normal";

    // Create budget governor
    const governor = this.createGovernor(profile);

    const result: ScanResult = {
      scannedFiles: 0,
      opportunities: [],
      blockedFiles: [],
      truncated: false,
      totalEstimatedLines: 0,
      scannedAt: new Date().toISOString(),
    };

    try {
      // Get files matching scope using glob
      const { stdout } = await execAsync(
        `git ls-files ${scope.map((s) => `'${s}'`).join(" ")} 2>/dev/null || find . -type f ${scope.map((s) => `-path './${s}'`).join(" -o ")}`,
        { maxBuffer: 10 * 1024 * 1024 },
      );

      const allFiles = stdout.trim().split("\n").filter(Boolean);

      // Filter by blocklist
      const { allowed, blocked } = filterByBlocklist(allFiles, blocklist);
      result.blockedFiles = blocked;

      // Scan each file (simplified - would use LLM in practice)
      for (const _file of allowed) {
        // Check budget
        const budgetCheck = governor.checkLimits();
        if (!budgetCheck.allowed) {
          result.truncated = true;
          break;
        }

        result.scannedFiles++;

        // In a real implementation, this would:
        // 1. Read the file using _file path
        // 2. Send to LLM for analysis
        // 3. Parse suggestions into opportunities
        // For now, we create placeholder opportunities

        governor.recordToolCall("file_read");
      }

      // Sort opportunities by confidence
      result.opportunities = sortOpportunities(result.opportunities);
      result.totalEstimatedLines = calculateTotalLines(result.opportunities);

      // Store for later use
      this.lastScanResult = result;

      // Log to Notion (non-fatal)
      if (!options.skipNotionLog && this.notionService) {
        try {
          // Could log scan results to Notion here
        } catch (error) {
          console.warn("[ImproveService] Failed to log scan to Notion:", error);
        }
      }

      return result;
    } catch (error) {
      console.error("[ImproveService] Scan failed:", error);
      return result;
    }
  }

  /**
   * Create an improvement plan from selected opportunities.
   */
  async plan(options: PlanOptions): Promise<ImprovePlan | null> {
    if (!this.lastScanResult) {
      console.error("[ImproveService] No scan results available. Run scan first.");
      return null;
    }

    // Find selected opportunities
    const selectedOpps = this.lastScanResult.opportunities.filter((opp) =>
      options.opportunityIds.includes(opp.id),
    );

    if (selectedOpps.length === 0) {
      console.error("[ImproveService] No valid opportunities selected.");
      return null;
    }

    // Check total lines against limit
    const totalLines = calculateTotalLines(selectedOpps);
    if (totalLines > MAX_PR_LINES) {
      // Filter to fit within budget
      const filtered = filterToLineBudget(selectedOpps, MAX_PR_LINES);
      console.warn(
        `[ImproveService] Selected opportunities exceed ${MAX_PR_LINES} line limit. ` +
          `Filtered from ${selectedOpps.length} to ${filtered.length} opportunities.`,
      );
      selectedOpps.length = 0;
      selectedOpps.push(...filtered);
    }

    // Verify no blocklist violations
    const blocklist = buildFullBlocklist();
    for (const opp of selectedOpps) {
      const check = checkBlocklist(opp.file, blocklist);
      if (check.blocked) {
        console.error(
          `[ImproveService] SECURITY: Opportunity ${opp.id} targets blocked file: ${opp.file}`,
        );
        return null;
      }
    }

    // Create plan
    const plan: ImprovePlan = {
      planId: generatePlanId(),
      opportunities: selectedOpps,
      selectedIds: selectedOpps.map((o) => o.id),
      status: "draft",
      estimatedLines: calculateTotalLines(selectedOpps),
      createdAt: new Date().toISOString(),
    };

    // Store plan
    this.plans.set(plan.planId, plan);

    // Log to Notion (non-fatal)
    if (!options.skipNotionLog && this.notionService) {
      try {
        const pageId = await this.notionService.createImprovePlanEntry({
          planId: plan.planId,
          status: plan.status,
          opportunityCount: plan.opportunities.length,
          estimatedLines: plan.estimatedLines,
          scope: this.currentScope,
          createdAt: plan.createdAt,
        });
        if (pageId) {
          plan.notionPageId = pageId;
        }
      } catch (error) {
        console.warn("[ImproveService] Failed to log plan to Notion:", error);
      }
    }

    return plan;
  }

  /**
   * Create a PR from an approved plan.
   *
   * CRITICAL: This method NEVER auto-merges. PRs require human review.
   */
  async createPr(options: CreatePrOptions): Promise<CreatePrResult> {
    // Enforce NEVER_AUTO_MERGE
    if (!NEVER_AUTO_MERGE) {
      throw new Error("SECURITY: Auto-merge flag must never be enabled");
    }

    const plan = this.plans.get(options.planId);
    if (!plan) {
      return {
        success: false,
        message: `Plan not found: ${options.planId}`,
      };
    }

    // Verify plan is approved
    if (plan.status !== "approved") {
      return {
        success: false,
        message: `Plan must be approved before creating PR. Current status: ${plan.status}`,
      };
    }

    // Re-verify blocklist (defense in depth)
    const blocklist = buildFullBlocklist();
    for (const opp of plan.opportunities) {
      const check = checkBlocklist(opp.file, blocklist);
      if (check.blocked) {
        this.updatePlanStatus(plan, "rejected", `SECURITY: Blocked file detected: ${opp.file}`);
        return {
          success: false,
          message: `SECURITY: Plan rejected - targets blocked file: ${opp.file}`,
        };
      }
    }

    // Update status
    this.updatePlanStatus(plan, "executing");

    try {
      const branchName = options.branchName ?? `improve/${plan.planId}`;
      const commitMessage =
        options.commitMessage ?? `chore: apply improvements from ${plan.planId}`;
      const baseBranch = this.config.baseBranch ?? "main";

      // Create branch
      await execAsync(`git checkout -b ${branchName} ${baseBranch}`);

      // Apply changes (simplified - would actually edit files)
      // In a real implementation, this would:
      // 1. Apply each opportunity's changes
      // 2. Run tests
      // 3. Verify changes

      // Stage and commit
      await execAsync(`git add -A && git commit -m "${commitMessage}"`);

      // Push branch
      await execAsync(`git push -u origin ${branchName}`);

      // Create PR using gh CLI
      const prTitle = `chore: ${plan.opportunities.length} improvements (${plan.estimatedLines} lines)`;
      const prBody = this.buildPrBody(plan);

      const { stdout } = await execAsync(
        `gh pr create --title "${prTitle}" --body "${prBody}" --base ${baseBranch} --head ${branchName}`,
      );

      // Parse PR URL from output
      const prUrl = stdout.trim();
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

      // Update plan
      plan.prUrl = prUrl;
      plan.prNumber = prNumber;
      plan.branchName = branchName;
      this.updatePlanStatus(plan, "pr-created");

      // Switch back to base branch
      await execAsync(`git checkout ${baseBranch}`);

      return {
        success: true,
        prUrl,
        prNumber,
        branchName,
        message: `PR created: ${prUrl}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updatePlanStatus(plan, "draft", errorMessage);

      // Try to clean up
      try {
        await execAsync(`git checkout ${this.config.baseBranch ?? "main"}`);
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        message: `Failed to create PR: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Get status of current scope and plans.
   */
  async getStatus(planId?: ImprovePlanId): Promise<ImproveStatusResult> {
    if (planId) {
      const plan = this.plans.get(planId);
      if (!plan) {
        return {
          success: false,
          currentScope: this.currentScope,
          blocklist: buildFullBlocklist(),
          message: `Plan not found: ${planId}`,
        };
      }

      return {
        success: true,
        plan,
        currentScope: this.currentScope,
        blocklist: buildFullBlocklist(),
        message: `Plan ${planId}: ${plan.status}`,
      };
    }

    return {
      success: true,
      currentScope: this.currentScope,
      blocklist: buildFullBlocklist(),
      message: `Scope: ${this.currentScope.join(", ")}`,
    };
  }

  /**
   * Set the scope for scanning.
   */
  setScope(paths: string[]): void {
    // Verify no paths match blocklist
    const blocklist = buildFullBlocklist();
    for (const path of paths) {
      const check = checkBlocklist(path, blocklist);
      if (check.blocked) {
        throw new Error(`SECURITY: Cannot set scope to blocked path: ${path}`);
      }
    }

    this.currentScope = paths;
  }

  /**
   * Approve a plan for PR creation.
   */
  approvePlan(planId: ImprovePlanId): boolean {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "draft") {
      return false;
    }

    this.updatePlanStatus(plan, "approved");
    return true;
  }

  /**
   * Reject a plan.
   */
  rejectPlan(planId: ImprovePlanId, reason?: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) {
      return false;
    }

    this.updatePlanStatus(plan, "rejected", reason);
    return true;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Create a budget governor for the given profile.
   */
  private createGovernor(profile: BudgetProfileId): BudgetGovernor {
    return createBudgetGovernor({ profileId: profile });
  }

  /**
   * Update plan status and sync to Notion.
   */
  private updatePlanStatus(plan: ImprovePlan, status: ImprovePlanStatus, error?: string): void {
    plan.status = status;
    if (error) {
      plan.lastError = error;
    }

    // Sync to Notion (non-fatal)
    if (this.notionService && plan.notionPageId) {
      this.notionService
        .updateImprovePlanEntry(plan.notionPageId, {
          status,
          lastError: error,
          prUrl: plan.prUrl,
          prNumber: plan.prNumber,
        })
        .catch((err) => {
          console.warn("[ImproveService] Failed to update Notion:", err);
        });
    }
  }

  /**
   * Build PR body from plan.
   */
  private buildPrBody(plan: ImprovePlan): string {
    const oppList = plan.opportunities
      .map((o) => `- **${o.type}**: ${o.description} (${o.file}:${o.line ?? "?"})`)
      .join("\\n");

    return `## Summary

This PR applies ${plan.opportunities.length} improvements totaling ~${plan.estimatedLines} lines.

## Changes

${oppList}

## Plan ID

\`${plan.planId}\`

---

Generated by /improve`;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an Improve service instance.
 */
export function createImproveService(config: ImproveServiceConfig = {}): ImproveService {
  return new ImproveService(config);
}
