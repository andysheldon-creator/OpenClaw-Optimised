import { Type } from "@sinclair/typebox";

import type { MoltbotConfig } from "../../config/config.js";
import { loadConfig, resolveConfigSnapshotHash } from "../../config/io.js";
import { loadSessionStore, resolveStorePath } from "../../config/sessions.js";
import { loadCombinedSessionStoreForGateway } from "../../gateway/session-utils.js";
import { listSessionsFromStore } from "../../gateway/session-utils.js";
import { scheduleGatewaySigusr1Restart } from "../../infra/restart.js";
import {
  formatDoctorNonInteractiveHint,
  type RestartSentinelPayload,
  writeRestartSentinel,
} from "../../infra/restart-sentinel.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { extractConfigPaths, validateConfigPaths } from "./config-path-validator.js";
import { callGatewayTool } from "./gateway.js";

/**
 * Send a proactive notification to Discord before a restart.
 * Uses the session's delivery context to post directly to the channel,
 * bypassing the agent session (which will die during restart).
 * Falls back to the status webhook if direct channel posting isn't possible.
 */
async function notifyDiscordBeforeRestart(
  notice: string,
  deliveryContext?: { channel?: string; to?: string; accountId?: string },
): Promise<void> {
  // Try the status webhook first (most reliable — doesn't need the gateway running)
  const webhookUrl = process.env.MOLTBOT_STATUS_WEBHOOK;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: notice }),
      });
      return;
    } catch {
      // Fall through — best effort
    }
  }

  // If no webhook, log to console (gateway log captures it)
  console.info(`[restart-notice] ${notice}`);
}

function resolveBaseHashFromSnapshot(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const hashValue = (snapshot as { hash?: unknown }).hash;
  const rawValue = (snapshot as { raw?: unknown }).raw;
  const hash = resolveConfigSnapshotHash({
    hash: typeof hashValue === "string" ? hashValue : undefined,
    raw: typeof rawValue === "string" ? rawValue : undefined,
  });
  return hash ?? undefined;
}

const GATEWAY_ACTIONS = [
  "restart",
  "config.get",
  "config.schema",
  "config.apply",
  "config.patch",
  "update.run",
] as const;

// NOTE: Using a flattened object schema instead of Type.Union([Type.Object(...), ...])
// because Claude API on Vertex AI rejects nested anyOf schemas as invalid JSON Schema.
// The discriminator (action) determines which properties are relevant; runtime validates.
const GatewayToolSchema = Type.Object({
  action: stringEnum(GATEWAY_ACTIONS),
  // restart
  delayMs: Type.Optional(Type.Number()),
  reason: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
  // config.get, config.schema, config.apply, update.run
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  // config.apply, config.patch
  raw: Type.Optional(Type.String()),
  baseHash: Type.Optional(Type.String()),
  // config.apply, config.patch, update.run
  sessionKey: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  restartDelayMs: Type.Optional(Type.Number()),
});
// NOTE: We intentionally avoid top-level `allOf`/`anyOf`/`oneOf` conditionals here:
// - OpenAI rejects tool schemas that include these keywords at the *top-level*.
// - Claude/Vertex has other JSON Schema quirks.
// Conditional requirements (like `raw` for config.apply) are enforced at runtime.

/**
 * Pre-flight check: scan for active sessions that would be interrupted by a restart.
 * Returns a blocked result if other sessions are active and force is not set.
 * Returns undefined if clear to proceed.
 */
function checkActiveSessions(
  currentSessionKey: string | undefined,
  force: boolean,
): ReturnType<typeof jsonResult> | undefined {
  if (force) return undefined;
  try {
    const cfg = loadConfig();
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
    const activeList = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: { activeMinutes: 5, limit: 20 },
    });
    const otherActiveSessions = activeList.sessions.filter((s) => s.key !== currentSessionKey);
    if (otherActiveSessions.length > 0) {
      const sessionList = otherActiveSessions
        .slice(0, 10)
        .map((s) => `- ${s.key} (${s.displayName || s.label || "unknown"})`)
        .join("\n");
      const moreCount = otherActiveSessions.length > 10 ? otherActiveSessions.length - 10 : 0;
      const moreNote = moreCount > 0 ? `\n... and ${moreCount} more` : "";
      return jsonResult({
        status: "blocked",
        reason: "active_sessions",
        message: `Found ${otherActiveSessions.length} active session(s) in the last 5 minutes. Restart would interrupt them.`,
        activeSessions: sessionList + moreNote,
        hint: "Pass force: true to restart anyway, or wait for sessions to complete.",
      });
    }
  } catch {
    console.warn("gateway tool: failed to check active sessions, proceeding with restart");
  }
  return undefined;
}

/**
 * Notify the founder (and the triggering session) that a restart is about to happen.
 * This is a mandatory pre-restart step — agents must not go dark without warning.
 * Returns a notice object to include in the tool result.
 */
