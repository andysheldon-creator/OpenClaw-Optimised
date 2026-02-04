import { describe, expect, it } from "vitest";
import { createRipgrepTool } from "./ripgrep-tool.js";

describe("ripgrep-tool", () => {
  const tool = createRipgrepTool({ workspaceDir: process.cwd() });

  it("has correct metadata", () => {
    expect(tool.name).toBe("ripgrep");
    expect(tool.label).toBe("Ripgrep");
    expect(tool.description).toContain("ripgrep");
    expect(tool.parameters).toBeDefined();
  });

  it("requires pattern parameter", async () => {
    const result = await tool.execute("test-1", {});
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toContain("pattern");
  });

  it("searches for a known pattern in this project", async () => {
    const result = await tool.execute("test-2", {
      pattern: "createRipgrepTool",
      path: "src/agents/tools",
      glob: "*.ts",
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
    expect(parsed.matches).toContain("createRipgrepTool");
  });

  it("returns zero matches for a nonsense pattern", async () => {
    // Search only non-test .ts files to avoid matching this very file
    const result = await tool.execute("test-3", {
      pattern: "xyzzy_absolutely_nonexistent_string_42",
      path: "src/agents/tools",
      glob: "!*.test.ts",
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBe(0);
    expect(parsed.note).toContain("No matches");
  });

  it("supports case-insensitive search", async () => {
    const result = await tool.execute("test-4", {
      pattern: "createripgreptool", // lowercase
      path: "src/agents/tools",
      glob: "ripgrep-tool.ts",
      ignore_case: true,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
  });

  it("supports fixed string search", async () => {
    const result = await tool.execute("test-5", {
      pattern: "Type.Object({",
      path: "src/agents/tools",
      glob: "ripgrep-tool.ts",
      fixed_strings: true,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
  });

  it("supports file type filter", async () => {
    const result = await tool.execute("test-6", {
      pattern: "import",
      path: "src/agents/tools",
      file_type: "ts",
      max_results: 5,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
    // max_results truncates output to 5 lines
    expect(parsed.match_count).toBeLessThanOrEqual(5);
    // Total matches should be reported when truncated
    if (parsed.truncated) {
      expect(parsed.total_matches).toBeGreaterThan(5);
    }
  });

  it("supports files_with_matches mode", async () => {
    const result = await tool.execute("test-7", {
      pattern: "import",
      path: "src/agents/tools",
      file_type: "ts",
      files_with_matches: true,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
    // Each line should be a filename, not a match line
    const lines = parsed.matches.split("\n");
    for (const line of lines) {
      expect(line).toMatch(/\.ts$/);
    }
  });

  it("supports count_only mode", async () => {
    const result = await tool.execute("test-8", {
      pattern: "import",
      path: "src/agents/tools",
      glob: "ripgrep-tool.ts",
      count_only: true,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
    // Count output is "filename:count"
    expect(parsed.matches).toMatch(/:\d+$/);
  });

  it("supports context lines", async () => {
    const result = await tool.execute("test-9", {
      pattern: "createRipgrepTool",
      path: "src/agents/tools",
      glob: "ripgrep-tool.ts",
      context_lines: 2,
      max_results: 3,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    // Context lines produce separator lines (--)
    expect(parsed.matches).toBeDefined();
  });

  it("supports multiple glob patterns via comma", async () => {
    const result = await tool.execute("test-10", {
      pattern: "export",
      path: "src/agents/tools",
      glob: "*.ts,!*.test.ts",
      max_results: 5,
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.match_count).toBeGreaterThan(0);
    // Should not include test files
    expect(parsed.matches).not.toContain(".test.ts");
  });

  it("handles invalid regex gracefully", async () => {
    const result = await tool.execute("test-11", {
      pattern: "[invalid(regex",
      path: "src/agents/tools",
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toBeDefined();
  });

  it("handles non-existent path gracefully", async () => {
    const result = await tool.execute("test-12", {
      pattern: "test",
      path: "/nonexistent/path/that/does/not/exist",
    });
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    // rg returns exit code 2 for bad paths
    expect(parsed.error || parsed.match_count === 0).toBeTruthy();
  });
});
