import type { HealthSummary } from "../../commands/health.js";
import type { RenderResult } from "./types.js";
import { escapeHtml, fmtDuration, fmtNum, statusIcon, truncate } from "./format.js";

// ── Navigation buttons ───────────────────────────────────────

const NAV_HOME: Array<{ text: string; callback_data: string }> = [
  { text: "\u2190 Home", callback_data: "d:home" },
  { text: "\u21BB Refresh", callback_data: "d:refresh" },
];

function navRow(extra?: Array<{ text: string; callback_data: string }>) {
  return extra ? [...extra, ...NAV_HOME] : NAV_HOME;
}

// ── Home ─────────────────────────────────────────────────────

export function renderHome(health: HealthSummary | null, error?: string): RenderResult {
  if (!health || error) {
    return {
      text: `<b>OpenClaw Dashboard</b>\n\n${escapeHtml(error ?? "Gateway unreachable.")}`,
      buttons: [[{ text: "\u21BB Retry", callback_data: "d:refresh" }]],
    };
  }

  const agentCount = health.agents?.length ?? 0;
  const sessionCount = health.sessions?.count ?? 0;
  const channelCount = health.channelOrder?.length ?? 0;
  const uptime = fmtDuration(health.durationMs);

  const channelLines = (health.channelOrder ?? []).slice(0, 6).map((ch) => {
    const info = health.channels?.[ch];
    const label = health.channelLabels?.[ch] ?? ch;
    const st = typeof info?.configured === "boolean" ? (info.configured ? "ok" : "offline") : "—";
    return `  ${statusIcon(st)} ${escapeHtml(label)}`;
  });

  const text = [
    "<b>OpenClaw Dashboard</b>",
    "",
    `Agents: <b>${agentCount}</b>  |  Sessions: <b>${fmtNum(sessionCount)}</b>  |  Channels: <b>${channelCount}</b>`,
    `Uptime: ${escapeHtml(uptime)}`,
    "",
    channelLines.length > 0 ? "<b>Channels</b>\n" + channelLines.join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    buttons: [
      [
        { text: "Agents", callback_data: "d:agents" },
        { text: "Sessions", callback_data: "d:sessions:0" },
      ],
      [
        { text: "Channels", callback_data: "d:channels" },
        { text: "Logs", callback_data: "d:logs:0" },
      ],
      [{ text: "\u21BB Refresh", callback_data: "d:refresh" }],
    ],
  };
}

// ── Agents ───────────────────────────────────────────────────

