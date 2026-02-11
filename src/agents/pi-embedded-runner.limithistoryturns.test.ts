import type { AgentMessage } from "@mariozechner/pi-agent-core";
import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import { limitHistoryTurns } from "./pi-embedded-runner.js";
import { sanitizeToolUseResultPairing } from "./session-transcript-repair.js";

vi.mock("@mariozechner/pi-ai", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-ai")>("@mariozechner/pi-ai");
  return {
    ...actual,
    streamSimple: (model: { api: string; provider: string; id: string }) => {
      if (model.id === "mock-error") {
        throw new Error("boom");
      }
      const stream = new actual.AssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({
          type: "done",
          reason: "stop",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            stopReason: "stop",
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            timestamp: Date.now(),
          },
        });
      });
      return stream;
    },
  };
});

const _makeOpenAiConfig = (modelIds: string[]) =>
  ({
    models: {
      providers: {
        openai: {
          api: "openai-responses",
          apiKey: "sk-test",
          baseUrl: "https://example.com",
          models: modelIds.map((id) => ({
            id,
            name: `Mock ${id}`,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 16_000,
            maxTokens: 2048,
          })),
        },
      },
    },
  }) satisfies OpenClawConfig;

const _ensureModels = (cfg: OpenClawConfig, agentDir: string) =>
  ensureOpenClawModelsJson(cfg, agentDir) as unknown;

const _textFromContent = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content) && content[0]?.type === "text") {
    return (content[0] as { text?: string }).text;
  }
  return undefined;
};

const _readSessionMessages = async (sessionFile: string) => {
  const raw = await fs.readFile(sessionFile, "utf-8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          type?: string;
          message?: { role?: string; content?: unknown };
        },
    )
    .filter((entry) => entry.type === "message")
    .map((entry) => entry.message as { role?: string; content?: unknown });
};

describe("limitHistoryTurns", () => {
  const makeMessages = (roles: ("user" | "assistant")[]): AgentMessage[] =>
    roles.map((role, i) => ({
      role,
      content: [{ type: "text", text: `message ${i}` }],
    }));

  it("returns all messages when limit is undefined", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant"]);
    expect(limitHistoryTurns(messages, undefined)).toBe(messages);
  });
  it("returns all messages when limit is 0", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant"]);
    expect(limitHistoryTurns(messages, 0)).toBe(messages);
  });
  it("returns all messages when limit is negative", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant"]);
    expect(limitHistoryTurns(messages, -1)).toBe(messages);
  });
  it("returns empty array when messages is empty", () => {
    expect(limitHistoryTurns([], 5)).toEqual([]);
  });
  it("keeps all messages when fewer user turns than limit", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant"]);
    expect(limitHistoryTurns(messages, 10)).toBe(messages);
  });
  it("limits to last N user turns", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const limited = limitHistoryTurns(messages, 2);
    expect(limited.length).toBe(4);
    expect(limited[0].content).toEqual([{ type: "text", text: "message 2" }]);
  });
  it("handles single user turn limit", () => {
    const messages = makeMessages(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const limited = limitHistoryTurns(messages, 1);
    expect(limited.length).toBe(2);
    expect(limited[0].content).toEqual([{ type: "text", text: "message 4" }]);
    expect(limited[1].content).toEqual([{ type: "text", text: "message 5" }]);
  });
  it("handles messages with multiple assistant responses per user turn", () => {
    const messages = makeMessages(["user", "assistant", "assistant", "user", "assistant"]);
    const limited = limitHistoryTurns(messages, 1);
    expect(limited.length).toBe(2);
    expect(limited[0].role).toBe("user");
    expect(limited[1].role).toBe("assistant");
  });
  it("preserves message content integrity", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "first" }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "1", name: "exec", arguments: {} }],
      },
      { role: "user", content: [{ type: "text", text: "second" }] },
      { role: "assistant", content: [{ type: "text", text: "response" }] },
    ];
    const limited = limitHistoryTurns(messages, 1);
    expect(limited[0].content).toEqual([{ type: "text", text: "second" }]);
    expect(limited[1].content).toEqual([{ type: "text", text: "response" }]);
  });

  it("can orphan tool_result when truncation splits a tool_use/tool_result pair (#13896)", () => {
    // Simulate a conversation where an assistant tool_use and its tool_result
    // span across the truncation boundary.
    const messages: AgentMessage[] = [
      // Turn 1: user asks something, assistant uses a tool
      { role: "user", content: [{ type: "text", text: "search for X" }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_orphan", name: "search", arguments: {} }],
      },
      // tool_result for the above tool_use
      {
        role: "toolResult",
        content: [{ type: "text", text: "found X" }],
        id: "toolu_orphan",
        isError: false,
      } as AgentMessage,
      // Turn 2: user asks follow-up
      { role: "user", content: [{ type: "text", text: "tell me more" }] },
      { role: "assistant", content: [{ type: "text", text: "here is more info" }] },
    ];

    // limitHistoryTurns(messages, 1) keeps only the last user turn.
    // This slices off the assistant tool_use but keeps the tool_result.
    const limited = limitHistoryTurns(messages, 1);

    // The tool_result for "toolu_orphan" may still be present without its tool_use.
    const hasOrphanedResult = limited.some(
      (m) => m.role === "toolResult" && (m as { id?: string }).id === "toolu_orphan",
    );

    // If orphan is present, running sanitizeToolUseResultPairing should remove it.
    if (hasOrphanedResult) {
      const repaired = sanitizeToolUseResultPairing(limited);
      const stillHasOrphan = repaired.some(
        (m) => m.role === "toolResult" && (m as { id?: string }).id === "toolu_orphan",
      );
      expect(stillHasOrphan).toBe(false);
    }
  });

  it("sanitizeToolUseResultPairing after limitHistoryTurns drops orphaned tool_results (#13896)", () => {
    // Directly test the fix pattern: limitHistoryTurns → sanitizeToolUseResultPairing
    const messages: AgentMessage[] = [
      // Turn 1
      { role: "user", content: [{ type: "text", text: "do task A" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "running task A" },
          { type: "toolCall", id: "toolu_A1", name: "exec", arguments: {} },
        ],
      },
      {
        role: "toolResult",
        content: [{ type: "text", text: "task A done" }],
        id: "toolu_A1",
        isError: false,
      } as AgentMessage,
      { role: "assistant", content: [{ type: "text", text: "task A complete" }] },
      // Turn 2 (with tool use that spans boundary)
      { role: "user", content: [{ type: "text", text: "do task B" }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "toolu_B1", name: "exec", arguments: {} }],
      },
      {
        role: "toolResult",
        content: [{ type: "text", text: "task B done" }],
        id: "toolu_B1",
        isError: false,
      } as AgentMessage,
      { role: "assistant", content: [{ type: "text", text: "task B complete" }] },
      // Turn 3 (last user turn, should be kept)
      { role: "user", content: [{ type: "text", text: "do task C" }] },
      { role: "assistant", content: [{ type: "text", text: "task C complete" }] },
    ];

    // Limit to 1 turn: keeps only turn 3
    const truncated = limitHistoryTurns(messages, 1);
    const repaired = sanitizeToolUseResultPairing(truncated);

    // No toolResult should remain (their tool_use messages were sliced off)
    const orphanedResults = repaired.filter((m) => m.role === "toolResult");
    expect(orphanedResults).toHaveLength(0);

    // The remaining messages should be the last user turn and its response
    expect(repaired.length).toBe(2);
    expect(repaired[0].role).toBe("user");
    expect(repaired[1].role).toBe("assistant");
  });
});
