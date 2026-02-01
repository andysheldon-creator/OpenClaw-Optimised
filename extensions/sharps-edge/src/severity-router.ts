/**
 * SHARPS EDGE - Severity-Based Alert Routing
 *
 * Routes alerts to appropriate channels based on severity level.
 * INFO -> log only, WARN -> log + notify, BLOCK -> log + stop,
 * REJECT -> log + refuse + notify, CRITICAL -> log + halt + notify.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { AuditLogger } from "./audit-logger.js";
import { Severity, type SharpsEdgeConfig } from "./types.js";

export type AlertTarget = "log" | "whatsapp" | "telegram" | "discord" | "slack";

export class SeverityRouter {
  private api: OpenClawPluginApi;
  private auditLogger: AuditLogger;
  private routing: Record<string, string>;

  constructor(
    api: OpenClawPluginApi,
    auditLogger: AuditLogger,
    routing: Record<string, string>,
  ) {
    this.api = api;
    this.auditLogger = auditLogger;
    this.routing = routing;
  }

  /**
   * Route an alert based on its severity level.
   */
  async route(severity: Severity, message: string, projectId: string): Promise<void> {
    const target = this.routing[severity] ?? "log";

    // Always log
    await this.auditLogger.logAlert(projectId, severity, message);

    // Log to plugin logger
    switch (severity) {
      case Severity.INFO:
        this.api.logger.info?.(`[${projectId}] ${message}`);
        break;
      case Severity.WARN:
        this.api.logger.warn(`[${projectId}] ${message}`);
        break;
      case Severity.BLOCK:
      case Severity.REJECT:
      case Severity.CRITICAL:
        this.api.logger.error(`[${severity}] [${projectId}] ${message}`);
        break;
    }

    // Route to external channel if configured
    if (target !== "log") {
      this.api.logger.info?.(
        `sharps-edge: Would route ${severity} alert to ${target}: ${message}`,
      );
      // External channel routing is handled by OpenClaw's messaging system.
      // The agent can send messages to channels via tool calls.
      // For now, we log the intent - actual delivery uses the agent's
      // reply system or cron-based notification jobs.
    }
  }
}

/**
 * Create and return a severity router instance.
 */
export function createSeverityRouter(
  api: OpenClawPluginApi,
  cfg: SharpsEdgeConfig,
  auditLogger: AuditLogger,
): SeverityRouter {
  const routing = cfg.severityRouting ?? {
    [Severity.INFO]: "log",
    [Severity.WARN]: "log",
    [Severity.BLOCK]: "log",
    [Severity.REJECT]: "log",
    [Severity.CRITICAL]: "log",
  };

  return new SeverityRouter(api, auditLogger, routing);
}
