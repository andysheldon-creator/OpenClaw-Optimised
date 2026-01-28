import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "../config/paths.js";

export type SecurityEventType =
  | "blocked_sender"
  | "blocked_network"
  | "allowed_network"
  | "sensitive_file_access"
  | "hardening_init"
  | "hardening_error";

export type SecurityEvent = {
  timestamp: string;
  type: SecurityEventType;
  detail: Record<string, unknown>;
};

export type HardeningLoggerOptions = {
  /** Override the log file path. Defaults to ~/.clawdbot/security-audit.log */
  logFile?: string;
  /** Also emit events to this callback (for tests). */
  onEvent?: (event: SecurityEvent) => void;
};

let logStream: fs.WriteStream | null = null;
let logFilePath: string | null = null;
let eventCallback: ((event: SecurityEvent) => void) | null = null;

/**
 * Resolve the default security log path.
 */
function defaultLogPath(): string {
  const stateDir = resolveStateDir();
  return path.join(stateDir, "security-audit.log");
}

/**
 * Initialize the hardening audit logger.
 * Call once at gateway startup, before any other security module.
 */
export function initHardeningLogger(opts?: HardeningLoggerOptions): void {
  if (logStream) return; // already initialized
  logFilePath = opts?.logFile ?? defaultLogPath();
  eventCallback = opts?.onEvent ?? null;
  try {
    const dir = path.dirname(logFilePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    logStream = fs.createWriteStream(logFilePath, { flags: "a", mode: 0o600 });
    // Silently handle write stream errors to avoid crashing the gateway.
    logStream.on("error", () => {});
  } catch {
    // If we can't open the log file, continue without file logging.
    // The onEvent callback (if set) will still work.
    logStream = null;
  }
}

/**
 * Write a structured security event to the audit log.
 */
export function logSecurityEvent(type: SecurityEventType, detail: Record<string, unknown>): void {
  const event: SecurityEvent = {
    timestamp: new Date().toISOString(),
    type,
    detail,
  };
  if (logStream) {
    logStream.write(JSON.stringify(event) + "\n");
  }
  if (eventCallback) {
    eventCallback(event);
  }
}

/**
 * Close the audit log stream. Call on gateway shutdown.
 */
export function closeHardeningLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
  logFilePath = null;
  eventCallback = null;
}

/**
 * Get the current log file path (for status/diagnostics).
 */
export function getHardeningLogPath(): string | null {
  return logFilePath;
}

/** Reset internal state (test-only). */
export function __resetHardeningLoggerForTest(): void {
  closeHardeningLogger();
}
