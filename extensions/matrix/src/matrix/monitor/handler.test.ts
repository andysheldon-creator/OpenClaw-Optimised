import { beforeEach, describe, expect, it, vi } from "vitest";
import { setMatrixRuntime } from "../../runtime.js";
import { fetchEventSummary } from "../actions/summary.js";
import { createMatrixRoomMessageHandler, resolveMatrixSessionKey } from "./handler.js";

vi.mock("../actions/summary.js", () => ({
  fetchEventSummary: vi.fn(),
}));

vi.mock("../send.js", () => ({
  reactMatrixMessage: vi.fn().mockResolvedValue(undefined),
  sendMessageMatrix: vi
    .fn()
    .mockResolvedValue({ messageId: "$reply", roomId: "!room:example.org" }),
  sendReadReceiptMatrix: vi.fn().mockResolvedValue(undefined),
  sendTypingMatrix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./replies.js", () => ({
  deliverMatrixReplies: vi.fn().mockResolvedValue(undefined),
}));

describe("resolveMatrixSessionKey", () => {
  it("keeps per-room session key when sessionScope is room", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org",
      parentSessionKey: undefined,
    });
  });

  it("defaults to per-room session key when sessionScope is not set", () => {
    const resolved = resolveMatrixSessionKey({
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org",
      parentSessionKey: undefined,
    });
  });

  it("uses shared agent matrix session when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main",
      parentSessionKey: undefined,
    });
  });

  it("creates thread-scoped session key for room thread messages", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org:thread:$ThreadRoot:Example.Org",
      parentSessionKey: "agent:main:matrix:channel:!room:example.org",
    });
  });

  it("keeps thread isolation when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:channel:!room:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main:thread:$ThreadRoot:Example.Org",
      parentSessionKey: "agent:main-agent:matrix:main",
    });
  });

  it("does not create thread session for direct messages", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:direct:@alice:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: true,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:direct:@alice:example.org",
      parentSessionKey: undefined,
    });
  });

  it("does not create thread session for direct messages with agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:direct:@alice:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: true,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main",
      parentSessionKey: undefined,
    });
  });

  it("preserves case in threadRootId", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "$UPPERCASE:THREAD.ID",
      isDirectMessage: false,
    });

    expect(resolved.sessionKey).toBe(
      "agent:main:matrix:channel:!room:example.org:thread:$UPPERCASE:THREAD.ID",
    );
  });

  it("trims whitespace from threadRootId", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "  \$thread:event.org  ",
      isDirectMessage: false,
    });

    expect(resolved.sessionKey).toBe(
      "agent:main:matrix:channel:!room:example.org:thread:\$thread:event.org",
    );
  });

  it("normalizes agentId to lowercase when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "UPPER_AGENT",
        sessionKey: "agent:upper_agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:upper_agent:matrix:main");
  });

  it("trims whitespace from agentId when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "  my-agent  ",
        sessionKey: "agent:my-agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:my-agent:matrix:main");
  });

  it("uses 'main' as fallback when agentId is empty with agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "   ",
        sessionKey: "agent::matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:main:matrix:main");
  });

  it("combines thread isolation with agent scope normalization", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "MyAgent",
        sessionKey: "agent:myagent:matrix:channel:!room:example.org",
      },
      threadRootId: "$MixedCase:Thread.ID",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:myagent:matrix:main:thread:$MixedCase:Thread.ID",
      parentSessionKey: "agent:myagent:matrix:main",
    });
  });
});

