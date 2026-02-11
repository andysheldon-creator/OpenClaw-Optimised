import type { AgentMessage } from "@mariozechner/pi-agent-core";

type ToolCallLike = {
  id: string;
  name?: string;
};

const TOOL_CALL_TYPES = new Set(["toolCall", "toolUse", "functionCall"]);

type ToolCallBlock = {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  arguments?: unknown;
};

function extractToolCallsFromAssistant(
  msg: Extract<AgentMessage, { role: "assistant" }>,
): ToolCallLike[] {
  const content = msg.content;
  if (!Array.isArray(content)) {
    return [];
  }

  const toolCalls: ToolCallLike[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const rec = block as { type?: unknown; id?: unknown; name?: unknown };
    if (typeof rec.id !== "string" || !rec.id) {
      continue;
    }

    if (rec.type === "toolCall" || rec.type === "toolUse" || rec.type === "functionCall") {
      toolCalls.push({
        id: rec.id,
        name: typeof rec.name === "string" ? rec.name : undefined,
      });
    }
  }
  return toolCalls;
}

function isToolCallBlock(block: unknown): block is ToolCallBlock {
  if (!block || typeof block !== "object") {
    return false;
  }
  const type = (block as { type?: unknown }).type;
  return typeof type === "string" && TOOL_CALL_TYPES.has(type);
}

function hasToolCallInput(block: ToolCallBlock): boolean {
  const hasInput = "input" in block ? block.input !== undefined && block.input !== null : false;
  const hasArguments =
    "arguments" in block ? block.arguments !== undefined && block.arguments !== null : false;
  return hasInput || hasArguments;
}

function extractToolResultId(msg: Extract<AgentMessage, { role: "toolResult" }>): string | null {
  const toolCallId = (msg as { toolCallId?: unknown }).toolCallId;
  if (typeof toolCallId === "string" && toolCallId) {
    return toolCallId;
  }
  const toolUseId = (msg as { toolUseId?: unknown }).toolUseId;
  if (typeof toolUseId === "string" && toolUseId) {
    return toolUseId;
  }
  return null;
}

function makeMissingToolResult(params: {
  toolCallId: string;
  toolName?: string;
}): Extract<AgentMessage, { role: "toolResult" }> {
  return {
    role: "toolResult",
    toolCallId: params.toolCallId,
    toolName: params.toolName ?? "unknown",
    content: [
      {
        type: "text",
        text: "[openclaw] missing tool result in session history; inserted synthetic error result for transcript repair.",
      },
    ],
    isError: true,
    timestamp: Date.now(),
  } as Extract<AgentMessage, { role: "toolResult" }>;
}

export { makeMissingToolResult };

export type ToolCallInputRepairReport = {
  messages: AgentMessage[];
  droppedToolCalls: number;
  droppedAssistantMessages: number;
};

export function repairToolCallInputs(messages: AgentMessage[]): ToolCallInputRepairReport {
  let droppedToolCalls = 0;
  let droppedAssistantMessages = 0;
  let changed = false;
  const out: AgentMessage[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      out.push(msg);
      continue;
    }

    const nextContent = [];
    let droppedInMessage = 0;

    for (const block of msg.content) {
      if (isToolCallBlock(block) && !hasToolCallInput(block)) {
        droppedToolCalls += 1;
        droppedInMessage += 1;
        changed = true;
        continue;
      }
      nextContent.push(block);
    }

    if (droppedInMessage > 0) {
      if (nextContent.length === 0) {
        droppedAssistantMessages += 1;
        changed = true;
        continue;
      }
      out.push({ ...msg, content: nextContent });
      continue;
    }

    out.push(msg);
  }

  return {
    messages: changed ? out : messages,
    droppedToolCalls,
    droppedAssistantMessages,
  };
}

export function sanitizeToolCallInputs(messages: AgentMessage[]): AgentMessage[] {
  return repairToolCallInputs(messages).messages;
}

export function sanitizeToolUseResultPairing(messages: AgentMessage[]): AgentMessage[] {
  return repairToolUseResultPairing(messages).messages;
}

/**
 * Convert tool call rounds (assistant tool_call blocks + matching toolResult messages) into
 * plain text so that proxied Gemini endpoints (e.g. GitHub Copilot) don't choke on
 * OpenAI-style tool_calls in conversation history.
 *
 * For each assistant message that contains toolCall/toolUse/functionCall blocks:
 * - The tool call blocks are replaced with a text summary.
 * - Following toolResult messages that belong to those tool calls are converted to user
 *   messages containing the result text.
 * - Non-tool-call content blocks in the assistant message are preserved.
 */
