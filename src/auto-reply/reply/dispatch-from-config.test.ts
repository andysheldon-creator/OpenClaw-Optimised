import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { ReplyDispatcher } from "./reply-dispatcher.js";
import { buildTestCtx } from "./test-ctx.js";

const mocks = vi.hoisted(() => ({
  routeReply: vi.fn(async () => ({ ok: true, messageId: "mock" })),
  tryFastAbortFromMessage: vi.fn(async () => ({
    handled: false,
    aborted: false,
  })),
}));
const diagnosticMocks = vi.hoisted(() => ({
  logMessageQueued: vi.fn(),
  logMessageProcessed: vi.fn(),
  logSessionStateChange: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({
  runner: {
    hasHooks: vi.fn(() => false),
    runMessageReceived: vi.fn(async () => {}),
    runMessageSending: vi.fn(async () => undefined),
    runMessageSent: vi.fn(async () => {}),
  },
}));

vi.mock("./route-reply.js", () => ({
  isRoutableChannel: (channel: string | undefined) =>
    Boolean(
      channel &&
      ["telegram", "slack", "discord", "signal", "imessage", "whatsapp"].includes(channel),
    ),
  routeReply: mocks.routeReply,
}));

vi.mock("./abort.js", () => ({
  tryFastAbortFromMessage: mocks.tryFastAbortFromMessage,
  formatAbortReplyText: (stoppedSubagents?: number) => {
    if (typeof stoppedSubagents !== "number" || stoppedSubagents <= 0) {
      return "⚙️ Agent was aborted.";
    }
    const label = stoppedSubagents === 1 ? "sub-agent" : "sub-agents";
    return `⚙️ Agent was aborted. Stopped ${stoppedSubagents} ${label}.`;
  },
}));

vi.mock("../../logging/diagnostic.js", () => ({
  logMessageQueued: diagnosticMocks.logMessageQueued,
  logMessageProcessed: diagnosticMocks.logMessageProcessed,
  logSessionStateChange: diagnosticMocks.logSessionStateChange,
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookMocks.runner,
}));

const { dispatchReplyFromConfig } = await import("./dispatch-from-config.js");
const { resetInboundDedupe } = await import("./inbound-dedupe.js");

function createDispatcher(): ReplyDispatcher {
  return {
    sendToolResult: vi.fn(() => true),
    sendBlockReply: vi.fn(() => true),
    sendFinalReply: vi.fn(() => true),
    waitForIdle: vi.fn(async () => {}),
    getQueuedCounts: vi.fn(() => ({ tool: 0, block: 0, final: 0 })),
  };
}

describe("dispatchReplyFromConfig", () => {
  beforeEach(() => {
    resetInboundDedupe();
    diagnosticMocks.logMessageQueued.mockReset();
    diagnosticMocks.logMessageProcessed.mockReset();
    diagnosticMocks.logSessionStateChange.mockReset();
    hookMocks.runner.hasHooks.mockReset();
    hookMocks.runner.hasHooks.mockReturnValue(false);
    hookMocks.runner.runMessageReceived.mockReset();
    hookMocks.runner.runMessageSending.mockReset();
    hookMocks.runner.runMessageSending.mockResolvedValue(undefined);
    hookMocks.runner.runMessageSent.mockReset();
  });
  it("does not route when Provider matches OriginatingChannel (even if Surface is missing)", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    mocks.routeReply.mockClear();
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: undefined,
      OriginatingChannel: "slack",
      OriginatingTo: "channel:C123",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      _opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(mocks.routeReply).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("routes when OriginatingChannel differs from Provider", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    mocks.routeReply.mockClear();
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      AccountId: "acc-1",
      MessageThreadId: 123,
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      _opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    expect(mocks.routeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        to: "telegram:999",
        accountId: "acc-1",
        threadId: 123,
      }),
    );
  });

  it("provides onToolResult in DM sessions", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    mocks.routeReply.mockClear();
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeDefined();
      expect(typeof opts?.onToolResult).toBe("function");
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("does not provide onToolResult in group sessions", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "group",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeUndefined();
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("sends tool results via dispatcher in DM sessions", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => {
      // Simulate tool result emission
      await opts?.onToolResult?.({ text: "🔧 exec: ls" });
      return { text: "done" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ text: "🔧 exec: ls" }),
    );
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("does not provide onToolResult for native slash commands", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
      CommandSource: "native",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts: GetReplyOptions | undefined,
      _cfg: OpenClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeUndefined();
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("fast-aborts without calling the reply resolver", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: true,
      aborted: true,
    });
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Body: "/stop",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(replyResolver).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith({
      text: "⚙️ Agent was aborted.",
    });
  });

  it("fast-abort reply includes stopped subagent count when provided", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: true,
      aborted: true,
      stoppedSubagents: 2,
    });
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Body: "/stop",
    });

    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher,
      replyResolver: vi.fn(async () => ({ text: "hi" }) as ReplyPayload),
    });

    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith({
      text: "⚙️ Agent was aborted. Stopped 2 sub-agents.",
    });
  });

  it("deduplicates inbound messages by MessageSid and origin", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = {} as OpenClawConfig;
    const ctx = buildTestCtx({
      Provider: "whatsapp",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "whatsapp:+15555550123",
      MessageSid: "msg-1",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });
    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
  });

  it("emits message_received hook with originating channel metadata", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const cfg = {} as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: "slack",
      OriginatingChannel: "Telegram",
      OriginatingTo: "telegram:999",
      CommandBody: "/search hello",
      RawBody: "raw text",
      Body: "body text",
      Timestamp: 1710000000000,
      MessageSidFull: "sid-full",
      SenderId: "user-1",
      SenderName: "Alice",
      SenderUsername: "alice",
      SenderE164: "+15555550123",
      AccountId: "acc-1",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(hookMocks.runner.runMessageReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ctx.From,
        content: "/search hello",
        timestamp: 1710000000000,
        metadata: expect.objectContaining({
          originatingChannel: "Telegram",
          originatingTo: "telegram:999",
          messageId: "sid-full",
          senderId: "user-1",
          senderName: "Alice",
          senderUsername: "alice",
          senderE164: "+15555550123",
        }),
      }),
      expect.objectContaining({
        channelId: "telegram",
        accountId: "acc-1",
        conversationId: "telegram:999",
      }),
    );
  });

  it("emits diagnostics when enabled", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = { diagnostics: { enabled: true } } as OpenClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: "slack",
      SessionKey: "agent:main:main",
      MessageSid: "msg-1",
      To: "slack:C123",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(diagnosticMocks.logMessageQueued).toHaveBeenCalledTimes(1);
    expect(diagnosticMocks.logSessionStateChange).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      state: "processing",
      reason: "message_start",
    });
    expect(diagnosticMocks.logMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "slack",
        outcome: "completed",
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("marks diagnostics skipped for duplicate inbound messages", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: false,
      aborted: false,
    });
    const cfg = { diagnostics: { enabled: true } } as OpenClawConfig;
    const ctx = buildTestCtx({
      Provider: "whatsapp",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "whatsapp:+15555550123",
      MessageSid: "msg-dup",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });
    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(diagnosticMocks.logMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        outcome: "skipped",
        reason: "duplicate",
      }),
    );
  });

  describe("message_sending hook", () => {
    it("calls runMessageSending before final reply and allows content modification", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sending");
      hookMocks.runner.runMessageSending.mockResolvedValue({
        content: "modified reply",
      });
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () => ({ text: "original reply" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSending).toHaveBeenCalledTimes(1);
      expect(hookMocks.runner.runMessageSending).toHaveBeenCalledWith(
        expect.objectContaining({ content: "original reply" }),
        expect.objectContaining({ channelId: expect.any(String) }),
      );
      expect(dispatcher.sendFinalReply).toHaveBeenCalledWith(
        expect.objectContaining({ text: "modified reply" }),
      );
    });

    it("cancels reply when message_sending hook returns cancel: true", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sending");
      hookMocks.runner.runMessageSending.mockResolvedValue({ cancel: true });
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () => ({ text: "should not send" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSending).toHaveBeenCalledTimes(1);
      expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    });

    it("does not call message_sending when no hooks are registered", async () => {
      hookMocks.runner.hasHooks.mockReturnValue(false);
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () => ({ text: "hello" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSending).not.toHaveBeenCalled();
      expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
    });

    it("calls message_sending for each reply when resolver returns multiple", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sending");
      hookMocks.runner.runMessageSending.mockResolvedValue(undefined);
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () =>
        [{ text: "first" }, { text: "second" }] satisfies ReplyPayload[];

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSending).toHaveBeenCalledTimes(2);
      expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(2);
    });

    it("works with cross-provider routing when message_sending modifies content", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sending");
      hookMocks.runner.runMessageSending.mockResolvedValue({ content: "cross-modified" });
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });
      mocks.routeReply.mockResolvedValue({ ok: true, messageId: "routed-1" });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({
        Provider: "slack",
        OriginatingChannel: "telegram",
        OriginatingTo: "telegram:999",
      });
      const replyResolver = async () => ({ text: "original" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(mocks.routeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ text: "cross-modified" }),
        }),
      );
      expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    });

    it("does not hook fast-abort replies", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sending");
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: true,
        aborted: true,
        stoppedSubagents: 1,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () => ({ text: "should not reach" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSending).not.toHaveBeenCalled();
      expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
    });
  });

  describe("message_sent hook", () => {
    it("calls runMessageSent after successful delivery", async () => {
      hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sent");
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "discord", From: "user1" });
      const replyResolver = async () => ({ text: "hello" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSent).toHaveBeenCalledTimes(1);
      expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "hello",
          success: true,
        }),
        expect.objectContaining({ channelId: expect.any(String) }),
      );
    });

    it("does not call message_sent when no hooks are registered", async () => {
      hookMocks.runner.hasHooks.mockReturnValue(false);
      mocks.tryFastAbortFromMessage.mockResolvedValue({
        handled: false,
        aborted: false,
      });

      const cfg = {} as OpenClawConfig;
      const dispatcher = createDispatcher();
      const ctx = buildTestCtx({ Provider: "telegram", From: "user1" });
      const replyResolver = async () => ({ text: "hello" }) satisfies ReplyPayload;

      await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

      expect(hookMocks.runner.runMessageSent).not.toHaveBeenCalled();
    });
  });
});
