/**
 * MCP tool for sending rich formatted messages using Slack Block Kit
 * Supports high-level semantic patterns with automatic fallback for non-Slack channels
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../agents/tools/common.js";
import type { SlackBlock } from "../blocks/types.js";
import { jsonResult } from "../../agents/tools/common.js";
import { blocksToPlainText } from "../blocks/fallback.js";
import {
  multipleChoiceQuestion,
  taskProposal,
  form,
  actionItemList,
  confirmation,
  statusUpdate,
  progressUpdate,
  informationGrid,
} from "../blocks/patterns.js";
import { sendMessageSlack } from "../send.js";

const PatternType = Type.Unsafe<string>({
  type: "string",
  enum: [
    "multiple_choice",
    "task_proposal",
    "form",
    "action_items",
    "confirmation",
    "status",
    "progress",
    "info_grid",
  ],
});

const RichMessageInput = Type.Object({
  to: Type.String({
    description:
      "Recipient: Slack channel (e.g., '#general') or user (e.g., '@username' or user ID)",
  }),
  pattern: PatternType,
  params: Type.Any({
    description: "Pattern-specific parameters (structure varies by pattern type)",
  }),
  threadTs: Type.Optional(
    Type.String({
      description: "Optional thread timestamp to send message in a thread",
    }),
  ),
});

interface RichMessageToolOpts {
  accountId?: string;
  currentChannelId?: string;
  currentThreadTs?: string;
}

export function createSlackRichMessageTool(opts: RichMessageToolOpts = {}): AnyAgentTool {
  return {
    name: "SlackRichMessage",
    label: "Slack Rich Message",
    parameters: RichMessageInput,
    description: `Send rich formatted messages to Slack using semantic patterns.

Available patterns:

**multiple_choice**: Ask a question with radio buttons or checkboxes
- params: { question: string, options: Array<{ text, value, description? }>, actionIdPrefix: string, allowMultiple?: boolean, preselected?: string[] }

**task_proposal**: Present a task with details and action buttons
- params: { title: string, description: string, details?: Array<{ label, value }>, actionIdPrefix: string, acceptLabel?: string, rejectLabel?: string, modifyLabel?: string }

**form**: Create a form with multiple input fields
- params: { title: string, description?: string, fields: Array<{ label, type, actionId, placeholder?, hint?, required?, options? }>, submitActionId: string }

**action_items**: Display a list of action items with optional checkboxes
- params: { title: string, items: Array<{ id, text, completed?, details? }>, actionIdPrefix: string, showCheckboxes?: boolean }

**confirmation**: Simple yes/no confirmation dialog
- params: { title: string, message: string, actionIdPrefix: string, confirmLabel?: string, cancelLabel?: string, style?: 'primary' | 'danger' }

**status**: Status message with optional details
- params: { title: string, message: string, status: 'success' | 'warning' | 'error' | 'info', details?: string[], timestamp?: string }

**progress**: Progress update with visual indicator
- params: { title: string, current: number, total: number, description?: string, showPercentage?: boolean }

**info_grid**: Information in two-column grid format
- params: { title: string, items: Array<{ label, value }> }

Note: On non-Slack channels, messages automatically convert to readable plain text.`,
    execute: async (_toolCallId, args) => {
      const { to, pattern, params, threadTs } = args;

      // Build blocks based on pattern
      let blocks: SlackBlock[];
      let fallbackText: string;

      try {
        switch (pattern) {
          case "multiple_choice":
            blocks = multipleChoiceQuestion(params);
            fallbackText = `${params.question}\n\nOptions:\n${params.options.map((opt: { text: string; value: string }, i: number) => `${i + 1}. ${opt.text}`).join("\n")}`;
            break;

          case "task_proposal":
            blocks = taskProposal(params);
            fallbackText = `**${params.title}**\n\n${params.description}${params.details ? `\n\n${params.details.map((d: { label: string; value: string }) => `${d.label}: ${d.value}`).join("\n")}` : ""}`;
            break;

          case "form":
            blocks = form(params);
            fallbackText = `**${params.title}**${params.description ? `\n${params.description}` : ""}\n\nFields:\n${params.fields.map((f: { label: string }) => `- ${f.label}`).join("\n")}`;
            break;

          case "action_items":
            blocks = actionItemList(params);
            fallbackText = `**${params.title}**\n\n${params.items.map((item: { text: string; completed?: boolean }) => `${item.completed ? "✓" : "○"} ${item.text}`).join("\n")}`;
            break;

          case "confirmation":
            blocks = confirmation(params);
            fallbackText = `**${params.title}**\n\n${params.message}`;
            break;

          case "status":
            blocks = statusUpdate(params);
            fallbackText = blocksToPlainText(blocks);
            break;

          case "progress":
            blocks = progressUpdate(params);
            fallbackText = blocksToPlainText(blocks);
            break;

          case "info_grid":
            blocks = informationGrid(params);
            fallbackText = `**${params.title}**\n\n${params.items.map((item: { label: string; value: string }) => `${item.label}: ${item.value}`).join("\n")}`;
            break;

          default:
            return jsonResult({
              success: false,
              error: `Unknown pattern: ${pattern}`,
            });
        }

        // Detect if this is actually a Slack channel
        const isSlackChannel = to.startsWith("#") || to.startsWith("C") || to.startsWith("@");

        if (isSlackChannel) {
          // Send with blocks to Slack
          const result = await sendMessageSlack(to, fallbackText, {
            blocks,
            threadTs: threadTs ?? opts.currentThreadTs,
            accountId: opts.accountId,
          });

          return jsonResult({
            success: true,
            messageId: result.messageId,
            channelId: result.channelId,
            sentWithBlocks: true,
          });
        } else {
          // Send plain text to non-Slack channel
          // Would need a general send function here, for now just return the text
          return jsonResult({
            success: true,
            fallbackText,
            sentWithBlocks: false,
            note: "Non-Slack channel detected, returned plain text for manual sending",
          });
        }
      } catch (error) {
        return jsonResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
