import type {
  ApprovalQueueItem,
  ApprovalQueueItem as ApprovalQueueEntry,
} from "../../../src/clawdbot/ui/approval-queue.ts";
import type { RunDetailView, StepInspection } from "../../../src/clawdbot/ui/run-detail.ts";
import type { RunListItem } from "../../../src/clawdbot/ui/runs-list.ts";
import type { SkillCard, SkillDetail } from "../../../src/clawdbot/ui/skill-registry-ui.ts";
import type { Widget } from "../../../src/clawdbot/ui/widgets.ts";
import type { CatalogEntry } from "../../../src/clawdbot/ui/workflow-catalog.ts";
import type { MockRunDetailBundle } from "./run-detail.ts";
import { RunState } from "../../../src/clawdbot/types/run.ts";
import { DEFAULT_INSPECTOR_DRAWER } from "../../../src/clawdbot/ui/run-detail.ts";
import { buildMockApprovals } from "./approvals.ts";
import { getDashboardGatewayClient } from "./gateway-client.ts";
import { buildMockRunDetailBundle } from "./run-detail.ts";
import { buildMockRunList } from "./runs.ts";
import { buildMockSkillsRegistry } from "./skills.ts";
import { buildMockWidgets } from "./widgets.ts";
import { buildMockWorkflowCatalog } from "./workflow-catalog.ts";

const MOCK_MODE_KEY = "openclaw.dashboard.mock_mode";

