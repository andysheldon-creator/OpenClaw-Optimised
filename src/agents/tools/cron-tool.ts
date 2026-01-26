import { Type } from "@sinclair/typebox";
import { normalizeCronJobCreate, normalizeCronJobPatch } from "../../cron/normalize.js";
import { loadConfig } from "../../config/config.js";
import { loadSessionStore, resolveStorePath } from "../../config/sessions.js";
import { normalizeElevatedLevel } from "../../auto-reply/thinking.js";
import { resolveSandboxConfigForAgent } from "../sandbox/config.js";
import { resolveSandboxRuntimeStatus } from "../sandbox/runtime-status.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { truncateUtf16Safe } from "../../utils.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./sessions-helpers.js";

// NOTE: We use Type.Object({}, { additionalProperties: true }) for job/patch
// instead of CronAddParamsSchema/CronJobPatchSchema because the gateway schemas
// contain nested unions. Tool schemas need to stay provider-friendly, so we
// accept "any object" here and validate at runtime.

const CRON_ACTIONS = ["status", "list", "add", "update", "remove", "run", "runs", "wake"] as const;

const CRON_WAKE_MODES = ["now", "next-heartbeat"] as const;

const REMINDER_CONTEXT_MESSAGES_MAX = 10;
const REMINDER_CONTEXT_PER_MESSAGE_MAX = 220;
const REMINDER_CONTEXT_TOTAL_MAX = 700;
const REMINDER_CONTEXT_MARKER = "\n\nRecent context:\n";

// Flattened schema: runtime validates per-action requirements.
const CronToolSchema = Type.Object({
  action: stringEnum(CRON_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  includeDisabled: Type.Optional(Type.Boolean()),
  job: Type.Optional(Type.Object({}, { additionalProperties: true })),
  jobId: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
  patch: Type.Optional(Type.Object({}, { additionalProperties: true })),
  text: Type.Optional(Type.String()),
  mode: optionalStringEnum(CRON_WAKE_MODES),
  contextMessages: Type.Optional(
    Type.Number({ minimum: 0, maximum: REMINDER_CONTEXT_MESSAGES_MAX }),
  ),
});

type CronToolOptions = {
  agentSessionKey?: string;
};

type CronSandboxAccess = {
  sandboxed: boolean;
  restricted: boolean;
  agentId?: string;
  sessionKey?: string;
  policy: {
    visibility: "agent" | "all";
    escape: "off" | "elevated" | "elevated-full";
    allowMainSessionJobs: boolean;
    delivery: "off" | "last-only" | "explicit";
  };
};

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

function stripExistingContext(text: string) {
  const index = text.indexOf(REMINDER_CONTEXT_MARKER);
  if (index === -1) return text;
  return text.slice(0, index).trim();
}

function truncateText(input: string, maxLen: number) {
  if (input.length <= maxLen) return input;
  const truncated = truncateUtf16Safe(input, Math.max(0, maxLen - 3)).trimEnd();
  return `${truncated}...`;
}

function normalizeContextText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function extractMessageText(message: ChatMessage): { role: string; text: string } | null {
  const role = typeof message.role === "string" ? message.role : "";
  if (role !== "user" && role !== "assistant") return null;
  const content = message.content;
  if (typeof content === "string") {
    const normalized = normalizeContextText(content);
    return normalized ? { role, text: normalized } : null;
  }
  if (!Array.isArray(content)) return null;
  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if ((block as { type?: unknown }).type !== "text") continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) {
      chunks.push(text);
    }
  }
  const joined = normalizeContextText(chunks.join(" "));
  return joined ? { role, text: joined } : null;
}

function resolveCronSandboxAccess(params: {
  cfg: ReturnType<typeof loadConfig>;
  sessionKey?: string;
}): CronSandboxAccess {
  const rawSessionKey = params.sessionKey?.trim();
  if (!rawSessionKey) {
    return {
      sandboxed: false,
      restricted: false,
      agentId: undefined,
      sessionKey: undefined,
      policy: {
        visibility: "all",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "explicit",
      },
    };
  }

  const runtime = resolveSandboxRuntimeStatus({ cfg: params.cfg, sessionKey: rawSessionKey });
  const sandboxCfg = resolveSandboxConfigForAgent(params.cfg, runtime.agentId);
  const policy = sandboxCfg.cron;
  const normalizedAgentId = normalizeAgentId(runtime.agentId);

  const storePath = resolveStorePath(params.cfg.session?.store, {
    agentId: normalizedAgentId,
  });
  const store = loadSessionStore(storePath);
  const entry = store[rawSessionKey];
  const elevatedLevel = normalizeElevatedLevel(entry?.elevatedLevel) ?? "off";
  const elevatedOn = elevatedLevel !== "off";
  const elevatedFull = elevatedLevel === "full";

  const escapeAllowed =
    policy.escape === "elevated"
      ? elevatedOn
      : policy.escape === "elevated-full"
        ? elevatedFull
        : false;

  return {
    sandboxed: runtime.sandboxed,
    restricted: runtime.sandboxed && !escapeAllowed,
    agentId: normalizedAgentId,
    sessionKey: rawSessionKey,
    policy,
  };
}

