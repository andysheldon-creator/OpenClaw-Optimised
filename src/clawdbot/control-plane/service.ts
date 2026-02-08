import crypto from "node:crypto";
import type { GoogleAdsMutationAction } from "../tools/google-ads-types.js";
import type { RunState, RunStep, RunStepState, RunTransition } from "../types/run.js";
import type {
  ApprovalQueueRecord,
  BindingValidationResult,
  ControlPlaneAuditEvent,
  ControlPlanePolicyRole,
  ControlPlaneState,
  DashboardSnapshot,
  DriftItem,
  ExternalMutationLedgerEntry,
  LifecycleAction,
  MarketingAction,
  MarketingRun,
  PolicyDecision,
  SkillInventoryItem,
  SyncHealth,
  WorkflowInventoryItem,
  WorkflowSkillBinding,
} from "./types.js";
import { classifyError } from "../observability/error-taxonomy.js";
import { StructuredLogger, LogLevel } from "../observability/logging.js";
import { InMemoryMetrics } from "../observability/metrics.js";
import { InMemoryAuditLog } from "../security/audit-log.js";
import { calculateRiskScore } from "../security/risk-scoring.js";
import { GoogleAdsBrowserAdapter } from "../tools/google-ads-browser.js";
import { GoogleAdsCliAdapter } from "../tools/google-ads-cli.js";
import {
  buildSkillInventory,
  buildWorkflowInventory,
  computeInventoryDrift,
  evaluateSyncHealth,
  writeCapabilityMatrixFile,
} from "./inventory.js";
import {
  actionRequiresApproval,
  compileMarketingPlan,
  computeActionFingerprint,
  type MarketingPlan,
} from "./marketing.js";
import {
  createDefaultControlPlaneState,
  loadControlPlaneState,
  saveControlPlaneState,
  updateControlPlaneState,
} from "./store.js";

export type ControlPlaneActor = {
  id: string;
  role: ControlPlanePolicyRole;
  scopes: string[];
};

export type LifecycleMutationResult<T> = {
  ok: boolean;
  requiresApproval: boolean;
  approvalId?: string;
  policy: PolicyDecision;
  entity?: T;
  error?: string;
};

type SkillMutationInput = {
  skillId: string;
  action:
    | "skill.enable"
    | "skill.disable"
    | "skill.pin"
    | "skill.unpin"
    | "skill.deprecate"
    | "skill.reactivate"
    | "skill.reload";
  reason: string;
  pinnedVersion?: string;
};

