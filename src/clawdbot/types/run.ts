/**
 * Run state machine type definitions for the Clawdbot agent runtime.
 *
 * A "run" is a single execution of a skill — it progresses through a set of
 * well-defined states and records every transition for auditability.
 */

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

/** The lifecycle states a run can occupy. */
export const enum RunState {
  /** Skill invocation accepted but execution has not started. */
  Planned = "planned",
  /** Skill is actively executing steps. */
  Running = "running",
  /** Execution paused, waiting for a human approval gate. */
  AwaitingApproval = "awaiting_approval",
  /** All steps completed successfully. */
  Completed = "completed",
  /** Execution terminated due to an unrecoverable error. */
  Failed = "failed",
  /** Execution canceled by a human or policy before completion. */
  Canceled = "canceled",
}

// ---------------------------------------------------------------------------
// Run transition
// ---------------------------------------------------------------------------

/** A single recorded state change within a run's history. */
export type RunTransition = {
  /** State the run was in before this transition. */
  from: RunState;
  /** State the run moved to. */
  to: RunState;
  /** ISO-8601 timestamp of when the transition occurred. */
  timestamp: string;
  /** Human-readable explanation for the transition. */
  reason: string;
  /** Who or what initiated the transition (user id, system, policy engine, etc.). */
  actor: string;
};

// ---------------------------------------------------------------------------
// Run step
// ---------------------------------------------------------------------------

/** The possible states of an individual step within a run. */
export const enum RunStepState {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

/** An individual step within a run (typically a single tool call). */
export type RunStep = {
  /** Unique identifier for this step. */
  id: string;
  /** Name of the tool invoked in this step. */
  toolCall: string;
  /** The input/arguments passed to the tool. */
  input: unknown;
  /** The output returned by the tool (undefined until the step completes). */
  result: unknown;
  /** Wall-clock duration in milliseconds (set once the step finishes). */
  durationMs: number | undefined;
  /** Current state of this step. */
  state: RunStepState;
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** A full run record — the top-level unit of execution in the Clawdbot runtime. */
export type Run = {
  /** Unique identifier for this run (e.g. a ULID or UUID). */
  id: string;
  /** The registered name of the skill being executed. */
  skillName: string;
  /** Current lifecycle state. */
  state: RunState;
  /** Ordered history of every state transition. */
  transitions: RunTransition[];
  /** Steps executed (or pending) within this run. */
  steps: RunStep[];
  /** The input payload provided to the skill at invocation time. */
  input: unknown;
  /** The final output produced by the skill (undefined until completed). */
  output: unknown;
  /** URIs or identifiers for artifacts generated during the run (screenshots, transcripts, exports). */
  artifacts: string[];
  /** ISO-8601 timestamp of when the run was created. */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent state change. */
  updatedAt: string;
};
