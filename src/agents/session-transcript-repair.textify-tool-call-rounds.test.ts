import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { textifyToolCallRounds } from "./session-transcript-repair.js";

describe("textifyToolCallRounds", () => {
  it("converts a simple tool call round to text", () => {
    const input = [
      { role: "user", content: "search for cats" },
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "web_search", arguments: { query: "cats" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "web_search",
        content: [{ type: "text", text: "Found 10 results about cats" }],
        isError: false,
      },
      { role: "assistant", content: [{ type: "text", text: "Here are the results." }] },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);

    // user message unchanged
    expect(out[0]).toBe(input[0]);

    // assistant with tool call → textified
    const assistantMsg = out[1] as { role: string; content: unknown[] };
    expect(assistantMsg.role).toBe("assistant");
    const textBlock = assistantMsg.content.find(
      (b: unknown) => (b as { type?: string }).type === "text",
    ) as { text: string };
    expect(textBlock.text).toContain("[Called tool web_search(");
    expect(textBlock.text).toContain('"query":"cats"');

    // toolResult → converted to user message with result text
    const resultMsg = out[2] as { role: string; content: string };
    expect(resultMsg.role).toBe("user");
    expect(resultMsg.content).toContain("[Tool web_search result:");
    expect(resultMsg.content).toContain("Found 10 results about cats");

    // trailing assistant message unchanged
    expect(out[3]).toBe(input[3]);
  });

  it("handles multiple tool calls in a single assistant message", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "web_search", arguments: { query: "dogs" } },
          {
            type: "toolCall",
            id: "call_2",
            name: "web_fetch",
            arguments: { url: "http://example.com" },
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "web_search",
        content: [{ type: "text", text: "dog results" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "web_fetch",
        content: [{ type: "text", text: "page content" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);

    // assistant message has text summary of both calls
    const assistantMsg = out[0] as { role: string; content: unknown[] };
    expect(assistantMsg.role).toBe("assistant");
    const textBlock = assistantMsg.content.find(
      (b: unknown) => (b as { type?: string }).type === "text",
    ) as { text: string };
    expect(textBlock.text).toContain("web_search");
    expect(textBlock.text).toContain("web_fetch");

    // two user messages with results
    expect((out[1] as { role: string }).role).toBe("user");
    expect((out[1] as { content: string }).content).toContain("dog results");
    expect((out[2] as { role: string }).role).toBe("user");
    expect((out[2] as { content: string }).content).toContain("page content");
  });

  it("preserves non-tool-call content blocks in assistant message", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me search for that." },
          { type: "toolCall", id: "call_1", name: "web_search", arguments: { query: "test" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "web_search",
        content: [{ type: "text", text: "search results" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);

    const assistantMsg = out[0] as { role: string; content: unknown[] };
    expect(assistantMsg.content).toHaveLength(2); // original text block + summary text block
    const textBlocks = assistantMsg.content.filter(
      (b: unknown) => (b as { type?: string }).type === "text",
    ) as Array<{ text: string }>;
    expect(textBlocks[0].text).toBe("Let me search for that.");
    expect(textBlocks[1].text).toContain("[Called tool web_search(");
  });

  it("returns original array when no tool calls present", () => {
    const input = [
      { role: "user", content: "hello" },
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);
    expect(out).toBe(input); // same reference = no changes
  });

  it("handles toolResult with string content", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "read", arguments: { path: "file.txt" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: "raw string content",
        isError: false,
      },
    ] as AgentMessage[];

    const out = textifyToolCallRounds(input);
    const resultMsg = out[1] as { role: string; content: string };
    expect(resultMsg.role).toBe("user");
    expect(resultMsg.content).toContain("raw string content");
  });

  it("handles missing toolResult gracefully", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_orphan", name: "exec", arguments: { cmd: "ls" } }],
      },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);
    // Only the textified assistant message, no result user message
    expect(out).toHaveLength(1);
    const assistantMsg = out[0] as { role: string; content: unknown[] };
    expect(assistantMsg.role).toBe("assistant");
    const textBlock = assistantMsg.content.find(
      (b: unknown) => (b as { type?: string }).type === "text",
    ) as { text: string };
    expect(textBlock.text).toContain("[Called tool exec(");
  });

  it("truncates very long tool results", () => {
    const longText = "x".repeat(2000);
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "big.txt" } }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: longText }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);
    const resultMsg = out[1] as { role: string; content: string };
    expect(resultMsg.content.length).toBeLessThan(longText.length);
    expect(resultMsg.content).toContain("… (truncated)");
  });

  it("handles toolUse and functionCall block types", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "tu_1", name: "bash", input: { command: "echo hi" } }],
      },
      {
        role: "toolResult",
        toolCallId: "tu_1",
        toolName: "bash",
        content: [{ type: "text", text: "hi" }],
        isError: false,
      },
    ] as AgentMessage[];

    const out = textifyToolCallRounds(input);
    const assistantMsg = out[0] as { role: string; content: unknown[] };
    const textBlock = assistantMsg.content.find(
      (b: unknown) => (b as { type?: string }).type === "text",
    ) as { text: string };
    expect(textBlock.text).toContain("[Called tool bash(");
    expect(textBlock.text).toContain('"command":"echo hi"');
  });

  it("does not consume toolResult messages from a different tool call round", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "search", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "search",
        content: [{ type: "text", text: "result1" }],
        isError: false,
      },
      { role: "user", content: "ok do something else" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_2", name: "exec", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "exec",
        content: [{ type: "text", text: "result2" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = textifyToolCallRounds(input);

    // Both rounds textified, user message preserved in between
    expect(out[0].role).toBe("assistant");
    expect(out[1].role).toBe("user"); // converted result1
    expect((out[1] as { content: string }).content).toContain("result1");
    expect(out[2].role).toBe("user"); // original user message
    expect(out[3].role).toBe("assistant");
    expect(out[4].role).toBe("user"); // converted result2
    expect((out[4] as { content: string }).content).toContain("result2");
  });
});
