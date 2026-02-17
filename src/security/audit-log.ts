/**
 * Security Audit Logging (FB-016)
 *
 * Provides a structured, append-only audit log for security-relevant events.
 * Events are written to a dedicated JSONL file, separate from the general
 * application logs.
 *
 * Captures:
 * - Tool invocations (with risk level and gate decision)
 * - Permission checks (allowed/denied)
 * - Injection detection events
 * - Credential access events
 * - Skill integrity checks
 * - Authentication events
 *
 * The audit log is designed to be:
 * - Tamper-evident (HMAC chain linking entries)
 * - Machine-parseable (JSONL format)
 * - Rotatable (daily files, auto-prune after retention period)
 *
 * Addresses MITRE ATLAS audit/logging requirements.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defaultRuntime } from "../runtime.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditCategory =
  | "tool_invocation"
  | "permission_check"
  | "injection_detected"
  | "credential_access"
  | "skill_integrity"
  | "authentication"
  | "config_change"
  | "gate_decision"
  | "session";

export type AuditSeverity = "info" | "warn" | "alert" | "critical";

export type AuditEntry = {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Monotonic sequence number within the current session. */
  seq: number;
  /** Event category. */
  category: AuditCategory;
  /** Severity level. */
  severity: AuditSeverity;
  /** Human-readable description. */
  message: string;
  /** Structured event data. */
  data?: Record<string, unknown>;
  /** HMAC of previous entry for chain integrity. */
  prevHash?: string;
};

export type AuditConfig = {
  /** Whether audit logging is enabled. Defaults to true. */
  enabled: boolean;
  /** Directory for audit logs. Defaults to ~/.clawdis/audit/. */
  logDir: string;
  /** Retention period in days. Defaults to 30. */
  retentionDays: number;
  /** Whether to enable HMAC chaining. Defaults to true. */
  hmacChaining: boolean;
};

// ─── State ───────────────────────────────────────────────────────────────────

const DEFAULT_LOG_DIR = path.join(os.homedir(), ".clawdis", "audit");

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  logDir: DEFAULT_LOG_DIR,
  retentionDays: 30,
  hmacChaining: true,
};

let currentSeq = 0;
let lastEntryHash = "";
let activeConfig: AuditConfig = DEFAULT_CONFIG;
let initialised = false;

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Initialise the audit logger. Creates the log directory if needed.
 */
export function initAuditLog(config?: Partial<AuditConfig>): void {
  activeConfig = { ...DEFAULT_CONFIG, ...config };

  if (!activeConfig.enabled) return;

  try {
    fs.mkdirSync(activeConfig.logDir, { recursive: true });
    initialised = true;

    // Prune old logs
    pruneOldAuditLogs();

    defaultRuntime.log?.(
      `[audit-log] initialised: dir=${activeConfig.logDir}`,
    );
  } catch (err) {
    defaultRuntime.log?.(
      `[audit-log] failed to initialise: ${String(err)}`,
    );
  }
}

/**
 * Compute the HMAC of an entry for chain linking.
 */
function computeEntryHash(entry: AuditEntry): string {
  const payload = JSON.stringify({
    timestamp: entry.timestamp,
    seq: entry.seq,
    category: entry.category,
    message: entry.message,
    prevHash: entry.prevHash,
  });
  return crypto
    .createHmac("sha256", "clawdis-audit-chain")
    .update(payload)
    .digest("hex")
    .slice(0, 16); // Short hash for readability
}

/**
 * Get the current audit log file path (dated).
 */
function currentLogPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(activeConfig.logDir, `audit-${today}.jsonl`);
}

/**
 * Write an audit entry. This is the core logging function.
 */
export function writeAuditEntry(
  category: AuditCategory,
  severity: AuditSeverity,
  message: string,
  data?: Record<string, unknown>,
): AuditEntry | null {
  if (!activeConfig.enabled) return null;

  // Lazy init if not already done
  if (!initialised) {
    try {
      fs.mkdirSync(activeConfig.logDir, { recursive: true });
      initialised = true;
    } catch {
      return null;
    }
  }

  currentSeq++;

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    seq: currentSeq,
    category,
    severity,
    message,
    data,
  };

  if (activeConfig.hmacChaining && lastEntryHash) {
    entry.prevHash = lastEntryHash;
  }

  // Compute hash for next entry
  lastEntryHash = computeEntryHash(entry);

  // Append to file
  try {
    const line = JSON.stringify(entry);
    fs.appendFileSync(currentLogPath(), `${line}\n`, { encoding: "utf8" });
  } catch (err) {
    defaultRuntime.log?.(
      `[audit-log] write failed: ${String(err)}`,
    );
  }

  return entry;
}

// ─── Convenience Loggers ─────────────────────────────────────────────────────

/**
 * Log a tool invocation event.
 */
