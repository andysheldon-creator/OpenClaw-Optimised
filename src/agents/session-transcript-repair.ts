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
  // - deduplicating tool_use IDs in assistant messages (Anthropic requires unique IDs)
  const out: AgentMessage[] = [];
  const added: Array<Extract<AgentMessage, { role: "toolResult" }>> = [];
  const seenToolResultIds = new Set<string>();
  const seenToolUseIds = new Set<string>();
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

  // Deduplicate tool_use IDs in assistant messages by generating unique IDs for collisions
  const deduplicateToolUseId = (id: string): string => {
    if (!seenToolUseIds.has(id)) {
      seenToolUseIds.add(id);
      return id;
    }
    // Generate a unique ID by appending a counter
    let counter = 2;
    let newId = `${id}_${counter}`;
    while (seenToolUseIds.has(newId)) {
      counter += 1;
      newId = `${id}_${counter}`;
    }
    seenToolUseIds.add(newId);
    return newId;
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
    const toolCalls = extractToolCallsFromAssistant(assistant);
    if (toolCalls.length === 0) {
      out.push(msg);
      continue;
    }

    // Check for duplicate tool_use IDs and remap them if necessary.
    // IMPORTANT: We track remappings by block index (not just by ID) to handle
    // the case where the same ID appears multiple times within a single message.
    // Using a Map<originalId, newId> would cause all occurrences to map to the
    // last generated newId, losing tool results for earlier occurrences.
    const blockIndexToNewId = new Map<number, string>();
    let assistantNeedsRewrite = false;

    // Find block indices of tool calls in assistant.content
    const toolCallBlockIndices: number[] = [];
    if (Array.isArray(assistant.content)) {
      for (let idx = 0; idx < assistant.content.length; idx++) {
        const block = assistant.content[idx];
        if (!block || typeof block !== "object") {
          continue;
        }
        const rec = block as { type?: unknown; id?: unknown };
        if (
          (rec.type === "toolCall" || rec.type === "toolUse" || rec.type === "functionCall") &&
          typeof rec.id === "string" &&
          rec.id
        ) {
          toolCallBlockIndices.push(idx);
        }
      }
    }

    // Build per-block remapping
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i];
      const blockIndex = toolCallBlockIndices[i];
      const newId = deduplicateToolUseId(call.id);
      if (newId !== call.id) {
        blockIndexToNewId.set(blockIndex, newId);
        assistantNeedsRewrite = true;
        changed = true;
      }
    }

    // Rewrite assistant message if any tool_use IDs were deduplicated
    let processedAssistant = assistant;
    if (assistantNeedsRewrite && Array.isArray(assistant.content)) {
      const newContent = assistant.content.map((block, idx) => {
        if (blockIndexToNewId.has(idx)) {
          return {
            ...(block as unknown as Record<string, unknown>),
            id: blockIndexToNewId.get(idx),
          };
        }
        return block;
      });
      processedAssistant = { ...assistant, content: newContent as typeof assistant.content };
    }

    // Update toolCalls with remapped IDs for matching - each call gets its own newId
    const effectiveToolCalls = toolCalls.map((call, i) => {
      const blockIndex = toolCallBlockIndices[i];
      const newId = blockIndexToNewId.get(blockIndex);
      return {
        ...call,
        id: newId ?? call.id,
        originalId: call.id,
        blockIndex,
      };
    });
    const toolCallIds = new Set(effectiveToolCalls.map((t) => t.originalId));

    // Collect toolResults by ID - use array to handle multiple results with same ID
    const spanResultsById = new Map<string, Array<Extract<AgentMessage, { role: "toolResult" }>>>();
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
          // Collect all results for this ID (don't drop duplicates here - we'll match them by order)
          const existing = spanResultsById.get(id) ?? [];
          existing.push(toolResult);
          spanResultsById.set(id, existing);
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

    out.push(processedAssistant);

    if (spanResultsById.size > 0 && remainder.length > 0) {
      moved = true;
      changed = true;
    }

    // Track how many results we've consumed for each originalId
    const consumedCountById = new Map<string, number>();

    for (const call of effectiveToolCalls) {
      const resultsForId = spanResultsById.get(call.originalId);
      const consumedCount = consumedCountById.get(call.originalId) ?? 0;
      const existing = resultsForId?.[consumedCount];

      if (existing) {
        consumedCountById.set(call.originalId, consumedCount + 1);
        // Remap toolResult ID if the tool_use ID was deduplicated
        if (call.id !== call.originalId) {
          const remappedResult = {
            ...existing,
            toolCallId: call.id,
          } as Extract<AgentMessage, { role: "toolResult" }>;
          pushToolResult(remappedResult);
        } else {
          pushToolResult(existing);
        }
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
