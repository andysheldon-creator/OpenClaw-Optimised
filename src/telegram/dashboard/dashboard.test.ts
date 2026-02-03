import { describe, expect, it } from "vitest";
import type { HealthSummary } from "../../commands/health.js";
import { escapeHtml, fmtDuration, fmtNum, statusIcon, truncate } from "./format.js";
import { handleDashboardCallback } from "./index.js";
import {
  renderAgentDetail,
  renderAgents,
  renderChannels,
  renderHome,
  renderLogs,
  renderSessions,
} from "./views.js";

const MOCK_HEALTH: HealthSummary = {
  ok: true,
  ts: Date.now(),
  durationMs: 3_600_000,
  channels: {
    telegram: { accountId: "default", configured: true, linked: true },
    discord: { accountId: "default", configured: true, linked: false },
  },
  channelOrder: ["telegram", "discord"],
  channelLabels: { telegram: "Telegram", discord: "Discord" },
  heartbeatSeconds: 30,
  defaultAgentId: "default",
  agents: [
    {
      agentId: "default",
      name: "Default Agent",
      isDefault: true,
      heartbeat: {
        enabled: true,
        every: "30s",
        everyMs: 30000,
        prompt: "",
        target: "last",
        ackMaxChars: 500,
      },
      sessions: { path: "/tmp", count: 3, recent: [] },
    },
    {
      agentId: "helper",
      name: "Helper",
      isDefault: false,
      heartbeat: {
        enabled: false,
        every: "",
        everyMs: null,
        prompt: "",
        target: "last",
        ackMaxChars: 500,
      },
      sessions: { path: "/tmp", count: 0, recent: [] },
    },
  ],
  sessions: {
    path: "/tmp/sessions",
    count: 5,
    recent: [
      { key: "session-1", updatedAt: Date.now() - 60_000, age: 60_000 },
      { key: "session-2", updatedAt: Date.now() - 120_000, age: 120_000 },
      { key: "session-3", updatedAt: Date.now() - 300_000, age: 300_000 },
      { key: "session-4", updatedAt: Date.now() - 600_000, age: 600_000 },
      { key: "session-5", updatedAt: Date.now() - 900_000, age: 900_000 },
    ],
  },
};

describe("dashboard format utils", () => {
  it("statusIcon returns correct icons", () => {
    expect(statusIcon("online")).toBe("\u2705");
    expect(statusIcon("offline")).toBe("\u274C");
    expect(statusIcon("warning")).toBe("\u26A0\uFE0F");
    expect(statusIcon("pending")).toBe("\u23F3");
    expect(statusIcon("unknown")).toBe("\u2796");
  });

  it("fmtNum formats numbers", () => {
    expect(fmtNum(1234)).toBe("1,234");
    expect(fmtNum(null)).toBe("—");
    expect(fmtNum(NaN)).toBe("—");
  });

  it("fmtDuration handles various ranges", () => {
    expect(fmtDuration(500)).toBe("0s");
    expect(fmtDuration(65_000)).toBe("1m 5s");
    expect(fmtDuration(3_700_000)).toBe("1h 1m");
    expect(fmtDuration(90_000_000)).toBe("1d 1h");
    expect(fmtDuration(-1)).toBe("—");
    expect(fmtDuration("bad")).toBe("—");
  });

  it("escapeHtml escapes HTML entities", () => {
    expect(escapeHtml("<b>test&</b>")).toBe("&lt;b&gt;test&amp;&lt;/b&gt;");
  });

  it("truncate respects max length", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a very long string", 10)).toBe("a very lo\u2026");
  });
});

describe("dashboard views", () => {
  it("renderHome shows summary with health data", () => {
    const result = renderHome(MOCK_HEALTH);
    expect(result.text).toContain("OpenClaw Dashboard");
    expect(result.text).toContain("Agents: <b>2</b>");
    expect(result.text).toContain("Sessions: <b>5</b>");
    expect(result.text).toContain("Channels: <b>2</b>");
    expect(result.buttons.length).toBeGreaterThan(0);
  });

  it("renderHome shows error when health is null", () => {
    const result = renderHome(null, "Connection refused");
    expect(result.text).toContain("Connection refused");
    expect(result.buttons[0][0].callback_data).toBe("d:refresh");
  });

  it("renderAgents lists all agents", () => {
    const result = renderAgents(MOCK_HEALTH);
    expect(result.text).toContain("Agents (2)");
    expect(result.text).toContain("Default Agent");
    expect(result.text).toContain("Helper");
  });

  it("renderAgentDetail shows agent info", () => {
    const result = renderAgentDetail(MOCK_HEALTH, "default");
    expect(result.text).toContain("Default Agent");
    expect(result.text).toContain("online");
  });

  it("renderAgentDetail handles missing agent", () => {
    const result = renderAgentDetail(MOCK_HEALTH, "nonexistent");
    expect(result.text).toContain("not found");
  });

  it("renderSessions paginates correctly", () => {
    const page0 = renderSessions(MOCK_HEALTH, 0);
    expect(page0.text).toContain("Sessions (5)");
    expect(page0.text).toContain("session-1");
    // page 0, PAGE_SIZE=5 means all fit on one page
    const pagination = page0.buttons[0];
    expect(pagination.some((b) => b.text.includes("1/1"))).toBe(true);
  });

  it("renderChannels shows channel list", () => {
    const result = renderChannels(MOCK_HEALTH);
    expect(result.text).toContain("Channels (2)");
    expect(result.text).toContain("Telegram");
    expect(result.text).toContain("Discord");
  });

  it("renderLogs shows activity", () => {
    const result = renderLogs(MOCK_HEALTH, 0);
    expect(result.text).toContain("Activity Log");
    expect(result.text).toContain("session-1");
  });
});

describe("handleDashboardCallback", () => {
  it("returns false for non-dashboard callbacks", async () => {
    const result = await handleDashboardCallback("commands_page_1", 123, 456, {} as never);
    expect(result).toBe(false);
  });

  it("returns true for noop callbacks", async () => {
    const result = await handleDashboardCallback("d:sessions:noop", 123, 456, {} as never);
    expect(result).toBe(true);
  });
});
