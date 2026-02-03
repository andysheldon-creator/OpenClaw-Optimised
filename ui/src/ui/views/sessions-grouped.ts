/**
 * Grouped ("By Agent") view for the sessions page.
 *
 * Renders sessions hierarchically grouped by agent using the existing
 * `groupSessionsByAgent()` logic from `session-grouping.ts`. Each agent
 * is displayed as a card with a collapsible history panel.
 */

import { html, nothing } from "lit";
import type { GatewaySessionRow } from "../types";
import { formatAgo } from "../format";
import { icon } from "../icons";
import { formatSessionTokens } from "../presenter";
import { groupSessionsByAgent, type AgentNode } from "../session-grouping";
import { deriveSessionStatus, getStatusBadgeClass, type SessionsProps } from "./sessions";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderGroupedSessions(rows: GatewaySessionRow[], props: SessionsProps) {
  const agents = props.agentsList ?? null;
  const nodes = groupSessionsByAgent(rows, agents);

  if (nodes.length === 0) {
    return html`
      <div class="data-table__empty">
        <div class="data-table__empty-icon">${icon("users", { size: 32 })}</div>
        <div class="data-table__empty-title">No sessions to group</div>
        <div class="data-table__empty-desc">
          Sessions will appear here grouped by agent once conversations begin
        </div>
        <button
          class="btn btn--sm"
          style="margin-top: 12px;"
          ?disabled=${props.loading}
          @click=${props.onRefresh}
        >
          ${icon("refresh-cw", { size: 14 })}
          <span>Refresh</span>
        </button>
      </div>
    `;
  }

  return html`
    <div class="agent-grouped-sessions">
      ${nodes.map((node) => renderAgentCard(node, props))}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function renderAgentCard(node: AgentNode, props: SessionsProps) {
  const expanded = props.groupedExpandedAgents?.has(node.agentId) ?? false;

  // Flatten all sessions from channels for display
  const allSessions = flattenAgentSessions(node);
  const primarySession = allSessions[0] ?? null;
  const historySessions = allSessions.slice(1);
  const hasHistory = historySessions.length > 0;

  const agentIcon = node.emoji
    ? html`<span class="agent-group__icon agent-group__icon--emoji">${node.emoji}</span>`
    : node.avatarUrl
      ? html`<img class="agent-group__icon agent-group__icon--avatar" src=${node.avatarUrl} alt="" />`
      : html`<span class="agent-group__icon agent-group__icon--default">${icon("user", { size: 18 })}</span>`;

  return html`
    <div class="agent-group ${expanded ? "agent-group--expanded" : ""}">
      <div class="agent-group__header">
        <div class="agent-group__header-main">
          ${agentIcon}
          <div class="agent-group__header-text">
            <div class="agent-group__name-row">
              <span class="agent-group__name">${node.displayName}</span>
              ${
                node.isDefault
                  ? html`
                      <span class="badge badge--muted" style="margin-left: 6px; font-size: 10px">default</span>
                    `
                  : nothing
              }
            </div>
            <span class="agent-group__meta">
              ${node.totalSessions} session${node.totalSessions === 1 ? "" : "s"}
              ${node.lastActive ? html` &middot; ${formatAgo(node.lastActive)}` : nothing}
            </span>
          </div>
        </div>
        ${
          hasHistory
            ? html`
            <button
              class="agent-group__toggle ${expanded ? "agent-group__toggle--expanded" : ""}"
              type="button"
              @click=${() => props.onToggleGroupedAgent?.(node.agentId)}
              title="${expanded ? "Hide history" : "Show history"}"
            >
              <span class="agent-group__toggle-text">${expanded ? "Hide" : "Show"} history</span>
              <span class="agent-group__toggle-chevron">${icon("chevron-down", { size: 14 })}</span>
            </button>
          `
            : nothing
        }
      </div>

      <div class="agent-group__sessions-pane">
        ${primarySession ? renderAgentPrimarySession(primarySession, props) : nothing}

        ${
          hasHistory && expanded
            ? html`
              <div class="agent-group__history">
                <div class="agent-group__history-header">
                  ${icon("clock", { size: 12 })}
                  <span>History (${historySessions.length})</span>
                </div>
                <div class="agent-group__history-list">
                  ${historySessions.map((row, idx) => renderHistoryItem(row, idx, props))}
                </div>
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Primary session display
// ---------------------------------------------------------------------------

function renderAgentPrimarySession(row: GatewaySessionRow, props: SessionsProps) {
  const tasks = props.activeTasks?.get(row.key) ?? [];
  const status = deriveSessionStatus(row, tasks);
  const statusClass = getStatusBadgeClass(status);
  const isAborted = row.abortedLastRun === true;
  const effectiveStatus: string = isAborted ? "aborted" : status;
  const dotClass = `agent-group__session-dot agent-group__session-dot--${effectiveStatus}`;

  const title =
    row.displayName?.trim() || row.derivedTitle?.trim() || row.subject?.trim() || row.key;
  const truncTitle = title.length > 60 ? title.slice(0, 57) + "..." : title;

  const model = row.model ?? null;
  const tokens = formatSessionTokens(row);

  return html`
    <div
      class="agent-group__session agent-group__session--primary"
      role="button"
      tabindex="0"
      @click=${() => props.onDrawerOpen(row.key)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onDrawerOpen(row.key);
        }
      }}
    >
      <div class="agent-group__session-main">
        <span class="${dotClass}"></span>
        <span class="badge ${isAborted ? "badge--danger" : statusClass}">${effectiveStatus}</span>
        <div class="agent-group__session-content">
          <div class="agent-group__session-title-row">
            <span class="agent-group__session-title" title=${title}>${truncTitle}</span>
            <span class="agent-group__session-time">${formatAgo(row.updatedAt)}</span>
          </div>
          ${
            tasks.length > 0
              ? html`<div class="agent-group__session-badges">
                <span class="badge badge--info">${tasks.length} task${tasks.length === 1 ? "" : "s"}</span>
              </div>`
              : nothing
          }
          <div class="agent-group__session-meta">
            ${
              model
                ? html`<span class="agent-group__session-meta-item">${icon("brain", { size: 11 })} ${model}</span>`
                : nothing
            }
            ${
              tokens !== "n/a"
                ? html`<span class="agent-group__session-meta-item">${icon("activity", { size: 11 })} ${tokens} tokens</span>`
                : nothing
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// History item
// ---------------------------------------------------------------------------

function renderHistoryItem(row: GatewaySessionRow, index: number, props: SessionsProps) {
  const tasks = props.activeTasks?.get(row.key) ?? [];
  const status = deriveSessionStatus(row, tasks);
  const isAborted = row.abortedLastRun === true;
  const effectiveStatus: string = isAborted ? "aborted" : status;
  const dotClass = `agent-group__session-dot agent-group__session-dot--sm agent-group__session-dot--${effectiveStatus}`;
  const statusClass = getStatusBadgeClass(status);

  const title =
    row.displayName?.trim() || row.derivedTitle?.trim() || row.subject?.trim() || row.key;
  const truncTitle = title.length > 50 ? title.slice(0, 47) + "..." : title;

  return html`
    <div
      class="agent-group__history-item"
      style="animation-delay: ${index * 50}ms;"
      role="button"
      tabindex="0"
      @click=${() => props.onDrawerOpen(row.key)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onDrawerOpen(row.key);
        }
      }}
    >
      <span class="${dotClass}"></span>
      <span class="badge badge--sm ${isAborted ? "badge--danger" : statusClass}">${effectiveStatus}</span>
      <span class="agent-group__history-item-title" title=${title}>${truncTitle}</span>
      <span class="agent-group__history-item-time">${formatAgo(row.updatedAt)}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flatten all sessions from an agent node's channels into a single list,
 * sorted by most recent first.
 */
function flattenAgentSessions(node: AgentNode): GatewaySessionRow[] {
  const sessions: GatewaySessionRow[] = [];
  for (const ch of node.channels) {
    for (const group of ch.groups) {
      sessions.push(group.primary);
      sessions.push(...group.older);
    }
    for (const thread of ch.threads) {
      sessions.push(thread.primary);
      sessions.push(...thread.older);
    }
  }
  // Sort by most recent first
  sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return sessions;
}
