/**
 * Bridge connecting Overseer hooks to Slack channels.
 * Routes assignment status changes, escalations, and decisions to appropriate Slack channels.
 */

import type { App } from "@slack/bolt";
import type { OpenClawConfig } from "../../config/types.js";
import type { OverseerRunnerHooks } from "../../infra/overseer/runner.js";
import type { OverseerAssignmentRecord } from "../../infra/overseer/store.types.js";
import { loadOverseerStoreFromDisk } from "../../infra/overseer/store.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { buildActivityBlocks, buildEscalationBlocks, buildGoalCompletedBlocks } from "./blocks.js";
import {
  resolveSlackOverseerConfig,
  resolveDashboardUrl,
  type ResolvedSlackOverseerConfig,
} from "./config.js";

const log = createSubsystemLogger("slack/overseer");

export type SlackOverseerBridgeParams = {
  app: App;
  botToken: string;
  cfg: OpenClawConfig;
  accountId?: string;
};

export type SlackOverseerBridge = {
  /** Hooks to pass to OverseerRunner */
  buildHooks: () => OverseerRunnerHooks;
  /** Post a message to the activity channel */
  postActivity: (message: string, blocks?: unknown[]) => Promise<void>;
  /** Post a message to the notifications channel */
  postNotification: (message: string, blocks?: unknown[]) => Promise<void>;
  /** Post a message to the questions channel */
  postQuestion: (message: string, blocks?: unknown[]) => Promise<{ ts?: string; channel?: string }>;
  /** Update a message in a channel */
  updateMessage: (channel: string, ts: string, text: string, blocks?: unknown[]) => Promise<void>;
  /** Get resolved config */
  getConfig: () => ResolvedSlackOverseerConfig | null;
};

export function createSlackOverseerBridge(params: SlackOverseerBridgeParams): SlackOverseerBridge {
  const { app, botToken, cfg, accountId } = params;
  const resolvedConfig = resolveSlackOverseerConfig(cfg, accountId);

  const postToChannel = async (
    channel: string | undefined,
    text: string,
    blocks?: unknown[],
  ): Promise<{ ts?: string; channel?: string }> => {
    if (!channel) {
      log.debug("no channel configured, skipping post", { text: text.slice(0, 50) });
      return {};
    }

    try {
      const result = await app.client.chat.postMessage({
        token: botToken,
        channel,
        text,
        blocks: blocks as never,
      });
      return { ts: result.ts, channel: result.channel };
    } catch (err) {
      log.error("failed to post message", { channel, error: String(err) });
      return {};
    }
  };

  const postActivity = async (message: string, blocks?: unknown[]): Promise<void> => {
    await postToChannel(resolvedConfig?.channels.activity, message, blocks);
  };

  const postNotification = async (message: string, blocks?: unknown[]): Promise<void> => {
    await postToChannel(resolvedConfig?.channels.notifications, message, blocks);
  };

  const postQuestion = async (
    message: string,
    blocks?: unknown[],
  ): Promise<{ ts?: string; channel?: string }> => {
    return postToChannel(resolvedConfig?.channels.questions, message, blocks);
  };

  const updateMessage = async (
    channel: string,
    ts: string,
    text: string,
    blocks?: unknown[],
  ): Promise<void> => {
    try {
      await app.client.chat.update({
        token: botToken,
        channel,
        ts,
        text,
        blocks: blocks as never,
      });
    } catch (err) {
      log.error("failed to update message", { channel, ts, error: String(err) });
    }
  };

  const handleAssignmentStalled = (assignment: OverseerAssignmentRecord): void => {
    if (!resolvedConfig) {
      return;
    }

    const store = loadOverseerStoreFromDisk(cfg);
    const goal = store.goals[assignment.goalId];
    const dashboardUrl = resolvedConfig.includeDashboardLink
      ? resolveDashboardUrl(cfg, {
          goalId: assignment.goalId,
          assignmentId: assignment.assignmentId,
        })
      : undefined;

    // Post escalation if retries exhausted
    const maxRetries = cfg.overseer?.maxRetries ?? 2;
    if ((assignment.retryCount ?? 0) >= maxRetries) {
      const blocks = buildEscalationBlocks({
        assignment,
        goal,
        mentionUserIds: resolvedConfig.escalationMentions,
        dashboardUrl,
      });
      const text = `Escalation: Task ${assignment.workNodeId} stalled after ${assignment.retryCount} retries`;
      void postNotification(text, blocks);
    }

    // Also post to activity channel
    const activityBlocks = buildActivityBlocks({
      assignment,
      goal,
      toStatus: "stalled",
      dashboardUrl,
    });
    void postActivity(`Task ${assignment.workNodeId} stalled`, activityBlocks);
  };

  const handleAssignmentActive = (assignment: OverseerAssignmentRecord): void => {
    if (!resolvedConfig) {
      return;
    }

    const store = loadOverseerStoreFromDisk(cfg);
    const goal = store.goals[assignment.goalId];
    const dashboardUrl = resolvedConfig.includeDashboardLink
      ? resolveDashboardUrl(cfg, {
          goalId: assignment.goalId,
          assignmentId: assignment.assignmentId,
        })
      : undefined;

    const blocks = buildActivityBlocks({
      assignment,
      goal,
      toStatus: "active",
      dashboardUrl,
    });
    void postActivity(`Task ${assignment.workNodeId} is now active`, blocks);
  };

  const handleAssignmentDone = (assignment: OverseerAssignmentRecord): void => {
    if (!resolvedConfig) {
      return;
    }

    const store = loadOverseerStoreFromDisk(cfg);
    const goal = store.goals[assignment.goalId];
    const dashboardUrl = resolvedConfig.includeDashboardLink
      ? resolveDashboardUrl(cfg, {
          goalId: assignment.goalId,
          assignmentId: assignment.assignmentId,
        })
      : undefined;

    const activityBlocks = buildActivityBlocks({
      assignment,
      goal,
      toStatus: "done",
      dashboardUrl,
    });
    void postActivity(`Task ${assignment.workNodeId} completed`, activityBlocks);

    // If goal is completed, post to notifications
    if (goal && goal.status === "completed") {
      const goalBlocks = buildGoalCompletedBlocks({ goal, dashboardUrl });
      void postNotification(`Goal ${goal.title} completed`, goalBlocks);
    }
  };

  const buildHooks = (): OverseerRunnerHooks => {
    if (!resolvedConfig) {
      return {};
    }

    return {
      onAssignmentStalled: handleAssignmentStalled,
      onAssignmentActive: handleAssignmentActive,
      onAssignmentDone: handleAssignmentDone,
    };
  };

  return {
    buildHooks,
    postActivity,
    postNotification,
    postQuestion,
    updateMessage,
    getConfig: () => resolvedConfig,
  };
}