export function textifyToolCallRounds(messages: AgentMessage[]): AgentMessage[] {
  let changed = false;
  const out: AgentMessage[] = [];

  // Collect all toolResult messages keyed by id so we can match them.
  const toolResultById = new Map<string, Extract<AgentMessage, { role: "toolResult" }>>();
  for (const msg of messages) {
    if (msg && typeof msg === "object" && msg.role === "toolResult") {
      const id = extractToolResultId(msg);
      if (id && !toolResultById.has(id)) {
        toolResultById.set(id, msg);
      }
    }
  }

  // IDs of tool calls whose results we've already inlined (so we can skip the toolResult messages).
  const consumedToolResultIds = new Set<string>();

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    // Skip toolResult messages that were consumed by textification.
    if (msg.role === "toolResult") {
      const id = extractToolResultId(msg);
      if (id && consumedToolResultIds.has(id)) {
        changed = true;
        continue;
      }
      out.push(msg);
      continue;
    }

    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      out.push(msg);
      continue;
    }

    // Check if this assistant message has any tool call blocks.
    const toolCallBlocks: Array<{
      type: string;
      id: string;
      name?: string;
      input?: unknown;
      arguments?: unknown;
    }> = [];
    const otherBlocks: unknown[] = [];

    for (const block of msg.content) {
      if (isToolCallBlock(block) && typeof (block as { id?: unknown }).id === "string") {
        toolCallBlocks.push(
          block as {
            type: string;
            id: string;
            name?: string;
            input?: unknown;
            arguments?: unknown;
          },
        );
      } else {
        otherBlocks.push(block);
      }
    }

    if (toolCallBlocks.length === 0) {
      out.push(msg);
      continue;
    }

    changed = true;

    // Build text summaries for each tool call + its result.
    const textParts: string[] = [];
    const resultMessages: AgentMessage[] = [];

    for (const tc of toolCallBlocks) {
      const name = tc.name ?? "unknown_tool";
      const args = tc.input ?? tc.arguments;
      const argsStr = args ? JSON.stringify(args) : "{}";
      textParts.push(`[Called tool ${name}(${argsStr})]`);

      // Mark the corresponding toolResult as consumed and convert it.
      const result = toolResultById.get(tc.id);
      if (result) {
        consumedToolResultIds.add(tc.id);
        const resultText = extractToolResultText(result);
        resultMessages.push({
          role: "user",
          content: `[Tool ${name} result: ${resultText}]`,
          timestamp: (result as { timestamp?: number }).timestamp ?? Date.now(),
        } as AgentMessage);
      }
    }

    // Rebuild the assistant message: keep non-tool-call blocks + add summary text.
    const newContent: unknown[] = [...otherBlocks];
    const summaryText = textParts.join("\n");
    newContent.push({ type: "text", text: summaryText });

    out.push({ ...msg, content: newContent } as AgentMessage);
    out.push(...resultMessages);
  }

  return changed ? out : messages;
}

/** Extract a textual representation from a toolResult message. */
function extractToolResultText(msg: Extract<AgentMessage, { role: "toolResult" }>): string {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    return truncateToolResultForTextify(content);
  }
  if (!Array.isArray(content)) {
    return "(no content)";
  }
  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const text = (block as { text?: string }).text;
      if (typeof text === "string") {
        texts.push(text);
      }
    }
  }
  return truncateToolResultForTextify(texts.join("\n") || "(no content)");
}

const TEXTIFY_MAX_RESULT_CHARS = 800;

function truncateToolResultForTextify(text: string): string {
  if (text.length <= TEXTIFY_MAX_RESULT_CHARS) {
    return text;
  }
  return text.slice(0, TEXTIFY_MAX_RESULT_CHARS) + "… (truncated)";
}

export type ToolUseRepairReport = {
  messages: AgentMessage[];
  added: Array<Extract<AgentMessage, { role: "toolResult" }>>;
  droppedDuplicateCount: number;
  droppedOrphanCount: number;
  moved: boolean;
};

