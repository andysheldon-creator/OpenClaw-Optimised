import { html, nothing } from "lit";
import { toast } from "../components/toast";

import { formatEventPayload } from "../presenter";
import { icon } from "../icons";
import type { EventLogEntry } from "../app-events";
import type { GatewayHelloOk } from "../gateway";
import type { HealthSnapshot, HealthChannelSummary, StatusSummary } from "../types";

export type DebugProps = {
  loading: boolean;
  connected: boolean;
  status: StatusSummary | null;
  health: HealthSnapshot | null;
  models: unknown[];
  heartbeat: unknown;
  cronJobs: unknown[];
  eventLog: EventLogEntry[];
  callMethod: string;
  callParams: string;
  callResult: string | null;
  callError: string | null;
  hello: GatewayHelloOk | null;
  onCallMethodChange: (next: string) => void;
  onCallParamsChange: (next: string) => void;
  onRefresh: () => void;
  onCall: () => void;
  onNavigateToLogs: () => void;
  onRefreshRawStatus: () => void;
  onRefreshRawHeartbeat: () => void;
};

type DebugTab = "status" | "health" | "models" | "rpc" | "events";

// Track active tab in module scope for simplicity
let activeTab: DebugTab = "status";

// Track which raw data panels are expanded (lazy rendering)
let rawStatusExpanded = false;
let rawHeartbeatExpanded = false;

function setActiveTab(tab: DebugTab) {
  activeTab = tab;
}

/**
 * Format JSON with syntax highlighting
 */
function formatJsonHighlighted(data: unknown): ReturnType<typeof html> {
  if (data === null || data === undefined) {
    return html`<span class="json-viewer__null">null</span>`;
  }

  try {
    const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    // Parse and re-stringify to ensure valid JSON
    const parsed = JSON.parse(jsonStr);
    const highlighted = highlightJson(parsed, 0);
    return html`<pre class="json-viewer">${highlighted}</pre>`;
  } catch {
    return html`<pre class="json-viewer">${String(data)}</pre>`;
  }
}

function highlightJson(value: unknown, indent: number): ReturnType<typeof html>[] {
  const spaces = "  ".repeat(indent);
  const results: ReturnType<typeof html>[] = [];

  if (value === null) {
    results.push(html`<span class="json-viewer__null">null</span>`);
  } else if (typeof value === "boolean") {
    results.push(html`<span class="json-viewer__boolean">${String(value)}</span>`);
  } else if (typeof value === "number") {
    results.push(html`<span class="json-viewer__number">${value}</span>`);
  } else if (typeof value === "string") {
    results.push(html`<span class="json-viewer__string">"${value}"</span>`);
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      results.push(html`<span class="json-viewer__bracket">[]</span>`);
    } else {
      results.push(html`<span class="json-viewer__bracket">[</span>\n`);
      value.forEach((item, i) => {
        results.push(html`${spaces}  `);
        results.push(...highlightJson(item, indent + 1));
        if (i < value.length - 1) results.push(html`,`);
        results.push(html`\n`);
      });
      results.push(html`${spaces}<span class="json-viewer__bracket">]</span>`);
    }
  } else if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      results.push(html`<span class="json-viewer__bracket">{}</span>`);
    } else {
      results.push(html`<span class="json-viewer__bracket">{</span>\n`);
      entries.forEach(([key, val], i) => {
        results.push(html`${spaces}  <span class="json-viewer__key">"${key}"</span>: `);
        results.push(...highlightJson(val, indent + 1));
        if (i < entries.length - 1) results.push(html`,`);
        results.push(html`\n`);
      });
      results.push(html`${spaces}<span class="json-viewer__bracket">}</span>`);
    }
  }

  return results;
}

