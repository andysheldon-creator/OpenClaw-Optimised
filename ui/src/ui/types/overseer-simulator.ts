/**
 * Type definitions for the Overseer Simulator.
 * Used for testing and demoing the Overseer/continuation hook framework.
 */

import type { OverseerAssignmentDetail, OverseerGoalDetail, OverseerEvent } from "./overseer";

// ============================================================================
// Rule System Types
// ============================================================================

/** Condition operators for rule matching */
export type RuleOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty"
  | "matches_regex";

/** Condition field types that can be matched against */
export type RuleConditionField =
  | "goal.status"
  | "goal.priority"
  | "goal.title"
  | "goal.tags"
  | "assignment.status"
  | "assignment.agentId"
  | "assignment.retryCount"
  | "assignment.backoffUntil"
  | "event.type"
  | "event.goalId"
  | "event.assignmentId"
  | "continuation.level"
  | "continuation.hasToolError"
  | "continuation.isSilent";

/** A single condition in a rule */
export type RuleCondition = {
  id: string;
  field: RuleConditionField;
  operator: RuleOperator;
  value: string;
  /** Whether this condition is enabled */
  enabled: boolean;
};

/** Actions that can be triggered by rules */
export type RuleActionType =
  | "log"
  | "notify"
  | "set_status"
  | "set_recovery_policy"
  | "trigger_tick"
  | "pause_goal"
  | "resume_goal"
  | "escalate"
  | "inject_event"
  | "modify_backoff"
  | "custom_hook";

/** A single action in a rule */
export type RuleAction = {
  id: string;
  type: RuleActionType;
  /** Action-specific parameters */
  params: Record<string, unknown>;
  /** Whether this action is enabled */
  enabled: boolean;
};

/** Logical operator for combining conditions */
export type RuleLogicOperator = "and" | "or";

/** A complete rule definition */
export type SimulatorRule = {
  id: string;
  name: string;
  description: string;
  /** Whether this rule is enabled */
  enabled: boolean;
  /** Priority for rule ordering (lower = higher priority) */
  priority: number;
  /** How conditions are combined */
  logic: RuleLogicOperator;
  /** Conditions that must match for the rule to trigger */
  conditions: RuleCondition[];
  /** Actions to execute when the rule matches */
  actions: RuleAction[];
  /** Number of times this rule has been triggered */
  triggerCount: number;
  /** Last time this rule was triggered */
  lastTriggeredAt?: number;
  /** Tags for organizing rules */
  tags: string[];
};

// ============================================================================
// Filter Types
// ============================================================================

/** Filter for goals */
export type GoalFilter = {
  status?: string[];
  priority?: string[];
  tags?: string[];
  searchText?: string;
};

/** Filter for assignments */
export type AssignmentFilter = {
  status?: string[];
  agentId?: string[];
  hasBackoff?: boolean;
  isStalled?: boolean;
};

/** Filter for events */
export type EventFilter = {
  types?: string[];
  goalId?: string;
  assignmentId?: string;
  timeRange?: {
    from: number;
    to: number;
  };
};

/** Combined filters for the simulator */
export type SimulatorFilters = {
  goals: GoalFilter;
  assignments: AssignmentFilter;
  events: EventFilter;
};

// ============================================================================
// Event Simulation Types
// ============================================================================

/** Types of events that can be simulated */
export type SimulatedEventType =
  | "turn_completion"
  | "run_completion"
  | "queue_completion"
  | "tool_error"
  | "silent_completion"
  | "structured_update"
  | "assignment_stalled"
  | "assignment_active"
  | "goal_created"
  | "goal_completed"
  | "tick_triggered";

/** Parameters for simulating an event */
export type SimulatedEventParams = {
  type: SimulatedEventType;
  /** Target goal ID (if applicable) */
  goalId?: string;
  /** Target assignment ID (if applicable) */
  assignmentId?: string;
  /** Target session key (if applicable) */
  sessionKey?: string;
  /** Additional event-specific data */
  data?: Record<string, unknown>;
  /** Delay before executing (ms) */
  delay?: number;
};

