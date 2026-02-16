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
