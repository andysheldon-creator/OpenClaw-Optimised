import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { RunState } from "../../../src/clawdbot/types/run.ts";
import type {
  PaginatedRunList,
  RunListConfig,
  RunListItem,
  RunSortField,
} from "../../../src/clawdbot/ui/runs-list.ts";
import { DEFAULT_RUN_LIST_CONFIG } from "../../../src/clawdbot/ui/runs-list.ts";
import { fetchRunList } from "../data/live-api.ts";
import { filterAndSortRuns } from "../data/runs.ts";

const RUN_STATE_OPTIONS = [
  "planned",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "canceled",
] as const;

const LABELS: Record<RunSortField, string> = {
  createdAt: "Created",
  updatedAt: "Updated",
  skillName: "Skill",
  state: "State",
  durationMs: "Duration",
  estimatedCostUsd: "Cost (USD)",
};

function asRunState(value: string): RunState {
  return value as RunState;
}

function cloneDefaultConfig(): RunListConfig {
  return {
    ...DEFAULT_RUN_LIST_CONFIG,
    filter: {
      ...DEFAULT_RUN_LIST_CONFIG.filter,
      states: [...DEFAULT_RUN_LIST_CONFIG.filter.states],
      skillNames: [...DEFAULT_RUN_LIST_CONFIG.filter.skillNames],
    },
    sort: {
      ...DEFAULT_RUN_LIST_CONFIG.sort,
    },
    visibleColumns: [...DEFAULT_RUN_LIST_CONFIG.visibleColumns],
  };
}

