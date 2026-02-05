/**
 * CLI Destination
 *
 * Executes an external CLI command to log compliance events.
 * Useful for integrating with existing compliance systems.
 *
 * SECURITY NOTE: The command path should be validated/hardcoded
 * in your configuration to prevent arbitrary code execution.
 */

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { CliDestination, ComplianceEmitter, ComplianceEvent } from "../types.js";

/**
 * Resolve path with ~ expansion
 */
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * Map event kind to activity type for MC-style logging
 */
function getActivityType(kind: ComplianceEvent["kind"]): string {
  switch (kind) {
    case "cron_start":
    case "cron_complete":
      return "gateway_cron";
    case "dm_sent":
      return "gateway_dm";
    case "spawn_start":
    case "spawn_complete":
      return "gateway_spawn";
    case "agent_start":
    case "agent_end":
      return "gateway_agent";
    case "message_received":
      return "gateway_message";
    default:
      return "status_update";
  }
}

export function createCliEmitter(
  config: CliDestination,
  logger?: { warn: (msg: string) => void },
): ComplianceEmitter {
  const command = resolvePath(config.command);
  const subcommand = config.subcommand ?? "activity";

  function emit(event: ComplianceEvent): void {
    try {
      const activityType = getActivityType(event.kind);
      const sessionKey = event.sessionKey || `agent:${event.agentId}:main`;

      // Normalize subagent sessionKeys: agent:X:subagent:Y → agent:X:main
      const normalizedKey = sessionKey.replace(/:subagent:[^:]+$/, ":main");

      // Build arguments for the CLI
      // Expected format: <command> <subcommand> <message> <sessionKey> <type>
      const args = [subcommand, event.message, normalizedKey, activityType];

      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
      });

      child.unref();
    } catch (err) {
      logger?.warn(`[compliance:cli] Failed to execute command: ${String(err)}`);
    }
  }

  return { emit };
}
