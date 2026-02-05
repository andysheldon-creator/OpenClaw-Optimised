import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { McpClientManager } from "./client.js";
import { loadMcpTools, cleanupMcpClients } from "./service.js";

// Mock the module
vi.mock("./client.js", () => {
  const connect = vi.fn().mockResolvedValue(undefined);
  const listTools = vi.fn().mockResolvedValue([
    {
      name: "test-tool",
      description: "Test Tool",
      inputSchema: { type: "object" },
    },
  ]);
  const close = vi.fn().mockResolvedValue(undefined);

  const McpClientManager = vi.fn();
  McpClientManager.prototype.connect = connect;
  McpClientManager.prototype.listTools = listTools;
  McpClientManager.prototype.close = close;

  return { McpClientManager };
});

describe("loadMcpTools", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupMcpClients();
  });

  afterEach(async () => {
    await cleanupMcpClients();
  });

  it("should load tools from enabled servers", async () => {
    const config = {
      mcp: {
        servers: {
          test: {
            command: "test-server",
            enabled: true,
          },
          disabled: {
            command: "disabled-server",
            enabled: false,
          },
        },
      },
    };

    // oxlint-disable-next-line typescript/no-explicit-any
    const tools = await loadMcpTools(config as any);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("test_test-tool");
    expect(tools[0].description).toContain("[MCP: test]");
    expect(McpClientManager).toHaveBeenCalledTimes(1);
  });

  it("should ignore disabled servers", async () => {
    const config = {
      mcp: {
        servers: {
          disabled: {
            command: "disabled-server",
            enabled: false,
          },
        },
      },
    };

    // oxlint-disable-next-line typescript/no-explicit-any
    const tools = await loadMcpTools(config as any);

    expect(tools).toHaveLength(0);
    expect(McpClientManager).not.toHaveBeenCalled();
  });
});
