import { html, nothing } from "lit";
import type {
  AgentsListResult,
  GatewayAgentRow,
  GatewaySessionRow,
  SessionsListResult,
} from "../types";
import { parseAgentSessionKey } from "../../../../src/routing/session-key.js";
import { skeleton } from "../components/design-utils";
import { formatAgo } from "../format";
import { icon } from "../icons";
import { inferSessionType, type AgentSessionType } from "../session-meta";

export type AgentSessionsTypeFilter = "all" | AgentSessionType;

type AgentSessionStats = {
  total: number;
  cron: number;
  regular: number;
  updatedAtMax: number;
};

type AgentEntry = {
  agentId: string;
  known: boolean;
  agent: GatewayAgentRow | null;
  displayName: string;
  subtitle: string | null;
  isDefault: boolean;
  stats: AgentSessionStats;
};

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearch(haystack: string, search: string): boolean {
  if (!search) return true;
  return haystack.toLowerCase().includes(search);
}

function agentDisplayName(agent: GatewayAgentRow | null): string {
  const identityName = agent?.identity?.name?.trim();
  const name = agent?.name?.trim();
  if (identityName) return identityName;
  if (name) return name;
  return agent?.id ?? "Unknown";
}

function agentSubtitle(agent: GatewayAgentRow | null): string | null {
  const theme = agent?.identity?.theme?.trim();
  const raw = theme || null;
  return raw;
}

function renderAgentAvatar(agent: GatewayAgentRow | null) {
  const emoji = agent?.identity?.emoji?.trim();
  const avatarUrl = agent?.identity?.avatarUrl?.trim() || agent?.identity?.avatar?.trim() || "";
  if (emoji) {
    return html`<span class="agents-avatar__emoji" aria-hidden="true">${emoji}</span>`;
  }
  if (avatarUrl) {
    return html`<img class="agents-avatar__img" src=${avatarUrl} alt="" loading="lazy" decoding="async" />`;
  }
  const letter = agentDisplayName(agent).trim().slice(0, 1).toUpperCase() || "?";
  return html`<span class="agents-avatar__letter" aria-hidden="true">${letter}</span>`;
}

function computeAgentSessionStats(rows: GatewaySessionRow[]): Map<string, AgentSessionStats> {
  const map = new Map<string, AgentSessionStats>();
  for (const row of rows) {
    const parsed = parseAgentSessionKey(row.key);
    if (!parsed?.agentId) continue;
    const agentId = parsed.agentId;
    const current =
      map.get(agentId) ??
      ({
        total: 0,
        cron: 0,
        regular: 0,
        updatedAtMax: 0,
      } satisfies AgentSessionStats);
    current.total += 1;
    if (inferSessionType(row.key) === "cron") current.cron += 1;
    else current.regular += 1;
    const updatedAt = row.updatedAt ?? 0;
    if (updatedAt > current.updatedAtMax) current.updatedAtMax = updatedAt;
    map.set(agentId, current);
  }
  return map;
}

function buildAgentEntries(params: {
  agents: AgentsListResult | null;
  sessions: SessionsListResult | null;
  search: string;
}): AgentEntry[] {
  const search = normalizeSearch(params.search);
  const knownAgents = params.agents?.agents ?? [];
  const defaultId = params.agents?.defaultId ?? null;
  const sessionRows = params.sessions?.sessions ?? [];
  const statsByAgent = computeAgentSessionStats(sessionRows);

  const knownIds = new Set(knownAgents.map((a) => a.id));
  const derivedIds = [...statsByAgent.keys()].filter((id) => !knownIds.has(id));

  const allAgents: AgentEntry[] = [
    ...knownAgents.map((agent) => {
      const stats =
        statsByAgent.get(agent.id) ??
        ({
          total: 0,
          cron: 0,
          regular: 0,
          updatedAtMax: 0,
        } satisfies AgentSessionStats);
      const displayName = agentDisplayName(agent);
      const subtitle = agentSubtitle(agent);
      const searchable = [
        agent.id,
        displayName,
        subtitle,
        agent.identity?.theme,
        agent.identity?.emoji,
      ]
        .filter(Boolean)
        .join(" ");
      if (search && !matchesSearch(searchable, search)) return null;
      return {
        agentId: agent.id,
        known: true,
        agent,
        displayName,
        subtitle,
        isDefault: defaultId === agent.id,
        stats,
      } satisfies AgentEntry;
    }),
    ...derivedIds.map((agentId) => {
      const stats = statsByAgent.get(agentId)!;
      const searchable = [agentId].join(" ");
      if (search && !matchesSearch(searchable, search)) return null;
      return {
        agentId,
        known: false,
        agent: { id: agentId },
        displayName: agentId,
        subtitle: "Discovered from sessions",
        isDefault: defaultId === agentId,
        stats,
      } satisfies AgentEntry;
    }),
  ].filter(Boolean) as AgentEntry[];

  return allAgents.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (b.stats.updatedAtMax !== a.stats.updatedAtMax)
      return b.stats.updatedAtMax - a.stats.updatedAtMax;
    if (b.stats.total !== a.stats.total) return b.stats.total - a.stats.total;
    return a.displayName.localeCompare(b.displayName);
  });
}

