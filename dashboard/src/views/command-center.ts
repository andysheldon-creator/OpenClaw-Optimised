import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Widget } from "../../../src/clawdbot/ui/widgets.ts";
import {
  loadGatewayDashboardConfig,
  resetDashboardGatewayClient,
  saveGatewayDashboardConfig,
} from "../data/gateway-client.ts";
import {
  compileMarketingPlan,
  executeMarketingPlan,
  fetchReadinessReport,
  fetchWidgets,
  isDashboardMockModeEnabled,
  setDashboardMockMode,
} from "../data/live-api.ts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const DEFAULT_MARKETING_PLAN = {
  title: "Q2 Search Expansion",
  accountId: "123-456-7890",
  mode: "dry-run",
  preferredAdapter: "auto",
  campaigns: [
    {
      name: "Brand - US Search",
      objective: "leads",
      dailyBudgetUsd: 300,
      status: "enabled",
      targeting: {
        locations: ["United States"],
        languages: ["en"],
      },
      adGroups: [
        {
          name: "Branded Core",
          keywords: [
            { text: "openclaw", matchType: "exact", bidUsd: 4.2 },
            { text: "openclaw automation", matchType: "phrase", bidUsd: 3.7 },
          ],
          ads: [
            {
              headline: "Automate Ops with OpenClaw",
              description: "Launch approved workflows from one control plane.",
              finalUrl: "https://openclaw.ai",
              state: "enabled",
            },
          ],
        },
      ],
    },
  ],
};

