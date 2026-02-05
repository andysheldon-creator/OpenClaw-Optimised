import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  sanitizeToolCallInputs,
  sanitizeToolUseResultPairing,
} from "./session-transcript-repair.js";

describe("sanitizeToolUseResultPairing", () => {
  it("moves tool results directly after tool calls and inserts missing results", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "read", arguments: {} },
          { type: "toolCall", id: "call_2", name: "exec", arguments: {} },
        ],
      },
      { role: "user", content: "user message that should come after tool use" },
      {
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "exec",
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out[0]?.role).toBe("assistant");
    expect(out[1]?.role).toBe("toolResult");
    expect((out[1] as { toolCallId?: string }).toolCallId).toBe("call_1");
    expect(out[2]?.role).toBe("toolResult");
    expect((out[2] as { toolCallId?: string }).toolCallId).toBe("call_2");
    expect(out[3]?.role).toBe("user");
  });

  it("drops duplicate tool results for the same id within a span", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second" }],
        isError: false,
      },
      { role: "user", content: "ok" },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out.filter((m) => m.role === "toolResult")).toHaveLength(1);
  });

  it("drops duplicate tool results for the same id across the transcript", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first" }],
        isError: false,
      },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second (duplicate)" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]?.toolCallId).toBe("call_1");
  });

  it("drops orphan tool results that do not match any tool call", () => {
    const input = [
      { role: "user", content: "hello" },
      {
        role: "toolResult",
        toolCallId: "call_orphan",
        toolName: "read",
        content: [{ type: "text", text: "orphan" }],
        isError: false,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out.some((m) => m.role === "toolResult")).toBe(false);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("deduplicates tool_use IDs across assistant messages", () => {
    // This test ensures that duplicate tool_use IDs in different assistant messages
    // are remapped to unique IDs (Anthropic requires unique tool_use IDs)
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first result" }],
        isError: false,
      },
      { role: "user", content: "do it again" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }], // Duplicate ID
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second result" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    // Both tool calls should exist but with unique IDs
    const assistants = out.filter((m) => m.role === "assistant") as Array<{
      content?: Array<{ type?: string; id?: string }>;
    }>;
    expect(assistants).toHaveLength(2);

    const firstToolCallId = assistants[0]?.content?.[0]?.id;
    const secondToolCallId = assistants[1]?.content?.[0]?.id;

    // First ID should remain unchanged
    expect(firstToolCallId).toBe("call_1");
    // Second ID should be remapped to be unique
    expect(secondToolCallId).not.toBe("call_1");
    expect(secondToolCallId).toBe("call_1_2");

    // Tool results should have matching IDs
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
    }>;
    expect(results).toHaveLength(2);
    expect(results[0]?.toolCallId).toBe(firstToolCallId);
    expect(results[1]?.toolCallId).toBe(secondToolCallId);
  });

  it("handles toolUse type blocks with duplicate IDs", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "toolu_1", name: "exec", input: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "exec",
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
      { role: "user", content: "again" },
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "toolu_1", name: "exec", input: {} }], // Duplicate
      },
      {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "exec",
        content: [{ type: "text", text: "ok again" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    const assistants = out.filter((m) => m.role === "assistant") as Array<{
      content?: Array<{ type?: string; id?: string }>;
    }>;
    const ids = assistants.map((a) => a.content?.[0]?.id);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("deduplicates tool_use IDs within the SAME assistant message", () => {
    // This is the critical edge case: when the same ID appears multiple times
    // in a single assistant message (e.g., from retry logic or malformed transcripts).
    // Previously, using a Map<originalId, newId> would cause both tool calls
    // to be remapped to the same new ID, losing the second tool result.
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.txt" } },
          { type: "toolCall", id: "call_1", name: "read", arguments: { path: "b.txt" } }, // Same ID!
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "content of a.txt" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "content of b.txt" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    // Get the assistant message
    const assistant = out.find((m) => m.role === "assistant") as {
      content?: Array<{ type?: string; id?: string }>;
    };
    const toolCallIds = assistant.content?.map((block) => block.id) ?? [];

    // Both tool calls should have UNIQUE IDs
    expect(toolCallIds).toHaveLength(2);
    expect(new Set(toolCallIds).size).toBe(2);
    expect(toolCallIds[0]).toBe("call_1");
    expect(toolCallIds[1]).toBe("call_1_2");

    // Both tool results should be preserved with matching unique IDs
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    expect(results).toHaveLength(2);

    // First result should match first tool call
    expect(results[0]?.toolCallId).toBe("call_1");
    expect(results[0]?.content?.[0]?.text).toBe("content of a.txt");

    // Second result should match second (remapped) tool call
    expect(results[1]?.toolCallId).toBe("call_1_2");
    expect(results[1]?.content?.[0]?.text).toBe("content of b.txt");
  });

  it("handles multiple duplicate IDs within the same message with varying counts", () => {
    // Test with 3 tool calls, all with the same ID
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "dup", name: "exec", arguments: { cmd: "1" } },
          { type: "toolCall", id: "dup", name: "exec", arguments: { cmd: "2" } },
          { type: "toolCall", id: "dup", name: "exec", arguments: { cmd: "3" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "dup",
        toolName: "exec",
        content: [{ type: "text", text: "result 1" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "dup",
        toolName: "exec",
        content: [{ type: "text", text: "result 2" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "dup",
        toolName: "exec",
        content: [{ type: "text", text: "result 3" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    const assistant = out.find((m) => m.role === "assistant") as {
      content?: Array<{ type?: string; id?: string }>;
    };
    const toolCallIds = assistant.content?.map((block) => block.id) ?? [];

    // All 3 should have unique IDs
    expect(toolCallIds).toEqual(["dup", "dup_2", "dup_3"]);

    // All 3 results should be preserved
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.toolCallId)).toEqual(["dup", "dup_2", "dup_3"]);
    expect(results.map((r) => r.content?.[0]?.text)).toEqual(["result 1", "result 2", "result 3"]);
  });
});

describe("sanitizeToolCallInputs", () => {
  it("drops tool calls missing input or arguments", () => {
    const input: AgentMessage[] = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read" }],
      },
      { role: "user", content: "hello" },
    ];

    const out = sanitizeToolCallInputs(input);
    expect(out.map((m) => m.role)).toEqual(["user"]);
  });

  it("keeps valid tool calls and preserves text blocks", () => {
    const input: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "before" },
          { type: "toolUse", id: "call_ok", name: "read", input: { path: "a" } },
          { type: "toolCall", id: "call_drop", name: "read" },
        ],
      },
    ];

    const out = sanitizeToolCallInputs(input);
    const assistant = out[0] as Extract<AgentMessage, { role: "assistant" }>;
    const types = Array.isArray(assistant.content)
      ? assistant.content.map((block) => (block as { type?: unknown }).type)
      : [];
    expect(types).toEqual(["text", "toolUse"]);
  });
});