describe("createMatrixRoomMessageHandler", () => {
  const roomId = "!room:example.org";
  const threadRootId = "$ThreadRoot:Example.Org";
  const messageId = "$message:example.org";
  const mockFetchEventSummary = vi.mocked(fetchEventSummary);

  beforeEach(() => {
    vi.clearAllMocks();
    setMatrixRuntime({
      channel: {
        mentions: {
          matchesMentionPatterns: vi.fn(() => false),
        },
      },
    } as any);
  });

  function createHandlerHarness() {
    const recordInboundSession = vi.fn().mockResolvedValue(undefined);
    const dispatchReplyFromConfig = vi.fn().mockResolvedValue({
      queuedFinal: true,
      counts: { final: 1 },
    });

    const core = {
      channel: {
        pairing: {
          readAllowFromStore: vi.fn().mockResolvedValue([]),
        },
        commands: {
          shouldHandleTextCommands: vi.fn(() => false),
        },
        text: {
          hasControlCommand: vi.fn(() => false),
          resolveMarkdownTableMode: vi.fn(() => "code"),
        },
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            agentId: "main",
            accountId: "default",
            sessionKey: "agent:main:matrix:channel:!room:example.org",
            mainSessionKey: "agent:main:matrix:channel:!room:example.org",
          })),
        },
        session: {
          resolveStorePath: vi.fn(() => "/tmp/matrix-session.json"),
          readSessionUpdatedAt: vi.fn(() => undefined),
          recordInboundSession,
        },
        reply: {
          resolveEnvelopeFormatOptions: vi.fn(() => ({ template: "channel+name+time" })),
          formatAgentEnvelope: vi.fn((opts: { body: string }) => opts.body),
          finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
          createReplyDispatcherWithTyping: vi.fn(() => ({
            dispatcher: vi.fn(),
            replyOptions: {},
            markDispatchIdle: vi.fn(),
          })),
          resolveHumanDelayConfig: vi.fn(() => undefined),
          dispatchReplyFromConfig,
        },
        reactions: {
          shouldAckReaction: vi.fn(() => false),
        },
      },
      system: {
        enqueueSystemEvent: vi.fn(),
      },
    } as any;

    const runtime = {
      error: vi.fn(),
    } as any;

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    const handler = createMatrixRoomMessageHandler({
      client: {
        getUserId: vi.fn().mockResolvedValue("@bot:example.org"),
      } as any,
      core,
      cfg: {},
      runtime,
      logger,
      logVerboseMessage: vi.fn(),
      allowFrom: [],
      roomsConfig: {
        [roomId]: {
          autoReply: true,
        },
      },
      mentionRegexes: [],
      groupPolicy: "open",
      replyToMode: "off",
      threadReplies: "inbound",
      dmEnabled: true,
      dmPolicy: "open",
      textLimit: 4000,
      mediaMaxBytes: 1024 * 1024,
      startupMs: 0,
      startupGraceMs: 0,
      directTracker: {
        isDirectMessage: vi.fn().mockResolvedValue(false),
      },
      getRoomInfo: vi.fn().mockResolvedValue({
        name: "Matrix Room",
        canonicalAlias: "#room:example.org",
        altAliases: [],
      }),
      getMemberDisplayName: vi.fn().mockResolvedValue("Alice"),
    });

    const event = {
      type: "m.room.message",
      sender: "@alice:example.org",
      event_id: messageId,
      origin_server_ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello from thread",
        "m.relates_to": {
          rel_type: "m.thread",
          event_id: threadRootId,
        },
      },
      unsigned: {},
    } as any;

    return {
      handler,
      event,
      recordInboundSession,
      dispatchReplyFromConfig,
    };
  }

  it("does not record session when thread root fetch throws, but still dispatches reply", async () => {
    mockFetchEventSummary.mockRejectedValueOnce(new Error("temporary matrix timeout"));

    const { handler, event, recordInboundSession, dispatchReplyFromConfig } =
      createHandlerHarness();

    await handler(roomId, event);

    expect(recordInboundSession).not.toHaveBeenCalled();
    expect(dispatchReplyFromConfig).toHaveBeenCalledTimes(1);
  });

  it("records session when thread root fetch returns null, and still dispatches reply", async () => {
    mockFetchEventSummary.mockResolvedValueOnce(null);

    const { handler, event, recordInboundSession, dispatchReplyFromConfig } =
      createHandlerHarness();

    await handler(roomId, event);

    expect(recordInboundSession).toHaveBeenCalledTimes(1);
    expect(dispatchReplyFromConfig).toHaveBeenCalledTimes(1);
  });
});