/** A queued simulated event */
export type QueuedSimulatedEvent = SimulatedEventParams & {
  id: string;
  status: "pending" | "executing" | "completed" | "failed";
  scheduledAt: number;
  executedAt?: number;
  result?: string;
  error?: string;
};

// ============================================================================
// Scenario Types
// ============================================================================

/** A saved simulation scenario */
export type SimulatorScenario = {
  id: string;
  name: string;
  description: string;
  /** Rules to apply in this scenario */
  rules: SimulatorRule[];
  /** Sequence of events to simulate */
  events: SimulatedEventParams[];
  /** Initial goal state (optional) */
  initialGoal?: Partial<OverseerGoalDetail>;
  /** Initial assignments (optional) */
  initialAssignments?: Partial<OverseerAssignmentDetail>[];
  /** Tags for organizing scenarios */
  tags: string[];
  /** When this scenario was created */
  createdAt: number;
  /** When this scenario was last modified */
  updatedAt: number;
};

// ============================================================================
// Simulator State Types
// ============================================================================

/** Execution mode for the simulator */
export type SimulatorMode = "live" | "sandbox" | "replay";

/** State of a simulation run */
export type SimulationRunState = {
  id: string;
  mode: SimulatorMode;
  status: "idle" | "running" | "paused" | "completed" | "error";
  startedAt?: number;
  pausedAt?: number;
  completedAt?: number;
  /** Events that have been executed */
  executedEvents: QueuedSimulatedEvent[];
  /** Rules that have been triggered */
  triggeredRules: Array<{
    ruleId: string;
    ruleName: string;
    triggeredAt: number;
    matchedConditions: string[];
    executedActions: string[];
  }>;
  /** Current tick count */
  tickCount: number;
  /** Error message if status is error */
  error?: string;
};

/** Activity log entry for the simulator */
export type SimulatorActivityEntry = {
  id: string;
  timestamp: number;
  type: "event" | "rule" | "action" | "tick" | "error" | "info";
  title: string;
  description: string;
  severity: "info" | "success" | "warning" | "error";
  /** Associated entity IDs */
  goalId?: string;
  assignmentId?: string;
  ruleId?: string;
  eventId?: string;
  /** Raw data for inspection */
  data?: Record<string, unknown>;
};

/** Main simulator state */
export type SimulatorState = {
  /** Current mode */
  mode: SimulatorMode;
  /** Whether the simulator panel is open */
  isOpen: boolean;
  /** Active section in the simulator */
  activeSection: "rules" | "filters" | "events" | "scenarios" | "activity";
  /** Current rules */
  rules: SimulatorRule[];
  /** Current filters */
  filters: SimulatorFilters;
  /** Event queue */
  eventQueue: QueuedSimulatedEvent[];
  /** Saved scenarios */
  scenarios: SimulatorScenario[];
  /** Activity log */
  activityLog: SimulatorActivityEntry[];
  /** Current run state */
  run: SimulationRunState | null;
  /** Selected rule ID for editing */
  selectedRuleId: string | null;
  /** Selected scenario ID for editing */
  selectedScenarioId: string | null;
  /** Whether the rule editor is open */
  ruleEditorOpen: boolean;
  /** Whether the scenario editor is open */
  scenarioEditorOpen: boolean;
  /** Draft rule being edited */
  draftRule: SimulatorRule | null;
  /** Draft scenario being edited */
  draftScenario: SimulatorScenario | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Settings */
  settings: {
    autoTick: boolean;
    tickIntervalMs: number;
    maxActivityLogSize: number;
    showRuleMatches: boolean;
    showEventDetails: boolean;
  };
};

// ============================================================================
// Hook Configuration Types
// ============================================================================

