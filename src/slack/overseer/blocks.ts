/**
 * Block Kit message builders for Overseer → Slack integration.
 */

import type { DecisionRecord } from "../../infra/decisions/store.types.js";
import type {
  OverseerAssignmentRecord,
  OverseerGoalRecord,
} from "../../infra/overseer/store.types.js";
import type { SlackBlock } from "../blocks/types.js";
import { section, actions, divider, context, button, mrkdwn } from "../blocks/builders.js";

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

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) {
    return "< 1 minute";
  }
  if (mins < 60) {
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}

function getStatusEmoji(status: OverseerAssignmentRecord["status"]): string {
  switch (status) {
    case "queued":
      return ":hourglass:";
    case "dispatched":
      return ":rocket:";
    case "active":
      return ":gear:";
    case "stalled":
      return ":warning:";
    case "blocked":
      return ":no_entry:";
    case "done":
      return ":white_check_mark:";
    case "cancelled":
      return ":x:";
    default:
      return ":question:";
  }
}

export type ActivityMessageParams = {
  assignment: OverseerAssignmentRecord;
  goal?: OverseerGoalRecord;
  fromStatus?: OverseerAssignmentRecord["status"];
  toStatus: OverseerAssignmentRecord["status"];
  dashboardUrl?: string;
};

export function buildActivityBlocks(params: ActivityMessageParams): SlackBlock[] {
  const { assignment, goal, fromStatus, toStatus, dashboardUrl } = params;
  const emoji = getStatusEmoji(toStatus);
  const title = goal?.title ?? assignment.workNodeId;
  const statusChange = fromStatus ? `\`${fromStatus}\` → \`${toStatus}\`` : `\`${toStatus}\``;
  const lastActivity = assignment.lastObservedActivityAt ?? assignment.updatedAt;

  const blocks: SlackBlock[] = [
    section({
      text:
        `${emoji} *${title}*\n` +
        `Task: \`${assignment.workNodeId}\`\n` +
        `Status: ${statusChange}`,
    }),
  ];

  if (dashboardUrl) {
    blocks.push(
      actions([
        button({
          text: "View Details",
          actionId: "overseer_view_details",
          url: dashboardUrl,
        }),
      ]),
    );
  }

  blocks.push(divider());
  blocks.push(
    context([
      mrkdwn(
        `Goal: \`${assignment.goalId}\` | Agent: ${assignment.agentId ?? "main"} | ${formatRelativeTime(lastActivity)}`,
      ),
    ]),
  );

  return blocks;
}

export type EscalationMessageParams = {
  assignment: OverseerAssignmentRecord;
  goal?: OverseerGoalRecord;
  mentionUserIds?: string[];
  dashboardUrl?: string;
};

export function buildEscalationBlocks(params: EscalationMessageParams): SlackBlock[] {
  const { assignment, goal, mentionUserIds, dashboardUrl } = params;
  const title = goal?.title ?? assignment.workNodeId;
  const retryCount = assignment.retryCount ?? 0;
  const lastActivity = assignment.lastObservedActivityAt ?? assignment.updatedAt;
  const blockedReason = assignment.blockedReason ?? "Unknown reason";

  const mentions = mentionUserIds?.map((id) => `<@${id}>`).join(" ") ?? "";
  const mentionLine = mentions ? `${mentions}\n\n` : "";

  const blocks: SlackBlock[] = [
    section({
      text:
        `:rotating_light: *Escalation Required*\n${mentionLine}` +
        `*${title}*\n` +
        `Task \`${assignment.workNodeId}\` stalled after ${retryCount}/${retryCount} retries.`,
    }),
    section({
      fields: [
        mrkdwn(`*Goal ID:*\n\`${assignment.goalId}\``),
        mrkdwn(`*Last Activity:*\n${formatRelativeTime(lastActivity)}`),
      ],
    }),
    section({
      text: `*Blocked:* ${blockedReason}`,
    }),
  ];

  if (dashboardUrl) {
    blocks.push(
      actions([
        button({
          text: "View in Dashboard",
          actionId: "overseer_view_dashboard",
          url: dashboardUrl,
        }),
      ]),
    );
  }

  return blocks;
}

