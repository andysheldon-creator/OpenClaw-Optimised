import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  fetchBindings,
  fetchSkillsRegistry,
  fetchWorkflowCatalog,
  mutateWorkflow,
  upsertBinding,
} from "../data/live-api.ts";

@customElement("dashboard-workflow-editor-view")
export class DashboardWorkflowEditorView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      color: #f4f7ff;
    }

    .canvas-panel {
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 14px;
      background: rgba(8, 14, 31, 0.9);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .toolbar {
      border-bottom: 1px solid rgba(175, 196, 255, 0.18);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      align-items: center;
    }

    .toolbar-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: #d8e6ff;
    }

    .button {
      border: 1px solid rgba(175, 196, 255, 0.3);
      background: rgba(18, 29, 57, 0.82);
      color: #d8e6ff;
      border-radius: 9px;
      padding: 7px 10px;
      font: inherit;
      cursor: pointer;
    }

    .button.primary {
      border-color: rgba(34, 197, 94, 0.48);
      background: rgba(34, 197, 94, 0.2);
      color: #dcfce7;
    }

    .status {
      margin-left: auto;
      color: #a7b6d6;
      font-size: 0.84rem;
    }

    .n8n-frame {
      width: 100%;
      height: 620px;
      border: 0;
      background: #1a1a2e;
    }

    .binding-panel {
      margin-top: 12px;
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 12px;
      background:
        linear-gradient(180deg, rgba(14, 165, 233, 0.08), transparent 42%), rgba(8, 14, 31, 0.9);
      padding: 12px;
      display: grid;
      gap: 10px;
    }

    .binding-panel h3 {
      margin: 0;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b6c1dd;
    }

    .binding-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
    }

    .binding-grid label {
      display: grid;
      gap: 4px;
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #a7b6d6;
    }

    .binding-grid input,
    .binding-grid select {
      border: 1px solid rgba(175, 196, 255, 0.24);
      border-radius: 8px;
      background: rgba(18, 29, 57, 0.78);
      color: #f4f7ff;
      padding: 7px 9px;
      font: inherit;
    }

    .binding-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .validation {
      margin: 0;
      padding-left: 16px;
      color: #fda4af;
      font-size: 0.82rem;
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

    @media (max-width: 980px) {
      .n8n-frame {
        height: 480px;
      }
    }
  `;

  @state() private workflows: Array<{ id: string; name: string }> = [];
  @state() private skills: string[] = [];
  @state() private bindingId = "";
  @state() private workflowId = "";
  @state() private nodeId = "";
  @state() private skillName = "";
  @state() private parameterMap = "";
  @state() private requiredTools = "";
  @state() private requiredEnv = "";
  @state() private requiredSecrets = "";
  @state() private bindingReason = "Dashboard binding update.";
  @state() private bindingStatus = "";
  @state() private bindingIssues: string[] = [];
  @state() private errorMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadLiveData();
  }

  private async loadLiveData(): Promise<void> {
    this.errorMessage = "";
    try {
      const [bindings, workflows, skillsRegistry] = await Promise.all([
        fetchBindings(),
        fetchWorkflowCatalog(),
        fetchSkillsRegistry(),
      ]);
      this.workflows = workflows.map((item) => ({ id: item.id, name: item.name }));
      this.skills = skillsRegistry.cards.map((item) => item.name).toSorted();

      const firstBinding = bindings[0];
      if (firstBinding) {
        this.bindingId = firstBinding.id;
        this.workflowId = firstBinding.workflowId;
        this.nodeId = firstBinding.nodeId;
        this.skillName = firstBinding.skillName;
        this.parameterMap = Object.entries(firstBinding.parameterMap)
          .map(([key, value]) => `${key}=${value}`)
          .join(",");
        this.requiredTools = firstBinding.requiredTools.join(",");
        this.requiredEnv = firstBinding.requiredEnv.join(",");
        this.requiredSecrets = firstBinding.requiredSecrets.join(",");
      } else {
        this.workflowId = this.workflows[0]?.id ?? "";
        this.skillName = this.skills[0] ?? "";
      }
      this.bindingStatus = `Live inventory loaded at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.errorMessage = String(error);
      this.bindingStatus = "Failed loading live inventory.";
    }
  }

  private parseCsv(value: string): string[] {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseParameterMap(value: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }
      const index = trimmed.indexOf("=");
      if (index < 1) {
        continue;
      }
      const key = trimmed.slice(0, index).trim();
      const mapped = trimmed.slice(index + 1).trim();
      if (!key) {
        continue;
      }
      out[key] = mapped;
    }
    return out;
  }

  private readonly refreshLiveData = (): void => {
    void this.loadLiveData();
  };

  private readonly openN8nFullscreen = (): void => {
    window.open("/workflows/", "_blank");
  };

  private readonly reloadIframe = (): void => {
    const iframe = this.shadowRoot?.querySelector<HTMLIFrameElement>(".n8n-frame");
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  private readonly saveBinding = async (): Promise<void> => {
    this.bindingIssues = [];
    if (!this.workflowId || !this.nodeId || !this.skillName) {
      this.bindingStatus = "workflowId, nodeId, and skillName are required.";
      return;
    }

    this.bindingStatus = "Validating binding...";
    const result = await upsertBinding({
      id: this.bindingId || undefined,
      workflowId: this.workflowId,
      nodeId: this.nodeId,
      skillName: this.skillName,
      parameterMap: this.parseParameterMap(this.parameterMap),
      requiredSecrets: this.parseCsv(this.requiredSecrets),
      requiredTools: this.parseCsv(this.requiredTools),
      requiredEnv: this.parseCsv(this.requiredEnv),
      reason: this.bindingReason,
    });

    if (!result.ok) {
      this.bindingStatus = result.error ?? "Binding validation failed.";
      this.bindingIssues = result.validation?.issues.map((issue) => issue.message) ?? [];
      return;
    }

    this.bindingStatus = result.validation?.valid
      ? "Binding saved with passing preflight."
      : "Binding saved with warnings.";
    this.bindingIssues = result.validation?.issues.map((issue) => issue.message) ?? [];
    await this.loadLiveData();
  };

  private readonly runSelectedWorkflow = async (): Promise<void> => {
    if (!this.workflowId) {
      this.bindingStatus = "Select a workflow first.";
      return;
    }
    const reason =
      window.prompt("Reason for workflow.run:", "Run from dashboard workflow editor.") ?? "";
    const trimmed = reason.trim();
    if (!trimmed) {
      this.bindingStatus = "Run canceled: reason is required.";
      return;
    }
    this.bindingStatus = `Running workflow ${this.workflowId}...`;
    const result = await mutateWorkflow({
      workflowId: this.workflowId,
      action: "workflow.run",
      reason: trimmed,
    });
    if (!result.ok) {
      this.bindingStatus = result.error ?? "Workflow run failed.";
      return;
    }
    this.bindingStatus = result.requiresApproval
      ? `Queued approval ${result.approvalId ?? "pending"} for workflow run.`
      : `Workflow run started: ${this.workflowId}`;
  };

  override render() {
    return html`
      ${this.errorMessage ? html`<div class="banner">Failed loading live control-plane data: ${this.errorMessage}</div>` : html``}

      <section class="canvas-panel" aria-label="n8n workflow canvas">
        <header class="toolbar">
          <span class="toolbar-title">n8n Workflow Canvas</span>
          <button class="button" type="button" @click=${this.reloadIframe}>Reload</button>
          <button class="button" type="button" @click=${this.openN8nFullscreen}>Open Fullscreen</button>
          <button class="button" type="button" @click=${this.refreshLiveData}>Refresh Bindings</button>
          <span class="status">${this.bindingStatus}</span>
        </header>
        <iframe
          class="n8n-frame"
          src="/workflows/"
          title="n8n Workflow Editor"
          allow="clipboard-read; clipboard-write"
        ></iframe>
      </section>

      <section class="binding-panel" aria-label="Skill binding preflight">
        <h3>Skill Binding Preflight</h3>
        <div class="binding-grid">
          <label>
            Workflow
            <select .value=${this.workflowId} @change=${(event: Event) => {
              this.workflowId = (event.target as HTMLSelectElement).value;
            }}>
              <option value="">Select workflow</option>
              ${this.workflows.map((item) => html`<option value=${item.id}>${item.name}</option>`)}
            </select>
          </label>
          <label>
            Node ID
            <input
              type="text"
              .value=${this.nodeId}
              @input=${(event: Event) => {
                this.nodeId = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label>
            Skill
            <select .value=${this.skillName} @change=${(event: Event) => {
              this.skillName = (event.target as HTMLSelectElement).value;
            }}>
              <option value="">Select skill</option>
              ${this.skills.map((item) => html`<option value=${item}>${item}</option>`)}
            </select>
          </label>
          <label>
            Parameter Map (input=workflow.path)
            <input
              type="text"
              .value=${this.parameterMap}
              @input=${(event: Event) => {
                this.parameterMap = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label>
            Required Tools (comma list)
            <input
              type="text"
              .value=${this.requiredTools}
              @input=${(event: Event) => {
                this.requiredTools = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label>
            Required Env (comma list)
            <input
              type="text"
              .value=${this.requiredEnv}
              @input=${(event: Event) => {
                this.requiredEnv = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label>
            Required Secrets (comma list)
            <input
              type="text"
              .value=${this.requiredSecrets}
              @input=${(event: Event) => {
                this.requiredSecrets = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label>
            Reason
            <input
              type="text"
              .value=${this.bindingReason}
              @input=${(event: Event) => {
                this.bindingReason = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
        </div>

        <div class="binding-actions">
          <button class="button primary" type="button" @click=${this.saveBinding}>Validate + Save Binding</button>
          <button class="button" type="button" @click=${this.runSelectedWorkflow}>Run Selected Workflow</button>
          <span class="status">${this.bindingStatus}</span>
        </div>

        ${
          this.bindingIssues.length
            ? html`<ul class="validation">${this.bindingIssues.map((item) => html`<li>${item}</li>`)}</ul>`
            : html``
        }
      </section>
    `;
  }
}
