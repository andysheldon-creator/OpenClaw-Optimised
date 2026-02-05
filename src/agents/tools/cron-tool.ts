import { Type } from "@sinclair/typebox";
import { loadConfig } from "../../config/config.js";
import { normalizeCronJobCreate, normalizeCronJobPatch } from "../../cron/normalize.js";
import { truncateUtf16Safe } from "../../utils.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./sessions-helpers.js";

// NOTE: Job fields are now flattened to top-level for better LLM compatibility.
// The nested `job` property is kept for backward compatibility.
// When both are provided, top-level fields take precedence.

const CRON_ACTIONS = ["status", "list", "add", "update", "remove", "run", "runs", "wake"] as const;

const CRON_WAKE_MODES = ["now", "next-heartbeat"] as const;

const SESSION_TARGETS = ["main", "isolated"] as const;

const SCHEDULE_KINDS = ["at", "every", "cron"] as const;

const PAYLOAD_KINDS = ["systemEvent", "agentTurn"] as const;

const DELIVERY_MODES = ["none", "announce"] as const;

const REMINDER_CONTEXT_MESSAGES_MAX = 10;
const REMINDER_CONTEXT_PER_MESSAGE_MAX = 220;
const REMINDER_CONTEXT_TOTAL_MAX = 700;
const REMINDER_CONTEXT_MARKER = "\n\nRecent context:\n";

