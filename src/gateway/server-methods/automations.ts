/**
 * Gateway server handlers for automations.
 *
 * Implements all automations-related gateway methods:
 * - automations.list
 * - automations.create
 * - automations.update
 * - automations.delete
 * - automations.run
 * - automations.cancel
 * - automations.history
 * - automations.artifact.download
 */

import type { Automation, AutomationCreate } from "../../automations/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAutomationsArtifactDownloadParams,
  validateAutomationsCancelParams,
  validateAutomationsCreateParams,
  validateAutomationsDeleteParams,
  validateAutomationsHistoryParams,
  validateAutomationsListParams,
  validateAutomationsRunParams,
  validateAutomationsUpdateParams,
} from "../protocol/index.js";

/**
 * Convert internal Automation type to gateway protocol Automation type.
 * Maps property names between internal and external representations.
 */
function toGatewayAutomation(automation: Automation): {
  id: string;
  name: string;
  description?: string;
  type: "smart-sync-fork" | "custom-script" | "webhook";
  status: "active" | "suspended" | "error";
  enabled: boolean;
  schedule: {
    type: "at" | "every" | "cron";
    atMs?: number;
    everyMs?: number;
    anchorMs?: number;
    expr?: string;
    tz?: string;
  };
  nextRunAt?: number;
  lastRun?: {
    at: number;
    status: "success" | "failed" | "running";
    durationMs?: number;
    summary?: string;
  };
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
} {
  const { state, ...rest } = automation;
  const scheduleType = automation.schedule.kind;
  return {
    ...rest,
    schedule: {
      type: scheduleType,
      ...("atMs" in automation.schedule ? { atMs: automation.schedule.atMs } : {}),
      ...("everyMs" in automation.schedule
        ? {
            everyMs: automation.schedule.everyMs,
            ...(automation.schedule.anchorMs ? { anchorMs: automation.schedule.anchorMs } : {}),
          }
        : {}),
      ...("expr" in automation.schedule
        ? {
            expr: automation.schedule.expr,
            ...(automation.schedule.tz ? { tz: automation.schedule.tz } : {}),
          }
        : {}),
    },
    nextRunAt: state.nextRunAtMs,
    ...(state.lastRunAtMs && (state.lastStatus === "success" || state.lastStatus === "error")
      ? {
          lastRun: {
            at: state.lastRunAtMs,
            status: state.lastStatus === "error" ? "failed" : "success",
            durationMs: state.lastDurationMs,
            summary: state.lastError,
          },
        }
      : {}),
    config: automation.config as unknown as Record<string, unknown>,
    createdAt: automation.createdAtMs,
    updatedAt: automation.updatedAtMs,
  };
}

/**
 * Convert internal AutomationRun to gateway protocol AutomationRunRecord.
 */
function toGatewayRunRecord(run: import("../../automations/index.js").AutomationRun): {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: number;
  completedAt?: number;
  status: "success" | "failed" | "running" | "cancelled";
  summary?: string;
  error?: string;
  durationMs?: number;
  timeline: Array<{
    id: string;
    title: string;
    status: "completed" | "current" | "pending";
    timestamp?: string;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    type: string;
    size: string;
    url: string;
  }>;
  conflicts: Array<{
    type: string;
    description: string;
    resolution: string;
  }>;
  aiModel?: {
    name: string;
    version: string;
    tokensUsed: number;
    cost: string;
  };
} {
  return {
    id: run.id,
    automationId: run.automationId,
    automationName: run.automationName,
    startedAt: run.startedAt.getTime(),
    completedAt: run.completedAt?.getTime(),
    status: (run.status === "blocked" ? "failed" : run.status) as
      | "success"
      | "failed"
      | "running"
      | "cancelled",
    summary: run.error,
    error: run.error,
    durationMs:
      run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : undefined,
    timeline: run.milestones,
    artifacts: run.artifacts,
    conflicts: run.conflicts,
    aiModel: run.aiModel,
  };
}

/**
 * Convert gateway schedule format to internal format.
 */
function toInternalSchedule(schedule: {
  type: "at" | "every" | "cron";
  atMs?: number;
  everyMs?: number;
  anchorMs?: number;
  expr?: string;
  tz?: string;
}): import("../../automations/index.js").AutomationSchedule {
  if (schedule.type === "at") {
    return { kind: "at", atMs: schedule.atMs ?? 0 };
  }
  if (schedule.type === "every") {
    return {
      kind: "every",
      everyMs: schedule.everyMs ?? 0,
      ...(schedule.anchorMs !== undefined ? { anchorMs: schedule.anchorMs } : {}),
    };
  }
  return {
    kind: "cron",
    expr: schedule.expr ?? "",
    ...(schedule.tz ? { tz: schedule.tz } : {}),
  };
}

