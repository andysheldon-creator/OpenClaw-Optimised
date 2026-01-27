/**
 * Session grouping logic for the session navigator.
 *
 * Parses flat session lists into a hierarchy:
 *   Agent > Channel > Context (with deduplication)
 *
 * Each "context group" collapses duplicate sessions (e.g. 10x slack:#cb-inbox)
 * into a single primary entry + N older entries accessible via expand.
 */

import { parseAgentSessionKey } from "../../../src/sessions/session-key-utils.js";
import { inferSessionType } from "./session-meta";
import type { GatewaySessionRow, AgentsListResult, GatewayAgentRow } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionGroup = {
  /** Unique identity for this group (channel + context) */
  groupKey: string;
  /** Display label for the group (e.g. "#cb-inbox", "thread: Running low...") */
  label: string;
  /** Channel name (slack, telegram, discord, etc.) */
  channel: string;
  /** Whether this is a thread/topic within a channel */
  isThread: boolean;
  /** Whether this is a cron session */
  isCron: boolean;
  /** The most recent (primary) session in this group */
  primary: GatewaySessionRow;
  /** Older sessions in this group, sorted newest-first */
  older: GatewaySessionRow[];
};

export type ChannelSection = {
  /** Channel identifier (e.g. "slack", "telegram", "cron") */
  channel: string;
  /** Human-readable channel label */
  channelLabel: string;
  /** Non-thread groups in this channel */
  groups: SessionGroup[];
  /** Thread groups in this channel (shown separately) */
  threads: SessionGroup[];
};

