import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedPiAgentMock = vi.fn();
const runWithModelFallbackMock = vi.fn();
const recordSpendFromResultMock = vi.fn();

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: (params: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => runWithModelFallbackMock(params),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
}));

vi.mock("../../infra/spend-ledger.js", () => ({
  recordSpendFromResult: (...args: unknown[]) => recordSpendFromResultMock(...args),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

function createFollowupRun(sessionKey: string): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session-123",
      sessionKey,
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude-opus-4-5",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

describe("runReplyAgent spend ledger integration", () => {
  beforeEach(() => {
    runEmbeddedPiAgentMock.mockReset();
    runWithModelFallbackMock.mockReset();
    recordSpendFromResultMock.mockReset();
  });

  it("calls recordSpendFromResult with usage from agent run", async () => {
    const usage = { input: 100, output: 50, cacheRead: 200, cacheWrite: 10 };
    runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "ok" }],
      meta: {
        agentMeta: {
          provider: "anthropic",
          model: "claude-opus-4-5",
          usage,
        },
      },
    });
    runWithModelFallbackMock.mockImplementationOnce(
      async ({ run }: { run: (p: string, m: string) => Promise<unknown> }) => ({
        result: await run("anthropic", "claude-opus-4-5"),
        provider: "anthropic",
        model: "claude-opus-4-5",
      }),
    );

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "whatsapp",
      OriginatingTo: "+15550001111",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;

    await runReplyAgent({
      commandBody: "hello",
      followupRun: createFollowupRun(sessionKey),
      queueKey: "main",
      resolvedQueue: { mode: "interrupt" } as unknown as QueueSettings,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry: { sessionId: "session-123", updatedAt: Date.now() } as SessionEntry,
      sessionKey,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(recordSpendFromResultMock).toHaveBeenCalledOnce();
    const call = recordSpendFromResultMock.mock.calls[0]?.[0];
    expect(call.usage).toEqual(usage);
    expect(call.provider).toBe("anthropic");
    expect(call.model).toBe("claude-opus-4-5");
    expect(call.sessionKey).toBe(sessionKey);
    expect(call.sessionId).toBe("session-123");
    expect(call.agentId).toBe("main");
    expect(call.channel).toBe("whatsapp");
    expect(typeof call.startedAt).toBe("number");
  });

  it("calls recordSpendFromResult even with zero-cost usage", async () => {
    runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "ok" }],
      meta: {
        agentMeta: {
          provider: "anthropic",
          model: "claude-opus-4-5",
          usage: { input: 5, output: 3 },
        },
      },
    });
    runWithModelFallbackMock.mockImplementationOnce(
      async ({ run }: { run: (p: string, m: string) => Promise<unknown> }) => ({
        result: await run("anthropic", "claude-opus-4-5"),
        provider: "anthropic",
        model: "claude-opus-4-5",
      }),
    );

    const sessionKey = "agent:main:telegram:dm:123";
    const typing = createMockTypingController();
    const sessionCtx = {
      Provider: "telegram",
      OriginatingTo: "123",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;

    await runReplyAgent({
      commandBody: "hi",
      followupRun: createFollowupRun(sessionKey),
      queueKey: "main",
      resolvedQueue: { mode: "interrupt" } as unknown as QueueSettings,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry: { sessionId: "session-123", updatedAt: Date.now() } as SessionEntry,
      sessionKey,
      defaultModel: "anthropic/claude-opus-4-5",
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(recordSpendFromResultMock).toHaveBeenCalledOnce();
  });
});
