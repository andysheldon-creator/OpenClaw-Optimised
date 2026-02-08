import type { AuditEvent, AuditSeverity } from "../security/audit-log.js";
import type { RunState, RunStep, RunTransition } from "../types/run.js";
import type { ApprovalItemStatus, ApprovalUrgency } from "../ui/approval-queue.js";

export type CapabilityStatus = "live-ready" | "partial" | "stub" | "blocked";
export type SkillLifecycleState = "active" | "disabled" | "deprecated" | "yanked";

export type SkillCapability = {
  skillName: string;
  status: CapabilityStatus;
  reason: string;
  source: string;
  requiredTools: string[];
  requiredEnv: string[];
  blockers: string[];
  updatedAt: string;
};

export type SkillInventoryItem = {
  id: string;
  name: string;
  version: string;
  description: string;
  lifecycle: SkillLifecycleState;
  capability: CapabilityStatus;
  liveReady: boolean;
  readinessBlockers: string[];
  requiredTools: string[];
  requiredEnv: string[];
  requiredConfig: string[];
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  source: string;
  owners: string[];
  pinnedVersion?: string;
  lastOperationAt?: string;
  lastOperationBy?: string;
};

export type WorkflowLifecycleState = "undeployed" | "deployed" | "active" | "paused" | "archived";

export type WorkflowInventoryItem = {
  id: string;
  externalId?: string;
  name: string;
  version: string;
  lifecycle: WorkflowLifecycleState;
  source: "n8n" | "template" | "runtime";
  category: string;
  mappedSkills: string[];
  deployCount: number;
  isHealthy: boolean;
  lastSyncAt?: string;
  description?: string;
  hash: string;
  previousVersion?: string;
};

export type WorkflowSkillBinding = {
  id: string;
  workflowId: string;
  nodeId: string;
  skillName: string;
  parameterMap: Record<string, string>;
  requiredSecrets: string[];
  requiredTools: string[];
  requiredEnv: string[];
  createdAt: string;
  updatedAt: string;
};

export type BindingValidationIssue = {
  code: "missing_skill" | "skill_not_live" | "missing_secret" | "missing_tool" | "missing_env";
  severity: "error" | "warning";
  message: string;
};

export type BindingValidationResult = {
  valid: boolean;
  issues: BindingValidationIssue[];
  checkedAt: string;
};

export type DriftSeverity = "low" | "medium" | "high" | "critical";
export type DriftEntity = "skill" | "workflow" | "binding";

export type DriftItem = {
  id: string;
  entity: DriftEntity;
  entityId: string;
  expectedHash: string;
  observedHash: string;
  severity: DriftSeverity;
  summary: string;
  detectedAt: string;
};

export type SyncHealth = {
  lastSkillSyncAt?: string;
  lastWorkflowSyncAt?: string;
  lastDriftCheckAt?: string;
  staleAfterSec: number;
  unresolvedDriftCount: number;
  unresolvedCriticalDriftCount: number;
  stale: boolean;
};

export type LedgerStatus = "deduped" | "applied" | "failed";

export type ExternalMutationLedgerEntry = {
  id: string;
  runId: string;
  actionId: string;
  adapter: "browser" | "cli";
  accountId: string;
  resourceType: string;
  resourceId: string;
  idempotencyKey: string;
  fingerprint: string;
  status: LedgerStatus;
  errorCategory?: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketingExecutionMode = "dry-run" | "live";
export type MarketingAdapterKind = "browser" | "cli";

export type MarketingActionType =
  | "campaign.create_or_update"
  | "ad_group.create_or_update"
  | "keyword.add_or_update"
  | "ad.add_or_pause";

export type MarketingAction = {
  id: string;
  accountId: string;
  type: MarketingActionType;
  adapter: MarketingAdapterKind;
  campaignName: string;
  adGroupName?: string;
  resourceId?: string;
  payload: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
};

export type MarketingActionTelemetry = {
  actionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  adapter: MarketingAdapterKind;
  status: "success" | "failed" | "skipped";
  errorCategory?: string;
  details: Record<string, unknown>;
};

export type MarketingRun = {
  id: string;
  title: string;
  mode: MarketingExecutionMode;
  accountId: string;
  state: RunState;
  skillName: string;
  createdAt: string;
  updatedAt: string;
  transitions: RunTransition[];
  steps: RunStep[];
  input: unknown;
  output: unknown;
  artifacts: string[];
  actionGraphHash: string;
  approvals: string[];
  telemetry: MarketingActionTelemetry[];
  replayTrace: Array<{
    actionId: string;
    adapter: MarketingAdapterKind;
    request: unknown;
    response: unknown;
  }>;
};

export type ApprovalQueueRecord = {
  id: string;
  runId: string;
  skillName: string;
  stepIndex: number;
  reason: string;
  status: ApprovalItemStatus;
  urgency: ApprovalUrgency;
  allowedApprovers: string[];
  createdAt: string;
  expiresAt?: string;
  stepSummary?: string;
  triggeredBy: string;
  policy: {
    ruleId: string;
    risk: "low" | "medium" | "high" | "critical";
    requiresApproval: boolean;
  };
};

export type ControlPlanePolicyRole = "viewer" | "operator" | "admin";

export type LifecycleAction =
  | "skill.enable"
  | "skill.disable"
  | "skill.pin"
  | "skill.unpin"
  | "skill.deprecate"
  | "skill.reactivate"
  | "skill.reload"
  | "workflow.deploy"
  | "workflow.activate"
  | "workflow.pause"
  | "workflow.run"
  | "workflow.rollback"
  | "binding.upsert";

export type PolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  severity: AuditSeverity;
  ruleId: string;
  reason: string;
};

export type ControlPlaneAuditEvent = AuditEvent & {
  action: LifecycleAction | "marketing.execute" | "marketing.compile";
  policyDecision?: PolicyDecision;
};

export type ControlPlaneState = {
  version: 1;
  updatedAt: string;
  capabilityMatrix: SkillCapability[];
  skills: Record<string, Partial<SkillInventoryItem>>;
  workflows: Record<string, Partial<WorkflowInventoryItem>>;
  bindings: WorkflowSkillBinding[];
  runs: MarketingRun[];
  approvals: ApprovalQueueRecord[];
  ledger: ExternalMutationLedgerEntry[];
  drift: DriftItem[];
  syncHealth: SyncHealth;
  audit: ControlPlaneAuditEvent[];
};

export type DashboardSnapshot = {
  generatedAt: string;
  runs: MarketingRun[];
  approvals: ApprovalQueueRecord[];
  skills: SkillInventoryItem[];
  workflows: WorkflowInventoryItem[];
  bindings: WorkflowSkillBinding[];
  drift: DriftItem[];
  syncHealth: SyncHealth;
};
