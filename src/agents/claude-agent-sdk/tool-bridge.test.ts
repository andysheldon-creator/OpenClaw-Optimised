import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import type { AnyAgentTool } from "../tools/common.js";
import type {
  McpServerLike,
  McpToolConfig,
  McpToolHandlerExtra,
  McpToolHandlerFn,
} from "./tool-bridge.types.js";
import { createCronTool } from "../tools/cron-tool.js";
import {
  bridgeClawdbrainToolsSync,
  buildMcpAllowedTools,
  buildZodSchemaForTool,
  convertToolResult,
  extractJsonSchema,
  jsonSchemaToZod,
  mcpToolName,
  wrapToolHandler,
} from "./tool-bridge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubTool(name: string, overrides?: Partial<AnyAgentTool>): AnyAgentTool {
  return {
    name,
    label: overrides?.label ?? name,
    description: overrides?.description ?? `Stub tool: ${name}`,
    parameters:
      overrides?.parameters ??
      Type.Object({
        input: Type.String({ description: "Test input" }),
      }),
    execute:
      overrides?.execute ??
      (async () => ({
        content: [{ type: "text", text: `${name} result` }],
      })),
  };
}

/** Create a mock extra object for testing. */
function createMockExtra(overrides?: Partial<McpToolHandlerExtra>): McpToolHandlerExtra {
  return {
    signal: overrides?.signal,
    _meta: overrides?._meta ?? {},
    sessionId: overrides?.sessionId,
    requestId: overrides?.requestId ?? 1,
  };
}

/** Mock McpServer that records tool registrations using registerTool(). */
class MockMcpServer implements McpServerLike {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
    handler: McpToolHandlerFn;
  }> = [];

  registerTool(name: string, config: McpToolConfig, handler: McpToolHandlerFn): void {
    this.tools.push({
      name,
      description: config.description ?? "",
      inputSchema: config.inputSchema,
      handler,
    });
  }
}

// ---------------------------------------------------------------------------
// extractJsonSchema
// ---------------------------------------------------------------------------

