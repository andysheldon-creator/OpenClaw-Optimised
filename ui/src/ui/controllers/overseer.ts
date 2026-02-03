import type { GatewayBrowserClient } from "../gateway";
import type { OverseerGoalStatusResult, OverseerStatusResult } from "../types/overseer";
import {
  createInitialSimulatorState,
  RULE_TEMPLATES,
  SCENARIO_TEMPLATES,
  type SimulatorState,
  type SimulatorRule,
  type SimulatorScenario,
  type RuleCondition,
  type RuleAction,
  type SimulatedEventType,
  type QueuedSimulatedEvent,
} from "../types/overseer-simulator";
import * as SimulatorController from "./overseer-simulator";

// Re-export for convenience
export { RULE_TEMPLATES, SCENARIO_TEMPLATES } from "../types/overseer-simulator";

export type OverseerState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  overseerLoading: boolean;
  overseerError: string | null;
  overseerStatus: OverseerStatusResult | null;
  overseerGoalLoading: boolean;
  overseerGoalError: string | null;
  overseerSelectedGoalId: string | null;
  overseerGoal: OverseerGoalStatusResult | null;
  // Goal action states
  overseerGoalActionPending: boolean;
  overseerGoalActionError: string | null;
  // Create goal modal state
  overseerCreateGoalOpen: boolean;
  overseerCreateGoalForm: {
    title: string;
    problemStatement: string;
    successCriteria: string[];
    constraints: string[];
    priority: "low" | "normal" | "high" | "urgent";
    generatePlan: boolean;
  };
  // Simulator state
  simulator: SimulatorState;
};

export async function loadOverseerStatus(state: OverseerState, opts?: { quiet?: boolean }) {
  if (!state.client || !state.connected) return;
  if (state.overseerLoading) return;
  state.overseerLoading = true;
  if (!opts?.quiet) state.overseerError = null;
  try {
    const res = (await state.client.request("overseer.status", {
      includeGoals: true,
      includeAssignments: true,
    })) as OverseerStatusResult | undefined;
    if (res) state.overseerStatus = res;
  } catch (err) {
    if (!opts?.quiet) state.overseerError = String(err);
  } finally {
    state.overseerLoading = false;
  }
}

export async function loadOverseerGoal(
  state: OverseerState,
  goalId: string,
  opts?: { quiet?: boolean },
) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalLoading) return;
  state.overseerGoalLoading = true;
  if (!opts?.quiet) state.overseerGoalError = null;
  try {
    const res = (await state.client.request("overseer.goal.status", { goalId })) as
      | OverseerGoalStatusResult
      | undefined;
    if (res) state.overseerGoal = res;
  } catch (err) {
    if (!opts?.quiet) state.overseerGoalError = String(err);
  } finally {
    state.overseerGoalLoading = false;
  }
}

export async function refreshOverseer(state: OverseerState, opts?: { quiet?: boolean }) {
  await loadOverseerStatus(state, opts);
  const goals = state.overseerStatus?.goals ?? [];
  if (goals.length === 0) {
    state.overseerSelectedGoalId = null;
    state.overseerGoal = null;
    return;
  }
  const selected =
    state.overseerSelectedGoalId &&
    goals.some((goal) => goal.goalId === state.overseerSelectedGoalId)
      ? state.overseerSelectedGoalId
      : (goals[0]?.goalId ?? null);
  state.overseerSelectedGoalId = selected;
  if (selected) {
    await loadOverseerGoal(state, selected, { quiet: true });
  } else {
    state.overseerGoal = null;
  }
}

export async function tickOverseer(state: OverseerState, reason?: string) {
  if (!state.client || !state.connected) return;
  try {
    await state.client.request("overseer.tick", { reason });
    // Log tick in simulator
    state.simulator = SimulatorController.recordTick(state.simulator);
  } catch (err) {
    state.overseerError = String(err);
  }
}

