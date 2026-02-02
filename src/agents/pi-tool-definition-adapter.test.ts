import type { AgentTool } from "@mariozechner/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toClientToolDefinitions, toToolDefinitions } from "./pi-tool-definition-adapter.js";

// Mock the before_tool_call hook helper (used by toClientToolDefinitions)
vi.mock("./pi-tools.before-tool-call.js", () => ({
  runBeforeToolCallHook: vi.fn(async (args: { params: unknown }) => ({
    blocked: false,
    params: args.params,
  })),
}));

// Mock the global hook runner (used for after_tool_call in the adapter)
vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => null),
}));

// Mock the logger so we can verify warn/error calls
vi.mock("../logger.js", () => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { logWarn } from "../logger.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { runBeforeToolCallHook } from "./pi-tools.before-tool-call.js";

const mockRunBeforeToolCallHook = vi.mocked(runBeforeToolCallHook);
const mockGetGlobalHookRunner = vi.mocked(getGlobalHookRunner);
const mockLogWarn = vi.mocked(logWarn);

function makeTool(
  overrides: Partial<AgentTool<unknown, unknown>> = {},
): AgentTool<unknown, unknown> {
  return {
    name: "test-tool",
    label: "Test",
    description: "test",
    parameters: {},
    execute: async () => ({ details: { ok: true }, resultForAssistant: "ok" }),
    ...overrides,
  };
}

/** Helper: create a mock hook runner for after_tool_call testing */
function mockAfterHookRunner(opts: {
  hooks?: string[];
  runAfterToolCall?: (...args: unknown[]) => unknown;
}) {
  const hooks = opts.hooks ?? [];
  return {
    hasHooks: (name: string) => hooks.includes(name),
    runAfterToolCall: vi.fn(opts.runAfterToolCall ?? (async () => {})),
  } as any;
}

describe("pi tool definition adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Original tests (pre-existing)
  // =========================================================================

  it("wraps tool errors into a tool result", async () => {
    const tool = {
      name: "boom",
      label: "Boom",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call1", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "boom",
    });
    expect(result.details).toMatchObject({ error: "nope" });
    expect(JSON.stringify(result.details)).not.toContain("\n    at ");
  });

  it("normalizes exec tool aliases in error results", async () => {
    const tool = {
      name: "bash",
      label: "Bash",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call2", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "exec",
      error: "nope",
    });
  });

  // =========================================================================
  // after_tool_call hook (toToolDefinitions)
  // =========================================================================

  describe("after_tool_call hook", () => {
    it("fires after_tool_call on successful execution with result and duration", async () => {
      const runner = mockAfterHookRunner({ hooks: ["after_tool_call"] });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const tool = makeTool({
        name: "read",
        execute: async () => ({ details: { content: "hello" }, resultForAssistant: "hello" }),
      });

      const defs = toToolDefinitions([tool], { agentId: "main" });
      await defs[0].execute("call1", { path: "/tmp/f" }, undefined, undefined);

      // Wait for the fire-and-forget promise
      await new Promise((r) => setTimeout(r, 10));

      expect(runner.runAfterToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "read",
          params: { path: "/tmp/f" },
          result: { content: "hello" },
        }),
        expect.objectContaining({ agentId: "main", toolName: "read" }),
      );
      // durationMs should be a non-negative number
      const event = runner.runAfterToolCall.mock.calls[0][0];
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof event.durationMs).toBe("number");
    });

    it("fires after_tool_call on error path with error message", async () => {
      const runner = mockAfterHookRunner({ hooks: ["after_tool_call"] });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const tool = makeTool({
        name: "exec",
        execute: async () => {
          throw new Error("boom");
        },
      });

      const defs = toToolDefinitions([tool], { agentId: "main" });
      await defs[0].execute("call1", { command: "fail" }, undefined, undefined);

      await new Promise((r) => setTimeout(r, 10));

      expect(runner.runAfterToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "exec",
          error: "boom",
        }),
        expect.objectContaining({ agentId: "main", toolName: "exec" }),
      );
      // Error path should not include result
      const event = runner.runAfterToolCall.mock.calls[0][0];
      expect(event.result).toBeUndefined();
    });

    it("swallows after_tool_call rejection without breaking execution", async () => {
      const runner = mockAfterHookRunner({
        hooks: ["after_tool_call"],
        runAfterToolCall: async () => {
          throw new Error("after hook exploded");
        },
      });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const tool = makeTool({
        name: "read",
        execute: async () => ({ details: { ok: true }, resultForAssistant: "ok" }),
      });

      const defs = toToolDefinitions([tool], { agentId: "main" });
      // Should not throw despite after_tool_call rejecting
      const result = await defs[0].execute("call1", {}, undefined, undefined);

      await new Promise((r) => setTimeout(r, 10));

      expect(result.details).toMatchObject({ ok: true });
      // Warning should be logged about the hook error
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining("after_tool_call hook error for read"),
      );
    });

    it("swallows after_tool_call rejection on error path too", async () => {
      const runner = mockAfterHookRunner({
        hooks: ["after_tool_call"],
        runAfterToolCall: async () => {
          throw new Error("after hook exploded");
        },
      });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const tool = makeTool({
        name: "exec",
        execute: async () => {
          throw new Error("tool failed");
        },
      });

      const defs = toToolDefinitions([tool], { agentId: "main" });
      // Should return error result, not throw
      const result = await defs[0].execute("call1", {}, undefined, undefined);

      await new Promise((r) => setTimeout(r, 10));

      expect(result.details).toMatchObject({ status: "error", error: "tool failed" });
    });
  });

  // =========================================================================
  // Hook runner exists but has no after_tool_call hooks
  // =========================================================================

  describe("hook runner with no matching hooks", () => {
    it("skips after_tool_call when hook runner has no after hooks", async () => {
      const runner = mockAfterHookRunner({ hooks: [] });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const executeSpy = vi.fn(async () => ({
        details: { ran: true },
        resultForAssistant: "ok",
      }));
      const tool = makeTool({ name: "exec", execute: executeSpy });

      const defs = toToolDefinitions([tool], { agentId: "main" });
      await defs[0].execute("call1", { command: "ls" }, undefined, undefined);

      expect(executeSpy).toHaveBeenCalled();
      expect(runner.runAfterToolCall).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // No hook runner (null) — backwards compatibility
  // =========================================================================

  describe("without hook runner", () => {
    it("executes normally when no hook runner is available", async () => {
      mockGetGlobalHookRunner.mockReturnValue(null);

      const tool = makeTool({
        name: "read",
        execute: async () => ({ details: { ok: true }, resultForAssistant: "ok" }),
      });

      const defs = toToolDefinitions([tool]);
      const result = await defs[0].execute("call1", {}, undefined, undefined);
      expect(result.details).toMatchObject({ ok: true });
    });

    it("executes normally when hookCtx is not provided", async () => {
      mockGetGlobalHookRunner.mockReturnValue(null);

      const tool = makeTool();
      const defs = toToolDefinitions([tool]);
      const result = await defs[0].execute("call1", {}, undefined, undefined);
      expect(result.details).toMatchObject({ ok: true });
    });
  });

  // =========================================================================
  // toClientToolDefinitions — after_tool_call hook
  // =========================================================================

  describe("toClientToolDefinitions", () => {
    function makeClientTool(name = "my-client-tool", description = "a client tool") {
      return {
        type: "function" as const,
        function: {
          name,
          description,
          parameters: { type: "object", properties: {} },
        },
      };
    }

    it("fires after_tool_call for client tools", async () => {
      const runner = mockAfterHookRunner({ hooks: ["after_tool_call"] });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const clientTool = makeClientTool("web-search");
      const defs = toClientToolDefinitions([clientTool], undefined, { agentId: "main" });
      await defs[0].execute("call1", { query: "hello" }, undefined, undefined);

      await new Promise((r) => setTimeout(r, 10));

      expect(runner.runAfterToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "web-search",
          params: { query: "hello" },
        }),
        expect.objectContaining({ agentId: "main", toolName: "web-search" }),
      );
      const event = runner.runAfterToolCall.mock.calls[0][0];
      expect(event.result).toMatchObject({ status: "pending" });
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("does NOT fire after_tool_call when before_tool_call blocks client tool", async () => {
      const runner = mockAfterHookRunner({ hooks: ["after_tool_call"] });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      mockRunBeforeToolCallHook.mockResolvedValueOnce({
        blocked: true,
        reason: "denied by policy",
      });

      const clientTool = makeClientTool("dangerous-tool");
      const defs = toClientToolDefinitions([clientTool], undefined, { agentId: "main" });

      // Client tools throw when blocked
      await expect(defs[0].execute("call1", { cmd: "bad" }, undefined, undefined)).rejects.toThrow(
        "denied by policy",
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(runner.runAfterToolCall).not.toHaveBeenCalled();
    });

    it("swallows after_tool_call rejection for client tools", async () => {
      const runner = mockAfterHookRunner({
        hooks: ["after_tool_call"],
        runAfterToolCall: async () => {
          throw new Error("hook boom");
        },
      });
      mockGetGlobalHookRunner.mockReturnValue(runner);

      const clientTool = makeClientTool("my-tool");
      const defs = toClientToolDefinitions([clientTool], undefined, { agentId: "main" });
      const result = await defs[0].execute("call1", {}, undefined, undefined);

      await new Promise((r) => setTimeout(r, 10));

      expect(result.details).toMatchObject({ status: "pending" });
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining("after_tool_call hook error for my-tool"),
      );
    });

    it("notifies onClientToolCall handler", async () => {
      const onCall = vi.fn();
      const clientTool = makeClientTool("web-search");
      const defs = toClientToolDefinitions([clientTool], onCall);
      await defs[0].execute("call1", { query: "test" }, undefined, undefined);

      expect(onCall).toHaveBeenCalledWith("web-search", { query: "test" });
    });
  });
});
