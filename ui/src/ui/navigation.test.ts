import { describe, expect, it } from "vitest";
import {
  TAB_GROUPS,
  SHORT_TAB_GROUPS,
  isShortMenuMode,
  getTabGroups,
  iconForTab,
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  subtitleForTab,
  tabFromPath,
  titleForTab,
  type Tab,
  type MenuMode,
} from "./navigation.ts";

/** All valid tab identifiers derived from TAB_GROUPS */
const ALL_TABS: Tab[] = TAB_GROUPS.flatMap((group) => group.tabs) as Tab[];

describe("iconForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const icon = iconForTab(tab);
      expect(icon).toBeTruthy();
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });

  it("returns stable icons for known tabs", () => {
    expect(iconForTab("chat")).toBe("messageSquare");
    expect(iconForTab("overview")).toBe("barChart");
    expect(iconForTab("channels")).toBe("link");
    expect(iconForTab("instances")).toBe("radio");
    expect(iconForTab("sessions")).toBe("fileText");
    expect(iconForTab("cron")).toBe("loader");
    expect(iconForTab("skills")).toBe("zap");
    expect(iconForTab("nodes")).toBe("monitor");
    expect(iconForTab("config")).toBe("settings");
    expect(iconForTab("debug")).toBe("bug");
    expect(iconForTab("logs")).toBe("scrollText");
  });

  it("returns a fallback icon for unknown tab", () => {
    // TypeScript won't allow this normally, but runtime could receive unexpected values
    const unknownTab = "unknown" as Tab;
    expect(iconForTab(unknownTab)).toBe("folder");
  });
});

describe("titleForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const title = titleForTab(tab);
      expect(title).toBeTruthy();
      expect(typeof title).toBe("string");
    }
  });

  it("returns expected titles", () => {
    expect(titleForTab("chat")).toBe("Chat");
    expect(titleForTab("overview")).toBe("Overview");
    expect(titleForTab("cron")).toBe("Cron Jobs");
  });
});

describe("subtitleForTab", () => {
  it("returns a string for every tab", () => {
    for (const tab of ALL_TABS) {
      const subtitle = subtitleForTab(tab);
      expect(typeof subtitle).toBe("string");
    }
  });

  it("returns descriptive subtitles", () => {
    expect(subtitleForTab("chat")).toContain("chat session");
    expect(subtitleForTab("config")).toContain("openclaw.json");
  });
});

describe("normalizeBasePath", () => {
  it("returns empty string for falsy input", () => {
    expect(normalizeBasePath("")).toBe("");
  });

  it("adds leading slash if missing", () => {
    expect(normalizeBasePath("ui")).toBe("/ui");
  });

  it("removes trailing slash", () => {
    expect(normalizeBasePath("/ui/")).toBe("/ui");
  });

  it("returns empty string for root path", () => {
    expect(normalizeBasePath("/")).toBe("");
  });

  it("handles nested paths", () => {
    expect(normalizeBasePath("/apps/openclaw")).toBe("/apps/openclaw");
  });
});