/** Configuration for continuation hooks */
export type ContinuationHookConfig = {
  /** Whether to auto-trigger tick on run completion */
  autoTickOnRunComplete: boolean;
  /** Whether to auto-trigger tick on queue drain */
  autoTickOnQueueDrain: boolean;
  /** Whether to mark assignments stalled on tool errors */
  stallOnToolError: boolean;
  /** Number of tool errors before stalling */
  toolErrorThreshold: number;
  /** Whether to mark assignments stalled on silent completions */
  stallOnSilentCompletion: boolean;
  /** Number of silent completions before stalling */
  silentCompletionThreshold: number;
};

/** Configuration for runner hooks */
export type RunnerHookConfig = {
  /** Whether to pause on stalled assignments */
  pauseOnStalled: boolean;
  /** Whether to log all status transitions */
  logStatusTransitions: boolean;
  /** Custom actions to run before dispatch */
  preDispatchActions: RuleAction[];
  /** Custom actions to run after tick */
  postTickActions: RuleAction[];
};

/** Combined hook configuration */
export type SimulatorHookConfig = {
  continuation: ContinuationHookConfig;
  runner: RunnerHookConfig;
};

// ============================================================================
// Preset Templates
// ============================================================================

/** Preset rule templates */
export const RULE_TEMPLATES: Record<string, Omit<SimulatorRule, "id">> = {
  stallOnError: {
    name: "Stall on Tool Error",
    description: "Mark assignment as stalled when a tool error occurs",
    enabled: true,
    priority: 10,
    logic: "and",
    conditions: [
      {
        id: "c1",
        field: "continuation.hasToolError",
        operator: "equals",
        value: "true",
        enabled: true,
      },
    ],
    actions: [
      {
        id: "a1",
        type: "set_status",
        params: { status: "stalled" },
        enabled: true,
      },
      {
        id: "a2",
        type: "log",
        params: { message: "Assignment stalled due to tool error" },
        enabled: true,
      },
    ],
    triggerCount: 0,
    tags: ["error-handling"],
  },
  escalateAfterRetries: {
    name: "Escalate After Retries",
    description: "Escalate to human when retry limit is reached",
    enabled: true,
    priority: 20,
    logic: "and",
    conditions: [
      {
        id: "c1",
        field: "assignment.retryCount",
        operator: "greater_than",
        value: "3",
        enabled: true,
      },
      {
        id: "c2",
        field: "assignment.status",
        operator: "equals",
        value: "stalled",
        enabled: true,
      },
    ],
    actions: [
      {
        id: "a1",
        type: "set_recovery_policy",
        params: { policy: "escalate" },
        enabled: true,
      },
      {
        id: "a2",
        type: "notify",
        params: { message: "Assignment requires human intervention" },
        enabled: true,
      },
    ],
    triggerCount: 0,
    tags: ["recovery", "escalation"],
  },
  autoResumeOnActivity: {
    name: "Auto-Resume on Activity",
    description: "Resume stalled assignments when activity is detected",
    enabled: true,
    priority: 15,
    logic: "and",
    conditions: [
      {
        id: "c1",
        field: "event.type",
        operator: "equals",
        value: "continuation.run.completed",
        enabled: true,
      },
      {
        id: "c2",
        field: "assignment.status",
        operator: "equals",
        value: "stalled",
        enabled: true,
      },
    ],
    actions: [
      {
        id: "a1",
        type: "set_status",
        params: { status: "active" },
        enabled: true,
      },
      {
        id: "a2",
        type: "log",
        params: { message: "Assignment resumed due to activity" },
        enabled: true,
      },
    ],
    triggerCount: 0,
    tags: ["recovery", "auto-resume"],
  },
  notifyOnGoalComplete: {
    name: "Notify on Goal Completion",
    description: "Send notification when a goal is completed",
    enabled: true,
    priority: 30,
    logic: "and",
    conditions: [
      {
        id: "c1",
        field: "goal.status",
        operator: "equals",
        value: "completed",
        enabled: true,
      },
    ],
    actions: [
      {
        id: "a1",
        type: "notify",
        params: { message: "Goal completed successfully!" },
        enabled: true,
      },
      {
        id: "a2",
        type: "log",
        params: { message: "Goal marked as completed" },
        enabled: true,
      },
    ],
    triggerCount: 0,
    tags: ["notifications", "completion"],
  },
};

