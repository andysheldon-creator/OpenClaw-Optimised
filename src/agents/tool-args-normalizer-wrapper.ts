/**
 * Tool argument normalizer — stream wrapper.
 *
 * Some models (especially gpt-oss) generate malformed tool call arguments:
 *   - Double-wrapped: { name: "exec", arguments: { command: "..." } }
 *     instead of just { command: "..." }
 *   - Wrong property names: cmd instead of command, file_path instead of path
 *   - Array values for string params: cmd: ["bash", "-lc", "ls"]
 *
 * The validation in pi-agent-core's agent-loop.js happens BEFORE our
 * tool execute() function can normalize the params.  This wrapper
 * intercepts the stream events and normalizes tool call arguments in the
 * AssistantMessage *before* the agent loop sees them, preventing
 * validation errors entirely.
 */

import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { logDebug, logWarn } from "../logger.js";
import { normalizeToolParams, normalizeToolParamsFromSchema } from "./pi-tools.read.js";

// ---------------------------------------------------------------------------
// Argument normalizer for a single toolCall content block
// ---------------------------------------------------------------------------

function normalizeToolCallArgs(
  args: unknown,
  toolName?: string,
  tools?: Array<{ name: string; parameters?: unknown }>,
): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object") {
    return undefined;
  }
  const record = args as Record<string, unknown>;

  // 1. Unwrap double-wrapped arguments:
  //    { name: "exec", arguments: { command: "..." } } → { command: "..." }
  if (
    "name" in record &&
    typeof record.name === "string" &&
    "arguments" in record &&
    typeof record.arguments === "object" &&
    record.arguments !== null
  ) {
    const inner = record.arguments as Record<string, unknown>;
    const innerToolName = record.name;
    logDebug(`[tool-normalizer] Unwrapped double-wrapped arguments for tool "${innerToolName}"`);
    // Apply schema-based normalization if tool is found
    const tool = tools?.find((t) => t.name === innerToolName);
    if (tool && tool.parameters) {
      const normalized = normalizeToolParamsFromSchema(
        inner,
        tool.parameters,
        tool as AnyAgentTool,
      );
      if (normalized) {
        return normalized;
      }
    }
    // Fallback to hardcoded normalization
    return normalizeToolParams(inner) ?? inner;
  }

  // 2. Schema-based normalization (if tool is available)
  if (toolName && tools) {
    const tool = tools.find((t) => t.name === toolName);
    if (tool && tool.parameters) {
      const normalized = normalizeToolParamsFromSchema(
        record,
        tool.parameters,
        tool as AnyAgentTool,
      );
      if (normalized) {
        return normalized;
      }
    }
  }

  // 3. Fallback to hardcoded normalizations (cmd→command, file_path→path, etc.)
  return normalizeToolParams(record) ?? undefined;
}

// ---------------------------------------------------------------------------
// Normalize tool calls inside an AssistantMessage
// ---------------------------------------------------------------------------

function normalizeMessageToolCalls(
  message: AssistantMessage,
  tools?: Array<{ name: string; parameters?: unknown }>,
): AssistantMessage {
  if (!message.content || !Array.isArray(message.content)) {
    return message;
  }

  let modified = false;
  const normalizedContent = message.content.map((block) => {
    if (!block || typeof block !== "object" || !("type" in block) || block.type !== "toolCall") {
      return block;
    }

    const toolCall = block as { type: "toolCall"; id: string; name: string; arguments: unknown };

    // --- Diagnostic logging: log EVERY tool call as received ---
    const argsJson = JSON.stringify(toolCall.arguments);
    const argsKeys =
      toolCall.arguments && typeof toolCall.arguments === "object"
        ? Object.keys(toolCall.arguments as Record<string, unknown>)
        : [];

    if (argsKeys.length === 0) {
      logWarn(
        `[tool-normalizer] ⚠ Tool "${toolCall.name}" called with EMPTY arguments: ${argsJson}`,
      );
    } else {
      logDebug(
        `[tool-normalizer] Tool "${toolCall.name}" raw args (keys: ${argsKeys.join(", ")}): ${argsJson.slice(0, 300)}`,
      );
    }

    const normalized = normalizeToolCallArgs(toolCall.arguments, toolCall.name, tools);
    if (!normalized) {
      return block;
    }

    // Check if normalization actually changed anything
    const originalJson = JSON.stringify(toolCall.arguments);
    const normalizedJson = JSON.stringify(normalized);
    if (originalJson === normalizedJson) {
      return block;
    }

    modified = true;
    logWarn(
      `[tool-normalizer] Normalized args for "${toolCall.name}": ${originalJson.slice(0, 300)} → ${normalizedJson.slice(0, 300)}`,
    );
    return {
      ...toolCall,
      arguments: normalized,
    };
  });

  if (!modified) {
    return message;
  }

  return {
    ...message,
    content: normalizedContent,
  } as AssistantMessage;
}

