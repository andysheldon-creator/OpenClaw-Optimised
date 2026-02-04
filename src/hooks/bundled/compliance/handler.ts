/**
 * Compliance Hook Handler
 *
 * Automatically logs agent activity for compliance tracking.
 * Supports multiple destinations: webhook, file, CLI, or telemetry.
 *
 * This is a plugin-style hook that registers for multiple events:
 * - before_agent_start: Log agent session start
 * - agent_end: Log agent session completion
 * - message_received: Log incoming human messages (optional)
 *
 * Additional events (cron, spawn, dm) are logged from their respective
 * tool implementations via the exported `complianceSystem`.
 */

import type { OpenClawConfig } from "../../../config/config.js";
import type { HookHandler } from "../../hooks.js";
import type { ComplianceConfig } from "./types.js";
import { resolveHookConfig } from "../../config.js";
import { createComplianceSystem } from "./emitter.js";

// Global compliance system instance (initialized on first use)
let complianceSystemInstance: ReturnType<typeof createComplianceSystem> | null = null;
let lastConfigHash: string | null = null;

/**
 * Get or create the compliance system
 */
function getComplianceSystem(
  cfg: OpenClawConfig | undefined,
): ReturnType<typeof createComplianceSystem> | null {
  const hookConfig = resolveHookConfig(cfg, "compliance") as ComplianceConfig | undefined;

  // Not configured or disabled
  if (!hookConfig?.enabled || !hookConfig?.destination) {
    return null;
  }

  // Check if config changed
  const configHash = JSON.stringify(hookConfig);
  if (complianceSystemInstance && configHash === lastConfigHash) {
    return complianceSystemInstance;
  }

  // Create new instance
  complianceSystemInstance = createComplianceSystem(hookConfig, {
    warn: (msg) => console.warn(msg),
    debug: hookConfig.debug ? (msg) => console.log(msg) : undefined,
  });
  lastConfigHash = configHash;

  return complianceSystemInstance;
}

/**
 * Extract trigger source from session key
 */
function extractTrigger(sessionKey?: string, messageProvider?: string): string {
  if (messageProvider && messageProvider !== "unknown") {
    return messageProvider;
  }
  if (!sessionKey) {
    return "direct";
  }

  if (sessionKey.includes(":cron:")) {
    return "cron";
  }
  if (sessionKey.includes(":subagent:")) {
    return "spawn";
  }
  if (sessionKey.includes(":hook:")) {
    return "webhook";
  }

  const channelMatch = sessionKey.match(/channel:(\w+)/);
  if (channelMatch) {
    return channelMatch[1];
  }

  return "direct";
}

/**
 * Main hook handler - delegates to appropriate event handler
 */
const complianceHandler: HookHandler = async (event) => {
  const context = event.context || {};
  const cfg = context.cfg as OpenClawConfig | undefined;
  const system = getComplianceSystem(cfg);

  if (!system) {
    return;
  }

  // Handle different event types
  switch (event.type) {
    case "agent": {
      if (event.action === "bootstrap" || event.action === "start") {
        // before_agent_start
        const agentCtx = context.agentContext as
          | {
              agentId?: string;
              sessionKey?: string;
              messageProvider?: string;
            }
          | undefined;

        system.log("agent_start", {
          agentId: agentCtx?.agentId,
          sessionKey: agentCtx?.sessionKey || event.sessionKey,
          trigger: extractTrigger(agentCtx?.sessionKey, agentCtx?.messageProvider),
        });
      } else if (event.action === "end") {
        // agent_end
        const agentCtx = context.agentContext as
          | {
              agentId?: string;
              sessionKey?: string;
            }
          | undefined;
        const endEvent = context.endEvent as
          | {
              success?: boolean;
              error?: string;
              durationMs?: number;
            }
          | undefined;

        system.log("agent_end", {
          agentId: agentCtx?.agentId,
          sessionKey: agentCtx?.sessionKey || event.sessionKey,
          trigger: extractTrigger(agentCtx?.sessionKey),
          metadata: {
            success: endEvent?.success ?? true,
            ...(endEvent?.error ? { error: endEvent.error } : {}),
            ...(endEvent?.durationMs ? { durationMs: endEvent.durationMs } : {}),
          },
        });
      }
      break;
    }

    case "message": {
      if (event.action === "received") {
        // message_received
        const msgCtx = context.messageContext as
          | {
              channelId?: string;
              from?: string;
              content?: string;
            }
          | undefined;

        system.log("message_received", {
          sessionKey: event.sessionKey,
          metadata: {
            channel: msgCtx?.channelId || "unknown",
            from: msgCtx?.from || "unknown",
            content: msgCtx?.content, // Will be redacted by emitter if configured
          },
        });
      }
      break;
    }
  }
};

export default complianceHandler;

// =============================================================================
// Exported API for tool integrations
// =============================================================================

/**
 * Log a cron job start event
 */
export function logCronStart(
  cfg: OpenClawConfig | undefined,
  agentId: string,
  jobName: string,
  sessionKey?: string,
): void {
  const system = getComplianceSystem(cfg);
  system?.log("cron_start", {
    agentId,
    sessionKey,
    trigger: "cron",
    metadata: { jobName },
  });
}

/**
 * Log a cron job completion event
 */
export function logCronComplete(
  cfg: OpenClawConfig | undefined,
  agentId: string,
  jobName: string,
  sessionKey?: string,
  status?: string,
): void {
  const system = getComplianceSystem(cfg);
  system?.log("cron_complete", {
    agentId,
    sessionKey,
    trigger: "cron",
    metadata: { jobName, status: status || "ok" },
  });
}

/**
 * Log a spawn task start event
 */
export function logSpawnStart(
  cfg: OpenClawConfig | undefined,
  agentId: string,
  task: string,
  sessionKey?: string,
  targetAgentId?: string,
): void {
  const system = getComplianceSystem(cfg);
  system?.log("spawn_start", {
    agentId,
    sessionKey,
    trigger: "spawn",
    metadata: { task, targetAgentId },
  });
}

/**
 * Log a spawn task completion event
 */
export function logSpawnComplete(
  cfg: OpenClawConfig | undefined,
  agentId: string,
  task: string,
  sessionKey?: string,
  status?: string,
): void {
  const system = getComplianceSystem(cfg);
  system?.log("spawn_complete", {
    agentId,
    sessionKey,
    trigger: "spawn",
    metadata: { task, status: status || "ok" },
  });
}

/**
 * Log a DM sent event
 */
export function logDmSent(
  cfg: OpenClawConfig | undefined,
  fromAgentId: string,
  toAgentId: string,
  preview: string,
  fromSessionKey?: string,
  status?: "ok" | "error",
  error?: string,
): void {
  const system = getComplianceSystem(cfg);
  system?.log("dm_sent", {
    agentId: fromAgentId,
    sessionKey: fromSessionKey,
    trigger: "dm",
    metadata: { to: toAgentId, preview, status: status || "ok", ...(error ? { error } : {}) },
  });
}