export function renderAgents(health: HealthSummary | null): RenderResult {
  if (!health?.agents?.length) {
    return {
      text: "<b>Agents</b>\n\nNo agents configured.",
      buttons: [navRow()],
    };
  }

  const lines = health.agents.map((a) => {
    const hb = a.heartbeat;
    const st = hb?.enabled ? "online" : "offline";
    const name = a.name ?? a.agentId;
    const def = a.isDefault ? " (default)" : "";
    return `${statusIcon(st)} <b>${escapeHtml(name)}</b>${def}`;
  });

  const agentButtons = health.agents.slice(0, 6).map((a) => ({
    text: truncate(a.name ?? a.agentId, 20),
    callback_data: `d:agent:${a.agentId}`.slice(0, 64),
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < agentButtons.length; i += 2) {
    rows.push(agentButtons.slice(i, i + 2));
  }
  rows.push(navRow());

  return {
    text: `<b>Agents (${health.agents.length})</b>\n\n${lines.join("\n")}`,
    buttons: rows,
  };
}

// ── Agent detail ─────────────────────────────────────────────

export function renderAgentDetail(health: HealthSummary | null, agentId: string): RenderResult {
  const agent = health?.agents?.find((a) => a.agentId === agentId);
  if (!agent) {
    return {
      text: `<b>Agent</b>\n\nAgent <code>${escapeHtml(agentId)}</code> not found.`,
      buttons: [navRow([{ text: "\u2190 Agents", callback_data: "d:agents" }])],
    };
  }

  const hb = agent.heartbeat;
  const st = hb?.enabled ? "online" : "offline";
  const lines = [
    `<b>${escapeHtml(agent.name ?? agent.agentId)}</b>`,
    "",
    `Status: ${statusIcon(st)} ${st}`,
    agent.isDefault ? "Default agent: yes" : "",
    hb?.every ? `Heartbeat: every ${escapeHtml(hb.every)}` : "",
    agent.sessions ? `Sessions: ${fmtNum(agent.sessions.count)}` : "",
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    buttons: [navRow([{ text: "\u2190 Agents", callback_data: "d:agents" }])],
  };
}

// ── Sessions ─────────────────────────────────────────────────

export function renderSessions(health: HealthSummary | null, page: number): RenderResult {
  const sessions = health?.sessions;
  if (!sessions?.recent?.length) {
    return {
      text: "<b>Sessions</b>\n\nNo recent sessions.",
      buttons: [navRow()],
    };
  }

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(sessions.recent.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = sessions.recent.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lines = slice.map((s) => {
    const age = typeof s.age === "number" ? fmtDuration(s.age) + " ago" : "—";
    return `\u2022 <code>${escapeHtml(truncate(s.key, 30))}</code>  ${age}`;
  });

  const pagination: Array<{ text: string; callback_data: string }> = [];
  if (safePage > 0) {
    pagination.push({ text: "\u25C0 Prev", callback_data: `d:sessions:${safePage - 1}` });
  }
  pagination.push({
    text: `${safePage + 1}/${totalPages}`,
    callback_data: "d:sessions:noop",
  });
  if (safePage < totalPages - 1) {
    pagination.push({ text: "Next \u25B6", callback_data: `d:sessions:${safePage + 1}` });
  }

  return {
    text: `<b>Sessions (${fmtNum(sessions.count)})</b>\n\n${lines.join("\n")}`,
    buttons: [pagination, navRow()],
  };
}

// ── Channels ─────────────────────────────────────────────────

export function renderChannels(health: HealthSummary | null): RenderResult {
  if (!health?.channelOrder?.length) {
    return {
      text: "<b>Channels</b>\n\nNo channels configured.",
      buttons: [navRow()],
    };
  }

  const lines = health.channelOrder.map((ch) => {
    const info = health.channels?.[ch];
    const label = health.channelLabels?.[ch] ?? ch;
    const configured = info?.configured;
    const linked = info?.linked;
    let st = "offline";
    if (configured && linked) {
      st = "online";
    } else if (configured) {
      st = "warning";
    }
    return `${statusIcon(st)} <b>${escapeHtml(label)}</b>  ${configured ? "configured" : "not configured"}${linked ? ", linked" : ""}`;
  });

  return {
    text: `<b>Channels (${health.channelOrder.length})</b>\n\n${lines.join("\n")}`,
    buttons: [navRow()],
  };
}

// ── Logs ─────────────────────────────────────────────────────

export function renderLogs(health: HealthSummary | null, page: number): RenderResult {
  // health RPC doesn't include logs — show a summary with session activity
  const sessions = health?.sessions;
  if (!sessions?.recent?.length) {
    return {
      text: "<b>Activity Log</b>\n\nNo recent activity.",
      buttons: [navRow()],
    };
  }

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(sessions.recent.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = sessions.recent.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lines = slice.map((s) => {
    const age = typeof s.age === "number" ? fmtDuration(s.age) + " ago" : "—";
    return `${age} — <code>${escapeHtml(truncate(s.key, 28))}</code>`;
  });

  const pagination: Array<{ text: string; callback_data: string }> = [];
  if (safePage > 0) {
    pagination.push({ text: "\u25C0 Prev", callback_data: `d:logs:${safePage - 1}` });
  }
  pagination.push({
    text: `${safePage + 1}/${totalPages}`,
    callback_data: "d:logs:noop",
  });
  if (safePage < totalPages - 1) {
    pagination.push({ text: "Next \u25B6", callback_data: `d:logs:${safePage + 1}` });
  }

  return {
    text: `<b>Activity Log</b>\n\n${lines.join("\n")}`,
    buttons: [pagination, navRow()],
  };
}