export function isDashboardMockModeEnabled(): boolean {
  try {
    return window.localStorage.getItem(MOCK_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDashboardMockMode(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(MOCK_MODE_KEY, "1");
      return;
    }
    window.localStorage.removeItem(MOCK_MODE_KEY);
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

type SnapshotResponse = {
  generatedAt: string;
  runs: Array<{
    id: string;
    title: string;
    mode: "dry-run" | "live";
    accountId: string;
    state: RunState;
    skillName: string;
    createdAt: string;
    updatedAt: string;
    transitions: Array<{
      from: RunState;
      to: RunState;
      timestamp: string;
      reason: string;
      actor: string;
    }>;
    steps: Array<{
      id: string;
      toolCall: string;
      input: unknown;
      result: unknown;
      durationMs?: number;
      state: string;
    }>;
    input: unknown;
    output: unknown;
    artifacts: string[];
    actionGraphHash: string;
    approvals: string[];
    telemetry: Array<{
      actionId: string;
      startedAt: string;
      completedAt: string;
      durationMs: number;
      adapter: "browser" | "cli";
      status: "success" | "failed" | "skipped";
      errorCategory?: string;
      details: Record<string, unknown>;
    }>;
    replayTrace: Array<{
      actionId: string;
      adapter: "browser" | "cli";
      request: unknown;
      response: unknown;
    }>;
  }>;
  approvals: ApprovalQueueEntry[];
  skills: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    lifecycle: "active" | "disabled" | "deprecated" | "yanked";
    capability: "live-ready" | "partial" | "stub" | "blocked";
    requiredTools: string[];
    liveReady: boolean;
    source: string;
    readinessBlockers: string[];
  }>;
  workflows: Array<{
    id: string;
    externalId?: string;
    name: string;
    description?: string;
    version: string;
    lifecycle: "undeployed" | "deployed" | "active" | "paused" | "archived";
    source: "n8n" | "template" | "runtime";
    category: string;
    mappedSkills: string[];
    deployCount: number;
    lastSyncAt?: string;
  }>;
  bindings: Array<{
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
  }>;
  drift: Array<{
    id: string;
    entity: "skill" | "workflow" | "binding";
    entityId: string;
    severity: "low" | "medium" | "high" | "critical";
    summary: string;
    detectedAt: string;
  }>;
  syncHealth: {
    stale: boolean;
    unresolvedDriftCount: number;
  };
};

export async function fetchDashboardSnapshot(): Promise<SnapshotResponse> {
  const client = getDashboardGatewayClient();
  return await client.request<SnapshotResponse>("clawdbot.snapshot");
}

export async function fetchWidgets(): Promise<Widget[]> {
  try {
    const snapshot = await fetchDashboardSnapshot();
    const runs = snapshot.runs;
    const approvals = snapshot.approvals;
    const running = runs.filter((item) => item.state === RunState.Running).length;
    const completed = runs.filter((item) => item.state === RunState.Completed).length;
    const failed = runs.filter((item) => item.state === RunState.Failed).length;
    const awaitingApproval = runs.filter((item) => item.state === RunState.AwaitingApproval).length;
    const canceled = runs.filter((item) => item.state === RunState.Canceled).length;
    const oldestPending = approvals
      .filter((item) => item.status === "pending")
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    const activities = runs.slice(0, 6).map((run) => ({
      id: `run-${run.id}`,
      message: `${run.title} (${run.state})`,
      timestamp: run.updatedAt,
      href: `/runs/${run.id}`,
    }));

    const recentApprovals = approvals.slice(0, 3).map((approval) => ({
      id: `approval-${approval.id}`,
      message: `Approval ${approval.id} (${approval.status})`,
      timestamp: approval.createdAt,
      href: "/approvals",
    }));

    const runsByDay = new Map<string, number>();
    for (const run of runs) {
      const day = run.createdAt.slice(0, 10);
      runsByDay.set(day, (runsByDay.get(day) ?? 0) + 1);
    }

    const dailyCosts = [...runsByDay.entries()].map(([date, count]) => ({
      date,
      costUsd: count * 0.45,
    }));

    return [
      {
        id: "runs-summary",
        title: "Runs Summary",
        type: "runs_summary",
        size: "medium",
        loading: false,
        refreshIntervalSec: 15,
        data: {
          total: runs.length,
          running,
          completed,
          failed,
          awaitingApproval,
          canceled,
          windowStart: runs[runs.length - 1]?.createdAt ?? new Date().toISOString(),
          windowEnd: new Date().toISOString(),
        },
      },
      {
        id: "approvals-pending",
        title: "Approvals Pending",
        type: "approvals_pending",
        size: "small",
        loading: false,
        refreshIntervalSec: 10,
        data: {
          pendingCount: approvals.filter((item) => item.status === "pending").length,
          oldestPendingAt: oldestPending?.createdAt,
          urgentItemIds: approvals
            .filter((item) => item.urgency === "critical" || item.urgency === "high")
            .map((item) => item.id),
        },
      },
      {
        id: "system-health",
        title: "System Health",
        type: "system_health",
        size: "medium",
        loading: false,
        refreshIntervalSec: 10,
        data: {
          overall:
            snapshot.syncHealth.stale || snapshot.syncHealth.unresolvedDriftCount > 0
              ? "degraded"
              : "healthy",
          components: [
            {
              name: "sync-health",
              status:
                snapshot.syncHealth.stale || snapshot.syncHealth.unresolvedDriftCount > 0
                  ? "degraded"
                  : "healthy",
              message: `${snapshot.syncHealth.unresolvedDriftCount} unresolved drift item(s)`,
              lastCheckedAt: snapshot.generatedAt,
            },
            {
              name: "skills",
              status: snapshot.skills.some((item) => !item.liveReady) ? "degraded" : "healthy",
              message: `${snapshot.skills.filter((item) => item.liveReady).length}/${snapshot.skills.length} live-ready`,
              lastCheckedAt: snapshot.generatedAt,
            },
            {
              name: "workflows",
              status: snapshot.workflows.length > 0 ? "healthy" : "unknown",
              message: `${snapshot.workflows.length} workflow(s) in inventory`,
              lastCheckedAt: snapshot.generatedAt,
            },
          ],
        },
      },
      {
        id: "cost-overview",
        title: "Cost Overview",
        type: "cost_overview",
        size: "small",
        loading: false,
        refreshIntervalSec: 30,
        data: {
          totalCostUsd: runs.length * 0.45,
          dailyCosts,
          periodStart: runs[runs.length - 1]?.createdAt ?? new Date().toISOString(),
          periodEnd: new Date().toISOString(),
        },
      },
      {
        id: "recent-activity",
        title: "Recent Activity",
        type: "recent_activity",
        size: "large",
        loading: false,
        refreshIntervalSec: 12,
        data: {
          entries: [...activities, ...recentApprovals]
            .toSorted((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, 8),
        },
      },
    ];
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockWidgets();
    }
    throw error;
  }
}

export async function fetchRunList(): Promise<RunListItem[]> {
  try {
    const snapshot = await fetchDashboardSnapshot();
    return snapshot.runs.map((run) => ({
      id: run.id,
      skillName: run.skillName,
      state: run.state,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      durationMs: Date.parse(run.updatedAt) - Date.parse(run.createdAt),
      stepsCompleted: run.steps.filter((step) => step.state === "completed").length,
      stepsTotal: run.steps.length,
      triggeredBy: run.mode,
      estimatedCostUsd: Number((run.steps.length * 0.45).toFixed(2)),
    }));
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockRunList().items;
    }
    throw error;
  }
}

export async function fetchRunDetail(runId: string): Promise<MockRunDetailBundle> {
  try {
    const client = getDashboardGatewayClient();
    const response = await client.request<{ run: SnapshotResponse["runs"][number] }>(
      "clawdbot.runs.get",
      { runId },
    );
    const run = response.run;

    const timeline = run.transitions.map((transition, index) => ({
      id: `transition-${index}`,
      type: "state_change" as const,
      timestamp: transition.timestamp,
      summary: `${transition.from} -> ${transition.to}: ${transition.reason}`,
      actor: transition.actor,
    }));

    const inspectionsByStepId: Record<string, StepInspection> = {};
    for (const step of run.steps) {
      inspectionsByStepId[step.id] = {
        step: {
          id: step.id,
          toolCall: step.toolCall,
          input: step.input,
          result: step.result,
          durationMs: step.durationMs,
          state: step.state as never,
        },
        formattedInput: JSON.stringify(step.input ?? {}, null, 2),
        formattedOutput: step.result ? JSON.stringify(step.result, null, 2) : undefined,
        durationLabel:
          typeof step.durationMs === "number"
            ? `${Math.round(step.durationMs / 10) / 100}s`
            : undefined,
        artifactIds: run.artifacts,
        timelineEntries: timeline.filter((entry) => entry.summary.includes(step.id)),
        redactedFields: [],
      };
    }

    const view: RunDetailView = {
      run: {
        id: run.id,
        skillName: run.skillName,
        state: run.state,
        transitions: run.transitions,
        steps: run.steps.map((step) => ({
          id: step.id,
          toolCall: step.toolCall,
          input: step.input,
          result: step.result,
          durationMs: step.durationMs,
          state: step.state as never,
        })),
        input: run.input,
        output: run.output,
        artifacts: run.artifacts,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      timeline,
      drawer: {
        ...DEFAULT_INSPECTOR_DRAWER,
      },
      liveUpdates: run.state === RunState.Running || run.state === RunState.AwaitingApproval,
      activeTab: "timeline",
    };

    return {
      view,
      inspectionsByStepId,
    };
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockRunDetailBundle(runId);
    }
    throw error;
  }
}

export async function fetchApprovals(): Promise<ApprovalQueueItem[]> {
  try {
    const client = getDashboardGatewayClient();
    const response = await client.request<{ approvals: ApprovalQueueItem[] }>(
      "clawdbot.approvals.list",
    );
    return response.approvals;
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockApprovals();
    }
    throw error;
  }
}

