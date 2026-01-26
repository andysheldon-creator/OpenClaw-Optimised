import { describe, expect, it, vi } from "vitest";

import { createContextCommands, createDefaultCommands } from "./command-palette";

describe("createContextCommands", () => {
  const noop = () => {};

  it("returns empty array for tabs without context commands", () => {
    expect(createContextCommands("landing", {})).toEqual([]);
    expect(createContextCommands("overview", {})).toEqual([]);
    expect(createContextCommands("agents", {})).toEqual([]);
    expect(createContextCommands("instances", {})).toEqual([]);
    expect(createContextCommands("skills", {})).toEqual([]);
    expect(createContextCommands("debug", {})).toEqual([]);
  });

  it("returns chat-specific commands for chat tab", () => {
    const cmds = createContextCommands("chat", {
      newSession: noop,
      clearChat: noop,
      abortChat: noop,
    });

    expect(cmds).toHaveLength(3);
    expect(cmds.every((c) => c.category === "Current View")).toBe(true);
    expect(cmds.map((c) => c.id)).toEqual([
      "ctx-new-session",
      "ctx-clear-chat",
      "ctx-abort-chat",
    ]);
  });

  it("omits chat commands when callbacks are not provided", () => {
    const cmds = createContextCommands("chat", { newSession: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-new-session");
  });

  it("returns cron commands for cron tab", () => {
    const cmds = createContextCommands("cron", {
      addCronJob: noop,
      refreshCron: noop,
    });

    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.id)).toEqual(["ctx-add-cron", "ctx-refresh-cron"]);
  });

  it("returns overseer commands for overseer tab", () => {
    const cmds = createContextCommands("overseer", {
      createGoal: noop,
      refreshOverseer: noop,
    });

    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.id)).toEqual(["ctx-create-goal", "ctx-refresh-overseer"]);
  });

  it("returns config commands for config tab", () => {
    const cmds = createContextCommands("config", { saveConfig: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-save-config");
  });

  it("returns nodes commands for nodes tab", () => {
    const cmds = createContextCommands("nodes", { refreshNodes: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-refresh-nodes");
  });

  it("returns logs commands for logs tab", () => {
    const cmds = createContextCommands("logs", { clearLogs: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-clear-logs");
  });

  it("returns channels commands for channels tab", () => {
    const cmds = createContextCommands("channels", { refreshChannels: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-refresh-channels");
  });

  it("returns sessions commands for sessions tab", () => {
    const cmds = createContextCommands("sessions", { refreshSessions: noop });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("ctx-refresh-sessions");
  });

  it("calls the provided action when command is invoked", () => {
    const action = vi.fn();
    const cmds = createContextCommands("chat", { newSession: action });
    cmds[0].action();
    expect(action).toHaveBeenCalledOnce();
  });
});

describe("createDefaultCommands", () => {
  it("creates navigation and action commands", () => {
    const setTab = vi.fn();
    const refresh = vi.fn();
    const newSession = vi.fn();
    const toggleTheme = vi.fn();

    const cmds = createDefaultCommands(setTab, refresh, newSession, toggleTheme);

    // Should have navigation + action commands
    expect(cmds.length).toBeGreaterThan(10);

    const navCmds = cmds.filter((c) => c.category === "Navigation");
    const actionCmds = cmds.filter((c) => c.category === "Actions");

    expect(navCmds.length).toBeGreaterThan(0);
    expect(actionCmds.length).toBeGreaterThan(0);

    // Test navigation command triggers setTab
    const chatCmd = cmds.find((c) => c.id === "nav-chat");
    expect(chatCmd).toBeTruthy();
    chatCmd!.action();
    expect(setTab).toHaveBeenCalledWith("chat");

    // Test refresh command
    const refreshCmd = cmds.find((c) => c.id === "action-refresh");
    expect(refreshCmd).toBeTruthy();
    refreshCmd!.action();
    expect(refresh).toHaveBeenCalled();
  });
});