export function auditToolInvocation(params: {
  toolName: string;
  riskLevel: string;
  decision: string;
  source?: string;
  reason?: string;
  runId?: string;
}): AuditEntry | null {
  const severity: AuditSeverity =
    params.decision === "block"
      ? "alert"
      : params.riskLevel === "high"
        ? "warn"
        : "info";

  return writeAuditEntry(
    "tool_invocation",
    severity,
    `${params.decision.toUpperCase()}: ${params.toolName} (risk=${params.riskLevel})`,
    {
      toolName: params.toolName,
      riskLevel: params.riskLevel,
      decision: params.decision,
      source: params.source,
      reason: params.reason,
      runId: params.runId,
    },
  );
}

/**
 * Log a permission check event.
 */
export function auditPermissionCheck(params: {
  toolName: string;
  source: string;
  allowed: boolean;
  permission: string;
}): AuditEntry | null {
  const severity: AuditSeverity = params.allowed ? "info" : "warn";

  return writeAuditEntry(
    "permission_check",
    severity,
    `${params.allowed ? "ALLOWED" : "DENIED"}: ${params.toolName} from ${params.source}`,
    params,
  );
}

/**
 * Log a prompt injection detection event.
 */
export function auditInjectionDetected(params: {
  input: string;
  riskScore: number;
  categories: string[];
  action: string;
}): AuditEntry | null {
  const severity: AuditSeverity =
    params.riskScore >= 70 ? "critical" : params.riskScore >= 40 ? "alert" : "warn";

  return writeAuditEntry(
    "injection_detected",
    severity,
    `Injection detected: score=${params.riskScore} categories=[${params.categories.join(",")}]`,
    {
      inputPreview: params.input.slice(0, 200),
      riskScore: params.riskScore,
      categories: params.categories,
      action: params.action,
    },
  );
}

/**
 * Log a credential access event.
 */
export function auditCredentialAccess(params: {
  action: "read" | "write" | "encrypt" | "decrypt" | "mask";
  field: string;
  source?: string;
}): AuditEntry | null {
  return writeAuditEntry("credential_access", "info", `Credential ${params.action}: ${params.field}`, params);
}

/**
 * Log a skill integrity check event.
 */
export function auditSkillIntegrity(params: {
  skillPath: string;
  status: "passed" | "failed" | "new" | "modified";
  trustTier?: string;
}): AuditEntry | null {
  const severity: AuditSeverity =
    params.status === "failed" ? "alert" : "info";

  return writeAuditEntry(
    "skill_integrity",
    severity,
    `Skill ${params.status}: ${params.skillPath}`,
    params,
  );
}

/**
 * Log a gate decision event.
 */
export function auditGateDecision(params: {
  toolName: string;
  decision: string;
  riskLevel: string;
  description: string;
  reason?: string;
}): AuditEntry | null {
  const severity: AuditSeverity =
    params.decision === "block" ? "alert" : params.decision === "flag" ? "warn" : "info";

  return writeAuditEntry("gate_decision", severity, `Gate ${params.decision}: ${params.description}`, params);
}

/**
 * Log an authentication event.
 */
export function auditAuthentication(params: {
  action: "login" | "logout" | "token_refresh" | "auth_failure";
  provider: string;
  success: boolean;
  reason?: string;
}): AuditEntry | null {
  const severity: AuditSeverity = params.success ? "info" : "alert";
  return writeAuditEntry(
    "authentication",
    severity,
    `Auth ${params.action}: ${params.provider} ${params.success ? "OK" : "FAILED"}`,
    params,
  );
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

/**
 * Prune audit log files older than the retention period.
 */
export function pruneOldAuditLogs(): number {
  if (!activeConfig.enabled) return 0;

  const cutoffMs = activeConfig.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - cutoffMs;
  let pruned = 0;

  try {
    const entries = fs.readdirSync(activeConfig.logDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith("audit-") || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const fullPath = path.join(activeConfig.logDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { force: true });
          pruned++;
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // ignore dir read errors
  }

  if (pruned > 0) {
    defaultRuntime.log?.(
      `[audit-log] pruned ${pruned} old audit log(s)`,
    );
  }

  return pruned;
}

/**
 * Read recent audit entries from today's log.
 */
export function readRecentAuditEntries(limit = 50): AuditEntry[] {
  if (!activeConfig.enabled) return [];

  try {
    const logPath = currentLogPath();
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries: AuditEntry[] = [];

    const startIdx = Math.max(0, lines.length - limit);
    for (let i = startIdx; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]) as AuditEntry);
      } catch {
        // skip malformed lines
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Verify the HMAC chain integrity of recent entries.
 */
export function verifyAuditChain(entries: AuditEntry[]): {
  valid: boolean;
  brokenAt?: number;
} {
  if (entries.length <= 1) return { valid: true };

  for (let i = 1; i < entries.length; i++) {
    const expected = computeEntryHash(entries[i - 1]);
    if (entries[i].prevHash && entries[i].prevHash !== expected) {
      return { valid: false, brokenAt: i };
    }
  }

  return { valid: true };
}

/**
 * Get the audit configuration (for display/diagnostics).
 */
export function getAuditConfig(): AuditConfig {
  return { ...activeConfig };
}

/**
 * Reset audit state (for testing).
 */
export function resetAuditState(): void {
  currentSeq = 0;
  lastEntryHash = "";
  initialised = false;
  activeConfig = DEFAULT_CONFIG;
}