function renderStatusTab(props: DebugProps) {
  const status = props.status ?? {};
  const heartbeat = props.heartbeat as Record<string, unknown> | null;

  const securityAudit = status.securityAudit ?? null;
  const securitySummary = securityAudit?.summary ?? null;
  const critical = securitySummary?.critical ?? 0;
  const warn = securitySummary?.warn ?? 0;
  const info = securitySummary?.info ?? 0;
  const securityTone = critical > 0 ? "danger" : warn > 0 ? "warn" : "success";
  const securityLabel =
    critical > 0
      ? `${critical} critical`
      : warn > 0
        ? `${warn} warnings`
        : "No critical issues";

  // Gateway connection: use the real WebSocket connected state
  const connected = props.connected;
  // Uptime from the new backend field
  const uptime = typeof status.uptimeMs === "number" ? formatUptime(status.uptimeMs) : "Unknown";
  // Heartbeat from status.heartbeat (structured) or raw heartbeat prop
  const heartbeatAgent = status.heartbeat?.agents?.[0];
  const heartbeatAge = heartbeat && typeof (heartbeat as Record<string, unknown>).ts === "number"
    ? formatHeartbeatAge((heartbeat as Record<string, unknown>).ts as number)
    : heartbeatAgent?.enabled
      ? `Every ${heartbeatAgent.every}`
      : "No heartbeat";
  // Memory from the new backend field
  const memoryMb = status.memoryUsage?.heapUsedMB ?? 0;
  // Sessions: total, active (updated < 5min), idle
  const sessionsTotal = status.sessions?.count ?? 0;
  const recentSessions = (status.sessions?.recent ?? []) as Array<{ age?: number | null }>;
  const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
  const sessionsActive = recentSessions.filter(
    (s) => typeof s.age === "number" && s.age < ACTIVE_THRESHOLD_MS,
  ).length;
  const sessionsIdle = sessionsTotal - sessionsActive;
  // Jobs: derive from cron jobs list
  const cronJobs = props.cronJobs as Array<{
    enabled?: boolean;
    state?: { runningAtMs?: number };
  }>;
  const jobsRunning = cronJobs.filter((j) => j.state?.runningAtMs != null).length;
  const jobsQueued = cronJobs.filter(
    (j) => j.enabled !== false && j.state?.runningAtMs == null,
  ).length;
  const jobsDisabled = cronJobs.filter((j) => j.enabled === false).length;

  return html`
    ${!connected && props.status
      ? html`<div class="callout warn" style="margin-bottom: 12px;">
          Gateway disconnected — data shown may be stale.
        </div>`
      : nothing}

    <div class="debug-status-grid">
      <div class="debug-status__card ${connected ? "debug-status__ok" : "debug-status__error"}">
        <div class="debug-status__icon">
          ${connected ? icon("check", { size: 20 }) : icon("alert-circle", { size: 20 })}
        </div>
        <div class="debug-status__label">Gateway</div>
        <div class="debug-status__value">${connected ? "Connected" : "Disconnected"}</div>
      </div>

      <div class="debug-status__card debug-status__neutral">
        <div class="debug-status__icon">
          ${icon("clock", { size: 20 })}
        </div>
        <div class="debug-status__label">Uptime</div>
        <div class="debug-status__value">${uptime}</div>
      </div>

      <div class="debug-status__card ${heartbeatAgent?.enabled ? "debug-status__ok" : "debug-status__warn"}">
        <div class="debug-status__icon">
          ${icon("zap", { size: 20 })}
        </div>
        <div class="debug-status__label">Heartbeat</div>
        <div class="debug-status__value">${heartbeatAge}</div>
      </div>

      <div class="debug-status__card debug-status__neutral">
        <div class="debug-status__icon">
          ${icon("brain", { size: 20 })}
        </div>
        <div class="debug-status__label">Memory</div>
        <div class="debug-status__value">${memoryMb > 0 ? `${memoryMb.toFixed(1)} MB` : "N/A"}</div>
      </div>

      <div class="debug-status__card ${sessionsActive > 0 ? "debug-status__ok" : "debug-status__neutral"}">
        <div class="debug-status__icon">
          ${icon("link", { size: 20 })}
        </div>
        <div class="debug-status__label">Sessions</div>
        <div class="debug-status__value debug-status__value--multi">
          <span>${sessionsTotal} total</span>
          <span class="debug-status__sub">${sessionsActive} active · ${sessionsIdle} idle</span>
        </div>
      </div>

      <div class="debug-status__card ${jobsRunning > 0 ? "debug-status__ok" : "debug-status__neutral"}">
        <div class="debug-status__icon">
          ${icon("server", { size: 20 })}
        </div>
        <div class="debug-status__label">Jobs</div>
        <div class="debug-status__value debug-status__value--multi">
          <span>${jobsRunning} running · ${jobsQueued} queued</span>
          <span class="debug-status__sub">${jobsDisabled} disabled</span>
        </div>
      </div>
    </div>

    ${securitySummary
      ? html`<div class="callout ${securityTone}" style="margin: 12px 0;">
          Security audit: ${securityLabel}${info > 0 ? ` \u00b7 ${info} info` : ""}. Run
          <span class="mono">clawdbrain security audit --deep</span> for details.
        </div>`
      : nothing}

    <!-- Raw Data Section (lazy-rendered) -->
    <div class="debug-raw-section">
      <details
        class="debug-raw-details"
        ?open=${rawStatusExpanded}
        @toggle=${(e: Event) => {
          const details = e.target as HTMLDetailsElement;
          rawStatusExpanded = details.open;
          if (details.open && !props.status) props.onRefreshRawStatus();
        }}
      >
        <summary class="debug-raw-summary">
          ${icon("chevron-right", { size: 14 })}
          <span>Raw Status Data</span>
          ${rawStatusExpanded
            ? html`<button
                class="debug-raw-refresh btn btn--sm btn--icon"
                title="Refresh status data"
                @click=${(e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onRefreshRawStatus();
                }}
              >${icon("refresh-cw", { size: 13 })}</button>`
            : nothing}
        </summary>
        <div class="debug-raw-content">
          ${rawStatusExpanded ? formatJsonHighlighted(props.status) : nothing}
        </div>
      </details>

      <details
        class="debug-raw-details"
        ?open=${rawHeartbeatExpanded}
        @toggle=${(e: Event) => {
          const details = e.target as HTMLDetailsElement;
          rawHeartbeatExpanded = details.open;
          if (details.open && !props.heartbeat) props.onRefreshRawHeartbeat();
        }}
      >
        <summary class="debug-raw-summary">
          ${icon("chevron-right", { size: 14 })}
          <span>Raw Heartbeat Data</span>
          ${rawHeartbeatExpanded
            ? html`<button
                class="debug-raw-refresh btn btn--sm btn--icon"
                title="Refresh heartbeat data"
                @click=${(e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onRefreshRawHeartbeat();
                }}
              >${icon("refresh-cw", { size: 13 })}</button>`
            : nothing}
        </summary>
        <div class="debug-raw-content">
          ${rawHeartbeatExpanded ? formatJsonHighlighted(props.heartbeat) : nothing}
        </div>
      </details>
    </div>
  `;
}

