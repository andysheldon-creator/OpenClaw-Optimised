/**
 * Overseer Simulator View
 *
 * A comprehensive UI for testing and demoing the Overseer/continuation hook framework.
 * Features:
 * - Rule configuration with conditions and actions
 * - Filters for goals, assignments, and events
 * - Event simulation with queue management
 * - Scenario management for repeatable tests
 * - Real-time activity log
 */

import { html, nothing, type TemplateResult } from "lit";
import type { OverseerStatusResult } from "../types/overseer";
import { clampText, formatAgo, formatDurationMs } from "../format";
import { icon, type IconName } from "../icons";
import {
  RULE_TEMPLATES,
  SCENARIO_TEMPLATES,
  type SimulatorState,
  type SimulatorRule,
  type SimulatorScenario,
  type RuleCondition,
  type RuleAction,
  type RuleConditionField,
  type RuleOperator,
  type RuleActionType,
  type QueuedSimulatedEvent,
  type SimulatedEventType,
  type SimulatorActivityEntry,
} from "../types/overseer-simulator";

// ============================================================================
// Types
// ============================================================================

export type SimulatorProps = {
  state: SimulatorState;
  overseerStatus: OverseerStatusResult | null;
  connected: boolean;
  // State updates
  onTogglePanel: () => void;
  onSectionChange: (section: SimulatorState["activeSection"]) => void;
  onModeChange: (mode: SimulatorState["mode"]) => void;
  // Rule operations
  onAddRule: () => void;
  onAddRuleFromTemplate: (templateKey: string) => void;
  onSelectRule: (ruleId: string | null) => void;
  onUpdateRule: (ruleId: string, updates: Partial<SimulatorRule>) => void;
  onDeleteRule: (ruleId: string) => void;
  onToggleRuleEnabled: (ruleId: string) => void;
  onSaveDraftRule: () => void;
  onCloseDraftRule: () => void;
  onAddCondition: () => void;
  onUpdateCondition: (conditionId: string, updates: Partial<RuleCondition>) => void;
  onDeleteCondition: (conditionId: string) => void;
  onAddAction: () => void;
  onUpdateAction: (actionId: string, updates: Partial<RuleAction>) => void;
  onDeleteAction: (actionId: string) => void;
  // Filter operations
  onUpdateFilters: (updates: Partial<SimulatorState["filters"]>) => void;
  onClearFilters: () => void;
  // Event operations
  onQueueEvent: (event: {
    type: SimulatedEventType;
    goalId?: string;
    assignmentId?: string;
    data?: Record<string, unknown>;
    delay?: number;
  }) => void;
  onRemoveQueuedEvent: (eventId: string) => void;
  onClearEventQueue: () => void;
  onExecuteEvent: (eventId: string) => void;
  // Scenario operations
  onAddScenario: () => void;
  onAddScenarioFromTemplate: (templateKey: string) => void;
  onSelectScenario: (scenarioId: string | null) => void;
  onUpdateScenario: (scenarioId: string, updates: Partial<SimulatorScenario>) => void;
  onDeleteScenario: (scenarioId: string) => void;
  onSaveDraftScenario: () => void;
  onCloseDraftScenario: () => void;
  // Run operations
  onStartRun: (scenarioId?: string) => void;
  onPauseRun: () => void;
  onResumeRun: () => void;
  onStopRun: () => void;
  onResetRun: () => void;
  onTriggerTick: () => void;
  // Activity operations
  onClearActivityLog: () => void;
  // Settings operations
  onUpdateSettings: (updates: Partial<SimulatorState["settings"]>) => void;
};

// ============================================================================
// Constants
// ============================================================================

const CONDITION_FIELDS: Array<{ value: RuleConditionField; label: string; group: string }> = [
  { value: "goal.status", label: "Goal Status", group: "Goal" },
  { value: "goal.priority", label: "Goal Priority", group: "Goal" },
  { value: "goal.title", label: "Goal Title", group: "Goal" },
  { value: "goal.tags", label: "Goal Tags", group: "Goal" },
  { value: "assignment.status", label: "Assignment Status", group: "Assignment" },
  { value: "assignment.agentId", label: "Agent ID", group: "Assignment" },
  { value: "assignment.retryCount", label: "Retry Count", group: "Assignment" },
  { value: "assignment.backoffUntil", label: "Backoff Until", group: "Assignment" },
  { value: "event.type", label: "Event Type", group: "Event" },
  { value: "event.goalId", label: "Event Goal ID", group: "Event" },
  { value: "event.assignmentId", label: "Event Assignment ID", group: "Event" },
  { value: "continuation.level", label: "Completion Level", group: "Continuation" },
  { value: "continuation.hasToolError", label: "Has Tool Error", group: "Continuation" },
  { value: "continuation.isSilent", label: "Is Silent", group: "Continuation" },
];

const OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "greater_than", label: ">" },
  { value: "less_than", label: "<" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "matches_regex", label: "matches regex" },
];

const ACTION_TYPES: Array<{ value: RuleActionType; label: string; description: string }> = [
  { value: "log", label: "Log Message", description: "Write to activity log" },
  { value: "notify", label: "Send Notification", description: "Send a notification" },
  { value: "set_status", label: "Set Status", description: "Change assignment status" },
  {
    value: "set_recovery_policy",
    label: "Set Recovery Policy",
    description: "Change recovery policy",
  },
  { value: "trigger_tick", label: "Trigger Tick", description: "Trigger Overseer tick" },
  { value: "pause_goal", label: "Pause Goal", description: "Pause the goal" },
  { value: "resume_goal", label: "Resume Goal", description: "Resume the goal" },
  { value: "escalate", label: "Escalate", description: "Escalate to human" },
  { value: "inject_event", label: "Inject Event", description: "Inject a simulated event" },
  { value: "modify_backoff", label: "Modify Backoff", description: "Adjust backoff timing" },
  { value: "custom_hook", label: "Custom Hook", description: "Execute custom hook" },
];