export function repairToolUseResultPairing(messages: AgentMessage[]): ToolUseRepairReport {
  // Anthropic (and Cloud Code Assist) reject transcripts where assistant tool calls are not
  // immediately followed by matching tool results. Session files can end up with results
  // displaced (e.g. after user turns) or duplicated. Repair by:
  // - moving matching toolResult messages directly after their assistant toolCall turn
  // - inserting synthetic error toolResults for missing ids
  // - dropping duplicate toolResults for the same id (anywhere in the transcript)
  const out: AgentMessage[] = [];
  const added: Array<Extract<AgentMessage, { role: "toolResult" }>> = [];
  const seenToolResultIds = new Set<string>();
  let droppedDuplicateCount = 0;
  let droppedOrphanCount = 0;
  let moved = false;
  let changed = false;

  const pushToolResult = (msg: Extract<AgentMessage, { role: "toolResult" }>) => {
    const id = extractToolResultId(msg);
    if (id && seenToolResultIds.has(id)) {
      droppedDuplicateCount += 1;
      changed = true;
      return;
    }
    if (id) {
      seenToolResultIds.add(id);
    }
    out.push(msg);
  };

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    const role = (msg as { role?: unknown }).role;
    if (role !== "assistant") {
      // Tool results must only appear directly after the matching assistant tool call turn.
      // Any "free-floating" toolResult entries in session history can make strict providers
      // (Anthropic-compatible APIs, MiniMax, Cloud Code Assist) reject the entire request.
      if (role !== "toolResult") {
        out.push(msg);
      } else {
        droppedOrphanCount += 1;
        changed = true;
      }
      continue;
    }

    const assistant = msg as Extract<AgentMessage, { role: "assistant" }>;

    // Skip tool call extraction for aborted or errored assistant messages.
    // When stopReason is "error" or "aborted", the tool_use blocks may be incomplete
    // (e.g., partialJson: true) and should not have synthetic tool_results created.
    // Creating synthetic results for incomplete tool calls causes API 400 errors:
    // "unexpected tool_use_id found in tool_result blocks"
    // See: https://github.com/openclaw/openclaw/issues/4597
    const stopReason = (assistant as { stopReason?: string }).stopReason;
    if (stopReason === "error" || stopReason === "aborted") {
      out.push(msg);
      continue;
    }

    const toolCalls = extractToolCallsFromAssistant(assistant);
    if (toolCalls.length === 0) {
      out.push(msg);
      continue;
    }

    const toolCallIds = new Set(toolCalls.map((t) => t.id));

    const spanResultsById = new Map<string, Extract<AgentMessage, { role: "toolResult" }>>();
    const remainder: AgentMessage[] = [];

    let j = i + 1;
    for (; j < messages.length; j += 1) {
      const next = messages[j];
      if (!next || typeof next !== "object") {
        remainder.push(next);
        continue;
      }

      const nextRole = (next as { role?: unknown }).role;
      if (nextRole === "assistant") {
        break;
      }

      if (nextRole === "toolResult") {
        const toolResult = next as Extract<AgentMessage, { role: "toolResult" }>;
        const id = extractToolResultId(toolResult);
        if (id && toolCallIds.has(id)) {
          if (seenToolResultIds.has(id)) {
            droppedDuplicateCount += 1;
            changed = true;
            continue;
          }
          if (!spanResultsById.has(id)) {
            spanResultsById.set(id, toolResult);
          }
          continue;
        }
      }

      // Drop tool results that don't match the current assistant tool calls.
      if (nextRole !== "toolResult") {
        remainder.push(next);
      } else {
        droppedOrphanCount += 1;
        changed = true;
      }
    }

    out.push(msg);

    if (spanResultsById.size > 0 && remainder.length > 0) {
      moved = true;
      changed = true;
    }

    for (const call of toolCalls) {
      const existing = spanResultsById.get(call.id);
      if (existing) {
        pushToolResult(existing);
      } else {
        const missing = makeMissingToolResult({
          toolCallId: call.id,
          toolName: call.name,
        });
        added.push(missing);
        changed = true;
        pushToolResult(missing);
      }
    }

    for (const rem of remainder) {
      if (!rem || typeof rem !== "object") {
        out.push(rem);
        continue;
      }
      out.push(rem);
    }
    i = j - 1;
  }

  const changedOrMoved = changed || moved;
  return {
    messages: changedOrMoved ? out : messages,
    added,
    droppedDuplicateCount,
    droppedOrphanCount,
    moved: changedOrMoved,
  };
}
