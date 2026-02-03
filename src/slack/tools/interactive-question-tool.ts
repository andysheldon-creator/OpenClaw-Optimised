/**
 * MCP tool for asking interactive questions and waiting for responses
 * Uses Block Kit for rich UI on Slack, waits for user interaction
 */

import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { AnyAgentTool } from "../../agents/tools/common.js";
import { jsonResult } from "../../agents/tools/common.js";
import { globalHandlerRegistry } from "../blocks/interactive.js";
import { multipleChoiceQuestion } from "../blocks/patterns.js";
import { sendMessageSlack } from "../send.js";
import { globalResponseStore } from "./response-store.js";

const InteractiveQuestionInput = Type.Object({
  to: Type.String({
    description:
      "Recipient: Slack channel (e.g., '#general') or user (e.g., '@username' or user ID)",
  }),
  question: Type.String({
    description: "The question to ask the user",
  }),
  options: Type.Array(
    Type.Object({
      text: Type.String({ description: "Display text for this option" }),
      value: Type.String({ description: "Value to return if selected" }),
      description: Type.Optional(
        Type.String({ description: "Optional description for this option" }),
      ),
    }),
    {
      description: "Available answer options (2-10 options)",
      minItems: 2,
      maxItems: 10,
    },
  ),
  allowMultiple: Type.Optional(
    Type.Boolean({
      description: "Allow selecting multiple options (default: false, single choice)",
      default: false,
    }),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({
      description:
        "How long to wait for an answer before timing out (default: 300 seconds / 5 minutes)",
      default: 300,
      minimum: 10,
      maximum: 3600,
    }),
  ),
  threadTs: Type.Optional(
    Type.String({
      description: "Optional thread timestamp to ask question in a thread",
    }),
  ),
});

interface InteractiveQuestionToolOpts {
  accountId?: string;
  sessionKey?: string;
}

export function createSlackInteractiveQuestionTool(
  opts: InteractiveQuestionToolOpts = {},
): AnyAgentTool {
  return {
    name: "AskSlackQuestion",
    label: "Ask Slack Question",
    parameters: InteractiveQuestionInput,
    description: `Ask an interactive question on Slack and WAIT for the user's response.

This tool sends a question with radio buttons or checkboxes and blocks execution until the user answers or the timeout expires.

Use cases:
- Get user approval/rejection for a proposed action
- Let user choose between multiple options
- Collect structured input during a workflow

The tool returns the user's selection(s) or indicates if the question timed out.

Note: This tool BLOCKS until answered or timeout. Use appropriate timeout values.`,
    execute: async (_toolCallId, args) => {
      const { to, question, options, allowMultiple = false, timeoutSeconds = 300, threadTs } = args;

      // Generate unique question ID
      const questionId = crypto.randomBytes(16).toString("hex");
      const actionIdPrefix = `q_${questionId}`;

      // Build blocks for the question
      const blocks = multipleChoiceQuestion({
        question,
        options,
        actionIdPrefix,
        allowMultiple,
      });

      // Register handler for the response
      const responsePromise = globalResponseStore.waitForResponse(
        questionId,
        timeoutSeconds * 1000,
      );

      globalHandlerRegistry.register(new RegExp(`^${actionIdPrefix}_`), async (params) => {
        // Extract selected values
        const selectedValues: string[] = [];
        const selectedOptions = [];

        if (params.selectedOption) {
          selectedValues.push(params.selectedOption.value);
          selectedOptions.push(params.selectedOption);
        }

        if (params.selectedOptions) {
          for (const opt of params.selectedOptions) {
            selectedValues.push(opt.value);
            selectedOptions.push(opt);
          }
        }

        // Record response
        globalResponseStore.recordResponse(questionId, {
          answered: true,
          selectedValues,
          selectedOptions,
          userId: params.userId,
          userName: params.userName,
          timestamp: Date.now(),
        });

        // Unregister handler
        globalHandlerRegistry.unregister(new RegExp(`^${actionIdPrefix}_`));
      });

      try {
        // Send the question
        const result = await sendMessageSlack(to, question, {
          blocks,
          threadTs,
          accountId: opts.accountId,
        });

        // Wait for response
        const response = await responsePromise;

        if (!response) {
          return jsonResult({
            answered: false,
            timedOut: true,
            error: "No response received (internal error)",
          });
        }

        if (response.timedOut) {
          return jsonResult({
            answered: false,
            timedOut: true,
            messageId: result.messageId,
            channelId: result.channelId,
          });
        }

        return jsonResult({
          answered: true,
          selectedValues: response.selectedValues,
          respondedBy: response.userId,
          respondedByName: response.userName,
          messageId: result.messageId,
          channelId: result.channelId,
          timedOut: false,
        });
      } catch (error) {
        // Clean up on error
        globalResponseStore.cancel(questionId);
        globalHandlerRegistry.unregister(new RegExp(`^${actionIdPrefix}_`));

        return jsonResult({
          answered: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
