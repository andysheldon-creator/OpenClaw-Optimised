/**
 * Telemetry Destination
 *
 * Integrates with the existing telemetry plugin to emit compliance events.
 * Events are written to the telemetry JSONL file and can be synced via
 * the telemetry plugin's sync mechanism.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ComplianceEmitter, ComplianceEvent } from "../types.js";

// Default telemetry file location (matches telemetry plugin)
const DEFAULT_TELEMETRY_PATH = path.join(os.homedir(), ".openclaw", "logs", "telemetry.jsonl");

export function createTelemetryEmitter(logger?: {
  warn: (msg: string) => void;
}): ComplianceEmitter {
  let initialized = false;

  async function ensureDir(): Promise<void> {
    if (initialized) {
      return;
    }
    try {
      await fs.mkdir(path.dirname(DEFAULT_TELEMETRY_PATH), { recursive: true });
      initialized = true;
    } catch (err) {
      logger?.warn(`[compliance:telemetry] Failed to create directory: ${String(err)}`);
    }
  }

  async function emit(event: ComplianceEvent): Promise<void> {
    await ensureDir();
    try {
      // Format as telemetry event
      const telemetryEvent = {
        type: "compliance",
        kind: event.kind,
        timestamp: event.timestamp,
        agentId: event.agentId,
        sessionKey: event.sessionKey,
        trigger: event.trigger,
        message: event.message,
        metadata: event.metadata,
      };

      const line = JSON.stringify(telemetryEvent) + "\n";
      await fs.appendFile(DEFAULT_TELEMETRY_PATH, line, "utf-8");
    } catch (err) {
      logger?.warn(`[compliance:telemetry] Failed to write event: ${String(err)}`);
    }
  }

  return { emit };
}
