/**
 * Compliance Emitter Factory
 *
 * Creates the appropriate emitter based on configuration.
 */

import type {
  ComplianceConfig,
  ComplianceDestination,
  ComplianceEmitter,
  ComplianceEvent,
  ComplianceEventKind,
} from "./types.js";
import { createCliEmitter } from "./destinations/cli.js";
import { createFileEmitter } from "./destinations/file.js";
import { createTelemetryEmitter } from "./destinations/telemetry.js";
import { createWebhookEmitter } from "./destinations/webhook.js";
import { DEFAULT_COMPLIANCE_CONFIG } from "./types.js";

export type ComplianceLogger = {
  warn: (msg: string) => void;
  debug?: (msg: string) => void;
};

/**
 * Create an emitter based on destination configuration
 */
function createEmitterForDestination(
  destination: ComplianceDestination,
  logger?: ComplianceLogger,
): ComplianceEmitter {
  switch (destination.type) {
    case "webhook":
      return createWebhookEmitter(destination, logger);
    case "file":
      return createFileEmitter(destination, logger);
    case "cli":
      return createCliEmitter(destination, logger);
    case "telemetry":
      return createTelemetryEmitter(logger);
    default:
      throw new Error(`Unknown destination type: ${(destination as { type: string }).type}`);
  }
}

/**
 * Format agent name for display
 */
function formatAgentName(agentId: string | undefined): string {
  if (!agentId || agentId === "main") {
    return "Main";
  }
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Create a compliance logging system
 */
export function createComplianceSystem(
  config: ComplianceConfig,
  logger?: ComplianceLogger,
): {
  log: (
    kind: ComplianceEventKind,
    params: {
      agentId?: string;
      sessionKey?: string;
      trigger?: string;
      message?: string;
      metadata?: Record<string, unknown>;
    },
  ) => void;
  flush: () => Promise<void>;
  close: () => Promise<void>;
} {
  const mergedConfig = { ...DEFAULT_COMPLIANCE_CONFIG, ...config };
  const emitter = createEmitterForDestination(config.destination, logger);
  const enabledEvents = new Set(mergedConfig.events);

  function log(
    kind: ComplianceEventKind,
    params: {
      agentId?: string;
      sessionKey?: string;
      trigger?: string;
      message?: string;
      metadata?: Record<string, unknown>;
    },
  ): void {
    // Check if this event type is enabled
    if (!enabledEvents.has(kind)) {
      return;
    }

    const agentId = params.agentId || "main";
    const agentName = formatAgentName(agentId);
    const meta = params.metadata || {};

    // Helper to safely get string from metadata
    const metaStr = (key: string, fallback: string): string => {
      const val = meta[key];
      return typeof val === "string" ? val : fallback;
    };

    // Generate default message if not provided
    let message = params.message;
    if (!message) {
      switch (kind) {
        case "agent_start":
          message = `${agentName} - STARTING [${params.trigger || "direct"}]`;
          break;
        case "agent_end":
          message = `${agentName} - COMPLETE [${params.trigger || "direct"}]`;
          break;
        case "cron_start":
          message = `${agentName} - STARTING: ${metaStr("jobName", "cron job")}`;
          break;
        case "cron_complete":
          message = `${agentName} - COMPLETE: ${metaStr("jobName", "cron job")}`;
          break;
        case "spawn_start":
          message = `${agentName} - SPAWN: ${truncate(metaStr("task", "task"), 80)}`;
          break;
        case "spawn_complete":
          message = `${agentName} - SPAWN_COMPLETE: ${truncate(metaStr("task", "task"), 60)}`;
          break;
        case "dm_sent":
          message = `${agentName} -> ${formatAgentName(metaStr("to", ""))}: ${truncate(metaStr("preview", ""), 50)}`;
          break;
        case "message_received": {
          const channel = metaStr("channel", "unknown");
          const from = metaStr("from", "Unknown");
          if (mergedConfig.redactContent) {
            message = `[${channel}] ${from}: [redacted]`;
          } else {
            message = `[${channel}] ${from}: ${truncate(metaStr("content", ""), 50)}`;
          }
          break;
        }
      }
    }

    const event: ComplianceEvent = {
      kind,
      timestamp: new Date().toISOString(),
      agentId,
      message: message || `${agentName} - ${kind}`,
      ...(mergedConfig.includeSessionKey && params.sessionKey
        ? { sessionKey: params.sessionKey }
        : {}),
      ...(params.trigger ? { trigger: params.trigger } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };

    if (mergedConfig.debug) {
      logger?.debug?.(`[compliance] ${event.message}`);
    }

    // Fire and forget - don't await
    void emitter.emit(event);
  }

  async function flush(): Promise<void> {
    await emitter.flush?.();
  }

  async function close(): Promise<void> {
    await emitter.close?.();
  }

  return { log, flush, close };
}
