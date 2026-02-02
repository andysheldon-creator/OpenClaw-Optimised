/**
 * Decision manager for Slack integration.
 * Handles posting decisions to #cb-questions and processing responses.
 */

import type { App, SlackActionMiddlewareArgs, ViewSubmitAction } from "@slack/bolt";
import type { OpenClawConfig } from "../../config/types.js";
import type { CreateDecisionParams, DecisionRecord } from "../../infra/decisions/store.types.js";
import type { SlackOverseerBridge } from "./bridge.js";
import { AGENT_LANE_SUBAGENT } from "../../agents/lanes.js";
import { callGateway } from "../../gateway/call.js";
import {
  createDecision,
  getDecision,
  respondToDecision,
  updateDecisionSlackInfo,
} from "../../infra/decisions/store.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { buildDecisionBlocks, buildDecisionResolvedBlocks } from "./blocks.js";
import { resolveSlackOverseerConfig } from "./config.js";

const log = createSubsystemLogger("slack/decisions");

const DECISION_BUTTON_ACTION_PREFIX = "decision_";
const DECISION_TEXT_ACTION_PREFIX = "decision_text_";
const DECISION_TEXT_MODAL_CALLBACK = "decision_text_modal";

function parseDecisionButtonValue(value: string): {
  decisionId: string;
  optionId: string;
  optionValue: string;
} | null {
  const parts = value.split("|");
  if (parts.length !== 3) {
    return null;
  }
  return {
    decisionId: parts[0],
    optionId: parts[1],
    optionValue: parts[2],
  };
}

export type SlackDecisionManagerParams = {
  app: App;
  botToken: string;
  cfg: OpenClawConfig;
  bridge: SlackOverseerBridge;
  accountId?: string;
};

export type SlackDecisionManager = {
  /** Post a new decision to #cb-questions */
  postDecision: (params: CreateDecisionParams) => Promise<DecisionRecord | null>;
  /** Register action handlers for decision buttons */
  registerActionHandlers: () => void;
};

