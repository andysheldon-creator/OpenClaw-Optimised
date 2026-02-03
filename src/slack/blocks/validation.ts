/**
 * Block Kit validation - Enforce Slack's limits and constraints
 * Validates blocks before sending to prevent API errors
 */

import type { SlackBlock, ActionsBlock, SectionBlock, ContextBlock, TextObject } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate blocks against Slack API limits
 */
export function validateBlocks(blocks: SlackBlock[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Max 50 blocks per message
  if (blocks.length > 50) {
    errors.push(`Block count (${blocks.length}) exceeds maximum of 50 blocks per message`);
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockPrefix = `Block ${i + 1} (${block.type})`;

    switch (block.type) {
      case "actions":
        validateActionsBlock(block, blockPrefix, errors, warnings);
        break;

      case "section":
        validateSectionBlock(block, blockPrefix, errors, warnings);
        break;

      case "context":
        validateContextBlock(block, blockPrefix, errors, warnings);
        break;

      case "header":
        if (block.text.text.length > 150) {
          errors.push(`${blockPrefix}: Header text exceeds 150 characters`);
        }
        break;

      case "input":
        if (block.label.text.length > 2000) {
          errors.push(`${blockPrefix}: Label exceeds 2000 characters`);
        }
        if (block.hint && block.hint.text.length > 2000) {
          errors.push(`${blockPrefix}: Hint exceeds 2000 characters`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateActionsBlock(
  block: ActionsBlock,
  prefix: string,
  errors: string[],
  warnings: string[],
): void {
  // Max 25 elements in actions block
  if (block.elements.length > 25) {
    errors.push(`${prefix}: Elements count (${block.elements.length}) exceeds maximum of 25`);
  }

  if (block.elements.length === 0) {
    warnings.push(`${prefix}: Actions block has no elements`);
  }

  // Validate each element
  for (const element of block.elements) {
    if (element.type === "button" && element.text.text.length > 75) {
      errors.push(`${prefix}: Button text exceeds 75 characters`);
    }

    if (element.type === "checkboxes" || element.type === "radio_buttons") {
      if (element.options.length > 10) {
        errors.push(`${prefix}: ${element.type} has ${element.options.length} options (max 10)`);
      }
    }

    if (element.type === "static_select" || element.type === "external_select") {
      if ("options" in element && element.options && element.options.length > 100) {
        errors.push(`${prefix}: Select has ${element.options.length} options (max 100)`);
      }
    }
  }
}

function validateSectionBlock(
  block: SectionBlock,
  prefix: string,
  errors: string[],
  warnings: string[],
): void {
  // Max 3000 characters in text
  if (block.text) {
    validateTextObject(block.text, 3000, prefix, errors);
  }

  // Max 10 fields
  if (block.fields && block.fields.length > 10) {
    errors.push(`${prefix}: Fields count (${block.fields.length}) exceeds maximum of 10`);
  }

  // Validate fields
  if (block.fields) {
    for (const field of block.fields) {
      validateTextObject(field, 2000, prefix, errors);
    }
  }

  if (!block.text && (!block.fields || block.fields.length === 0) && !block.accessory) {
    warnings.push(`${prefix}: Section block is empty`);
  }
}

function validateContextBlock(
  block: ContextBlock,
  prefix: string,
  errors: string[],
  warnings: string[],
): void {
  // Max 10 elements
  if (block.elements.length > 10) {
    errors.push(`${prefix}: Elements count (${block.elements.length}) exceeds maximum of 10`);
  }

  if (block.elements.length === 0) {
    warnings.push(`${prefix}: Context block has no elements`);
  }

  // Validate text elements
  for (const element of block.elements) {
    if ("text" in element) {
      validateTextObject(element, 2000, prefix, errors);
    }
  }
}

function validateTextObject(
  text: TextObject,
  maxLength: number,
  prefix: string,
  errors: string[],
): void {
  if (text.text.length > maxLength) {
    errors.push(`${prefix}: Text exceeds ${maxLength} characters (${text.text.length})`);
  }
}

/**
 * Check if blocks are likely to render well on mobile
 */
export function validateMobileReadability(blocks: SlackBlock[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const block of blocks) {
    if (block.type === "section" && block.fields) {
      if (block.fields.length > 4) {
        warnings.push(
          `Section with ${block.fields.length} fields may be hard to read on mobile (consider using fewer fields)`,
        );
      }
    }

    if (block.type === "actions" && block.elements.length > 5) {
      warnings.push(`Actions block with ${block.elements.length} buttons may overflow on mobile`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that action IDs are unique across blocks
 */
export function validateUniqueActionIds(blocks: SlackBlock[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const actionIds = new Set<string>();

  for (const block of blocks) {
    if (block.type === "actions") {
      for (const element of block.elements) {
        if ("action_id" in element) {
          const actionId = element.action_id;
          if (actionIds.has(actionId)) {
            errors.push(`Duplicate action_id: ${actionId}`);
          }
          actionIds.add(actionId);
        }
      }
    }

    if (block.type === "section" && block.accessory && "action_id" in block.accessory) {
      const actionId = block.accessory.action_id;
      if (actionIds.has(actionId)) {
        errors.push(`Duplicate action_id: ${actionId}`);
      }
      actionIds.add(actionId);
    }

    if (block.type === "input" && "action_id" in block.element) {
      const actionId = block.element.action_id;
      if (actionIds.has(actionId)) {
        errors.push(`Duplicate action_id: ${actionId}`);
      }
      actionIds.add(actionId);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validations
 */
export function validateAll(blocks: SlackBlock[]): ValidationResult {
  const results = [
    validateBlocks(blocks),
    validateMobileReadability(blocks),
    validateUniqueActionIds(blocks),
  ];

  return {
    valid: results.every((r) => r.valid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}
