import type { GatewayRequestHandlers } from "./types.js";
import {
  getControlPlaneService,
  type ControlPlanePolicyRole,
} from "../../clawdbot/control-plane/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const k = key.trim();
    if (!k) {
      continue;
    }
    out[k] = typeof raw === "string" ? raw : JSON.stringify(raw);
  }
  return out;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function resolveActor(
  client: {
    connect?: { scopes?: string[]; role?: string; client?: { id?: string; displayName?: string } };
  } | null,
) {
  const scopes = client?.connect?.scopes ?? [];
  const role: ControlPlanePolicyRole = scopes.includes("operator.admin")
    ? "admin"
    : scopes.includes("operator.write")
      ? "operator"
      : "viewer";

  return {
    id:
      client?.connect?.client?.displayName?.trim() ||
      client?.connect?.client?.id?.trim() ||
      "gateway-operator",
    role,
    scopes,
  };
}

const service = getControlPlaneService();

export const clawdbotControlPlaneHandlers: GatewayRequestHandlers = {
  "clawdbot.snapshot": async ({ respond }) => {
    const snapshot = await service.getDashboardSnapshot();
    respond(true, snapshot, undefined);
  },
  "clawdbot.runs.list": async ({ respond }) => {
    const runs = await service.listRuns();
    respond(true, { runs }, undefined);
  },
  "clawdbot.runs.get": async ({ params, respond }) => {
    const runId = asString(parseObject(params).runId);
    if (!runId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "runId is required"));
      return;
    }
    const run = await service.getRun(runId);
    if (!run) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `run not found: ${runId}`));
      return;
    }
    respond(true, { run }, undefined);
  },
  "clawdbot.approvals.list": async ({ respond }) => {
    const approvals = await service.listApprovals();
    respond(true, { approvals }, undefined);
  },
  "clawdbot.approvals.resolve": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const approvalId = asString(payload.approvalId);
    const decision = asString(payload.decision) as "approved" | "rejected";
    const reason = asString(payload.reason);
    if (!approvalId || (decision !== "approved" && decision !== "rejected")) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "approvalId and decision (approved|rejected) are required",
        ),
      );
      return;
    }
    const result = await service.resolveApproval({
      approvalId,
      decision,
      reason,
      actor: resolveActor(client),
    });
    if (!result.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "resolve failed"),
      );
      return;
    }
    respond(true, result, undefined);
  },
  "clawdbot.skills.inventory": async ({ respond }) => {
    const snapshot = await service.getDashboardSnapshot();
    respond(true, { skills: snapshot.skills }, undefined);
  },
  "clawdbot.skills.mutate": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const skillId = asString(payload.skillId);
    const action = asString(payload.action) as
      | "skill.enable"
      | "skill.disable"
      | "skill.pin"
      | "skill.unpin"
      | "skill.deprecate"
      | "skill.reactivate"
      | "skill.reload";
    const reason = asString(payload.reason);

    if (!skillId || !action || !reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skillId, action, and reason are required"),
      );
      return;
    }

    const result = await service.mutateSkill(
      {
        skillId,
        action,
        reason,
        pinnedVersion: asString(payload.pinnedVersion),
      },
      resolveActor(client),
    );

    if (!result.ok && !result.requiresApproval) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? result.policy.reason),
      );
      return;
    }

    respond(true, result, undefined);
  },
  "clawdbot.workflows.inventory": async ({ respond }) => {
    const snapshot = await service.getDashboardSnapshot();
    respond(true, { workflows: snapshot.workflows }, undefined);
  },
  "clawdbot.workflows.mutate": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const workflowId = asString(payload.workflowId);
    const action = asString(payload.action) as
      | "workflow.deploy"
      | "workflow.activate"
      | "workflow.pause"
      | "workflow.run"
      | "workflow.rollback";
    const reason = asString(payload.reason);
    if (!workflowId || !action || !reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "workflowId, action, and reason are required"),
      );
      return;
    }

    const result = await service.mutateWorkflow(
      {
        workflowId,
        action,
        reason,
        targetVersion: asString(payload.targetVersion),
      },
      resolveActor(client),
    );

    if (!result.ok && !result.requiresApproval) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? result.policy.reason),
      );
      return;
    }

    respond(true, result, undefined);
  },
  "clawdbot.bindings.list": async ({ respond }) => {
    const snapshot = await service.getDashboardSnapshot();
    respond(true, { bindings: snapshot.bindings }, undefined);
  },
  "clawdbot.bindings.upsert": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const reason = asString(payload.reason);
    const result = await service.upsertBinding(
      {
        id: asString(payload.id) || undefined,
        workflowId: asString(payload.workflowId),
        nodeId: asString(payload.nodeId),
        skillName: asString(payload.skillName),
        parameterMap: asRecord(payload.parameterMap),
        requiredSecrets: asStringList(payload.requiredSecrets),
        requiredTools: asStringList(payload.requiredTools),
        requiredEnv: asStringList(payload.requiredEnv),
      },
      resolveActor(client),
      reason,
    );
    if (!result.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "binding upsert failed"),
      );
      return;
    }
    respond(true, result, undefined);
  },
  "clawdbot.marketing.compile": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const plan = payload.plan;
    if (!plan || typeof plan !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plan payload is required"));
      return;
    }
    const result = await service.compilePlan(plan, resolveActor(client));
    respond(true, result, undefined);
  },
  "clawdbot.marketing.execute": async ({ params, respond, client }) => {
    const payload = parseObject(params);
    const plan = payload.plan;
    if (!plan || typeof plan !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plan payload is required"));
      return;
    }
    const result = await service.executeMarketingPlan(plan, resolveActor(client));
    if (!result.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, result.errors?.join("; ") || "marketing run failed"),
      );
      return;
    }
    respond(true, result, undefined);
  },
  "clawdbot.drift.status": async ({ respond }) => {
    const snapshot = await service.getDashboardSnapshot();
    respond(true, { drift: snapshot.drift, syncHealth: snapshot.syncHealth }, undefined);
  },
  "clawdbot.backfill": async ({ respond, client }) => {
    const result = await service.backfillMetadata(resolveActor(client));
    respond(true, result, undefined);
  },
  "clawdbot.readiness.report": async ({ respond }) => {
    const result = await service.getReadinessReport();
    respond(true, result, undefined);
  },
};