function resolveChannelStatus(ch: HealthChannelSummary): { label: string; cssClass: string } {
  if (ch.linked) return { label: "Linked", cssClass: "health-channel--linked" };
  if (ch.probe && typeof ch.probe === "object" && (ch.probe as Record<string, unknown>).ok)
    return { label: "OK", cssClass: "health-channel--ok" };
  if (ch.configured) return { label: "Configured", cssClass: "health-channel--configured" };
  return { label: "Inactive", cssClass: "" };
}

function renderHealthTab(props: DebugProps) {
  const health = (props.health ?? {}) as HealthSnapshot;
  const isOk = health.ok === true;
  const duration = health.durationMs != null ? `${health.durationMs}ms` : "";

  // Filter channels to configured or linked only
  const channelOrder = health.channelOrder ?? [];
  const channelLabels = health.channelLabels ?? {};
  const channels = health.channels ?? {};
  const configuredChannels = channelOrder.filter((id) => {
    const ch = channels[id] as HealthChannelSummary | undefined;
    return ch && (ch.configured || ch.linked);
  });

  const agents = health.agents ?? [];

  return html`
    <div class="health-overview">
      <!-- Health banner -->
      <div class="health-banner ${isOk ? "health-banner--ok" : "health-banner--error"}">
        <div class="health-banner__icon">
          ${isOk ? icon("check", { size: 20 }) : icon("alert-circle", { size: 20 })}
        </div>
        <div class="health-banner__text">
          Gateway ${isOk ? "healthy" : "unhealthy"}${duration ? ` (${duration})` : ""}
        </div>
      </div>

      <!-- Channel cards grid -->
      ${configuredChannels.length > 0
        ? html`
          <div class="health-section-title">Channels</div>
          <div class="health-channels-grid">
            ${configuredChannels.map((id) => {
              const ch = channels[id] as HealthChannelSummary;
              const label = channelLabels[id] ?? id;
              const { label: statusLabel, cssClass } = resolveChannelStatus(ch);
              const probe = ch.probe as Record<string, unknown> | null | undefined;
              const botUsername = probe?.bot
                ? ((probe.bot as Record<string, unknown>).username as string | null)
                : null;
              const probeMs = probe?.elapsedMs != null ? `${probe.elapsedMs}ms` : null;
              const probeError = probe?.error as string | null | undefined;
              return html`
                <div class="health-channel ${cssClass}">
                  <div class="health-channel__header">
                    <div class="health-channel__name">${label}</div>
                    <div class="health-channel__badge">${statusLabel}</div>
                  </div>
                  ${botUsername
                    ? html`<div class="health-channel__bot">@${botUsername}</div>`
                    : nothing}
                  ${probeMs
                    ? html`<div class="health-channel__timing">${probeMs}</div>`
                    : nothing}
                  ${probeError
                    ? html`<div class="health-channel__error">${probeError}</div>`
                    : nothing}
                </div>
              `;
            })}
          </div>
        `
        : nothing}

      <!-- Agents section -->
      ${agents.length > 0
        ? html`
          <div class="health-section-title">Agents</div>
          ${agents.map(
            (agent) => html`
              <div class="health-agent">
                <div class="health-agent__name">
                  ${agent.agentId}${agent.isDefault ? " (default)" : ""}
                </div>
                <div class="health-agent__heartbeat">
                  Heartbeat: ${agent.heartbeat.enabled ? agent.heartbeat.every : "disabled"}
                </div>
                <div class="health-agent__sessions">
                  Sessions: ${agent.sessions.count}
                </div>
              </div>
            `,
          )}
        `
        : nothing}

      <!-- Collapsible raw JSON -->
      <details class="debug-raw-details" style="margin-top: 16px;">
        <summary class="debug-raw-summary">
          ${icon("chevron-right", { size: 14 })}
          <span>Raw Health Data</span>
        </summary>
        <div class="debug-raw-content">
          ${formatJsonHighlighted(health)}
        </div>
      </details>
    </div>
  `;
}