describe("extractJsonSchema", () => {
  it("extracts a TypeBox schema as JSON Schema", () => {
    const tool = createStubTool("test", {
      parameters: Type.Object({
        url: Type.String({ description: "A URL" }),
        count: Type.Optional(Type.Number({ minimum: 1 })),
      }),
    });

    const schema = extractJsonSchema(tool);
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();

    const props = schema.properties as Record<string, { type?: string; description?: string }>;
    expect(props.url?.type).toBe("string");
    expect(props.url?.description).toBe("A URL");
    expect(props.count?.type).toBe("number");
  });

  it("returns empty schema for tool with no parameters", () => {
    // Directly construct a tool with no parameters (bypassing helper defaults).
    const tool: AnyAgentTool = {
      name: "empty",
      label: "empty",
      description: "No params",
      parameters: undefined as never,
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    };
    const schema = extractJsonSchema(tool);
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
  });

  it("strips TypeBox internal symbols via JSON round-trip", () => {
    const tool = createStubTool("typed", {
      parameters: Type.Object({ key: Type.String() }),
    });
    const schema = extractJsonSchema(tool);

    // Symbol keys should not survive JSON.parse(JSON.stringify(...))
    const symbolKeys = Object.getOwnPropertySymbols(schema);
    expect(symbolKeys).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// jsonSchemaToZod
// ---------------------------------------------------------------------------

describe("jsonSchemaToZod", () => {
  it("converts object schema with string properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        name: { type: "string", description: "User name" },
        email: { type: "string" },
      },
      required: ["name"],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(zodSchema).toBeDefined();

    // Validate that schema accepts correct data
    const validResult = zodSchema.safeParse({ name: "John", email: "john@example.com" });
    expect(validResult.success).toBe(true);

    // Should also accept without optional email
    const validWithoutEmail = zodSchema.safeParse({ name: "John" });
    expect(validWithoutEmail.success).toBe(true);
  });

  it("converts enum properties for action parameters", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["send", "delete", "react"] },
        target: { type: "string" },
      },
      required: ["action"],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Valid action
    const validResult = zodSchema.safeParse({ action: "send", target: "user123" });
    expect(validResult.success).toBe(true);

    // Invalid action should fail
    const invalidResult = zodSchema.safeParse({ action: "invalid_action" });
    expect(invalidResult.success).toBe(false);
  });

  it("converts number and integer properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        count: { type: "number" },
        limit: { type: "integer" },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const result = zodSchema.safeParse({ count: 3.14, limit: 10 });
    expect(result.success).toBe(true);
  });

  it("converts boolean properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        silent: { type: "boolean", description: "Silent mode" },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const result = zodSchema.safeParse({ enabled: true, silent: false });
    expect(result.success).toBe(true);
  });

  it("converts array properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        ids: { type: "array", items: { type: "number" } },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const result = zodSchema.safeParse({ tags: ["a", "b"], ids: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it("converts nested object properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        config: {
          type: "object",
          properties: {
            timeout: { type: "number" },
            retries: { type: "integer" },
          },
          required: ["timeout"],
        },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const result = zodSchema.safeParse({ config: { timeout: 5000, retries: 3 } });
    expect(result.success).toBe(true);
  });

  it("handles schema with only properties (no explicit type)", () => {
    const jsonSchema = {
      properties: {
        message: { type: "string" },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const result = zodSchema.safeParse({ message: "hello" });
    expect(result.success).toBe(true);
  });

  it("returns permissive schema for empty properties", () => {
    const jsonSchema = {
      type: "object",
      properties: {},
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept any object
    const result = zodSchema.safeParse({ anything: "goes" });
    expect(result.success).toBe(true);
  });

  it("handles const values", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        version: { const: "v1" },
      },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    const validResult = zodSchema.safeParse({ version: "v1" });
    expect(validResult.success).toBe(true);

    const invalidResult = zodSchema.safeParse({ version: "v2" });
    expect(invalidResult.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildZodSchemaForTool
// ---------------------------------------------------------------------------

describe("buildZodSchemaForTool", () => {
  it("builds Zod schema from tool TypeBox parameters", () => {
    const tool = createStubTool("message", {
      parameters: Type.Object({
        action: Type.Union([Type.Literal("send"), Type.Literal("delete")]),
        target: Type.String({ description: "Target user or channel" }),
        message: Type.Optional(Type.String()),
      }),
    });

    const zodSchema = buildZodSchemaForTool(tool);
    expect(zodSchema).toBeDefined();

    // Should be a Zod schema that validates correctly
    const result = zodSchema.safeParse({ action: "send", target: "user123", message: "Hello" });
    expect(result.success).toBe(true);
  });

  it("handles tool with enum action parameter", () => {
    const tool: AnyAgentTool = {
      name: "action_tool",
      label: "Action Tool",
      description: "Tool with action enum",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "delete"] },
          id: { type: "string" },
        },
        required: ["action"],
      } as never,
      execute: async () => ({ content: [{ type: "text", text: "ok" }], details: undefined }),
    };

    const zodSchema = buildZodSchemaForTool(tool);

    // Valid action
    const validResult = zodSchema.safeParse({ action: "create", id: "123" });
    expect(validResult.success).toBe(true);

    // Invalid action
    const invalidResult = zodSchema.safeParse({ action: "invalid" });
    expect(invalidResult.success).toBe(false);
  });

  it("returns permissive schema for tool with no parameters", () => {
    const tool: AnyAgentTool = {
      name: "no_params",
      label: "No Params",
      description: "No parameters",
      parameters: undefined as never,
      execute: async () => ({ content: [{ type: "text", text: "ok" }], details: undefined }),
    };

    const zodSchema = buildZodSchemaForTool(tool);

    // Should accept any object
    const result = zodSchema.safeParse({ anything: "value" });
    expect(result.success).toBe(true);
  });

  it("preserves additionalProperties for empty object schemas (no silent stripping)", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        payload: {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
      },
      required: ["payload"],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    const result = zodSchema.safeParse({ payload: { a: 1, nested: { b: 2 } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload).toMatchObject({ a: 1, nested: { b: 2 } });
    }
  });
});

describe("buildZodSchemaForTool (real tools)", () => {
  it("does not strip cron.job/cron.patch payload keys", () => {
    const tool = createCronTool();
    const schema = buildZodSchemaForTool(tool);

    const addRes = schema.safeParse({
      action: "add",
      job: { name: "x", schedule: { kind: "cron", expr: "* * * * *" } },
    });
    expect(addRes.success).toBe(true);
    if (addRes.success) {
      expect(addRes.data.job).toMatchObject({
        name: "x",
        schedule: { kind: "cron", expr: "* * * * *" },
      });
    }

    const updateRes = schema.safeParse({
      action: "update",
      jobId: "job-1",
      patch: { enabled: false, name: "y" },
    });
    expect(updateRes.success).toBe(true);
    if (updateRes.success) {
      expect(updateRes.data.patch).toMatchObject({ enabled: false, name: "y" });
    }
  });
});

// ---------------------------------------------------------------------------
// convertToolResult
// ---------------------------------------------------------------------------