function buildRestartNotice(
  action: string,
  reason: string | undefined,
): {
  restartWarning: string;
} {
  const actionLabel =
    action === "restart"
      ? "manual restart"
      : action === "config.patch"
        ? "config patch"
        : action === "config.apply"
          ? "config apply"
          : action === "update.run"
            ? "gateway update"
            : action;
  const reasonNote = reason ? ` (${reason})` : "";
  return {
    restartWarning: `⚠️ Gateway restarting via ${actionLabel}${reasonNote}. Expect ~30-60 seconds of silence while the gateway restarts. All active sessions will be interrupted.`,
  };
}

export function createGatewayTool(opts?: {
  agentSessionKey?: string;
  config?: MoltbotConfig;
}): AnyAgentTool {
  return {
    label: "Gateway",
    name: "gateway",
    description:
      "Restart, apply config, or update the gateway in-place (SIGUSR1). Use config.patch for safe partial config updates (merges with existing). Use config.apply only when replacing entire config. Both trigger restart after writing.",
    parameters: GatewayToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      if (action === "restart") {
        if (opts?.config?.commands?.restart !== true) {
          throw new Error("Gateway restart is disabled. Set commands.restart=true to enable.");
        }

        // Pre-flight check: warn if other sessions are active
        const forceRestart = params.force === true;
        const blocked = checkActiveSessions(opts?.agentSessionKey?.trim(), forceRestart);
        if (blocked) return blocked;

        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;
        const delayMs =
          typeof params.delayMs === "number" && Number.isFinite(params.delayMs)
            ? Math.floor(params.delayMs)
            : undefined;
        const reason =
          typeof params.reason === "string" && params.reason.trim()
            ? params.reason.trim().slice(0, 200)
            : undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        // Extract channel + threadId for routing after restart
        let deliveryContext: { channel?: string; to?: string; accountId?: string } | undefined;
        let threadId: string | undefined;
        if (sessionKey) {
          const threadMarker = ":thread:";
          const threadIndex = sessionKey.lastIndexOf(threadMarker);
          const baseSessionKey = threadIndex === -1 ? sessionKey : sessionKey.slice(0, threadIndex);
          const threadIdRaw =
            threadIndex === -1 ? undefined : sessionKey.slice(threadIndex + threadMarker.length);
          threadId = threadIdRaw?.trim() || undefined;
          try {
            const cfg = loadConfig();
            const storePath = resolveStorePath(cfg.session?.store);
            const store = loadSessionStore(storePath);
            let entry = store[sessionKey];
            if (!entry?.deliveryContext && threadIndex !== -1 && baseSessionKey) {
              entry = store[baseSessionKey];
            }
            if (entry?.deliveryContext) {
              deliveryContext = {
                channel: entry.deliveryContext.channel,
                to: entry.deliveryContext.to,
                accountId: entry.deliveryContext.accountId,
              };
            }
          } catch {
            // ignore: best-effort
          }
        }
        const payload: RestartSentinelPayload = {
          kind: "restart",
          status: "ok",
          ts: Date.now(),
          sessionKey,
          deliveryContext,
          threadId,
          message: note ?? reason ?? null,
          doctorHint: formatDoctorNonInteractiveHint(),
          stats: {
            mode: "gateway.restart",
            reason,
          },
        };
        try {
          await writeRestartSentinel(payload);
        } catch {
          // ignore: sentinel is best-effort
        }
        // Restart notice — mandatory notification before going dark
        const notice = buildRestartNotice("restart", reason ?? note);
        console.info(`gateway tool: ${notice.restartWarning}`);

        // Proactive Discord notification — fires before the process dies
        await notifyDiscordBeforeRestart(notice.restartWarning, deliveryContext);

        const scheduled = scheduleGatewaySigusr1Restart({
          delayMs,
          reason,
        });
        return jsonResult({ ...scheduled, ...notice });
      }

      const gatewayUrl =
        typeof params.gatewayUrl === "string" && params.gatewayUrl.trim()
          ? params.gatewayUrl.trim()
          : undefined;
      const gatewayToken =
        typeof params.gatewayToken === "string" && params.gatewayToken.trim()
          ? params.gatewayToken.trim()
          : undefined;
      const timeoutMs =
        typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
          ? Math.max(1, Math.floor(params.timeoutMs))
          : undefined;
      const gatewayOpts = { gatewayUrl, gatewayToken, timeoutMs };

      if (action === "config.get") {
        const result = await callGatewayTool("config.get", gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }
      if (action === "config.schema") {
        const result = await callGatewayTool("config.schema", gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }
      if (action === "config.apply") {
        // Pre-flight: check active sessions before triggering restart
        const forceApply = params.force === true;
        const blocked = checkActiveSessions(opts?.agentSessionKey?.trim(), forceApply);
        if (blocked) return blocked;

        const raw = readStringParam(params, "raw", { required: true });
        let baseHash = readStringParam(params, "baseHash");
        if (!baseHash) {
          const snapshot = await callGatewayTool("config.get", gatewayOpts, {});
          baseHash = resolveBaseHashFromSnapshot(snapshot);
        }
        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;
        const reason =
          typeof params.reason === "string" && params.reason.trim()
            ? params.reason.trim().slice(0, 200)
            : undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        const restartDelayMs =
          typeof params.restartDelayMs === "number" && Number.isFinite(params.restartDelayMs)
            ? Math.floor(params.restartDelayMs)
            : undefined;

        // Restart notice — mandatory notification before going dark
        const notice = buildRestartNotice("config.apply", reason ?? note);
        console.info(`gateway tool: ${notice.restartWarning}`);
        await notifyDiscordBeforeRestart(notice.restartWarning);

        const result = await callGatewayTool("config.apply", gatewayOpts, {
          raw,
          baseHash,
          sessionKey,
          note,
          restartDelayMs,
        });
        return jsonResult({ ok: true, result, ...notice });
      }
      if (action === "config.patch") {
        // Pre-flight: check active sessions before triggering restart
        const forcePatch = params.force === true;
        const blocked = checkActiveSessions(opts?.agentSessionKey?.trim(), forcePatch);
        if (blocked) return blocked;

        const raw = readStringParam(params, "raw", { required: true });

        // Validate config paths against agent's allowed paths (governance)
        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;

        // Extract agent ID from session key to look up their restrictions
        const agentId = sessionKey ? resolveAgentIdFromSessionKey(sessionKey) : undefined;
        const agentConfig = agentId
          ? opts?.config?.agents?.list?.find((a) => a.id === agentId)
          : undefined;
        const allowedPaths = agentConfig?.allowedConfigPaths;

        // Parse the patch to extract paths being modified
        let patchObj: unknown;
        try {
          patchObj = JSON.parse(raw);
        } catch (err) {
          throw new Error(
            `Invalid JSON in config patch: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const patchPaths = extractConfigPaths(patchObj);

        // Validate paths against agent's restrictions
        const validation = validateConfigPaths(patchPaths, allowedPaths);
        if (!validation.allowed) {
          const blockedList = validation.blockedPaths
            .slice(0, 10)
            .map((p) => `  - ${p}`)
            .join("\n");
          const moreCount =
            validation.blockedPaths.length > 10 ? validation.blockedPaths.length - 10 : 0;
          const moreNote = moreCount > 0 ? `\n  ... and ${moreCount} more` : "";

          const allowedNote =
            allowedPaths && allowedPaths.length > 0
              ? `\n\nAllowed patterns for agent "${agentId}":\n${allowedPaths.map((p) => `  - ${p}`).join("\n")}`
              : "";

          return jsonResult({
            ok: false,
            error: "config_path_restricted",
            message: `Agent "${agentId}" is not authorized to modify the following config paths:\n${blockedList}${moreNote}${allowedNote}`,
            blockedPaths: validation.blockedPaths,
            allowedPatterns: allowedPaths,
            hint: "This agent's config includes allowedConfigPaths restrictions. Contact your administrator to adjust the governance policy.",
          });
        }

        let baseHash = readStringParam(params, "baseHash");
        if (!baseHash) {
          const snapshot = await callGatewayTool("config.get", gatewayOpts, {});
          baseHash = resolveBaseHashFromSnapshot(snapshot);
        }
        const reason =
          typeof params.reason === "string" && params.reason.trim()
            ? params.reason.trim().slice(0, 200)
            : undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        const restartDelayMs =
          typeof params.restartDelayMs === "number" && Number.isFinite(params.restartDelayMs)
            ? Math.floor(params.restartDelayMs)
            : undefined;

        // Restart notice — mandatory notification before going dark
        const notice = buildRestartNotice("config.patch", reason ?? note);
        console.info(`gateway tool: ${notice.restartWarning}`);
        await notifyDiscordBeforeRestart(notice.restartWarning);

        const result = await callGatewayTool("config.patch", gatewayOpts, {
          raw,
          baseHash,
          sessionKey,
          note,
          restartDelayMs,
        });
        return jsonResult({ ok: true, result, ...notice });
      }
      if (action === "update.run") {
        // Pre-flight: check active sessions before triggering restart
        const forceUpdate = params.force === true;
        const blocked = checkActiveSessions(opts?.agentSessionKey?.trim(), forceUpdate);
        if (blocked) return blocked;

        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;
        const reason =
          typeof params.reason === "string" && params.reason.trim()
            ? params.reason.trim().slice(0, 200)
            : undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        const restartDelayMs =
          typeof params.restartDelayMs === "number" && Number.isFinite(params.restartDelayMs)
            ? Math.floor(params.restartDelayMs)
            : undefined;

        // Restart notice — mandatory notification before going dark
        const notice = buildRestartNotice("update.run", reason ?? note);
        console.info(`gateway tool: ${notice.restartWarning}`);
        await notifyDiscordBeforeRestart(notice.restartWarning);

        const result = await callGatewayTool("update.run", gatewayOpts, {
          sessionKey,
          note,
          restartDelayMs,
          timeoutMs,
        });
        return jsonResult({ ok: true, result, ...notice });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
