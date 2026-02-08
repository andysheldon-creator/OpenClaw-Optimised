/**
 * SEC-002 (#76) — Audit log service
 *
 * Structured audit logging for Clawdbot. Every significant action
 * (tool invocations, approval decisions, config changes, policy evaluations)
 * is recorded as an immutable AuditEvent. The service supports querying by
 * time range, category, and severity.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Broad category of the audit event. */
export type AuditCategory =
  | "auth"
  | "policy"
  | "tool_invocation"
  | "approval"
  | "config_change"
  | "data_access"
  | "secret_access"
  | "lifecycle";

/** Severity / importance level. */
export type AuditSeverity = "info" | "warn" | "error" | "critical";

/** A single immutable audit record. */
export type AuditEvent = {
  /** Unique event identifier. */
  id: string;
  /** ISO-8601 timestamp of when the event occurred. */
  timestamp: string;
  /** The user or system actor that triggered the event. */
  actor: string;
  /** Event category for filtering and dashboarding. */
  category: AuditCategory;
  /** Severity / importance. */
  severity: AuditSeverity;
  /** Short human-readable summary of the event. */
  summary: string;
  /** Arbitrary structured metadata (tool name, run ID, etc.). */
  metadata: Record<string, unknown>;
  /** Associated run ID, if applicable. */
  runId?: string;
};

/** Criteria for querying audit events. All fields are optional (AND logic). */
export type AuditQuery = {
  /** Filter events on or after this ISO-8601 timestamp. */
  from?: string;
  /** Filter events on or before this ISO-8601 timestamp. */
  to?: string;
  /** Filter by category. */
  category?: AuditCategory;
  /** Filter by minimum severity (inclusive). */
  minSeverity?: AuditSeverity;
  /** Filter by actor identifier. */
  actor?: string;
  /** Filter by associated run ID. */
  runId?: string;
  /** Maximum number of events to return. */
  limit?: number;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/** Audit log service contract. */
export type AuditLogService = {
  /** Append an event to the log. The implementation must be append-only. */
  log(event: AuditEvent): Promise<void>;
  /** Query events matching the given criteria. */
  query(criteria: AuditQuery): Promise<AuditEvent[]>;
  /** Return the total count of events matching the criteria (without payloads). */
  count(criteria: AuditQuery): Promise<number>;
};

// ---------------------------------------------------------------------------
// Severity ordering (for minSeverity filtering)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
  critical: 3,
};

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

/**
 * Simple in-memory audit log for development and testing.
 * Replace with a durable backend (SQLite, Postgres, cloud logging) for
 * production deployments.
 */
export class InMemoryAuditLog implements AuditLogService {
  private readonly events: AuditEvent[] = [];

  async log(event: AuditEvent): Promise<void> {
    this.events.push(Object.freeze({ ...event }));
  }

  async query(criteria: AuditQuery): Promise<AuditEvent[]> {
    let results = this.events.filter((e) => matchesCriteria(e, criteria));

    // Newest first.
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (criteria.limit !== undefined && criteria.limit > 0) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  async count(criteria: AuditQuery): Promise<number> {
    return this.events.filter((e) => matchesCriteria(e, criteria)).length;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Test whether a single event matches all provided criteria. */
function matchesCriteria(event: AuditEvent, criteria: AuditQuery): boolean {
  if (criteria.from && event.timestamp < criteria.from) {
    return false;
  }
  if (criteria.to && event.timestamp > criteria.to) {
    return false;
  }
  if (criteria.category && event.category !== criteria.category) {
    return false;
  }
  if (criteria.actor && event.actor !== criteria.actor) {
    return false;
  }
  if (criteria.runId && event.runId !== criteria.runId) {
    return false;
  }

  if (criteria.minSeverity) {
    if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[criteria.minSeverity]) {
      return false;
    }
  }

  return true;
}
