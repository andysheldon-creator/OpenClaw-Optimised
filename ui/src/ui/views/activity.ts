import { html, nothing } from "lit";
import type {
  CostUsageSummary,
  GatewaySessionRow,
  SecurityFinding,
  SessionsListResult,
} from "../types";
import { formatAgo } from "../format";

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000)
    return value >= 10000 ? `${Math.round(value / 1000)}k` : `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

export type ActivityProps = {
  connected: boolean;
  loading: boolean;
  usageResult: CostUsageSummary | null;
  days: number;
  sessionsResult: SessionsListResult | null;
  error: string | null;
  securityFindings: SecurityFinding[] | null;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

function groupSessionsByChannel(sessions: GatewaySessionRow[]): Map<string, number> {
  const byChannel = new Map<string, number>();
  for (const s of sessions) {
    const ch = s.channel ?? s.lastChannel ?? "unknown";
    byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
  }
  return byChannel;
}

export function renderActivity(props: ActivityProps) {
  if (!props.connected) {
    return html`
      <section class="card">
        <div class="card-title">Activity</div>
        <div class="muted">
          Connect to the gateway to see usage, tokens, channels, and security for a date range.
        </div>
      </section>
    `;
  }

  const totals = props.usageResult?.totals;
  const sessions = props.sessionsResult?.sessions ?? [];
  const byChannel = groupSessionsByChannel(sessions);
  const presetDays = [7, 14, 30];

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Date range</div>
          <div class="card-sub">
            Last N days for token usage and cost. Sessions and channels show recent activity (not
            filtered by range).
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          ${presetDays.map(
            (d) => html`
              <button
                class="btn ${props.days === d ? "btn--primary" : ""}"
                ?disabled=${props.loading}
                @click=${() => props.onDaysChange(d)}
              >
                ${d} days
              </button>
            `,
          )}
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 14px;">${props.error}</div>`
          : nothing
      }
    </section>

    <section class="grid grid-cols-2" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="card-title">Tokens used</div>
        <div class="card-sub">Input, output, cache (last ${props.days} days).</div>
        ${
          totals
            ? html`
              <div style="margin-top: 12px;">
                <div class="row" style="gap: 16px; flex-wrap: wrap;">
                  <span><strong>Input:</strong> ${formatTokenCount(totals.input)}</span>
                  <span><strong>Output:</strong> ${formatTokenCount(totals.output)}</span>
                  <span><strong>Total:</strong> ${formatTokenCount(totals.totalTokens)}</span>
                </div>
                <div style="margin-top: 8px;">
                  <strong>Est. cost:</strong> ${formatUsd(totals.totalCost)}
                  ${
                    totals.missingCostEntries > 0
                      ? html` <span class="muted">(${totals.missingCostEntries} entries without cost)</span>`
                      : nothing
                  }
                </div>
              </div>
            `
            : html`
                <div class="muted" style="margin-top: 8px">No usage data for this range.</div>
              `
        }
      </div>
      <div class="card stat-card">
        <div class="card-title">Incoming channels</div>
        <div class="card-sub">Sessions by channel (from session list).</div>
        ${
          byChannel.size > 0
            ? html`
              <ul style="margin-top: 12px; padding-left: 20px;">
                ${Array.from(byChannel.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([ch, count]) => html`<li><span class="mono">${ch}</span>: ${count}</li>`)}
              </ul>
            `
            : html`
                <div class="muted" style="margin-top: 8px">No sessions in list.</div>
              `
        }
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Tools used</div>
      <div class="card-sub">Tool invocation counts for the range.</div>
      <div class="muted" style="margin-top: 8px;">Coming soon. Tool usage aggregation will appear here.</div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Memory (sessions)</div>
      <div class="card-sub">What is stored: session count and recent session metadata.</div>
      ${
        sessions.length > 0
          ? html`
            <div style="margin-top: 12px;">
              <div class="muted">${sessions.length} session(s) in list.</div>
              <ul style="margin-top: 8px; padding-left: 20px; max-height: 200px; overflow-y: auto;">
                ${sessions.slice(0, 20).map(
                  (s) =>
                    html`<li>
                      <span class="mono">${s.displayName ?? s.key ?? "—"}</span>
                      ${s.updatedAt ? html`<span class="muted">${formatAgo(s.updatedAt)}</span>` : nothing}
                      ${s.channel ? html` <span class="mono">${s.channel}</span>` : nothing}
                    </li>`,
                )}
              </ul>
              ${sessions.length > 20 ? html`<div class="muted">… and ${sessions.length - 20} more.</div>` : nothing}
            </div>
          `
          : html`
              <div class="muted" style="margin-top: 8px">No sessions.</div>
            `
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Security</div>
      <div class="card-sub">Audit findings (info, warn, critical).</div>
      ${
        props.securityFindings && props.securityFindings.length > 0
          ? html`
            <ul style="margin-top: 12px; padding-left: 20px;">
              ${props.securityFindings.slice(0, 15).map(
                (f) =>
                  html`<li>
                    <span class="pill ${f.severity === "critical" ? "danger" : f.severity === "warn" ? "warn" : ""}">${f.severity}</span>
                    ${f.title}: ${f.detail.slice(0, 120)}${f.detail.length > 120 ? "…" : ""}
                  </li>`,
              )}
            </ul>
            ${props.securityFindings.length > 15 ? html`<div class="muted">… and ${props.securityFindings.length - 15} more.</div>` : nothing}
          `
          : html`
              <div class="muted" style="margin-top: 8px">
                No audit findings in this view. Run
                <code>openclaw security audit</code> in the CLI for a full report.
              </div>
            `
      }
    </section>
  `;
}
