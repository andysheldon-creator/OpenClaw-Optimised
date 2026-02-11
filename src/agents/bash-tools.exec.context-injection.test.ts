import { describe, expect, it, vi } from "vitest";
import type { ExecApprovalsResolved } from "../infra/exec-approvals.js";
import { sanitizeBinaryOutput } from "./shell-utils.js";

const isWin = process.platform === "win32";

vi.mock("../infra/exec-approvals.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../infra/exec-approvals.js")>();
  const approvals: ExecApprovalsResolved = {
    path: "/tmp/exec-approvals.json",
    socketPath: "/tmp/exec-approvals.sock",
    token: "token",
    defaults: {
      security: "full",
      ask: "off",
      askFallback: "full",
      autoAllowSkills: false,
    },
    agent: {
      security: "full",
      ask: "off",
      askFallback: "full",
      autoAllowSkills: false,
    },
    allowlist: [],
    file: {
      version: 1,
      socket: { path: "/tmp/exec-approvals.sock", token: "token" },
      defaults: {
        security: "full",
        ask: "off",
        askFallback: "full",
        autoAllowSkills: false,
      },
      agents: {},
    },
  };
  return { ...mod, resolveExecApprovals: () => approvals };
});

const normalizeText = (value?: string) =>
  sanitizeBinaryOutput(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

describe("exec context injection (always-on)", () => {
  it("injects agent context for main agent sessions", async () => {
    if (isWin) {
      // Skip on Windows as env var commands differ
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "agent:test-agent:main",
    });

    const result = await tool.execute("call1", {
      command:
        "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY SESSION_LABEL=$OPENCLAW_SESSION_LABEL SESSION_KIND=$OPENCLAW_SESSION_KIND",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    expect(output).toContain("AGENT_ID=test-agent");
    expect(output).toContain("SESSION_KEY=agent:test-agent:main");
    expect(output).toContain("SESSION_LABEL=main");
    expect(output).toContain("SESSION_KIND=main");
  });

  it("injects subagent context correctly", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "agent:test-agent:subagent:abc123",
    });

    const result = await tool.execute("call1", {
      command: "echo SESSION_LABEL=$OPENCLAW_SESSION_LABEL SESSION_KIND=$OPENCLAW_SESSION_KIND",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    expect(output).toContain("SESSION_LABEL=subagent:abc123");
    expect(output).toContain("SESSION_KIND=subagent");
  });

  it("injects custom session context correctly", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "agent:test-agent:custom-session",
    });

    const result = await tool.execute("call1", {
      command: "echo SESSION_LABEL=$OPENCLAW_SESSION_LABEL SESSION_KIND=$OPENCLAW_SESSION_KIND",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    expect(output).toContain("SESSION_LABEL=custom-session");
    expect(output).toContain("SESSION_KIND=custom");
  });

  it("handles empty agentId gracefully (no crash)", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "",
      sessionKey: "agent:test-agent:main",
    });

    const result = await tool.execute("call1", {
      command: "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    // Empty agentId should not be injected
    expect(output).toContain("AGENT_ID=");
    // Session key should still be injected
    expect(output).toContain("SESSION_KEY=agent:test-agent:main");
  });

  it("handles empty sessionKey gracefully (no crash)", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "",
    });

    const result = await tool.execute("call1", {
      command: "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    // Agent ID should be injected
    expect(output).toContain("AGENT_ID=test-agent");
    // Empty session key should not be injected
    expect(output).toContain("SESSION_KEY=");
  });

  it("handles malformed sessionKey gracefully (missing parts)", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "agent:", // Malformed: missing agentId and rest
    });

    const result = await tool.execute("call1", {
      command:
        "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY LABEL=$OPENCLAW_SESSION_LABEL KIND=$OPENCLAW_SESSION_KIND",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    // Agent ID should still be injected
    expect(output).toContain("AGENT_ID=test-agent");
    // Session key should be injected as-is
    expect(output).toContain("SESSION_KEY=agent:");
    // Label and kind should not be set due to malformed key
    expect(output).toContain("LABEL=");
    expect(output).toContain("KIND=");
  });

  it("handles non-agent session format gracefully", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      agentId: "test-agent",
      sessionKey: "user:123:main", // Non-agent session format
    });

    const result = await tool.execute("call1", {
      command:
        "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY LABEL=$OPENCLAW_SESSION_LABEL KIND=$OPENCLAW_SESSION_KIND",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    // Agent ID should still be injected
    expect(output).toContain("AGENT_ID=test-agent");
    // Session key should be injected as-is
    expect(output).toContain("SESSION_KEY=user:123:main");
    // Label and kind should not be set (non-agent format)
    expect(output).toContain("LABEL=");
    expect(output).toContain("KIND=");
  });

  it("handles missing agentId and sessionKey gracefully", async () => {
    if (isWin) {
      return;
    }

    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      host: "gateway",
      security: "full",
      ask: "off",
      // No agentId or sessionKey provided
    });

    const result = await tool.execute("call1", {
      command: "echo AGENT_ID=$OPENCLAW_AGENT_ID SESSION_KEY=$OPENCLAW_SESSION_KEY",
    });

    const output = normalizeText(result.content.find((c) => c.type === "text")?.text);

    // Nothing should be injected
    expect(output).toBe("AGENT_ID= SESSION_KEY=");
  });
});
