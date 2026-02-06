import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

type StubSession = {
  subscribe: (fn: (evt: unknown) => void) => () => void;
};

describe("subscribeEmbeddedPiSession", () => {
  const _THINKING_TAG_CASES = [
    { tag: "think", open: "<think>", close: "</think>" },
    { tag: "thinking", open: "<thinking>", close: "</thinking>" },
    { tag: "thought", open: "<thought>", close: "</thought>" },
    { tag: "antthinking", open: "<antthinking>", close: "</antthinking>" },
  ] as const;

  it("filters to <final> and suppresses output without a start tag", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onPartialReply = vi.fn();
    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      enforceFinalTag: true,
      onPartialReply,
      onAgentEvent,
    });

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "<final>Hi there</final>",
      },
    });

    expect(onPartialReply).toHaveBeenCalled();
    const firstPayload = onPartialReply.mock.calls[0][0];
    expect(firstPayload.text).toBe("Hi there");

    onPartialReply.mockReset();

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "</final>Oops no start",
      },
    });

    expect(onPartialReply).not.toHaveBeenCalled();
  });
  it("emits agent events on message_end even without <final> tags", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onAgentEvent = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      enforceFinalTag: true,
      onAgentEvent,
    });

    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
    } as AssistantMessage;

    handler?.({ type: "message_start", message: assistantMessage });
    handler?.({ type: "message_end", message: assistantMessage });

    const payloads = onAgentEvent.mock.calls
      .map((call) => call[0]?.data as Record<string, unknown> | undefined)
      .filter((value): value is Record<string, unknown> => Boolean(value));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe("Hello world");
    expect(payloads[0]?.delta).toBe("Hello world");
  });
  it("does not require <final> when enforcement is off", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onPartialReply = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      onPartialReply,
    });

    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Hello world",
      },
    });

    const payload = onPartialReply.mock.calls[0][0];
    expect(payload.text).toBe("Hello world");
  });
  it("emits block replies on message_end", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onBlockReply = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello block" }],
    } as AssistantMessage;

    handler?.({ type: "message_end", message: assistantMessage });

    expect(onBlockReply).toHaveBeenCalled();
    const payload = onBlockReply.mock.calls[0][0];
    expect(payload.text).toBe("Hello block");
  });

  it("strips <think> and <final> tags from Gemini-style streaming output (issue #6328)", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onPartialReply = vi.fn();
    const onAgentEvent = vi.fn();
    const onBlockReply = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      enforceFinalTag: true,
      onPartialReply,
      onAgentEvent,
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    // Simulate Gemini-style output with <think> and <final> tags
    const geminiOutput =
      "<think>Let me analyze this request...</think><final>The answer is 42</final>";

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: geminiOutput,
      },
    });

    // Verify onPartialReply receives stripped content (no tags visible)
    expect(onPartialReply).toHaveBeenCalled();
    const streamingPayload = onPartialReply.mock.calls[0][0];
    expect(streamingPayload.text).not.toContain("<think>");
    expect(streamingPayload.text).not.toContain("</think>");
    expect(streamingPayload.text).not.toContain("<final>");
    expect(streamingPayload.text).not.toContain("</final>");
    expect(streamingPayload.text).not.toContain("Let me analyze");
    expect(streamingPayload.text).toBe("The answer is 42");

    // Now simulate message_end with full content in message.content
    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: geminiOutput }],
    } as AssistantMessage;

    handler?.({ type: "message_end", message: assistantMessage });

    // Note: When streaming has already processed content, message_end may not re-emit
    // via onBlockReply if the text is the same (duplicate prevention).
    // The key assertion is that onAgentEvent receives stripped content.
    const agentPayloads = onAgentEvent.mock.calls
      .map((call) => call[0]?.data as Record<string, unknown> | undefined)
      .filter((value): value is Record<string, unknown> => Boolean(value?.text));

    // At least one agent event should have been emitted with stripped content
    expect(agentPayloads.length).toBeGreaterThan(0);
    const lastPayload = agentPayloads[agentPayloads.length - 1];
    expect(lastPayload?.text).not.toContain("<think>");
    expect(lastPayload?.text).not.toContain("</think>");
    expect(lastPayload?.text).not.toContain("<final>");
    expect(lastPayload?.text).not.toContain("</final>");
    expect(lastPayload?.text).not.toContain("Let me analyze");
    expect(lastPayload?.text).toBe("The answer is 42");
  });

  it("strips <think> content when text does not start with < (issue #6328 variant)", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onPartialReply = vi.fn();
    const onBlockReply = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run",
      enforceFinalTag: true,
      onPartialReply,
      onBlockReply,
      blockReplyBreak: "message_end",
    });

    // Variant where text has content before the tags (splitThinkingTaggedText would return null)
    const output = "Hey! <think>Internal reasoning here</think><final>The answer is 42</final>";

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: {
        type: "text_delta",
        delta: output,
      },
    });

    // With enforceFinalTag=true, only content inside <final> should be emitted
    expect(onPartialReply).toHaveBeenCalled();
    const payload = onPartialReply.mock.calls[0][0];
    expect(payload.text).not.toContain("<think>");
    expect(payload.text).not.toContain("Internal reasoning");
    expect(payload.text).not.toContain("<final>");
    expect(payload.text).toBe("The answer is 42");
  });
});
