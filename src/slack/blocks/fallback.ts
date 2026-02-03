/**
 * Cross-channel degradation - Convert Block Kit to plain text
 * Enables rich messages on Slack to gracefully degrade to readable text on other platforms
 */

import type {
  SlackBlock,
  TextObject,
  InteractiveElement,
  Option,
  ButtonElement,
  CheckboxesElement,
  RadioButtonsElement,
  SelectElement,
} from "./types.js";

/**
 * Convert Block Kit blocks to plain markdown text
 * Used when sending rich messages to non-Slack channels
 */
export function blocksToPlainText(blocks: SlackBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const blockText = blockToText(block);
    if (blockText) {
      lines.push(blockText);
    }
  }

  return lines.join("\n\n");
}

function blockToText(block: SlackBlock): string {
  switch (block.type) {
    case "header":
      return `## ${block.text.text}`;

    case "section":
      return sectionToText(block);

    case "divider":
      return "---";

    case "context":
      return contextToText(block);

    case "actions":
      return actionsToText(block);

    case "image":
      return `![${block.alt_text}](${block.image_url})${block.title ? `\n*${block.title.text}*` : ""}`;

    case "input":
      return `**${block.label.text}**${block.hint ? `\n_${block.hint.text}_` : ""}`;

    case "file":
      return `📎 File: ${block.external_id}`;

    case "video":
      return `🎥 ${block.title.text}${block.description ? `\n${block.description.text}` : ""}`;

    case "rich_text":
      // Rich text is complex, just indicate it exists
      return "_[Rich text content]_";

    default:
      return "";
  }
}

function sectionToText(block: Extract<SlackBlock, { type: "section" }>): string {
  const parts: string[] = [];

  if (block.text) {
    parts.push(textObjectToText(block.text));
  }

  if (block.fields && block.fields.length > 0) {
    const fieldTexts = block.fields.map((f) => textObjectToText(f));
    parts.push(fieldTexts.join("\n"));
  }

  if (block.accessory) {
    const accessoryText = elementToText(block.accessory);
    if (accessoryText) {
      parts.push(`[${accessoryText}]`);
    }
  }

  return parts.join("\n");
}

function contextToText(block: Extract<SlackBlock, { type: "context" }>): string {
  const texts = block.elements.map((elem) => {
    if ("type" in elem && elem.type === "image") {
      return `![${elem.alt_text}](${elem.image_url})`;
    }
    return textObjectToText(elem);
  });

  return `_${texts.join(" • ")}_`;
}

function actionsToText(block: Extract<SlackBlock, { type: "actions" }>): string {
  const elementTexts = block.elements
    .map((elem, idx) => {
      const text = elementToText(elem);
      return text ? `${idx + 1}. ${text}` : null;
    })
    .filter(Boolean);

  return elementTexts.length > 0 ? `**Actions:**\n${elementTexts.join("\n")}` : "";
}

function elementToText(
  element: InteractiveElement | { type: "image"; image_url: string; alt_text: string },
): string {
  if ("type" in element) {
    switch (element.type) {
      case "button":
        return buttonToText(element);

      case "checkboxes":
        return checkboxesToText(element);

      case "radio_buttons":
        return radioButtonsToText(element);

      case "static_select":
      case "external_select":
      case "users_select":
      case "conversations_select":
      case "channels_select":
        return selectToText(element);

      case "multi_static_select":
      case "multi_external_select":
      case "multi_users_select":
      case "multi_conversations_select":
      case "multi_channels_select":
        return `Select multiple: ${element.placeholder?.text ?? "options"}`;

      case "datepicker":
        return `📅 Select date${element.placeholder ? `: ${element.placeholder.text}` : ""}`;

      case "datetimepicker":
        return "📅 Select date and time";

      case "timepicker":
        return `🕐 Select time${element.placeholder ? `: ${element.placeholder.text}` : ""}`;

      case "plain_text_input":
      case "email_text_input":
      case "url_text_input":
      case "number_input":
        return `Input: ${element.placeholder?.text ?? "value"}`;

      case "overflow":
        return "More options...";

      case "image":
        return `![${element.alt_text}](${element.image_url})`;

      default:
        return "[Interactive element]";
    }
  }

  return "";
}

function buttonToText(button: ButtonElement): string {
  const style = button.style === "primary" ? "**" : button.style === "danger" ? "~~" : "";
  return `${style}[${button.text.text}]${style}`;
}

function checkboxesToText(checkboxes: CheckboxesElement): string {
  const optionTexts = checkboxes.options.map((opt) => optionToText(opt, "☐"));
  return `**Select options:**\n${optionTexts.join("\n")}`;
}

function radioButtonsToText(radios: RadioButtonsElement): string {
  const optionTexts = radios.options.map((opt) => optionToText(opt, "○"));
  return `**Select one:**\n${optionTexts.join("\n")}`;
}

function selectToText(select: SelectElement): string {
  if ("options" in select && select.options) {
    const optionTexts = select.options.map((opt, idx) => `${idx + 1}. ${opt.text.text}`);
    return `**Choose:**\n${optionTexts.join("\n")}`;
  }

  if ("option_groups" in select && select.option_groups) {
    const groupTexts = select.option_groups.map((group) => {
      const options = group.options.map((opt, idx) => `  ${idx + 1}. ${opt.text.text}`);
      return `${group.label.text}:\n${options.join("\n")}`;
    });
    return `**Choose:**\n${groupTexts.join("\n")}`;
  }

  return select.placeholder?.text ?? "Select option";
}

function optionToText(option: Option, bullet: string): string {
  const desc = option.description ? ` - ${option.description.text}` : "";
  return `  ${bullet} ${option.text.text}${desc}`;
}

function textObjectToText(text: TextObject): string {
  if (text.type === "plain_text") {
    return text.text;
  }

  // mrkdwn - mostly compatible with markdown
  return text.text;
}

/**
 * Estimate if blocks will exceed Slack's limits
 * Returns warnings about potential issues
 */
export function validateBlocksForLimits(blocks: SlackBlock[]): string[] {
  const warnings: string[] = [];

  if (blocks.length > 50) {
    warnings.push(`Block count (${blocks.length}) exceeds Slack limit of 50 blocks`);
  }

  for (const block of blocks) {
    if (block.type === "actions") {
      if (block.elements.length > 25) {
        warnings.push(`Actions block has ${block.elements.length} elements (max 25)`);
      }
    }

    if (block.type === "section") {
      if (block.fields && block.fields.length > 10) {
        warnings.push(`Section block has ${block.fields.length} fields (max 10)`);
      }
    }

    if (block.type === "context") {
      if (block.elements.length > 10) {
        warnings.push(`Context block has ${block.elements.length} elements (max 10)`);
      }
    }
  }

  return warnings;
}