export async function resolveApproval(input: {
  approvalId: string;
  decision: "approved" | "rejected";
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getDashboardGatewayClient();
    await client.request("clawdbot.approvals.resolve", {
      approvalId: input.approvalId,
      decision: input.decision,
      reason: input.reason,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function fetchSkillsRegistry(): Promise<{
  cards: SkillCard[];
  detailsByName: Record<string, SkillDetail>;
}> {
  try {
    const client = getDashboardGatewayClient();
    const response = await client.request<{ skills: SnapshotResponse["skills"] }>(
      "clawdbot.skills.inventory",
    );

    const cards: SkillCard[] = response.skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      status:
        skill.lifecycle === "deprecated"
          ? "deprecated"
          : skill.lifecycle === "yanked"
            ? "yanked"
            : "active",
      author: skill.source,
      publishedAt: new Date().toISOString(),
      declaredTools: skill.requiredTools,
      approvalRequired: skill.capability === "blocked" || skill.capability === "partial",
      usageCount: 0,
      avgDurationMs: undefined,
      tags: [skill.capability, skill.lifecycle],
    }));

    const detailsByName: Record<string, SkillDetail> = {};
    for (const card of cards) {
      const skill = response.skills.find((item) => item.name === card.name);
      detailsByName[card.name] = {
        card,
        manifestYaml: `name: ${card.name}\nversion: ${card.version}\ncapability: ${skill?.capability ?? "unknown"}\nlifecycle: ${skill?.lifecycle ?? "unknown"}\n`,
        versions: [{ version: card.version, publishedAt: card.publishedAt, status: card.status }],
        allowedDomains: [],
        declaredSecrets: [],
        changelog: [
          {
            version: card.version,
            summary: `Capability ${skill?.capability ?? "unknown"}`,
            date: new Date().toISOString().slice(0, 10),
          },
        ],
      };
    }

    return { cards, detailsByName };
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockSkillsRegistry();
    }
    throw error;
  }
}

