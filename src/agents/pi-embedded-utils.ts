import type { AssistantMessage } from "@mariozechner/pi-ai";
import { formatToolDetail, resolveToolDisplay } from "./tool-display.js";

/**
 * Detect whether a text block looks like a raw JSON tool-call hallucination.
 *
 * Small / local LLMs (especially coding-focused models like qwen2.5-coder)
 * sometimes emit raw JSON tool calls as text instead of using the proper
 * tool_use protocol.  These look like:
 *
 *   {"name": "telegram", "arguments": {"action": "send_message", ...}}
 *   {"name": "browser", "arguments": {"action": "status"}}
 *
 * This function returns true for text that is purely a JSON object with a
 * "name" key and an "arguments" or "parameters" key — i.e. a hallucinated
 * tool invocation that should never be shown to the user.
 */
export function isHallucinatedToolCall(text: string): boolean {
  const trimmed = text.trim();
  // Quick guard: must start and end with braces
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return false;
    // Must have a "name" field (tool name) and "arguments" or "parameters"
    if (typeof parsed.name !== "string") return false;
    if (
      typeof parsed.arguments !== "object" &&
      typeof parsed.parameters !== "object"
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export function extractAssistantText(msg: AssistantMessage): string {
  const isTextBlock = (
    block: unknown,
  ): block is { type: "text"; text: string } => {
    if (!block || typeof block !== "object") return false;
    const rec = block as Record<string, unknown>;
    return rec.type === "text" && typeof rec.text === "string";
  };

  const blocks = Array.isArray(msg.content)
    ? msg.content
        .filter(isTextBlock)
        .map((c) => c.text.trim())
        .filter(Boolean)
        // Strip hallucinated tool calls from small/local LLMs that emit
        // raw JSON instead of using the proper tool_use protocol.
        .filter((text) => !isHallucinatedToolCall(text))
    : [];
  return blocks.join("\n").trim();
}

export function inferToolMetaFromArgs(
  toolName: string,
  args: unknown,
): string | undefined {
  const display = resolveToolDisplay({ name: toolName, args });
  return formatToolDetail(display);
}

// ─── Thinking-tag stripping (shared) ─────────────────────────────────────
// Strips <think>...</think> and <thinking>...</thinking> tags and their
// content from LLM output so internal reasoning never leaks to the user.
// Used by pi-embedded-subscribe (streaming), claude-cli (batch), and the
// Ollama router response path.

const THINKING_TAG_RE_SHARED = /<\s*\/?\s*think(?:ing)?\s*>/gi;

/**
 * Remove all `<think>...</think>` (and `<thinking>...</thinking>`) segments
 * from `text`, returning only the non-thinking parts.
 */
export function stripThinkingTags(text: string): string {
  if (!text || !THINKING_TAG_RE_SHARED.test(text)) return text;
  THINKING_TAG_RE_SHARED.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let inThinking = false;
  for (const match of text.matchAll(THINKING_TAG_RE_SHARED)) {
    const idx = match.index ?? 0;
    if (!inThinking) {
      result += text.slice(lastIndex, idx);
    }
    const tag = match[0].toLowerCase();
    inThinking = !tag.includes("/");
    lastIndex = idx + match[0].length;
  }
  if (!inThinking) {
    result += text.slice(lastIndex);
  }
  return result.trim();
}

/**
 * Extract the content inside `<final>...</final>` tags, if present.
 * Returns the inner text, or `undefined` if no `<final>` block is found.
 */
export function extractFinalTagContent(text: string): string | undefined {
  const startRe = /<\s*final\s*>/i;
  const endRe = /<\s*\/\s*final\s*>/i;
  const startMatch = startRe.exec(text);
  if (!startMatch) return undefined;
  const after = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = endRe.exec(after);
  return endMatch ? after.slice(0, endMatch.index).trim() : after.trim();
}

/**
 * Clean an LLM response by stripping thinking segments and extracting
 * the <final> block if present.  This is the single entry point for all
 * backend paths (pi-embedded, claude-cli, ollama) to sanitise output.
 */
export function cleanLlmResponse(text: string): string {
  if (!text) return text;
  const stripped = stripThinkingTags(text);
  const finalContent = extractFinalTagContent(stripped);
  return (finalContent ?? stripped).trim();
}
