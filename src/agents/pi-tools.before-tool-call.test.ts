import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { toClientToolDefinitions } from "./pi-tool-definition-adapter.js";
import {
  wrapToolWithBeforeToolCallHook,
  wrapToolWithHooks,
} from "./pi-tools.before-tool-call.js";

vi.mock("../plugins/hook-runner-global.js");

const mockGetGlobalHookRunner = vi.mocked(getGlobalHookRunner);

describe("before_tool_call hook integration", () => {
  let hookRunner: {
    hasHooks: ReturnType<typeof vi.fn>;
    runBeforeToolCall: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    hookRunner = {
      hasHooks: vi.fn(),
      runBeforeToolCall: vi.fn(),
    };
    // oxlint-disable-next-line typescript/no-explicit-any
    mockGetGlobalHookRunner.mockReturnValue(hookRunner as any);
  });

  it("executes tool normally when no hook is registered", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "Read", execute } as any, {
      agentId: "main",
      sessionKey: "main",
    });

    await tool.execute("call-1", { path: "/tmp/file" }, undefined, undefined);

    expect(hookRunner.runBeforeToolCall).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith("call-1", { path: "/tmp/file" }, undefined, undefined);
  });

  it("allows hook to modify parameters", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({ params: { mode: "safe" } });
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any);

    await tool.execute("call-2", { cmd: "ls" }, undefined, undefined);

    expect(execute).toHaveBeenCalledWith(
      "call-2",
      { cmd: "ls", mode: "safe" },
      undefined,
      undefined,
    );
  });

  it("blocks tool execution when hook returns block=true", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({
      block: true,
      blockReason: "blocked",
    });
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any);

    await expect(tool.execute("call-3", { cmd: "rm -rf /" }, undefined, undefined)).rejects.toThrow(
      "blocked",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("continues execution when hook throws", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockRejectedValue(new Error("boom"));
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "read", execute } as any);

    await tool.execute("call-4", { path: "/tmp/file" }, undefined, undefined);

    expect(execute).toHaveBeenCalledWith("call-4", { path: "/tmp/file" }, undefined, undefined);
  });

  it("normalizes non-object params for hook contract", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "ReAd", execute } as any, {
      agentId: "main",
      sessionKey: "main",
    });

    await tool.execute("call-5", "not-an-object", undefined, undefined);

    expect(hookRunner.runBeforeToolCall).toHaveBeenCalledWith(
      {
        toolName: "read",
        params: {},
      },
      {
        toolName: "read",
        agentId: "main",
        sessionKey: "main",
      },
    );
  });
});

describe("before_tool_call hook integration for client tools", () => {
  let hookRunner: {
    hasHooks: ReturnType<typeof vi.fn>;
    runBeforeToolCall: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    hookRunner = {
      hasHooks: vi.fn(),
      runBeforeToolCall: vi.fn(),
    };
    // oxlint-disable-next-line typescript/no-explicit-any
    mockGetGlobalHookRunner.mockReturnValue(hookRunner as any);
  });

  it("passes modified params to client tool callbacks", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({ params: { extra: true } });
    const onClientToolCall = vi.fn();
    const [tool] = toClientToolDefinitions(
      [
        {
          type: "function",
          function: {
            name: "client_tool",
            description: "Client tool",
            parameters: { type: "object", properties: { value: { type: "string" } } },
          },
        },
      ],
      onClientToolCall,
      { agentId: "main", sessionKey: "main" },
    );

    await tool.execute("client-call-1", { value: "ok" }, undefined, undefined, undefined);

    expect(onClientToolCall).toHaveBeenCalledWith("client_tool", {
      value: "ok",
      extra: true,
    });
  });
});

describe("after_tool_call hook integration", () => {
  let hookRunner: {
    hasHooks: ReturnType<typeof vi.fn>;
    runBeforeToolCall: ReturnType<typeof vi.fn>;
    runAfterToolCall: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    hookRunner = {
      hasHooks: vi.fn(),
      runBeforeToolCall: vi.fn(),
      runAfterToolCall: vi.fn(),
    };
    // oxlint-disable-next-line typescript/no-explicit-any
    mockGetGlobalHookRunner.mockReturnValue(hookRunner as any);
  });

  it("passes result through when no after hooks registered", async () => {
    hookRunner.hasHooks.mockImplementation((name: string) => name === "before_tool_call");
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "read", execute } as any);

    const result = await tool.execute("call-1", { path: "/tmp" }, undefined, undefined);

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(hookRunner.runAfterToolCall).not.toHaveBeenCalled();
  });

  it("allows hook to modify tool result", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockResolvedValue({
      result: { content: [{ type: "text", text: "masked" }] },
    });
    const execute = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "secret data" }] });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "read", execute } as any);

    const result = await tool.execute("call-2", { path: "/etc/passwd" }, undefined, undefined);

    expect(result).toEqual({ content: [{ type: "text", text: "masked" }] });
  });

  it("blocks tool result when hook returns block=true", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockResolvedValue({
      block: true,
      blockReason: "Prompt injection detected",
    });
    const execute = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "malicious" }] });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "web_fetch", execute } as any);

    const result = await tool.execute("call-3", { url: "http://evil.com" }, undefined, undefined);

    expect(result).toEqual({
      content: [{ type: "text", text: "[BLOCKED] Prompt injection detected" }],
    });
  });

  it("passes through on after hook error (fail-open)", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockRejectedValue(new Error("scanner crashed"));
    const execute = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "read", execute } as any);

    const result = await tool.execute("call-4", { path: "/tmp" }, undefined, undefined);

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("sends correct event data to after hook", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockResolvedValue(undefined);
    const toolResult = { content: [{ type: "text", text: "data" }] };
    const execute = vi.fn().mockResolvedValue(toolResult);
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "exec", execute } as any, {
      agentId: "main",
      sessionKey: "sess-1",
    });

    await tool.execute("call-5", { cmd: "ls" }, undefined, undefined);

    expect(hookRunner.runAfterToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "exec",
        params: { cmd: "ls" },
        result: toolResult,
        durationMs: expect.any(Number),
      }),
      {
        toolName: "exec",
        agentId: "main",
        sessionKey: "sess-1",
      },
    );
  });

  it("fires after hook on tool error for observability", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(new Error("tool failed"));
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "exec", execute } as any);

    await expect(
      tool.execute("call-6", { cmd: "bad" }, undefined, undefined),
    ).rejects.toThrow("tool failed");

    // Give the void promise a tick to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(hookRunner.runAfterToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "exec",
        params: { cmd: "bad" },
        result: undefined,
        error: expect.stringContaining("tool failed"),
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({ toolName: "exec" }),
    );
  });

  it("measures duration accurately", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    hookRunner.runAfterToolCall.mockResolvedValue(undefined);
    const execute = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ content: [] }), 50)),
    );
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithHooks({ name: "exec", execute } as any);

    await tool.execute("call-7", {}, undefined, undefined);

    const event = hookRunner.runAfterToolCall.mock.calls[0][0];
    expect(event.durationMs).toBeGreaterThanOrEqual(40);
    expect(event.durationMs).toBeLessThan(500);
  });
});
