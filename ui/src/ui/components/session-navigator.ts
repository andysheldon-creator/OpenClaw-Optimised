/**
 * Session Navigator - a custom dropdown panel replacing the native <select>.
 *
 * Features:
 * - Compact trigger pill showing current agent + session context
 * - Agent picker sidebar
 * - Grouped session list with channel sections
 * - Expand/collapse for historical sessions
 * - Inline search
 * - Status indicators (active, idle, historical)
 */

import { html, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { formatAgo, clampText } from "../format";
import { icon } from "../icons";
import {
  groupSessionsByAgent,
  filterAgentNodes,
  resolveCurrentSessionInfo,
  type AgentNode,
  type ChannelSection,
  type SessionGroup,
} from "../session-grouping";
import type { GatewaySessionRow, AgentsListResult, SessionsListResult } from "../types";

// ---------------------------------------------------------------------------
// State (managed externally via AppViewState)
// ---------------------------------------------------------------------------

export type SessionNavigatorState = {
  /** Whether the dropdown panel is open */
  open: boolean;
  /** Currently selected agent in the panel (null = auto from session key) */
  selectedAgentId: string | null;
  /** Search query */
  search: string;
  /** Set of expanded group keys (for "+N older" sections) */
  expandedGroups: Set<string>;
};

export function createSessionNavigatorState(): SessionNavigatorState {
  return {
    open: false,
    selectedAgentId: null,
    search: "",
    expandedGroups: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SessionNavigatorProps = {
  sessionKey: string;
  connected: boolean;
  sessionsResult: SessionsListResult | null;
  agentsList: AgentsListResult | null;
  navigatorState: SessionNavigatorState;
  onSelectSession: (sessionKey: string) => void;
  onToggleOpen: () => void;
  onSelectAgent: (agentId: string) => void;
  onSearchChange: (search: string) => void;
  onToggleGroup: (groupKey: string) => void;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Channel icons
// ---------------------------------------------------------------------------

const CHANNEL_ICONS: Record<string, string> = {
  slack: "message-square",
  telegram: "send",
  discord: "message-square",
  signal: "shield",
  imessage: "message-square",
  web: "monitor",
  matrix: "layers",
  msteams: "users",
  whatsapp: "message-square",
  cron: "clock",
  heartbeat: "activity",
  other: "inbox",
};

function channelIcon(channel: string) {
  const name = CHANNEL_ICONS[channel] ?? "inbox";
  return icon(name as Parameters<typeof icon>[0], { size: 14 });
}

// ---------------------------------------------------------------------------
// Activity status
// ---------------------------------------------------------------------------

type ActivityStatus = "active" | "idle" | "historical";

function sessionActivityStatus(row: GatewaySessionRow): ActivityStatus {
  if (!row.updatedAt) return "historical";
  const ago = Date.now() - row.updatedAt;
  if (ago < 5 * 60 * 1000) return "active"; // < 5 min
  if (ago < 60 * 60 * 1000) return "idle"; // < 1 hour
  return "historical";
}

function statusDotClass(status: ActivityStatus): string {
  return `sn-status-dot sn-status-dot--${status}`;
}

// ---------------------------------------------------------------------------
// Trigger pill (always visible)
// ---------------------------------------------------------------------------

export function renderSessionNavigatorTrigger(props: SessionNavigatorProps): TemplateResult {
  const sessions = props.sessionsResult?.sessions ?? [];
  const info = resolveCurrentSessionInfo(props.sessionKey, sessions);
  const currentRow = sessions.find((s) => s.key === props.sessionKey);
  const status = currentRow ? sessionActivityStatus(currentRow) : "historical";

  // Find agent display info
  const agents = props.agentsList?.agents ?? [];
  const agentId = info.agentId;
  const agent = agentId ? agents.find((a) => a.id === agentId) : null;
  const agentEmoji = agent?.identity?.emoji?.trim();
  const agentName = agent?.identity?.name?.trim() || agent?.name?.trim() || agentId || "Chat";

  const label = info.label || info.rest || props.sessionKey;
  const truncatedLabel = clampText(label, 40);

  return html`
    <button
      class="sn-trigger ${props.navigatorState.open ? "sn-trigger--open" : ""}"
      type="button"
      ?disabled=${!props.connected}
      @click=${(e: Event) => {
        e.stopPropagation();
        props.onToggleOpen();
      }}
      title=${`${agentName} - ${label}`}
    >
      <span class="${statusDotClass(status)}" aria-hidden="true"></span>
      ${agentEmoji
        ? html`<span class="sn-trigger__emoji" aria-hidden="true">${agentEmoji}</span>`
        : html`<span class="sn-trigger__agent-badge" aria-hidden="true">${agentName.slice(0, 1).toUpperCase()}</span>`}
      <span class="sn-trigger__text">
        <span class="sn-trigger__agent">${agentName}</span>
        <span class="sn-trigger__sep" aria-hidden="true">/</span>
        <span class="sn-trigger__session" title=${label}>${truncatedLabel}</span>
      </span>
      <span class="sn-trigger__chevron" aria-hidden="true">
        ${icon(props.navigatorState.open ? "chevron-up" : "chevron-down", { size: 14 })}
      </span>
    </button>
  `;
}

// ---------------------------------------------------------------------------
// Dropdown panel
// ---------------------------------------------------------------------------

export function renderSessionNavigatorPanel(props: SessionNavigatorProps): TemplateResult {
  if (!props.navigatorState.open) return html``;

  const sessions = props.sessionsResult?.sessions ?? [];
  const agentNodes = groupSessionsByAgent(sessions, props.agentsList);
  const filtered = filterAgentNodes(agentNodes, props.navigatorState.search);

  // Resolve which agent is selected
  const info = resolveCurrentSessionInfo(props.sessionKey, sessions);
  const activeAgentId =
    props.navigatorState.selectedAgentId ?? info.agentId ?? filtered[0]?.agentId ?? null;
  const activeAgent = filtered.find((n) => n.agentId === activeAgentId) ?? filtered[0] ?? null;

  return html`
    <div class="sn-backdrop" @click=${() => props.onClose()}></div>
    <div class="sn-panel" @click=${(e: Event) => e.stopPropagation()}>
      <!-- Search bar -->
      <div class="sn-panel__search">
        <span class="sn-panel__search-icon">${icon("search", { size: 14 })}</span>
        <input
          class="sn-panel__search-input"
          type="text"
          placeholder="Search sessions..."
          .value=${props.navigatorState.search}
          @input=${(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Escape") props.onClose();
          }}
        />
        ${props.navigatorState.search
          ? html`<button
              class="sn-panel__search-clear"
              type="button"
              @click=${() => props.onSearchChange("")}
              aria-label="Clear search"
            >${icon("x", { size: 12 })}</button>`
          : nothing}
      </div>

      <div class="sn-panel__body">
        <!-- Agent sidebar -->
        <div class="sn-agents">
          ${filtered.length === 0
            ? html`<div class="sn-empty">No agents match.</div>`
            : repeat(
                filtered,
                (n) => n.agentId,
                (node) => renderAgentPill(node, activeAgentId, props),
              )}
        </div>

        <!-- Session list for selected agent -->
        <div class="sn-sessions">
          ${activeAgent
            ? renderAgentSessions(activeAgent, props)
            : html`<div class="sn-empty">Select an agent to view sessions.</div>`}
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Agent pill (sidebar item)
// ---------------------------------------------------------------------------

function renderAgentPill(
  node: AgentNode,
  activeAgentId: string | null,
  props: SessionNavigatorProps,
): TemplateResult {
  const isActive = node.agentId === activeAgentId;
  const when = node.lastActive ? formatAgo(node.lastActive) : "";

  return html`
    <button
      class="sn-agent ${isActive ? "sn-agent--active" : ""}"
      type="button"
      @click=${() => props.onSelectAgent(node.agentId)}
      title=${`${node.displayName} (${node.totalSessions} sessions)`}
    >
      <span class="sn-agent__avatar" aria-hidden="true">
        ${node.emoji
          ? html`<span class="sn-agent__emoji">${node.emoji}</span>`
          : html`<span class="sn-agent__letter">${node.displayName.slice(0, 1).toUpperCase()}</span>`}
      </span>
      <span class="sn-agent__meta">
        <span class="sn-agent__name">${node.displayName}</span>
        <span class="sn-agent__stats">
          ${node.totalSessions} session${node.totalSessions !== 1 ? "s" : ""}${when ? ` · ${when}` : ""}
        </span>
      </span>
      ${node.isDefault ? html`<span class="sn-badge sn-badge--default">Default</span>` : nothing}
    </button>
  `;
}

// ---------------------------------------------------------------------------
// Agent sessions (right panel)
// ---------------------------------------------------------------------------

function renderAgentSessions(node: AgentNode, props: SessionNavigatorProps): TemplateResult {
  if (node.channels.length === 0) {
    return html`<div class="sn-empty">No sessions for this agent.</div>`;
  }

  return html`
    <div class="sn-channel-list">
      ${node.channels.map((ch) => renderChannelSection(ch, props))}
    </div>
  `;
}

function renderChannelSection(section: ChannelSection, props: SessionNavigatorProps): TemplateResult {
  const hasGroups = section.groups.length > 0;
  const hasThreads = section.threads.length > 0;
  if (!hasGroups && !hasThreads) return html``;

  return html`
    <div class="sn-channel">
      <div class="sn-channel__header">
        <span class="sn-channel__icon">${channelIcon(section.channel)}</span>
        <span class="sn-channel__label">${section.channelLabel}</span>
        <span class="sn-channel__count">${section.groups.length + section.threads.length}</span>
      </div>

      ${hasGroups
        ? html`<div class="sn-group-list">
            ${section.groups.map((g) => renderSessionGroup(g, props))}
          </div>`
        : nothing}

      ${hasThreads
        ? html`
            <div class="sn-threads-section">
              <div class="sn-threads-label">Threads</div>
              <div class="sn-group-list">
                ${section.threads.map((g) => renderSessionGroup(g, props))}
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Session group (primary + expandable older)
// ---------------------------------------------------------------------------

function renderSessionGroup(group: SessionGroup, props: SessionNavigatorProps): TemplateResult {
  const isCurrentSession = group.primary.key === props.sessionKey;
  const status = sessionActivityStatus(group.primary);
  const when = group.primary.updatedAt ? formatAgo(group.primary.updatedAt) : "";
  const turns = group.primary.turnCount;
  const label = clampText(group.label, 50);
  const preview = group.primary.lastMessagePreview?.trim();
  const hasOlder = group.older.length > 0;
  const isExpanded = props.navigatorState.expandedGroups.has(group.groupKey);

  return html`
    <div class="sn-group ${isCurrentSession ? "sn-group--current" : ""}">
      <!-- Primary session row -->
      <button
        class="sn-session ${isCurrentSession ? "sn-session--current" : ""}"
        type="button"
        @click=${() => {
          props.onSelectSession(group.primary.key);
          props.onClose();
        }}
        title=${group.primary.key}
      >
        <span class="${statusDotClass(status)}" aria-hidden="true"></span>
        <span class="sn-session__content">
          <span class="sn-session__label">${label}</span>
          ${preview ? html`<span class="sn-session__preview">${clampText(preview, 60)}</span>` : nothing}
        </span>
        <span class="sn-session__meta">
          ${isCurrentSession ? html`<span class="sn-badge sn-badge--current">Current</span>` : nothing}
          ${turns != null && turns > 0 ? html`<span class="sn-session__turns">${turns}t</span>` : nothing}
          ${when ? html`<span class="sn-session__when">${when}</span>` : nothing}
        </span>
      </button>

      <!-- Older sessions expander -->
      ${hasOlder
        ? html`
            <button
              class="sn-expand ${isExpanded ? "sn-expand--open" : ""}"
              type="button"
              @click=${() => props.onToggleGroup(group.groupKey)}
              title=${`${group.older.length} older session${group.older.length !== 1 ? "s" : ""}`}
            >
              <span class="sn-expand__icon">${icon(isExpanded ? "chevron-up" : "chevron-down", { size: 12 })}</span>
              <span class="sn-expand__text">+${group.older.length} older</span>
            </button>
            ${isExpanded
              ? html`
                  <div class="sn-older-list">
                    ${group.older.map((row) => renderOlderSession(row, props))}
                  </div>
                `
              : nothing}
          `
        : nothing}
    </div>
  `;
}

function renderOlderSession(row: GatewaySessionRow, props: SessionNavigatorProps): TemplateResult {
  const isCurrentSession = row.key === props.sessionKey;
  const when = row.updatedAt ? formatAgo(row.updatedAt) : "";
  const dateStr = row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "";
  const turns = row.turnCount;

  return html`
    <button
      class="sn-session sn-session--older ${isCurrentSession ? "sn-session--current" : ""}"
      type="button"
      @click=${() => {
        props.onSelectSession(row.key);
        props.onClose();
      }}
      title=${row.key}
    >
      <span class="sn-status-dot sn-status-dot--historical" aria-hidden="true"></span>
      <span class="sn-session__content">
        <span class="sn-session__label">${dateStr || when}</span>
        ${row.lastMessagePreview?.trim()
          ? html`<span class="sn-session__preview">${clampText(row.lastMessagePreview.trim(), 50)}</span>`
          : nothing}
      </span>
      <span class="sn-session__meta">
        ${isCurrentSession ? html`<span class="sn-badge sn-badge--current">Current</span>` : nothing}
        ${turns != null && turns > 0 ? html`<span class="sn-session__turns">${turns}t</span>` : nothing}
        ${when ? html`<span class="sn-session__when">${when}</span>` : nothing}
      </span>
    </button>
  `;
}
