import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { sanitizeToolsForGoogle, stripAbortedAssistantMessages } from "./google.js";

describe("sanitizeToolsForGoogle", () => {
  it("strips unsupported schema keywords for Google providers", () => {
    const tool = {
      name: "test",
      description: "test",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          foo: {
            type: "string",
            format: "uuid",
          },
        },
      },
      execute: async () => ({ ok: true, content: [] }),
    } as unknown as AgentTool;

    const [sanitized] = sanitizeToolsForGoogle({
      tools: [tool],
      provider: "google-gemini-cli",
    });

    const params = sanitized.parameters as {
      additionalProperties?: unknown;
      properties?: Record<string, { format?: unknown }>;
    };

    expect(params.additionalProperties).toBeUndefined();
    expect(params.properties?.foo?.format).toBeUndefined();
  });
});

describe("stripAbortedAssistantMessages", () => {
  it("replaces aborted assistant with context text and drops its tool_result", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_aborted", name: "read", arguments: "{}" }],
        stopReason: "aborted",
      } as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "toolu_aborted",
        toolName: "read",
        content: [{ type: "text", text: "[openclaw] missing tool result..." }],
        isError: true,
      } as unknown as AgentMessage,
      { role: "user", content: "retry" },
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(3);
    expect(out[0]?.role).toBe("user");
    // Aborted assistant is replaced with text-only context message
    expect(out[1]?.role).toBe("assistant");
    const replaced = out[1] as Extract<AgentMessage, { role: "assistant" }>;
    expect(replaced.content).toHaveLength(1);
    const block = replaced.content[0] as { type: string; text: string };
    expect(block.type).toBe("text");
    expect(block.text).toContain("interrupted");
    expect(block.text).toContain("`read`");
    // tool_result is dropped
    expect(out[2]?.role).toBe("user");
  });

  it("replaces error assistant with context text and drops its tool_result", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "toolu_err", name: "exec", arguments: "{}" }],
        stopReason: "error",
      } as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "toolu_err",
        toolName: "exec",
        content: [{ type: "text", text: "error result" }],
        isError: true,
      } as unknown as AgentMessage,
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe("user");
    expect(out[1]?.role).toBe("assistant");
    const replaced = out[1] as Extract<AgentMessage, { role: "assistant" }>;
    const block = replaced.content[0] as { type: string; text: string };
    expect(block.type).toBe("text");
    expect(block.text).toContain("streaming error");
    expect(block.text).toContain("`exec`");
  });

  it("preserves non-aborted assistant messages unchanged", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "text", text: "hi there" }],
      },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_ok", name: "read", arguments: '{"path":"f"}' }],
      },
      {
        role: "toolResult",
        toolCallId: "toolu_ok",
        toolName: "read",
        content: [{ type: "text", text: "file contents" }],
        isError: false,
      } as unknown as AgentMessage,
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(4);
    expect(out).toBe(input); // same reference — no changes needed
  });

  it("returns same reference when no aborted messages exist", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toBe(input);
  });

  it("only drops tool_results matching aborted tool_call IDs", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_ok", name: "read", arguments: '{"path":"f"}' }],
      },
      {
        role: "toolResult",
        toolCallId: "toolu_ok",
        toolName: "read",
        content: [{ type: "text", text: "ok result" }],
        isError: false,
      } as unknown as AgentMessage,
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_aborted", name: "exec", arguments: "{}" }],
        stopReason: "aborted",
      } as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "toolu_aborted",
        toolName: "exec",
        content: [{ type: "text", text: "synthetic" }],
        isError: true,
      } as unknown as AgentMessage,
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(4);
    expect(out[0]?.role).toBe("user");
    expect(out[1]?.role).toBe("assistant");
    expect(out[2]?.role).toBe("toolResult");
    expect((out[2] as { toolCallId?: string }).toolCallId).toBe("toolu_ok");
    // Aborted assistant replaced with context text
    expect(out[3]?.role).toBe("assistant");
    const replaced = out[3] as Extract<AgentMessage, { role: "assistant" }>;
    const block = replaced.content[0] as { type: string; text: string };
    expect(block.type).toBe("text");
    expect(block.text).toContain("`exec`");
  });

  it("handles aborted assistant with multiple tool calls", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "do stuff" },
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "toolu_1", name: "read", arguments: "{}" },
          { type: "toolCall", id: "toolu_2", name: "write", arguments: "{}" },
        ],
        stopReason: "aborted",
      } as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "read",
        content: [{ type: "text", text: "synthetic" }],
        isError: true,
      } as unknown as AgentMessage,
      {
        role: "toolResult",
        toolCallId: "toolu_2",
        toolName: "write",
        content: [{ type: "text", text: "synthetic" }],
        isError: true,
      } as unknown as AgentMessage,
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe("user");
    expect(out[1]?.role).toBe("assistant");
    const replaced = out[1] as Extract<AgentMessage, { role: "assistant" }>;
    const block = replaced.content[0] as { type: string; text: string };
    expect(block.text).toContain("`read`");
    expect(block.text).toContain("`write`");
    expect(block.text).toContain("calls");
  });

  it("handles aborted assistant with no tool calls (text-only abort)", () => {
    const input: AgentMessage[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "text", text: "I was about to sa" }],
        stopReason: "aborted",
      } as AgentMessage,
    ];

    const out = stripAbortedAssistantMessages(input);
    expect(out).toHaveLength(2);
    expect(out[1]?.role).toBe("assistant");
    const replaced = out[1] as Extract<AgentMessage, { role: "assistant" }>;
    const block = replaced.content[0] as { type: string; text: string };
    expect(block.text).toContain("interrupted");
    expect(block.text).toContain("No tool calls were finalized");
  });
});