// ---------------------------------------------------------------------------
// Stream wrapper
// ---------------------------------------------------------------------------

async function pipeAndNormalize(
  input: ReturnType<typeof createAssistantMessageEventStream>,
  output: ReturnType<typeof createAssistantMessageEventStream>,
  tools?: Array<{ name: string; parameters?: unknown }>,
): Promise<void> {
  let fullText = "";

  try {
    for await (const event of input) {
      // Accumulate text for diagnostic logging
      if (event.type === "text_delta" && typeof event.delta === "string") {
        fullText += event.delta;
      }

      // Normalize tool call arguments in the final message
      if (event.type === "done") {
        // --- Diagnostic: detect leaked control tokens in non-harmony streams ---
        if (fullText.length > 0) {
          const controlTokenPattern = /<\|[^|]+\|>/g;
          const controlTokens = fullText.match(controlTokenPattern);
          if (controlTokens && controlTokens.length > 0) {
            logWarn(
              `[tool-normalizer] ⚠ Model output contains ${controlTokens.length} leaked control token(s): ${controlTokens.join(", ")}`,
            );
            logWarn(
              `[tool-normalizer] ⚠ Raw model text (first 500 chars): ${fullText.slice(0, 500)}`,
            );
          }
        }

        // --- Diagnostic: log all tool calls in the final message ---
        const toolCallBlocks = event.message.content?.filter(
          (b: { type: string }) => b?.type === "toolCall",
        );
        if (toolCallBlocks && toolCallBlocks.length > 0) {
          for (const tc of toolCallBlocks) {
            const tcObj = tc as { name: string; arguments: unknown };
            logDebug(
              `[tool-normalizer] Final message tool call: "${tcObj.name}" args=${JSON.stringify(tcObj.arguments).slice(0, 300)}`,
            );
          }
        }

        const normalizedMessage = normalizeMessageToolCalls(event.message, tools);
        output.push({
          ...event,
          message: normalizedMessage,
        });
        continue;
      }

      // Normalize tool call arguments in toolcall_end events (partial message)
      if (event.type === "toolcall_end" && event.partial) {
        const normalizedPartial = normalizeMessageToolCalls(event.partial, tools);
        // Also normalize the individual toolCall
        const normalizedToolCall = event.toolCall
          ? (() => {
              const tc = event.toolCall as {
                type: "toolCall";
                id: string;
                name: string;
                arguments: unknown;
              };
              const normalized = normalizeToolCallArgs(tc.arguments, tc.name, tools);
              if (normalized && JSON.stringify(normalized) !== JSON.stringify(tc.arguments)) {
                return { ...tc, arguments: normalized };
              }
              return event.toolCall;
            })()
          : event.toolCall;

        output.push({
          ...event,
          toolCall: normalizedToolCall,
          partial: normalizedPartial,
        } as AssistantMessageEvent);
        continue;
      }

      // Pass through everything else unchanged
      output.push(event);
    }
  } catch (err) {
    // Re-throw; the outer code handles stream errors.
    throw err;
  }
  output.end();
}

// ---------------------------------------------------------------------------
// Public: wraps a StreamFn to normalize tool arguments
// ---------------------------------------------------------------------------

/**
 * Wraps a StreamFn to automatically normalize tool call arguments in the
 * assistant message events before they reach the agent loop's validation.
 *
 * Uses schema-based normalization when tool schemas are available in the context,
 * falling back to hardcoded normalization for backward compatibility.
 */
export function createToolArgsNormalizerWrapper(streamFn: StreamFn): StreamFn {
  return async (model, context, options) => {
    const originalStream = await streamFn(model, context, options);
    const wrappedStream = createAssistantMessageEventStream();

    // Extract tools from context for schema-based normalization
    const tools = context.tools?.map((tool) => ({
      name: tool.name,
      parameters: tool.parameters,
    }));

    // Pipe events asynchronously, normalizing as we go
    pipeAndNormalize(originalStream, wrappedStream, tools).catch((err) => {
      // If the stream errors, close the wrapped stream
      logDebug(
        `[tool-normalizer] Stream error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return wrappedStream;
  };
}
