/**
 * High-level semantic patterns for common Block Kit use cases
 * These functions provide ergonomic APIs for typical agent messaging patterns
 */

import type { SlackBlock, Option } from "./types.js";
import {
  header,
  section,
  actions,
  divider,
  context,
  button,
  checkboxes,
  radioButtons,
  staticSelect,
  option,
  plainText,
  mrkdwn,
  input,
  textInput,
  emailInput,
  numberInput,
} from "./builders.js";

/**
 * Multiple choice question pattern
 * Presents a question with radio buttons or checkboxes
 */
export function multipleChoiceQuestion(params: {
  question: string;
  options: Array<{ text: string; value: string; description?: string }>;
  actionIdPrefix: string;
  allowMultiple?: boolean;
  preselected?: string[];
}): SlackBlock[] {
  const opts: Option[] = params.options.map((opt) => option(opt.text, opt.value, opt.description));

  const preselectedOpts = params.preselected
    ? opts.filter((opt) => params.preselected?.includes(opt.value))
    : undefined;

  const element = params.allowMultiple
    ? checkboxes({
        actionId: `${params.actionIdPrefix}_choice`,
        options: opts,
        initialOptions: preselectedOpts,
      })
    : radioButtons({
        actionId: `${params.actionIdPrefix}_choice`,
        options: opts,
        initialOption: preselectedOpts?.[0],
      });

  return [
    section({
      text: params.question,
      blockId: `${params.actionIdPrefix}_question`,
    }),
    section({
      text: " ",
      accessory: element,
      blockId: `${params.actionIdPrefix}_options`,
    }),
  ];
}

/**
 * Task proposal pattern
 * Presents a task with details and action buttons
 */
