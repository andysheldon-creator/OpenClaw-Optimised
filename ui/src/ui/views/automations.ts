import { html, nothing } from "lit";
import type {
  Automation,
  AutomationSchedule,
  AutomationStatus,
  AutomationsState,
} from "../controllers/automations";
import { statusConfig } from "../controllers/automations";
import { icon } from "../icons";

// Re-export automation-related view components
export { renderAutomationForm } from "./automation-form";
export { renderProgressModal } from "./progress-modal";
export { renderRunHistory } from "./run-history";

export interface AutomationCardProps {
  automation: Automation;
  isExpanded: boolean;
  isRunning: boolean;
  onToggleExpand: (id: string) => void;
  onRun: (id: string) => void;
  onSuspend: (id: string) => void;
  onHistory: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function getStatusClass(status: AutomationStatus): string {
  switch (status) {
    case "active":
      return "status-active";
    case "suspended":
      return "status-suspended";
    case "error":
      return "status-error";
  }
}

function formatSchedule(schedule: AutomationSchedule): string {
  switch (schedule.type) {
    case "at":
      return `At ${new Date(schedule.atMs ?? 0).toLocaleString()}`;
    case "every": {
      const ms = schedule.everyMs ?? 0;
      if (ms < 60_000) return `Every ${ms / 1000} seconds`;
      if (ms < 3_600_000) return `Every ${ms / 60_000} minutes`;
      return `Every ${ms / 86_400_000} days`;
    }
    case "cron":
      return schedule.expr ?? "";
  }
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function renderLastRun(automation: Automation) {
  if (!automation.lastRun) {
    return html`
      <span class="text-muted-foreground text-sm">Never run</span>
    `;
  }

  const lastRun = automation.lastRun;
  const statusClass =
    lastRun.status === "success"
      ? "text-ok"
      : lastRun.status === "failed"
        ? "text-danger"
        : "text-accent";

  return html`
    <div class="flex items-center gap-2 text-sm">
      ${icon(
        lastRun.status === "success"
          ? "check-circle"
          : lastRun.status === "failed"
            ? "x-circle"
            : "loader",
        { size: 14, class: statusClass },
      )}
      <span class="text-foreground">${formatTimestamp(lastRun.at)}</span>
      ${
        lastRun.durationMs
          ? html`<span class="text-muted-foreground">(${lastRun.durationMs}ms)</span>`
          : nothing
      }
    </div>
  `;
}

export function renderAutomationCard(props: AutomationCardProps) {
  const {
    automation,
    isExpanded,
    isRunning,
    onToggleExpand,
    onRun,
    onSuspend,
    onHistory,
    onEdit,
    onDelete,
  } = props;
  const statusInfo = statusConfig[automation.status];

  return html`
    <div class="automation-card" data-id="${automation.id}">
      <div class="automation-card__header">
        <div class="automation-card__info">
          <div class="automation-card__title-row">
            <h3 class="automation-card__name">${automation.name}</h3>
            <span class="status-badge ${getStatusClass(automation.status)}">
              ${icon(statusInfo.icon as import("../icons").IconName, { size: 14 })}
              ${statusInfo.label}
            </span>
          </div>
          ${
            automation.description
              ? html`<p class="automation-card__description">${automation.description}</p>`
              : nothing
          }
          <div class="automation-card__meta">
            <span class="text-xs text-muted-foreground">${automation.type}</span>
            <span class="text-xs text-muted-foreground">•</span>
            <span class="text-xs text-muted-foreground">${formatSchedule(automation.schedule)}</span>
          </div>
        </div>
        <button
          class="automation-card__expand-btn"
          @click=${() => onToggleExpand(automation.id)}
          aria-label="Toggle details"
          aria-expanded=${isExpanded}
        >
          ${icon("chevron-down", {
            size: 18,
            class: isExpanded ? "rotate-180" : "",
          })}
        </button>
      </div>

      ${
        isExpanded
          ? html`
        <div class="automation-card__details">
          <div class="automation-card__meta-grid">
            <div class="automation-card__meta-item">
              <span class="meta-label">Last Run</span>
              ${renderLastRun(automation)}
            </div>
            ${
              automation.nextRunAt
                ? html`
                  <div class="automation-card__meta-item">
                    <span class="meta-label">Next Run</span>
                    <span class="text-sm text-foreground">${formatTimestamp(automation.nextRunAt)}</span>
                  </div>
                `
                : nothing
            }
          </div>

          <div class="automation-card__actions">
            <button
              class="btn btn-primary"
              @click=${() => onRun(automation.id)}
              ?disabled=${isRunning || !automation.enabled}
            >
              ${icon("play", { size: 14 })}
              ${isRunning ? "Running..." : "Run Now"}
            </button>
            <button
              class="btn btn-secondary"
              @click=${() => onSuspend(automation.id)}
              title=${automation.enabled ? "Suspend" : "Resume"}
            >
              ${icon(automation.enabled ? "pause" : "play", { size: 14 })}
            </button>
            <button
              class="btn btn-secondary"
              @click=${() => onHistory(automation.id)}
              title="View History"
            >
              ${icon("scroll-text", { size: 14 })}
            </button>
            <button
              class="btn btn-secondary"
              @click=${() => onEdit(automation.id)}
              title="Edit"
            >
              ${icon("edit", { size: 14 })}
            </button>
            <button
              class="btn btn-danger"
              @click=${() => onDelete(automation.id)}
              title="Delete"
            >
              ${icon("trash", { size: 14 })}
            </button>
          </div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

export interface AutomationsListViewProps {
  state: Pick<
    AutomationsState,
    "automations" | "searchQuery" | "statusFilter" | "loading" | "error"
  >;
  filteredAutomations: Automation[];
  onRun: (id: string) => void;
  onSuspend: (id: string) => void;
  onHistory: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: AutomationsState["statusFilter"]) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onToggleExpand: (id: string) => void;
  expandedIds: Set<string>;
  runningIds: Set<string>;
}

export function renderAutomationsListView(props: AutomationsListViewProps) {
  const {
    state,
    filteredAutomations,
    onRun,
    onSuspend,
    onHistory,
    onEdit,
    onDelete,
    onSearchChange,
    onFilterChange,
    onCreate,
    onRefresh,
    onToggleExpand,
    expandedIds,
    runningIds,
  } = props;

  return html`
    <div class="automations-view">
      <!-- Header -->
      <div class="automations-view__header">
        <div>
          <h1 class="text-2xl font-bold text-foreground">Automations</h1>
          <p class="text-sm text-muted-foreground">Manage and monitor your automated workflows</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-secondary"
            @click=${onRefresh}
            ?disabled=${state.loading}
          >
            ${icon("refresh-cw", { size: 14 })}
            Refresh
          </button>
          <button class="btn btn-primary" @click=${onCreate}>
            ${icon("plus", { size: 14 })}
            Create Automation
          </button>
        </div>
      </div>

      <!-- Search and Filter -->
      <div class="automations-view__filters">
        <div class="search-field">
          ${icon("search", { size: 16, class: "search-field__icon" })}
          <input
            type="text"
            placeholder="Search automations..."
            .value=${state.searchQuery}
            @input=${(e: Event) => onSearchChange((e.target as HTMLInputElement).value)}
            class="search-field__input"
          />
        </div>
        <select
          .value=${state.statusFilter}
          @change=${(e: Event) => onFilterChange((e.target as HTMLSelectElement).value as AutomationsListViewProps["state"]["statusFilter"])}
          class="filter-select"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="error">Error</option>
        </select>
      </div>

      <!-- Error Display -->
      ${
        state.error
          ? html`
            <div class="alert alert--danger">
              ${icon("alert-circle", { size: 16 })}
              <span>${state.error}</span>
            </div>
          `
          : nothing
      }

      <!-- Loading State -->
      ${
        state.loading
          ? html`
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Loading automations...</span>
              </div>
            `
          : nothing
      }

      <!-- Automation Grid -->
      ${
        !state.loading && filteredAutomations.length === 0
          ? html`
            <div class="empty-state">
              <div class="empty-state__icon">${icon("inbox", { size: 48 })}</div>
              <h3 class="empty-state__title">No automations found</h3>
              <p class="empty-state__desc">
                ${
                  state.searchQuery || state.statusFilter !== "all"
                    ? "Try adjusting your search or filters"
                    : "Create your first automation to get started"
                }
              </p>
            </div>
          `
          : html`
            <div class="automations-grid">
              ${filteredAutomations.map((automation) =>
                renderAutomationCard({
                  automation,
                  isExpanded: expandedIds.has(automation.id),
                  isRunning: runningIds.has(automation.id),
                  onToggleExpand,
                  onRun,
                  onSuspend,
                  onHistory,
                  onEdit,
                  onDelete,
                }),
              )}
            </div>
          `
      }
    </div>
  `;
}
