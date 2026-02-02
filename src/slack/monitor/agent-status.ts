/**
 * /agent status command handler for Slack.
 * Provides rich Block Kit UX for viewing agent status.
 */

import type { App, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs } from "@slack/bolt";
import type { OpenClawConfig } from "../../config/types.js";
import type { OverseerAssignmentRecord } from "../../infra/overseer/store.types.js";
import { listAgentIds } from "../../agents/agent-scope.js";
import {
  loadSessionEntry,
  loadCombinedSessionStoreForGateway,
} from "../../gateway/session-utils.js";
import { loadOverseerStoreFromDisk } from "../../infra/overseer/store.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { normalizeAgentId, parseAgentSessionKey } from "../../routing/session-key.js";

const log = createSubsystemLogger("slack/agent-status");

type SlackBlock = { type: string; [key: string]: unknown };

const AGENT_STATUS_REFRESH_ACTION = "agent_status_refresh";
const AGENT_STATUS_DETAIL_ACTION = "agent_status_detail";
const AGENT_STATUS_RESET_ACTION = "agent_status_reset";
const AGENT_STATUS_PAUSE_ACTION = "agent_status_pause";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${diffDays}d ago`;
}

type AgentStatusSummary = {
  agentId: string;
  status: "active" | "stalled" | "idle";
  lastActivity?: number;
  sessionCount: number;
  currentAssignment?: OverseerAssignmentRecord;
  tokenCount?: number;
};

function getAgentStatusSummaries(cfg: OpenClawConfig): AgentStatusSummary[] {
  const agentIds = listAgentIds(cfg);
  const { store } = loadCombinedSessionStoreForGateway(cfg);
  const overseerStore = loadOverseerStoreFromDisk(cfg);
  const now = Date.now();

  return agentIds.map((agentId) => {
    const normalizedId = normalizeAgentId(agentId);

    // Find sessions for this agent
    const sessionKeys = Object.keys(store).filter((key) => {
      const parsed = parseAgentSessionKey(key);
      return parsed && normalizeAgentId(parsed.agentId) === normalizedId;
    });

    let lastActivity: number | undefined;
    let tokenCount = 0;

    for (const sessionKey of sessionKeys) {
      const entry = store[sessionKey];
      if (entry?.updatedAt && (!lastActivity || entry.updatedAt > lastActivity)) {
        lastActivity = entry.updatedAt;
      }
      tokenCount += entry?.totalTokens ?? 0;
    }

    // Find any active assignment for this agent
    const assignments = Object.values(overseerStore.assignments ?? {}).filter(
      (a) => normalizeAgentId(a.agentId) === normalizedId,
    );
    const activeAssignment = assignments.find(
      (a) => a.status === "active" || a.status === "dispatched",
    );
    const stalledAssignment = assignments.find((a) => a.status === "stalled");

    let status: AgentStatusSummary["status"] = "idle";
    if (stalledAssignment) {
      status = "stalled";
    } else if (activeAssignment) {
      status = "active";
    } else if (lastActivity && now - lastActivity < 5 * 60 * 1000) {
      status = "active";
    }

    return {
      agentId: normalizedId,
      status,
      lastActivity,
      sessionCount: sessionKeys.length,
      currentAssignment: activeAssignment ?? stalledAssignment,
      tokenCount: tokenCount > 0 ? tokenCount : undefined,
    };
  });
}

function getStatusEmoji(status: AgentStatusSummary["status"]): string {
  switch (status) {
    case "active":
      return ":white_check_mark:";
    case "stalled":
      return ":warning:";
    case "idle":
      return ":zzz:";
    default:
      return ":question:";
  }
}

function capitalizeStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildAgentListBlocks(cfg: OpenClawConfig, _dashboardBaseUrl?: string): SlackBlock[] {
  const summaries = getAgentStatusSummaries(cfg);

  const activeCnt = summaries.filter((s) => s.status === "active").length;
  const stalledCnt = summaries.filter((s) => s.status === "stalled").length;
  const idleCnt = summaries.filter((s) => s.status === "idle").length;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Agent Status Overview*\n` +
          `*${activeCnt} Active* | *${stalledCnt} Stalled* | *${idleCnt} Idle*`,
      },
    },
    { type: "divider" },
  ];

  for (const summary of summaries) {
    const emoji = getStatusEmoji(summary.status);
    const lastActivityStr = summary.lastActivity
      ? formatRelativeTime(summary.lastActivity)
      : "never";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${summary.agentId}* - ${capitalizeStatus(summary.status)} - ${lastActivityStr}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Details" },
        action_id: AGENT_STATUS_DETAIL_ACTION,
        value: summary.agentId,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: ":arrows_counterclockwise: Refresh" },
        action_id: AGENT_STATUS_REFRESH_ACTION,
        value: "list",
      },
    ],
  });

  return blocks;
}

