import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { SlackAccountSchema } from "../../../config/zod-schema.providers-core.js";
import { buildHomeTabBlocks, formatUptime, resolveAgentModelDisplay } from "./home.js";

describe("formatUptime", () => {
  it("formats minutes only", () => {
    expect(formatUptime(5 * 60_000)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    expect(formatUptime(2 * 3600_000 + 15 * 60_000)).toBe("2h 15m");
  });

  it("formats days, hours, and minutes", () => {
    expect(formatUptime(3 * 86400_000 + 4 * 3600_000 + 30 * 60_000)).toBe("3d 4h 30m");
  });

  it("shows 0m for less than a minute", () => {
    expect(formatUptime(30_000)).toBe("0m");
  });
});

describe("resolveAgentModelDisplay", () => {
  it("returns agent model string", () => {
    expect(resolveAgentModelDisplay({ id: "a", model: "anthropic/claude-3" }, {})).toBe(
      "anthropic/claude-3",
    );
  });

  it("returns agent model primary from object", () => {
    expect(resolveAgentModelDisplay({ id: "a", model: { primary: "openai/gpt-5" } }, {})).toBe(
      "openai/gpt-5",
    );
  });

  it("falls back to agents.defaults.model.primary", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "fallback/model" } } },
    };
    expect(resolveAgentModelDisplay({ id: "a" }, cfg)).toBe("fallback/model");
  });

  it("returns dash when no model configured", () => {
    expect(resolveAgentModelDisplay(undefined, {})).toBe("—");
  });
});

describe("buildHomeTabBlocks", () => {
  it("returns blocks with header showing agent name", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "main", default: true, name: "TestBot" }] },
    };
    const blocks = buildHomeTabBlocks({ cfg });

    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { type: "plain_text", text: "TestBot" },
    });
  });

  it("falls back to ui.assistant.name when no agent name", () => {
    const cfg: OpenClawConfig = { ui: { assistant: { name: "MyAssistant" } } };
    const blocks = buildHomeTabBlocks({ cfg });

    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { type: "plain_text", text: "MyAssistant" },
    });
  });

  it("defaults to OpenClaw when no name configured", () => {
    const blocks = buildHomeTabBlocks({ botUserId: "U12345" });
    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { type: "plain_text", text: "OpenClaw" },
    });
  });

  it("shows status and version fields", () => {
    const blocks = buildHomeTabBlocks({ botUserId: "U12345" });
    const statusSection = blocks[1];
    const fieldsText = JSON.stringify(statusSection);
    expect(fieldsText).toContain("Online");
    expect(fieldsText).toContain("Version");
  });

  it("shows model and uptime fields", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "main", model: "anthropic/opus-4" }] },
    };
    const blocks = buildHomeTabBlocks({ cfg, uptimeMs: 7200_000 });
    const infoSection = blocks[2];
    const text = JSON.stringify(infoSection);
    expect(text).toContain("anthropic/opus-4");
    expect(text).toContain("2h 0m");
  });

  it("uses default /openclaw slash command when none provided", () => {
    const blocks = buildHomeTabBlocks({});
    const slashBlock = blocks.find(
      (b) =>
        b.type === "section" &&
        "text" in b &&
        (b.text as Record<string, string>)?.text?.includes("Slash Commands"),
    );
    expect(slashBlock).toBeDefined();
    const text =
      slashBlock && "text" in slashBlock
        ? ((slashBlock.text as Record<string, string>)?.text ?? "")
        : "";
    expect(text).toContain("`/openclaw`");
  });

  it("uses custom slash command when provided", () => {
    const blocks = buildHomeTabBlocks({ slashCommand: "/mybot" });
    const slashBlock = blocks.find(
      (b) =>
        b.type === "section" &&
        "text" in b &&
        (b.text as Record<string, string>)?.text?.includes("Slash Commands"),
    );
    expect(slashBlock).toBeDefined();
    const text =
      slashBlock && "text" in slashBlock
        ? ((slashBlock.text as Record<string, string>)?.text ?? "")
        : "";
    expect(text).toContain("`/mybot`");
    expect(text).not.toContain("/openclaw");
  });

  it("includes docs/github/community links in context block", () => {
    const blocks = buildHomeTabBlocks({});
    const contextBlock = blocks.find((b) => b.type === "context");
    expect(contextBlock).toBeDefined();
    const contextText = JSON.stringify(contextBlock);
    expect(contextText).toContain("docs.openclaw.ai");
    expect(contextText).toContain("github.com");
    expect(contextText).toContain("discord.com");
  });

  it("shows configured channels when present", () => {
    const cfg: OpenClawConfig = {
      channels: {
        slack: {
          channels: {
            C123ABC: { enabled: true },
            C456DEF: { enabled: true },
          },
        },
      },
    };
    const blocks = buildHomeTabBlocks({ cfg });
    const channelBlock = blocks.find(
      (b) =>
        b.type === "section" &&
        "text" in b &&
        (b.text as Record<string, string>)?.text?.includes("Channels"),
    );
    expect(channelBlock).toBeDefined();
    const text = (channelBlock as Record<string, Record<string, string>>)?.text?.text ?? "";
    expect(text).toContain("<#C123ABC>");
    expect(text).toContain("<#C456DEF>");
  });

  it("picks first agent as default when none marked default", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          { id: "alpha", name: "Alpha" },
          { id: "beta", name: "Beta" },
        ],
      },
    };
    const blocks = buildHomeTabBlocks({ cfg });
    expect(blocks[0]).toMatchObject({
      type: "header",
      text: { type: "plain_text", text: "Alpha" },
    });
  });

  it("does not include any auth tokens or dashboard links", () => {
    const blocks = buildHomeTabBlocks({});
    const fullText = JSON.stringify(blocks);
    expect(fullText).not.toContain("token");
    expect(fullText).not.toContain("Dashboard");
    expect(fullText).not.toContain("127.0.0.1");
  });
});

describe("Zod schema validation", () => {
  it("accepts homeTab config in SlackAccountSchema", () => {
    const result = SlackAccountSchema.safeParse({
      homeTab: { enabled: true },
    });
    expect(result.success).toBe(true);
  });

  it("accepts homeTab: false in actions config", () => {
    const result = SlackAccountSchema.safeParse({
      actions: { homeTab: false },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys in homeTab config", () => {
    const result = SlackAccountSchema.safeParse({
      homeTab: { enabled: true, unknownKey: "bad" },
    });
    expect(result.success).toBe(false);
  });
});
