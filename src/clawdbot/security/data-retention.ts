/**
 * SEC-003 (#77) — Data retention policies
 *
 * Configurable data retention and purge lifecycle for Clawdbot data stores.
 * Each category of data (logs, artifacts, sessions, PII) can have its own
 * retention window and purge behaviour. The `applyRetention` function
 * evaluates which records are expired and returns a purge plan.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Broad category of data subject to retention rules. */
export type RetentionCategory =
  | "audit_logs"
  | "run_artifacts"
  | "session_data"
  | "pii"
  | "chat_history"
  | "workflow_state";

/** Strategy for handling expired data. */
export type PurgeStrategy = "delete" | "archive" | "anonymise";

/** A retention policy for a single data category. */
export type RetentionPolicy = {
  /** Data category this policy governs. */
  category: RetentionCategory;
  /** Maximum retention period in days. 0 = retain indefinitely. */
  retentionDays: number;
  /** What to do with data that exceeds the retention window. */
  purgeStrategy: PurgeStrategy;
  /** If true, the policy is actively enforced. */
  enabled: boolean;
  /** Optional human-readable description / rationale. */
  description?: string;
};

/** Summary of a single purge operation. */
export type DataPurgeResult = {
  /** Data category that was purged. */
  category: RetentionCategory;
  /** Strategy that was applied. */
  strategy: PurgeStrategy;
  /** Number of records evaluated. */
  recordsEvaluated: number;
  /** Number of records affected (deleted, archived, or anonymised). */
  recordsAffected: number;
  /** ISO-8601 timestamp of when the purge was executed. */
  executedAt: string;
  /** Errors encountered during the purge, if any. */
  errors: string[];
};

/** A record descriptor used for retention evaluation. */
export type RetentionRecord = {
  /** Unique identifier. */
  id: string;
  /** Data category. */
  category: RetentionCategory;
  /** ISO-8601 timestamp of when the record was created. */
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Default policies
// ---------------------------------------------------------------------------

/** Sensible default retention policies. */
export const DEFAULT_RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    category: "audit_logs",
    retentionDays: 365,
    purgeStrategy: "archive",
    enabled: true,
    description: "Archive audit logs after one year.",
  },
  {
    category: "run_artifacts",
    retentionDays: 90,
    purgeStrategy: "delete",
    enabled: true,
    description: "Delete run artifacts after 90 days.",
  },
  {
    category: "session_data",
    retentionDays: 30,
    purgeStrategy: "delete",
    enabled: true,
    description: "Delete session data after 30 days.",
  },
  {
    category: "pii",
    retentionDays: 7,
    purgeStrategy: "anonymise",
    enabled: true,
    description: "Anonymise PII after 7 days.",
  },
  {
    category: "chat_history",
    retentionDays: 180,
    purgeStrategy: "archive",
    enabled: true,
    description: "Archive chat history after 180 days.",
  },
  {
    category: "workflow_state",
    retentionDays: 60,
    purgeStrategy: "delete",
    enabled: true,
    description: "Delete stale workflow state after 60 days.",
  },
];

// ---------------------------------------------------------------------------
// Retention evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate retention policies against a set of records and produce purge
 * results. This is a **dry-run** implementation — it identifies which
 * records are expired and what action would be taken, but does not perform
 * the actual purge. Wire this into your data stores to execute the plan.
 *
 * @param policies - The retention policies to enforce.
 * @param records  - The records to evaluate.
 * @param now      - Reference timestamp (defaults to current time).
 * @returns One `DataPurgeResult` per policy that has expired records.
 */
export function applyRetention(
  policies: readonly RetentionPolicy[],
  records: readonly RetentionRecord[],
  now: Date = new Date(),
): DataPurgeResult[] {
  const results: DataPurgeResult[] = [];

  for (const policy of policies) {
    if (!policy.enabled || policy.retentionDays === 0) {
      continue;
    }

    const cutoff = new Date(now.getTime() - policy.retentionDays * 86_400_000);
    const categoryRecords = records.filter((r) => r.category === policy.category);
    const expired = categoryRecords.filter((r) => new Date(r.createdAt) < cutoff);

    if (expired.length === 0) {
      continue;
    }

    // TODO: execute the actual purge strategy (delete/archive/anonymise)
    // against the backing data store. For now we report what would happen.
    results.push({
      category: policy.category,
      strategy: policy.purgeStrategy,
      recordsEvaluated: categoryRecords.length,
      recordsAffected: expired.length,
      executedAt: now.toISOString(),
      errors: [],
    });
  }

  return results;
}