export async function pauseOverseerGoal(state: OverseerState, goalId: string) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalActionPending) return;
  state.overseerGoalActionPending = true;
  state.overseerGoalActionError = null;
  try {
    await state.client.request("overseer.goal.pause", { goalId });
    await refreshOverseer(state, { quiet: true });
  } catch (err) {
    state.overseerGoalActionError = String(err);
  } finally {
    state.overseerGoalActionPending = false;
  }
}

export async function resumeOverseerGoal(state: OverseerState, goalId: string) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalActionPending) return;
  state.overseerGoalActionPending = true;
  state.overseerGoalActionError = null;
  try {
    await state.client.request("overseer.goal.resume", { goalId });
    await refreshOverseer(state, { quiet: true });
  } catch (err) {
    state.overseerGoalActionError = String(err);
  } finally {
    state.overseerGoalActionPending = false;
  }
}

export async function createOverseerGoal(
  state: OverseerState,
  params: {
    title: string;
    problemStatement: string;
    successCriteria?: string[];
    constraints?: string[];
    priority?: "low" | "normal" | "high" | "urgent";
    generatePlan?: boolean;
  },
) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalActionPending) return;
  state.overseerGoalActionPending = true;
  state.overseerGoalActionError = null;
  try {
    const result = (await state.client.request("overseer.goal.create", {
      title: params.title,
      problemStatement: params.problemStatement,
      successCriteria: params.successCriteria ?? [],
      constraints: params.constraints ?? [],
      priority: params.priority ?? "normal",
      generatePlan: params.generatePlan ?? true,
    })) as { goalId: string; planGenerated: boolean } | undefined;
    if (result?.goalId) {
      state.overseerSelectedGoalId = result.goalId;
    }
    state.overseerCreateGoalOpen = false;
    await refreshOverseer(state, { quiet: true });
    return result;
  } catch (err) {
    state.overseerGoalActionError = String(err);
  } finally {
    state.overseerGoalActionPending = false;
  }
}

export async function updateOverseerWorkNode(
  state: OverseerState,
  params: {
    goalId: string;
    workNodeId: string;
    status?: "done" | "blocked";
    blockedReason?: string;
    summary?: string;
  },
) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalActionPending) return;
  state.overseerGoalActionPending = true;
  state.overseerGoalActionError = null;
  try {
    await state.client.request("overseer.work.update", params);
    await refreshOverseer(state, { quiet: true });
  } catch (err) {
    state.overseerGoalActionError = String(err);
  } finally {
    state.overseerGoalActionPending = false;
  }
}

export async function retryOverseerAssignment(
  state: OverseerState,
  params: { goalId: string; workNodeId: string },
) {
  if (!state.client || !state.connected) return;
  if (state.overseerGoalActionPending) return;
  state.overseerGoalActionPending = true;
  state.overseerGoalActionError = null;
  try {
    // Reset the work node to queued status to trigger retry
    await state.client.request("overseer.work.update", {
      goalId: params.goalId,
      workNodeId: params.workNodeId,
      status: "queued",
    });
    // Trigger a tick to dispatch the retry
    await state.client.request("overseer.tick", { reason: "manual retry" });
    await refreshOverseer(state, { quiet: true });
  } catch (err) {
    state.overseerGoalActionError = String(err);
  } finally {
    state.overseerGoalActionPending = false;
  }
}

export function initOverseerState(): Pick<
  OverseerState,
  | "overseerGoalActionPending"
  | "overseerGoalActionError"
  | "overseerCreateGoalOpen"
  | "overseerCreateGoalForm"
  | "simulator"
> {
  return {
    overseerGoalActionPending: false,
    overseerGoalActionError: null,
    overseerCreateGoalOpen: false,
    overseerCreateGoalForm: {
      title: "",
      problemStatement: "",
      successCriteria: [],
      constraints: [],
      priority: "normal",
      generatePlan: true,
    },
    simulator: createInitialSimulatorState(),
  };
}

// ============================================================================
// Simulator State Management
// ============================================================================

export function initializeSimulator(state: OverseerState): void {
  state.simulator = createInitialSimulatorState();
}