function buildAgentDetailBlocks(
  cfg: OpenClawConfig,
  agentId: string,
  dashboardBaseUrl?: string,
): SlackBlock[] {
  const summaries = getAgentStatusSummaries(cfg);
  const summary = summaries.find((s) => s.agentId === normalizeAgentId(agentId));

  if (!summary) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:x: Agent \`${agentId}\` not found`,
        },
      },
    ];
  }

  const emoji = getStatusEmoji(summary.status);
  const lastActivityStr = summary.lastActivity ? formatRelativeTime(summary.lastActivity) : "never";
  const tokenStr = summary.tokenCount ? summary.tokenCount.toLocaleString() : "0";

  const overseerStore = loadOverseerStoreFromDisk(cfg);
  const assignments = Object.values(overseerStore.assignments ?? {}).filter(
    (a) => normalizeAgentId(a.agentId) === summary.agentId,
  );
  const activeAssignment = assignments.find(
    (a) => a.status === "active" || a.status === "dispatched",
  );

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Agent: ${summary.agentId}*`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Status:*\n${capitalizeStatus(summary.status)}`,
        },
        {
          type: "mrkdwn",
          text: `*Last Activity:*\n${lastActivityStr}`,
        },
        {
          type: "mrkdwn",
          text: `*Sessions:*\n${summary.sessionCount}`,
        },
        {
          type: "mrkdwn",
          text: `*Tokens:*\n${tokenStr}`,
        },
      ],
    },
  ];

  // Add current assignment info if exists
  if (activeAssignment) {
    const goal = overseerStore.goals?.[activeAssignment.goalId];
    const goalTitle = goal?.title ?? "Unknown goal";
    const retries = activeAssignment.retryCount ?? 0;

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:clipboard: *Current Assignment*`,
      },
    });
    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Goal:*\n${goalTitle}`,
        },
        {
          type: "mrkdwn",
          text: `*Work Node:*\n\`${activeAssignment.workNodeId}\``,
        },
        {
          type: "mrkdwn",
          text: `*Progress:*\n${capitalizeStatus(activeAssignment.status)}`,
        },
        {
          type: "mrkdwn",
          text: `*Retries:*\n${retries}`,
        },
      ],
    });
  }

  // Add recent activity section
  const { store } = loadCombinedSessionStoreForGateway(cfg);
  const sessionKeys = Object.keys(store).filter((key) => {
    const parsed = parseAgentSessionKey(key);
    return parsed && normalizeAgentId(parsed.agentId) === summary.agentId;
  });

  if (sessionKeys.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:clock1: *Recent Activity*`,
      },
    });

    // Show last 3 sessions activity
    const recentSessions = sessionKeys
      .map((key) => {
        const { entry } = loadSessionEntry(key);
        return { key, entry };
      })
      .filter((s): s is { key: string; entry: NonNullable<typeof s.entry> } => !!s.entry?.updatedAt)
      .toSorted((a, b) => (b.entry.updatedAt ?? 0) - (a.entry.updatedAt ?? 0))
      .slice(0, 3);

    const activityItems = recentSessions.map((s) => {
      const timeStr = formatRelativeTime(s.entry.updatedAt ?? 0);
      return `• ${timeStr}: Session \`${s.key.split(":").pop()}\``;
    });

    if (activityItems.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: activityItems.join("\n"),
        },
      });
    }
  }

  // Action buttons
  blocks.push({ type: "divider" });

  const actionElements: unknown[] = [];

  if (dashboardBaseUrl) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: ":chart_with_upwards_trend: Dashboard" },
      url: `${dashboardBaseUrl}?agentId=${summary.agentId}`,
      action_id: "agent_status_dashboard",
    });
  }

  actionElements.push({
    type: "button",
    text: { type: "plain_text", text: ":arrows_counterclockwise: Refresh" },
    action_id: AGENT_STATUS_REFRESH_ACTION,
    value: summary.agentId,
  });

  actionElements.push({
    type: "button",
    text: { type: "plain_text", text: ":wastebasket: Reset" },
    action_id: AGENT_STATUS_RESET_ACTION,
    value: summary.agentId,
    style: "danger",
  });

  if (activeAssignment) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: ":pause_button: Pause" },
      action_id: AGENT_STATUS_PAUSE_ACTION,
      value: JSON.stringify({
        agentId: summary.agentId,
        goalId: activeAssignment.goalId,
      }),
    });
  }

  blocks.push({
    type: "actions",
    elements: actionElements,
  });

  // Session key footer
  const mainSessionKey = `agent:${summary.agentId}:main`;
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Session: \`${mainSessionKey}\``,
      },
    ],
  });

  return blocks;
}