type WorkflowMutationInput = {
  workflowId: string;
  action:
    | "workflow.deploy"
    | "workflow.activate"
    | "workflow.pause"
    | "workflow.run"
    | "workflow.rollback";
  reason: string;
  targetVersion?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function asRunState(value: RunState | string): RunState {
  return value as RunState;
}

function asRunStepState(value: RunStepState | string): RunStepState {
  return value as RunStepState;
}

function determineRole(actor: ControlPlaneActor): ControlPlanePolicyRole {
  if (actor.role === "admin") {
    return "admin";
  }
  if (actor.role === "operator") {
    return "operator";
  }
  return "viewer";
}

function evaluatePolicy(input: {
  role: ControlPlanePolicyRole;
  action: LifecycleAction | "marketing.execute";
  reason: string;
  severityHint?: "low" | "medium" | "high" | "critical";
}): PolicyDecision {
  if (!input.reason.trim()) {
    return {
      allowed: false,
      requiresApproval: false,
      severity: "warn",
      ruleId: "reason-required",
      reason: "Reason is required for lifecycle mutations.",
    };
  }

  if (input.role === "viewer") {
    return {
      allowed: false,
      requiresApproval: false,
      severity: "warn",
      ruleId: "viewer-readonly",
      reason: "Viewer role cannot mutate control-plane state.",
    };
  }

  if (input.role === "admin") {
    return {
      allowed: true,
      requiresApproval: input.action === "marketing.execute" && input.severityHint === "critical",
      severity: "info",
      ruleId: "admin-allow",
      reason: "Admin may perform this action.",
    };
  }

  const operatorApprovalActions = new Set<LifecycleAction | "marketing.execute">([
    "skill.disable",
    "skill.deprecate",
    "workflow.pause",
    "workflow.rollback",
    "marketing.execute",
  ]);

  return {
    allowed: true,
    requiresApproval:
      operatorApprovalActions.has(input.action) ||
      input.severityHint === "high" ||
      input.severityHint === "critical",
    severity: "info",
    ruleId: "operator-guarded",
    reason: "Operator action allowed with approval guard when risk is high-impact.",
  };
}

function buildLifecycleAuditEvent(params: {
  actor: ControlPlaneActor;
  action: LifecycleAction | "marketing.execute" | "marketing.compile";
  summary: string;
  metadata?: Record<string, unknown>;
  policyDecision?: PolicyDecision;
  runId?: string;
}): ControlPlaneAuditEvent {
  return {
    id: randomId("audit"),
    timestamp: nowIso(),
    actor: params.actor.id,
    category: "lifecycle",
    severity: params.policyDecision?.severity ?? "info",
    summary: params.summary,
    metadata: params.metadata ?? {},
    runId: params.runId,
    action: params.action,
    policyDecision: params.policyDecision,
  };
}

function mergeSkillOverrides(
  inventory: SkillInventoryItem[],
  overrides: Record<string, Partial<SkillInventoryItem>>,
): SkillInventoryItem[] {
  return inventory.map((row) => {
    const override = overrides[row.id] ?? {};
    return {
      ...row,
      lifecycle: (override.lifecycle as SkillInventoryItem["lifecycle"]) ?? row.lifecycle,
      pinnedVersion: override.pinnedVersion ?? row.pinnedVersion,
      owners: Array.isArray(override.owners) ? override.owners : row.owners,
      lastOperationAt: override.lastOperationAt ?? row.lastOperationAt,
      lastOperationBy: override.lastOperationBy ?? row.lastOperationBy,
    };
  });
}

function mergeWorkflowOverrides(
  inventory: WorkflowInventoryItem[],
  overrides: Record<string, Partial<WorkflowInventoryItem>>,
): WorkflowInventoryItem[] {
  return inventory.map((row) => {
    const override = overrides[row.id] ?? {};
    return {
      ...row,
      lifecycle: (override.lifecycle as WorkflowInventoryItem["lifecycle"]) ?? row.lifecycle,
      deployCount:
        typeof override.deployCount === "number" && Number.isFinite(override.deployCount)
          ? override.deployCount
          : row.deployCount,
      previousVersion:
        typeof override.previousVersion === "string"
          ? override.previousVersion
          : row.previousVersion,
      lastSyncAt: override.lastSyncAt ?? row.lastSyncAt,
    };
  });
}

export class ControlPlaneService {
  private readonly logger = new StructuredLogger(LogLevel.Info, {
    subsystem: "clawdbot-control-plane",
  });
  private readonly metrics = new InMemoryMetrics();
  private readonly auditSink = new InMemoryAuditLog();
  private readonly browserAdapter: GoogleAdsBrowserAdapter;
  private readonly cliAdapter: GoogleAdsCliAdapter;

  constructor() {
    this.browserAdapter = new GoogleAdsBrowserAdapter();
    this.cliAdapter = new GoogleAdsCliAdapter();
  }

  private loadState(): ControlPlaneState {
    return loadControlPlaneState(process.env);
  }

  private saveState(state: ControlPlaneState): ControlPlaneState {
    return saveControlPlaneState(state, process.env);
  }

  async refreshInventory(): Promise<{
    skills: SkillInventoryItem[];
    workflows: WorkflowInventoryItem[];
    drift: DriftItem[];
    syncHealth: SyncHealth;
    state: ControlPlaneState;
  }> {
    const state = this.loadState();
    const skills = buildSkillInventory({ existing: state.skills });
    const workflows = await buildWorkflowInventory({ existing: state.workflows });

    const mergedSkills = mergeSkillOverrides(skills.inventory, state.skills);
    const mergedWorkflows = mergeWorkflowOverrides(workflows.inventory, state.workflows);
    const drift = computeInventoryDrift({
      skills: mergedSkills,
      workflows: mergedWorkflows,
      storedSkills: state.skills,
      storedWorkflows: state.workflows,
    });

    const syncHealth = evaluateSyncHealth({
      staleAfterSec: state.syncHealth.staleAfterSec,
      lastSkillSyncAt: skills.generatedAt,
      lastWorkflowSyncAt: workflows.generatedAt,
      drift,
    });

    writeCapabilityMatrixFile(skills.capabilityMatrix);

    const next = this.saveState({
      ...state,
      capabilityMatrix: skills.capabilityMatrix,
      drift,
      syncHealth,
    });

    return {
      skills: mergedSkills,
      workflows: mergedWorkflows,
      drift,
      syncHealth,
      state: next,
    };
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const refreshed = await this.refreshInventory();
    const runs = [...refreshed.state.runs].toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const approvals = [...refreshed.state.approvals].toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );

    return {
      generatedAt: nowIso(),
      runs,
      approvals,
      skills: refreshed.skills,
      workflows: refreshed.workflows,
      bindings: refreshed.state.bindings,
      drift: refreshed.drift,
      syncHealth: refreshed.syncHealth,
    };
  }

  async listRuns(): Promise<MarketingRun[]> {
    const state = this.loadState();
    return [...state.runs].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(runId: string): Promise<MarketingRun | null> {
    const state = this.loadState();
    return state.runs.find((row) => row.id === runId) ?? null;
  }

  async listApprovals(): Promise<ApprovalQueueRecord[]> {
    const state = this.loadState();
    return [...state.approvals].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveApproval(params: {
    approvalId: string;
    decision: "approved" | "rejected";
    actor: ControlPlaneActor;
    reason: string;
  }): Promise<{ ok: boolean; approval?: ApprovalQueueRecord; error?: string }> {
    let resolved: ApprovalQueueRecord | undefined;
    const next = updateControlPlaneState((current) => {
      const approvals = current.approvals.map((item) => {
        if (item.id !== params.approvalId) {
          return item;
        }
        const status: ApprovalQueueRecord["status"] =
          params.decision === "approved" ? "approved" : "rejected";
        resolved = {
          ...item,
          status,
        };
        return resolved;
      });

      const auditEvent = buildLifecycleAuditEvent({
        actor: params.actor,
        action: "workflow.run",
        summary: `Approval ${params.approvalId} marked ${params.decision}.`,
        metadata: {
          approvalId: params.approvalId,
          decision: params.decision,
          reason: params.reason,
        },
      });

      return {
        ...current,
        approvals,
        audit: [auditEvent, ...current.audit].slice(0, 500),
      };
    });

    if (!resolved) {
      return { ok: false, error: "Approval not found." };
    }

    await this.auditSink.log({
      id: randomId("audit"),
      timestamp: nowIso(),
      actor: params.actor.id,
      category: "approval",
      severity: "info",
      summary: `Approval ${params.approvalId} resolved as ${params.decision}.`,
      metadata: {
        reason: params.reason,
      },
    });

    this.logger.info("approval resolved", {
      approvalId: params.approvalId,
      decision: params.decision,
      approvalsCount: next.approvals.length,
    });

    return { ok: true, approval: resolved };
  }

  async mutateSkill(
    input: SkillMutationInput,
    actor: ControlPlaneActor,
  ): Promise<LifecycleMutationResult<SkillInventoryItem>> {
    const refreshed = await this.refreshInventory();
    const skill = refreshed.skills.find((row) => row.id === input.skillId);
    if (!skill) {
      return {
        ok: false,
        requiresApproval: false,
        policy: {
          allowed: false,
          requiresApproval: false,
          severity: "warn",
          ruleId: "skill-not-found",
          reason: "Skill not found.",
        },
        error: `Unknown skill: ${input.skillId}`,
      };
    }

    const policy = evaluatePolicy({
      role: determineRole(actor),
      action: input.action,
      reason: input.reason,
      severityHint: skill.capability === "blocked" ? "high" : "medium",
    });
    if (!policy.allowed) {
      return { ok: false, requiresApproval: false, policy, error: policy.reason };
    }

    if (policy.requiresApproval) {
      const approval = this.enqueueApproval({
        runId: "skill-lifecycle",
        skillName: skill.name,
        reason: `Approval required for ${input.action} on skill ${skill.name}.`,
        actor,
        urgency: "high",
        policy,
      });
      return { ok: true, requiresApproval: true, approvalId: approval.id, policy };
    }

    const next = updateControlPlaneState((current) => {
      const existing = current.skills[input.skillId] ?? {};
      const updated: Partial<SkillInventoryItem> = {
        ...existing,
        lastOperationAt: nowIso(),
        lastOperationBy: actor.id,
      };

      switch (input.action) {
        case "skill.enable":
          updated.lifecycle = "active";
          break;
        case "skill.disable":
          updated.lifecycle = "disabled";
          break;
        case "skill.pin":
          updated.pinnedVersion = input.pinnedVersion?.trim();
          break;
        case "skill.unpin":
          delete updated.pinnedVersion;
          break;
        case "skill.deprecate":
          updated.lifecycle = "deprecated";
          break;
        case "skill.reactivate":
          updated.lifecycle = "active";
          break;
        case "skill.reload":
          break;
      }

      const audit = buildLifecycleAuditEvent({
        actor,
        action: input.action,
        summary: `Skill ${input.skillId} mutated via ${input.action}.`,
        metadata: {
          skillId: input.skillId,
          reason: input.reason,
          pinnedVersion: input.pinnedVersion,
        },
        policyDecision: policy,
      });

      return {
        ...current,
        skills: {
          ...current.skills,
          [input.skillId]: updated,
        },
        audit: [audit, ...current.audit].slice(0, 500),
      };
    });

    const mutated = mergeSkillOverrides([skill], next.skills)[0];
    return { ok: true, requiresApproval: false, policy, entity: mutated };
  }

  async mutateWorkflow(
    input: WorkflowMutationInput,
    actor: ControlPlaneActor,
  ): Promise<LifecycleMutationResult<WorkflowInventoryItem | MarketingRun>> {
    const refreshed = await this.refreshInventory();
    const workflow = refreshed.workflows.find((row) => row.id === input.workflowId);
    if (!workflow) {
      return {
        ok: false,
        requiresApproval: false,
        policy: {
          allowed: false,
          requiresApproval: false,
          severity: "warn",
          ruleId: "workflow-not-found",
          reason: "Workflow not found.",
        },
        error: `Unknown workflow: ${input.workflowId}`,
      };
    }

    const policy = evaluatePolicy({
      role: determineRole(actor),
      action: input.action,
      reason: input.reason,
      severityHint: workflow.source === "n8n" ? "high" : "medium",
    });
    if (!policy.allowed) {
      return { ok: false, requiresApproval: false, policy, error: policy.reason };
    }

    if (policy.requiresApproval && input.action !== "workflow.run") {
      const approval = this.enqueueApproval({
        runId: "workflow-lifecycle",
        skillName: workflow.name,
        reason: `Approval required for ${input.action} on workflow ${workflow.name}.`,
        actor,
        urgency: "high",
        policy,
      });
      return { ok: true, requiresApproval: true, approvalId: approval.id, policy };
    }

    if (input.action === "workflow.run") {
      const run = this.createWorkflowRun(workflow, actor, input.reason);
      return { ok: true, requiresApproval: false, policy, entity: run };
    }

    const next = updateControlPlaneState((current) => {
      const existing = current.workflows[input.workflowId] ?? {};
      const updated: Partial<WorkflowInventoryItem> = {
        ...existing,
        lastSyncAt: nowIso(),
      };

      switch (input.action) {
        case "workflow.deploy":
          updated.lifecycle = "deployed";
          updated.deployCount = (existing.deployCount ?? 0) + 1;
          break;
        case "workflow.activate":
          updated.lifecycle = "active";
          break;
        case "workflow.pause":
          updated.lifecycle = "paused";
          break;
        case "workflow.rollback":
          updated.previousVersion = workflow.version;
          if (input.targetVersion?.trim()) {
            updated.version = input.targetVersion.trim();
          }
          updated.lifecycle = "deployed";
          break;
        default:
          break;
      }

      const audit = buildLifecycleAuditEvent({
        actor,
        action: input.action,
        summary: `Workflow ${workflow.id} mutated via ${input.action}.`,
        metadata: {
          workflowId: workflow.id,
          reason: input.reason,
          targetVersion: input.targetVersion,
        },
        policyDecision: policy,
      });

      return {
        ...current,
        workflows: {
          ...current.workflows,
          [workflow.id]: updated,
        },
        audit: [audit, ...current.audit].slice(0, 500),
      };
    });

    const merged = mergeWorkflowOverrides([workflow], next.workflows)[0];
    return { ok: true, requiresApproval: false, policy, entity: merged };
  }

  async upsertBinding(
    binding: Omit<WorkflowSkillBinding, "id" | "createdAt" | "updatedAt"> & { id?: string },
    actor: ControlPlaneActor,
    reason: string,
  ): Promise<{
    ok: boolean;
    binding?: WorkflowSkillBinding;
    validation: BindingValidationResult;
    error?: string;
  }> {
    const refreshed = await this.refreshInventory();
    const validation = this.validateBinding(binding, refreshed.skills);
    const policy = evaluatePolicy({
      role: determineRole(actor),
      action: "binding.upsert",
      reason,
      severityHint: validation.valid ? "low" : "high",
    });

    if (!policy.allowed) {
      return {
        ok: false,
        validation,
        error: policy.reason,
      };
    }

    if (!validation.valid && policy.requiresApproval) {
      return {
        ok: false,
        validation,
        error: "Binding preflight failed. Resolve validation issues before applying.",
      };
    }

    let saved: WorkflowSkillBinding | undefined;
    updateControlPlaneState((current) => {
      const now = nowIso();
      const nextBinding: WorkflowSkillBinding = {
        id: binding.id?.trim() || randomId("binding"),
        workflowId: binding.workflowId,
        nodeId: binding.nodeId,
        skillName: binding.skillName,
        parameterMap: { ...binding.parameterMap },
        requiredSecrets: [...binding.requiredSecrets],
        requiredTools: [...binding.requiredTools],
        requiredEnv: [...binding.requiredEnv],
        createdAt: binding.id?.trim()
          ? (current.bindings.find((row) => row.id === binding.id)?.createdAt ?? now)
          : now,
        updatedAt: now,
      };

      saved = nextBinding;

      const bindings = [
        ...current.bindings.filter((row) => row.id !== nextBinding.id),
        nextBinding,
      ];

      const audit = buildLifecycleAuditEvent({
        actor,
        action: "binding.upsert",
        summary: `Binding ${nextBinding.id} saved for workflow ${nextBinding.workflowId}.`,
        metadata: {
          workflowId: nextBinding.workflowId,
          nodeId: nextBinding.nodeId,
          skillName: nextBinding.skillName,
          reason,
          validation,
        },
        policyDecision: policy,
      });

      return {
        ...current,
        bindings,
        audit: [audit, ...current.audit].slice(0, 500),
      };
    });

    return {
      ok: true,
      binding: saved,
      validation,
    };
  }

  validateBinding(
    binding: Omit<WorkflowSkillBinding, "id" | "createdAt" | "updatedAt">,
    skills: SkillInventoryItem[],
  ): BindingValidationResult {
    const issues: BindingValidationResult["issues"] = [];
    const skill = skills.find(
      (row) => row.name === binding.skillName || row.id === binding.skillName,
    );

    if (!skill) {
      issues.push({
        code: "missing_skill",
        severity: "error",
        message: `Skill ${binding.skillName} does not exist in inventory.`,
      });
    } else if (!skill.liveReady || skill.capability !== "live-ready") {
      issues.push({
        code: "skill_not_live",
        severity: "error",
        message: `Skill ${binding.skillName} is not live-ready (${skill.capability}).`,
      });
    }

    for (const envName of binding.requiredEnv) {
      if (!process.env[envName]) {
        issues.push({
          code: "missing_env",
          severity: "warning",
          message: `Missing environment variable ${envName}.`,
        });
      }
    }

    for (const secretName of binding.requiredSecrets) {
      if (!process.env[secretName]) {
        issues.push({
          code: "missing_secret",
          severity: "warning",
          message: `Missing secret ${secretName} in environment.`,
        });
      }
    }

    for (const toolName of binding.requiredTools) {
      const hasTool = skills.some((row) => row.requiredTools.includes(toolName));
      if (!hasTool) {
        issues.push({
          code: "missing_tool",
          severity: "warning",
          message: `No live skill currently advertises required tool ${toolName}.`,
        });
      }
    }

    return {
      valid: issues.every((item) => item.severity !== "error"),
      issues,
      checkedAt: nowIso(),
    };
  }

  async compilePlan(plan: unknown, actor: ControlPlaneActor) {
    const result = compileMarketingPlan(plan);
    const audit = buildLifecycleAuditEvent({
      actor,
      action: "marketing.compile",
      summary: "Marketing plan compiled.",
      metadata: {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        actionCount: result.actions.length,
      },
    });
    updateControlPlaneState((current) => ({
      ...current,
      audit: [audit, ...current.audit].slice(0, 500),
    }));
    return result;
  }

  async executeMarketingPlan(
    plan: unknown,
    actor: ControlPlaneActor,
  ): Promise<{
    ok: boolean;
    run?: MarketingRun;
    approvals?: ApprovalQueueRecord[];
    errors?: string[];
    warnings?: string[];
  }> {
    const compiled = compileMarketingPlan(plan);
    if (!compiled.valid || !compiled.actionGraphHash) {
      return {
        ok: false,
        errors: compiled.errors,
        warnings: compiled.warnings,
      };
    }

    const typedPlan = plan as MarketingPlan;
    const riskLevels = new Set(compiled.actions.map((action) => action.risk));
    const maxRisk = riskLevels.has("critical")
      ? "critical"
      : riskLevels.has("high")
        ? "high"
        : riskLevels.has("medium")
          ? "medium"
          : "low";

    const policy = evaluatePolicy({
      role: determineRole(actor),
      action: "marketing.execute",
      reason: `execute plan ${typedPlan.title}`,
      severityHint: maxRisk,
    });
    if (!policy.allowed) {
      return {
        ok: false,
        errors: [policy.reason],
      };
    }

    const sessionCheck = await Promise.all([
      this.browserAdapter.probeSession(typedPlan.accountId),
      this.cliAdapter.probeSession(typedPlan.accountId),
    ]);
    const browserProbe = sessionCheck[0];
    const cliProbe = sessionCheck[1];

    if (typedPlan.mode === "live") {
      const requiredAdapters = new Set(compiled.actions.map((action) => action.adapter));
      const preflightErrors: string[] = [];
      if (requiredAdapters.has("browser") && !browserProbe.ok) {
        preflightErrors.push(`browser adapter unavailable: ${browserProbe.detail}`);
      }
      if (requiredAdapters.has("cli") && !cliProbe.ok) {
        preflightErrors.push(`cli adapter unavailable: ${cliProbe.detail}`);
      }
      if (preflightErrors.length > 0) {
        return {
          ok: false,
          errors: [
            "Live execution blocked by readiness guard. Resolve adapter prerequisites before rerunning.",
            ...preflightErrors,
          ],
        };
      }
    }

    const run = this.createRunSkeleton(typedPlan, compiled.actions, compiled.actionGraphHash);
    const approvals: ApprovalQueueRecord[] = [];

    const transitionTo = (to: RunState, reason: string): void => {
      const current = run.state;
      const transition: RunTransition = {
        from: current,
        to,
        timestamp: nowIso(),
        reason,
        actor: actor.id,
      };
      run.transitions.push(transition);
      run.state = to;
      run.updatedAt = transition.timestamp;
    };

    transitionTo(asRunState("running"), "Run execution started.");

    for (const [index, action] of compiled.actions.entries()) {
      const step = run.steps[index];
      if (!step) {
        continue;
      }
      step.state = asRunStepState("running");
      const startedAt = Date.now();

      const fingerprint = computeActionFingerprint(action);
      const deduped = this.findLedgerByFingerprint(run.id, fingerprint);
      if (deduped?.status === "applied") {
        step.state = asRunStepState("completed");
        step.result = { deduped: true, ledgerId: deduped.id };
        step.durationMs = Date.now() - startedAt;
        run.telemetry.push({
          actionId: action.id,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: nowIso(),
          durationMs: step.durationMs,
          adapter: action.adapter,
          status: "skipped",
          details: {
            deduped: true,
            ledgerId: deduped.id,
          },
        });
        continue;
      }

      if (typedPlan.mode === "live" && actionRequiresApproval(action) && policy.requiresApproval) {
        const approval = this.enqueueApproval({
          runId: run.id,
          skillName: run.skillName,
          reason: `Action ${action.id} (${action.type}) requires approval (${action.risk}).`,
          actor,
          urgency: action.risk === "critical" ? "critical" : "high",
          policy,
        });
        approvals.push(approval);
        step.state = asRunStepState("pending");
        step.result = { awaitingApproval: approval.id };
        step.durationMs = Date.now() - startedAt;
        transitionTo(asRunState("awaiting_approval"), `Awaiting approval ${approval.id}`);
        break;
      }

      const result = await this.executeAction(action, typedPlan.mode === "dry-run");
      step.durationMs = Date.now() - startedAt;
      step.result = result;

      const telemetryStatus = result.ok ? "success" : "failed";
      const telemetryError = !result.ok ? result.errorCategory : undefined;
      step.state = result.ok ? asRunStepState("completed") : asRunStepState("failed");

      run.telemetry.push({
        actionId: action.id,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: nowIso(),
        durationMs: step.durationMs,
        adapter: action.adapter,
        status: telemetryStatus,
        errorCategory: telemetryError,
        details: result.details,
      });

      run.replayTrace.push({
        actionId: action.id,
        adapter: action.adapter,
        request: {
          type: action.type,
          payload: action.payload,
        },
        response: result,
      });
      run.artifacts.push(`artifact-${run.id}-${action.id}`);

      this.appendLedger({
        runId: run.id,
        action,
        fingerprint,
        status: result.ok ? "applied" : "failed",
        errorCategory: result.errorCategory,
      });

      if (!result.ok) {
        transitionTo(asRunState("failed"), `Action ${action.id} failed.`);
        run.artifacts.push(`replay-${run.id}`);
        break;
      }
    }

    if (run.state === asRunState("running")) {
      transitionTo(asRunState("completed"), "All actions completed.");
    }

    if (run.state === asRunState("awaiting_approval") && approvals.length > 0) {
      run.approvals = approvals.map((item) => item.id);
    }

    run.output = {
      approvals: run.approvals,
      telemetryCount: run.telemetry.length,
      finalState: run.state,
    };

    this.metrics.increment("marketing.run.total", 1, { mode: typedPlan.mode, state: run.state });
    this.metrics.observe(
      "marketing.run.duration_ms",
      Date.parse(run.updatedAt) - Date.parse(run.createdAt),
      { mode: typedPlan.mode },
    );

    const audit = buildLifecycleAuditEvent({
      actor,
      action: "marketing.execute",
      summary: `Marketing run ${run.id} executed in ${typedPlan.mode} mode (${run.state}).`,
      metadata: {
        runId: run.id,
        title: typedPlan.title,
        actionCount: compiled.actions.length,
        state: run.state,
        warnings: compiled.warnings,
        browserProbe,
        cliProbe,
      },
      policyDecision: policy,
      runId: run.id,
    });

    const classified =
      run.state === asRunState("failed") ? classifyError(new Error("marketing run failed")) : null;
    if (classified) {
      this.logger.error("marketing run failed", new Error(classified.message), {
        runId: run.id,
        category: classified.category,
        severity: classified.severity,
      });
    }

    this.saveState(
      updateControlPlaneState((current) => ({
        ...current,
        runs: [run, ...current.runs].slice(0, 300),
        approvals: [...current.approvals, ...approvals],
        audit: [audit, ...current.audit].slice(0, 500),
      })),
    );

    await this.auditSink.log({
      id: randomId("audit"),
      timestamp: nowIso(),
      actor: actor.id,
      category: "tool_invocation",
      severity: run.state === asRunState("failed") ? "error" : "info",
      summary: `Marketing plan executed with ${run.telemetry.length} action(s).`,
      metadata: {
        runId: run.id,
        state: run.state,
      },
      runId: run.id,
    });

    return {
      ok: true,
      run,
      approvals,
      warnings: compiled.warnings,
    };
  }

  private createRunSkeleton(
    plan: MarketingPlan,
    actions: MarketingAction[],
    actionGraphHash: string,
  ): MarketingRun {
    const createdAt = nowIso();
    const steps: RunStep[] = actions.map((action) => ({
      id: action.id,
      toolCall: `${action.adapter}:${action.type}`,
      input: action.payload,
      result: undefined,
      durationMs: undefined,
      state: asRunStepState("pending"),
    }));

    return {
      id: randomId("run"),
      title: plan.title,
      mode: plan.mode,
      accountId: plan.accountId,
      state: asRunState("planned"),
      skillName: "marketing-plan-executor",
      createdAt,
      updatedAt: createdAt,
      transitions: [],
      steps,
      input: plan,
      output: undefined,
      artifacts: [`graph-${actionGraphHash.slice(0, 16)}`],
      actionGraphHash,
      approvals: [],
      telemetry: [],
      replayTrace: [],
    };
  }

  private createWorkflowRun(
    workflow: WorkflowInventoryItem,
    actor: ControlPlaneActor,
    reason: string,
  ): MarketingRun {
    const createdAt = nowIso();
    const run: MarketingRun = {
      id: randomId("run"),
      title: `Workflow run: ${workflow.name}`,
      mode: "live",
      accountId: workflow.externalId ?? workflow.id,
      state: asRunState("completed"),
      skillName: workflow.name,
      createdAt,
      updatedAt: createdAt,
      transitions: [
        {
          from: asRunState("planned"),
          to: asRunState("running"),
          timestamp: createdAt,
          reason,
          actor: actor.id,
        },
        {
          from: asRunState("running"),
          to: asRunState("completed"),
          timestamp: nowIso(),
          reason: "Run-now completed.",
          actor: actor.id,
        },
      ],
      steps: [
        {
          id: randomId("step"),
          toolCall: "workflow.run",
          input: { workflowId: workflow.id },
          result: { ok: true, workflowId: workflow.id },
          durationMs: 10,
          state: asRunStepState("completed"),
        },
      ],
      input: { workflowId: workflow.id },
      output: { ok: true },
      artifacts: [],
      actionGraphHash: workflow.hash,
      approvals: [],
      telemetry: [],
      replayTrace: [],
    };

    updateControlPlaneState((current) => ({
      ...current,
      runs: [run, ...current.runs].slice(0, 300),
    }));

    return run;
  }

  private enqueueApproval(params: {
    runId: string;
    skillName: string;
    reason: string;
    actor: ControlPlaneActor;
    urgency: ApprovalQueueRecord["urgency"];
    policy: PolicyDecision;
  }): ApprovalQueueRecord {
    const approval: ApprovalQueueRecord = {
      id: randomId("approval"),
      runId: params.runId,
      skillName: params.skillName,
      stepIndex: 0,
      reason: params.reason,
      status: "pending",
      urgency: params.urgency,
      allowedApprovers: params.actor.role === "admin" ? [params.actor.id] : ["admin", "ops-lead"],
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      triggeredBy: params.actor.id,
      policy: {
        ruleId: params.policy.ruleId,
        risk:
          params.urgency === "critical"
            ? "critical"
            : params.urgency === "high"
              ? "high"
              : "medium",
        requiresApproval: true,
      },
    };

    updateControlPlaneState((current) => ({
      ...current,
      approvals: [approval, ...current.approvals],
    }));

    return approval;
  }

  private findLedgerByFingerprint(
    runId: string,
    fingerprint: string,
  ): ExternalMutationLedgerEntry | undefined {
    const state = this.loadState();
    return state.ledger.find(
      (entry) =>
        entry.fingerprint === fingerprint && entry.status === "applied" && entry.runId !== runId,
    );
  }

  private appendLedger(params: {
    runId: string;
    action: MarketingAction;
    fingerprint: string;
    status: ExternalMutationLedgerEntry["status"];
    errorCategory?: string;
  }): ExternalMutationLedgerEntry {
    const entry: ExternalMutationLedgerEntry = {
      id: randomId("ledger"),
      runId: params.runId,
      actionId: params.action.id,
      adapter: params.action.adapter,
      accountId: params.action.accountId,
      resourceType: params.action.type,
      resourceId:
        params.action.resourceId ??
        `${params.action.campaignName}:${params.action.adGroupName ?? "campaign"}`,
      idempotencyKey: crypto
        .createHash("sha256")
        .update(`${params.action.accountId}:${params.fingerprint}`)
        .digest("hex"),
      fingerprint: params.fingerprint,
      status: params.status,
      errorCategory: params.errorCategory,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    updateControlPlaneState((current) => ({
      ...current,
      ledger: [entry, ...current.ledger].slice(0, 1_000),
    }));

    return entry;
  }

  private async executeAction(action: MarketingAction, dryRun: boolean) {
    const score = calculateRiskScore({
      tool: action.adapter === "browser" ? "google-ads-browser" : "google-ads-cli",
      environment: dryRun ? "staging" : "prod",
      involvesPii: false,
      externalNetwork: true,
      mutatesState: !dryRun,
      financial: true,
      metadata: {
        type: action.type,
        campaignName: action.campaignName,
      },
    });
    this.metrics.gauge("marketing.action.risk_score", score.score, {
      adapter: action.adapter,
      risk: score.level,
    });

    const adapted: GoogleAdsMutationAction = {
      id: action.id,
      accountId: action.accountId,
      type: action.type,
      campaignName: action.campaignName,
      adGroupName: action.adGroupName,
      resourceId: action.resourceId,
      payload: action.payload,
    };

    if (action.adapter === "cli") {
      return await this.cliAdapter.executeAction(adapted, { dryRun });
    }
    return await this.browserAdapter.executeAction(adapted, {
      dryRun,
      allowCommitActions: !actionRequiresApproval(action),
    });
  }

  async getReadinessReport(): Promise<{
    checkedAt: string;
    skillSummary: {
      total: number;
      liveReady: number;
      blocked: number;
      partial: number;
      stub: number;
    };
    adapters: {
      browser: Awaited<ReturnType<GoogleAdsBrowserAdapter["probeSession"]>>;
      cli: Awaited<ReturnType<GoogleAdsCliAdapter["probeSession"]>>;
    };
    syncHealth: SyncHealth;
    drift: DriftItem[];
  }> {
    const refreshed = await this.refreshInventory();
    const browser = await this.browserAdapter.probeSession();
    const cli = await this.cliAdapter.probeSession();

    const totals = {
      total: refreshed.skills.length,
      liveReady: refreshed.skills.filter((item) => item.capability === "live-ready").length,
      blocked: refreshed.skills.filter((item) => item.capability === "blocked").length,
      partial: refreshed.skills.filter((item) => item.capability === "partial").length,
      stub: refreshed.skills.filter((item) => item.capability === "stub").length,
    };

    return {
      checkedAt: nowIso(),
      skillSummary: totals,
      adapters: {
        browser,
        cli,
      },
      syncHealth: refreshed.syncHealth,
      drift: refreshed.drift,
    };
  }

  async backfillMetadata(actor: ControlPlaneActor): Promise<{
    ok: boolean;
    createdSkills: number;
    createdWorkflows: number;
    unresolved: string[];
  }> {
    const refreshed = await this.refreshInventory();
    let createdSkills = 0;
    let createdWorkflows = 0;

    const next = updateControlPlaneState((current) => {
      const skills = { ...current.skills };
      const workflows = { ...current.workflows };

      for (const skill of refreshed.skills) {
        if (!skills[skill.id]) {
          skills[skill.id] = {
            lifecycle: skill.lifecycle,
            owners: skill.owners,
            pinnedVersion: skill.pinnedVersion,
          };
          createdSkills += 1;
        }
      }

      for (const workflow of refreshed.workflows) {
        if (!workflows[workflow.id]) {
          workflows[workflow.id] = {
            lifecycle: workflow.lifecycle,
            version: workflow.version,
            previousVersion: workflow.previousVersion,
            deployCount: workflow.deployCount,
          };
          createdWorkflows += 1;
        }
      }

      const audit = buildLifecycleAuditEvent({
        actor,
        action: "workflow.deploy",
        summary: "Backfill migration executed for control-plane metadata.",
        metadata: {
          createdSkills,
          createdWorkflows,
        },
      });

      return {
        ...current,
        skills,
        workflows,
        audit: [audit, ...current.audit].slice(0, 500),
      };
    });

    const unresolved: string[] = [];
    for (const driftItem of next.drift) {
      if (driftItem.severity === "critical" || driftItem.severity === "high") {
        unresolved.push(`${driftItem.entity}:${driftItem.entityId}`);
      }
    }

    return {
      ok: true,
      createdSkills,
      createdWorkflows,
      unresolved,
    };
  }
}

let singleton: ControlPlaneService | null = null;

export function getControlPlaneService(): ControlPlaneService {
  if (!singleton) {
    singleton = new ControlPlaneService();
  }
  return singleton;
}

export function resetControlPlaneServiceForTest(): void {
  singleton = null;
  saveControlPlaneState(createDefaultControlPlaneState(), process.env);
}
