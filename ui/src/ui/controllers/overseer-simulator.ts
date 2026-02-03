/**
 * Controller for the Overseer Simulator.
 * Manages state and gateway interactions for testing the Overseer/continuation hook framework.
 */

import type { GatewayBrowserClient } from "../gateway";
import {
  createInitialSimulatorState,
  createActivityEntry,
  createEmptyRule,
  createEmptyCondition,
  createEmptyAction,
  createEmptyScenario,
  RULE_TEMPLATES,
  SCENARIO_TEMPLATES,
  type SimulatorState,
  type SimulatorRule,
  type SimulatorScenario,
  type RuleCondition,
  type RuleAction,
  type SimulatedEventParams,
  type QueuedSimulatedEvent,
  type SimulatorMode,
  type SimulatorFilters,
  type SimulatorActivityEntry,
  type SimulationRunState,
} from "../types/overseer-simulator";

// Re-export templates for external use
export { RULE_TEMPLATES, SCENARIO_TEMPLATES };

// ============================================================================
// State Management
// ============================================================================

/** Create initial combined state */
export function createSimulatorControllerState(): SimulatorState {
  return createInitialSimulatorState();
}

/** Toggle simulator panel open/closed */
export function toggleSimulatorPanel(state: SimulatorState): SimulatorState {
  return {
    ...state,
    isOpen: !state.isOpen,
  };
}

/** Set active section */
export function setSimulatorSection(
  state: SimulatorState,
  section: SimulatorState["activeSection"],
): SimulatorState {
  return {
    ...state,
    activeSection: section,
  };
}

/** Set simulator mode */
export function setSimulatorMode(state: SimulatorState, mode: SimulatorMode): SimulatorState {
  return {
    ...state,
    mode,
  };
}

// ============================================================================
// Rule Management
// ============================================================================