export async function mutateSkill(input: {
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
}): Promise<{ ok: boolean; requiresApproval?: boolean; approvalId?: string; error?: string }> {
  try {
    const client = getDashboardGatewayClient();
    const result = await client.request<{
      ok: boolean;
      requiresApproval?: boolean;
      approvalId?: string;
    }>("clawdbot.skills.mutate", input);
    return result;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function fetchWorkflowCatalog(): Promise<CatalogEntry[]> {
  try {
    const client = getDashboardGatewayClient();
    const response = await client.request<{ workflows: SnapshotResponse["workflows"] }>(
      "clawdbot.workflows.inventory",
    );

    return response.workflows.map((workflow) => {
      const sourceLabel = workflow.source === "template" ? "n8n-template" : workflow.source;
      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description ?? `${sourceLabel} workflow`,
        longDescription: undefined,
        version: workflow.version,
        author: sourceLabel,
        category: workflow.category as CatalogEntry["category"],
        status:
          workflow.lifecycle === "archived"
            ? "archived"
            : workflow.lifecycle === "undeployed"
              ? "draft"
              : "published",
        requiredSkills: workflow.mappedSkills,
        estimatedDurationSec: undefined,
        publishedAt: workflow.lastSyncAt ?? new Date().toISOString(),
        updatedAt: workflow.lastSyncAt ?? new Date().toISOString(),
        deployCount: workflow.deployCount,
        tags: [workflow.lifecycle, sourceLabel],
      };
    });
  } catch (error) {
    if (isDashboardMockModeEnabled()) {
      return buildMockWorkflowCatalog();
    }
    throw error;
  }
}

export async function mutateWorkflow(input: {
  workflowId: string;
  action:
    | "workflow.deploy"
    | "workflow.activate"
    | "workflow.pause"
    | "workflow.run"
    | "workflow.rollback";
  reason: string;
  targetVersion?: string;
}): Promise<{ ok: boolean; requiresApproval?: boolean; approvalId?: string; error?: string }> {
  try {
    const client = getDashboardGatewayClient();
    const result = await client.request<{
      ok: boolean;
      requiresApproval?: boolean;
      approvalId?: string;
    }>("clawdbot.workflows.mutate", input);
    return result;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function fetchBindings(): Promise<SnapshotResponse["bindings"]> {
  const client = getDashboardGatewayClient();
  const response = await client.request<{ bindings: SnapshotResponse["bindings"] }>(
    "clawdbot.bindings.list",
  );
  return response.bindings;
}

export async function upsertBinding(input: {
  id?: string;
  workflowId: string;
  nodeId: string;
  skillName: string;
  parameterMap: Record<string, string>;
  requiredSecrets: string[];
  requiredTools: string[];
  requiredEnv: string[];
  reason: string;
}): Promise<{
  ok: boolean;
  validation?: { valid: boolean; issues: Array<{ message: string }> };
  error?: string;
}> {
  try {
    const client = getDashboardGatewayClient();
    const result = await client.request<{
      ok: boolean;
      validation: { valid: boolean; issues: Array<{ message: string }> };
    }>("clawdbot.bindings.upsert", input);
    return result;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function compileMarketingPlan(plan: unknown): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  actionGraphHash?: string;
  actions: Array<{
    id: string;
    type: string;
    adapter: string;
    campaignName: string;
    adGroupName?: string;
    risk: string;
    payload?: Record<string, unknown>;
  }>;
}> {
  const client = getDashboardGatewayClient();
  return await client.request("clawdbot.marketing.compile", { plan });
}

export async function executeMarketingPlan(plan: unknown): Promise<{
  ok: boolean;
  run?: SnapshotResponse["runs"][number];
  approvals?: ApprovalQueueItem[];
  warnings?: string[];
  error?: string;
}> {
  try {
    const client = getDashboardGatewayClient();
    const response = await client.request<{
      ok: boolean;
      run?: SnapshotResponse["runs"][number];
      approvals?: ApprovalQueueItem[];
      warnings?: string[];
    }>("clawdbot.marketing.execute", { plan });
    return response;
  } catch (error) {
    return {
      ok: false,
      error: String(error),
    };
  }
}

export async function fetchReadinessReport(): Promise<{
  checkedAt: string;
  skillSummary: {
    total: number;
    liveReady: number;
    blocked: number;
    partial: number;
    stub: number;
  };
  adapters: { browser: { ok: boolean; detail: string }; cli: { ok: boolean; detail: string } };
  syncHealth: { stale: boolean; unresolvedDriftCount: number };
  drift: Array<{ id: string; summary: string; severity: string }>;
}> {
  const client = getDashboardGatewayClient();
  return await client.request("clawdbot.readiness.report");
}
