import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  RegistryViewConfig,
  SkillCard,
  SkillDetail,
} from "../../../src/clawdbot/ui/skill-registry-ui.ts";
import { DEFAULT_REGISTRY_VIEW_CONFIG } from "../../../src/clawdbot/ui/skill-registry-ui.ts";
import { fetchSkillsRegistry, mutateSkill } from "../data/live-api.ts";
import "../components/detail-drawer.ts";

function cloneDefaultConfig(): RegistryViewConfig {
  return {
    ...DEFAULT_REGISTRY_VIEW_CONFIG,
    filter: {
      ...DEFAULT_REGISTRY_VIEW_CONFIG.filter,
      statuses: [...DEFAULT_REGISTRY_VIEW_CONFIG.filter.statuses],
      tools: [...DEFAULT_REGISTRY_VIEW_CONFIG.filter.tools],
    },
  };
}

function sortCards(cards: SkillCard[], config: RegistryViewConfig): SkillCard[] {
  return [...cards].toSorted((left, right) => {
    const field = config.sortField;
    const direction = config.sortDirection;
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

@customElement("dashboard-skills-registry-view")
export class DashboardSkillsRegistryView extends LitElement {
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

    .toggle-row {
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
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px;
      padding: 12px;
    }

    .card {
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 12px;
      background: rgba(18, 29, 57, 0.62);
      padding: 12px;
      display: grid;
      gap: 8px;
      cursor: pointer;
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

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(175, 196, 255, 0.24);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      width: fit-content;
    }

    .status-active {
      border-color: rgba(34, 197, 94, 0.55);
      color: #86efac;
    }

    .status-deprecated {
      border-color: rgba(251, 191, 36, 0.55);
      color: #fde68a;
    }

    .status-yanked {
      border-color: rgba(251, 113, 133, 0.55);
      color: #fda4af;
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

    pre {
      margin: 0;
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 10px;
      background: rgba(10, 17, 35, 0.9);
      color: #d6f3ff;
      padding: 10px;
      overflow: auto;
      font-family: var(--font-mono, "JetBrains Mono", monospace);
      font-size: 0.82rem;
      line-height: 1.55;
    }

    .drawer-stack {
      display: grid;
      gap: 12px;
    }

    .drawer-group h3 {
      margin: 0 0 8px;
      font-size: 0.88rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b6c1dd;
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

    .actions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .action {
      border: 1px solid rgba(14, 165, 233, 0.45);
      background: rgba(14, 165, 233, 0.16);
      color: #d6f3ff;
      border-radius: 9px;
      padding: 6px 10px;
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
  @state() private registry: { cards: SkillCard[]; detailsByName: Record<string, SkillDetail> } = {
    cards: [],
    detailsByName: {},
  };
  @state() private selectedSkillName: string | null = null;
  @state() private loading = true;
  @state() private statusMessage = "";
  @state() private errorMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadRegistry();
  }

  private async loadRegistry(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    try {
      this.registry = await fetchSkillsRegistry();
      this.statusMessage = `Last load ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.registry = { cards: [], detailsByName: {} };
      this.errorMessage = String(error);
    } finally {
      this.loading = false;
    }
  }

  private async runSkillAction(
    skillName: string,
    action:
      | "skill.enable"
      | "skill.disable"
      | "skill.pin"
      | "skill.unpin"
      | "skill.deprecate"
      | "skill.reactivate"
      | "skill.reload",
  ): Promise<void> {
    const reason = window.prompt(
      `Reason for ${action} on ${skillName}:`,
      "Dashboard lifecycle action.",
    );
    const trimmedReason = reason?.trim() ?? "";
    if (!trimmedReason) {
      this.statusMessage = "Action canceled: reason is required.";
      return;
    }

    const pinnedVersion =
      action === "skill.pin"
        ? (window.prompt(`Pinned version for ${skillName}:`, "latest")?.trim() ?? "")
        : undefined;
    if (action === "skill.pin" && !pinnedVersion) {
      this.statusMessage = "Action canceled: pinned version is required.";
      return;
    }

    this.statusMessage = `Running ${action} on ${skillName}...`;
    const result = await mutateSkill({
      skillId: skillName,
      action,
      reason: trimmedReason,
      pinnedVersion,
    });
    if (!result.ok) {
      this.statusMessage = result.error ?? "Mutation failed.";
      return;
    }
    this.statusMessage = result.requiresApproval
      ? `Queued approval ${result.approvalId ?? "pending"} for ${action}.`
      : `${action} applied to ${skillName}.`;
    await this.loadRegistry();
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

  private readonly handleStatus = (event: Event): void => {
    const status = (event.target as HTMLSelectElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        statuses: status ? [status as SkillCard["status"]] : [],
      },
    };
  };

  private readonly handleIncludeDeprecated = (event: Event): void => {
    const includeDeprecated = (event.target as HTMLInputElement).checked;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        includeDeprecated,
      },
    };
  };

  private readonly handleUsageToggle = (event: Event): void => {
    const showUsageStats = (event.target as HTMLInputElement).checked;
    this.config = {
      ...this.config,
      showUsageStats,
    };
  };

  private setViewMode(viewMode: "grid" | "list"): void {
    this.config = {
      ...this.config,
      viewMode,
    };
  }

  private openDetail(skillName: string): void {
    this.selectedSkillName = skillName;
  }

  private readonly closeDetail = (): void => {
    this.selectedSkillName = null;
  };

  private getVisibleCards(): SkillCard[] {
    const search = this.config.filter.search?.trim().toLowerCase() ?? "";

    const filtered = this.registry.cards.filter((card) => {
      if (
        this.config.filter.statuses.length > 0 &&
        !this.config.filter.statuses.includes(card.status)
      ) {
        return false;
      }

      if (!this.config.filter.includeDeprecated && card.status === "deprecated") {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = `${card.name} ${card.description} ${card.tags.join(" ")}`.toLowerCase();
      return haystack.includes(search);
    });

    return sortCards(filtered, this.config);
  }

  private renderGrid(cards: SkillCard[]): unknown {
    return html`
      <div class="grid">
        ${cards.map(
          (card) => html`
            <article class="card" @click=${() => this.openDetail(card.name)}>
              <h3>${card.name}</h3>
              <span class=${`badge status-${card.status}`}>${card.status}</span>
              <p class="muted">${card.description}</p>
              ${
                this.config.showUsageStats
                  ? html`<p class="muted">usage: ${card.usageCount} | avg: ${card.avgDurationMs ?? 0}ms</p>`
                  : html`<p class="muted">version: ${card.version}</p>`
              }
            </article>
          `,
        )}
      </div>
    `;
  }

  private renderList(cards: SkillCard[]): unknown {
    return html`
      <table class="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Version</th>
            <th>Author</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>
          ${cards.map(
            (card) => html`
              <tr @click=${() => this.openDetail(card.name)}>
                <td>${card.name}</td>
                <td>${card.status}</td>
                <td>${card.version}</td>
                <td>${card.author}</td>
                <td>${card.usageCount}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  override render() {
    const cards = this.getVisibleCards();
    const selected = this.selectedSkillName
      ? (this.registry.detailsByName[this.selectedSkillName] ?? null)
      : null;

    return html`
      ${
        this.errorMessage
          ? html`<div class="banner">Failed loading skills inventory: ${this.errorMessage}</div>`
          : nothing
      }
      <section class="panel" aria-label="Skills registry view">
        <div class="controls">
          <label>
            Search
            <input type="text" .value=${this.config.filter.search ?? ""} @input=${this.handleSearch} />
          </label>
          <label>
            Status
            <select .value=${this.config.filter.statuses[0] ?? ""} @change=${this.handleStatus}>
              <option value="">All</option>
              <option value="active">active</option>
              <option value="deprecated">deprecated</option>
              <option value="yanked">yanked</option>
            </select>
          </label>
          <label>
            Include deprecated
            <input type="checkbox" .checked=${this.config.filter.includeDeprecated} @change=${this.handleIncludeDeprecated} />
          </label>
          <label>
            Show usage stats
            <input type="checkbox" .checked=${this.config.showUsageStats} @change=${this.handleUsageToggle} />
          </label>
          <div class="toggle-row">
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
          <div class="muted">${this.statusMessage}</div>
        </div>

        ${
          this.loading
            ? html`
                <div class="loading">Loading live skills inventory...</div>
              `
            : nothing
        }
        ${this.config.viewMode === "grid" ? this.renderGrid(cards) : this.renderList(cards)}
      </section>

      <dashboard-detail-drawer
        .open=${Boolean(selected)}
        .widthPx=${460}
        title=${selected ? `${selected.card.name} details` : "Skill details"}
        @dashboard:drawer-close=${this.closeDetail}
      >
        ${
          selected
            ? this.renderDetail(selected)
            : html`
                <p>Select a skill card.</p>
              `
        }
      </dashboard-detail-drawer>
    `;
  }

  private renderDetail(detail: SkillDetail): unknown {
    return html`
      <section class="drawer-stack">
        <div class="drawer-group">
          <h3>Lifecycle Actions</h3>
          <div class="actions-grid">
            <button class="action" type="button" @click=${() => this.runSkillAction(detail.card.name, "skill.enable")}>
              Enable
            </button>
            <button class="action" type="button" @click=${() => this.runSkillAction(detail.card.name, "skill.disable")}>
              Disable
            </button>
            <button class="action" type="button" @click=${() => this.runSkillAction(detail.card.name, "skill.pin")}>
              Pin Version
            </button>
            <button class="action" type="button" @click=${() => this.runSkillAction(detail.card.name, "skill.unpin")}>
              Unpin
            </button>
            <button
              class="action"
              type="button"
              @click=${() => this.runSkillAction(detail.card.name, "skill.deprecate")}
            >
              Deprecate
            </button>
            <button
              class="action"
              type="button"
              @click=${() => this.runSkillAction(detail.card.name, "skill.reactivate")}
            >
              Reactivate
            </button>
            <button class="action" type="button" @click=${() => this.runSkillAction(detail.card.name, "skill.reload")}>
              Reload
            </button>
          </div>
        </div>
        <div class="drawer-group">
          <h3>Manifest</h3>
          <pre>${detail.manifestYaml}</pre>
        </div>
        <div class="drawer-group">
          <h3>Versions</h3>
          <pre>${detail.versions.map((version) => `${version.version} | ${version.status} | ${version.publishedAt}`).join("\n")}</pre>
        </div>
        <div class="drawer-group">
          <h3>Changelog</h3>
          <pre>${detail.changelog.map((item) => `${item.date} | ${item.version} | ${item.summary}`).join("\n")}</pre>
        </div>
      </section>
    `;
  }
}