export function toggleSimulatorPanel(state: OverseerState): void {
  state.simulator = SimulatorController.toggleSimulatorPanel(state.simulator);
}

export function setSimulatorSection(
  state: OverseerState,
  section: SimulatorState["activeSection"],
): void {
  state.simulator = SimulatorController.setSimulatorSection(state.simulator, section);
}

export function setSimulatorMode(state: OverseerState, mode: SimulatorState["mode"]): void {
  state.simulator = SimulatorController.setSimulatorMode(state.simulator, mode);
}

// Rule operations
export function addSimulatorRule(state: OverseerState, rule?: Partial<SimulatorRule>): void {
  state.simulator = SimulatorController.addRule(state.simulator, rule);
}

export function addSimulatorRuleFromTemplate(state: OverseerState, templateKey: string): void {
  state.simulator = SimulatorController.addRuleFromTemplate(
    state.simulator,
    templateKey as keyof typeof SimulatorController.RULE_TEMPLATES,
  );
}

export function updateSimulatorRule(
  state: OverseerState,
  ruleId: string,
  updates: Partial<SimulatorRule>,
): void {
  state.simulator = SimulatorController.updateRule(state.simulator, ruleId, updates);
}

export function deleteSimulatorRule(state: OverseerState, ruleId: string): void {
  state.simulator = SimulatorController.deleteRule(state.simulator, ruleId);
}

export function toggleSimulatorRuleEnabled(state: OverseerState, ruleId: string): void {
  state.simulator = SimulatorController.toggleRuleEnabled(state.simulator, ruleId);
}

export function selectSimulatorRule(state: OverseerState, ruleId: string | null): void {
  state.simulator = SimulatorController.selectRule(state.simulator, ruleId);
}

export function closeSimulatorRuleEditor(state: OverseerState): void {
  state.simulator = SimulatorController.closeRuleEditor(state.simulator);
}

export function saveSimulatorDraftRule(state: OverseerState): void {
  state.simulator = SimulatorController.saveDraftRule(state.simulator);
}

export function addSimulatorCondition(state: OverseerState): void {
  state.simulator = SimulatorController.addConditionToDraft(state.simulator);
}

export function updateSimulatorCondition(
  state: OverseerState,
  conditionId: string,
  updates: Partial<RuleCondition>,
): void {
  state.simulator = SimulatorController.updateConditionInDraft(
    state.simulator,
    conditionId,
    updates,
  );
}

export function deleteSimulatorCondition(state: OverseerState, conditionId: string): void {
  state.simulator = SimulatorController.deleteConditionFromDraft(state.simulator, conditionId);
}

export function addSimulatorAction(state: OverseerState): void {
  state.simulator = SimulatorController.addActionToDraft(state.simulator);
}

export function updateSimulatorAction(
  state: OverseerState,
  actionId: string,
  updates: Partial<RuleAction>,
): void {
  state.simulator = SimulatorController.updateActionInDraft(state.simulator, actionId, updates);
}

export function deleteSimulatorAction(state: OverseerState, actionId: string): void {
  state.simulator = SimulatorController.deleteActionFromDraft(state.simulator, actionId);
}

// Filter operations
export function updateSimulatorFilters(
  state: OverseerState,
  updates: Partial<SimulatorState["filters"]>,
): void {
  state.simulator = SimulatorController.updateFilters(state.simulator, updates);
}

export function clearSimulatorFilters(state: OverseerState): void {
  state.simulator = SimulatorController.clearFilters(state.simulator);
}

// Event operations
export function queueSimulatorEvent(
  state: OverseerState,
  event: {
    type: SimulatedEventType;
    goalId?: string;
    assignmentId?: string;
    data?: Record<string, unknown>;
    delay?: number;
  },
): void {
  state.simulator = SimulatorController.queueSimulatedEvent(state.simulator, event);
}

export function removeSimulatorQueuedEvent(state: OverseerState, eventId: string): void {
  state.simulator = SimulatorController.removeQueuedEvent(state.simulator, eventId);
}