function formatColumn(item: RunListItem, column: RunSortField): string {
  const value = item[column];
  if (column === "durationMs") {
    if (typeof value !== "number") {
      return "--";
    }
    return `${Math.round(value / 10) / 100}s`;
  }

  if (column === "estimatedCostUsd") {
    if (typeof value !== "number") {
      return "--";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (column === "createdAt" || column === "updatedAt") {
    if (typeof value !== "string") {
      return "--";
    }
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return value ? String(value) : "--";
}

@customElement("dashboard-runs-list-view")
export class DashboardRunsListView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: #f4f7ff;
    }

    .surface {
      border: 1px solid rgba(175, 196, 255, 0.22);
      border-radius: 14px;
      background:
        linear-gradient(175deg, rgba(14, 165, 233, 0.16), transparent 42%), rgba(8, 14, 31, 0.9);
      overflow: hidden;
    }

    .controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      padding: 14px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.16);
    }

    .controls label {
      display: grid;
      gap: 5px;
      font-size: 0.78rem;
      color: #b6c1dd;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .controls input,
    .controls select {
      border: 1px solid rgba(175, 196, 255, 0.3);
      border-radius: 9px;
      padding: 8px 10px;
      background: rgba(18, 29, 57, 0.82);
      color: #f4f7ff;
      min-width: 148px;
      font: inherit;
    }

    .meta {
      margin-left: auto;
      align-self: end;
      color: #a7b6d6;
      font-size: 0.82rem;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th,
    td {
      text-align: left;
      padding: 11px 12px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.14);
      white-space: nowrap;
    }

    th {
      font-size: 0.76rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #b6c1dd;
      background: rgba(18, 29, 57, 0.65);
    }

    .state {
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(175, 196, 255, 0.22);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: inline-block;
    }

    .state-running {
      border-color: rgba(45, 212, 191, 0.45);
      color: #5eead4;
    }

    .state-awaiting_approval {
      border-color: rgba(251, 191, 36, 0.5);
      color: #fcd34d;
    }

    .state-completed {
      border-color: rgba(52, 211, 153, 0.5);
      color: #6ee7b7;
    }

    .state-failed,
    .state-canceled {
      border-color: rgba(251, 113, 133, 0.5);
      color: #fda4af;
    }

    .inspect {
      border: 1px solid rgba(14, 165, 233, 0.5);
      background: rgba(14, 165, 233, 0.18);
      color: #d6f3ff;
      border-radius: 9px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
    }

    .banner {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.14);
      color: #fde68a;
      background: rgba(251, 191, 36, 0.14);
      font-size: 0.84rem;
    }

    .loading {
      padding: 18px 14px;
      color: #b6c1dd;
      font-size: 0.92rem;
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
    }

    .empty {
      color: #a7b6d6;
      font-style: italic;
    }
  `;

  @state() private runList: PaginatedRunList = {
    items: [],
    pagination: {
      pageSize: DEFAULT_RUN_LIST_CONFIG.pageSize,
      totalCount: 0,
    },
  };
  @state() private config = cloneDefaultConfig();
  @state() private loading = true;
  @state() private errorMessage = "";
  @state() private lastLoadedAt = "";

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadRuns();
    this.startAutoRefresh();
  }

  override disconnectedCallback(): void {
    this.stopAutoRefresh();
    super.disconnectedCallback();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    if (!this.config.autoRefresh || this.config.refreshIntervalSec <= 0) {
      return;
    }
    this.refreshTimer = setInterval(() => {
      void this.loadRuns();
    }, this.config.refreshIntervalSec * 1_000);
  }

  private stopAutoRefresh(): void {
    if (!this.refreshTimer) {
      return;
    }
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private async loadRuns(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    try {
      const items = await fetchRunList();
      this.runList = {
        items,
        pagination: {
          pageSize: this.config.pageSize,
          totalCount: items.length,
        },
      };
      this.lastLoadedAt = new Date().toLocaleTimeString();
    } catch (error) {
      this.errorMessage = String(error);
      this.runList = {
        items: [],
        pagination: {
          pageSize: this.config.pageSize,
          totalCount: 0,
        },
      };
    } finally {
      this.loading = false;
    }
  }

  private readonly handleSearchInput = (event: Event): void => {
    const search = (event.target as HTMLInputElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        search,
      },
    };
  };

  private readonly handleStateFilter = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        states: selected ? [asRunState(selected)] : [],
      },
    };
  };

  private readonly handleSortField = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value as RunSortField;
    this.config = {
      ...this.config,
      sort: {
        ...this.config.sort,
        field: selected,
      },
    };
  };

  private readonly handleSortDirection = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value as "asc" | "desc";
    this.config = {
      ...this.config,
      sort: {
        ...this.config.sort,
        direction: selected,
      },
    };
  };

  private openRunDetail(runId: string): void {
    this.dispatchEvent(
      new CustomEvent("dashboard:navigate", {
        detail: { href: `/runs/${runId}` },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const rows = filterAndSortRuns(this.runList.items, this.config);
    const selectedState = this.config.filter.states[0] ?? "";

    return html`
      <section class="surface" aria-label="Runs list view">
        <div class="controls">
          <label>
            Search
            <input type="text" .value=${this.config.filter.search ?? ""} @input=${this.handleSearchInput} />
          </label>
          <label>
            State
            <select .value=${selectedState} @change=${this.handleStateFilter}>
              <option value="">All</option>
              ${RUN_STATE_OPTIONS.map((state) => html`<option value=${state}>${state}</option>`)}
            </select>
          </label>
          <label>
            Sort Field
            <select .value=${this.config.sort.field} @change=${this.handleSortField}>
              ${this.config.visibleColumns.map(
                (column) => html`<option value=${column}>${LABELS[column]}</option>`,
              )}
            </select>
          </label>
          <label>
            Sort Direction
            <select .value=${this.config.sort.direction} @change=${this.handleSortDirection}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <div class="meta">
            page size ${this.config.pageSize} | refresh every ${this.config.refreshIntervalSec}s${
              this.lastLoadedAt ? ` | last load ${this.lastLoadedAt}` : ""
            }
          </div>
        </div>

        ${
          this.errorMessage
            ? html`<div class="banner">Failed loading runs: ${this.errorMessage}</div>`
            : nothing
        }

        ${
          this.loading
            ? html`
                <div class="loading">Loading live runs from gateway...</div>
              `
            : nothing
        }

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${this.config.visibleColumns.map((column) => html`<th>${LABELS[column]}</th>`)}
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length === 0
                  ? html`
                      <tr>
                        <td class="empty" colspan=${String(this.config.visibleColumns.length + 1)}>
                          No runs available.
                        </td>
                      </tr>
                    `
                  : rows.map(
                      (item) => html`
                        <tr>
                          ${this.config.visibleColumns.map((column) => {
                            if (column === "state") {
                              return html`<td><span class=${`state state-${item.state}`}>${item.state}</span></td>`;
                            }
                            return html`<td>${formatColumn(item, column)}</td>`;
                          })}
                          <td>
                            <button class="inspect" type="button" @click=${() => this.openRunDetail(item.id)}>
                              Open
                            </button>
                          </td>
                        </tr>
                      `,
                    )
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
}