/** Add a new rule */
export function addRule(state: SimulatorState, rule?: Partial<SimulatorRule>): SimulatorState {
  const newRule = {
    ...createEmptyRule(),
    ...rule,
  };
  return {
    ...state,
    rules: [...state.rules, newRule],
    activityLog: [
      createActivityEntry("rule", "Rule Created", `Created rule: ${newRule.name}`, "info", {
        ruleId: newRule.id,
      }),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Add a rule from template */
export function addRuleFromTemplate(
  state: SimulatorState,
  templateKey: keyof typeof RULE_TEMPLATES,
): SimulatorState {
  const template = RULE_TEMPLATES[templateKey];
  if (!template) return state;

  const newRule: SimulatorRule = {
    ...template,
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  return {
    ...state,
    rules: [...state.rules, newRule],
    activityLog: [
      createActivityEntry(
        "rule",
        "Rule Added from Template",
        `Added rule from template: ${templateKey}`,
        "success",
        { ruleId: newRule.id },
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Update an existing rule */
export function updateRule(
  state: SimulatorState,
  ruleId: string,
  updates: Partial<SimulatorRule>,
): SimulatorState {
  return {
    ...state,
    rules: state.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)),
    draftRule:
      state.draftRule?.id === ruleId ? { ...state.draftRule, ...updates } : state.draftRule,
  };
}

/** Delete a rule */
export function deleteRule(state: SimulatorState, ruleId: string): SimulatorState {
  const rule = state.rules.find((r) => r.id === ruleId);
  return {
    ...state,
    rules: state.rules.filter((r) => r.id !== ruleId),
    selectedRuleId: state.selectedRuleId === ruleId ? null : state.selectedRuleId,
    activityLog: [
      createActivityEntry("rule", "Rule Deleted", `Deleted rule: ${rule?.name ?? ruleId}`, "info", {
        ruleId,
      }),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Toggle rule enabled state */
export function toggleRuleEnabled(state: SimulatorState, ruleId: string): SimulatorState {
  return {
    ...state,
    rules: state.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
    ),
  };
}

/** Select a rule for editing */
export function selectRule(state: SimulatorState, ruleId: string | null): SimulatorState {
  const rule = ruleId ? state.rules.find((r) => r.id === ruleId) : null;
  return {
    ...state,
    selectedRuleId: ruleId,
    draftRule: rule ? { ...rule } : null,
    ruleEditorOpen: ruleId !== null,
  };
}

/** Close rule editor */
export function closeRuleEditor(state: SimulatorState): SimulatorState {
  return {
    ...state,
    ruleEditorOpen: false,
    selectedRuleId: null,
    draftRule: null,
  };
}

/** Save draft rule */
export function saveDraftRule(state: SimulatorState): SimulatorState {
  if (!state.draftRule) return state;

  const existingIndex = state.rules.findIndex((r) => r.id === state.draftRule!.id);

  if (existingIndex >= 0) {
    return {
      ...state,
      rules: state.rules.map((r, i) => (i === existingIndex ? state.draftRule! : r)),
      ruleEditorOpen: false,
      selectedRuleId: null,
      draftRule: null,
      activityLog: [
        createActivityEntry(
          "rule",
          "Rule Updated",
          `Updated rule: ${state.draftRule.name}`,
          "success",
          {
            ruleId: state.draftRule.id,
          },
        ),
        ...state.activityLog,
      ].slice(0, state.settings.maxActivityLogSize),
    };
  }

  return {
    ...state,
    rules: [...state.rules, state.draftRule],
    ruleEditorOpen: false,
    selectedRuleId: null,
    draftRule: null,
    activityLog: [
      createActivityEntry(
        "rule",
        "Rule Created",
        `Created rule: ${state.draftRule.name}`,
        "success",
        {
          ruleId: state.draftRule.id,
        },
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Add condition to draft rule */
export function addConditionToDraft(state: SimulatorState): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      conditions: [...state.draftRule.conditions, createEmptyCondition()],
    },
  };
}

/** Update condition in draft rule */
export function updateConditionInDraft(
  state: SimulatorState,
  conditionId: string,
  updates: Partial<RuleCondition>,
): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      conditions: state.draftRule.conditions.map((c) =>
        c.id === conditionId ? { ...c, ...updates } : c,
      ),
    },
  };
}

/** Delete condition from draft rule */
export function deleteConditionFromDraft(
  state: SimulatorState,
  conditionId: string,
): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      conditions: state.draftRule.conditions.filter((c) => c.id !== conditionId),
    },
  };
}

/** Add action to draft rule */
export function addActionToDraft(state: SimulatorState): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      actions: [...state.draftRule.actions, createEmptyAction()],
    },
  };
}

/** Update action in draft rule */
export function updateActionInDraft(
  state: SimulatorState,
  actionId: string,
  updates: Partial<RuleAction>,
): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      actions: state.draftRule.actions.map((a) => (a.id === actionId ? { ...a, ...updates } : a)),
    },
  };
}

/** Delete action from draft rule */
export function deleteActionFromDraft(state: SimulatorState, actionId: string): SimulatorState {
  if (!state.draftRule) return state;

  return {
    ...state,
    draftRule: {
      ...state.draftRule,
      actions: state.draftRule.actions.filter((a) => a.id !== actionId),
    },
  };
}

// ============================================================================
// Filter Management
// ============================================================================

/** Update filters */
export function updateFilters(
  state: SimulatorState,
  updates: Partial<SimulatorFilters>,
): SimulatorState {
  return {
    ...state,
    filters: {
      ...state.filters,
      ...updates,
      goals: updates.goals ? { ...state.filters.goals, ...updates.goals } : state.filters.goals,
      assignments: updates.assignments
        ? { ...state.filters.assignments, ...updates.assignments }
        : state.filters.assignments,
      events: updates.events
        ? { ...state.filters.events, ...updates.events }
        : state.filters.events,
    },
  };
}

