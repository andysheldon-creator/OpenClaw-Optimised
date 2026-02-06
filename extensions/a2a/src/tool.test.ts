import { describe, expect, it, vi } from "vitest";

import { createSendMessageToAgentTool, createGetAgentCardTool, SendMessageToAgentSchema } from "./tool.js";

// Mock the @a2a-js/sdk/client module with a proper class
vi.mock("@a2a-js/sdk/client", () => {
  return {
    ClientFactory: class MockClientFactory {
      async createFromUrl(_url: string) {
        return {
          async sendMessage(_params: unknown) {
            return {
              kind: "message",
              messageId: "test-msg-id",
              role: "agent",
              parts: [{ kind: "text", text: "Hello from the other agent!" }],
              contextId: "ctx-123",
            };
          },
        };
      }
      get options() {
        return {
          cardResolver: {
            async resolve(_baseUrl: string) {
              return {
                name: "Test Agent",
                description: "A test agent",
                url: "https://agent.example.com",
                version: "1.0.0",
                protocolVersion: "0.3.0",
                capabilities: { streaming: true },
                defaultInputModes: ["text"],
                defaultOutputModes: ["text"],
                skills: [],
              };
            },
          },
        };
      }
    },
    ClientFactoryOptions: {
      default: {},
      createFrom: (_original: unknown, _overrides: unknown) => ({}),
    },
    JsonRpcTransportFactory: class MockJsonRpcTransportFactory {},
  };
});

describe("SendMessageToAgentSchema", () => {
  it("requires agent_url", () => {
    expect(SendMessageToAgentSchema.properties.agent_url).toBeDefined();
  });

  it("requires message", () => {
    expect(SendMessageToAgentSchema.properties.message).toBeDefined();
  });

  it("has optional context_id", () => {
    expect(SendMessageToAgentSchema.properties.context_id).toBeDefined();
  });
});

describe("createSendMessageToAgentTool", () => {
  it("creates a tool with correct name", () => {
    const tool = createSendMessageToAgentTool();

    expect(tool.name).toBe("send_message_to_agent");
  });

  it("creates a tool with correct name when remoteAgents provided", () => {
    const tool = createSendMessageToAgentTool([
      { url: "https://agent.example.com", headers: { "X-Key": "val" } },
    ]);

    expect(tool.name).toBe("send_message_to_agent");
  });

  it("creates a tool with description", () => {
    const tool = createSendMessageToAgentTool();

    expect(tool.description).toBeDefined();
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it("creates a tool with parameters schema", () => {
    const tool = createSendMessageToAgentTool();

    expect(tool.parameters).toBeDefined();
  });

  it("returns error for empty agent_url", async () => {
    const tool = createSendMessageToAgentTool();

    const result = await tool.execute("test-call-id", {
      agent_url: "",
      message: "Hello",
    });

    expect(result.content[0].text).toContain("error");
    expect(result.content[0].text).toContain("agent_url");
  });

  it("returns error for empty message", async () => {
    const tool = createSendMessageToAgentTool();

    const result = await tool.execute("test-call-id", {
      agent_url: "https://agent.example.com",
      message: "",
    });

    expect(result.content[0].text).toContain("error");
    expect(result.content[0].text).toContain("message");
  });

  it("returns message response for successful call", async () => {
    const tool = createSendMessageToAgentTool();

    const result = await tool.execute("test-call-id", {
      agent_url: "https://agent.example.com",
      message: "Hello",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.type).toBe("message");
    expect(parsed.text).toBe("Hello from the other agent!");
  });
});

describe("createGetAgentCardTool", () => {
  it("creates a tool with correct name", () => {
    const tool = createGetAgentCardTool();
    expect(tool.name).toBe("get_agent_card");
  });

  it("creates a tool with correct name when remoteAgents provided", () => {
    const tool = createGetAgentCardTool([
      { url: "https://agent.example.com", headers: { "X-Key": "val" } },
    ]);
    expect(tool.name).toBe("get_agent_card");
  });

  it("returns error for empty agent_url", async () => {
    const tool = createGetAgentCardTool();
    const result = await tool.execute("test-call-id", { agent_url: "" });
    expect(result.content[0].text).toContain("error");
  });
});
