import { normalizeCronJobCreate, normalizeCronJobPatch } from "../../cron/normalize.js";
import { readCronRunLogEntries, resolveCronRunLogPath } from "../../cron/run-log.js";
import type { CronJobCreate, CronJobPatch } from "../../cron/types.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateCronAddParams,
  validateCronListParams,
  validateCronRemoveParams,
  validateCronRunParams,
  validateCronRunsParams,
  validateCronStatusParams,
  validateCronUpdateParams,
  validateWakeParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function normalizeActorAgentId(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const raw = (params as { actorAgentId?: unknown }).actorAgentId;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return normalizeAgentId(trimmed);
}

async function ensureActorJobVisible(params: {
  context: Parameters<GatewayRequestHandlers["cron.list"]>[0]["context"];
  actorAgentId?: string;
  jobId: string;
}) {
  if (!params.actorAgentId) return true;
  const jobs = await params.context.cron.list({ includeDisabled: true });
  return jobs.some(
    (job) =>
      job.id === params.jobId &&
      typeof job.agentId === "string" &&
      normalizeAgentId(job.agentId) === params.actorAgentId,
  );
}

export const cronHandlers: GatewayRequestHandlers = {
  wake: ({ params, respond, context }) => {
    if (!validateWakeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid wake params: ${formatValidationErrors(validateWakeParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      mode: "now" | "next-heartbeat";
      text: string;
    };
    const result = context.cron.wake({ mode: p.mode, text: p.text });
    respond(true, result, undefined);
  },
  "cron.list": async ({ params, respond, context }) => {
    if (!validateCronListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.list params: ${formatValidationErrors(validateCronListParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { includeDisabled?: boolean; actorAgentId?: string };
    const actorAgentId = normalizeActorAgentId(p);
    const jobs = await context.cron.list({
      includeDisabled: p.includeDisabled,
    });
    const filtered = actorAgentId
      ? jobs.filter(
          (job) =>
            typeof job.agentId === "string" && normalizeAgentId(job.agentId) === actorAgentId,
        )
      : jobs;
    respond(true, { jobs: filtered }, undefined);
  },
  "cron.status": async ({ params, respond, context }) => {
    if (!validateCronStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.status params: ${formatValidationErrors(validateCronStatusParams.errors)}`,
        ),
      );
      return;
    }
    const status = await context.cron.status();
    respond(true, status, undefined);
  },
  "cron.add": async ({ params, respond, context }) => {
    const normalized = normalizeCronJobCreate(params) ?? params;
    const actorAgentId = normalizeActorAgentId(normalized);
    if (actorAgentId && normalized && typeof normalized === "object") {
      const record = normalized as Record<string, unknown>;
      const agentIdRaw = record.agentId;
      if (agentIdRaw === null || agentIdRaw === undefined) {
        record.agentId = actorAgentId;
      } else if (typeof agentIdRaw === "string") {
        const normalizedAgent = normalizeAgentId(agentIdRaw);
        if (normalizedAgent !== actorAgentId) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "cron agentId is not visible to this actor"),
          );
          return;
        }
        record.agentId = actorAgentId;
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron agentId"));
        return;
      }
    }
    if (!validateCronAddParams(normalized)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.add params: ${formatValidationErrors(validateCronAddParams.errors)}`,
        ),
      );
      return;
    }
    const job = await context.cron.add(normalized as unknown as CronJobCreate);
    respond(true, job, undefined);
  },
  "cron.update": async ({ params, respond, context }) => {
    const normalizedPatch = normalizeCronJobPatch((params as { patch?: unknown } | null)?.patch);
    const candidate =
      normalizedPatch && typeof params === "object" && params !== null
        ? { ...(params as Record<string, unknown>), patch: normalizedPatch }
        : params;
    if (!validateCronUpdateParams(candidate)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.update params: ${formatValidationErrors(validateCronUpdateParams.errors)}`,
        ),
      );
      return;
    }
    const p = candidate as {
      id?: string;
      jobId?: string;
      patch: Record<string, unknown>;
      actorAgentId?: string;
    };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.update params: missing id"),
      );
      return;
    }
    const actorAgentId = normalizeActorAgentId(p);
    if (actorAgentId && !(await ensureActorJobVisible({ context, actorAgentId, jobId }))) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "cron job not visible to this actor"),
      );
      return;
    }
    const job = await context.cron.update(jobId, p.patch as unknown as CronJobPatch);
    respond(true, job, undefined);
  },
  "cron.remove": async ({ params, respond, context }) => {
    if (!validateCronRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.remove params: ${formatValidationErrors(validateCronRemoveParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { id?: string; jobId?: string; actorAgentId?: string };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.remove params: missing id"),
      );
      return;
    }
    const actorAgentId = normalizeActorAgentId(p);
    if (actorAgentId && !(await ensureActorJobVisible({ context, actorAgentId, jobId }))) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "cron job not visible to this actor"),
      );
      return;
    }
    const result = await context.cron.remove(jobId);
    respond(true, result, undefined);
  },
  "cron.run": async ({ params, respond, context }) => {
    if (!validateCronRunParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.run params: ${formatValidationErrors(validateCronRunParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      id?: string;
      jobId?: string;
      mode?: "due" | "force";
      actorAgentId?: string;
    };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.run params: missing id"),
      );
      return;
    }
    const actorAgentId = normalizeActorAgentId(p);
    if (actorAgentId && !(await ensureActorJobVisible({ context, actorAgentId, jobId }))) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "cron job not visible to this actor"),
      );
      return;
    }
    const result = await context.cron.run(jobId, p.mode);
    respond(true, result, undefined);
  },
  "cron.runs": async ({ params, respond, context }) => {
    if (!validateCronRunsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.runs params: ${formatValidationErrors(validateCronRunsParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { id?: string; jobId?: string; limit?: number; actorAgentId?: string };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.runs params: missing id"),
      );
      return;
    }
    const actorAgentId = normalizeActorAgentId(p);
    if (actorAgentId && !(await ensureActorJobVisible({ context, actorAgentId, jobId }))) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "cron job not visible to this actor"),
      );
      return;
    }
    const logPath = resolveCronRunLogPath({
      storePath: context.cronStorePath,
      jobId,
    });
    const entries = await readCronRunLogEntries(logPath, {
      limit: p.limit,
      jobId,
    });
    respond(true, { entries }, undefined);
  },
};