@customElement("dashboard-command-center-view")
export class DashboardCommandCenterView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: #f4f7ff;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .toolbar h2 {
      margin: 0;
      font-size: 1.05rem;
      letter-spacing: 0.01em;
    }

    .button {
      border: 1px solid rgba(175, 196, 255, 0.32);
      background: rgba(18, 29, 57, 0.84);
      color: #ecf4ff;
      border-radius: 999px;
      padding: 8px 14px;
      font: inherit;
      cursor: pointer;
    }

    .button.primary {
      border-color: rgba(34, 197, 94, 0.42);
      background: rgba(34, 197, 94, 0.2);
      color: #dcfce7;
    }

    .status {
      color: #b6c1dd;
      font-size: 0.84rem;
    }

    .error {
      color: #fecaca;
      font-size: 0.84rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 12px;
    }

    .card {
      border: 1px solid rgba(175, 196, 255, 0.22);
      border-radius: 14px;
      background:
        linear-gradient(175deg, rgba(14, 165, 233, 0.16), transparent 42%), rgba(8, 14, 31, 0.9);
      padding: 14px;
      min-height: 120px;
    }

    .small {
      grid-column: span 4;
    }

    .medium {
      grid-column: span 6;
    }

    .large {
      grid-column: span 12;
    }

    .card h3 {
      margin: 0 0 12px;
      font-size: 0.94rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #b6c1dd;
    }

    .metric {
      font-size: 1.7rem;
      font-weight: 680;
      line-height: 1.15;
    }

    .sub {
      margin-top: 4px;
      color: #b6c1dd;
      font-size: 0.9rem;
    }

    .stack {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.92rem;
      color: #d8e6ff;
    }

    .feed {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .feed-item {
      border: 1px solid rgba(175, 196, 255, 0.18);
      border-radius: 10px;
      background: rgba(18, 29, 57, 0.62);
      padding: 10px;
    }

    .feed-item time {
      display: block;
      margin-top: 4px;
      color: #94a6cd;
      font-size: 0.8rem;
    }

    .loading {
      display: grid;
      gap: 8px;
    }

    .skeleton {
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        rgba(148, 166, 205, 0.14),
        rgba(148, 166, 205, 0.34),
        rgba(148, 166, 205, 0.14)
      );
      background-size: 200% 100%;
      animation: pulse 1.2s linear infinite;
    }

    .skeleton.large {
      height: 22px;
      width: 52%;
    }

    .panel {
      margin-top: 12px;
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 14px;
      background: rgba(8, 14, 31, 0.9);
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 0.8rem;
      color: #b6c1dd;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    input,
    textarea {
      border: 1px solid rgba(175, 196, 255, 0.25);
      border-radius: 10px;
      background: rgba(18, 29, 57, 0.72);
      color: #f4f7ff;
      font: inherit;
      padding: 8px 10px;
    }

    textarea {
      min-height: 220px;
      font-family: var(--font-mono, "JetBrains Mono", monospace);
      font-size: 0.85rem;
      line-height: 1.5;
      resize: vertical;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill {
      display: inline-block;
      border: 1px solid rgba(175, 196, 255, 0.24);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #d8e6ff;
      margin-right: 6px;
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

    .readiness {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }

    .readiness-item {
      border: 1px solid rgba(175, 196, 255, 0.16);
      border-radius: 10px;
      padding: 10px;
      background: rgba(18, 29, 57, 0.55);
    }

    .diff-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 10px;
      overflow: hidden;
      font-size: 0.84rem;
    }

    .diff-table th,
    .diff-table td {
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }

    .diff-table th {
      background: rgba(18, 29, 57, 0.8);
      color: #b6c1dd;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.72rem;
    }

    .risk-pill {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #cbd5e1;
    }

    .risk-medium {
      border-color: rgba(245, 158, 11, 0.5);
      color: #fcd34d;
    }

    .risk-high {
      border-color: rgba(251, 146, 60, 0.6);
      color: #fdba74;
    }

    .risk-critical {
      border-color: rgba(248, 113, 113, 0.7);
      color: #fca5a5;
    }

    .spend-impact {
      color: #fcd34d;
      font-weight: 600;
    }

    @keyframes pulse {
      0% {
        background-position: 0% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }

    @media (max-width: 980px) {
      .small,
      .medium,
      .large {
        grid-column: span 12;
      }
    }
  `;

  @state() private loading = true;
  @state() private widgets: Widget[] = [];
  @state() private statusMessage = "Loading live runtime data...";
  @state() private errorMessage = "";
  @state() private readiness: Awaited<ReturnType<typeof fetchReadinessReport>> | null = null;

  @state() private gatewayUrl = loadGatewayDashboardConfig().url;
  @state() private gatewayToken = loadGatewayDashboardConfig().token ?? "";
  @state() private gatewayPassword = loadGatewayDashboardConfig().password ?? "";

  @state() private marketingPlanText = pretty(DEFAULT_MARKETING_PLAN);
  @state() private compileResult: Awaited<ReturnType<typeof compileMarketingPlan>> | null = null;
  @state() private marketingStatus = "";
  @state() private mockModeEnabled = isDashboardMockModeEnabled();

  override connectedCallback(): void {
    super.connectedCallback();
    void this.refreshAll();
  }

  private async refreshAll(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    try {
      const [widgets, readiness] = await Promise.all([fetchWidgets(), fetchReadinessReport()]);
      this.widgets = widgets;
      this.readiness = readiness;
      this.statusMessage = `Last refresh: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.errorMessage = String(error);
      this.statusMessage = "Live data unavailable";
      this.widgets = [];
      this.readiness = null;
    } finally {
      this.loading = false;
    }
  }

  private readonly saveGatewayConfig = (): void => {
    saveGatewayDashboardConfig({
      url: this.gatewayUrl,
      token: this.gatewayToken,
      password: this.gatewayPassword,
    });
    resetDashboardGatewayClient({
      url: this.gatewayUrl,
      token: this.gatewayToken,
      password: this.gatewayPassword,
    });
    this.statusMessage = "Gateway settings saved; reconnecting...";
    void this.refreshAll();
  };

  private readonly toggleMockMode = (): void => {
    this.mockModeEnabled = !this.mockModeEnabled;
    setDashboardMockMode(this.mockModeEnabled);
    this.statusMessage = this.mockModeEnabled
      ? "Mock mode enabled (explicit local override)."
      : "Mock mode disabled (live data default).";
    void this.refreshAll();
  };

  private parsePlan(): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(this.marketingPlanText) };
    } catch (error) {
      return { ok: false, error: `Invalid JSON: ${String(error)}` };
    }
  }

  private async compilePlan(): Promise<void> {
    const parsed = this.parsePlan();
    if (!parsed.ok) {
      this.marketingStatus = parsed.error;
      return;
    }
    this.marketingStatus = "Compiling marketing plan...";
    try {
      const result = await compileMarketingPlan(parsed.value);
      this.compileResult = result;
      this.marketingStatus = result.valid
        ? `Compiled ${result.actions.length} action(s).`
        : `Compile failed: ${result.errors.join("; ")}`;
    } catch (error) {
      this.marketingStatus = `Compile failed: ${String(error)}`;
    }
  }

  private async executePlan(): Promise<void> {
    const parsed = this.parsePlan();
    if (!parsed.ok) {
      this.marketingStatus = parsed.error;
      return;
    }
    this.marketingStatus = "Executing marketing plan...";
    try {
      const result = await executeMarketingPlan(parsed.value);
      if (!result.ok) {
        this.marketingStatus = `Execution failed: ${result.error ?? "unknown error"}`;
        return;
      }
      const runId = result.run?.id ?? "unknown";
      const approvalCount = result.approvals?.length ?? 0;
      this.marketingStatus = `Execution submitted: run ${runId}, approvals ${approvalCount}.`;
      await this.refreshAll();
    } catch (error) {
      this.marketingStatus = `Execution failed: ${String(error)}`;
    }
  }

  private renderCompileDiff(): unknown {
    if (!this.compileResult || this.compileResult.actions.length === 0) {
      return nothing;
    }

    return html`
      <table class="diff-table" aria-label="Compiled action diff">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Ad Group</th>
            <th>Action</th>
            <th>Adapter</th>
            <th>Risk</th>
            <th>Spend Impact</th>
          </tr>
        </thead>
        <tbody>
          ${this.compileResult.actions.map((action) => {
            const payload = action.payload ?? {};
            const budget =
              typeof payload.dailyBudgetUsd === "number" ? payload.dailyBudgetUsd : null;
            const bid = typeof payload.bidUsd === "number" ? payload.bidUsd : null;
            const spendImpact =
              budget != null
                ? `budget ${formatCurrency(budget)}`
                : bid != null
                  ? `bid ${formatCurrency(bid)}`
                  : "none";
            const riskClass =
              action.risk === "critical"
                ? "risk-critical"
                : action.risk === "high"
                  ? "risk-high"
                  : action.risk === "medium"
                    ? "risk-medium"
                    : "";

            return html`
              <tr>
                <td>${action.campaignName}</td>
                <td>${action.adGroupName ?? "-"}</td>
                <td>${action.type}</td>
                <td>${action.adapter}</td>
                <td><span class=${`risk-pill ${riskClass}`}>${action.risk}</span></td>
                <td class=${spendImpact === "none" ? "" : "spend-impact"}>${spendImpact}</td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    `;
  }

  private renderLoadingCard(): unknown {
    return html`
      <div class="loading">
        <div class="skeleton large"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
    `;
  }

  private renderWidgetBody(widget: Widget): unknown {
    if (this.loading || widget.loading) {
      return this.renderLoadingCard();
    }

    if (!widget.data) {
      return html`
        <p class="sub">No data available.</p>
      `;
    }

    switch (widget.type) {
      case "runs_summary": {
        const data = widget.data as {
          total: number;
          running: number;
          completed: number;
          failed: number;
          awaitingApproval: number;
        };
        return html`
          <div class="metric">${data.total}</div>
          <div class="sub">total runs in active window</div>
          <div class="stack">
            <div class="row"><span>Running</span><strong>${data.running}</strong></div>
            <div class="row"><span>Completed</span><strong>${data.completed}</strong></div>
            <div class="row"><span>Failed</span><strong>${data.failed}</strong></div>
            <div class="row"><span>Awaiting Approval</span><strong>${data.awaitingApproval}</strong></div>
          </div>
        `;
      }
      case "approvals_pending": {
        const data = widget.data as {
          pendingCount: number;
          urgentItemIds: string[];
        };
        return html`
          <div class="metric">${data.pendingCount}</div>
          <div class="sub">approval requests in queue</div>
          <div class="sub">urgent: ${data.urgentItemIds.join(", ") || "none"}</div>
        `;
      }
      case "system_health": {
        const data = widget.data as {
          overall: string;
          components: Array<{ name: string; status: string; message?: string }>;
        };
        return html`
          <div class="metric">${data.overall}</div>
          <div class="stack">
            ${data.components.map(
              (component) => html`
                <div class="row">
                  <span>${component.name}</span>
                  <span>${component.status}</span>
                </div>
              `,
            )}
          </div>
        `;
      }
      case "cost_overview": {
        const data = widget.data as {
          totalCostUsd: number;
          dailyCosts: Array<{ date: string; costUsd: number }>;
        };
        return html`
          <div class="metric">${formatCurrency(data.totalCostUsd)}</div>
          <div class="sub">estimated spend this period</div>
          <div class="stack">
            ${data.dailyCosts.slice(-3).map(
              (point) => html`
                <div class="row">
                  <span>${point.date}</span>
                  <span>${formatCurrency(point.costUsd)}</span>
                </div>
              `,
            )}
          </div>
        `;
      }
      case "recent_activity": {
        const data = widget.data as {
          entries: Array<{ id: string; message: string; timestamp: string; href?: string }>;
        };

        return html`
          <ul class="feed">
            ${data.entries.map((entry) => {
              const label = new Date(entry.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const body = entry.href
                ? html`<a href=${entry.href}>${entry.message}</a>`
                : html`<span>${entry.message}</span>`;

              return html`
                <li class="feed-item">
                  ${body}
                  <time datetime=${entry.timestamp}>${label}</time>
                </li>
              `;
            })}
          </ul>
        `;
      }
      default:
        return nothing;
    }
  }

  override render() {
    return html`
      <section class="toolbar">
        <h2>Command Center Widgets</h2>
        <div class="actions">
          <button class="button" type="button" @click=${() => this.refreshAll()}>Refresh</button>
          <button class="button" type="button" @click=${this.toggleMockMode}>
            ${this.mockModeEnabled ? "Disable Mock Mode" : "Enable Mock Mode"}
          </button>
        </div>
        <span class="status">${this.statusMessage}</span>
        ${this.errorMessage ? html`<span class="error">${this.errorMessage}</span>` : nothing}
      </section>

      <section class="grid" aria-label="Command center widgets">
        ${this.widgets.map(
          (widget) => html`
            <article class=${`card ${widget.size}`}>
              <h3>${widget.title}</h3>
              ${this.renderWidgetBody(widget)}
            </article>
          `,
        )}
      </section>

      <section class="panel" aria-label="Gateway settings">
        <h3>Gateway Connection</h3>
        <div class="form-grid">
          <label>
            Gateway URL
            <input type="text" .value=${this.gatewayUrl} @input=${(event: Event) => {
              this.gatewayUrl = (event.target as HTMLInputElement).value;
            }} />
          </label>
          <label>
            Gateway Token
            <input type="password" .value=${this.gatewayToken} @input=${(event: Event) => {
              this.gatewayToken = (event.target as HTMLInputElement).value;
            }} />
          </label>
          <label>
            Gateway Password
            <input type="password" .value=${this.gatewayPassword} @input=${(event: Event) => {
              this.gatewayPassword = (event.target as HTMLInputElement).value;
            }} />
          </label>
        </div>
        <div class="actions">
          <button class="button" type="button" @click=${this.saveGatewayConfig}>Save + Reconnect</button>
        </div>
        ${
          this.readiness
            ? html`
              <div class="readiness">
                <div class="readiness-item">
                  <strong>Skills</strong>
                  <div>${this.readiness.skillSummary.liveReady}/${this.readiness.skillSummary.total} live-ready</div>
                </div>
                <div class="readiness-item">
                  <strong>Browser Adapter</strong>
                  <div>${this.readiness.adapters.browser.ok ? "ok" : "failed"}</div>
                </div>
                <div class="readiness-item">
                  <strong>CLI Adapter</strong>
                  <div>${this.readiness.adapters.cli.ok ? "ok" : "failed"}</div>
                </div>
                <div class="readiness-item">
                  <strong>Drift</strong>
                  <div>${this.readiness.syncHealth.unresolvedDriftCount} unresolved</div>
                </div>
              </div>
            `
            : nothing
        }
      </section>

      <section class="panel" aria-label="Marketing plan launch">
        <h3>Marketing Plan Launch</h3>
        <p class="sub">
          Submit plan JSON, review compiled mutation graph, then execute via browser/CLI adapters.
        </p>
        <label>
          Plan JSON
          <textarea .value=${this.marketingPlanText} @input=${(event: Event) => {
            this.marketingPlanText = (event.target as HTMLTextAreaElement).value;
          }}></textarea>
        </label>
        <div class="actions">
          <button class="button" type="button" @click=${() => this.compilePlan()}>Compile (Dry-Run Diff)</button>
          <button class="button primary" type="button" @click=${() => this.executePlan()}>
            Execute
          </button>
          <span class="status">${this.marketingStatus}</span>
        </div>

        ${
          this.compileResult
            ? html`
              <div>
                <span class="pill">valid: ${this.compileResult.valid ? "yes" : "no"}</span>
                <span class="pill">actions: ${this.compileResult.actions.length}</span>
                ${
                  this.compileResult.actionGraphHash
                    ? html`<span class="pill">graph: ${this.compileResult.actionGraphHash.slice(0, 12)}</span>`
                    : nothing
                }
              </div>
              ${
                this.compileResult.errors.length
                  ? html`<pre>${this.compileResult.errors.join("\n")}</pre>`
                  : nothing
              }
              ${
                this.compileResult.warnings.length
                  ? html`<pre>${this.compileResult.warnings.join("\n")}</pre>`
                  : nothing
              }
              ${this.renderCompileDiff()}
            `
            : nothing
        }
      </section>
    `;
  }
}