export type GoalCompletedMessageParams = {
  goal: OverseerGoalRecord;
  dashboardUrl?: string;
};

export function buildGoalCompletedBlocks(params: GoalCompletedMessageParams): SlackBlock[] {
  const { goal, dashboardUrl } = params;
  const duration = goal.updatedAt - goal.createdAt;

  const blocks: SlackBlock[] = [
    section({
      text: `:tada: *Goal Completed*\n\n*${goal.title}*\nCompleted in ${formatDuration(duration)}`,
    }),
    context([mrkdwn(`Goal ID: \`${goal.goalId}\` | Status: \`${goal.status}\``)]),
  ];

  if (dashboardUrl) {
    blocks.push(
      actions([
        button({
          text: "View Details",
          actionId: "overseer_goal_details",
          url: dashboardUrl,
        }),
      ]),
    );
  }

  return blocks;
}

export type DecisionMessageParams = {
  decision: DecisionRecord;
  agentId?: string;
};

export function buildDecisionBlocks(params: DecisionMessageParams): SlackBlock[] {
  const { decision, agentId } = params;
  const agent = agentId ?? decision.context.agentId ?? "main";

  const blocks: SlackBlock[] = [
    section({
      text: `Agent: *${agent}* is asking for a decision\n\n*${decision.title}*\n\n${decision.question}`,
    }),
  ];

  // Add buttons for binary/choice/confirmation
  if (decision.options && decision.options.length > 0) {
    const buttonElements = decision.options.map((opt) =>
      button({
        text: opt.label,
        actionId: `decision_${decision.decisionId}_${opt.id}`,
        value: `${decision.decisionId}|${opt.id}|${opt.value}`,
        style: opt.style === "primary" ? "primary" : opt.style === "danger" ? "danger" : undefined,
      }),
    );

    blocks.push(actions(buttonElements));
  }

  // Add text input button for text type
  if (decision.type === "text") {
    blocks.push(
      actions([
        button({
          text: "Provide Response",
          actionId: `decision_text_${decision.decisionId}`,
          value: decision.decisionId,
        }),
      ]),
    );
  }

  // Add expiration notice
  if (decision.expiresAt) {
    const timeLeft = decision.expiresAt - Date.now();
    if (timeLeft > 0) {
      blocks.push(context([mrkdwn(`:hourglass: Expires in ${formatDuration(timeLeft)}`)]));
    }
  }

  return blocks;
}

export type DecisionResolvedMessageParams = {
  decision: DecisionRecord;
};

export function buildDecisionResolvedBlocks(params: DecisionResolvedMessageParams): SlackBlock[] {
  const { decision } = params;
  const responseText =
    decision.response?.textValue ??
    decision.response?.optionValue ??
    decision.response?.optionId ??
    "Unknown";
  const respondedBy = decision.respondedBy?.userName ?? decision.respondedBy?.userId ?? "Unknown";
  const respondedAt = decision.respondedAt ?? Date.now();

  const blocks: SlackBlock[] = [
    section({
      text:
        `*Decision Resolved*\n\n~${decision.title}~\n\n` +
        `*Decision:* ${responseText}\n` +
        `*Resolved by:* ${respondedBy}\n` +
        `*Time:* <!date^${Math.floor(respondedAt / 1000)}^{date_pretty} at {time}|${new Date(respondedAt).toISOString()}>`,
    }),
  ];

  return blocks;
}

export type DecisionExpiredMessageParams = {
  decision: DecisionRecord;
};

export function buildDecisionExpiredBlocks(params: DecisionExpiredMessageParams): SlackBlock[] {
  const { decision } = params;

  const blocks: SlackBlock[] = [
    section({
      text: `*Decision Expired*\n\n~${decision.title}~\n\n:clock1: This decision timed out without a response.`,
    }),
  ];

  return blocks;
}
