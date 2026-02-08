/**
 * BIZ-061 (#153) — Approval gate: Daily system health digest
 *
 * Defines the approval gate type for the daily system health digest workflow.
 * When the health digest is generated, this gate pauses if critical issues
 * are detected, requiring an ops lead to acknowledge before the digest is
 * distributed to the team.
 */

// ---------------------------------------------------------------------------
// Health check data types
// ---------------------------------------------------------------------------

/** Status of an individual service or component. */
export type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";

/** Severity level for health issues. */
export type IssueSeverity = "info" | "warning" | "critical";

/** A single health check result for a service/component. */
export type HealthCheckResult = {
  /** Service or component name (e.g. "api-gateway", "database-primary"). */
  serviceName: string;
  /** Current status. */
  status: ServiceStatus;
  /** Response time in milliseconds (null if unreachable). */
  responseTimeMs: number | null;
  /** Uptime percentage over the last 24 hours (0-100). */
  uptimePercent24h: number;
  /** Current CPU utilization percentage (0-100). */
  cpuPercent: number | null;
  /** Current memory utilization percentage (0-100). */
  memoryPercent: number | null;
  /** Current disk utilization percentage (0-100). */
  diskPercent: number | null;
  /** Active error count in the last 24 hours. */
  errorCount24h: number;
  /** ISO-8601 timestamp of the last successful health check. */
  lastCheckAt: string;
  /** Additional metadata (e.g. version, region, instance count). */
  metadata: Record<string, string>;
};

/** A detected issue requiring attention. */
export type HealthIssue = {
  /** Which service is affected. */
  serviceName: string;
  /** Severity level. */
  severity: IssueSeverity;
  /** Human-readable description of the issue. */
  description: string;
  /** When the issue was first detected (ISO-8601). */
  detectedAt: string;
  /** Suggested remediation action. */
  suggestedAction: string;
};

// ---------------------------------------------------------------------------
// Digest types
// ---------------------------------------------------------------------------

/** The full daily health digest. */
export type HealthDigest = {
  /** ISO-8601 timestamp of when the digest was generated. */
  generatedAt: string;
  /** Reporting period start (ISO-8601). */
  periodStart: string;
  /** Reporting period end (ISO-8601). */
  periodEnd: string;
  /** Overall system status (worst status across all services). */
  overallStatus: ServiceStatus;
  /** Total number of services checked. */
  totalServices: number;
  /** Count of healthy services. */
  healthyCount: number;
  /** Count of degraded services. */
  degradedCount: number;
  /** Count of down services. */
  downCount: number;
  /** Individual service check results. */
  services: HealthCheckResult[];
  /** Detected issues requiring attention. */
  issues: HealthIssue[];
  /** Average response time across all reachable services (ms). */
  avgResponseTimeMs: number;
  /** Average uptime across all services (%). */
  avgUptimePercent: number;
};

// ---------------------------------------------------------------------------
// Gate configuration
// ---------------------------------------------------------------------------

/** Configuration for the daily system health digest approval gate. */
export type HealthDigestGateConfig = {
  /**
   * Minimum number of critical issues that triggers the approval gate.
   * Default: 1 (any critical issue requires acknowledgment).
   */
  criticalIssueThreshold: number;
  /**
   * Minimum number of down services that triggers the gate.
   * Default: 1.
   */
  downServiceThreshold: number;
  /**
   * Average uptime percentage below which the gate triggers.
   * Default: 99.0.
   */
  uptimeAlertPercent: number;
  /**
   * Average response time above which the gate triggers (ms).
   * Default: 2000.
   */
  responseTimeAlertMs: number;
  /**
   * Role required to acknowledge the digest when the gate fires.
   * Default: "ops-lead".
   */
  approverRole: string;
  /**
   * Timeout in minutes before auto-distributing without acknowledgment.
   * Default: 240 (4 hours).
   */
  timeoutMinutes: number;
  /**
   * Distribution channels for the digest.
   * Default: ["email", "slack"].
   */
  distributionChannels: string[];
};

/** Sensible defaults for the health digest gate. */
export const DEFAULT_HEALTH_DIGEST_GATE_CONFIG: HealthDigestGateConfig = {
  criticalIssueThreshold: 1,
  downServiceThreshold: 1,
  uptimeAlertPercent: 99.0,
  responseTimeAlertMs: 2000,
  approverRole: "ops-lead",
  timeoutMinutes: 240,
  distributionChannels: ["email", "slack"],
};

// ---------------------------------------------------------------------------
// Gate snapshot
// ---------------------------------------------------------------------------

/** Data attached to the approval request for the reviewer. */
export type HealthDigestGateSnapshot = {
  /** The full health digest. */
  digest: HealthDigest;
  /** Which alert conditions were triggered. */
  alertsTriggered: string[];
  /** ISO-8601 timestamp of gate evaluation. */
  evaluatedAt: string;
};

/** Result after the ops lead acknowledges the digest. */
export type HealthDigestGateResult = {
  /** Whether the digest was acknowledged. */
  acknowledged: boolean;
  /** The user who acknowledged. */
  acknowledgedBy: string;
  /** ISO-8601 timestamp of acknowledgment. */
  acknowledgedAt: string;
  /** Optional comment (e.g. "Known issue, fix deploying at 14:00"). */
  comment?: string;
  /** Whether incident tickets were created for issues. */
  incidentsCreated: boolean;
};

// ---------------------------------------------------------------------------
// Gate logic (pure functions)
// ---------------------------------------------------------------------------

/**
 * Determine the overall system status from individual service statuses.
 * Returns the worst status across all services.
 */
export function computeOverallStatus(services: HealthCheckResult[]): ServiceStatus {
  if (services.some((s) => s.status === "down")) {
    return "down";
  }
  if (services.some((s) => s.status === "degraded")) {
    return "degraded";
  }
  if (services.some((s) => s.status === "unknown")) {
    return "unknown";
  }
  return "healthy";
}

/**
 * Evaluate whether the gate should fire based on digest contents.
 *
 * @param digest - The generated health digest.
 * @param config - Gate configuration.
 * @returns List of alert descriptions that were triggered.
 */
export function evaluateAlerts(
  digest: HealthDigest,
  config: HealthDigestGateConfig = DEFAULT_HEALTH_DIGEST_GATE_CONFIG,
): string[] {
  const alerts: string[] = [];

  // Critical issues
  const criticalCount = digest.issues.filter((i) => i.severity === "critical").length;
  if (criticalCount >= config.criticalIssueThreshold) {
    alerts.push(
      `${criticalCount} critical issue(s) detected (threshold: ${config.criticalIssueThreshold}).`,
    );
  }

  // Down services
  if (digest.downCount >= config.downServiceThreshold) {
    alerts.push(`${digest.downCount} service(s) down (threshold: ${config.downServiceThreshold}).`);
  }

  // Low uptime
  if (digest.avgUptimePercent < config.uptimeAlertPercent) {
    alerts.push(
      `Average uptime ${digest.avgUptimePercent.toFixed(2)}% is below threshold ${config.uptimeAlertPercent}%.`,
    );
  }

  // High response time
  if (digest.avgResponseTimeMs > config.responseTimeAlertMs) {
    alerts.push(
      `Average response time ${digest.avgResponseTimeMs.toFixed(0)}ms exceeds threshold ${config.responseTimeAlertMs}ms.`,
    );
  }

  return alerts;
}

/**
 * Determine whether the gate should require acknowledgment.
 *
 * @param alerts - List of triggered alerts.
 * @returns True if the gate should fire.
 */
export function requiresAcknowledgment(alerts: string[]): boolean {
  return alerts.length > 0;
}