function sessionTitle(row: GatewaySessionRow): string {
  return (row.displayName?.trim() || row.derivedTitle?.trim() || row.key.trim()).trim();
}

function matchesSessionSearch(row: GatewaySessionRow, search: string): boolean {
  if (!search) return true;
  const searchable = [
    row.key,
    row.displayName,
    row.derivedTitle,
    row.channel,
    row.subject,
    row.groupChannel,
    row.description,
    row.lastMessagePreview,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return searchable.includes(search);
}

function filterSessionsForAgent(params: {
  rows: GatewaySessionRow[];
  agentId: string;
  typeFilter: AgentSessionsTypeFilter;
  search: string;
}): GatewaySessionRow[] {
  const search = normalizeSearch(params.search);
  return params.rows
    .filter((row) => {
      const parsed = parseAgentSessionKey(row.key);
      if (!parsed?.agentId) return false;
      if (parsed.agentId !== params.agentId) return false;
      if (params.typeFilter !== "all" && inferSessionType(row.key) !== params.typeFilter)
        return false;
      if (search && !matchesSessionSearch(row, search)) return false;
      return true;
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function renderAgentsSkeleton() {
  return html`
    <div style="display: grid; gap: 14px; padding: 14px;">
      ${skeleton({ width: "100%", height: "420px", rounded: true })}
      ${skeleton({ width: "100%", height: "520px", rounded: true })}
    </div>
  `;
}

export type AgentsProps = {
  loading: boolean;
  agents: AgentsListResult | null;
  sessions: SessionsListResult | null;
  error: string | null;
  selectedAgentKey: string | null;
  agentSearch: string;
  sessionSearch: string;
  sessionTypeFilter: AgentSessionsTypeFilter;
  onSelectAgent: (agentId: string) => void;
  onAgentSearchChange: (search: string) => void;
  onSessionSearchChange: (search: string) => void;
  onSessionTypeFilterChange: (next: AgentSessionsTypeFilter) => void;
  onSessionOpenChat: (sessionKey: string) => void;
  onAgentOpenChat: (agentId: string) => void | Promise<void>;
  onRefresh: () => void;
};

function renderAgentsList(props: AgentsProps, entries: AgentEntry[]) {
  const selected = props.selectedAgentKey?.trim() || null;

  return html`
    <div class="agents-pane agents-pane--list">
      <div class="agents-pane__header">
        <div class="table-filters--modern agents-filters">
          <div class="field--modern" style="flex: 1; min-width: 220px;">
            <label class="field__label">Agents</label>
            <div class="field__input-wrapper">
              <span class="field__icon">${icon("search", { size: 14 })}</span>
              <input
                class="field__input"
                type="text"
                placeholder="Search by name, id, theme…"
                .value=${props.agentSearch}
                @input=${(e: Event) => props.onAgentSearchChange((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div class="agents-pane__body">
        ${
          entries.length === 0
            ? html`
                <div class="agents-empty">No agents match the current search.</div>
              `
            : html`
            <div class="agents-list" role="list">
              ${entries.map((entry) => {
                const isSelected = selected === entry.agentId;
                const stats = entry.stats;
                return html`
                  <button
                    class="agents-list-item ${isSelected ? "agents-list-item--selected" : ""}"
                    type="button"
                    role="listitem"
                    aria-current=${isSelected ? "true" : "false"}
                    @click=${() => props.onSelectAgent(entry.agentId)}
                  >
                    <span class="agents-avatar" aria-hidden="true">${renderAgentAvatar(entry.agent)}</span>
                    <span class="agents-list-item__meta">
                      <span class="agents-list-item__name" title=${entry.displayName}>${entry.displayName}</span>
                      <span class="agents-list-item__id" title=${entry.agentId}>${entry.agentId}</span>
                      ${entry.subtitle ? html`<span class="agents-list-item__sub" title=${entry.subtitle}>${entry.subtitle}</span>` : nothing}
                    </span>
                    <span class="agents-list-item__badges" aria-hidden="true">
                      ${
                        entry.isDefault
                          ? html`
                              <span class="badge badge--success">Default</span>
                            `
                          : nothing
                      }
                      ${
                        entry.known
                          ? nothing
                          : html`
                              <span class="badge badge--warning">Unknown</span>
                            `
                      }
                      ${
                        stats.total > 0
                          ? html`<span class="badge badge--muted">${stats.total} sessions</span>`
                          : html`
                              <span class="badge badge--muted">No sessions</span>
                            `
                      }
                      ${stats.cron > 0 ? html`<span class="badge badge--warning">Cron ${stats.cron}</span>` : nothing}
                    </span>
                  </button>
                `;
              })}
            </div>
          `
        }
      </div>
    </div>
  `;
}

function renderAgentDetail(props: AgentsProps, entries: AgentEntry[], rows: GatewaySessionRow[]) {
  const selected = props.selectedAgentKey?.trim() || null;
  const entry = selected ? (entries.find((e) => e.agentId === selected) ?? null) : null;

  if (!selected) {
    return html`
      <div class="agents-pane agents-pane--detail">
        <div class="agents-pane__body">
          <div class="agents-empty agents-empty--detail">
            <div class="agents-empty__title">Select an agent</div>
            <div class="agents-empty__sub">
              Pick an agent on the left to see identity details and recent sessions.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const agent = entry?.agent ?? { id: selected };
  const stats =
    entry?.stats ??
    ({ total: 0, cron: 0, regular: 0, updatedAtMax: 0 } satisfies AgentSessionStats);
  const filtered = filterSessionsForAgent({
    rows,
    agentId: selected,
    typeFilter: props.sessionTypeFilter,
    search: props.sessionSearch,
  });

  const shownSessions = filtered.slice(0, 50);
  const overflow = filtered.length - shownSessions.length;
  const updated = stats.updatedAtMax ? formatAgo(stats.updatedAtMax) : "n/a";

  return html`
    <div class="agents-pane agents-pane--detail">
      <div class="agents-pane__body">
        <div class="agents-detail-header">
          <div class="agents-detail-header__left">
            <div class="agents-avatar agents-avatar--lg">${renderAgentAvatar(agent)}</div>
            <div class="agents-detail-header__meta">
              <div class="agents-detail-header__title" title=${agentDisplayName(agent)}>${agentDisplayName(agent)}</div>
              <div class="agents-detail-header__subtitle" title=${selected}>${selected}</div>
              <div class="agents-detail-header__badges">
                ${
                  entry?.isDefault
                    ? html`
                        <span class="badge badge--success">Default</span>
                      `
                    : nothing
                }
                ${agent.identity?.theme ? html`<span class="badge badge--muted">${agent.identity.theme}</span>` : nothing}
                ${
                  stats.total > 0
                    ? html`<span class="badge badge--muted">${stats.total} sessions</span>`
                    : html`
                        <span class="badge badge--muted">No sessions yet</span>
                      `
                }
                ${stats.cron > 0 ? html`<span class="badge badge--warning">Cron ${stats.cron}</span>` : nothing}
                ${stats.regular > 0 ? html`<span class="badge badge--muted">Regular ${stats.regular}</span>` : nothing}
              </div>
            </div>
          </div>

          <div class="agents-detail-header__actions">
            <button class="btn btn--secondary btn--sm" type="button" @click=${props.onRefresh}>
              ${icon("refresh-cw", { size: 12 })} <span>Refresh</span>
            </button>
            <button class="btn btn--primary btn--sm" type="button" @click=${() => props.onAgentOpenChat(selected)}>
              ${icon("message-square", { size: 12 })} <span>Open chat</span>
            </button>
          </div>
        </div>

        <div class="agents-detail-meta">
          <div class="agents-detail-meta__item">
            <div class="agents-detail-meta__k">Last updated</div>
            <div class="agents-detail-meta__v">${updated}</div>
          </div>
          <div class="agents-detail-meta__item">
            <div class="agents-detail-meta__k">Identity</div>
            <div class="agents-detail-meta__v">
              ${(agent.identity?.name || agent.name || "").trim() || "—"}
            </div>
          </div>
          <div class="agents-detail-meta__item">
            <div class="agents-detail-meta__k">Emoji</div>
            <div class="agents-detail-meta__v">${agent.identity?.emoji?.trim() || "—"}</div>
          </div>
        </div>

        <div class="agents-sessions">
          <div class="agents-sessions__header">
            <div class="agents-sessions__title">Recent sessions</div>
            <div class="agents-sessions__hint">
              Showing ${Math.min(shownSessions.length, filtered.length)} of ${filtered.length}${
                overflow > 0
                  ? html`
                      (showing newest)
                    `
                  : nothing
              }
            </div>
          </div>

          <div class="table-filters--modern agents-sessions__filters">
            <div class="field--modern" style="flex: 1; min-width: 220px;">
              <label class="field__label">Filter</label>
              <div class="field__input-wrapper">
                <span class="field__icon">${icon("search", { size: 14 })}</span>
                <input
                  class="field__input"
                  type="text"
                  placeholder="Search sessions…"
                  .value=${props.sessionSearch}
                  @input=${(e: Event) => props.onSessionSearchChange((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>
            <div class="field--modern" style="min-width: 140px;">
              <label class="field__label">Type</label>
              <select
                class="field__input"
                .value=${props.sessionTypeFilter}
                @change=${(e: Event) => props.onSessionTypeFilterChange((e.target as HTMLSelectElement).value as AgentSessionsTypeFilter)}
              >
                <option value="all">All</option>
                <option value="regular">Regular</option>
                <option value="cron">Cron</option>
              </select>
            </div>
          </div>

          ${
            filtered.length === 0
              ? html`
                  <div class="agents-empty">No sessions match the current filters.</div>
                `
              : html`
              <div class="agents-session-list" role="list">
                ${shownSessions.map((row) => {
                  const type = inferSessionType(row.key);
                  const when = row.updatedAt ? formatAgo(row.updatedAt) : "n/a";
                  const title = sessionTitle(row);
                  const subtitle = [row.channel, row.subject].filter(Boolean).join(" · ");
                  const preview =
                    (typeof row.description === "string" && row.description.trim()
                      ? row.description.trim()
                      : "") ||
                    (typeof row.lastMessagePreview === "string" && row.lastMessagePreview.trim()
                      ? row.lastMessagePreview.trim()
                      : "");
                  return html`
                    <button
                      class="agents-session-item"
                      type="button"
                      role="listitem"
                      @click=${() => props.onSessionOpenChat(row.key)}
                    >
                      <span class="agents-session-item__icon">
                        ${icon(type === "cron" ? "clock" : "message-square", { size: 14 })}
                      </span>
                      <span class="agents-session-item__meta">
                        <span class="agents-session-item__title" title=${title}>${title}</span>
                        ${subtitle ? html`<span class="agents-session-item__sub" title=${subtitle}>${subtitle}</span>` : nothing}
                        ${
                          preview
                            ? html`<span class="agents-session-item__preview" title=${preview}>${preview}</span>`
                            : nothing
                        }
                      </span>
                      <span class="agents-session-item__badges" aria-hidden="true">
                        <span class="badge ${type === "cron" ? "badge--warning" : "badge--muted"}">
                          ${type === "cron" ? "Cron" : "Regular"}
                        </span>
                        <span class="badge badge--muted">${when}</span>
                      </span>
                    </button>
                  `;
                })}
              </div>
            `
          }
        </div>
      </div>
    </div>
  `;
}

export function renderAgents(props: AgentsProps) {
  const entries = buildAgentEntries({
    agents: props.agents,
    sessions: props.sessions,
    search: props.agentSearch,
  });
  const rows = props.sessions?.sessions ?? [];
  const agentsCount = props.agents?.agents?.length ?? 0;
  const sessionsCount = props.sessions?.count ?? null;

  return html`
    <section class="card">
      <div class="table-header-card">
        <div class="table-header-card__left">
          <div class="table-header-card__icon">
            ${icon("sparkles", { size: 22 })}
          </div>
          <div class="table-header-card__info">
            <div class="table-header-card__title">Agents</div>
            <div class="table-header-card__subtitle">
              Browse agents from the gateway, inspect identity, and jump into recent sessions.
            </div>
          </div>
        </div>
        <div class="table-header-card__right">
          <span class="badge badge--muted">${agentsCount} agents</span>
          ${sessionsCount != null ? html`<span class="badge badge--muted">${sessionsCount} sessions</span>` : nothing}
          <button class="btn btn--secondary btn--sm" type="button" @click=${props.onRefresh}>
            ${icon("refresh-cw", { size: 12 })} <span>Refresh</span>
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout--danger"><div class="callout__content">${props.error}</div></div>` : nothing}

      ${
        props.loading && !props.agents && !props.sessions
          ? renderAgentsSkeleton()
          : html`
          <div class="agents-layout">
            ${renderAgentsList(props, entries)}
            ${renderAgentDetail(props, entries, rows)}
          </div>
        `
      }
    </section>
  `;
}