const EVENT_TYPES: Array<{ value: SimulatedEventType; label: string; description: string }> = [
  { value: "turn_completion", label: "Turn Completion", description: "Agent completed a turn" },
  { value: "run_completion", label: "Run Completion", description: "Agent run completed" },
  { value: "queue_completion", label: "Queue Completion", description: "Queue drained" },
  { value: "tool_error", label: "Tool Error", description: "Tool execution failed" },
  {
    value: "silent_completion",
    label: "Silent Completion",
    description: "Agent completed without output",
  },
  {
    value: "structured_update",
    label: "Structured Update",
    description: "Progress update from agent",
  },
  {
    value: "assignment_stalled",
    label: "Assignment Stalled",
    description: "Assignment became stalled",
  },
  {
    value: "assignment_active",
    label: "Assignment Active",
    description: "Assignment became active",
  },
  { value: "goal_created", label: "Goal Created", description: "New goal was created" },
  { value: "goal_completed", label: "Goal Completed", description: "Goal was completed" },
  { value: "tick_triggered", label: "Tick Triggered", description: "Manual tick trigger" },
];

const SECTION_CONFIG: Array<{
  id: SimulatorState["activeSection"];
  label: string;
  icon: IconName;
  description: string;
}> = [
  { id: "rules", label: "Rules", icon: "filter", description: "Configure automation rules" },
  { id: "filters", label: "Filters", icon: "search", description: "Filter displayed data" },
  { id: "events", label: "Events", icon: "zap", description: "Simulate events" },
  { id: "scenarios", label: "Scenarios", icon: "list", description: "Manage test scenarios" },
  { id: "activity", label: "Activity", icon: "activity", description: "View activity log" },
];

// ============================================================================
// Main Render Function
// ============================================================================

export function renderSimulator(props: SimulatorProps): TemplateResult | typeof nothing {
  if (!props.state.isOpen) {
    return renderSimulatorToggle(props);
  }

  return html`
    <div class="simulator">
      ${renderSimulatorHeader(props)}
      <div class="simulator__body">
        ${renderSimulatorSidebar(props)}
        <div class="simulator__content">
          ${renderSimulatorSection(props)}
        </div>
      </div>
      ${props.state.ruleEditorOpen ? renderRuleEditor(props) : nothing}
      ${props.state.scenarioEditorOpen ? renderScenarioEditor(props) : nothing}
    </div>
  `;
}

// ============================================================================
// Toggle Button (when panel is closed)
// ============================================================================

function renderSimulatorToggle(props: SimulatorProps): TemplateResult {
  return html`
    <button
      class="simulator-toggle"
      @click=${props.onTogglePanel}
      title="Open Overseer Simulator"
    >
      ${icon("sparkles", { size: 18 })}
      <span>Simulator</span>
    </button>
  `;
}

// ============================================================================
// Header
// ============================================================================

