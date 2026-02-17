/**
 * Tests for FB-014: Per-Tool Permission Configuration
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

const {
  checkToolPermission,
  filterToolsByPermission,
  getToolPermissionConfig,
} = await import("./tool-permissions.js");

describe("FB-014: Per-Tool Permission Configuration", () => {
  describe("checkToolPermission", () => {
    it("allows user source to use any tool", () => {
      const result = checkToolPermission("bash", "user");
      expect(result.allowed).toBe(true);
      expect(result.permission).toBe("full");
    });

    it("allows system source to use any tool", () => {
      const result = checkToolPermission("discord", "system");
      expect(result.allowed).toBe(true);
    });

    it("allows tool source to use any tool", () => {
      const result = checkToolPermission("bash", "tool");
      expect(result.allowed).toBe(true);
    });

    it("blocks web source from bash", () => {
      const result = checkToolPermission("bash", "web");
      expect(result.allowed).toBe(false);
      expect(result.permission).toBe("none");
    });

    it("blocks web source from process", () => {
      const result = checkToolPermission("process", "web");
      expect(result.allowed).toBe(false);
    });

    it("blocks web source from discord", () => {
      const result = checkToolPermission("discord", "web");
      expect(result.allowed).toBe(false);
    });

    it("allows web source to read files", () => {
      const result = checkToolPermission("read", "web");
      expect(result.allowed).toBe(true);
      expect(result.permission).toBe("full");
    });

    it("allows web source to glob/grep", () => {
      expect(checkToolPermission("glob", "web").allowed).toBe(true);
      expect(checkToolPermission("grep", "web").allowed).toBe(true);
    });

    it("blocks unknown source from bash", () => {
      const result = checkToolPermission("bash", "unknown");
      expect(result.allowed).toBe(false);
    });

    it("blocks skill source from discord", () => {
      const result = checkToolPermission("discord", "skill");
      expect(result.allowed).toBe(false);
    });

    it("allows skill source to use bash", () => {
      const result = checkToolPermission("bash", "skill");
      expect(result.allowed).toBe(true);
    });

    it("returns matched rule for exact matches", () => {
      const result = checkToolPermission("bash", "web");
      expect(result.matchedRule).toBeDefined();
      expect(result.matchedRule?.tool).toBe("bash");
    });

    it("returns matched rule for wildcard matches", () => {
      const result = checkToolPermission("some-random-tool", "user");
      expect(result.matchedRule).toBeDefined();
      expect(result.matchedRule?.tool).toBe("*");
    });

    it("falls through to default when no rule matches", () => {
      // Unrecognised tool + unrecognised-in-rules source combo
      const result = checkToolPermission("custom-tool", "web");
      expect(result.allowed).toBe(true); // default is "full"
      expect(result.matchedRule).toBeUndefined();
    });

    it("allows everything when disabled", () => {
      const config = getToolPermissionConfig();
      const disabledConfig = { ...config, enabled: false };
      const result = checkToolPermission("bash", "web", disabledConfig);
      expect(result.allowed).toBe(true);
      expect(result.permission).toBe("full");
    });
  });

  describe("filterToolsByPermission", () => {
    const tools = [
      { name: "read" },
      { name: "glob" },
      { name: "bash" },
      { name: "discord" },
      { name: "process" },
    ];

    it("returns all tools for user source", () => {
      const result = filterToolsByPermission(tools, "user");
      expect(result).toHaveLength(5);
    });

    it("filters bash/process/discord for web source", () => {
      const result = filterToolsByPermission(tools, "web");
      const names = result.map((t) => t.name);
      expect(names).toContain("read");
      expect(names).toContain("glob");
      expect(names).not.toContain("bash");
      expect(names).not.toContain("process");
      expect(names).not.toContain("discord");
    });

    it("filters discord for skill source", () => {
      const result = filterToolsByPermission(tools, "skill");
      const names = result.map((t) => t.name);
      expect(names).toContain("bash");
      expect(names).not.toContain("discord");
    });

    it("returns all tools when disabled", () => {
      const result = filterToolsByPermission(tools, "web", {
        enabled: false,
      });
      expect(result).toHaveLength(5);
    });

    it("handles empty tool list", () => {
      expect(filterToolsByPermission([], "web")).toEqual([]);
    });
  });

  describe("getToolPermissionConfig", () => {
    it("returns defaults without overrides", () => {
      const config = getToolPermissionConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultPermission).toBe("full");
      expect(config.rules.length).toBeGreaterThan(0);
    });

    it("merges custom rules before defaults", () => {
      const customRule = {
        tool: "custom-tool",
        sources: ["web" as const],
        permission: "none" as const,
      };
      const config = getToolPermissionConfig({ rules: [customRule] });
      // Custom rule should be first
      expect(config.rules[0]).toEqual(customRule);
      // Default rules should still exist
      expect(config.rules.length).toBeGreaterThan(1);
    });

    it("allows overriding enabled flag", () => {
      const config = getToolPermissionConfig({ enabled: false });
      expect(config.enabled).toBe(false);
    });
  });
});
