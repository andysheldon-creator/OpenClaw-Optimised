/**
 * Automations configuration type.
 */

export type AutomationsConfig = {
  /** Enable or disable automations feature (default: true) */
  enabled?: boolean;
  /** Custom store path for automation data (default: ~/.clawdbrain/automations/automations.json) */
  store?: string;
  /** Custom directory for artifact storage (default: ~/.clawdbrain/automations/artifacts) */
  artifactsDir?: string;
  /** Maximum number of concurrent automation runs (default: 3) */
  maxConcurrentRuns?: number;
  /** Maximum run duration in milliseconds before cancellation (default: 1 hour) */
  maxRunDurationMs?: number;
  /** How many days of run history to retain (default: 30) */
  historyRetentionDays?: number;
  /** Maximum number of run records per automation to retain (default: 100) */
  historyMaxRunsPerAutomation?: number;
};
