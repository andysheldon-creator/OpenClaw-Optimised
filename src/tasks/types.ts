/**
 * Types for the autonomous long-running task system.
 *
 * A Task is a multi-step work item that the AI agent executes autonomously.
 * Each step is run as an isolated agent turn via runCronIsolatedAgentTurn().
 * Progress is persisted to disk and periodic reports sent to the user.
 */

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStep = {
  /** Unique step identifier. */
  id: string;
  /** Zero-based index in the parent task's step array. */
  index: number;
  /** Human-readable description of what this step does. */
  description: string;
  /** Current status. */
  status: TaskStatus;
  /** The prompt sent to the agent for this step. */
  prompt: string;
  /** Agent output text (truncated to MAX_RESULT_LENGTH). */
  result?: string;
  /** Epoch ms when execution started. */
  startedAtMs?: number;
  /** Epoch ms when execution completed (or failed). */
  completedAtMs?: number;
  /** Error message if the step failed. */
  error?: string;
  /** How many times this step has been retried. */
  retryCount?: number;
};

export type TaskProgressReport = {
  taskId: string;
  stepIndex: number;
  totalSteps: number;
  percentComplete: number;
  currentStepDescription: string;
  summary: string;
  sentAtMs: number;
  channel: string;
  to: string;
};

export type Task = {
  /** Unique task identifier (UUID). */
  id: string;
  /** Short name for the task. */
  name: string;
  /** Full description of the task. */
  description: string;
  /** Current overall status. */
  status: TaskStatus;
  /** Epoch ms when the task was created. */
  createdAtMs: number;
  /** Epoch ms when the task was last updated. */
  updatedAtMs: number;
  /** Epoch ms when the task finished (completed/failed/cancelled). */
  completedAtMs?: number;

  // ── Delivery target ──────────────────────────────────────────────────────
  /**
   * Channel for progress reports. "last" means use the user's last active
   * channel from session store.
   */
  reportChannel:
    | "last"
    | "whatsapp"
    | "telegram"
    | "discord"
    | "signal"
    | "imessage";
  /** Explicit recipient (chat ID / phone number). */
  reportTo?: string;
  /** Telegram forum topic ID for progress reports (message_thread_id). */
  reportTopicId?: number;
  /** Send a progress report every N completed steps. Default: 1. */
  reportEverySteps: number;

  // ── Execution ────────────────────────────────────────────────────────────
  /** Ordered list of steps to execute. */
  steps: TaskStep[];
  /** Index of the step currently being executed (or next to execute). */
  currentStepIndex: number;
  /** Isolated session key for this task (e.g. "task:{id}"). */
  sessionKey: string;

  // ── Limits ───────────────────────────────────────────────────────────────
  /** Delay between steps in ms. Default: 30_000. */
  stepIntervalMs: number;
  /** Max retries per step before marking it failed. Default: 2. */
  maxRetries: number;
  /** Per-step timeout in ms. Default: 600_000 (10 min). */
  timeoutPerStepMs: number;

  // ── Results ──────────────────────────────────────────────────────────────
  /** History of progress reports sent to the user. */
  progressReports: TaskProgressReport[];
  /** Final summary text, set on completion. */
  finalSummary?: string;
  /** Final output from the last completed step — used for synthesis in board meetings. */
  finalResult?: string;

  // ── Agent metadata (for board agent tasks) ─────────────────────────────
  /** Extensible metadata: agentRole, directive, extraSystemPrompt, meetingId, etc. */
  metadata?: Record<string, unknown>;
};

export type TaskStoreFile = {
  version: 1;
  tasks: Task[];
};

/**
 * Input for creating a new task. Steps are provided in execution order.
 */
export type TaskCreate = {
  name: string;
  description: string;
  steps: Array<{ description: string; prompt: string }>;
  reportChannel?: Task["reportChannel"];
  reportTo?: string;
  reportTopicId?: number;
  reportEverySteps?: number;
  stepIntervalMs?: number;
  maxRetries?: number;
  timeoutPerStepMs?: number;
  metadata?: Record<string, unknown>;
};

/** Maximum length for step result text (characters). */
export const MAX_RESULT_LENGTH = 2000;

/** Default step interval in ms (30 seconds). */
export const DEFAULT_STEP_INTERVAL_MS = 30_000;

/** Default per-step timeout in ms (10 minutes). */
export const DEFAULT_STEP_TIMEOUT_MS = 600_000;

/** Default retries per step. */
export const DEFAULT_MAX_RETRIES = 2;

/** Default report frequency (every step). */
export const DEFAULT_REPORT_EVERY_STEPS = 1;