export type AgentStatusCommandParams = {
  app: App;
  cfg: OpenClawConfig;
  dashboardBaseUrl?: string;
};

export function registerAgentStatusCommand(params: AgentStatusCommandParams): void {
  const { app, cfg, dashboardBaseUrl } = params;

  // Register /agent command
  app.command("/agent", async ({ command, ack, respond }: SlackCommandMiddlewareArgs) => {
    await ack();

    const args = command.text?.trim().split(/\s+/) ?? [];
    const subcommand = args[0]?.toLowerCase();
    const agentId = args[1];

    if (subcommand === "status") {
      if (agentId) {
        // Show detail view for specific agent
        const blocks = buildAgentDetailBlocks(cfg, agentId, dashboardBaseUrl);
        await respond({
          text: `Agent status: ${agentId}`,
          blocks,
          response_type: "ephemeral",
        });
      } else {
        // Show list view
        const blocks = buildAgentListBlocks(cfg, dashboardBaseUrl);
        await respond({
          text: "Agent status overview",
          blocks,
          response_type: "ephemeral",
        });
      }
      return;
    }

    // Unknown subcommand
    await respond({
      text: "Usage: `/agent status [agentname]`",
      response_type: "ephemeral",
    });
  });

  // Register action handlers
  const appWithAction = app as unknown as {
    action: (actionId: string, handler: (args: SlackActionMiddlewareArgs) => Promise<void>) => void;
  };

  if (typeof appWithAction.action !== "function") {
    log.warn("app.action not available, agent status actions not registered");
    return;
  }

  // Refresh action
  appWithAction.action(AGENT_STATUS_REFRESH_ACTION, async (args: SlackActionMiddlewareArgs) => {
    const { ack, respond, action } = args;
    await ack();

    const buttonAction = action as { value?: string };
    const value = buttonAction.value;

    if (value && value !== "list") {
      // Refresh detail view
      const blocks = buildAgentDetailBlocks(cfg, value, dashboardBaseUrl);
      await respond({
        text: `Agent status: ${value}`,
        blocks,
        response_type: "ephemeral",
        replace_original: true,
      });
    } else {
      // Refresh list view
      const blocks = buildAgentListBlocks(cfg, dashboardBaseUrl);
      await respond({
        text: "Agent status overview",
        blocks,
        response_type: "ephemeral",
        replace_original: true,
      });
    }
  });

  // Detail action (from list view)
  appWithAction.action(AGENT_STATUS_DETAIL_ACTION, async (args: SlackActionMiddlewareArgs) => {
    const { ack, respond, action } = args;
    await ack();

    const buttonAction = action as { value?: string };
    const agentId = buttonAction.value;

    if (agentId) {
      const blocks = buildAgentDetailBlocks(cfg, agentId, dashboardBaseUrl);
      await respond({
        text: `Agent status: ${agentId}`,
        blocks,
        response_type: "ephemeral",
        replace_original: true,
      });
    }
  });

  // Reset action (placeholder - just shows confirmation)
  appWithAction.action(AGENT_STATUS_RESET_ACTION, async (args: SlackActionMiddlewareArgs) => {
    const { ack, respond, action } = args;
    await ack();

    const buttonAction = action as { value?: string };
    const agentId = buttonAction.value;

    await respond({
      text: `Reset session for agent \`${agentId}\`? Use the dashboard for this action.`,
      response_type: "ephemeral",
    });
  });

  // Pause action
  appWithAction.action(AGENT_STATUS_PAUSE_ACTION, async (args: SlackActionMiddlewareArgs) => {
    const { ack, respond, action } = args;
    await ack();

    const buttonAction = action as { value?: string };
    let parsed: { agentId?: string; goalId?: string } = {};
    try {
      parsed = JSON.parse(buttonAction.value ?? "{}");
    } catch {
      // ignore
    }

    if (parsed.goalId) {
      await respond({
        text: `Pause goal \`${parsed.goalId}\`? Use the dashboard or \`overseer.goal.pause\` gateway method.`,
        response_type: "ephemeral",
      });
    } else {
      await respond({
        text: "No active assignment to pause.",
        response_type: "ephemeral",
      });
    }
  });

  log.info("registered /agent status command");
}