/** Clear all filters */
export function clearFilters(state: SimulatorState): SimulatorState {
  return {
    ...state,
    filters: {
      goals: {},
      assignments: {},
      events: {},
    },
    activityLog: [
      createActivityEntry("info", "Filters Cleared", "All filters have been reset", "info"),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

// ============================================================================
// Event Simulation
// ============================================================================

/** Queue a simulated event */
export function queueSimulatedEvent(
  state: SimulatorState,
  event: SimulatedEventParams,
): SimulatorState {
  const queuedEvent: QueuedSimulatedEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    scheduledAt: Date.now() + (event.delay ?? 0),
  };

  return {
    ...state,
    eventQueue: [...state.eventQueue, queuedEvent],
    activityLog: [
      createActivityEntry(
        "event",
        "Event Queued",
        `Queued ${event.type} event${event.delay ? ` (delay: ${event.delay}ms)` : ""}`,
        "info",
        { eventId: queuedEvent.id, goalId: event.goalId, assignmentId: event.assignmentId },
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Remove a queued event */
export function removeQueuedEvent(state: SimulatorState, eventId: string): SimulatorState {
  return {
    ...state,
    eventQueue: state.eventQueue.filter((e) => e.id !== eventId),
  };
}

/** Clear event queue */
export function clearEventQueue(state: SimulatorState): SimulatorState {
  return {
    ...state,
    eventQueue: [],
    activityLog: [
      createActivityEntry("info", "Queue Cleared", "Event queue has been cleared", "info"),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Update event status */
export function updateEventStatus(
  state: SimulatorState,
  eventId: string,
  status: QueuedSimulatedEvent["status"],
  result?: string,
  error?: string,
): SimulatorState {
  return {
    ...state,
    eventQueue: state.eventQueue.map((e) =>
      e.id === eventId
        ? {
            ...e,
            status,
            executedAt: status === "completed" || status === "failed" ? Date.now() : e.executedAt,
            result,
            error,
          }
        : e,
    ),
  };
}

// ============================================================================
// Scenario Management
// ============================================================================

/** Add a new scenario */
export function addScenario(
  state: SimulatorState,
  scenario?: Partial<SimulatorScenario>,
): SimulatorState {
  const newScenario = {
    ...createEmptyScenario(),
    ...scenario,
  };
  return {
    ...state,
    scenarios: [...state.scenarios, newScenario],
    activityLog: [
      createActivityEntry(
        "info",
        "Scenario Created",
        `Created scenario: ${newScenario.name}`,
        "success",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Add scenario from template */
export function addScenarioFromTemplate(
  state: SimulatorState,
  templateKey: keyof typeof SCENARIO_TEMPLATES,
): SimulatorState {
  const template = SCENARIO_TEMPLATES[templateKey];
  if (!template) return state;

  const now = Date.now();
  const newScenario: SimulatorScenario = {
    ...template,
    id: `scenario_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...state,
    scenarios: [...state.scenarios, newScenario],
    activityLog: [
      createActivityEntry(
        "info",
        "Scenario Added from Template",
        `Added scenario from template: ${templateKey}`,
        "success",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Update a scenario */
export function updateScenario(
  state: SimulatorState,
  scenarioId: string,
  updates: Partial<SimulatorScenario>,
): SimulatorState {
  return {
    ...state,
    scenarios: state.scenarios.map((s) =>
      s.id === scenarioId ? { ...s, ...updates, updatedAt: Date.now() } : s,
    ),
    draftScenario:
      state.draftScenario?.id === scenarioId
        ? { ...state.draftScenario, ...updates }
        : state.draftScenario,
  };
}

/** Delete a scenario */
export function deleteScenario(state: SimulatorState, scenarioId: string): SimulatorState {
  const scenario = state.scenarios.find((s) => s.id === scenarioId);
  return {
    ...state,
    scenarios: state.scenarios.filter((s) => s.id !== scenarioId),
    selectedScenarioId: state.selectedScenarioId === scenarioId ? null : state.selectedScenarioId,
    activityLog: [
      createActivityEntry(
        "info",
        "Scenario Deleted",
        `Deleted scenario: ${scenario?.name ?? scenarioId}`,
        "info",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Select a scenario for editing */
export function selectScenario(state: SimulatorState, scenarioId: string | null): SimulatorState {
  const scenario = scenarioId ? state.scenarios.find((s) => s.id === scenarioId) : null;
  return {
    ...state,
    selectedScenarioId: scenarioId,
    draftScenario: scenario ? { ...scenario } : null,
    scenarioEditorOpen: scenarioId !== null,
  };
}

/** Close scenario editor */
export function closeScenarioEditor(state: SimulatorState): SimulatorState {
  return {
    ...state,
    scenarioEditorOpen: false,
    selectedScenarioId: null,
    draftScenario: null,
  };
}

/** Save draft scenario */
export function saveDraftScenario(state: SimulatorState): SimulatorState {
  if (!state.draftScenario) return state;

  const existingIndex = state.scenarios.findIndex((s) => s.id === state.draftScenario!.id);

  if (existingIndex >= 0) {
    return {
      ...state,
      scenarios: state.scenarios.map((s, i) =>
        i === existingIndex ? { ...state.draftScenario!, updatedAt: Date.now() } : s,
      ),
      scenarioEditorOpen: false,
      selectedScenarioId: null,
      draftScenario: null,
    };
  }

  return {
    ...state,
    scenarios: [...state.scenarios, state.draftScenario],
    scenarioEditorOpen: false,
    selectedScenarioId: null,
    draftScenario: null,
  };
}

// ============================================================================
// Simulation Run Management
// ============================================================================

/** Start a simulation run */
export function startSimulationRun(state: SimulatorState, scenarioId?: string): SimulatorState {
  const scenario = scenarioId ? state.scenarios.find((s) => s.id === scenarioId) : null;

  const run: SimulationRunState = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode: state.mode,
    status: "running",
    startedAt: Date.now(),
    executedEvents: [],
    triggeredRules: [],
    tickCount: 0,
  };

  // If running a scenario, queue its events
  let eventQueue = state.eventQueue;
  if (scenario) {
    const scenarioEvents: QueuedSimulatedEvent[] = scenario.events.map((e, i) => ({
      ...e,
      id: `evt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      scheduledAt: Date.now() + (e.delay ?? i * 1000),
    }));
    eventQueue = [...eventQueue, ...scenarioEvents];
  }

  return {
    ...state,
    run,
    eventQueue,
    activityLog: [
      createActivityEntry(
        "info",
        "Simulation Started",
        scenario ? `Running scenario: ${scenario.name}` : "Simulation run started",
        "success",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Pause a simulation run */
export function pauseSimulationRun(state: SimulatorState): SimulatorState {
  if (!state.run || state.run.status !== "running") return state;

  return {
    ...state,
    run: {
      ...state.run,
      status: "paused",
      pausedAt: Date.now(),
    },
    activityLog: [
      createActivityEntry("info", "Simulation Paused", "Simulation run paused", "warning"),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Resume a paused simulation run */
export function resumeSimulationRun(state: SimulatorState): SimulatorState {
  if (!state.run || state.run.status !== "paused") return state;

  return {
    ...state,
    run: {
      ...state.run,
      status: "running",
      pausedAt: undefined,
    },
    activityLog: [
      createActivityEntry("info", "Simulation Resumed", "Simulation run resumed", "success"),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Stop a simulation run */
export function stopSimulationRun(state: SimulatorState): SimulatorState {
  if (!state.run) return state;

  return {
    ...state,
    run: {
      ...state.run,
      status: "completed",
      completedAt: Date.now(),
    },
    activityLog: [
      createActivityEntry(
        "info",
        "Simulation Completed",
        `Simulation completed. ${state.run.executedEvents.length} events, ${state.run.triggeredRules.length} rules triggered`,
        "success",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Reset simulation (clear run state) */
export function resetSimulation(state: SimulatorState): SimulatorState {
  return {
    ...state,
    run: null,
    eventQueue: [],
    activityLog: [
      createActivityEntry("info", "Simulation Reset", "Simulation state has been reset", "info"),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Record a triggered rule in the current run */
export function recordTriggeredRule(
  state: SimulatorState,
  ruleId: string,
  matchedConditions: string[],
  executedActions: string[],
): SimulatorState {
  if (!state.run) return state;

  const rule = state.rules.find((r) => r.id === ruleId);
  if (!rule) return state;

  // Update rule trigger count
  const updatedRules = state.rules.map((r) =>
    r.id === ruleId ? { ...r, triggerCount: r.triggerCount + 1, lastTriggeredAt: Date.now() } : r,
  );

  return {
    ...state,
    rules: updatedRules,
    run: {
      ...state.run,
      triggeredRules: [
        ...state.run.triggeredRules,
        {
          ruleId,
          ruleName: rule.name,
          triggeredAt: Date.now(),
          matchedConditions,
          executedActions,
        },
      ],
    },
    activityLog: [
      createActivityEntry(
        "rule",
        "Rule Triggered",
        `Rule "${rule.name}" triggered. Actions: ${executedActions.join(", ")}`,
        "success",
        { ruleId },
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Record a tick in the current run */
export function recordTick(state: SimulatorState): SimulatorState {
  if (!state.run) return state;

  return {
    ...state,
    run: {
      ...state.run,
      tickCount: state.run.tickCount + 1,
    },
    activityLog: [
      createActivityEntry(
        "tick",
        "Overseer Tick",
        `Tick #${state.run.tickCount + 1} executed`,
        "info",
      ),
      ...state.activityLog,
    ].slice(0, state.settings.maxActivityLogSize),
  };
}

// ============================================================================
// Activity Log Management
// ============================================================================

/** Add activity log entry */
export function addActivityEntry(
  state: SimulatorState,
  entry: Omit<SimulatorActivityEntry, "id" | "timestamp">,
): SimulatorState {
  const newEntry: SimulatorActivityEntry = {
    ...entry,
    id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  return {
    ...state,
    activityLog: [newEntry, ...state.activityLog].slice(0, state.settings.maxActivityLogSize),
  };
}

/** Clear activity log */
export function clearActivityLog(state: SimulatorState): SimulatorState {
  return {
    ...state,
    activityLog: [],
  };
}

// ============================================================================
// Settings Management
// ============================================================================

/** Update simulator settings */
export function updateSettings(
  state: SimulatorState,
  updates: Partial<SimulatorState["settings"]>,
): SimulatorState {
  return {
    ...state,
    settings: {
      ...state.settings,
      ...updates,
    },
  };
}

// ============================================================================
// Gateway Integration
// ============================================================================

/** Execute a simulated event via gateway */
export async function executeSimulatedEvent(
  client: GatewayBrowserClient | null,
  event: QueuedSimulatedEvent,
): Promise<{ success: boolean; result?: string; error?: string }> {
  if (!client) {
    return { success: false, error: "Gateway client not connected" };
  }

  try {
    switch (event.type) {
      case "tick_triggered":
        await client.request("overseer.tick", { reason: "simulator" });
        return { success: true, result: "Tick triggered" };

      case "goal_created":
        if (event.data?.title) {
          await client.request("overseer.goal.create", {
            title: event.data.title as string,
            problemStatement: (event.data.problemStatement as string) ?? "Simulated goal",
            successCriteria: (event.data.successCriteria as string[]) ?? [],
            generatePlan: false,
          });
          return { success: true, result: `Goal created: ${event.data.title}` };
        }
        return { success: false, error: "Missing goal title" };

      case "structured_update":
        // This would need to go through the session/continuation system
        // For simulation purposes, we just log it
        return { success: true, result: `Structured update: ${JSON.stringify(event.data)}` };

      case "assignment_stalled":
      case "assignment_active":
      case "tool_error":
      case "silent_completion":
      case "turn_completion":
      case "run_completion":
      case "queue_completion":
        // These are continuation events that would normally come from the agent
        // For simulation, we trigger a tick to process any state changes
        await client.request("overseer.tick", { reason: `simulator:${event.type}` });
        return { success: true, result: `${event.type} simulated, tick triggered` };

      case "goal_completed":
        if (event.goalId) {
          // Mark goal as completed via work update
          return { success: true, result: `Goal ${event.goalId} marked complete (simulated)` };
        }
        return { success: false, error: "Missing goal ID" };

      default:
        return { success: false, error: `Unknown event type: ${event.type}` };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Trigger an Overseer tick via gateway */
export async function triggerOverseerTick(
  client: GatewayBrowserClient | null,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    return { success: false, error: "Gateway client not connected" };
  }

  try {
    await client.request("overseer.tick", { reason: reason ?? "simulator-manual" });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Load simulator state from gateway (if persisted) */
export async function loadSimulatorState(
  client: GatewayBrowserClient | null,
): Promise<{ rules: SimulatorRule[]; scenarios: SimulatorScenario[] } | null> {
  if (!client) return null;

  try {
    const result = (await client.request("overseer.simulator.load", {})) as {
      rules?: SimulatorRule[];
      scenarios?: SimulatorScenario[];
    } | null;
    if (!result) return null;
    return { rules: result.rules ?? [], scenarios: result.scenarios ?? [] };
  } catch {
    // Simulator state may not be persisted, that's OK
    return null;
  }
}

/** Save simulator state to gateway */
export async function saveSimulatorState(
  client: GatewayBrowserClient | null,
  state: { rules: SimulatorRule[]; scenarios: SimulatorScenario[] },
): Promise<boolean> {
  if (!client) return false;

  try {
    await client.request("overseer.simulator.save", state);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Rule Evaluation
// ============================================================================

/** Evaluate a condition against context data */
export function evaluateCondition(
  condition: RuleCondition,
  context: Record<string, unknown>,
): boolean {
  if (!condition.enabled) return true; // Disabled conditions always pass

  // Get the value from context using the field path
  const fieldParts = condition.field.split(".");
  let value: unknown = context;
  for (const part of fieldParts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      value = undefined;
      break;
    }
  }

  const stringValue = String(value ?? "");
  const conditionValue = condition.value;

  switch (condition.operator) {
    case "equals":
      return stringValue === conditionValue;
    case "not_equals":
      return stringValue !== conditionValue;
    case "contains":
      return stringValue.includes(conditionValue);
    case "not_contains":
      return !stringValue.includes(conditionValue);
    case "starts_with":
      return stringValue.startsWith(conditionValue);
    case "ends_with":
      return stringValue.endsWith(conditionValue);
    case "greater_than":
      return Number(stringValue) > Number(conditionValue);
    case "less_than":
      return Number(stringValue) < Number(conditionValue);
    case "is_empty":
      return !stringValue || stringValue === "undefined" || stringValue === "null";
    case "is_not_empty":
      return !!stringValue && stringValue !== "undefined" && stringValue !== "null";
    case "matches_regex":
      try {
        return new RegExp(conditionValue).test(stringValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** Evaluate a rule against context data */
export function evaluateRule(
  rule: SimulatorRule,
  context: Record<string, unknown>,
): { matches: boolean; matchedConditions: string[] } {
  if (!rule.enabled) return { matches: false, matchedConditions: [] };

  const matchedConditions: string[] = [];
  const results: boolean[] = [];

  for (const condition of rule.conditions) {
    const matches = evaluateCondition(condition, context);
    results.push(matches);
    if (matches) {
      matchedConditions.push(condition.id);
    }
  }

  const matches = rule.logic === "and" ? results.every(Boolean) : results.some(Boolean);

  return { matches, matchedConditions };
}

/** Evaluate all rules against context and return matching rules */
export function evaluateAllRules(
  rules: SimulatorRule[],
  context: Record<string, unknown>,
): Array<{ rule: SimulatorRule; matchedConditions: string[] }> {
  const matches: Array<{ rule: SimulatorRule; matchedConditions: string[] }> = [];

  // Sort rules by priority (lower = higher priority)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const result = evaluateRule(rule, context);
    if (result.matches) {
      matches.push({ rule, matchedConditions: result.matchedConditions });
    }
  }

  return matches;
}
