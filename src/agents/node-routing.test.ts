import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the callGateway function
vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));

import { resolveNodeByIdOrName, invokeAgentOnNode } from "./node-routing.js";
import { callGateway } from "../gateway/call.js";

const mockCallGateway = vi.mocked(callGateway);

describe("resolveNodeByIdOrName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves node by exact nodeId", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: true, commands: ["agent.run"] },
        { nodeId: "other-node", displayName: "Other", connected: true, commands: ["system.run"] },
      ],
    });

    const result = await resolveNodeByIdOrName("mac-studio-001");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.node.nodeId).toBe("mac-studio-001");
      expect(result.node.displayName).toBe("Mac Studio");
    }
  });

  it("resolves node by displayName (case-insensitive)", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: true, commands: ["agent.run"] },
      ],
    });

    const result = await resolveNodeByIdOrName("mac studio");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.node.nodeId).toBe("mac-studio-001");
    }
  });

  it("returns NOT_FOUND for unknown node", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: true, commands: ["agent.run"] },
      ],
    });

    const result = await resolveNodeByIdOrName("unknown-node");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.error).toContain("not found");
    }
  });

  it("returns NOT_CONNECTED for disconnected node", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: false, commands: ["agent.run"] },
      ],
    });

    const result = await resolveNodeByIdOrName("mac-studio-001");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_CONNECTED");
      expect(result.error).toContain("not connected");
    }
  });

  it("returns NO_AGENT_CAP for node without agent.run command", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: true, commands: ["system.run"] },
      ],
    });

    const result = await resolveNodeByIdOrName("mac-studio-001");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_AGENT_CAP");
      expect(result.error).toContain("agent.run");
    }
  });

  it("accepts node with agent capability", async () => {
    mockCallGateway.mockResolvedValueOnce({
      nodes: [
        { nodeId: "mac-studio-001", displayName: "Mac Studio", connected: true, caps: ["agent"] },
      ],
    });

    const result = await resolveNodeByIdOrName("mac-studio-001");

    expect(result.ok).toBe(true);
  });

  it("returns error for empty target", async () => {
    const result = await resolveNodeByIdOrName("  ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.error).toContain("empty");
    }
  });
});

describe("invokeAgentOnNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes agent.run command on node", async () => {
    mockCallGateway.mockResolvedValueOnce({
      ok: true,
      payload: { runId: "run-123", status: "accepted" },
    });

    const result = await invokeAgentOnNode({
      nodeId: "mac-studio-001",
      message: "Hello, world!",
      sessionKey: "agent:main:123",
      idempotencyKey: "idem-456",
    });

    expect(result.ok).toBe(true);
    expect(result.runId).toBe("run-123");
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.invoke",
        params: expect.objectContaining({
          nodeId: "mac-studio-001",
          command: "agent.run",
          params: expect.objectContaining({
            message: "Hello, world!",
            sessionKey: "agent:main:123",
            idempotencyKey: "idem-456",
          }),
        }),
      }),
    );
  });

  it("returns error when node invocation fails", async () => {
    mockCallGateway.mockResolvedValueOnce({
      ok: false,
      error: { message: "node unavailable" },
    });

    const result = await invokeAgentOnNode({
      nodeId: "mac-studio-001",
      message: "Hello",
      idempotencyKey: "idem-789",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("node unavailable");
  });

  it("handles callGateway exceptions", async () => {
    mockCallGateway.mockRejectedValueOnce(new Error("connection timeout"));

    const result = await invokeAgentOnNode({
      nodeId: "mac-studio-001",
      message: "Hello",
      idempotencyKey: "idem-abc",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection timeout");
  });
});