/** Preset scenario templates */
export const SCENARIO_TEMPLATES: Record<
  string,
  Omit<SimulatorScenario, "id" | "createdAt" | "updatedAt">
> = {
  happyPath: {
    name: "Happy Path",
    description: "Simulates a successful goal completion with no errors",
    rules: [],
    events: [
      { type: "goal_created", data: { title: "Test Goal" } },
      { type: "turn_completion", delay: 1000 },
      { type: "structured_update", data: { status: "in_progress" }, delay: 2000 },
      { type: "run_completion", delay: 3000 },
      { type: "structured_update", data: { status: "done" }, delay: 4000 },
    ],
    tags: ["testing", "success"],
  },
  errorRecovery: {
    name: "Error Recovery",
    description: "Simulates tool errors and recovery",
    rules: [],
    events: [
      { type: "goal_created", data: { title: "Error Recovery Test" } },
      { type: "turn_completion", delay: 1000 },
      {
        type: "tool_error",
        data: { toolName: "file_write", error: "Permission denied" },
        delay: 2000,
      },
      { type: "assignment_stalled", delay: 3000 },
      { type: "tick_triggered", delay: 4000 },
      { type: "turn_completion", delay: 5000 },
      { type: "assignment_active", delay: 6000 },
    ],
    tags: ["testing", "error-handling"],
  },
  escalationFlow: {
    name: "Escalation Flow",
    description: "Simulates repeated failures leading to escalation",
    rules: [],
    events: [
      { type: "goal_created", data: { title: "Escalation Test" } },
      { type: "tool_error", delay: 1000 },
      { type: "tick_triggered", delay: 2000 },
      { type: "tool_error", delay: 3000 },
      { type: "tick_triggered", delay: 4000 },
      { type: "tool_error", delay: 5000 },
      { type: "tick_triggered", delay: 6000 },
      // After 3 failures, should trigger escalation
    ],
    tags: ["testing", "escalation"],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/** Create a new empty rule */
export function createEmptyRule(): SimulatorRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "New Rule",
    description: "",
    enabled: true,
    priority: 50,
    logic: "and",
    conditions: [],
    actions: [],
    triggerCount: 0,
    tags: [],
  };
}

/** Create a new empty condition */
export function createEmptyCondition(): RuleCondition {
  return {
    id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    field: "assignment.status",
    operator: "equals",
    value: "",
    enabled: true,
  };
}

/** Create a new empty action */
export function createEmptyAction(): RuleAction {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "log",
    params: {},
    enabled: true,
  };
}

/** Create a new empty scenario */
export function createEmptyScenario(): SimulatorScenario {
  const now = Date.now();
  return {
    id: `scenario_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: "New Scenario",
    description: "",
    rules: [],
    events: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Create initial simulator state */
export function createInitialSimulatorState(): SimulatorState {
  return {
    mode: "sandbox",
    isOpen: false,
    activeSection: "rules",
    rules: [],
    filters: {
      goals: {},
      assignments: {},
      events: {},
    },
    eventQueue: [],
    scenarios: [],
    activityLog: [],
    run: null,
    selectedRuleId: null,
    selectedScenarioId: null,
    ruleEditorOpen: false,
    scenarioEditorOpen: false,
    draftRule: null,
    draftScenario: null,
    loading: false,
    error: null,
    settings: {
      autoTick: false,
      tickIntervalMs: 5000,
      maxActivityLogSize: 100,
      showRuleMatches: true,
      showEventDetails: true,
    },
  };
}

/** Create a new activity log entry */
export function createActivityEntry(
  type: SimulatorActivityEntry["type"],
  title: string,
  description: string,
  severity: SimulatorActivityEntry["severity"] = "info",
  extras?: Partial<SimulatorActivityEntry>,
): SimulatorActivityEntry {
  return {
    id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    title,
    description,
    severity,
    ...extras,
  };
}