export function taskProposal(params: {
  title: string;
  description: string;
  details?: Array<{ label: string; value: string }>;
  actionIdPrefix: string;
  acceptLabel?: string;
  rejectLabel?: string;
  modifyLabel?: string;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [
    header(params.title, `${params.actionIdPrefix}_header`),
    section({
      text: params.description,
      blockId: `${params.actionIdPrefix}_description`,
    }),
  ];

  if (params.details && params.details.length > 0) {
    const detailText = params.details.map((d) => `*${d.label}:* ${d.value}`).join("\n");

    blocks.push(
      section({
        text: detailText,
        blockId: `${params.actionIdPrefix}_details`,
      }),
    );
  }

  blocks.push(divider());

  const actionButtons = [];

  if (params.acceptLabel !== null) {
    actionButtons.push(
      button({
        text: params.acceptLabel ?? "Accept",
        actionId: `${params.actionIdPrefix}_accept`,
        value: "accept",
        style: "primary",
      }),
    );
  }

  if (params.modifyLabel !== null) {
    actionButtons.push(
      button({
        text: params.modifyLabel ?? "Modify",
        actionId: `${params.actionIdPrefix}_modify`,
        value: "modify",
      }),
    );
  }

  if (params.rejectLabel !== null) {
    actionButtons.push(
      button({
        text: params.rejectLabel ?? "Reject",
        actionId: `${params.actionIdPrefix}_reject`,
        value: "reject",
        style: "danger",
      }),
    );
  }

  if (actionButtons.length > 0) {
    blocks.push(actions(actionButtons, `${params.actionIdPrefix}_actions`));
  }

  return blocks;
}

/**
 * Form pattern
 * Creates a form with multiple input fields
 */
export function form(params: {
  title: string;
  description?: string;
  fields: Array<{
    label: string;
    type: "text" | "multiline" | "email" | "number" | "select";
    actionId: string;
    placeholder?: string;
    hint?: string;
    required?: boolean;
    options?: Array<{ text: string; value: string }>;
    minLength?: number;
    maxLength?: number;
    isDecimal?: boolean;
  }>;
  submitActionId: string;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(header(params.title));

  if (params.description) {
    blocks.push(section({ text: params.description }));
    blocks.push(divider());
  }

  for (const field of params.fields) {
    let element;

    switch (field.type) {
      case "text":
        element = textInput({
          actionId: field.actionId,
          placeholder: field.placeholder,
          minLength: field.minLength,
          maxLength: field.maxLength,
        });
        break;

      case "multiline":
        element = textInput({
          actionId: field.actionId,
          placeholder: field.placeholder,
          multiline: true,
          minLength: field.minLength,
          maxLength: field.maxLength,
        });
        break;

      case "email":
        element = emailInput({
          actionId: field.actionId,
          placeholder: field.placeholder,
        });
        break;

      case "number":
        element = numberInput({
          actionId: field.actionId,
          isDecimalAllowed: field.isDecimal ?? false,
          placeholder: field.placeholder,
        });
        break;

      case "select":
        if (!field.options || field.options.length === 0) {
          throw new Error(`Select field "${field.label}" must have options`);
        }
        element = staticSelect({
          actionId: field.actionId,
          options: field.options.map((opt) => option(opt.text, opt.value)),
          placeholder: field.placeholder,
        });
        break;

      default:
        throw new Error(`Unknown field type: ${String(field.type)}`);
    }

    blocks.push(
      input({
        label: field.label,
        element,
        hint: field.hint,
        optional: !field.required,
      }),
    );
  }

  blocks.push(
    actions(
      [
        button({
          text: "Submit",
          actionId: params.submitActionId,
          value: "submit",
          style: "primary",
        }),
      ],
      `${params.submitActionId}_action`,
    ),
  );

  return blocks;
}

/**
 * Action item list pattern
 * Displays a list of action items with optional checkboxes
 */
export function actionItemList(params: {
  title: string;
  items: Array<{
    id: string;
    text: string;
    completed?: boolean;
    details?: string;
  }>;
  actionIdPrefix: string;
  showCheckboxes?: boolean;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [header(params.title)];

  for (const item of params.items) {
    const emoji = item.completed ? ":white_check_mark:" : ":white_circle:";
    const strikethrough = item.completed ? "~" : "";
    const itemText = `${emoji} ${strikethrough}${item.text}${strikethrough}`;

    blocks.push(
      section({
        text: itemText,
        blockId: `${params.actionIdPrefix}_item_${item.id}`,
      }),
    );

    if (item.details) {
      blocks.push(
        context([mrkdwn(`_${item.details}_`)], `${params.actionIdPrefix}_detail_${item.id}`),
      );
    }
  }

  if (params.showCheckboxes) {
    const incompleteItems = params.items.filter((item) => !item.completed);

    if (incompleteItems.length > 0) {
      blocks.push(divider());
      blocks.push(
        section({
          text: "Mark as complete:",
          accessory: checkboxes({
            actionId: `${params.actionIdPrefix}_complete`,
            options: incompleteItems.map((item) => option(item.text, item.id)),
          }),
        }),
      );
    }
  }

  return blocks;
}

/**
 * Confirmation pattern
 * Simple yes/no confirmation dialog
 */
export function confirmation(params: {
  title: string;
  message: string;
  actionIdPrefix: string;
  confirmLabel?: string;
  cancelLabel?: string;
  style?: "primary" | "danger";
}): SlackBlock[] {
  return [
    header(params.title),
    section({
      text: params.message,
      blockId: `${params.actionIdPrefix}_message`,
    }),
    divider(),
    actions(
      [
        button({
          text: params.confirmLabel ?? "Confirm",
          actionId: `${params.actionIdPrefix}_confirm`,
          value: "confirm",
          style: params.style ?? "primary",
        }),
        button({
          text: params.cancelLabel ?? "Cancel",
          actionId: `${params.actionIdPrefix}_cancel`,
          value: "cancel",
        }),
      ],
      `${params.actionIdPrefix}_actions`,
    ),
  ];
}

/**
 * Status update pattern
 * Displays a status message with optional context
 */
export function statusUpdate(params: {
  title: string;
  message: string;
  status: "success" | "warning" | "error" | "info";
  details?: string[];
  timestamp?: string;
}): SlackBlock[] {
  const statusEmoji = {
    success: ":white_check_mark:",
    warning: ":warning:",
    error: ":x:",
    info: ":information_source:",
  };

  const blocks: SlackBlock[] = [
    section({
      text: `${statusEmoji[params.status]} *${params.title}*\n${params.message}`,
    }),
  ];

  if (params.details && params.details.length > 0) {
    const detailsText = params.details.map((d) => `• ${d}`).join("\n");
    blocks.push(section({ text: detailsText }));
  }

  if (params.timestamp) {
    blocks.push(context([mrkdwn(`_${params.timestamp}_`)]));
  }

  return blocks;
}

/**
 * Progress update pattern
 * Shows progress with a visual indicator
 */
export function progressUpdate(params: {
  title: string;
  current: number;
  total: number;
  description?: string;
  showPercentage?: boolean;
}): SlackBlock[] {
  const percentage = Math.round((params.current / params.total) * 100);
  const barLength = 20;
  const filled = Math.round((params.current / params.total) * barLength);
  const empty = barLength - filled;
  const progressBar = "█".repeat(filled) + "░".repeat(empty);

  const progressText = params.showPercentage
    ? `${progressBar} ${percentage}%`
    : `${progressBar} (${params.current}/${params.total})`;

  const blocks: SlackBlock[] = [
    section({
      text: `*${params.title}*\n\`${progressText}\``,
    }),
  ];

  if (params.description) {
    blocks.push(context([mrkdwn(params.description)]));
  }

  return blocks;
}

/**
 * Information grid pattern
 * Displays information in a two-column grid format
 */
export function informationGrid(params: {
  title: string;
  items: Array<{ label: string; value: string }>;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [header(params.title)];

  // Slack section blocks can have up to 10 fields
  const chunks: Array<{ label: string; value: string }[]> = [];
  for (let i = 0; i < params.items.length; i += 10) {
    chunks.push(params.items.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    blocks.push(
      section({
        fields: chunk.flatMap((item) => [mrkdwn(`*${item.label}*`), plainText(item.value)]),
      }),
    );
  }

  return blocks;
}
