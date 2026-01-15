import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: {
    mainKey: "main",
    scope: "per-sender",
  },
};

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
    resolveGatewayPort: () => 18789,
  };
});

import { emitAgentEvent } from "../infra/agent-events.js";
import { createClawdbotTools } from "./clawdbot-tools.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

describe("clawdbot-tools: subagents", () => {
  beforeEach(() => {
    configOverride = {
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    };
  });

  it("sessions_spawn runs cleanup via lifecycle events", async () => {
    resetSubagentRegistryForTests();
    callGatewayMock.mockReset();
    const calls: Array<{ method?: string; params?: unknown }> = [];
    let agentCallCount = 0;
    let deletedKey: string | undefined;
    let childRunId: string | undefined;
    let childSessionKey: string | undefined;
    const waitCalls: Array<{ runId?: string; timeoutMs?: number }> = [];

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: unknown };
      calls.push(request);
      if (request.method === "agent") {
        agentCallCount += 1;
        const runId = `run-${agentCallCount}`;
        const params = request.params as {
          message?: string;
          sessionKey?: string;
          channel?: string;
          timeout?: number;
        };
        childRunId = runId;
        childSessionKey = params?.sessionKey ?? "";
        expect(params?.channel).toBe("discord");
        expect(params?.timeout).toBe(1);
        return {
          runId,
          status: "accepted",
          acceptedAt: 1000 + agentCallCount,
        };
      }
      if (request.method === "agent.wait") {
        const params = request.params as { runId?: string; timeoutMs?: number } | undefined;
        waitCalls.push(params ?? {});
        const status = params?.runId === childRunId ? "timeout" : "ok";
        return { runId: params?.runId ?? "run-1", status };
      }
      if (request.method === "sessions.delete") {
        const params = request.params as { key?: string } | undefined;
        deletedKey = params?.key;
        return { ok: true };
      }
      return {};
    });

    const tool = createClawdbotTools({
      agentSessionKey: "discord:group:req",
      agentChannel: "discord",
    }).find((candidate) => candidate.name === "sessions_spawn");
    if (!tool) throw new Error("missing sessions_spawn tool");

    const result = await tool.execute("call1", {
      task: "do thing",
      runTimeoutSeconds: 1,
      cleanup: "delete",
    });
    expect(result.details).toMatchObject({
      status: "accepted",
      runId: "run-1",
    });

    if (!childRunId) throw new Error("missing child runId");
    emitAgentEvent({
      runId: childRunId,
      stream: "lifecycle",
      data: {
        phase: "end",
        startedAt: 1234,
        endedAt: 2345,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const childWait = waitCalls.find((call) => call.runId === childRunId);
    expect(childWait?.timeoutMs).toBe(1000);

    // Only the subagent run, no announce step
    const agentCalls = calls.filter((call) => call.method === "agent");
    expect(agentCalls).toHaveLength(1);
    const first = agentCalls[0]?.params as
      | {
          lane?: string;
          deliver?: boolean;
          sessionKey?: string;
          channel?: string;
        }
      | undefined;
    expect(first?.lane).toBe("subagent");
    expect(first?.deliver).toBe(false);
    expect(first?.channel).toBe("discord");
    expect(first?.sessionKey?.startsWith("agent:main:subagent:")).toBe(true);
    expect(childSessionKey?.startsWith("agent:main:subagent:")).toBe(true);

    // No send to external channel (subagent uses report_back tool instead)
    const sendCalls = calls.filter((c) => c.method === "send");
    expect(sendCalls.length).toBe(0);

    // Session should be deleted since cleanup=delete
    expect(deletedKey?.startsWith("agent:main:subagent:")).toBe(true);
  });
});
