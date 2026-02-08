import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { MockRunDetailBundle } from "../data/run-detail.ts";
import { fetchRunDetail } from "../data/live-api.ts";
import { buildMockRunDetailBundle } from "../data/run-detail.ts";
import "../components/detail-drawer.ts";

@customElement("dashboard-run-detail-view")
export class DashboardRunDetailView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: #f4f7ff;
    }

    .layout {
      display: grid;
      gap: 12px;
    }

    .summary,
    .timeline,
    .steps {
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 14px;
      background:
        linear-gradient(180deg, rgba(14, 165, 233, 0.12), transparent 42%), rgba(8, 14, 31, 0.9);
      padding: 14px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }

    .metric {
      border: 1px solid rgba(175, 196, 255, 0.14);
      border-radius: 10px;
      padding: 10px;
      background: rgba(18, 29, 57, 0.6);
    }

    .metric strong {
      display: block;
      font-size: 0.78rem;
      color: #b6c1dd;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }

    .metric span {
      font-size: 0.95rem;
    }

    h2 {
      margin: 0;
      font-size: 1rem;
    }

    .list {
      list-style: none;
      margin: 10px 0 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }

    .item {
      border: 1px solid rgba(175, 196, 255, 0.14);
      border-radius: 10px;
      background: rgba(18, 29, 57, 0.58);
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .item-main {
      min-width: 0;
    }

    .item-main p {
      margin: 0;
      color: #d8e6ff;
      font-size: 0.92rem;
    }

    .item-main time {
      margin-top: 4px;
      display: block;
      color: #a7b6d6;
      font-size: 0.8rem;
    }

    .inspect {
      border: 1px solid rgba(14, 165, 233, 0.5);
      background: rgba(14, 165, 233, 0.18);
      color: #d6f3ff;
      border-radius: 9px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 0.9rem;
    }

    th,
    td {
      text-align: left;
      padding: 9px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
      white-space: nowrap;
    }

    th {
      color: #b6c1dd;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.75rem;
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
      padding: 10px 14px;
      border: 1px solid rgba(251, 191, 36, 0.45);
      border-radius: 10px;
      background: rgba(251, 191, 36, 0.14);
      color: #fde68a;
      font-size: 0.84rem;
    }
  `;

  @property({ type: String }) runId = "";
  @state() private bundle: MockRunDetailBundle = buildMockRunDetailBundle();
  @state() private loading = true;
  @state() private errorMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadRunDetail();
  }

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("runId")) {
      void this.loadRunDetail();
    }
  }

  private async loadRunDetail(): Promise<void> {
    const nextId = this.runId || "run_241";
    this.loading = true;
    this.errorMessage = "";
    try {
      this.bundle = await fetchRunDetail(nextId);
    } catch (error) {
      this.errorMessage = String(error);
      this.bundle = buildMockRunDetailBundle(nextId);
    } finally {
      this.loading = false;
    }
  }

  private openInspector(stepId: string): void {
    const inspection = this.bundle.inspectionsByStepId[stepId];
    if (!inspection) {
      return;
    }

    this.bundle = {
      ...this.bundle,
      view: {
        ...this.bundle.view,
        drawer: {
          ...this.bundle.view.drawer,
          open: true,
          selectedStepId: stepId,
          loading: false,
          inspection,
        },
      },
    };
  }

  private readonly closeDrawer = (): void => {
    this.bundle = {
      ...this.bundle,
      view: {
        ...this.bundle.view,
        drawer: {
          ...this.bundle.view.drawer,
          open: false,
          selectedStepId: undefined,
          inspection: undefined,
        },
      },
    };
  };

  override render() {
    const { run, timeline, drawer } = this.bundle.view;
    const inspection = drawer.inspection;

    return html`
      ${
        this.errorMessage
          ? html`<div class="banner">Failed loading run detail: ${this.errorMessage}</div>`
          : nothing
      }
      <section class="layout">
        <article class="summary">
          <h2>${run.id} | ${run.skillName}</h2>
          <div class="summary-grid">
            <div class="metric"><strong>State</strong><span>${run.state}</span></div>
            <div class="metric"><strong>Created</strong><span>${new Date(run.createdAt).toLocaleString()}</span></div>
            <div class="metric"><strong>Updated</strong><span>${new Date(run.updatedAt).toLocaleString()}</span></div>
            <div class="metric"><strong>Drawer Width</strong><span>${drawer.widthPx}px</span></div>
            <div class="metric"><strong>Live</strong><span>${this.loading ? "loading" : this.bundle.view.liveUpdates ? "yes" : "no"}</span></div>
          </div>
        </article>

        <article class="timeline">
          <h2>Timeline</h2>
          <ul class="list">
            ${timeline.map(
              (entry) => html`
                <li class="item">
                  <div class="item-main">
                    <p>${entry.summary}</p>
                    <time datetime=${entry.timestamp}>${new Date(entry.timestamp).toLocaleString()}</time>
                  </div>
                  ${
                    entry.stepId
                      ? html`<button class="inspect" type="button" @click=${() => this.openInspector(entry.stepId!)}>
                        Inspect ${entry.stepId}
                      </button>`
                      : nothing
                  }
                </li>
              `,
            )}
          </ul>
        </article>

        <article class="steps">
          <h2>Steps</h2>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Tool</th>
                <th>State</th>
                <th>Duration</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              ${run.steps.map(
                (step) => html`
                  <tr>
                    <td>${step.id}</td>
                    <td>${step.toolCall}</td>
                    <td>${step.state}</td>
                    <td>${typeof step.durationMs === "number" ? `${Math.round(step.durationMs / 10) / 100}s` : "--"}</td>
                    <td>
                      <button class="inspect" type="button" @click=${() => this.openInspector(step.id)}>Open</button>
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </article>
      </section>

      <dashboard-detail-drawer
        .open=${drawer.open}
        .widthPx=${drawer.widthPx}
        title="Step Inspector"
        @dashboard:drawer-close=${this.closeDrawer}
      >
        ${
          inspection
            ? html`
              <section class="drawer-stack">
                <div class="drawer-group">
                  <h3>${inspection.step.id} | ${inspection.step.toolCall}</h3>
                  <p>Duration: ${inspection.durationLabel ?? "running"}</p>
                </div>
                <div class="drawer-group">
                  <h3>Input</h3>
                  <pre>${inspection.formattedInput}</pre>
                </div>
                <div class="drawer-group">
                  <h3>Output</h3>
                  <pre>${inspection.formattedOutput ?? "pending"}</pre>
                </div>
                <div class="drawer-group">
                  <h3>Artifacts</h3>
                  <pre>${inspection.artifactIds.length ? inspection.artifactIds.join("\n") : "none"}</pre>
                </div>
              </section>
            `
            : html`
                <p>Select a timeline entry or step to inspect.</p>
              `
        }
      </dashboard-detail-drawer>
    `;
  }
}