describe("normalizePath", () => {
  it("returns / for falsy input", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("adds leading slash if missing", () => {
    expect(normalizePath("chat")).toBe("/chat");
  });

  it("removes trailing slash except for root", () => {
    expect(normalizePath("/chat/")).toBe("/chat");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("pathForTab", () => {
  it("returns correct path without base", () => {
    expect(pathForTab("chat")).toBe("/chat");
    expect(pathForTab("overview")).toBe("/overview");
  });

  it("prepends base path", () => {
    expect(pathForTab("chat", "/ui")).toBe("/ui/chat");
    expect(pathForTab("sessions", "/apps/openclaw")).toBe("/apps/openclaw/sessions");
  });
});

describe("tabFromPath", () => {
  it("returns tab for valid path", () => {
    expect(tabFromPath("/chat")).toBe("chat");
    expect(tabFromPath("/overview")).toBe("overview");
    expect(tabFromPath("/sessions")).toBe("sessions");
  });

  it("returns chat for root path", () => {
    expect(tabFromPath("/")).toBe("chat");
  });

  it("handles base paths", () => {
    expect(tabFromPath("/ui/chat", "/ui")).toBe("chat");
    expect(tabFromPath("/apps/openclaw/sessions", "/apps/openclaw")).toBe("sessions");
  });

  it("returns null for unknown path", () => {
    expect(tabFromPath("/unknown")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(tabFromPath("/CHAT")).toBe("chat");
    expect(tabFromPath("/Overview")).toBe("overview");
  });
});

describe("inferBasePathFromPathname", () => {
  it("returns empty string for root", () => {
    expect(inferBasePathFromPathname("/")).toBe("");
  });

  it("returns empty string for direct tab path", () => {
    expect(inferBasePathFromPathname("/chat")).toBe("");
    expect(inferBasePathFromPathname("/overview")).toBe("");
  });

  it("infers base path from nested paths", () => {
    expect(inferBasePathFromPathname("/ui/chat")).toBe("/ui");
    expect(inferBasePathFromPathname("/apps/openclaw/sessions")).toBe("/apps/openclaw");
  });

  it("handles index.html suffix", () => {
    expect(inferBasePathFromPathname("/index.html")).toBe("");
    expect(inferBasePathFromPathname("/ui/index.html")).toBe("/ui");
  });
});

describe("TAB_GROUPS", () => {
  it("contains all expected groups", () => {
    const labels = TAB_GROUPS.map((g) => g.label);
    expect(labels).toContain("Chat");
    expect(labels).toContain("Control");
    expect(labels).toContain("Agent");
    expect(labels).toContain("Settings");
  });

  it("all tabs are unique", () => {
    const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
    const uniqueTabs = new Set(allTabs);
    expect(uniqueTabs.size).toBe(allTabs.length);
  });
});

describe("SHORT_TAB_GROUPS", () => {
  it("contains only essential tabs: chat, config, debug", () => {
    const labels = SHORT_TAB_GROUPS.map((g) => g.label);
    expect(labels).toContain("Chat");
    expect(labels).toContain("Settings");
    expect(labels).toHaveLength(2);
  });

  it("includes chat tab in Chat group", () => {
    const chatGroup = SHORT_TAB_GROUPS.find((g) => g.label === "Chat");
    expect(chatGroup?.tabs).toContain("chat");
    expect(chatGroup?.tabs).toHaveLength(1);
  });

  it("includes config and debug tabs in Settings group", () => {
    const settingsGroup = SHORT_TAB_GROUPS.find((g) => g.label === "Settings");
    expect(settingsGroup?.tabs).toContain("config");
    expect(settingsGroup?.tabs).toContain("debug");
    expect(settingsGroup?.tabs).toHaveLength(2);
  });

  it("does not include non-essential tabs", () => {
    const allShortTabs = SHORT_TAB_GROUPS.flatMap((g) => g.tabs);
    expect(allShortTabs).not.toContain("agents");
    expect(allShortTabs).not.toContain("skills");
    expect(allShortTabs).not.toContain("nodes");
    expect(allShortTabs).not.toContain("overview");
    expect(allShortTabs).not.toContain("channels");
    expect(allShortTabs).not.toContain("sessions");
    expect(allShortTabs).not.toContain("usage");
    expect(allShortTabs).not.toContain("cron");
    expect(allShortTabs).not.toContain("logs");
  });
});

describe("isShortMenuMode", () => {
  it("returns false when VITE_SHORT_MENU is not set", () => {
    expect(isShortMenuMode({})).toBe(false);
  });

  it("returns true when VITE_SHORT_MENU is 'true' (string)", () => {
    expect(isShortMenuMode({ VITE_SHORT_MENU: "true" })).toBe(true);
  });

  it("returns true when VITE_SHORT_MENU is true (boolean)", () => {
    expect(isShortMenuMode({ VITE_SHORT_MENU: true })).toBe(true);
  });

  it("returns false when VITE_SHORT_MENU is 'false'", () => {
    expect(isShortMenuMode({ VITE_SHORT_MENU: "false" })).toBe(false);
  });

  it("returns false when VITE_SHORT_MENU is any other value", () => {
    expect(isShortMenuMode({ VITE_SHORT_MENU: "yes" })).toBe(false);
    expect(isShortMenuMode({ VITE_SHORT_MENU: "1" })).toBe(false);
    expect(isShortMenuMode({ VITE_SHORT_MENU: "" })).toBe(false);
  });

  it("uses import.meta.env when no env argument provided", () => {
    // Just verify it doesn't throw - the actual value depends on build config
    expect(() => isShortMenuMode()).not.toThrow();
  });
});

describe("getTabGroups", () => {
  it("returns TAB_GROUPS when short menu mode is disabled", () => {
    expect(getTabGroups({})).toBe(TAB_GROUPS);
  });

  it("returns SHORT_TAB_GROUPS when short menu mode is enabled", () => {
    expect(getTabGroups({ VITE_SHORT_MENU: "true" })).toBe(SHORT_TAB_GROUPS);
  });

  it("uses import.meta.env when no env argument provided", () => {
    // Just verify it doesn't throw - the actual value depends on build config
    expect(() => getTabGroups()).not.toThrow();
  });
});

describe("MenuMode type", () => {
  it("accepts valid menu mode values", () => {
    const full: MenuMode = "full";
    const short: MenuMode = "short";
    expect(full).toBe("full");
    expect(short).toBe("short");
  });
});