export function createSlackDecisionManager(
  params: SlackDecisionManagerParams,
): SlackDecisionManager {
  const { app, botToken, cfg, bridge, accountId } = params;
  const resolvedConfig = resolveSlackOverseerConfig(cfg, accountId);

  const postDecision = async (
    createParams: CreateDecisionParams,
  ): Promise<DecisionRecord | null> => {
    if (!resolvedConfig) {
      log.debug("slack overseer not enabled, skipping decision post");
      return null;
    }

    const questionsChannel = resolvedConfig.channels.questions;
    if (!questionsChannel) {
      log.debug("no questions channel configured, skipping decision post");
      return null;
    }

    // Create the decision record
    const decision = createDecision({
      ...createParams,
      timeoutMinutes:
        createParams.timeoutMinutes ?? Math.floor(resolvedConfig.decisionTimeoutMs / 60000),
    });

    // Build blocks and post to Slack
    const blocks = buildDecisionBlocks({
      decision,
      agentId: decision.context.agentId,
    });
    const text = `Decision requested: ${decision.title}`;

    const result = await bridge.postQuestion(text, blocks);
    if (result.ts && result.channel) {
      updateDecisionSlackInfo(decision.decisionId, result.channel, result.ts);
    }

    log.info("posted decision to slack", {
      decisionId: decision.decisionId,
      channel: result.channel,
      ts: result.ts,
    });

    return decision;
  };

  const handleDecisionResponse = async (
    decision: DecisionRecord,
    optionId: string,
    optionValue: string,
    userId: string,
    userName?: string,
  ): Promise<void> => {
    // Record the response
    const updated = respondToDecision({
      decisionId: decision.decisionId,
      optionId,
      optionValue,
      respondedBy: { userId, userName },
    });

    if (!updated) {
      log.warn("failed to record decision response", { decisionId: decision.decisionId });
      return;
    }

    // Update the Slack message
    if (decision.slackChannel && decision.slackMessageTs) {
      const resolvedBlocks = buildDecisionResolvedBlocks({ decision: updated });
      await bridge.updateMessage(
        decision.slackChannel,
        decision.slackMessageTs,
        `Decision resolved: ${decision.title}`,
        resolvedBlocks,
      );
    }

    // Route response back to agent if sessionKey is provided
    if (decision.context.sessionKey) {
      await routeDecisionResponseToAgent(updated);
    }

    log.info("decision response processed", {
      decisionId: decision.decisionId,
      optionId,
      respondedBy: userId,
    });
  };

  const handleTextDecisionResponse = async (
    decision: DecisionRecord,
    textValue: string,
    userId: string,
    userName?: string,
  ): Promise<void> => {
    const updated = respondToDecision({
      decisionId: decision.decisionId,
      textValue,
      respondedBy: { userId, userName },
    });

    if (!updated) {
      log.warn("failed to record text decision response", { decisionId: decision.decisionId });
      return;
    }

    // Update the Slack message
    if (decision.slackChannel && decision.slackMessageTs) {
      const resolvedBlocks = buildDecisionResolvedBlocks({ decision: updated });
      await bridge.updateMessage(
        decision.slackChannel,
        decision.slackMessageTs,
        `Decision resolved: ${decision.title}`,
        resolvedBlocks,
      );
    }

    // Route response back to agent
    if (decision.context.sessionKey) {
      await routeDecisionResponseToAgent(updated);
    }

    log.info("text decision response processed", {
      decisionId: decision.decisionId,
      respondedBy: userId,
    });
  };

  const registerActionHandlers = (): void => {
    // Register handler for decision button clicks
    // Match action_ids that start with "decision_" but not "decision_text_"
    const appWithAction = app as unknown as {
      action: (
        pattern: RegExp,
        handler: (args: SlackActionMiddlewareArgs) => Promise<void>,
      ) => void;
    };

    if (typeof appWithAction.action !== "function") {
      log.warn("app.action not available, decision handlers not registered");
      return;
    }

    // Handler for binary/choice/confirmation buttons
    appWithAction.action(
      new RegExp(`^${DECISION_BUTTON_ACTION_PREFIX}(?!text_)`),
      async (args: SlackActionMiddlewareArgs) => {
        const { ack, body, action } = args;
        await ack();

        const buttonAction = action as { value?: string; action_id?: string };
        const value = buttonAction.value;
        if (!value) {
          log.warn("decision button click missing value");
          return;
        }

        const parsed = parseDecisionButtonValue(value);
        if (!parsed) {
          log.warn("failed to parse decision button value", { value });
          return;
        }

        const decision = getDecision(parsed.decisionId);
        if (!decision) {
          log.warn("decision not found", { decisionId: parsed.decisionId });
          return;
        }

        if (decision.status !== "pending") {
          log.debug("decision already resolved", {
            decisionId: parsed.decisionId,
            status: decision.status,
          });
          return;
        }

        const user = body.user;
        const userName =
          "name" in user ? user.name : "username" in user ? user.username : undefined;

        await handleDecisionResponse(
          decision,
          parsed.optionId,
          parsed.optionValue,
          user.id,
          userName,
        );
      },
    );

    // Handler for text decision button (opens modal)
    appWithAction.action(
      new RegExp(`^${DECISION_TEXT_ACTION_PREFIX}`),
      async (args: SlackActionMiddlewareArgs) => {
        const { ack, body, action } = args;
        await ack();

        const buttonAction = action as { value?: string };
        const decisionId = buttonAction.value;
        if (!decisionId) {
          log.warn("text decision button click missing decisionId");
          return;
        }

        const decision = getDecision(decisionId);
        if (!decision) {
          log.warn("decision not found", { decisionId });
          return;
        }

        if (decision.status !== "pending") {
          log.debug("decision already resolved", { decisionId, status: decision.status });
          return;
        }

        // Open modal for text input
        const triggerId = "trigger_id" in body ? body.trigger_id : undefined;
        if (!triggerId) {
          log.warn("no trigger_id for text decision modal");
          return;
        }

        try {
          await app.client.views.open({
            token: botToken,
            trigger_id: triggerId,
            view: {
              type: "modal",
              callback_id: DECISION_TEXT_MODAL_CALLBACK,
              private_metadata: decisionId,
              title: {
                type: "plain_text",
                text: "Provide Response",
              },
              submit: {
                type: "plain_text",
                text: "Submit",
              },
              close: {
                type: "plain_text",
                text: "Cancel",
              },
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*${decision.title}*\n\n${decision.question}`,
                  },
                },
                {
                  type: "input",
                  block_id: "response_input",
                  element: {
                    type: "plain_text_input",
                    action_id: "response_text",
                    multiline: true,
                    placeholder: {
                      type: "plain_text",
                      text: "Enter your response...",
                    },
                  },
                  label: {
                    type: "plain_text",
                    text: "Your Response",
                  },
                },
              ],
            },
          });
        } catch (err) {
          log.error("failed to open text decision modal", { error: String(err) });
        }
      },
    );

    // Register view submission handler for text modal
    const appWithView = app as unknown as {
      view: (
        callbackId: string,
        handler: (args: {
          ack: () => Promise<void>;
          body: ViewSubmitAction;
          view: ViewSubmitAction["view"];
        }) => Promise<void>,
      ) => void;
    };

    if (typeof appWithView.view === "function") {
      appWithView.view(DECISION_TEXT_MODAL_CALLBACK, async ({ ack, body, view }) => {
        await ack();

        const decisionId = view.private_metadata;
        const decision = getDecision(decisionId);
        if (!decision) {
          log.warn("decision not found for modal submission", { decisionId });
          return;
        }

        const responseInput = view.state.values.response_input?.response_text;
        const textValue = responseInput?.value ?? "";
        const user = body.user;

        await handleTextDecisionResponse(decision, textValue, user.id, user.name);
      });
    }

    log.info("registered decision action handlers");
  };

  return {
    postDecision,
    registerActionHandlers,
  };
}

async function routeDecisionResponseToAgent(decision: DecisionRecord): Promise<void> {
  const sessionKey = decision.context.sessionKey;
  if (!sessionKey) {
    return;
  }

  const responseText =
    decision.response?.textValue ??
    decision.response?.optionValue ??
    decision.response?.optionId ??
    "unknown";

  const message = [
    `Decision response for "${decision.title}":`,
    "",
    `**Response:** ${responseText}`,
    decision.respondedBy?.userName ? `**Resolved by:** ${decision.respondedBy.userName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await callGateway({
      method: "agent",
      params: {
        message,
        sessionKey,
        idempotencyKey: `decision-response-${decision.decisionId}`,
        deliver: false,
        lane: AGENT_LANE_SUBAGENT,
      },
      timeoutMs: 10_000,
    });
    log.info("routed decision response to agent", {
      decisionId: decision.decisionId,
      sessionKey,
    });
  } catch (err) {
    log.error("failed to route decision response to agent", {
      decisionId: decision.decisionId,
      sessionKey,
      error: String(err),
    });
  }
}
