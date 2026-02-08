import { describe, expect, it, vi } from "vitest";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const { enqueueFollowupRunMock, clearFollowupQueueMock } = vi.hoisted(() => ({
  enqueueFollowupRunMock: vi.fn(),
  clearFollowupQueueMock: vi.fn(),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: enqueueFollowupRunMock,
    clearFollowupQueue: clearFollowupQueueMock,
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

function createFollowupRun(): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "feishu",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "openai-codex",
      model: "gpt-5.3-codex",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 5_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

function createSessionCtx(chatType: "group" | "direct"): TemplateContext {
  return {
    Provider: "feishu",
    Surface: "feishu",
    OriginatingTo: "chat-id",
    AccountId: "default",
    ChatType: chatType,
  } as unknown as TemplateContext;
}

describe("runReplyAgent group busy ack", () => {
  it("clears stale followup queue on new session and returns english group ack", async () => {
    enqueueFollowupRunMock.mockReset();
    clearFollowupQueueMock.mockReset();
    enqueueFollowupRunMock.mockReturnValue(true);
    clearFollowupQueueMock.mockReturnValue(2);

    const typing = createMockTypingController();
    const result = await runReplyAgent({
      commandBody: "hello",
      followupRun: createFollowupRun(),
      queueKey: "agent:main:main",
      resolvedQueue: { mode: "collect" } as QueueSettings,
      shouldSteer: false,
      shouldFollowup: true,
      isActive: true,
      isStreaming: false,
      typing,
      sessionCtx: createSessionCtx("group"),
      sessionEntry: {
        sessionId: "session",
        updatedAt: Date.now(),
      },
      sessionStore: {
        "agent:main:main": {
          sessionId: "session",
          updatedAt: Date.now(),
        },
      },
      sessionKey: "agent:main:main",
      storePath: undefined,
      defaultModel: "openai-codex/gpt-5.3-codex",
      resolvedVerboseLevel: "off",
      isNewSession: true,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(clearFollowupQueueMock).toHaveBeenCalledWith("agent:main:main");
    expect(enqueueFollowupRunMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      text: "⏳ Got it — another task is in progress. I queued this message and will follow up shortly.",
    });
  });

  it("does not emit group ack for direct chats", async () => {
    enqueueFollowupRunMock.mockReset();
    clearFollowupQueueMock.mockReset();
    enqueueFollowupRunMock.mockReturnValue(true);
    clearFollowupQueueMock.mockReturnValue(0);

    const typing = createMockTypingController();
    const result = await runReplyAgent({
      commandBody: "hello",
      followupRun: createFollowupRun(),
      queueKey: "agent:main:main",
      resolvedQueue: { mode: "collect" } as QueueSettings,
      shouldSteer: false,
      shouldFollowup: true,
      isActive: true,
      isStreaming: false,
      typing,
      sessionCtx: createSessionCtx("direct"),
      sessionEntry: {
        sessionId: "session",
        updatedAt: Date.now(),
      },
      sessionStore: {
        "agent:main:main": {
          sessionId: "session",
          updatedAt: Date.now(),
        },
      },
      sessionKey: "agent:main:main",
      storePath: undefined,
      defaultModel: "openai-codex/gpt-5.3-codex",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(result).toBeUndefined();
  });
});
