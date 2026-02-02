import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import register from "./index.js";

const completeSimpleMock = vi.fn();

vi.mock("@mariozechner/pi-ai", () => ({
  completeSimple: (...args: unknown[]) => completeSimpleMock(...args),
}));

vi.mock("@armoriq/sdk", () => ({
  ArmorIQClient: class {
    capturePlan(_llm: string, _prompt: string, plan: Record<string, unknown>) {
      return { plan, llm: _llm, prompt: _prompt, metadata: {} };
    }

    async getIntentToken() {
      return { expiresAt: Date.now() / 1000 + 60 };
    }
  },
}));

type HookName = "before_agent_start" | "before_tool_call" | "agent_end";

function createApi(pluginConfig: Record<string, unknown>) {
  const handlers = new Map<HookName, Array<(event: any, ctx: any) => any>>();
  const api = {
    id: "armoriq",
    name: "ArmorIQ",
    source: "test",
    pluginConfig,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    on: (name: HookName, handler: (event: any, ctx: any) => any) => {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
  };
  return { api, handlers };
}

function createCtx(runId: string) {
  const model = { provider: "test", id: "model" } as Model<Api>;
  const modelRegistry = {
    getApiKey: async () => "test-api-key",
  } as ModelRegistry;
  return {
    runId,
    sessionKey: "session:test",
    model,
    modelRegistry,
    messageChannel: "whatsapp",
    accountId: "acct-1",
    senderId: "sender-1",
    senderName: "Sender",
    senderUsername: "sender",
    senderE164: "+15550001111",
  };
}

describe("ArmorIQ plugin", () => {
  beforeEach(() => {
    completeSimpleMock.mockReset();
  });

  it("captures a plan on agent start and allows matching tool calls", async () => {
    const { api, handlers } = createApi({
      enabled: true,
      apiKey: "ak_live_test",
      userId: "user-1",
      agentId: "agent-1",
    });
    register(api as any);

    completeSimpleMock.mockResolvedValue({
      content: JSON.stringify({
        steps: [{ action: "read", mcp: "openclaw" }],
        metadata: { goal: "read a file" },
      }),
    });

    const ctx = createCtx("run-allow");
    const beforeAgentStart = handlers.get("before_agent_start")?.[0];
    await beforeAgentStart?.(
      {
        prompt: "Read a file",
        tools: [{ name: "read", description: "Read files" }],
      },
      ctx,
    );

    const beforeToolCall = handlers.get("before_tool_call")?.[0];
    const result = await beforeToolCall?.({ toolName: "read", params: { path: "demo.txt" } }, ctx);
    expect(result?.block).not.toBe(true);
  });

  it("blocks when API key is missing", async () => {
    const { api, handlers } = createApi({
      enabled: true,
      userId: "user-1",
      agentId: "agent-1",
    });
    register(api as any);

    const ctx = createCtx("run-missing-key");
    const beforeToolCall = handlers.get("before_tool_call")?.[0];
    const result = await beforeToolCall?.({ toolName: "read", params: {} }, ctx);
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toContain("ArmorIQ API key missing");
  });

  it("accepts tool calls when intent token header includes the tool", async () => {
    const { api, handlers } = createApi({
      enabled: true,
      apiKey: "ak_live_test",
      userId: "user-1",
      agentId: "agent-1",
    });
    register(api as any);

    const ctx = {
      ...createCtx("run-intent-header"),
      intentTokenRaw: JSON.stringify({
        plan: { steps: [{ action: "web_fetch", mcp: "openclaw" }] },
        expiresAt: Date.now() / 1000 + 60,
      }),
    };

    const beforeToolCall = handlers.get("before_tool_call")?.[0];
    const result = await beforeToolCall?.(
      { toolName: "web_fetch", params: { url: "https://example.com" } },
      ctx,
    );
    expect(result?.block).not.toBe(true);
  });

  it("blocks tool calls when intent token header excludes the tool", async () => {
    const { api, handlers } = createApi({
      enabled: true,
      apiKey: "ak_live_test",
      userId: "user-1",
      agentId: "agent-1",
    });
    register(api as any);

    const ctx = {
      ...createCtx("run-intent-block"),
      intentTokenRaw: JSON.stringify({
        plan: { steps: [{ action: "read", mcp: "openclaw" }] },
        expiresAt: Date.now() / 1000 + 60,
      }),
    };

    const beforeToolCall = handlers.get("before_tool_call")?.[0];
    const result = await beforeToolCall?.({ toolName: "web_fetch", params: {} }, ctx);
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toContain("intent drift");
  });
});