function renderSimulatorHeader(props: SimulatorProps): TemplateResult {
  const { state } = props;
  const isRunning = state.run?.status === "running";
  const isPaused = state.run?.status === "paused";

  return html`
    <div class="simulator__header">
      <div class="simulator__header-left">
        <div class="simulator__header-icon">
          ${icon("sparkles", { size: 20 })}
        </div>
        <div class="simulator__header-info">
          <h3 class="simulator__title">Overseer Simulator</h3>
          <p class="simulator__subtitle">Test continuation hooks and rules</p>
        </div>
      </div>
      <div class="simulator__header-center">
        <div class="simulator__mode-selector">
          ${(["sandbox", "live", "replay"] as const).map(
            (mode) => html`
              <button
                type="button"
                class="simulator__mode-btn ${state.mode === mode ? "simulator__mode-btn--active" : ""}"
                @click=${() => props.onModeChange(mode)}
                ?disabled=${isRunning}
              >
                ${mode === "sandbox" ? icon("box", { size: 14 }) : mode === "live" ? icon("radio", { size: 14 }) : icon("play", { size: 14 })}
                <span>${mode}</span>
              </button>
            `,
          )}
        </div>
        <div class="simulator__run-controls">
          ${
            isRunning
              ? html`
                <button class="btn btn--sm" @click=${props.onPauseRun}>
                  ${icon("pause", { size: 14 })} Pause
                </button>
                <button class="btn btn--sm danger" @click=${props.onStopRun}>
                  ${icon("square", { size: 14 })} Stop
                </button>
              `
              : isPaused
                ? html`
                  <button class="btn btn--sm primary" @click=${props.onResumeRun}>
                    ${icon("play", { size: 14 })} Resume
                  </button>
                  <button class="btn btn--sm danger" @click=${props.onStopRun}>
                    ${icon("square", { size: 14 })} Stop
                  </button>
                `
                : html`
                  <button class="btn btn--sm primary" @click=${() => props.onStartRun()}>
                    ${icon("play", { size: 14 })} Start
                  </button>
                `
          }
          <button class="btn btn--sm" @click=${props.onTriggerTick} title="Trigger Overseer Tick">
            ${icon("refresh-cw", { size: 14 })} Tick
          </button>
          ${
            state.run
              ? html`
                <button class="btn btn--sm" @click=${props.onResetRun} title="Reset Simulation">
                  ${icon("rotate-ccw", { size: 14 })}
                </button>
              `
              : nothing
          }
        </div>
      </div>
      <div class="simulator__header-right">
        ${
          state.run
            ? html`
              <div class="simulator__run-status">
                <span class="simulator__run-status-badge simulator__run-status-badge--${state.run.status}">
                  ${state.run.status}
                </span>
                <span class="simulator__run-stats">
                  ${state.run.tickCount} ticks | ${state.run.executedEvents.length} events | ${state.run.triggeredRules.length} rules
                </span>
              </div>
            `
            : html`
              <div class="simulator__connection-status ${props.connected ? "simulator__connection-status--connected" : ""}">
                ${icon(props.connected ? "check-circle" : "alert-circle", { size: 14 })}
                <span>${props.connected ? "Connected" : "Disconnected"}</span>
              </div>
            `
        }
        <button
          class="simulator__close"
          @click=${props.onTogglePanel}
          title="Close Simulator"
        >
          ${icon("x", { size: 18 })}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Sidebar
// ============================================================================

function renderSimulatorSidebar(props: SimulatorProps): TemplateResult {
  const { state } = props;

  return html`
    <div class="simulator__sidebar">
      <nav class="simulator__nav">
        ${SECTION_CONFIG.map(
          (section) => html`
            <button
              type="button"
              class="simulator__nav-item ${state.activeSection === section.id ? "simulator__nav-item--active" : ""}"
              @click=${() => props.onSectionChange(section.id)}
              title=${section.description}
            >
              <span class="simulator__nav-icon">${icon(section.icon, { size: 16 })}</span>
              <span class="simulator__nav-label">${section.label}</span>
              ${
                section.id === "rules" && state.rules.length > 0
                  ? html`<span class="simulator__nav-badge">${state.rules.length}</span>`
                  : nothing
              }
              ${
                section.id === "events" && state.eventQueue.length > 0
                  ? html`<span class="simulator__nav-badge">${state.eventQueue.length}</span>`
                  : nothing
              }
            </button>
          `,
        )}
      </nav>
      <div class="simulator__sidebar-footer">
        <div class="simulator__settings-toggle">
          <label class="toggle-field toggle-field--sm">
            <input
              type="checkbox"
              ?checked=${state.settings.autoTick}
              @change=${(e: Event) =>
                props.onUpdateSettings({ autoTick: (e.target as HTMLInputElement).checked })}
            />
            <span>Auto-tick</span>
          </label>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Section Content
// ============================================================================

function renderSimulatorSection(props: SimulatorProps): TemplateResult {
  switch (props.state.activeSection) {
    case "rules":
      return renderRulesSection(props);
    case "filters":
      return renderFiltersSection(props);
    case "events":
      return renderEventsSection(props);
    case "scenarios":
      return renderScenariosSection(props);
    case "activity":
      return renderActivitySection(props);
    default:
      return html`
        <div class="simulator__section-empty">Select a section</div>
      `;
  }
}

// ============================================================================
// Rules Section
// ============================================================================

function renderRulesSection(props: SimulatorProps): TemplateResult {
  const { state } = props;

  return html`
    <div class="simulator__section">
      <div class="simulator__section-header">
        <div>
          <h4 class="simulator__section-title">Automation Rules</h4>
          <p class="simulator__section-desc">
            Define conditions and actions to automate Overseer behavior
          </p>
        </div>
        <div class="simulator__section-actions">
          <div class="dropdown">
            <button class="btn btn--sm">
              ${icon("plus", { size: 14 })} Add from Template
            </button>
            <div class="dropdown__menu">
              ${Object.entries(RULE_TEMPLATES).map(
                ([key, template]) => html`
                  <button
                    type="button"
                    class="dropdown__item"
                    @click=${() => props.onAddRuleFromTemplate(key)}
                  >
                    <span>${template.name}</span>
                    <span class="muted">${template.description}</span>
                  </button>
                `,
              )}
            </div>
          </div>
          <button class="btn btn--sm primary" @click=${props.onAddRule}>
            ${icon("plus", { size: 14 })} New Rule
          </button>
        </div>
      </div>
      <div class="simulator__section-body">
        ${
          state.rules.length === 0
            ? html`
              <div class="simulator__empty-state">
                <div class="simulator__empty-icon">${icon("filter", { size: 32 })}</div>
                <div class="simulator__empty-title">No rules defined</div>
                <div class="simulator__empty-desc">
                  Add rules to automate Overseer behavior based on events and conditions
                </div>
              </div>
            `
            : html`
              <div class="simulator__rules-list">
                ${state.rules.map((rule) => renderRuleCard(rule, props))}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderRuleCard(rule: SimulatorRule, props: SimulatorProps): TemplateResult {
  return html`
    <div class="simulator__rule-card ${!rule.enabled ? "simulator__rule-card--disabled" : ""}">
      <div class="simulator__rule-header">
        <div class="simulator__rule-info">
          <label class="toggle-inline">
            <input
              type="checkbox"
              ?checked=${rule.enabled}
              @change=${() => props.onToggleRuleEnabled(rule.id)}
            />
          </label>
          <div>
            <div class="simulator__rule-name">${rule.name}</div>
            <div class="simulator__rule-desc">${rule.description || "No description"}</div>
          </div>
        </div>
        <div class="simulator__rule-actions">
          <span class="simulator__rule-priority">P${rule.priority}</span>
          ${
            rule.triggerCount > 0
              ? html`<span class="simulator__rule-trigger-count">${rule.triggerCount}x</span>`
              : nothing
          }
          <button
            class="btn btn--sm btn--icon"
            @click=${() => props.onSelectRule(rule.id)}
            title="Edit rule"
          >
            ${icon("edit-2", { size: 14 })}
          </button>
          <button
            class="btn btn--sm btn--icon danger"
            @click=${() => props.onDeleteRule(rule.id)}
            title="Delete rule"
          >
            ${icon("trash-2", { size: 14 })}
          </button>
        </div>
      </div>
      <div class="simulator__rule-body">
        <div class="simulator__rule-conditions">
          <span class="simulator__rule-label">If</span>
          <span class="simulator__rule-logic">${rule.logic.toUpperCase()}</span>
          ${
            rule.conditions.length === 0
              ? html`
                  <span class="muted">No conditions</span>
                `
              : rule.conditions.map(
                  (c, i) => html`
                  <span class="simulator__rule-condition">
                    ${i > 0 ? html`<span class="simulator__rule-logic-sep">${rule.logic}</span>` : nothing}
                    ${c.field} ${OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator} "${c.value}"
                  </span>
                `,
                )
          }
        </div>
        <div class="simulator__rule-actions-list">
          <span class="simulator__rule-label">Then</span>
          ${
            rule.actions.length === 0
              ? html`
                  <span class="muted">No actions</span>
                `
              : rule.actions.map(
                  (a) => html`
                  <span class="simulator__rule-action">
                    ${ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                  </span>
                `,
                )
          }
        </div>
      </div>
      ${
        rule.tags.length > 0
          ? html`
            <div class="simulator__rule-tags">
              ${rule.tags.map((tag) => html`<span class="tag">${tag}</span>`)}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ============================================================================
// Filters Section
// ============================================================================

function renderFiltersSection(props: SimulatorProps): TemplateResult {
  const { state, overseerStatus } = props;
  const goals = overseerStatus?.goals ?? [];
  const stalledAssignments = overseerStatus?.stalledAssignments ?? [];

  return html`
    <div class="simulator__section">
      <div class="simulator__section-header">
        <div>
          <h4 class="simulator__section-title">Filters</h4>
          <p class="simulator__section-desc">Filter goals, assignments, and events</p>
        </div>
        <button class="btn btn--sm" @click=${props.onClearFilters}>
          ${icon("x", { size: 14 })} Clear All
        </button>
      </div>
      <div class="simulator__section-body">
        <div class="simulator__filters-grid">
          <!-- Goal Filters -->
          <div class="simulator__filter-group">
            <div class="simulator__filter-group-header">
              ${icon("target", { size: 16 })}
              <span>Goals</span>
              <span class="badge badge--muted">${goals.length}</span>
            </div>
            <div class="simulator__filter-fields">
              <label class="field">
                <span class="field__label">Status</span>
                <select
                  .value=${state.filters.goals.status?.join(",") ?? ""}
                  @change=${(e: Event) => {
                    const value = (e.target as HTMLSelectElement).value;
                    props.onUpdateFilters({
                      goals: {
                        ...state.filters.goals,
                        status: value ? value.split(",") : undefined,
                      },
                    });
                  }}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label class="field">
                <span class="field__label">Priority</span>
                <select
                  .value=${state.filters.goals.priority?.join(",") ?? ""}
                  @change=${(e: Event) => {
                    const value = (e.target as HTMLSelectElement).value;
                    props.onUpdateFilters({
                      goals: {
                        ...state.filters.goals,
                        priority: value ? value.split(",") : undefined,
                      },
                    });
                  }}
                >
                  <option value="">All</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label class="field">
                <span class="field__label">Search</span>
                <input
                  type="text"
                  placeholder="Search goals..."
                  .value=${state.filters.goals.searchText ?? ""}
                  @input=${(e: Event) =>
                    props.onUpdateFilters({
                      goals: {
                        ...state.filters.goals,
                        searchText: (e.target as HTMLInputElement).value || undefined,
                      },
                    })}
                />
              </label>
            </div>
          </div>

          <!-- Assignment Filters -->
          <div class="simulator__filter-group">
            <div class="simulator__filter-group-header">
              ${icon("users", { size: 16 })}
              <span>Assignments</span>
              <span class="badge ${stalledAssignments.length > 0 ? "badge--warn" : "badge--muted"}">
                ${stalledAssignments.length} stalled
              </span>
            </div>
            <div class="simulator__filter-fields">
              <label class="field">
                <span class="field__label">Status</span>
                <select
                  .value=${state.filters.assignments.status?.join(",") ?? ""}
                  @change=${(e: Event) => {
                    const value = (e.target as HTMLSelectElement).value;
                    props.onUpdateFilters({
                      assignments: {
                        ...state.filters.assignments,
                        status: value ? value.split(",") : undefined,
                      },
                    });
                  }}
                >
                  <option value="">All</option>
                  <option value="queued">Queued</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="active">Active</option>
                  <option value="stalled">Stalled</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </label>
              <label class="toggle-field">
                <input
                  type="checkbox"
                  ?checked=${state.filters.assignments.isStalled}
                  @change=${(e: Event) =>
                    props.onUpdateFilters({
                      assignments: {
                        ...state.filters.assignments,
                        isStalled: (e.target as HTMLInputElement).checked || undefined,
                      },
                    })}
                />
                <span>Stalled only</span>
              </label>
              <label class="toggle-field">
                <input
                  type="checkbox"
                  ?checked=${state.filters.assignments.hasBackoff}
                  @change=${(e: Event) =>
                    props.onUpdateFilters({
                      assignments: {
                        ...state.filters.assignments,
                        hasBackoff: (e.target as HTMLInputElement).checked || undefined,
                      },
                    })}
                />
                <span>In backoff</span>
              </label>
            </div>
          </div>

          <!-- Event Filters -->
          <div class="simulator__filter-group">
            <div class="simulator__filter-group-header">
              ${icon("activity", { size: 16 })}
              <span>Events</span>
            </div>
            <div class="simulator__filter-fields">
              <label class="field">
                <span class="field__label">Event Types</span>
                <select
                  multiple
                  .value=${state.filters.events.types ?? []}
                  @change=${(e: Event) => {
                    const select = e.target as HTMLSelectElement;
                    const values = Array.from(select.selectedOptions).map((o) => o.value);
                    props.onUpdateFilters({
                      events: {
                        ...state.filters.events,
                        types: values.length > 0 ? values : undefined,
                      },
                    });
                  }}
                >
                  ${EVENT_TYPES.map(
                    (type) => html`<option value=${type.value}>${type.label}</option>`,
                  )}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Goal ID</span>
                <input
                  type="text"
                  placeholder="Filter by goal..."
                  .value=${state.filters.events.goalId ?? ""}
                  @input=${(e: Event) =>
                    props.onUpdateFilters({
                      events: {
                        ...state.filters.events,
                        goalId: (e.target as HTMLInputElement).value || undefined,
                      },
                    })}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Events Section
// ============================================================================

function renderEventsSection(props: SimulatorProps): TemplateResult {
  const { state, overseerStatus } = props;
  const goals = overseerStatus?.goals ?? [];

  return html`
    <div class="simulator__section">
      <div class="simulator__section-header">
        <div>
          <h4 class="simulator__section-title">Event Simulation</h4>
          <p class="simulator__section-desc">Queue and execute simulated events</p>
        </div>
        ${
          state.eventQueue.length > 0
            ? html`
              <button class="btn btn--sm danger" @click=${props.onClearEventQueue}>
                ${icon("trash-2", { size: 14 })} Clear Queue
              </button>
            `
            : nothing
        }
      </div>
      <div class="simulator__section-body">
        <div class="simulator__events-layout">
          <!-- Event Creator -->
          <div class="simulator__event-creator">
            <div class="simulator__event-creator-header">
              ${icon("plus-circle", { size: 16 })}
              <span>Add Event</span>
            </div>
            <form
              class="simulator__event-form"
              @submit=${(e: SubmitEvent) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const formData = new FormData(form);
                props.onQueueEvent({
                  type: formData.get("type") as SimulatedEventType,
                  goalId: (formData.get("goalId") as string) || undefined,
                  delay: Number(formData.get("delay")) || undefined,
                  data: {},
                });
                form.reset();
              }}
            >
              <label class="field">
                <span class="field__label">Event Type</span>
                <select name="type" required>
                  ${EVENT_TYPES.map(
                    (type) => html`
                      <option value=${type.value}>${type.label}</option>
                    `,
                  )}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Target Goal</span>
                <select name="goalId">
                  <option value="">None</option>
                  ${goals.map(
                    (goal) => html`
                      <option value=${goal.goalId}>${goal.title}</option>
                    `,
                  )}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Delay (ms)</span>
                <input type="number" name="delay" placeholder="0" min="0" step="100" />
              </label>
              <button type="submit" class="btn btn--sm primary">
                ${icon("plus", { size: 14 })} Queue Event
              </button>
            </form>
            <div class="simulator__event-templates">
              <div class="simulator__event-templates-header">Quick Actions</div>
              <div class="simulator__event-templates-grid">
                <button
                  class="btn btn--sm"
                  @click=${() => props.onQueueEvent({ type: "tick_triggered" })}
                >
                  ${icon("refresh-cw", { size: 14 })} Tick
                </button>
                <button
                  class="btn btn--sm"
                  @click=${() => props.onQueueEvent({ type: "tool_error", data: { toolName: "test", error: "simulated" } })}
                >
                  ${icon("alert-triangle", { size: 14 })} Tool Error
                </button>
                <button
                  class="btn btn--sm"
                  @click=${() => props.onQueueEvent({ type: "silent_completion" })}
                >
                  ${icon("message-square", { size: 14 })} Silent
                </button>
                <button
                  class="btn btn--sm"
                  @click=${() => props.onQueueEvent({ type: "assignment_stalled" })}
                >
                  ${icon("pause", { size: 14 })} Stall
                </button>
              </div>
            </div>
          </div>

          <!-- Event Queue -->
          <div class="simulator__event-queue">
            <div class="simulator__event-queue-header">
              ${icon("list", { size: 16 })}
              <span>Event Queue</span>
              <span class="badge badge--muted">${state.eventQueue.length}</span>
            </div>
            ${
              state.eventQueue.length === 0
                ? html`
                  <div class="simulator__empty-state simulator__empty-state--sm">
                    <div class="simulator__empty-icon">${icon("inbox", { size: 24 })}</div>
                    <div class="simulator__empty-title">Queue is empty</div>
                    <div class="simulator__empty-desc">Add events to simulate</div>
                  </div>
                `
                : html`
                  <div class="simulator__event-list">
                    ${state.eventQueue.map((event) => renderQueuedEvent(event, props))}
                  </div>
                `
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderQueuedEvent(event: QueuedSimulatedEvent, props: SimulatorProps): TemplateResult {
  const eventType = EVENT_TYPES.find((t) => t.value === event.type);
  const statusIcons: Record<string, IconName> = {
    pending: "clock",
    executing: "loader",
    completed: "check-circle",
    failed: "alert-circle",
  };

  return html`
    <div class="simulator__event-item simulator__event-item--${event.status}">
      <div class="simulator__event-icon">
        ${icon(statusIcons[event.status] ?? "circle", { size: 14 })}
      </div>
      <div class="simulator__event-info">
        <div class="simulator__event-type">${eventType?.label ?? event.type}</div>
        <div class="simulator__event-meta">
          ${event.goalId ? html`<span>Goal: ${event.goalId.slice(0, 8)}...</span>` : nothing}
          ${event.delay ? html`<span>Delay: ${event.delay}ms</span>` : nothing}
          ${event.result ? html`<span class="success">${event.result}</span>` : nothing}
          ${event.error ? html`<span class="danger">${event.error}</span>` : nothing}
        </div>
      </div>
      <div class="simulator__event-actions">
        ${
          event.status === "pending"
            ? html`
              <button
                class="btn btn--sm btn--icon"
                @click=${() => props.onExecuteEvent(event.id)}
                title="Execute now"
              >
                ${icon("play", { size: 14 })}
              </button>
            `
            : nothing
        }
        <button
          class="btn btn--sm btn--icon danger"
          @click=${() => props.onRemoveQueuedEvent(event.id)}
          title="Remove"
        >
          ${icon("x", { size: 14 })}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Scenarios Section
// ============================================================================

function renderScenariosSection(props: SimulatorProps): TemplateResult {
  const { state } = props;

  return html`
    <div class="simulator__section">
      <div class="simulator__section-header">
        <div>
          <h4 class="simulator__section-title">Test Scenarios</h4>
          <p class="simulator__section-desc">Create and run repeatable test scenarios</p>
        </div>
        <div class="simulator__section-actions">
          <div class="dropdown">
            <button class="btn btn--sm">
              ${icon("plus", { size: 14 })} From Template
            </button>
            <div class="dropdown__menu">
              ${Object.entries(SCENARIO_TEMPLATES).map(
                ([key, template]) => html`
                  <button
                    type="button"
                    class="dropdown__item"
                    @click=${() => props.onAddScenarioFromTemplate(key)}
                  >
                    <span>${template.name}</span>
                    <span class="muted">${template.description}</span>
                  </button>
                `,
              )}
            </div>
          </div>
          <button class="btn btn--sm primary" @click=${props.onAddScenario}>
            ${icon("plus", { size: 14 })} New Scenario
          </button>
        </div>
      </div>
      <div class="simulator__section-body">
        ${
          state.scenarios.length === 0
            ? html`
              <div class="simulator__empty-state">
                <div class="simulator__empty-icon">${icon("list", { size: 32 })}</div>
                <div class="simulator__empty-title">No scenarios</div>
                <div class="simulator__empty-desc">
                  Create scenarios to run repeatable test sequences
                </div>
              </div>
            `
            : html`
              <div class="simulator__scenarios-grid">
                ${state.scenarios.map((scenario) => renderScenarioCard(scenario, props))}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderScenarioCard(scenario: SimulatorScenario, props: SimulatorProps): TemplateResult {
  return html`
    <div class="simulator__scenario-card">
      <div class="simulator__scenario-header">
        <div class="simulator__scenario-info">
          <div class="simulator__scenario-name">${scenario.name}</div>
          <div class="simulator__scenario-desc">${scenario.description || "No description"}</div>
        </div>
        <div class="simulator__scenario-actions">
          <button
            class="btn btn--sm btn--icon primary"
            @click=${() => props.onStartRun(scenario.id)}
            title="Run scenario"
          >
            ${icon("play", { size: 14 })}
          </button>
          <button
            class="btn btn--sm btn--icon"
            @click=${() => props.onSelectScenario(scenario.id)}
            title="Edit scenario"
          >
            ${icon("edit-2", { size: 14 })}
          </button>
          <button
            class="btn btn--sm btn--icon danger"
            @click=${() => props.onDeleteScenario(scenario.id)}
            title="Delete scenario"
          >
            ${icon("trash-2", { size: 14 })}
          </button>
        </div>
      </div>
      <div class="simulator__scenario-body">
        <div class="simulator__scenario-stats">
          <span>${scenario.events.length} events</span>
          <span>${scenario.rules.length} rules</span>
        </div>
        ${
          scenario.tags.length > 0
            ? html`
              <div class="simulator__scenario-tags">
                ${scenario.tags.map((tag) => html`<span class="tag tag--sm">${tag}</span>`)}
              </div>
            `
            : nothing
        }
      </div>
      <div class="simulator__scenario-footer">
        <span class="muted">Updated ${formatAgo(scenario.updatedAt)}</span>
      </div>
    </div>
  `;
}

// ============================================================================
// Activity Section
// ============================================================================

function renderActivitySection(props: SimulatorProps): TemplateResult {
  const { state } = props;

  return html`
    <div class="simulator__section">
      <div class="simulator__section-header">
        <div>
          <h4 class="simulator__section-title">Activity Log</h4>
          <p class="simulator__section-desc">Real-time simulation activity</p>
        </div>
        <button class="btn btn--sm" @click=${props.onClearActivityLog}>
          ${icon("trash-2", { size: 14 })} Clear
        </button>
      </div>
      <div class="simulator__section-body">
        ${
          state.activityLog.length === 0
            ? html`
              <div class="simulator__empty-state">
                <div class="simulator__empty-icon">${icon("activity", { size: 32 })}</div>
                <div class="simulator__empty-title">No activity</div>
                <div class="simulator__empty-desc">
                  Activity will appear here when you run simulations
                </div>
              </div>
            `
            : html`
              <div class="simulator__activity-list">
                ${state.activityLog.map((entry) => renderActivityEntry(entry))}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderActivityEntry(entry: SimulatorActivityEntry): TemplateResult {
  const icons: Record<SimulatorActivityEntry["type"], IconName> = {
    event: "zap",
    rule: "filter",
    action: "play",
    tick: "refresh-cw",
    error: "alert-circle",
    info: "info",
  };

  return html`
    <div class="simulator__activity-item simulator__activity-item--${entry.severity}">
      <div class="simulator__activity-icon simulator__activity-icon--${entry.type}">
        ${icon(icons[entry.type] ?? "circle", { size: 14 })}
      </div>
      <div class="simulator__activity-content">
        <div class="simulator__activity-header">
          <span class="simulator__activity-title">${entry.title}</span>
          <span class="simulator__activity-time">${formatAgo(entry.timestamp)}</span>
        </div>
        <div class="simulator__activity-desc">${entry.description}</div>
        ${
          entry.goalId || entry.assignmentId || entry.ruleId
            ? html`
              <div class="simulator__activity-refs">
                ${entry.goalId ? html`<span class="tag tag--sm">Goal: ${entry.goalId.slice(0, 8)}...</span>` : nothing}
                ${entry.assignmentId ? html`<span class="tag tag--sm">Assignment: ${entry.assignmentId.slice(0, 8)}...</span>` : nothing}
                ${entry.ruleId ? html`<span class="tag tag--sm">Rule: ${entry.ruleId.slice(0, 8)}...</span>` : nothing}
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ============================================================================
// Rule Editor Modal
// ============================================================================

function renderRuleEditor(props: SimulatorProps): TemplateResult | typeof nothing {
  const { state } = props;
  const rule = state.draftRule;
  if (!rule) return nothing;

  return html`
    <div class="simulator__modal-backdrop" @click=${props.onCloseDraftRule}></div>
    <div class="simulator__modal simulator__modal--lg">
      <div class="simulator__modal-header">
        <h3>${state.selectedRuleId ? "Edit Rule" : "New Rule"}</h3>
        <button class="btn btn--icon" @click=${props.onCloseDraftRule}>
          ${icon("x", { size: 18 })}
        </button>
      </div>
      <div class="simulator__modal-body">
        <div class="simulator__rule-editor">
          <!-- Basic Info -->
          <div class="simulator__editor-section">
            <label class="field">
              <span class="field__label">Name</span>
              <input
                type="text"
                .value=${rule.name}
                @input=${(e: Event) =>
                  props.onUpdateRule(rule.id, { name: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label class="field">
              <span class="field__label">Description</span>
              <textarea
                .value=${rule.description}
                @input=${(e: Event) =>
                  props.onUpdateRule(rule.id, {
                    description: (e.target as HTMLTextAreaElement).value,
                  })}
              ></textarea>
            </label>
            <div class="field-row">
              <label class="field">
                <span class="field__label">Priority</span>
                <input
                  type="number"
                  .value=${String(rule.priority)}
                  min="0"
                  max="100"
                  @input=${(e: Event) =>
                    props.onUpdateRule(rule.id, {
                      priority: Number((e.target as HTMLInputElement).value),
                    })}
                />
              </label>
              <label class="field">
                <span class="field__label">Logic</span>
                <select
                  .value=${rule.logic}
                  @change=${(e: Event) =>
                    props.onUpdateRule(rule.id, {
                      logic: (e.target as HTMLSelectElement).value as "and" | "or",
                    })}
                >
                  <option value="and">AND (all conditions)</option>
                  <option value="or">OR (any condition)</option>
                </select>
              </label>
              <label class="toggle-field">
                <input
                  type="checkbox"
                  ?checked=${rule.enabled}
                  @change=${(e: Event) =>
                    props.onUpdateRule(rule.id, {
                      enabled: (e.target as HTMLInputElement).checked,
                    })}
                />
                <span>Enabled</span>
              </label>
            </div>
          </div>

          <!-- Conditions -->
          <div class="simulator__editor-section">
            <div class="simulator__editor-section-header">
              <h4>Conditions</h4>
              <button class="btn btn--sm" @click=${props.onAddCondition}>
                ${icon("plus", { size: 14 })} Add Condition
              </button>
            </div>
            ${
              rule.conditions.length === 0
                ? html`
                    <div class="muted">No conditions (rule will always match)</div>
                  `
                : html`
                  <div class="simulator__conditions-list">
                    ${rule.conditions.map(
                      (condition, i) => html`
                      <div class="simulator__condition-row">
                        ${i > 0 ? html`<span class="simulator__condition-logic">${rule.logic}</span>` : nothing}
                        <select
                          .value=${condition.field}
                          @change=${(e: Event) =>
                            props.onUpdateCondition(condition.id, {
                              field: (e.target as HTMLSelectElement).value as RuleConditionField,
                            })}
                        >
                          ${CONDITION_FIELDS.map(
                            (f) => html`<option value=${f.value}>${f.label}</option>`,
                          )}
                        </select>
                        <select
                          .value=${condition.operator}
                          @change=${(e: Event) =>
                            props.onUpdateCondition(condition.id, {
                              operator: (e.target as HTMLSelectElement).value as RuleOperator,
                            })}
                        >
                          ${OPERATORS.map(
                            (o) => html`<option value=${o.value}>${o.label}</option>`,
                          )}
                        </select>
                        <input
                          type="text"
                          .value=${condition.value}
                          placeholder="Value"
                          @input=${(e: Event) =>
                            props.onUpdateCondition(condition.id, {
                              value: (e.target as HTMLInputElement).value,
                            })}
                        />
                        <button
                          class="btn btn--sm btn--icon danger"
                          @click=${() => props.onDeleteCondition(condition.id)}
                        >
                          ${icon("trash-2", { size: 14 })}
                        </button>
                      </div>
                    `,
                    )}
                  </div>
                `
            }
          </div>

          <!-- Actions -->
          <div class="simulator__editor-section">
            <div class="simulator__editor-section-header">
              <h4>Actions</h4>
              <button class="btn btn--sm" @click=${props.onAddAction}>
                ${icon("plus", { size: 14 })} Add Action
              </button>
            </div>
            ${
              rule.actions.length === 0
                ? html`
                    <div class="muted">No actions defined</div>
                  `
                : html`
                  <div class="simulator__actions-list">
                    ${rule.actions.map(
                      (action) => html`
                      <div class="simulator__action-row">
                        <select
                          .value=${action.type}
                          @change=${(e: Event) =>
                            props.onUpdateAction(action.id, {
                              type: (e.target as HTMLSelectElement).value as RuleActionType,
                            })}
                        >
                          ${ACTION_TYPES.map(
                            (t) => html`<option value=${t.value}>${t.label}</option>`,
                          )}
                        </select>
                        ${renderActionParams(action, props)}
                        <button
                          class="btn btn--sm btn--icon danger"
                          @click=${() => props.onDeleteAction(action.id)}
                        >
                          ${icon("trash-2", { size: 14 })}
                        </button>
                      </div>
                    `,
                    )}
                  </div>
                `
            }
          </div>

          <!-- Tags -->
          <div class="simulator__editor-section">
            <label class="field">
              <span class="field__label">Tags (comma-separated)</span>
              <input
                type="text"
                .value=${rule.tags.join(", ")}
                @input=${(e: Event) => {
                  const value = (e.target as HTMLInputElement).value;
                  const tags = value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean);
                  props.onUpdateRule(rule.id, { tags });
                }}
              />
            </label>
          </div>
        </div>
      </div>
      <div class="simulator__modal-footer">
        <button class="btn btn--sm" @click=${props.onCloseDraftRule}>Cancel</button>
        <button class="btn btn--sm primary" @click=${props.onSaveDraftRule}>Save Rule</button>
      </div>
    </div>
  `;
}

function renderActionParams(action: RuleAction, props: SimulatorProps): TemplateResult {
  const params = action.params as Record<string, string>;

  switch (action.type) {
    case "log":
    case "notify":
      return html`
        <input
          type="text"
          placeholder="Message"
          .value=${params.message ?? ""}
          @input=${(e: Event) =>
            props.onUpdateAction(action.id, {
              params: { ...params, message: (e.target as HTMLInputElement).value },
            })}
        />
      `;
    case "set_status":
      return html`
        <select
          .value=${params.status ?? "active"}
          @change=${(e: Event) =>
            props.onUpdateAction(action.id, {
              params: { ...params, status: (e.target as HTMLSelectElement).value },
            })}
        >
          <option value="active">Active</option>
          <option value="stalled">Stalled</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
        </select>
      `;
    case "set_recovery_policy":
      return html`
        <select
          .value=${params.policy ?? "nudge"}
          @change=${(e: Event) =>
            props.onUpdateAction(action.id, {
              params: { ...params, policy: (e.target as HTMLSelectElement).value },
            })}
        >
          <option value="nudge">Nudge</option>
          <option value="resend_last">Resend Last</option>
          <option value="replan">Replan</option>
          <option value="reassign">Reassign</option>
          <option value="escalate">Escalate</option>
        </select>
      `;
    case "modify_backoff":
      return html`
        <input
          type="number"
          placeholder="Backoff (ms)"
          .value=${params.backoffMs ?? ""}
          @input=${(e: Event) =>
            props.onUpdateAction(action.id, {
              params: { ...params, backoffMs: (e.target as HTMLInputElement).value },
            })}
        />
      `;
    default:
      return html`
        <span class="muted">No parameters</span>
      `;
  }
}

// ============================================================================
// Scenario Editor Modal
// ============================================================================

function renderScenarioEditor(props: SimulatorProps): TemplateResult | typeof nothing {
  const { state } = props;
  const scenario = state.draftScenario;
  if (!scenario) return nothing;

  return html`
    <div class="simulator__modal-backdrop" @click=${props.onCloseDraftScenario}></div>
    <div class="simulator__modal simulator__modal--lg">
      <div class="simulator__modal-header">
        <h3>${state.selectedScenarioId ? "Edit Scenario" : "New Scenario"}</h3>
        <button class="btn btn--icon" @click=${props.onCloseDraftScenario}>
          ${icon("x", { size: 18 })}
        </button>
      </div>
      <div class="simulator__modal-body">
        <div class="simulator__scenario-editor">
          <label class="field">
            <span class="field__label">Name</span>
            <input
              type="text"
              .value=${scenario.name}
              @input=${(e: Event) =>
                props.onUpdateScenario(scenario.id, { name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea
              .value=${scenario.description}
              @input=${(e: Event) =>
                props.onUpdateScenario(scenario.id, {
                  description: (e.target as HTMLTextAreaElement).value,
                })}
            ></textarea>
          </label>
          <label class="field">
            <span class="field__label">Tags (comma-separated)</span>
            <input
              type="text"
              .value=${scenario.tags.join(", ")}
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                const tags = value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
                props.onUpdateScenario(scenario.id, { tags });
              }}
            />
          </label>
          <div class="simulator__scenario-events-info">
            <span>${scenario.events.length} events</span>
            <span class="muted">|</span>
            <span>${scenario.rules.length} rules</span>
          </div>
        </div>
      </div>
      <div class="simulator__modal-footer">
        <button class="btn btn--sm" @click=${props.onCloseDraftScenario}>Cancel</button>
        <button class="btn btn--sm primary" @click=${props.onSaveDraftScenario}>Save Scenario</button>
      </div>
    </div>
  `;
}
