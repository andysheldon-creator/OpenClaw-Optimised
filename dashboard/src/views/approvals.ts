import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  ApprovalQueueConfig,
  ApprovalQueueItem,
  ApprovalUrgency,
} from "../../../src/clawdbot/ui/approval-queue.ts";
import { DEFAULT_APPROVAL_QUEUE_CONFIG } from "../../../src/clawdbot/ui/approval-queue.ts";
import { fetchApprovals, resolveApproval } from "../data/live-api.ts";

function cloneDefaultConfig(): ApprovalQueueConfig {
  return {
    ...DEFAULT_APPROVAL_QUEUE_CONFIG,
    filter: {
      ...DEFAULT_APPROVAL_QUEUE_CONFIG.filter,
      statuses: [...DEFAULT_APPROVAL_QUEUE_CONFIG.filter.statuses],
      skillNames: [...DEFAULT_APPROVAL_QUEUE_CONFIG.filter.skillNames],
    },
  };
}

const URGENCY_ORDER: Record<ApprovalUrgency, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

@customElement("dashboard-approvals-view")
export class DashboardApprovalsView extends LitElement {
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

    .meta {
      margin-left: auto;
      align-self: end;
      color: #a7b6d6;
      font-size: 0.82rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th,
    td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
      white-space: nowrap;
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #b6c1dd;
      background: rgba(18, 29, 57, 0.62);
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(175, 196, 255, 0.24);
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .urgency-critical {
      border-color: rgba(251, 113, 133, 0.58);
      color: #fda4af;
    }

    .urgency-high {
      border-color: rgba(251, 191, 36, 0.58);
      color: #fde68a;
    }

    .urgency-normal {
      border-color: rgba(125, 211, 252, 0.58);
      color: #bae6fd;
    }

    .urgency-low {
      border-color: rgba(148, 163, 184, 0.58);
      color: #cbd5e1;
    }

    .status-pending {
      color: #fcd34d;
    }

    .status-approved {
      color: #6ee7b7;
    }

    .status-rejected,
    .status-expired {
      color: #fda4af;
    }

    .actions {
      display: flex;
      gap: 6px;
    }

    .stub {
      border: 1px solid rgba(175, 196, 255, 0.24);
      background: rgba(18, 29, 57, 0.82);
      color: #d8e6ff;
      border-radius: 9px;
      padding: 6px 9px;
      font: inherit;
      cursor: pointer;
    }

    .stub:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .banner {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.14);
      color: #fde68a;
      background: rgba(251, 191, 36, 0.14);
      font-size: 0.84rem;
    }

    .loading {
      padding: 12px 14px;
      color: #b6c1dd;
      border-bottom: 1px solid rgba(175, 196, 255, 0.12);
      font-size: 0.88rem;
    }
  `;

  @state() private config = cloneDefaultConfig();
  @state() private items: ApprovalQueueItem[] = [];
  @state() private loading = true;
  @state() private statusMessage = "";
  @state() private errorMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadApprovals();
  }

  private async loadApprovals(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    try {
      this.items = await fetchApprovals();
      this.statusMessage = `Last load ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.items = [];
      this.errorMessage = String(error);
    } finally {
      this.loading = false;
    }
  }

  private async takeApprovalAction(
    item: ApprovalQueueItem,
    decision: "approved" | "rejected",
  ): Promise<void> {
    const reason =
      window.prompt(
        `${decision === "approved" ? "Approve" : "Reject"} ${item.id}. Enter reason:`,
        decision === "approved" ? "Approved from dashboard." : "Rejected from dashboard.",
      ) ?? "";
    const trimmed = reason.trim();
    if (!trimmed) {
      this.statusMessage = "Approval reason is required.";
      return;
    }

    this.statusMessage = `${decision === "approved" ? "Approving" : "Rejecting"} ${item.id}...`;
    const result = await resolveApproval({
      approvalId: item.id,
      decision,
      reason: trimmed,
    });
    if (!result.ok) {
      this.statusMessage = result.error ?? "Approval action failed.";
      return;
    }
    this.statusMessage = `${item.id} marked ${decision}.`;
    await this.loadApprovals();
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
        statuses: status ? [status as ApprovalQueueItem["status"]] : [],
      },
    };
  };

  private readonly handleUrgency = (event: Event): void => {
    const urgency = (event.target as HTMLSelectElement).value;
    this.config = {
      ...this.config,
      filter: {
        ...this.config.filter,
        minUrgency: urgency ? (urgency as ApprovalUrgency) : undefined,
      },
    };
  };

  private getFilteredItems(): ApprovalQueueItem[] {
    const search = this.config.filter.search?.trim().toLowerCase() ?? "";
    const minUrgency = this.config.filter.minUrgency;

    return this.items.filter((item) => {
      if (
        this.config.filter.statuses.length &&
        !this.config.filter.statuses.includes(item.status)
      ) {
        return false;
      }

      if (minUrgency && URGENCY_ORDER[item.urgency] < URGENCY_ORDER[minUrgency]) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = `${item.id} ${item.runId} ${item.skillName} ${item.reason}`.toLowerCase();
      return haystack.includes(search);
    });
  }

  override render() {
    const rows = this.getFilteredItems();
    const selectedStatus = this.config.filter.statuses[0] ?? "";
    const selectedUrgency = this.config.filter.minUrgency ?? "";

    return html`
      <section class="panel" aria-label="Approval queue view">
        <div class="controls">
          <label>
            Search
            <input type="text" .value=${this.config.filter.search ?? ""} @input=${this.handleSearch} />
          </label>
          <label>
            Status
            <select .value=${selectedStatus} @change=${this.handleStatus}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="expired">expired</option>
            </select>
          </label>
          <label>
            Minimum Urgency
            <select .value=${selectedUrgency} @change=${this.handleUrgency}>
              <option value="">All</option>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </label>
          <div class="meta">
            page size ${this.config.pageSize} | refresh every ${this.config.refreshIntervalSec}s | ${this.statusMessage}
          </div>
        </div>

        ${this.errorMessage ? html`<div class="banner">Failed loading approvals: ${this.errorMessage}</div>` : nothing}
        ${
          this.loading
            ? html`
                <div class="loading">Loading live approvals from gateway...</div>
              `
            : nothing
        }

        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Run</th>
              <th>Skill</th>
              <th>Status</th>
              <th>Urgency</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (item) => html`
                <tr>
                  <td title=${item.reason}>${item.reason}</td>
                  <td>${item.runId}</td>
                  <td>${item.skillName}</td>
                  <td><span class=${`badge status-${item.status}`}>${item.status}</span></td>
                  <td><span class=${`badge urgency-${item.urgency}`}>${item.urgency}</span></td>
                  <td>${new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <div class="actions">
                      <button
                        class="stub"
                        type="button"
                        ?disabled=${item.status !== "pending"}
                        @click=${() => this.takeApprovalAction(item, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        class="stub"
                        type="button"
                        ?disabled=${item.status !== "pending"}
                        @click=${() => this.takeApprovalAction(item, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              `,
            )}
            ${
              rows.length === 0
                ? html`
                    <tr>
                      <td colspan="7">No approvals available.</td>
                    </tr>
                  `
                : nothing
            }
          </tbody>
        </table>
      </section>
    `;
  }
}
