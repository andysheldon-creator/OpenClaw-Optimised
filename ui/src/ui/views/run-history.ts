import { html, nothing } from "lit";
import type {
  AutomationRunHistoryState,
  AutomationRunRecord,
  AutomationArtifact,
  AutomationConflict,
} from "../controllers/automations";
import { icon } from "../icons";

export interface RunHistoryProps {
  state: Pick<
    AutomationRunHistoryState,
    | "records"
    | "loading"
    | "error"
    | "expandedRows"
    | "currentPage"
    | "statusFilter"
    | "dateFrom"
    | "dateTo"
    | "itemsPerPage"
    | "automationId"
  >;
  filteredData: AutomationRunRecord[];
  totalPages: number;
  paginatedData: AutomationRunRecord[];
  onToggleRow: (id: string) => void;
  onPageChange: (page: number) => void;
  onStatusFilterChange: (status: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onClearFilters: () => void;
  onDownloadArtifact: (artifact: AutomationArtifact) => void;
  onClose: () => void;
}

function getStatusConfig(status: AutomationRunRecord["status"]): {
  classes: string;
  icon: import("../icons").IconName;
} {
  switch (status) {
    case "success":
      return { classes: "badge badge--ok", icon: "check-circle" };
    case "failed":
      return { classes: "badge badge--danger", icon: "x-circle" };
    case "running":
      return { classes: "badge badge--accent badge--animated", icon: "loader" };
    case "cancelled":
      return { classes: "badge badge--muted", icon: "pause" };
  }
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function renderStatusBadge(status: AutomationRunRecord["status"]) {
  const config = getStatusConfig(status);
  return html`
    <span class="${config.classes}">
      ${icon(config.icon, { size: 12 })}
      <span class="capitalize">${status}</span>
    </span>
  `;
}

function renderTimelineItem(
  event: { timestamp?: string; title?: string; action?: string; details?: string; status: string },
  index: number,
) {
  const colorClass =
    event.status === "success" ? "bg-ok" : event.status === "warning" ? "bg-warn" : "bg-danger";

  return html`
    <div class="run-timeline-item">
      <div class="run-timeline-item__dot ${colorClass}"></div>
      ${
        index < 10
          ? html`
              <div class="run-timeline-item__line"></div>
            `
          : nothing
      }
      <div class="run-timeline-item__content">
        ${event.timestamp ? html`<div class="run-timeline-item__timestamp">${event.timestamp}</div>` : nothing}
        <div class="run-timeline-item__action">${event.title ?? event.action ?? ""}</div>
        ${event.details ? html`<div class="run-timeline-item__details">${event.details}</div>` : nothing}
      </div>
    </div>
  `;
}

function renderConflictItem(conflict: AutomationConflict) {
  return html`
    <div class="conflict-item">
      <div class="conflict-item__type">${conflict.type}</div>
      <div class="conflict-item__description">${conflict.description}</div>
      <div class="conflict-item__resolution">
        <span class="conflict-item__label">Resolution:</span>
        <span class="conflict-item__value">${conflict.resolution}</span>
      </div>
    </div>
  `;
}

function renderArtifactItem(
  artifact: AutomationArtifact,
  onDownload: (artifact: AutomationArtifact) => void,
) {
  return html`
    <div class="artifact-item">
      <div class="artifact-item__icon">${icon("file-text", { size: 16 })}</div>
      <div class="artifact-item__info">
        <div class="artifact-item__name">${artifact.name}</div>
        <div class="artifact-item__meta">
          <span class="artifact-item__type">${artifact.type.toUpperCase()}</span>
          <span>•</span>
          <span class="artifact-item__size">${artifact.size}</span>
        </div>
      </div>
      <button
        class="artifact-item__download"
        @click=${() => onDownload(artifact)}
        title="Download"
      >
        ${icon("download", { size: 14 })}
      </button>
    </div>
  `;
}

function renderHistoryRow(record: AutomationRunRecord, props: RunHistoryProps) {
  const isExpanded = props.state.expandedRows.has(record.id);

  return html`
    <!-- Main Row -->
    <div class="data-table__row data-clickable @click=${() => props.onToggleRow(record.id)}">
      <div class="data-table__cell data-table__cell--icon">
        <button class="expand-toggle">
          ${icon(isExpanded ? "chevron-up" : "chevron-down", { size: 16 })}
        </button>
      </div>
      <div class="data-table__cell data-table__cell--timestamp">
        <span class="text-mono text-sm">${formatTimestamp(record.startedAt)}</span>
      </div>
      <div class="data-table__cell">
        ${renderStatusBadge(record.status)}
      </div>
      <div class="data-table__cell data-table__cell--summary">
        <p class="text-sm truncate">${record.summary || "No summary"}</p>
      </div>
      <div class="data-table__cell">
        <span class="badge badge--muted">${record.artifacts.length} file${record.artifacts.length !== 1 ? "s" : ""}</span>
      </div>
    </div>

    <!-- Expanded Details -->
    ${
      isExpanded
        ? html`
      <div class="data-table__expanded">
        <div class="expanded-content">
          <div class="expanded-content__section">
            <h4 class="expanded-content__title">Execution Timeline</h4>
            <div class="run-timeline">
              ${record.timeline.map((event, index) => renderTimelineItem(event, index))}
            </div>
          </div>

          ${
            record.conflicts.length > 0
              ? html`
            <div class="expanded-content__section">
              <h4 class="expanded-content__title">Conflict Details</h4>
              <div class="conflict-list">
                ${record.conflicts.map((conflict) => renderConflictItem(conflict))}
              </div>
            </div>
          `
              : nothing
          }

          <div class="expanded-content__section">
            <h4 class="expanded-content__title">AI Model Information</h4>
            ${
              record.aiModel
                ? html`
              <div class="ai-model-info">
                <div class="ai-model-info__row">
                  <span class="text-muted-foreground text-sm">Model:</span>
                  <span class="text-sm font-medium">${record.aiModel.name}</span>
                </div>
                <div class="ai-model-info__row">
                  <span class="text-muted-foreground text-sm">Version:</span>
                  <span class="text-mono text-sm">${record.aiModel.version}</span>
                </div>
                <div class="ai-model-info__row">
                  <span class="text-muted-foreground text-sm">Tokens:</span>
                  <span class="text-mono text-sm">${record.aiModel.tokensUsed.toLocaleString()}</span>
                </div>
                <div class="ai-model-info__row">
                  <span class="text-muted-foreground text-sm">Cost:</span>
                  <span class="text-sm font-medium">${record.aiModel.cost}</span>
                </div>
              </div>
            `
                : html`
                    <p class="text-sm text-muted-foreground">No AI information available</p>
                  `
            }
          </div>

          <div class="expanded-content__section">
            <h4 class="expanded-content__title">Artifacts</h4>
            <div class="artifact-list">
              ${record.artifacts.map((artifact) => renderArtifactItem(artifact, props.onDownloadArtifact))}
            </div>
          </div>
        </div>

        <div class="expanded-content__meta">
          <div class="expanded-content__meta-item">
            <span class="text-muted-foreground text-sm">Started:</span>
            <span class="text-mono text-sm">${formatTimestamp(record.startedAt)}</span>
          </div>
          ${
            record.completedAt
              ? html`
                <div class="expanded-content__meta-item">
                  <span class="text-muted-foreground text-sm">Completed:</span>
                  <span class="text-mono text-sm">${formatTimestamp(record.completedAt)}</span>
                </div>
              `
              : nothing
          }
          ${
            record.durationMs
              ? html`
                <div class="expanded-content__meta-item">
                  <span class="text-muted-foreground text-sm">Duration:</span>
                  <span class="text-mono text-sm">${formatDuration(record.durationMs)}</span>
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `
        : nothing
    }
  `;
}

function renderPagination(props: RunHistoryProps) {
  const { state, filteredData, totalPages } = props;
  const startIndex = (state.currentPage - 1) * state.itemsPerPage;

  return html`
    <div class="pagination">
      <div class="pagination__info">
        Showing ${startIndex + 1} to ${Math.min(startIndex + state.itemsPerPage, filteredData.length)} of
        ${filteredData.length} results
      </div>
      <div class="pagination__controls">
        <button
          class="btn btn--secondary"
          @click=${() => props.onPageChange(Math.max(1, state.currentPage - 1))}
          ?disabled=${state.currentPage === 1}
        >
          ${icon("chevron-left", { size: 14 })}
          Previous
        </button>

        <div class="pagination__pages">
          ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (state.currentPage <= 3) {
              pageNum = i + 1;
            } else if (state.currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = state.currentPage - 2 + i;
            }

            const isActive = state.currentPage === pageNum;
            return html`
              <button
                class="pagination__page ${isActive ? "pagination__page--active" : ""}"
                @click=${() => props.onPageChange(pageNum)}
              >
                ${pageNum}
              </button>
            `;
          })}
        </div>

        <button
          class="btn btn--secondary"
          @click=${() => props.onPageChange(Math.min(totalPages, state.currentPage + 1))}
          ?disabled=${state.currentPage === totalPages}
        >
          Next
          ${icon("chevron-right", { size: 14 })}
        </button>
      </div>
    </div>
  `;
}

export function renderRunHistory(props: RunHistoryProps) {
  const { state, filteredData, totalPages, paginatedData } = props;

  return html`
    <div class="run-history-view">
      <!-- Header with close button -->
      <div class="run-history-header">
        <div class="run-history-header__left">
          <button class="btn btn--secondary" @click=${props.onClose}>
            ${icon("arrow-left", { size: 14 })}
            Back to Automations
          </button>
        </div>
        <div class="run-history-header__title">
          <h3>Run History</h3>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <div class="filter-bar__section">
          ${icon("filter", { size: 16, class: "text-muted-foreground" })}
          <span class="text-sm font-medium">Filters:</span>
        </div>

        <div class="filter-bar__fields">
          <input
            type="date"
            .value=${state.dateFrom}
            @input=${(e: InputEvent) => props.onDateFromChange((e.target as HTMLInputElement).value)}
            class="filter-bar__input"
            placeholder="From"
          />
          <span class="text-muted-foreground">to</span>
          <input
            type="date"
            .value=${state.dateTo}
            @input=${(e: InputEvent) => props.onDateToChange((e.target as HTMLInputElement).value)}
            class="filter-bar__input"
            placeholder="To"
          />

          <select
            .value=${state.statusFilter}
            @change=${(e: Event) => props.onStatusFilterChange((e.target as HTMLSelectElement).value)}
            class="filter-bar__select"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>

          <button
            class="btn btn--secondary"
            @click=${props.onClearFilters}
          >
            Clear Filters
          </button>
        </div>
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
                <span>Loading run history...</span>
              </div>
            `
          : nothing
      }

      <!-- Table -->
      <div class="data-table">
        ${
          !state.loading && paginatedData.length === 0
            ? html`
              <div class="data-table__empty">
                <div class="data-table__empty-icon">${icon("scroll-text", { size: 32 })}</div>
                <div class="data-table__empty-title">No run history</div>
                <div class="data-table__empty-desc">
                  ${
                    state.automationId
                      ? "This automation hasn't been executed yet"
                      : "Select an automation to view its run history"
                  }
                </div>
              </div>
            `
            : html`
              <div class="data-table__container">
                <div class="data-table__header">
                  <div class="data-table__row data-table__row--header">
                    <div class="data-table__cell" style="width: 40px"></div>
                    <div class="data-table__cell">Timestamp</div>
                    <div class="data-table__cell">Status</div>
                    <div class="data-table__cell">Summary</div>
                    <div class="data-table__cell">Artifacts</div>
                  </div>
                </div>
                <div class="data-table__body">
                  ${paginatedData.map((record) => renderHistoryRow(record, props))}
                </div>
              </div>

              ${totalPages > 1 ? renderPagination(props) : nothing}
            `
        }
      </div>
    </div>
  `;
}