/**
 * Convert gateway AutomationCreate to internal format.
 */
function toInternalAutomationCreate(params: unknown): AutomationCreate {
  const p = params as {
    name: string;
    description?: string;
    type: "smart-sync-fork" | "custom-script" | "webhook";
    schedule: {
      type: "at" | "every" | "cron";
      atMs?: number;
      everyMs?: number;
      anchorMs?: number;
      expr?: string;
      tz?: string;
    };
    enabled?: boolean;
    config: Record<string, unknown>;
  };

  return {
    name: p.name,
    description: p.description,
    type: p.type,
    schedule: toInternalSchedule(p.schedule),
    enabled: p.enabled ?? true,
    config: p.config as unknown as AutomationCreate["config"],
    status: "active",
    tags: [],
    state: {},
  };
}

/**
 * Automations gateway handlers.
 */
export const automationsHandlers: GatewayRequestHandlers = {
  "automations.list": async ({ params, respond, context }) => {
    if (!validateAutomationsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.list params: ${formatValidationErrors(validateAutomationsListParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { includeDisabled?: boolean };
    const automations = await context.automations.list({
      includeDisabled: p.includeDisabled,
    });

    respond(
      true,
      {
        automations: automations.map(toGatewayAutomation),
      },
      undefined,
    );
  },

  "automations.create": async ({ params, respond, context }) => {
    if (!validateAutomationsCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.create params: ${formatValidationErrors(validateAutomationsCreateParams.errors)}`,
        ),
      );
      return;
    }

    try {
      const input = toInternalAutomationCreate(params);
      const automation = await context.automations.create(input);
      respond(true, toGatewayAutomation(automation), undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "automations.update": async ({ params, respond, context }) => {
    if (!validateAutomationsUpdateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.update params: ${formatValidationErrors(validateAutomationsUpdateParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string; enabled?: boolean };
    const automation = await context.automations.update(p.id, {
      enabled: p.enabled,
    });

    respond(true, toGatewayAutomation(automation), undefined);
  },

  "automations.delete": async ({ params, respond, context }) => {
    if (!validateAutomationsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.delete params: ${formatValidationErrors(validateAutomationsDeleteParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string };
    const result = await context.automations.delete(p.id);
    respond(true, result, undefined);
  },

  "automations.run": async ({ params, respond, context }) => {
    if (!validateAutomationsRunParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.run params: ${formatValidationErrors(validateAutomationsRunParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string };
    const result = await context.automations.run(p.id, { mode: "force" });

    if (result.ok && "runId" in result) {
      respond(true, { runId: result.runId }, undefined);
    } else if (result.ok && "ran" in result && result.ran === false) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Cannot run automation: ${result.reason}`),
      );
    } else {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Cannot run automation"));
    }
  },

  "automations.cancel": async ({ params, respond, context }) => {
    if (!validateAutomationsCancelParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.cancel params: ${formatValidationErrors(validateAutomationsCancelParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string };
    const result = await context.automations.cancel(p.id);
    respond(true, result, undefined);
  },

  "automations.history": async ({ params, respond, context }) => {
    if (!validateAutomationsHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.history params: ${formatValidationErrors(validateAutomationsHistoryParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string; limit?: number };
    const result = await context.automations.getHistory(p.id, {
      limit: p.limit,
    });

    respond(
      true,
      {
        records: result.runs.map(toGatewayRunRecord),
      },
      undefined,
    );
  },

  "automations.artifact.download": async ({ params, respond, context }) => {
    if (!validateAutomationsArtifactDownloadParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid automations.artifact.download params: ${formatValidationErrors(validateAutomationsArtifactDownloadParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { artifactId: string };

    // Get artifact from storage
    const artifact = await context.artifactStorage.getArtifact(p.artifactId);
    if (!artifact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Artifact not found"));
      return;
    }

    // For now, return the file URL
    // In production, this would return a signed download URL or stream endpoint
    respond(
      true,
      {
        url: `file://${artifact.filePath}`,
        name: artifact.name,
        type: artifact.type,
      },
      undefined,
    );
  },
};