// Flattened schema with explicit job fields for better LLM guidance.
// Nested `job` kept for backward compatibility; top-level fields take precedence.
const CronToolSchema = Type.Object({
  action: stringEnum(CRON_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  includeDisabled: Type.Optional(Type.Boolean()),

  // === Job fields (for action: "add") - flattened for LLM compatibility ===
  // These can also be nested inside `job` for backward compatibility.
  name: Type.Optional(Type.String({ description: "Job name (required for add)" })),
  schedule: Type.Optional(
    Type.Object(
      {
        kind: optionalStringEnum(SCHEDULE_KINDS),
        at: Type.Optional(Type.String({ description: "ISO-8601 timestamp (for kind: at)" })),
        everyMs: Type.Optional(Type.Number({ description: "Interval in ms (for kind: every)" })),
        anchorMs: Type.Optional(
          Type.Number({ description: "Anchor time in ms (for kind: every)" }),
        ),
        expr: Type.Optional(Type.String({ description: "Cron expression (for kind: cron)" })),
        tz: Type.Optional(Type.String({ description: "Timezone (for kind: cron)" })),
      },
      { additionalProperties: true },
    ),
  ),
  sessionTarget: optionalStringEnum(SESSION_TARGETS),
  payload: Type.Optional(
    Type.Object(
      {
        kind: optionalStringEnum(PAYLOAD_KINDS),
        text: Type.Optional(Type.String({ description: "Event text (for kind: systemEvent)" })),
        message: Type.Optional(Type.String({ description: "Agent prompt (for kind: agentTurn)" })),
        model: Type.Optional(Type.String()),
        thinking: Type.Optional(Type.String()),
        timeoutSeconds: Type.Optional(Type.Number()),
      },
      { additionalProperties: true },
    ),
  ),
  delivery: Type.Optional(
    Type.Object(
      {
        mode: optionalStringEnum(DELIVERY_MODES),
        channel: Type.Optional(Type.String()),
        to: Type.Optional(Type.String()),
        bestEffort: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: true },
    ),
  ),
  enabled: Type.Optional(Type.Boolean()),
  deleteAfterRun: Type.Optional(Type.Boolean()),
  wakeMode: optionalStringEnum(CRON_WAKE_MODES),
  agentId: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),

  // === Backward compatibility: nested job object ===
  // If provided, fields are merged with top-level (top-level takes precedence)
  job: Type.Optional(Type.Object({}, { additionalProperties: true })),

  // === Other action params ===
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

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

function stripExistingContext(text: string) {
  const index = text.indexOf(REMINDER_CONTEXT_MARKER);
  if (index === -1) {
    return text;
  }
  return text.slice(0, index).trim();
}

function truncateText(input: string, maxLen: number) {
  if (input.length <= maxLen) {
    return input;
  }
  const truncated = truncateUtf16Safe(input, Math.max(0, maxLen - 3)).trimEnd();
  return `${truncated}...`;
}

function normalizeContextText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function extractMessageText(message: ChatMessage): { role: string; text: string } | null {
  const role = typeof message.role === "string" ? message.role : "";
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const content = message.content;
  if (typeof content === "string") {
    const normalized = normalizeContextText(content);
    return normalized ? { role, text: normalized } : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if ((block as { type?: unknown }).type !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) {
      chunks.push(text);
    }
  }
  const joined = normalizeContextText(chunks.join(" "));
  return joined ? { role, text: joined } : null;
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
  if (maxMessages <= 0) {
    return [];
  }
  const sessionKey = params.agentSessionKey?.trim();
  if (!sessionKey) {
    return [];
  }
  const cfg = loadConfig();
  const { mainKey, alias } = resolveMainSessionAlias(cfg);
  const resolvedKey = resolveInternalSessionKey({ key: sessionKey, alias, mainKey });
  try {
    const res = await callGatewayTool<{ messages: Array<unknown> }>(
      "chat.history",
      params.gatewayOpts,
      {
        sessionKey: resolvedKey,
        limit: maxMessages,
      },
    );
    const messages = Array.isArray(res?.messages) ? res.messages : [];
    const parsed = messages
      .map((msg) => extractMessageText(msg as ChatMessage))
      .filter((msg): msg is { role: string; text: string } => Boolean(msg));
    const recent = parsed.slice(-maxMessages);
    if (recent.length === 0) {
      return [];
    }
    const lines: string[] = [];
    let total = 0;
    for (const entry of recent) {
      const label = entry.role === "user" ? "User" : "Assistant";
      const text = truncateText(entry.text, REMINDER_CONTEXT_PER_MESSAGE_MAX);
      const line = `- ${label}: ${text}`;
      total += line.length;
      if (total > REMINDER_CONTEXT_TOTAL_MAX) {
        break;
      }
      lines.push(line);
    }
    return lines;
  } catch {
    return [];
  }
}

/**
 * Assembles a job object from params, merging top-level fields with nested `job`.
 * Top-level fields take precedence over nested job fields.
 */
function assembleJobFromParams(params: Record<string, unknown>): Record<string, unknown> | null {
  const nestedJob =
    params.job && typeof params.job === "object" && !Array.isArray(params.job)
      ? (params.job as Record<string, unknown>)
      : {};

  // Job field names to extract from top-level
  const jobFieldNames = [
    "name",
    "schedule",
    "sessionTarget",
    "payload",
    "delivery",
    "enabled",
    "deleteAfterRun",
    "wakeMode",
    "agentId",
    "description",
  ];

  // Start with nested job, then overlay top-level fields
  const assembled: Record<string, unknown> = { ...nestedJob };

  for (const field of jobFieldNames) {
    if (field in params && params[field] !== undefined) {
      assembled[field] = params[field];
    }
  }

  // Return null if no job fields were provided at all
  const hasAnyField = jobFieldNames.some((f) => f in assembled && assembled[f] !== undefined);
  if (!hasAnyField && Object.keys(nestedJob).length === 0) {
    return null;
  }

  return assembled;
}

export function createCronTool(opts?: CronToolOptions): AnyAgentTool {
  return {
    label: "Cron",
    name: "cron",
    description: `Manage Gateway cron jobs (status/list/add/update/remove/run/runs) and send wake events.

ACTIONS:
- status: Check cron scheduler status
- list: List jobs (use includeDisabled:true to include disabled)
- add: Create job (pass job fields at top level OR nested in job object)
- update: Modify job (requires jobId + patch object)
- remove: Delete job (requires jobId)
- run: Trigger job immediately (requires jobId)
- runs: Get job run history (requires jobId)
- wake: Send wake event (requires text, optional mode)

ADD ACTION - REQUIRED FIELDS (pass at top level, not nested):
- name: string - Job name
- schedule: object - When to run (see schedule types below)
- sessionTarget: "main" | "isolated" - Where to run
- payload: object - What to execute (see payload types below)

SCHEDULE TYPES (schedule.kind):
- "at": One-shot at absolute time
  { "kind": "at", "at": "<ISO-8601 timestamp>" }
- "every": Recurring interval
  { "kind": "every", "everyMs": <interval-ms>, "anchorMs": <optional-start-ms> }
- "cron": Cron expression
  { "kind": "cron", "expr": "<cron-expression>", "tz": "<optional-timezone>" }

ISO timestamps without an explicit timezone are treated as UTC.

PAYLOAD TYPES (payload.kind):
- "systemEvent": Injects text as system event into session
  { "kind": "systemEvent", "text": "<message>" }
- "agentTurn": Runs agent with message (isolated sessions only)
  { "kind": "agentTurn", "message": "<prompt>", "model": "<optional>", "thinking": "<optional>", "timeoutSeconds": <optional> }

DELIVERY (isolated-only, optional):
  { "mode": "none" | "announce", "channel": "<optional>", "to": "<optional>", "bestEffort": <optional-bool> }
  - Default for isolated agentTurn jobs: "announce"

CRITICAL CONSTRAINTS:
- sessionTarget="main" REQUIRES payload.kind="systemEvent"
- sessionTarget="isolated" REQUIRES payload.kind="agentTurn"
Default: prefer isolated agentTurn jobs unless the user explicitly wants a main-session system event.

EXAMPLE (add a cron job):
{
  "action": "add",
  "name": "daily-reminder",
  "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "America/New_York" },
  "sessionTarget": "main",
  "payload": { "kind": "systemEvent", "text": "Good morning! Time to review tasks." }
}

WAKE MODES (for wake action):
- "next-heartbeat" (default): Wake on next heartbeat
- "now": Wake immediately

Use jobId as the canonical identifier; id is accepted for compatibility. Use contextMessages (0-10) to add previous messages as context to the job text.`,
    parameters: CronToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : 60_000,
      };

      switch (action) {
        case "status":
          return jsonResult(await callGatewayTool("cron.status", gatewayOpts, {}));
        case "list":
          return jsonResult(
            await callGatewayTool("cron.list", gatewayOpts, {
              includeDisabled: Boolean(params.includeDisabled),
            }),
          );
        case "add": {
          // Assemble job from top-level fields and/or nested job object
          const assembledJob = assembleJobFromParams(params);
          if (!assembledJob) {
            throw new Error(
              "job required: pass name, schedule, sessionTarget, and payload at top level or in job object",
            );
          }
          const job = normalizeCronJobCreate(assembledJob) ?? assembledJob;
          if (job && typeof job === "object" && !("agentId" in job)) {
            const cfg = loadConfig();
            const agentId = opts?.agentSessionKey
              ? resolveSessionAgentId({ sessionKey: opts.agentSessionKey, config: cfg })
              : undefined;
            if (agentId) {
              (job as { agentId?: string }).agentId = agentId;
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
          return jsonResult(await callGatewayTool("cron.add", gatewayOpts, job));
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
          return jsonResult(
            await callGatewayTool("cron.update", gatewayOpts, {
              id,
              patch,
            }),
          );
        }
        case "remove": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          return jsonResult(await callGatewayTool("cron.remove", gatewayOpts, { id }));
        }
        case "run": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          return jsonResult(await callGatewayTool("cron.run", gatewayOpts, { id }));
        }
        case "runs": {
          const id = readStringParam(params, "jobId") ?? readStringParam(params, "id");
          if (!id) {
            throw new Error("jobId required (id accepted for backward compatibility)");
          }
          return jsonResult(await callGatewayTool("cron.runs", gatewayOpts, { id }));
        }
        case "wake": {
          const text = readStringParam(params, "text", { required: true });
          const mode =
            params.mode === "now" || params.mode === "next-heartbeat"
              ? params.mode
              : "next-heartbeat";
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