describe("convertToolResult", () => {
  it("converts text content blocks", () => {
    const result = convertToolResult({
      content: [{ type: "text", text: "Hello world" }],
    });

    expect(result.content).toEqual([{ type: "text", text: "Hello world" }]);
    expect(result.isError).toBeUndefined();
  });

  it("converts image content blocks", () => {
    const result = convertToolResult({
      content: [{ type: "image", data: "base64data", mimeType: "image/png" } as never],
    });

    expect(result.content).toEqual([{ type: "image", data: "base64data", mimeType: "image/png" }]);
  });

  it("converts tool_error to text with isError flag", () => {
    const result = convertToolResult({
      content: [{ type: "tool_error", error: "Something broke" } as never],
    });

    expect(result.content).toEqual([{ type: "text", text: "Something broke" }]);
    expect(result.isError).toBe(true);
  });

  it("serializes details as tool-details text block", () => {
    const result = convertToolResult({
      content: [{ type: "text", text: "OK" }],
      details: { status: "ok", count: 42 },
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({ type: "text", text: "OK" });

    const detailsBlock = result.content[1] as { type: string; text: string };
    expect(detailsBlock.type).toBe("text");
    expect(detailsBlock.text).toContain("<tool-details>");
    expect(detailsBlock.text).toContain('"status": "ok"');
    expect(detailsBlock.text).toContain('"count": 42');
  });

  it("returns fallback for empty content", () => {
    const result = convertToolResult({ content: [] });
    expect(result.content).toEqual([{ type: "text", text: "(no output)" }]);
  });

  it("skips non-serializable details gracefully", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const result = convertToolResult({
      content: [{ type: "text", text: "ok" }],
      details: circular,
    });

    // Should have only the text block, details skipped.
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
  });
});

// ---------------------------------------------------------------------------
// wrapToolHandler
// ---------------------------------------------------------------------------

describe("wrapToolHandler", () => {
  it("calls tool.execute with correct arguments", async () => {
    const executeFn = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "done" }],
    });
    const tool = createStubTool("my_tool", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const extra = createMockExtra();
    const result = await handler({ input: "hello" }, extra);

    expect(executeFn).toHaveBeenCalledTimes(1);

    const [toolCallId, params, signal, onUpdate] = executeFn.mock.calls[0];
    expect(toolCallId).toMatch(/^mcp-bridge-my_tool-/);
    expect(params).toEqual({ input: "hello" });
    expect(signal).toBeUndefined(); // No abort signal in extra or fallback
    expect(onUpdate).toBeUndefined(); // MCP doesn't support streaming updates

    expect(result.content).toEqual([{ type: "text", text: "done" }]);
  });

  it("passes abort signal from extra to tool.execute", async () => {
    const executeFn = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const tool = createStubTool("signaled", { execute: executeFn });

    const controller = new AbortController();
    const handler = wrapToolHandler(tool);
    const extra = createMockExtra({ signal: controller.signal });
    await handler({}, extra);

    const [, , signal] = executeFn.mock.calls[0];
    expect(signal).toBe(controller.signal);
  });

  it("uses fallback abort signal when extra has none", async () => {
    const executeFn = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const tool = createStubTool("signaled", { execute: executeFn });

    const controller = new AbortController();
    const handler = wrapToolHandler(tool, controller.signal);
    const extra = createMockExtra(); // No signal in extra
    await handler({}, extra);

    const [, , signal] = executeFn.mock.calls[0];
    expect(signal).toBe(controller.signal);
  });

  it("catches errors and returns isError result", async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error("Boom!"));
    const tool = createStubTool("failing", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const result = await handler({}, createMockExtra());

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Boom!"),
    });
  });

  it("truncates multi-line error messages at first line feed for logging", async () => {
    // Simulate a git error with multi-line output
    const multiLineError = new Error(
      "Already on 'main'\nM    AGENTS.md\nM    HEARTBEAT.md\nfatal: 'origin' does not appear to be a git repository",
    );
    const executeFn = vi.fn().mockRejectedValue(multiLineError);
    const tool = createStubTool("exec", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const result = await handler({ command: "git checkout main" }, createMockExtra());

    // The result returned to the model should still contain the full error
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Already on 'main'"),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("AGENTS.md"),
    });
  });

  it("extracts exit code from end and prepends to first line", async () => {
    // Simulate an exec error where exit code info appears at the end
    const errorWithExitCode = new Error(
      "fatal: not a git repository\n/tmp/test\n\nCommand exited with code 128",
    );
    const executeFn = vi.fn().mockRejectedValue(errorWithExitCode);
    const tool = createStubTool("exec", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const result = await handler({ command: "git status" }, createMockExtra());

    // The result should still contain the full error message
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("fatal: not a git repository"),
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Command exited with code 128"),
    });
  });

  it("handles signal termination messages", async () => {
    const signalError = new Error(
      "stdout line 1\nstdout line 2\n\nCommand aborted by signal SIGTERM",
    );
    const executeFn = vi.fn().mockRejectedValue(signalError);
    const tool = createStubTool("exec", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const result = await handler({ command: "long-running" }, createMockExtra());

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("signal SIGTERM"),
    });
  });

  it("handles AbortError gracefully", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const executeFn = vi.fn().mockRejectedValue(abortError);
    const tool = createStubTool("abortable", { execute: executeFn });

    const handler = wrapToolHandler(tool);
    const result = await handler({}, createMockExtra());

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("aborted"),
    });
  });
});