type ModelEntry = {
  id: string;
  name: string;
  provider: string;
  providerAvailable?: boolean;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
};

function renderModelsTab(props: DebugProps) {
  const models = (props.models ?? []) as ModelEntry[];

  if (!Array.isArray(models) || models.length === 0) {
    return html`
      <div class="models-empty">
        <div class="models-empty__icon">${icon("brain", { size: 32 })}</div>
        <div class="models-empty__text">No models available</div>
        <div class="models-empty__sub">Configure an AI provider in your gateway settings to see available models</div>
      </div>
    `;
  }

  // Group models by provider
  const byProvider = new Map<string, ModelEntry[]>();
  for (const m of models) {
    const provider = m.provider ?? "Unknown";
    const list = byProvider.get(provider);
    if (list) {
      list.push(m);
    } else {
      byProvider.set(provider, [m]);
    }
  }

  return html`
    <div class="models-grouped">
      ${[...byProvider.entries()].map(([provider, providerModels]) => {
        const firstModel = providerModels[0];
        const providerAvailable = firstModel?.providerAvailable !== false;
        const count = providerModels.length;

        return html`
          <div class="models-provider">
            <div class="models-provider__header">
              <div class="models-provider__name">${provider}</div>
              <div class="models-provider__badge ${providerAvailable ? "models-provider__badge--ok" : "models-provider__badge--unavailable"}">
                ${providerAvailable ? "Authenticated" : "No Auth"}
              </div>
              <div class="models-provider__count">${count} model${count !== 1 ? "s" : ""}</div>
            </div>
            <div class="models-provider__list">
              ${providerModels.map((m) => {
                const ctxK = m.contextWindow
                  ? `${Math.round(m.contextWindow / 1000)}k ctx`
                  : null;
                const hasVision = m.input?.includes("image");
                return html`
                  <div class="model-card ${providerAvailable ? "model-card--available" : "model-card--unavailable"}">
                    <div class="model-card__header">
                      <div class="model-card__icon">
                        ${icon("sparkles", { size: 18 })}
                      </div>
                      <div class="model-card__info">
                        <div class="model-card__name">${m.name ?? m.id}</div>
                        <div class="model-card__meta">
                          ${ctxK ? html`<span class="model-card__ctx">${ctxK}</span>` : nothing}
                          ${m.reasoning ? html`<span class="model-card__tag">reasoning</span>` : nothing}
                          ${hasVision ? html`<span class="model-card__tag">vision</span>` : nothing}
                        </div>
                      </div>
                    </div>
                    <div class="model-card__status">
                      <span class="model-card__dot ${providerAvailable ? "model-card__dot--ok" : "model-card__dot--error"}"></span>
                      <span>${providerAvailable ? "Available" : "No Auth"}</span>
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
        `;
      })}
    </div>

    <details class="debug-raw-details" style="margin-top: 16px;">
      <summary class="debug-raw-summary">
        ${icon("chevron-right", { size: 14 })}
        <span>Raw Models Data</span>
      </summary>
      <div class="debug-raw-content">
        ${formatJsonHighlighted(models)}
      </div>
    </details>
  `;
}

function renderRpcTab(props: DebugProps) {
  const copyToClipboard = () => {
    if (props.callResult) {
      navigator.clipboard.writeText(props.callResult).then(() => {
        toast.success("Response copied");
      });
    }
  };

  return html`
    <div class="rpc-console rpc-console--modern">
      <div class="rpc-console__input">
        <div class="rpc-pane-header">
          <span class="rpc-pane-header__icon">${icon("send", { size: 14 })}</span>
          <span class="rpc-pane-header__title">Request</span>
        </div>
        <div class="rpc-method">
          <label class="rpc-method__label">
            ${icon("chevron-right", { size: 14 })}
            <span>Method</span>
          </label>
          <input
            class="rpc-method__input"
            .value=${props.callMethod}
            @input=${(e: Event) => props.onCallMethodChange((e.target as HTMLInputElement).value)}
            placeholder="sessions.list"
          />
        </div>

        <div class="rpc-params">
          <label class="rpc-params__label">
            ${icon("file-text", { size: 14 })}
            <span>Parameters (JSON)</span>
          </label>
          <textarea
            class="rpc-params__editor"
            .value=${props.callParams}
            @input=${(e: Event) => props.onCallParamsChange((e.target as HTMLTextAreaElement).value)}
            placeholder='{ "limit": 10 }'
            rows="8"
          ></textarea>
        </div>

        <button class="rpc-execute btn btn--primary" @click=${props.onCall}>
          ${icon("play", { size: 16 })}
          <span>Execute</span>
        </button>
      </div>

      <div class="rpc-console__output">
        <div class="rpc-response__header">
          <div class="rpc-pane-header">
            <span class="rpc-pane-header__icon">${icon("check", { size: 14 })}</span>
            <span class="rpc-pane-header__title">Response</span>
          </div>
          <div class="rpc-response__actions">
            ${props.callResult
              ? html`
                  <button class="btn btn--sm" @click=${copyToClipboard} title="Copy to clipboard">
                    ${icon("copy", { size: 14 })}
                  </button>
                `
              : nothing}
          </div>
        </div>

        <div class="rpc-response__body">
          ${props.callError
            ? html`
                <div class="rpc-response__error">
                  <div class="rpc-response__error-icon">${icon("alert-circle", { size: 18 })}</div>
                  <div class="rpc-response__error-text">${props.callError}</div>
                </div>
              `
            : props.callResult
              ? formatJsonHighlighted(props.callResult)
              : html`<div class="rpc-response__empty">
                  <div class="rpc-response__empty-icon">${icon("zap", { size: 24 })}</div>
                  <div>Execute a method to see the response</div>
                </div>`}
        </div>
      </div>
    </div>

    <!-- Event log below RPC form -->
    <div class="debug-event-section debug-event-section--modern" style="margin-top: 16px;">
      <div class="debug-section-header">
        <div class="debug-section-icon">${icon("scroll-text", { size: 18 })}</div>
        <div class="debug-section-title">Event Log</div>
        <div class="debug-section-sub">Recent gateway events</div>
      </div>
      ${renderEventLog(props)}
    </div>
  `;
}

function renderEventsTab(props: DebugProps) {
  return html`
    <div class="events-tab">
      <div class="events-tab__header">
        <div class="events-tab__title">Gateway Events</div>
        <button class="events-tab__logs-link btn btn--sm btn--secondary" @click=${props.onNavigateToLogs}>
          ${icon("file-text", { size: 14 })}
          <span>View Gateway Logs</span>
        </button>
      </div>
      ${renderEventLog(props)}
    </div>
  `;
}

function renderEventLog(props: DebugProps) {
  if (props.eventLog.length === 0) {
    return html`
      <div class="event-log__empty">
        <div class="event-log__empty-icon">${icon("scroll-text", { size: 24 })}</div>
        <div class="event-log__empty-text">No events yet</div>
      </div>
    `;
  }

  return html`
    <div class="event-log">
      ${props.eventLog.map(
        (evt) => html`
          <div class="event-log__entry">
            <div class="event-log__time">${new Date(evt.ts).toLocaleTimeString()}</div>
            <div class="event-log__type">${evt.event}</div>
            <div class="event-log__data">
              <pre>${formatEventPayload(evt.payload)}</pre>
            </div>
          </div>
        `
      )}
    </div>
  `;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatHeartbeatAge(ts: number): string {
  const age = Date.now() - ts;
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function renderDebug(props: DebugProps) {
  const handleTabClick = (tab: DebugTab) => () => {
    setActiveTab(tab);
    // Force re-render by triggering a state update
    // The parent component handles this through its own state management
  };

  return html`
    <div class="debug-container debug-container--modern">
      <!-- Header -->
      <div class="debug-header debug-header--modern">
        <div class="debug-header__left">
          <div class="debug-header__icon">
            ${icon("bug", { size: 24 })}
          </div>
          <div class="debug-header__text">
            <div class="debug-header__title">Debug Console</div>
            <div class="debug-header__sub">System diagnostics and RPC interface</div>
          </div>
        </div>
        <button class="btn btn--secondary" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${icon("refresh-cw", { size: 16, class: props.loading ? "spin" : "" })}
          <span>${props.loading ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      <!-- Tabs -->
      <div class="debug-tabs debug-tabs--modern">
        <button
          class="debug-tab ${activeTab === "status" ? "debug-tab--active" : ""}"
          @click=${handleTabClick("status")}
        >
          ${icon("server", { size: 16 })}
          <span>Status</span>
        </button>
        <button
          class="debug-tab ${activeTab === "health" ? "debug-tab--active" : ""}"
          @click=${handleTabClick("health")}
        >
          ${icon("zap", { size: 16 })}
          <span>Health</span>
        </button>
        <button
          class="debug-tab ${activeTab === "models" ? "debug-tab--active" : ""}"
          @click=${handleTabClick("models")}
        >
          ${icon("brain", { size: 16 })}
          <span>Models</span>
        </button>
        <button
          class="debug-tab ${activeTab === "events" ? "debug-tab--active" : ""}"
          @click=${handleTabClick("events")}
        >
          ${icon("scroll-text", { size: 16 })}
          <span>Events</span>
        </button>
        <button
          class="debug-tab ${activeTab === "rpc" ? "debug-tab--active" : ""}"
          @click=${handleTabClick("rpc")}
        >
          ${icon("send", { size: 16 })}
          <span>RPC Console</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="debug-content">
        ${activeTab === "status" ? renderStatusTab(props) : nothing}
        ${activeTab === "health" ? renderHealthTab(props) : nothing}
        ${activeTab === "models" ? renderModelsTab(props) : nothing}
        ${activeTab === "events" ? renderEventsTab(props) : nothing}
        ${activeTab === "rpc" ? renderRpcTab(props) : nothing}
      </div>
    </div>
  `;
}
