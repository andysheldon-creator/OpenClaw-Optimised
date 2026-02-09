import { describe, it, expect } from "vitest";
import {
  detectPlatform,
  formatMessageContent,
  adaptMarkdownForPlatform,
  getPlatformCapabilities,
} from "./message-formatter.js";

describe("detectPlatform", () => {
  it("detects slack", () => expect(detectPlatform("slack")).toBe("slack"));
  it("detects discord", () => expect(detectPlatform("discord")).toBe("discord"));
  it("detects telegram", () => expect(detectPlatform("telegram")).toBe("telegram"));
  it("detects whatsapp", () => expect(detectPlatform("whatsapp")).toBe("whatsapp"));
  it("returns unknown for null", () => expect(detectPlatform(null)).toBe("unknown"));
});

describe("formatMessageContent", () => {
  const table = {
    headers: ["Name", "Score"],
    rows: [
      ["Alice", "95"],
      ["Bob", "87"],
    ],
  };

  it("slack renders markdown table", () => {
    const result = formatMessageContent({ table }, "slack");
    expect(result).toContain("| Name | Score |");
  });

  it("discord renders bullet list for tables", () => {
    const result = formatMessageContent({ table }, "discord");
    expect(result).not.toContain("| Name |");
    expect(result).toContain("**Name**: Alice");
  });

  it("whatsapp uses CAPS", () => {
    const result = formatMessageContent({ heading: "Results", emphasis: "important" }, "whatsapp");
    expect(result).toContain("RESULTS");
    expect(result).toContain("IMPORTANT");
  });

  it("telegram uses bold for headings", () => {
    expect(formatMessageContent({ heading: "Summary" }, "telegram")).toBe("**Summary**");
  });
});

describe("adaptMarkdownForPlatform", () => {
  const md =
    "## Report\n\n| Name | Score |\n| --- | --- |\n| Alice | 95 |\n\nThis is **important**.";

  it("slack keeps tables, converts headers to bold", () => {
    const result = adaptMarkdownForPlatform(md, "slack");
    expect(result).toContain("| Name | Score |");
    expect(result).toContain("**Report**");
  });

  it("discord converts tables to bullets", () => {
    const result = adaptMarkdownForPlatform(md, "discord");
    expect(result).not.toContain("| Name | Score |");
    expect(result).toContain("**Name**: Alice");
  });

  it("whatsapp strips all markdown", () => {
    const result = adaptMarkdownForPlatform(md, "whatsapp");
    expect(result).not.toContain("**");
    expect(result).toContain("REPORT");
    expect(result).toContain("IMPORTANT");
  });
});

describe("getPlatformCapabilities", () => {
  it("slack supports tables and threads", () => {
    const caps = getPlatformCapabilities("slack");
    expect(caps.tables).toBe(true);
    expect(caps.threads).toBe(true);
  });

  it("whatsapp supports nothing", () => {
    const caps = getPlatformCapabilities("whatsapp");
    expect(caps.tables).toBe(false);
    expect(caps.buttons).toBe(false);
  });
});
