import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
const resolveSandboxRuntimeStatusMock = vi.fn(() => ({ sandboxed: false, agentId: "agent-123" }));
const resolveSandboxConfigForAgentMock = vi.fn(() => ({
  cron: {
    visibility: "agent",
    escape: "off",
    allowMainSessionJobs: false,
    delivery: "last-only",
  },
}));
const loadSessionStoreMock = vi.fn(() => ({}));
const resolveStorePathMock = vi.fn(() => "/tmp/clawdbot-sessions.json");

vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

vi.mock("../sandbox/runtime-status.js", () => ({
  resolveSandboxRuntimeStatus: (opts: unknown) => resolveSandboxRuntimeStatusMock(opts),
}));

vi.mock("../sandbox/config.js", () => ({
  resolveSandboxConfigForAgent: (cfg: unknown, agentId?: string) =>
    resolveSandboxConfigForAgentMock(cfg, agentId),
}));

vi.mock("../../config/sessions.js", () => ({
  loadSessionStore: (path?: string) => loadSessionStoreMock(path),
  resolveStorePath: (cfg: unknown, opts?: unknown) => resolveStorePathMock(cfg, opts),
}));

import { createCronTool } from "./cron-tool.js";

describe("cron tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
    resolveSandboxRuntimeStatusMock.mockReset();
    resolveSandboxRuntimeStatusMock.mockReturnValue({ sandboxed: false, agentId: "agent-123" });
    resolveSandboxConfigForAgentMock.mockReset();
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: false,
        delivery: "last-only",
      },
    });
    loadSessionStoreMock.mockReset();
    loadSessionStoreMock.mockReturnValue({});
    resolveStorePathMock.mockReset();
    resolveStorePathMock.mockReturnValue("/tmp/clawdbot-sessions.json");
  });

  it.each([
    [
      "update",
      { action: "update", jobId: "job-1", patch: { foo: "bar" } },
      { id: "job-1", patch: { foo: "bar" } },
    ],
    [
      "update",
      { action: "update", id: "job-2", patch: { foo: "bar" } },
      { id: "job-2", patch: { foo: "bar" } },
    ],
    ["remove", { action: "remove", jobId: "job-1" }, { id: "job-1" }],
    ["remove", { action: "remove", id: "job-2" }, { id: "job-2" }],
    ["run", { action: "run", jobId: "job-1" }, { id: "job-1" }],
    ["run", { action: "run", id: "job-2" }, { id: "job-2" }],
    ["runs", { action: "runs", jobId: "job-1" }, { id: "job-1" }],
    ["runs", { action: "runs", id: "job-2" }, { id: "job-2" }],
  ])("%s sends id to gateway", async (action, args, expectedParams) => {
    const tool = createCronTool();
    await tool.execute("call1", args);

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe(`cron.${action}`);
    expect(call.params).toEqual(expectedParams);
  });

  it("prefers jobId over id when both are provided", async () => {
    const tool = createCronTool();
    await tool.execute("call1", {
      action: "run",
      jobId: "job-primary",
      id: "job-legacy",
    });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      params?: unknown;
    };
    expect(call?.params).toEqual({ id: "job-primary" });
  });

  it("normalizes cron.add job payloads", async () => {
    const tool = createCronTool();
    await tool.execute("call2", {
      action: "add",
      job: {
        data: {
          name: "wake-up",
          schedule: { atMs: 123 },
          payload: { kind: "systemEvent", text: "hello" },
        },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.add");
    expect(call.params).toEqual({
      name: "wake-up",
      schedule: { kind: "at", atMs: 123 },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "systemEvent", text: "hello" },
    });
  });

  it("does not default agentId when job.agentId is null", async () => {
    const tool = createCronTool({ agentSessionKey: "main" });
    await tool.execute("call-null", {
      action: "add",
      job: {
        name: "wake-up",
        schedule: { atMs: 123 },
        agentId: null,
      },
    });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      params?: { agentId?: unknown };
    };
    expect(call?.params?.agentId).toBeNull();
  });

  it("adds recent context for systemEvent reminders when contextMessages > 0", async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        messages: [
          { role: "user", content: [{ type: "text", text: "Discussed Q2 budget" }] },
          {
            role: "assistant",
            content: [{ type: "text", text: "We agreed to review on Tuesday." }],
          },
          { role: "user", content: [{ type: "text", text: "Remind me about the thing at 2pm" }] },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    const tool = createCronTool({ agentSessionKey: "main" });
    await tool.execute("call3", {
      action: "add",
      contextMessages: 3,
      job: {
        name: "reminder",
        schedule: { atMs: 123 },
        payload: { kind: "systemEvent", text: "Reminder: the thing." },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(2);
    const historyCall = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(historyCall.method).toBe("chat.history");

    const cronCall = callGatewayMock.mock.calls[1]?.[0] as {
      method?: string;
      params?: { payload?: { text?: string } };
    };
    expect(cronCall.method).toBe("cron.add");
    const text = cronCall.params?.payload?.text ?? "";
    expect(text).toContain("Recent context:");
    expect(text).toContain("User: Discussed Q2 budget");
    expect(text).toContain("Assistant: We agreed to review on Tuesday.");
    expect(text).toContain("User: Remind me about the thing at 2pm");
  });

  it("caps contextMessages at 10", async () => {
    const messages = Array.from({ length: 12 }, (_, idx) => ({
      role: "user",
      content: [{ type: "text", text: `Message ${idx + 1}` }],
    }));
    callGatewayMock.mockResolvedValueOnce({ messages }).mockResolvedValueOnce({ ok: true });

    const tool = createCronTool({ agentSessionKey: "main" });
    await tool.execute("call5", {
      action: "add",
      contextMessages: 20,
      job: {
        name: "reminder",
        schedule: { atMs: 123 },
        payload: { kind: "systemEvent", text: "Reminder: the thing." },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(2);
    const historyCall = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: { limit?: number };
    };
    expect(historyCall.method).toBe("chat.history");
    expect(historyCall.params?.limit).toBe(10);

    const cronCall = callGatewayMock.mock.calls[1]?.[0] as {
      params?: { payload?: { text?: string } };
    };
    const text = cronCall.params?.payload?.text ?? "";
    expect(text).not.toMatch(/Message 1\\b/);
    expect(text).not.toMatch(/Message 2\\b/);
    expect(text).toContain("Message 3");
    expect(text).toContain("Message 12");
  });

  it("does not add context when contextMessages is 0 (default)", async () => {
    callGatewayMock.mockResolvedValueOnce({ ok: true });

    const tool = createCronTool({ agentSessionKey: "main" });
    await tool.execute("call4", {
      action: "add",
      job: {
        name: "reminder",
        schedule: { atMs: 123 },
        payload: { text: "Reminder: the thing." },
      },
    });

    // Should only call cron.add, not chat.history
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const cronCall = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: { payload?: { text?: string } };
    };
    expect(cronCall.method).toBe("cron.add");
    const text = cronCall.params?.payload?.text ?? "";
    expect(text).not.toContain("Recent context:");
  });

  it("preserves explicit agentId null on add", async () => {
    callGatewayMock.mockResolvedValueOnce({ ok: true });

    const tool = createCronTool({ agentSessionKey: "main" });
    await tool.execute("call6", {
      action: "add",
      job: {
        name: "reminder",
        schedule: { atMs: 123 },
        agentId: null,
        payload: { kind: "systemEvent", text: "Reminder: the thing." },
      },
    });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: { agentId?: string | null };
    };
    expect(call.method).toBe("cron.add");
    expect(call.params?.agentId).toBeNull();
  });

  it("scopes list for sandboxed agents when visibility=agent", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });
    await tool.execute("call7", { action: "list" });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.list");
    expect(call.params).toEqual({ includeDisabled: false, actorAgentId: "agent-123" });
  });

  it("skips actor scoping when sandbox escape is elevated", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "elevated",
        allowMainSessionJobs: false,
        delivery: "last-only",
      },
    });
    loadSessionStoreMock.mockReturnValue({
      "sess-1": { elevatedLevel: "on" },
    });

    const tool = createCronTool({ agentSessionKey: "sess-1" });
    await tool.execute("call8", { action: "list" });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      params?: unknown;
    };
    expect(call.params).toEqual({ includeDisabled: false });
  });

  it("keeps actor scoping when escape is elevated-full but elevated is on", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "elevated-full",
        allowMainSessionJobs: false,
        delivery: "last-only",
      },
    });
    loadSessionStoreMock.mockReturnValue({
      "sess-1": { elevatedLevel: "on" },
    });

    const tool = createCronTool({ agentSessionKey: "sess-1" });
    await tool.execute("call8b", { action: "list" });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      params?: unknown;
    };
    expect(call.params).toEqual({ includeDisabled: false, actorAgentId: "agent-123" });
  });

  it("skips actor scoping when escape is elevated-full and elevated is full", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "elevated-full",
        allowMainSessionJobs: false,
        delivery: "last-only",
      },
    });
    loadSessionStoreMock.mockReturnValue({
      "sess-1": { elevatedLevel: "full" },
    });

    const tool = createCronTool({ agentSessionKey: "sess-1" });
    await tool.execute("call8c", { action: "list" });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      params?: unknown;
    };
    expect(call.params).toEqual({ includeDisabled: false });
  });

  it("blocks main session cron jobs for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call9", {
        action: "add",
        job: {
          name: "main",
          schedule: { atMs: 123 },
          sessionTarget: "main",
          payload: { kind: "systemEvent", text: "hello" },
        },
      }),
    ).rejects.toThrow("sandboxed cron jobs cannot target main sessions");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("allows main session cron jobs when allowMainSessionJobs is true", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "last-only",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await tool.execute("call-main-allowed", {
      action: "add",
      job: {
        name: "main",
        schedule: { atMs: 123 },
        sessionTarget: "main",
        payload: { kind: "systemEvent", text: "hello" },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
    };
    expect(call.method).toBe("cron.add");
  });

  it("allows wake when allowMainSessionJobs is true", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "last-only",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await tool.execute("call-wake-allowed", {
      action: "wake",
      text: "wake up",
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
    };
    expect(call.method).toBe("wake");
  });

  it("blocks updates to main session cron jobs when patch omits sessionTarget", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    callGatewayMock.mockResolvedValueOnce({
      jobs: [{ id: "job-1", sessionTarget: "main", agentId: "agent-123" }],
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call-update-main", {
        action: "update",
        jobId: "job-1",
        patch: { name: "updated" },
      }),
    ).rejects.toThrow("sandboxed cron jobs cannot target main sessions");

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.list");
    expect(call.params).toEqual({ includeDisabled: true, actorAgentId: "agent-123" });
  });

  it.each(["remove", "run", "runs"])(
    "blocks %s for main session cron jobs when disallowed",
    async (action) => {
      resolveSandboxRuntimeStatusMock.mockReturnValue({
        sandboxed: true,
        agentId: "agent-123",
      });
      callGatewayMock.mockResolvedValueOnce({
        jobs: [{ id: "job-1", sessionTarget: "main", agentId: "agent-123" }],
      });
      const tool = createCronTool({ agentSessionKey: "sess-1" });

      await expect(
        tool.execute("call-main", {
          action,
          jobId: "job-1",
        }),
      ).rejects.toThrow("sandboxed cron jobs cannot target main sessions");

      expect(callGatewayMock).toHaveBeenCalledTimes(1);
      const call = callGatewayMock.mock.calls[0]?.[0] as {
        method?: string;
        params?: unknown;
      };
      expect(call.method).toBe("cron.list");
      expect(call.params).toEqual({ includeDisabled: true, actorAgentId: "agent-123" });
    },
  );

  it("rejects cross-agent cron jobs for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call10", {
        action: "add",
        job: {
          name: "other",
          schedule: { atMs: 123 },
          sessionTarget: "isolated",
          agentId: "other-agent",
          payload: { kind: "agentTurn", message: "hi" },
        },
      }),
    ).rejects.toThrow("cron agentId must match the sandboxed agent");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("allows cross-agent cron jobs when visibility=all", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "all",
        escape: "off",
        allowMainSessionJobs: false,
        delivery: "last-only",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await tool.execute("call10b", {
      action: "add",
      job: {
        name: "other",
        schedule: { atMs: 123 },
        sessionTarget: "isolated",
        agentId: "other-agent",
        payload: { kind: "agentTurn", message: "hi" },
      },
    });

    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: { agentId?: unknown };
    };
    expect(call.method).toBe("cron.add");
    expect(call.params?.agentId).toBe("other-agent");
  });

  it("rejects agentId mismatch on update for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call-update-agent-mismatch", {
        action: "update",
        jobId: "job-1",
        patch: { agentId: "other-agent" },
      }),
    ).rejects.toThrow("cron agentId must match the sandboxed agent");
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.list");
    expect(call.params).toEqual({ includeDisabled: true, actorAgentId: "agent-123" });
  });

  it("enforces delivery restrictions for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "off",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call11", {
        action: "add",
        job: {
          name: "deliver",
          schedule: { atMs: 123 },
          sessionTarget: "isolated",
          payload: { kind: "agentTurn", message: "hi", deliver: true },
        },
      }),
    ).rejects.toThrow("cron delivery is disabled for sandboxed sessions");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("allows explicit delivery for sandboxed agents when policy is explicit", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "explicit",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await tool.execute("call-explicit", {
      action: "add",
      job: {
        name: "deliver",
        schedule: { atMs: 123 },
        sessionTarget: "isolated",
        payload: {
          kind: "agentTurn",
          message: "hi",
          deliver: true,
          channel: "sms",
          to: "555-1212",
        },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
    };
    expect(call.method).toBe("cron.add");
  });

  it("allows last-only delivery when channel is last", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "last-only",
      },
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await tool.execute("call-last-only", {
      action: "add",
      job: {
        name: "deliver",
        schedule: { atMs: 123 },
        sessionTarget: "isolated",
        payload: {
          kind: "agentTurn",
          message: "hi",
          deliver: true,
          channel: "last",
        },
      },
    });

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
    };
    expect(call.method).toBe("cron.add");
  });

  it("rejects run when delivery is disabled for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "off",
      },
    });
    callGatewayMock.mockResolvedValueOnce({
      jobs: [
        {
          id: "job-1",
          sessionTarget: "isolated",
          payload: { kind: "agentTurn", message: "hi", deliver: true },
        },
      ],
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call-run-delivery-off", {
        action: "run",
        jobId: "job-1",
      }),
    ).rejects.toThrow("cron delivery is disabled for sandboxed sessions");

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.list");
    expect(call.params).toEqual({ includeDisabled: true, actorAgentId: "agent-123" });
  });

  it("rejects run when delivery is restricted to last route", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    resolveSandboxConfigForAgentMock.mockReturnValue({
      cron: {
        visibility: "agent",
        escape: "off",
        allowMainSessionJobs: true,
        delivery: "last-only",
      },
    });
    callGatewayMock.mockResolvedValueOnce({
      jobs: [
        {
          id: "job-2",
          sessionTarget: "isolated",
          payload: { kind: "agentTurn", message: "hi", channel: "sms" },
        },
      ],
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call-run-last-only", {
        action: "run",
        jobId: "job-2",
      }),
    ).rejects.toThrow("cron delivery channel is restricted to last route");

    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0]?.[0] as {
      method?: string;
      params?: unknown;
    };
    expect(call.method).toBe("cron.list");
    expect(call.params).toEqual({ includeDisabled: true, actorAgentId: "agent-123" });
  });

  it("adds actorAgentId on update for sandboxed agents", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });
    await tool.execute("call12", {
      action: "update",
      jobId: "job-1",
      patch: { name: "updated" },
    });

    const call = callGatewayMock.mock.calls.at(-1)?.[0] as {
      params?: unknown;
    };
    expect(call.params).toEqual({
      id: "job-1",
      patch: { name: "updated" },
      actorAgentId: "agent-123",
    });
  });

  it("blocks wake for sandboxed agents when main session jobs are disallowed", async () => {
    resolveSandboxRuntimeStatusMock.mockReturnValue({
      sandboxed: true,
      agentId: "agent-123",
    });
    const tool = createCronTool({ agentSessionKey: "sess-1" });

    await expect(
      tool.execute("call13", {
        action: "wake",
        text: "wake up",
      }),
    ).rejects.toThrow("sandboxed cron cannot send wake events to main sessions");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });
});
