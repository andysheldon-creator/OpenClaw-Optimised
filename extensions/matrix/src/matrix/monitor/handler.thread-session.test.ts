import { describe, expect, it } from "vitest";

/**
 * Tests for Matrix thread session key construction.
 *
 * The session key determines which conversation history is loaded/stored.
 * Thread messages should get isolated session keys with `:thread:` suffix.
 */

describe("Matrix thread session key construction", () => {
  // Helper to simulate the session key construction logic from handler.ts
  function buildSessionKey(params: {
    baseSessionKey: string;
    threadRootId?: string;
    isDirectMessage: boolean;
  }): string {
    const { baseSessionKey, threadRootId, isDirectMessage } = params;
    return threadRootId && !isDirectMessage
      ? `${baseSessionKey}:thread:${threadRootId}`
      : baseSessionKey;
  }

  it("appends :thread: suffix for room thread messages", () => {
    const sessionKey = buildSessionKey({
      baseSessionKey: "agent:main:matrix:channel:!abc123:matrix.org",
      threadRootId: "$xyz789",
      isDirectMessage: false,
    });

    expect(sessionKey).toBe("agent:main:matrix:channel:!abc123:matrix.org:thread:$xyz789");
  });

  it("does not append :thread: suffix for non-thread room messages", () => {
    const sessionKey = buildSessionKey({
      baseSessionKey: "agent:main:matrix:channel:!abc123:matrix.org",
      threadRootId: undefined,
      isDirectMessage: false,
    });

    expect(sessionKey).toBe("agent:main:matrix:channel:!abc123:matrix.org");
  });

  it("does not append :thread: suffix for DM messages even with thread metadata", () => {
    const sessionKey = buildSessionKey({
      baseSessionKey: "agent:main:matrix:dm:@user:matrix.org",
      threadRootId: "$xyz789",
      isDirectMessage: true,
    });

    expect(sessionKey).toBe("agent:main:matrix:dm:@user:matrix.org");
  });

  it("does not append :thread: suffix for DM messages without thread", () => {
    const sessionKey = buildSessionKey({
      baseSessionKey: "agent:main:matrix:dm:@user:matrix.org",
      threadRootId: undefined,
      isDirectMessage: true,
    });

    expect(sessionKey).toBe("agent:main:matrix:dm:@user:matrix.org");
  });

  it("handles long Matrix event IDs in thread suffix", () => {
    const longEventId = "$QZBpGsS1sQqSLZnG0CCQS_vP9nAh-7O_d0CsZk0QJrQ";
    const sessionKey = buildSessionKey({
      baseSessionKey: "agent:main:matrix:channel:!room:server",
      threadRootId: longEventId,
      isDirectMessage: false,
    });

    expect(sessionKey).toBe(`agent:main:matrix:channel:!room:server:thread:${longEventId}`);
    expect(sessionKey).toContain(":thread:");
    expect(sessionKey.endsWith(longEventId)).toBe(true);
  });
});

describe("Matrix thread message metadata", () => {
  // Helper to simulate the textWithId construction logic from handler.ts
  function buildTextWithId(params: {
    bodyText: string;
    messageId: string;
    roomId: string;
    threadRootId?: string;
    isDirectMessage: boolean;
  }): string {
    const { bodyText, messageId, roomId, threadRootId, isDirectMessage } = params;
    return threadRootId && !isDirectMessage
      ? `${bodyText}\n[matrix event id: ${messageId} room: ${roomId} thread: ${threadRootId}]`
      : `${bodyText}\n[matrix event id: ${messageId} room: ${roomId}]`;
  }

  it("includes thread ID in metadata for room thread messages", () => {
    const text = buildTextWithId({
      bodyText: "Hello",
      messageId: "$msg123",
      roomId: "!room:server",
      threadRootId: "$thread456",
      isDirectMessage: false,
    });

    expect(text).toContain("thread: $thread456");
    expect(text).toBe("Hello\n[matrix event id: $msg123 room: !room:server thread: $thread456]");
  });

  it("excludes thread ID in metadata for non-thread room messages", () => {
    const text = buildTextWithId({
      bodyText: "Hello",
      messageId: "$msg123",
      roomId: "!room:server",
      threadRootId: undefined,
      isDirectMessage: false,
    });

    expect(text).not.toContain("thread:");
    expect(text).toBe("Hello\n[matrix event id: $msg123 room: !room:server]");
  });

  it("excludes thread ID in metadata for DM messages", () => {
    const text = buildTextWithId({
      bodyText: "Hello",
      messageId: "$msg123",
      roomId: "!room:server",
      threadRootId: "$thread456",
      isDirectMessage: true,
    });

    expect(text).not.toContain("thread:");
    expect(text).toBe("Hello\n[matrix event id: $msg123 room: !room:server]");
  });
});

describe("Matrix thread ChatType resolution", () => {
  // Helper to simulate ChatType resolution from handler.ts
  function resolveChatType(params: {
    threadRootId?: string;
    isDirectMessage: boolean;
  }): "thread" | "direct" | "channel" {
    const { threadRootId, isDirectMessage } = params;
    return threadRootId && !isDirectMessage ? "thread" : isDirectMessage ? "direct" : "channel";
  }

  it("returns 'thread' for room thread messages", () => {
    expect(resolveChatType({ threadRootId: "$xyz", isDirectMessage: false })).toBe("thread");
  });

  it("returns 'channel' for non-thread room messages", () => {
    expect(resolveChatType({ threadRootId: undefined, isDirectMessage: false })).toBe("channel");
  });

  it("returns 'direct' for DM messages even with thread metadata", () => {
    expect(resolveChatType({ threadRootId: "$xyz", isDirectMessage: true })).toBe("direct");
  });

  it("returns 'direct' for DM messages without thread", () => {
    expect(resolveChatType({ threadRootId: undefined, isDirectMessage: true })).toBe("direct");
  });
});