// ---------------------------------------------------------------------------
// mcpToolName / buildMcpAllowedTools
// ---------------------------------------------------------------------------

describe("mcpToolName", () => {
  it("builds mcp__{server}__{tool} format", () => {
    expect(mcpToolName("clawdbrain", "web_fetch")).toBe("mcp__clawdbrain__web_fetch");
  });
});

describe("buildMcpAllowedTools", () => {
  it("builds allowed list for all tools", () => {
    const tools = [createStubTool("web_fetch"), createStubTool("exec"), createStubTool("message")];
    const allowed = buildMcpAllowedTools("clawdbrain", tools);
    expect(allowed).toEqual([
      "mcp__clawdbrain__web_fetch",
      "mcp__clawdbrain__exec",
      "mcp__clawdbrain__message",
    ]);
  });
});

// ---------------------------------------------------------------------------
// bridgeClawdbrainToolsSync (full integration with mock McpServer)
// ---------------------------------------------------------------------------

describe("bridgeClawdbrainToolsSync", () => {
  it("registers all tools on the MCP server", () => {
    const tools = [createStubTool("tool_a"), createStubTool("tool_b"), createStubTool("tool_c")];

    const result = bridgeClawdbrainToolsSync({
      name: "test-server",
      tools,
      McpServer: MockMcpServer as never,
    });

    expect(result.toolCount).toBe(3);
    expect(result.registeredTools).toEqual(["tool_a", "tool_b", "tool_c"]);
    expect(result.skippedTools).toEqual([]);
    expect(result.allowedTools).toEqual([
      "mcp__test-server__tool_a",
      "mcp__test-server__tool_b",
      "mcp__test-server__tool_c",
    ]);

    // Verify the actual MCP server received registrations.
    const server = result.serverConfig.instance as MockMcpServer;
    expect(server.tools).toHaveLength(3);
    expect(server.tools[0].name).toBe("tool_a");
    expect(server.tools[1].name).toBe("tool_b");
    expect(server.tools[2].name).toBe("tool_c");
  });

  it("skips tools with empty names", () => {
    const tools = [
      createStubTool("good_tool"),
      { ...createStubTool(""), name: "" },
      createStubTool("another_good"),
    ];

    const result = bridgeClawdbrainToolsSync({
      name: "server",
      tools,
      McpServer: MockMcpServer as never,
    });

    expect(result.toolCount).toBe(2);
    expect(result.registeredTools).toEqual(["good_tool", "another_good"]);
    expect(result.skippedTools).toEqual(["(unnamed)"]);
  });

  it("preserves tool descriptions", () => {
    const tools = [createStubTool("described", { description: "My custom description" })];

    const result = bridgeClawdbrainToolsSync({
      name: "s",
      tools,
      McpServer: MockMcpServer as never,
    });

    const server = result.serverConfig.instance as MockMcpServer;
    expect(server.tools[0].description).toBe("My custom description");
  });

  it("uses passthrough Zod schema for MCP server", () => {
    // With the new implementation, we use a passthrough Zod schema that accepts any object.
    // Our tools do their own validation via TypeBox schemas.
    const tools = [createStubTool("fetch")];
    const result = bridgeClawdbrainToolsSync({
      name: "s",
      tools,
      McpServer: MockMcpServer as never,
    });

    const server = result.serverConfig.instance as MockMcpServer;
    // The inputSchema should be a Zod record schema (not JSON Schema)
    expect(server.tools[0].inputSchema).toBeDefined();
  });

  it("handler calls through to original tool execute", async () => {
    const executeFn = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "executed!" }],
      details: { status: "ok" },
    });

    const tools = [createStubTool("runner", { execute: executeFn })];
    const result = bridgeClawdbrainToolsSync({
      name: "s",
      tools,
      McpServer: MockMcpServer as never,
    });

    const server = result.serverConfig.instance as MockMcpServer;
    // Handler now takes (args, extra) per MCP SDK convention
    const mcpResult = await server.tools[0].handler({ arg1: "value1" }, createMockExtra());

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mcpResult.content[0]).toMatchObject({ type: "text", text: "executed!" });
    // Details should be serialized as a second text block
    expect(mcpResult.content[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"status": "ok"'),
    });
  });

  it("sets serverConfig.type to 'sdk'", () => {
    const result = bridgeClawdbrainToolsSync({
      name: "clawdbrain",
      tools: [createStubTool("t")],
      McpServer: MockMcpServer as never,
    });

    expect(result.serverConfig.type).toBe("sdk");
    expect(result.serverConfig.name).toBe("clawdbrain");
  });
});