export function clearSimulatorEventQueue(state: OverseerState): void {
  state.simulator = SimulatorController.clearEventQueue(state.simulator);
}

export async function executeSimulatorEvent(state: OverseerState, eventId: string): Promise<void> {
  const event = state.simulator.eventQueue.find((e) => e.id === eventId);
  if (!event) return;

  state.simulator = SimulatorController.updateEventStatus(state.simulator, eventId, "executing");

  const result = await SimulatorController.executeSimulatedEvent(state.client, event);

  state.simulator = SimulatorController.updateEventStatus(
    state.simulator,
    eventId,
    result.success ? "completed" : "failed",
    result.result,
    result.error,
  );

  // Refresh overseer status after event execution
  await refreshOverseer(state, { quiet: true });
}

// Scenario operations
export function addSimulatorScenario(
  state: OverseerState,
  scenario?: Partial<SimulatorScenario>,
): void {
  state.simulator = SimulatorController.addScenario(state.simulator, scenario);
}

export function addSimulatorScenarioFromTemplate(state: OverseerState, templateKey: string): void {
  state.simulator = SimulatorController.addScenarioFromTemplate(
    state.simulator,
    templateKey as keyof typeof SimulatorController.SCENARIO_TEMPLATES,
  );
}

export function updateSimulatorScenario(
  state: OverseerState,
  scenarioId: string,
  updates: Partial<SimulatorScenario>,
): void {
  state.simulator = SimulatorController.updateScenario(state.simulator, scenarioId, updates);
}

export function deleteSimulatorScenario(state: OverseerState, scenarioId: string): void {
  state.simulator = SimulatorController.deleteScenario(state.simulator, scenarioId);
}

export function selectSimulatorScenario(state: OverseerState, scenarioId: string | null): void {
  state.simulator = SimulatorController.selectScenario(state.simulator, scenarioId);
}

export function closeSimulatorScenarioEditor(state: OverseerState): void {
  state.simulator = SimulatorController.closeScenarioEditor(state.simulator);
}

export function saveSimulatorDraftScenario(state: OverseerState): void {
  state.simulator = SimulatorController.saveDraftScenario(state.simulator);
}

// Run operations
export function startSimulatorRun(state: OverseerState, scenarioId?: string): void {
  state.simulator = SimulatorController.startSimulationRun(state.simulator, scenarioId);
}

export function pauseSimulatorRun(state: OverseerState): void {
  state.simulator = SimulatorController.pauseSimulationRun(state.simulator);
}

export function resumeSimulatorRun(state: OverseerState): void {
  state.simulator = SimulatorController.resumeSimulationRun(state.simulator);
}

export function stopSimulatorRun(state: OverseerState): void {
  state.simulator = SimulatorController.stopSimulationRun(state.simulator);
}

export function resetSimulator(state: OverseerState): void {
  state.simulator = SimulatorController.resetSimulation(state.simulator);
}

// Activity operations
export function clearSimulatorActivityLog(state: OverseerState): void {
  state.simulator = SimulatorController.clearActivityLog(state.simulator);
}

// Settings operations
export function updateSimulatorSettings(
  state: OverseerState,
  updates: Partial<SimulatorState["settings"]>,
): void {
  state.simulator = SimulatorController.updateSettings(state.simulator, updates);
}

// Persistence
export async function loadSimulatorStateFromGateway(state: OverseerState): Promise<void> {
  const data = await SimulatorController.loadSimulatorState(state.client);
  if (data) {
    if (data.rules) {
      for (const rule of data.rules) {
        state.simulator = SimulatorController.addRule(state.simulator, rule);
      }
    }
    if (data.scenarios) {
      for (const scenario of data.scenarios) {
        state.simulator = SimulatorController.addScenario(state.simulator, scenario);
      }
    }
  }
}

export async function saveSimulatorStateToGateway(state: OverseerState): Promise<boolean> {
  return SimulatorController.saveSimulatorState(state.client, {
    rules: state.simulator.rules,
    scenarios: state.simulator.scenarios,
  });
}