export type AgentNode = {
  agentId: string;
  displayName: string;
  emoji: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  /** Total session count across all channels */
  totalSessions: number;
  /** Most recent updatedAt across all sessions */
  lastActive: number;
  /** Grouped sessions organised by channel */
  channels: ChannelSection[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THREAD_MARKERS = [":thread:", ":topic:"];

function isThreadKey(rest: string): boolean {
  const lower = rest.toLowerCase();
  return THREAD_MARKERS.some((m) => lower.includes(m));
}

/**
 * Derive a "context identity" from the rest portion of a session key
 * (everything after `agent:<id>:`).
 *
 * For threads we strip the unique thread ID to avoid grouping issues,
 * but keep the parent channel for display.
 */
function deriveContextIdentity(rest: string): string {
  // Normalise and strip trailing UUIDs / hex IDs for grouping.
  // e.g. "slack:#cb-inbox" stays as-is, but
  //       "cron:9d006bf8-861f-..." becomes "cron"
  //       "slack:g-c0aaelgrp7z" stays as-is (group chat ID)
  return rest.trim();
}

function deriveGroupLabel(row: GatewaySessionRow, rest: string): string {
  // Prefer displayName or derivedTitle
  const display = row.displayName?.trim();
  if (display && display !== row.key) return display;

  const derived = row.derivedTitle?.trim();
  if (derived) return derived;

  // Use subject for group chats
  if (row.subject?.trim()) return row.subject.trim();

  // Fall back to the rest portion, cleaned up
  const cleaned = rest
    .replace(/^cron:/, "cron: ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/:+$/, "")
    .trim();
  return cleaned || rest;
}

function deriveChannel(row: GatewaySessionRow, rest: string): string {
  if (row.channel?.trim()) return row.channel.trim().toLowerCase();
  const lower = rest.toLowerCase();
  if (lower.startsWith("cron:") || lower.startsWith("cron")) return "cron";
  if (lower.startsWith("slack:")) return "slack";
  if (lower.startsWith("telegram:")) return "telegram";
  if (lower.startsWith("discord:")) return "discord";
  if (lower.startsWith("signal:")) return "signal";
  if (lower.startsWith("imessage:")) return "imessage";
  if (lower.startsWith("web:")) return "web";
  if (lower.startsWith("matrix:")) return "matrix";
  if (lower.startsWith("msteams:")) return "msteams";
  if (lower.startsWith("whatsapp:")) return "whatsapp";
  if (lower.startsWith("heartbeat")) return "heartbeat";
  return "other";
}

function channelDisplayLabel(channel: string): string {
  const labels: Record<string, string> = {
    slack: "Slack",
    telegram: "Telegram",
    discord: "Discord",
    signal: "Signal",
    imessage: "iMessage",
    web: "Web",
    matrix: "Matrix",
    msteams: "MS Teams",
    whatsapp: "WhatsApp",
    cron: "Cron Jobs",
    heartbeat: "Heartbeat",
    other: "Other",
  };
  return labels[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1);
}

function agentDisplayName(agent: GatewayAgentRow | null): string {
  const identityName = agent?.identity?.name?.trim();
  const name = agent?.name?.trim();
  if (identityName) return identityName;
  if (name) return name;
  return agent?.id ?? "Unknown";
}

// ---------------------------------------------------------------------------
// Core grouping
// ---------------------------------------------------------------------------

export function groupSessionsByAgent(
  sessions: GatewaySessionRow[],
  agents: AgentsListResult | null,
): AgentNode[] {
  const agentMap = new Map<string, GatewaySessionRow[]>();
  const unmatchedRows: GatewaySessionRow[] = [];

  // Bucket sessions by agent ID
  for (const row of sessions) {
    const parsed = parseAgentSessionKey(row.key);
    if (parsed?.agentId) {
      const existing = agentMap.get(parsed.agentId) ?? [];
      existing.push(row);
      agentMap.set(parsed.agentId, existing);
    } else {
      unmatchedRows.push(row);
    }
  }

  // If there are unmatched rows, put them in a synthetic "unknown" agent
  if (unmatchedRows.length > 0) {
    const existing = agentMap.get("_unassigned") ?? [];
    existing.push(...unmatchedRows);
    agentMap.set("_unassigned", existing);
  }

  const knownAgents = agents?.agents ?? [];
  const defaultId = agents?.defaultId ?? null;
  const knownIds = new Set(knownAgents.map((a) => a.id));

  const nodes: AgentNode[] = [];

  // Process known agents first, then discovered ones
  const allAgentIds = [
    ...knownAgents.map((a) => a.id),
    ...[...agentMap.keys()].filter((id) => !knownIds.has(id)),
  ];

  for (const agentId of allAgentIds) {
    const agentRows = agentMap.get(agentId) ?? [];
    const knownAgent = knownAgents.find((a) => a.id === agentId) ?? null;

    const channels = groupSessionsByChannel(agentRows);
    const lastActive = agentRows.reduce((max, r) => Math.max(max, r.updatedAt ?? 0), 0);

    nodes.push({
      agentId,
      displayName: agentId === "_unassigned" ? "Unassigned" : agentDisplayName(knownAgent ?? { id: agentId }),
      emoji: knownAgent?.identity?.emoji?.trim() || null,
      avatarUrl: knownAgent?.identity?.avatarUrl?.trim() || knownAgent?.identity?.avatar?.trim() || null,
      isDefault: defaultId === agentId,
      totalSessions: agentRows.length,
      lastActive,
      channels,
    });
  }

  // Sort: default first, then by most recent activity
  nodes.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.lastActive - a.lastActive;
  });

  return nodes;
}

function groupSessionsByChannel(rows: GatewaySessionRow[]): ChannelSection[] {
  // First, build context groups
  const contextMap = new Map<string, { rows: GatewaySessionRow[]; rest: string }>();

  for (const row of rows) {
    const parsed = parseAgentSessionKey(row.key);
    const rest = parsed?.rest ?? row.key;
    const identity = deriveContextIdentity(rest);

    const existing = contextMap.get(identity);
    if (existing) {
      existing.rows.push(row);
    } else {
      contextMap.set(identity, { rows: [row], rest });
    }
  }

  // Convert to SessionGroups
  const groups: SessionGroup[] = [];
  for (const [groupKey, { rows: groupRows, rest }] of contextMap) {
    // Sort newest first
    groupRows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const primary = groupRows[0]!;
    const older = groupRows.slice(1);
    const channel = deriveChannel(primary, rest);
    const sessionType = inferSessionType(primary.key);

    groups.push({
      groupKey,
      label: deriveGroupLabel(primary, rest),
      channel,
      isThread: isThreadKey(rest),
      isCron: sessionType === "cron",
      primary,
      older,
    });
  }

  // Bucket by channel
  const channelMap = new Map<string, { groups: SessionGroup[]; threads: SessionGroup[] }>();
  for (const group of groups) {
    const ch = group.channel;
    if (!channelMap.has(ch)) {
      channelMap.set(ch, { groups: [], threads: [] });
    }
    const bucket = channelMap.get(ch)!;
    if (group.isThread) {
      bucket.threads.push(group);
    } else {
      bucket.groups.push(group);
    }
  }

  // Sort groups within each channel by most recent
  const sections: ChannelSection[] = [];
  for (const [channel, { groups: channelGroups, threads }] of channelMap) {
    channelGroups.sort((a, b) => (b.primary.updatedAt ?? 0) - (a.primary.updatedAt ?? 0));
    threads.sort((a, b) => (b.primary.updatedAt ?? 0) - (a.primary.updatedAt ?? 0));
    sections.push({
      channel,
      channelLabel: channelDisplayLabel(channel),
      groups: channelGroups,
      threads,
    });
  }

  // Sort channel sections: prioritise channels with more recent activity
  sections.sort((a, b) => {
    const aMax = Math.max(
      ...a.groups.map((g) => g.primary.updatedAt ?? 0),
      ...a.threads.map((g) => g.primary.updatedAt ?? 0),
      0,
    );
    const bMax = Math.max(
      ...b.groups.map((g) => g.primary.updatedAt ?? 0),
      ...b.threads.map((g) => g.primary.updatedAt ?? 0),
      0,
    );
    return bMax - aMax;
  });

  return sections;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function filterAgentNodes(nodes: AgentNode[], search: string): AgentNode[] {
  const q = search.trim().toLowerCase();
  if (!q) return nodes;

  return nodes
    .map((node) => {
      // Agent-level match
      const agentMatch =
        node.agentId.toLowerCase().includes(q) ||
        node.displayName.toLowerCase().includes(q);
      if (agentMatch) return node;

      // Filter channels/groups that match
      const filteredChannels = node.channels
        .map((ch) => {
          const matchedGroups = ch.groups.filter((g) => groupMatchesSearch(g, q));
          const matchedThreads = ch.threads.filter((g) => groupMatchesSearch(g, q));
          if (matchedGroups.length === 0 && matchedThreads.length === 0) return null;
          return { ...ch, groups: matchedGroups, threads: matchedThreads };
        })
        .filter(Boolean) as ChannelSection[];

      if (filteredChannels.length === 0) return null;
      return { ...node, channels: filteredChannels };
    })
    .filter(Boolean) as AgentNode[];
}

function groupMatchesSearch(group: SessionGroup, q: string): boolean {
  const searchable = [
    group.label,
    group.channel,
    group.primary.key,
    group.primary.displayName,
    group.primary.derivedTitle,
    group.primary.lastMessagePreview,
    group.primary.subject,
    group.primary.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return searchable.includes(q);
}

// ---------------------------------------------------------------------------
// Resolve current session context
// ---------------------------------------------------------------------------

export type CurrentSessionInfo = {
  agentId: string | null;
  rest: string;
  channel: string;
  label: string;
};

export function resolveCurrentSessionInfo(
  sessionKey: string,
  sessions: GatewaySessionRow[],
): CurrentSessionInfo {
  const parsed = parseAgentSessionKey(sessionKey);
  const agentId = parsed?.agentId ?? null;
  const rest = parsed?.rest ?? sessionKey;
  const row = sessions.find((s) => s.key === sessionKey);

  const channel = row ? deriveChannel(row, rest) : deriveChannel({ key: sessionKey } as GatewaySessionRow, rest);
  const label = row ? deriveGroupLabel(row, rest) : rest;

  return { agentId, rest, channel, label };
}
