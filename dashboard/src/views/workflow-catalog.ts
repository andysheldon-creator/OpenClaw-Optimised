import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  CatalogConfig,
  CatalogEntry,
  CatalogSortField,
  WorkflowCategory,
} from "../../../src/clawdbot/ui/workflow-catalog.ts";
import { DEFAULT_CATALOG_CONFIG } from "../../../src/clawdbot/ui/workflow-catalog.ts";
import { fetchWorkflowCatalog, mutateWorkflow } from "../data/live-api.ts";

function cloneDefaultConfig(): CatalogConfig {
  return {
    ...DEFAULT_CATALOG_CONFIG,
    filter: {
      ...DEFAULT_CATALOG_CONFIG.filter,
      statuses: [...DEFAULT_CATALOG_CONFIG.filter.statuses],
      categories: [...DEFAULT_CATALOG_CONFIG.filter.categories],
    },
  };
}

function sortEntries(
  entries: CatalogEntry[],
  field: CatalogSortField,
  direction: "asc" | "desc",
): CatalogEntry[] {
  return [...entries].toSorted((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue < rightValue) {
      return direction === "asc" ? -1 : 1;
    }
    if (leftValue > rightValue) {
      return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

@customElement("dashboard-workflow-catalog-view")
export class DashboardWorkflowCatalogView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: #f4f7ff;
    }

    .panel {
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 14px;
      background:
        linear-gradient(180deg, rgba(14, 165, 233, 0.12), transparent 42%), rgba(8, 14, 31, 0.9);
      overflow: hidden;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
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
      min-width: 150px;
      font: inherit;
    }

    .view-mode {
      margin-left: auto;
      align-self: end;
      display: inline-flex;
      gap: 6px;
    }

    .mode {
      border: 1px solid rgba(175, 196, 255, 0.3);
      border-radius: 999px;
      background: rgba(18, 29, 57, 0.82);
      color: #d8e6ff;
      padding: 7px 12px;
      font: inherit;
      cursor: pointer;
    }

    .mode.active {
      border-color: rgba(14, 165, 233, 0.58);
      background: rgba(14, 165, 233, 0.22);
      color: #ecf8ff;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
      padding: 12px;
    }

    .card {
      border: 1px solid rgba(175, 196, 255, 0.18);
      border-radius: 12px;
      background: rgba(18, 29, 57, 0.6);
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    .card h3 {
      margin: 0;
      font-size: 0.97rem;
      line-height: 1.3;
    }

    .muted {
      color: #a7b6d6;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tag {
      border: 1px solid rgba(175, 196, 255, 0.24);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 0.74rem;
      color: #d8e6ff;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .list {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .list th,
    .list td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
      white-space: nowrap;
    }

    .list th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b6c1dd;
      background: rgba(18, 29, 57, 0.62);
    }

    .banner {
      margin: 0 0 10px;
      padding: 10px 12px;
      border: 1px solid rgba(251, 191, 36, 0.45);
      border-radius: 10px;
      background: rgba(251, 191, 36, 0.14);
      color: #fde68a;
      font-size: 0.84rem;
    }

    .action-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .action {
      border: 1px solid rgba(14, 165, 233, 0.45);
      background: rgba(14, 165, 233, 0.16);
      color: #d6f3ff;
      border-radius: 9px;
      padding: 5px 8px;
      font: inherit;
      cursor: pointer;
    }

    .loading {
      padding: 12px;
      color: #b6c1dd;
      font-size: 0.88rem;
    }
  `;

  @state() private config = cloneDefaultConfig();
  @state() private entries: CatalogEntry[] = [];
  @state() private loading = true;
  @state() private statusMessage = "";
  @state() private errorMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadEntries();
  }

  private async loadEntries(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    try {
      this.entries = await fetchWorkflowCatalog();
      this.statusMessage = `Last load ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.entries = [];
      this.errorMessage = String(error);
    } finally {
      this.loading = false;
    }
  }

  private async runWorkflowAction(
    entry: CatalogEntry,
    action:
      | "workflow.deploy"
      | "workflow.activate"
      | "workflow.pause"
      | "workflow.run"
      | "workflow.rollback",
  ): Promise<void> {
    const reason = window.prompt(
      `Reason for ${action} on ${entry.name}:`,
      "Dashboard workflow lifecycle action.",
    );
    const trimmedReason = reason?.trim() ?? "";
    if (!trimmedReason) {
      this.statusMessage = "Action canceled: reason is required.";
      return;
    }

    const targetVersion =
      action === "workflow.rollback"
        ? (window.prompt(`Rollback ${entry.name} to version:`, entry.version)?.trim() ?? "")
        : undefined;
    if (action === "workflow.rollback" && !targetVersion) {
      this.statusMessage = "Action canceled: target version is required.";
      return;
    }

    this.statusMessage = `Running ${action} on ${entry.name}...`;
    const result = await mutateWorkflow({
      workflowId: entry.id,
      action,
      reason: trimmedReason,
      targetVersion,
    });
    if (!result.ok) {
      this.statusMessage = result.error ?? "Workflow mutation failed.";
      return;
    }
    this.statusMessage = result.requiresApproval
      ? `Queued approval ${result.approvalId ?? "pending"} for ${action}.`
      : `${action} applied to ${entry.name}.`;
    await this.loadEntries();
  }

  private readonly handleSearch = (event: Event): void => {
    const search = (event.target as HTMLInputElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        search,
      },
    };
  };

  private readonly handleCategory = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        categories: selected ? [selected as WorkflowCategory] : [],
      },
    };
  };

  private readonly handleSortField = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value as CatalogSortField;
    this.config = {
      ...this.config,
      sortField: selected,
    };
  };

  private readonly handleSortDirection = (event: Event): void => {
    const selected = (event.target as HTMLSelectElement).value as "asc" | "desc";
    this.config = {
      ...this.config,
      sortDirection: selected,
    };
  };

  private setViewMode(viewMode: "grid" | "list"): void {
    this.config = {
      ...this.config,
      viewMode,
    };
  }

  private getVisibleEntries(): CatalogEntry[] {
    const search = this.config.filter.search?.trim().toLowerCase() ?? "";
    const statuses = this.config.filter.statuses;
    const categories = this.config.filter.categories;

    const filtered = this.entries.filter((entry) => {
      if (statuses.length > 0 && !statuses.includes(entry.status)) {
        return false;
      }
      if (categories.length > 0 && !categories.includes(entry.category)) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = `${entry.name} ${entry.description} ${entry.tags.join(" ")}`.toLowerCase();
      return haystack.includes(search);
    });

    return sortEntries(filtered, this.config.sortField, this.config.sortDirection);
  }

  private renderGrid(entries: CatalogEntry[]): unknown {
    return html`
      <div class="grid">
        ${entries.map(
          (entry) => html`
            <article class="card">
              <h3>${entry.name}</h3>
              <p class="muted">${entry.description}</p>
              <div class="tag-row">
                <span class="tag">${entry.status}</span>
                <span class="tag">${entry.category}</span>
                <span class="tag">v${entry.version}</span>
              </div>
              <p class="muted">deploys: ${entry.deployCount} | author: ${entry.author}</p>
              <div class="action-row">
                <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.deploy")}>
                  Deploy
                </button>
                <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.activate")}>
                  Activate
                </button>
                <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.pause")}>
                  Pause
                </button>
                <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.run")}>
                  Run
                </button>
                <button
                  class="action"
                  type="button"
                  @click=${() => this.runWorkflowAction(entry, "workflow.rollback")}
                >
                  Rollback
                </button>
              </div>
            </article>
          `,
        )}
      </div>
    `;
  }

  private renderList(entries: CatalogEntry[]): unknown {
    return html`
      <table class="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Category</th>
            <th>Version</th>
            <th>Deploys</th>
            <th>Published</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(
            (entry) => html`
              <tr>
                <td>${entry.name}</td>
                <td>${entry.status}</td>
                <td>${entry.category}</td>
                <td>${entry.version}</td>
                <td>${entry.deployCount}</td>
                <td>${new Date(entry.publishedAt).toLocaleDateString()}</td>
                <td>
                  <div class="action-row">
                    <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.deploy")}>
                      Deploy
                    </button>
                    <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.activate")}>
                      Activate
                    </button>
                    <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.pause")}>
                      Pause
                    </button>
                    <button class="action" type="button" @click=${() => this.runWorkflowAction(entry, "workflow.run")}>
                      Run
                    </button>
                    <button
                      class="action"
                      type="button"
                      @click=${() => this.runWorkflowAction(entry, "workflow.rollback")}
                    >
                      Rollback
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  override render() {
    const entries = this.getVisibleEntries();

    return html`
      ${
        this.errorMessage
          ? html`<div class="banner">Failed loading workflow catalog: ${this.errorMessage}</div>`
          : html``
      }
      <section class="panel" aria-label="Workflow catalog view">
        <div class="controls">
          <label>
            Search
            <input type="text" .value=${this.config.filter.search ?? ""} @input=${this.handleSearch} />
          </label>
          <label>
            Category
            <select .value=${this.config.filter.categories[0] ?? ""} @change=${this.handleCategory}>
              <option value="">All</option>
              <option value="automation">automation</option>
              <option value="data-pipeline">data-pipeline</option>
              <option value="notification">notification</option>
              <option value="integration">integration</option>
              <option value="monitoring">monitoring</option>
            </select>
          </label>
          <label>
            Sort Field
            <select .value=${this.config.sortField} @change=${this.handleSortField}>
              <option value="publishedAt">publishedAt</option>
              <option value="updatedAt">updatedAt</option>
              <option value="name">name</option>
              <option value="deployCount">deployCount</option>
            </select>
          </label>
          <label>
            Sort Direction
            <select .value=${this.config.sortDirection} @change=${this.handleSortDirection}>
              <option value="desc">desc</option>
              <option value="asc">asc</option>
            </select>
          </label>
          <div class="muted">${this.statusMessage}</div>
          <div class="view-mode">
            <button
              class=${this.config.viewMode === "grid" ? "mode active" : "mode"}
              type="button"
              @click=${() => this.setViewMode("grid")}
            >
              Grid
            </button>
            <button
              class=${this.config.viewMode === "list" ? "mode active" : "mode"}
              type="button"
              @click=${() => this.setViewMode("list")}
            >
              List
            </button>
          </div>
        </div>

        ${
          this.loading
            ? html`
                <div class="loading">Loading live workflow catalog...</div>
              `
            : html``
        }
        ${this.config.viewMode === "grid" ? this.renderGrid(entries) : this.renderList(entries)}
      </section>
    `;
  }
}