function jobAgentId(job: Record<string, unknown>) {
  const raw = (job as { agentId?: unknown }).agentId;
  if (typeof raw !== "string") return undefined;
  return normalizeAgentId(raw);
}

function jobSessionTarget(job: Record<string, unknown>) {
  const raw = (job as { sessionTarget?: unknown }).sessionTarget;
  return typeof raw === "string" ? raw : undefined;
}

function jobPayload(job: Record<string, unknown>) {
  const raw = (job as { payload?: unknown }).payload;
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
}

async function resolveJobRecord(params: {
  jobId: string;
  gatewayOpts: GatewayCallOptions;
  scopedAgentId?: string;
}) {
  const res = await callGatewayTool("cron.list", params.gatewayOpts, {
    includeDisabled: true,
    ...(params.scopedAgentId ? { actorAgentId: params.scopedAgentId } : {}),
  });
  const jobs = (res as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return undefined;
  const match = jobs.find(
    (job) => job && typeof job === "object" && (job as { id?: unknown }).id === params.jobId,
  );
  if (!match || typeof match !== "object") return undefined;
  return match as Record<string, unknown>;
}

async function assertMainSessionJobAllowed(params: {
  access: CronSandboxAccess;
  jobId: string;
  gatewayOpts: GatewayCallOptions;
  scopedAgentId?: string;
  jobRecord?: Record<string, unknown>;
}) {
  if (!params.access.restricted || params.access.policy.allowMainSessionJobs) return;
  const sessionTarget =
    jobSessionTarget(params.jobRecord ?? {}) ??
    jobSessionTarget(
      (await resolveJobRecord({
        jobId: params.jobId,
        gatewayOpts: params.gatewayOpts,
        scopedAgentId: params.scopedAgentId,
      })) ?? {},
    );
  if (sessionTarget === "main") {
    throw new Error("sandboxed cron jobs cannot target main sessions");
  }
}

function assertDeliveryPolicy(
  policy: CronSandboxAccess["policy"],
  payload?: Record<string, unknown> | null,
) {
  if (!payload) return;
  if (payload.kind !== "agentTurn") return;
  const deliver = typeof payload.deliver === "boolean" ? payload.deliver : undefined;
  const channel = typeof payload.channel === "string" ? payload.channel : undefined;
  const to = typeof payload.to === "string" ? payload.to : undefined;

  if (policy.delivery === "explicit") return;

  if (policy.delivery === "off") {
    if (deliver || channel || to) {
      throw new Error("cron delivery is disabled for sandboxed sessions");
    }
    return;
  }

  // last-only
  if (to) {
    throw new Error("cron delivery target is restricted to last route");
  }
  if (channel && channel !== "last") {
    throw new Error("cron delivery channel is restricted to last route");
  }
  if (deliver && channel && channel !== "last") {
    throw new Error("cron delivery channel is restricted to last route");
  }
}

async function buildReminderContextLines(params: {
  agentSessionKey?: string;
  gatewayOpts: GatewayCallOptions;
  contextMessages: number;
}) {
  const maxMessages = Math.min(
    REMINDER_CONTEXT_MESSAGES_MAX,
    Math.max(0, Math.floor(params.contextMessages)),
  );
  if (maxMessages <= 0) return [];
  const sessionKey = params.agentSessionKey?.trim();
  if (!sessionKey) return [];
  const cfg = loadConfig();
  const { mainKey, alias } = resolveMainSessionAlias(cfg);
  const resolvedKey = resolveInternalSessionKey({ key: sessionKey, alias, mainKey });
  try {
    const res = (await callGatewayTool("chat.history", params.gatewayOpts, {
      sessionKey: resolvedKey,
      limit: maxMessages,
    })) as { messages?: unknown[] };
    const messages = Array.isArray(res?.messages) ? res.messages : [];
    const parsed = messages
      .map((msg) => extractMessageText(msg as ChatMessage))
      .filter((msg): msg is { role: string; text: string } => Boolean(msg));
    const recent = parsed.slice(-maxMessages);
    if (recent.length === 0) return [];
    const lines: string[] = [];
    let total = 0;
    for (const entry of recent) {
      const label = entry.role === "user" ? "User" : "Assistant";
      const text = truncateText(entry.text, REMINDER_CONTEXT_PER_MESSAGE_MAX);
      const line = `- ${label}: ${text}`;
      total += line.length;
      if (total > REMINDER_CONTEXT_TOTAL_MAX) break;
      lines.push(line);
    }
    return lines;
  } catch {
    return [];
  }
}

export function createCronTool(opts?: CronToolOptions): AnyAgentTool {
  return {
    label: "Cron",
    name: "cron",
    description: `Manage Gateway cron jobs (status/list/add/update/remove/run/runs) and send wake events.

ACTIONS:
- status: Check cron scheduler status
- list: List jobs (use includeDisabled:true to include disabled)
- add: Create job (requires job object, see schema below)
- update: Modify job (requires jobId + patch object)
- remove: Delete job (requires jobId)
- run: Trigger job immediately (requires jobId)
- runs: Get job run history (requires jobId)
- wake: Send wake event (requires text, optional mode)

JOB SCHEMA (for add action):
{
  "name": "string (optional)",
  "schedule": { ... },      // Required: when to run
  "payload": { ... },       // Required: what to execute
  "sessionTarget": "main" | "isolated",  // Required
  "enabled": true | false   // Optional, default true
}

SCHEDULE TYPES (schedule.kind):
- "at": One-shot at absolute time
  { "kind": "at", "atMs": <unix-ms-timestamp> }
- "every": Recurring interval
  { "kind": "every", "everyMs": <interval-ms>, "anchorMs": <optional-start-ms> }
- "cron": Cron expression
  { "kind": "cron", "expr": "<cron-expression>", "tz": "<optional-timezone>" }

PAYLOAD TYPES (payload.kind):
- "systemEvent": Injects text as system event into session
  { "kind": "systemEvent", "text": "<message>" }
- "agentTurn": Runs agent with message (isolated sessions only)
  { "kind": "agentTurn", "message": "<prompt>", "model": "<optional>", "thinking": "<optional>", "timeoutSeconds": <optional>, "deliver": <optional-bool>, "channel": "<optional>", "to": "<optional>", "bestEffortDeliver": <optional-bool> }

CRITICAL CONSTRAINTS:
- sessionTarget="main" REQUIRES payload.kind="systemEvent"
- sessionTarget="isolated" REQUIRES payload.kind="agentTurn"

WAKE MODES (for wake action):
- "next-heartbeat" (default): Wake on next heartbeat
- "now": Wake immediately

Use jobId as the canonical identifier; id is accepted for compatibility. Use contextMessages (0-10) to add previous messages as context to the job text.`,
    parameters: CronToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const cfg = loadConfig();
      const access = resolveCronSandboxAccess({
        cfg,
        sessionKey: opts?.agentSessionKey,
      });
      const scopedAgentId =
        access.restricted && access.policy.visibility === "agent" ? access.agentId : undefined;
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };

      switch (action) {
        case "status":
          return jsonResult(await callGatewayTool("cron.status", gatewayOpts, {}));
        case "list":
          return jsonResult(
            await callGatewayTool("cron.list", gatewayOpts, {
              includeDisabled: Boolean(params.includeDisabled),
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        case "add": {
          if (!params.job || typeof params.job !== "object") {
            throw new Error("job required");
          }
          const job = normalizeCronJobCreate(params.job) ?? params.job;
          if (job && typeof job === "object") {
            const jobRecord = job as Record<string, unknown>;
            const sessionTarget = jobSessionTarget(jobRecord);
            const payload = jobPayload(jobRecord);
            if (access.restricted && !access.policy.allowMainSessionJobs) {
              if (sessionTarget === "main") {
                throw new Error("sandboxed cron jobs cannot target main sessions");
              }
            }
            if (access.restricted) {
              assertDeliveryPolicy(access.policy, payload);
            }
            const enforceAgentVisibility =
              access.restricted && access.policy.visibility === "agent";
            if (!("agentId" in jobRecord)) {
              const agentId = enforceAgentVisibility ? access.agentId : undefined;
              if (agentId) {
                jobRecord.agentId = agentId;
              }
            } else if (enforceAgentVisibility && access.agentId) {
              const requested = jobAgentId(jobRecord);
              if (requested && requested !== access.agentId) {
                throw new Error("cron agentId must match the sandboxed agent");
              }
              jobRecord.agentId = access.agentId;
            }
          }
          const contextMessages =
            typeof params.contextMessages === "number" && Number.isFinite(params.contextMessages)
              ? params.contextMessages
              : 0;
          if (
            job &&
            typeof job === "object" &&
            "payload" in job &&
            (job as { payload?: { kind?: string; text?: string } }).payload?.kind === "systemEvent"
          ) {
            const payload = (job as { payload: { kind: string; text: string } }).payload;
            if (typeof payload.text === "string" && payload.text.trim()) {
              const contextLines = await buildReminderContextLines({
                agentSessionKey: opts?.agentSessionKey,
                gatewayOpts,
                contextMessages,
              });
              if (contextLines.length > 0) {
                const baseText = stripExistingContext(payload.text);
                payload.text = `${baseText}${REMINDER_CONTEXT_MARKER}${contextLines.join("\n")}`;
              }
            }
          }
          return jsonResult(
            await callGatewayTool("cron.add", gatewayOpts, {
              ...(job as Record<string, unknown>),
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        }
        case "update": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          if (!params.patch || typeof params.patch !== "object") {
            throw new Error("patch required");
          }
          const patch = normalizeCronJobPatch(params.patch) ?? params.patch;
          if (access.restricted && patch && typeof patch === "object") {
            const patchRecord = patch as Record<string, unknown>;
            if (!access.policy.allowMainSessionJobs) {
              const sessionTarget = jobSessionTarget(patchRecord);
              if (sessionTarget === "main") {
                throw new Error("sandboxed cron jobs cannot target main sessions");
              }
              if (!sessionTarget) {
                await assertMainSessionJobAllowed({
                  access,
                  jobId: id,
                  gatewayOpts,
                  scopedAgentId,
                });
              }
            }
            assertDeliveryPolicy(access.policy, jobPayload(patchRecord));
            const enforceAgentVisibility = access.policy.visibility === "agent" && access.agentId;
            if (enforceAgentVisibility && "agentId" in patchRecord) {
              const requested = jobAgentId(patchRecord);
              if (requested && requested !== access.agentId) {
                throw new Error("cron agentId must match the sandboxed agent");
              }
              patchRecord.agentId = access.agentId;
            }
          }
          return jsonResult(
            await callGatewayTool("cron.update", gatewayOpts, {
              id,
              patch,
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        }
        case "remove": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          await assertMainSessionJobAllowed({
            access,
            jobId: id,
            gatewayOpts,
            scopedAgentId,
          });
          return jsonResult(
            await callGatewayTool("cron.remove", gatewayOpts, {
              id,
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        }
        case "run": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          if (access.restricted) {
            const needsMainSessionCheck = !access.policy.allowMainSessionJobs;
            const needsDeliveryCheck = access.policy.delivery !== "explicit";
            if (needsMainSessionCheck || needsDeliveryCheck) {
              const jobRecord = await resolveJobRecord({
                jobId: id,
                gatewayOpts,
                scopedAgentId,
              });
              if (needsMainSessionCheck) {
                await assertMainSessionJobAllowed({
                  access,
                  jobId: id,
                  gatewayOpts,
                  scopedAgentId,
                  jobRecord,
                });
              }
              if (needsDeliveryCheck) {
                assertDeliveryPolicy(access.policy, jobPayload(jobRecord ?? {}));
              }
            }
          }
          return jsonResult(
            await callGatewayTool("cron.run", gatewayOpts, {
              id,
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        }
        case "runs": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          await assertMainSessionJobAllowed({
            access,
            jobId: id,
            gatewayOpts,
            scopedAgentId,
          });
          return jsonResult(
            await callGatewayTool("cron.runs", gatewayOpts, {
              id,
              ...(scopedAgentId ? { actorAgentId: scopedAgentId } : {}),
            }),
          );
        }
        case "wake": {
          const text = readStringParam(params, "text", { required: true });
          const mode =
            params.mode === "now" || params.mode === "next-heartbeat"
              ? params.mode
              : "next-heartbeat";
          if (access.restricted && !access.policy.allowMainSessionJobs) {
            throw new Error("sandboxed cron cannot send wake events to main sessions");
          }
          return jsonResult(
            await callGatewayTool("wake", gatewayOpts, { mode, text }, { expectFinal: false }),
          );
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
