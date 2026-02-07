import { stripReasoningTagsFromText } from "../../shared/text/reasoning-tags.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractTextFromContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  // Common Claude-style content: [{type:"text", text:"..."}]
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        parts.push(entry);
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
      // Skip thinking/reasoning blocks - these should not leak into user-facing text
      const type = entry.type;
      if (type === "thinking" || type === "reasoning") {
        continue;
      }
      const text = entry.text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text);
      }
    }
    const joined = parts.join("\n").trim();
    return joined || undefined;
  }

  if (isRecord(value)) {
    // Some SDKs emit {text:"..."} or {delta:"..."}.
    const text = value.text;
    if (typeof text === "string" && text.trim()) {
      return text;
    }
    const delta = value.delta;
    if (typeof delta === "string" && delta.trim()) {
      return delta;
    }

    // Some SDKs nest deltas (e.g. Claude stream_event: { event: { delta: { text } } }).
    const nestedDelta = extractTextFromContent(delta);
    if (nestedDelta) {
      return nestedDelta;
    }

    const event = value.event;
    const nestedEvent = extractTextFromContent(event);
    if (nestedEvent) {
      return nestedEvent;
    }

    const content = value.content;
    const nested = extractTextFromContent(content);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

/**
 * Extract thinking/reasoning text from a Claude Agent SDK event.
 * Complementary to `extractTextFromClaudeAgentSdkEvent` which strips thinking —
 * this one extracts *only* thinking content for the reasoning stream.
 *
 * SDK thinking events typically have:
 * - `{ type: "thinking", thinking: "text..." }`
 * - `{ type: "thinking_delta", delta: "text..." }`
 * - `{ type: "reasoning", text: "text..." }`
 * - Content blocks: `{ type: "thinking", text: "..." }`
 */
export function extractThinkingFromSdkEvent(event: unknown): string | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  const type = event.type as string | undefined;
  if (type !== "thinking" && type !== "thinking_delta" && type !== "reasoning") {
    return undefined;
  }

  // Direct thinking text field.
  if (typeof event.thinking === "string" && event.thinking.trim()) {
    return event.thinking.trim();
  }

  // Delta text (streaming thinking chunks).
  if (typeof event.delta === "string" && event.delta.trim()) {
    return event.delta.trim();
  }

  // Generic text field.
  if (typeof event.text === "string" && event.text.trim()) {
    return event.text.trim();
  }

  // Nested delta object: { delta: { text: "..." } }
  if (isRecord(event.delta) && typeof event.delta.text === "string" && event.delta.text.trim()) {
    return event.delta.text.trim();
  }

  return undefined;
}

/**
 * Best-effort extraction of human-readable text from Claude Agent SDK events.
 * We keep this defensive because the SDK event shapes may evolve.
 *
 * IMPORTANT: This function strips thinking/reasoning tags to prevent them from
 * leaking into channel deliveries.
 */
export function extractTextFromClaudeAgentSdkEvent(event: unknown): string | undefined {
  if (typeof event === "string") {
    return stripReasoningTagsFromText(event, { mode: "strict", trim: "both" });
  }
  if (!isRecord(event)) {
    return undefined;
  }

  // Direct text-ish fields.
  const direct = extractTextFromContent(event);
  if (direct) {
    return stripReasoningTagsFromText(direct, { mode: "strict", trim: "both" });
  }

  // Common wrapper shapes: {message:{...}}, {data:{...}}.
  const message = event.message;
  const fromMessage = extractTextFromContent(message);
  if (fromMessage) {
    return stripReasoningTagsFromText(fromMessage, { mode: "strict", trim: "both" });
  }

  const data = event.data;
  const fromData = extractTextFromContent(data);
  if (fromData) {
    return stripReasoningTagsFromText(fromData, { mode: "strict", trim: "both" });
  }

  // Nested message/data objects with content.
  if (isRecord(message)) {
    const fromMessageContent = extractTextFromContent(message.content);
    if (fromMessageContent) {
      return stripReasoningTagsFromText(fromMessageContent, { mode: "strict", trim: "both" });
    }
  }
  if (isRecord(data)) {
    const fromDataContent = extractTextFromContent(data.content);
    if (fromDataContent) {
      return stripReasoningTagsFromText(fromDataContent, { mode: "strict", trim: "both" });
    }
  }

  return undefined;
}
