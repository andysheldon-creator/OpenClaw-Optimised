import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FollowupRun } from "./queue.js";
import type { TemplateContext } from "../templating.js";

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: vi.fn(
    async (params: { run: (provider: string, model: string) => unknown }) => {
      const provider = "openai";
      const model = "gpt-test";
      const result = await params.run(provider, model);
      return { result, provider, model, attempts: [] };
    },
  ),
}));

vi.mock("../../agents/pi-tools.js", () => ({
  createClawdbrainCodingTools: vi.fn(() => []),
}));

vi.mock("../../agents/claude-agent-sdk/sdk-session-history.js", () => ({
  loadSessionHistoryForSdk: vi.fn(() => []),
}));

vi.mock("../../agents/sandbox.js", () => ({
  resolveSandboxContext: vi.fn(async () => null),
}));

vi.mock("../../agents/claude-agent-sdk/sdk-agent-runtime.js", () => ({
  createSdkAgentRuntime: vi.fn(() => ({
    kind: "ccsdk",
    displayName: "Claude Agent SDK",
    run: vi.fn(
      async (params: { onAgentEvent?: (evt: { stream: string; data: any }) => unknown }) => {
        await params.onAgentEvent?.({ stream: "tool", data: { phase: "start", name: "exec" } });
        await params.onAgentEvent?.({
          stream: "assistant",
          data: { text: "hello", delta: "hello" },
        });
        return {
          payloads: [{ text: "sdk-ok" }],
          meta: { durationMs: 1 },
        };
      },
    ),
  })),
}));

import { createClawdbrainCodingTools } from "../../agents/pi-tools.js";
import { onAgentEvent } from "../../infra/agent-events.js";
import { runAgentTurnWithFallback } from "./agent-runner-execution.js";

describe("runAgentTurnWithFallback (SDK runtime)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards SDK onAgentEvent events into the shared event bus and passes full tool context", async () => {
    const seenEvents: Array<{ stream: string; data: Record<string, unknown> }> = [];
    const unsubscribe = onAgentEvent((evt) => {
      if (evt.runId === "run-sdk-1") {
        seenEvents.push({ stream: evt.stream, data: evt.data });
      }
    });

    const sessionCtx: TemplateContext = {
      Surface: "web",
      Provider: "slack",
      AccountId: "acct-1",
      To: "C123",
      OriginatingTo: "C123",
      MessageThreadId: "thread-1",
      GroupChannel: "#general",
      GroupSpace: "T1",
    } as unknown as TemplateContext;

    const followupRun: FollowupRun = {
      prompt: "hi",
      enqueuedAt: Date.now(),
      run: {
        agentId: "main",
        agentDir: "/tmp/agent",
        sessionId: "session-1",
        sessionKey: "main",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp/workspace",
        config: { agents: { defaults: { runtime: "ccsdk" } } } as any,
        provider: "openai",
        model: "gpt-test",
        timeoutMs: 30_000,
        blockReplyBreak: "text_end",
      },
    };

    const typingSignals = {
      signalTextDelta: vi.fn(async () => {}),
      signalMessageStart: vi.fn(async () => {}),
      // Reject to ensure we don't crash / produce unhandled rejections.
      signalToolStart: vi.fn(async () => {
        throw new Error("tool typing failed");
      }),
    } as any;

    try {
      const result = await runAgentTurnWithFallback({
        commandBody: "hello",
        followupRun,
        sessionCtx,
        opts: {
          runId: "run-sdk-1",
          onAgentRunStart: vi.fn(),
          onModelSelected: vi.fn(),
          onPartialReply: vi.fn(),
        } as any,
        typingSignals,
        blockReplyPipeline: null,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "text_end",
        applyReplyToMode: (payload) => payload,
        shouldEmitToolResult: () => false,
        shouldEmitToolOutput: () => false,
        pendingToolTasks: new Set(),
        resetSessionAfterCompactionFailure: async () => false,
        resetSessionAfterRoleOrderingConflict: async () => false,
        isHeartbeat: false,
        sessionKey: "main",
        getActiveSessionEntry: () => undefined,
        activeSessionStore: {},
        storePath: "/tmp/store.json",
        resolvedVerboseLevel: "off",
      });

      expect(result.kind).toBe("success");
      expect(result.runResult.payloads?.[0]?.text).toBe("sdk-ok");
    } finally {
      unsubscribe();
    }

    // SDK event forwarding: should include tool + assistant streams.
    expect(seenEvents.some((evt) => evt.stream === "tool")).toBe(true);
    expect(seenEvents.some((evt) => evt.stream === "assistant")).toBe(true);

    // Tool context: ensure the SDK tool bridge gets message + threading context.
    expect(createClawdbrainCodingTools).toHaveBeenCalledTimes(1);
    const [toolArgs] = vi.mocked(createClawdbrainCodingTools).mock.calls[0] ?? [];
    expect(toolArgs).toMatchObject({
      messageProvider: "slack",
      agentAccountId: "acct-1",
      messageTo: "C123",
      messageThreadId: "thread-1",
      groupChannel: "#general",
      groupSpace: "T1",
      workspaceDir: "/tmp/workspace",
      sessionKey: "main",
      agentDir: "/tmp/agent",
    });
  });
});
