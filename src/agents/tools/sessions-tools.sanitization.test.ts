import { describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: () =>
      ({
        session: { scope: "per-sender", mainKey: "main" },
        tools: { agentToAgent: { enabled: false } },
      }) as never,
  };
});

import { SESSIONS_HISTORY_MAX_BYTES } from "./sessions-helpers.js";
import { createSessionsHistoryTool } from "./sessions-history-tool.js";
import { createSessionsListTool } from "./sessions-list-tool.js";

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

describe("sessions_list sanitization", () => {
  it("drops thinking blocks by default (includeThinking=false)", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const method = (opts as { method?: unknown }).method;
      if (method === "sessions.list") {
        return {
          path: "/tmp/sessions.json",
          sessions: [{ key: "agent:main:main", kind: "direct" }],
        };
      }
      if (method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "secret",
                  thinkingSignature: "abc123",
                },
                { type: "text", text: "hello" },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected gateway method: ${String(method)}`);
    });

    const tool = createSessionsListTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", { messageLimit: 1 });
    const messages = (result.details as { sessions: Array<{ messages?: unknown[] }> }).sessions[0]
      .messages;
    expect(messages).toHaveLength(1);
    const content = (messages?.[0] as { content?: unknown }).content as unknown[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((b) => (b as { type?: unknown }).type === "thinking")).toBe(false);
  });

  it("strips thinkingSignature when includeThinking=true", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const method = (opts as { method?: unknown }).method;
      if (method === "sessions.list") {
        return {
          path: "/tmp/sessions.json",
          sessions: [{ key: "agent:main:main", kind: "direct" }],
        };
      }
      if (method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "secret",
                  thinkingSignature: "a".repeat(50_000),
                },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected gateway method: ${String(method)}`);
    });

    const tool = createSessionsListTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", { messageLimit: 1, includeThinking: true });
    const messages = (result.details as { sessions: Array<{ messages?: unknown[] }> }).sessions[0]
      .messages;
    const content = (messages?.[0] as { content?: unknown }).content as unknown[];
    expect(content.some((b) => (b as { type?: unknown }).type === "thinking")).toBe(true);
    const thinking = content.find((b) => (b as { type?: unknown }).type === "thinking") as Record<
      string,
      unknown
    >;
    expect("thinkingSignature" in thinking).toBe(false);
  });

  it("truncates text + partialJson to 4000 chars", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const method = (opts as { method?: unknown }).method;
      if (method === "sessions.list") {
        return {
          path: "/tmp/sessions.json",
          sessions: [{ key: "agent:main:main", kind: "direct" }],
        };
      }
      if (method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [
                { type: "text", text: "x".repeat(5000) },
                { type: "json", partialJson: "y".repeat(5000) },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected gateway method: ${String(method)}`);
    });

    const tool = createSessionsListTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", { messageLimit: 1 });
    const messages = (result.details as { sessions: Array<{ messages?: unknown[] }> }).sessions[0]
      .messages;
    const content = (messages?.[0] as { content?: unknown }).content as Array<
      Record<string, unknown>
    >;

    const textBlock = content.find((b) => b.type === "text") as { text?: unknown };
    expect(typeof textBlock.text).toBe("string");
    expect(String(textBlock.text)).toContain("…(truncated)…");

    const jsonBlock = content.find((b) => b.type === "json") as { partialJson?: unknown };
    expect(typeof jsonBlock.partialJson).toBe("string");
    expect(String(jsonBlock.partialJson)).toContain("…(truncated)…");
  });

  it("applies the 80KB cap to sessions_list message payloads", async () => {
    const bigMessages = Array.from({ length: 20 }, () => ({
      role: "assistant",
      content: [{ type: "text", text: "a".repeat(4000) }],
    }));

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const method = (opts as { method?: unknown }).method;
      if (method === "sessions.list") {
        return {
          path: "/tmp/sessions.json",
          sessions: [{ key: "agent:main:main", kind: "direct" }],
        };
      }
      if (method === "chat.history") {
        return { messages: bigMessages };
      }
      throw new Error(`unexpected gateway method: ${String(method)}`);
    });

    const tool = createSessionsListTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", { messageLimit: 20 });
    const messages = (result.details as { sessions: Array<{ messages?: unknown[] }> }).sessions[0]
      .messages;
    expect(Array.isArray(messages)).toBe(true);
    expect(jsonBytes(messages)).toBeLessThanOrEqual(SESSIONS_HISTORY_MAX_BYTES);
    expect(messages?.length).toBeLessThan(bigMessages.length);
  });
});

describe("sessions_history sanitization", () => {
  it("drops thinking blocks by default (includeThinking=false)", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const method = (opts as { method?: unknown }).method;
      if (method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "secret",
                  thinkingSignature: "abc123",
                },
                { type: "text", text: "hello" },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected gateway method: ${String(method)}`);
    });

    const tool = createSessionsHistoryTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", { sessionKey: "main", limit: 1 });
    const messages = (result.details as { messages: unknown[] }).messages;
    const content = (messages[0] as { content?: unknown }).content as unknown[];
    expect(content.some((b) => (b as { type?: unknown }).type === "thinking")).toBe(false);
  });
});
