import { describe, expect, it, vi } from "vitest";
import type { SlackMonitorContext } from "../context.js";
import { prepareSlackMessage } from "./prepare.js";

describe("prepareSlackMessage default agent routing", () => {
  it("routes channel messages to default agent instead of hardcoded 'main'", async () => {
    const ctx: SlackMonitorContext = {
      cfg: {
        agents: {
          defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/openclaw" },
          list: [{ id: "jeeves", default: true, name: "Jeeves" }, { id: "main" }],
        },
        channels: { slack: {} },
      },
      accountId: "default",
      botToken: "xoxb",
      app: { client: {} },
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      },
      botUserId: "BOT",
      teamId: "T1",
      apiAppId: "A1",
      historyLimit: 0,
      channelHistories: new Map(),
      sessionScope: "per-sender",
      mainKey: "agent:jeeves:main",
      dmEnabled: true,
      dmPolicy: "open",
      allowFrom: [],
      groupDmEnabled: false,
      groupDmChannels: [],
      defaultRequireMention: true,
      groupPolicy: "open",
      useAccessGroups: false,
      reactionMode: "off",
      reactionAllowlist: [],
      replyToMode: "off",
      threadHistoryScope: "channel",
      threadInheritParent: false,
      slashCommand: { command: "/openclaw", enabled: true },
      textLimit: 2000,
      ackReactionScope: "off",
      mediaMaxBytes: 1000,
      removeAckAfterReply: false,
      logger: { info: vi.fn() },
      markMessageSeen: () => false,
      shouldDropMismatchedSlackEvent: () => false,
      resolveSlackSystemEventSessionKey: () => "agent:jeeves:slack:channel:c1",
      isChannelAllowed: () => true,
      resolveChannelName: async () => ({
        name: "general",
        type: "channel",
      }),
      resolveUserName: async () => ({ name: "Alice" }),
      setSlackThreadStatus: async () => undefined,
    } satisfies SlackMonitorContext;

    const result = await prepareSlackMessage({
      ctx,
      account: { accountId: "default", config: {} } as never,
      message: {
        type: "message" as const,
        text: "hello",
        user: "U1",
        ts: "1234567890.123456",
        event_ts: "1234567890.123456",
        channel: "C1",
        channel_type: "channel" as const,
      } as never,
      opts: { source: "message", wasMentioned: false },
    });

    // Should successfully route to "jeeves" (the default agent), not reject because it's not "main"
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("jeeves");
  });

  it("skips messages routed to non-default agents", async () => {
    const ctx: SlackMonitorContext = {
      cfg: {
        agents: {
          defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/openclaw" },
          list: [{ id: "jeeves", default: true, name: "Jeeves" }, { id: "devops" }],
        },
        channels: { slack: {} },
        bindings: [
          {
            agentId: "devops",
            match: { channel: "slack", peer: { kind: "channel", id: "C1" } },
          },
        ],
      },
      accountId: "default",
      botToken: "xoxb",
      app: { client: {} },
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      },
      botUserId: "BOT",
      teamId: "T1",
      apiAppId: "A1",
      historyLimit: 0,
      channelHistories: new Map(),
      sessionScope: "per-sender",
      mainKey: "agent:jeeves:main",
      dmEnabled: true,
      dmPolicy: "open",
      allowFrom: [],
      groupDmEnabled: false,
      groupDmChannels: [],
      defaultRequireMention: true,
      groupPolicy: "open",
      useAccessGroups: false,
      reactionMode: "off",
      reactionAllowlist: [],
      replyToMode: "off",
      threadHistoryScope: "channel",
      threadInheritParent: false,
      slashCommand: { command: "/openclaw", enabled: true },
      textLimit: 2000,
      ackReactionScope: "off",
      mediaMaxBytes: 1000,
      removeAckAfterReply: false,
      logger: { info: vi.fn() },
      markMessageSeen: () => false,
      shouldDropMismatchedSlackEvent: () => false,
      resolveSlackSystemEventSessionKey: () => "agent:jeeves:slack:channel:c1",
      isChannelAllowed: () => true,
      resolveChannelName: async () => ({
        name: "general",
        type: "channel",
      }),
      resolveUserName: async () => ({ name: "Alice" }),
      setSlackThreadStatus: async () => undefined,
    } satisfies SlackMonitorContext;

    const result = await prepareSlackMessage({
      ctx,
      account: { accountId: "default", config: {} } as never,
      message: {
        type: "message" as const,
        text: "hello",
        user: "U1",
        ts: "1234567890.123456",
        event_ts: "1234567890.123456",
        channel: "C1",
        channel_type: "channel" as const,
      } as never,
      opts: { source: "message", wasMentioned: false },
    });

    // Should skip because routed to "devops", not the default agent "jeeves"
    expect(result).toBeNull();
    expect(ctx.runtime.log).toHaveBeenCalledWith(
      expect.stringContaining('routed to agent:devops, only default agent "jeeves" handles Slack'),
    );
  });

  it("still works with 'main' as default agent (backward compatibility)", async () => {
    const ctx: SlackMonitorContext = {
      cfg: {
        agents: {
          defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/openclaw" },
          list: [{ id: "main", default: true }],
        },
        channels: { slack: {} },
      },
      accountId: "default",
      botToken: "xoxb",
      app: { client: {} },
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
      },
      botUserId: "BOT",
      teamId: "T1",
      apiAppId: "A1",
      historyLimit: 0,
      channelHistories: new Map(),
      sessionScope: "per-sender",
      mainKey: "agent:main:main",
      dmEnabled: true,
      dmPolicy: "open",
      allowFrom: [],
      groupDmEnabled: false,
      groupDmChannels: [],
      defaultRequireMention: true,
      groupPolicy: "open",
      useAccessGroups: false,
      reactionMode: "off",
      reactionAllowlist: [],
      replyToMode: "off",
      threadHistoryScope: "channel",
      threadInheritParent: false,
      slashCommand: { command: "/openclaw", enabled: true },
      textLimit: 2000,
      ackReactionScope: "off",
      mediaMaxBytes: 1000,
      removeAckAfterReply: false,
      logger: { info: vi.fn() },
      markMessageSeen: () => false,
      shouldDropMismatchedSlackEvent: () => false,
      resolveSlackSystemEventSessionKey: () => "agent:main:slack:channel:c1",
      isChannelAllowed: () => true,
      resolveChannelName: async () => ({
        name: "general",
        type: "channel",
      }),
      resolveUserName: async () => ({ name: "Alice" }),
      setSlackThreadStatus: async () => undefined,
    } satisfies SlackMonitorContext;

    const result = await prepareSlackMessage({
      ctx,
      account: { accountId: "default", config: {} } as never,
      message: {
        type: "message" as const,
        text: "hello",
        user: "U1",
        ts: "1234567890.123456",
        event_ts: "1234567890.123456",
        channel: "C1",
        channel_type: "channel" as const,
      } as never,
      opts: { source: "message", wasMentioned: false },
    });

    // Should work normally with "main" as default agent
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("main");
  });
});
