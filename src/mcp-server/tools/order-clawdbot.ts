import { getReplyFromConfig } from "../../auto-reply/reply/get-reply.js";
import { loadConfig } from "../../config/config.js";
import { buildSyntheticContext } from "../context.js";
import type { ReplyPayload, GetReplyOptions, BlockReplyContext } from "../../auto-reply/types.js";

export const orderClawdbotTool = {
  definition: {
    name: "order_clawdbot",
    description:
      "Send a message to Clawdbot and receive a response. The message will be processed as if typed by a user.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "The message to send to Clawdbot",
        },
        sessionKey: {
          type: "string",
          description: "Optional session key for conversation continuity",
        },
      },
      required: ["message"],
    },
  },

  async handler(args: { message: string; sessionKey?: string }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }> {
    // Load config for timeout resolution
    const cfg = loadConfig();

    // Pass the user's message unmodified - no prefix injection
    // Generate unique session key by default to prevent context leakage between clients
    const sessionKey =
      args.sessionKey ?? `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = buildSyntheticContext({
      body: args.message,
      sessionKey,
      senderId: "mcp-client",
    });

    // Collect intermediate responses via callbacks.
    // These capture output that may not appear in the final ReplyPayload.
    const collectedReplies: string[] = [];

    const replyOptions: GetReplyOptions = {
      // Collect block replies (intermediate chunks sent during streaming).
      // Called from agent-runner-execution.ts:297-359 when block streaming is enabled
      // OR when flushing before tool execution.
      // Signature: (payload: ReplyPayload, context?: BlockReplyContext) => Promise<void> | void
      onBlockReply: (payload: ReplyPayload, _context?: BlockReplyContext) => {
        if (payload.text) {
          collectedReplies.push(payload.text);
        }
      },

      // Partial replies are streaming tokens - we skip these as they're
      // subsumed by block/final replies. Called from agent-runner-execution.ts:253-261
      // but only when allowPartialStream is true.
      onPartialReply: (_payload: ReplyPayload) => {
        // Intentionally not collected - partials are subsumed by block/final
      },

      // Reasoning stream for extended thinking output.
      // Called from agent-runner-execution.ts:266-275 when reasoning is streaming.
      // We skip these for the main response but could log them in verbose mode.
      onReasoningStream: (_payload: ReplyPayload) => {
        // Intentionally not collected - reasoning is internal thinking,
        // not part of the user-facing response
      },

      // Collect tool results if they contain text summaries.
      // Called from agent-runner-execution.ts:368-390 for tool execution output.
      onToolResult: (payload: ReplyPayload) => {
        if (payload.text) {
          collectedReplies.push(payload.text);
        }
      },
    };

    try {
      // Pass config for consistent timeout/model resolution
      const reply = await getReplyFromConfig(ctx, replyOptions, cfg);

      // Extract final reply text from the returned ReplyPayload(s).
      // The final response from getReplyFromConfig already contains the
      // aggregated response, so we primarily use this.
      const finalText = extractResponseText(reply);

      // Combine collected intermediate replies with final response.
      // Deduplication handles cases where block replies are repeated in final.
      const allParts = [...collectedReplies, finalText].filter(Boolean);
      const combinedText = deduplicateAndJoin(allParts);

      return {
        content: [{ type: "text", text: combinedText || "(No response)" }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

function extractResponseText(reply: ReplyPayload | ReplyPayload[] | undefined): string {
  if (!reply) return "";

  if (Array.isArray(reply)) {
    return reply
      .map((r) => r.text ?? "")
      .filter(Boolean)
      .join("\n\n");
  }

  return reply.text ?? "";
}

/**
 * Join response parts, removing duplicates where the final response
 * may contain the same content as intermediate block replies.
 *
 * Deduplication strategy:
 * 1. Normalize whitespace before comparison (trim + collapse internal whitespace)
 * 2. Check if final response subsumes earlier parts
 * 3. For partial overlaps, use the final response (most complete)
 * 4. Only join distinct parts that aren't substrings of each other
 */
export function deduplicateAndJoin(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // Normalize for comparison (but keep original for output)
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

  const final = parts[parts.length - 1];
  const finalNorm = normalize(final);
  const earlier = parts.slice(0, -1);

  // If final contains all earlier content (normalized), just return final
  const allSubsumed = earlier.every((part) => {
    const partNorm = normalize(part);
    return finalNorm.includes(partNorm) || partNorm.length === 0;
  });

  if (allSubsumed) {
    return final;
  }

  // Find parts that aren't subsumed by any later part
  const uniqueParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    const currentNorm = normalize(current);
    if (!currentNorm) continue;

    // Check if any later part subsumes this one
    const subsumedByLater = parts.slice(i + 1).some((later) => {
      const laterNorm = normalize(later);
      return laterNorm.includes(currentNorm);
    });

    if (!subsumedByLater) {
      uniqueParts.push(current);
    }
  }

  return uniqueParts.join("\n\n");
}
