import { describe, expect, it } from "vitest";
import { buildNodeShellCommand, wrapScriptCommand } from "./node-shell.js";

describe("buildNodeShellCommand", () => {
  it("uses cmd.exe for win32", () => {
    expect(buildNodeShellCommand("echo hi", "win32")).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
  });

  it("uses cmd.exe for windows labels", () => {
    expect(buildNodeShellCommand("echo hi", "windows")).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
    expect(buildNodeShellCommand("echo hi", "Windows 11")).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      "echo hi",
    ]);
  });

  it("uses /bin/sh for darwin", () => {
    expect(buildNodeShellCommand("echo hi", "darwin")).toEqual(["/bin/sh", "-lc", "echo hi"]);
  });

  it("uses /bin/sh when platform missing", () => {
    expect(buildNodeShellCommand("echo hi")).toEqual(["/bin/sh", "-lc", "echo hi"]);
  });

  it("wraps shebang-prefixed scripts in a heredoc", () => {
    const script = "#!/usr/bin/env python3\nimport os\nprint(os.getcwd())";
    const result = buildNodeShellCommand(script, "darwin");
    expect(result[0]).toBe("/bin/sh");
    expect(result[1]).toBe("-lc");
    expect(result[2]).toContain("/usr/bin/env python3 <<'OPENCLAW_SCRIPT_EOF'");
    expect(result[2]).toContain("import os");
    expect(result[2]).toContain("OPENCLAW_SCRIPT_EOF");
  });
});

describe("wrapScriptCommand", () => {
  it("passes through regular shell commands unchanged", () => {
    expect(wrapScriptCommand("echo hello")).toBe("echo hello");
    expect(wrapScriptCommand("python3 script.py")).toBe("python3 script.py");
    expect(wrapScriptCommand('python3 -c "import os; print(os.getcwd())"')).toBe(
      'python3 -c "import os; print(os.getcwd())"',
    );
  });

  it("wraps Python shebang scripts in a heredoc", () => {
    const script = "#!/usr/bin/env python3\nimport os\nprint(os.getcwd())";
    const result = wrapScriptCommand(script);
    expect(result).toBe(
      "/usr/bin/env python3 <<'OPENCLAW_SCRIPT_EOF'\nimport os\nprint(os.getcwd())\nOPENCLAW_SCRIPT_EOF",
    );
  });

  it("wraps scripts with absolute interpreter paths", () => {
    const script = "#!/usr/bin/python3\nimport sys\nprint(sys.version)";
    const result = wrapScriptCommand(script);
    expect(result).toContain("/usr/bin/python3 <<'OPENCLAW_SCRIPT_EOF'");
    expect(result).toContain("import sys");
    expect(result).toEndWith("OPENCLAW_SCRIPT_EOF");
  });

  it("wraps Ruby shebang scripts", () => {
    const script = '#!/usr/bin/env ruby\nputs "hello"';
    const result = wrapScriptCommand(script);
    expect(result).toContain("/usr/bin/env ruby <<'OPENCLAW_SCRIPT_EOF'");
    expect(result).toContain('puts "hello"');
  });

  it("wraps Node.js shebang scripts", () => {
    const script = '#!/usr/bin/env node\nconsole.log("hello")';
    const result = wrapScriptCommand(script);
    expect(result).toContain("/usr/bin/env node <<'OPENCLAW_SCRIPT_EOF'");
    expect(result).toContain('console.log("hello")');
  });

  it("handles shebang-only commands (no body)", () => {
    expect(wrapScriptCommand("#!/usr/bin/env python3")).toBe("#!/usr/bin/env python3");
  });

  it("handles shebang with empty body", () => {
    expect(wrapScriptCommand("#!/usr/bin/env python3\n")).toBe("#!/usr/bin/env python3\n");
    expect(wrapScriptCommand("#!/usr/bin/env python3\n  \n")).toBe(
      "#!/usr/bin/env python3\n  \n",
    );
  });

  it("handles \\r\\n line endings in shebang line", () => {
    const script = "#!/usr/bin/env python3\r\nimport os\nprint(os.getcwd())";
    const result = wrapScriptCommand(script);
    expect(result).toContain("/usr/bin/env python3 <<'OPENCLAW_SCRIPT_EOF'");
    expect(result).toContain("import os");
  });

  it("preserves leading whitespace before shebang passthrough", () => {
    const regular = "  echo hello";
    expect(wrapScriptCommand(regular)).toBe("  echo hello");
  });

  it("handles shebang with leading whitespace", () => {
    const script = "  #!/usr/bin/env python3\nimport os\nprint(os.getcwd())";
    const result = wrapScriptCommand(script);
    expect(result).toContain("/usr/bin/env python3 <<'OPENCLAW_SCRIPT_EOF'");
  });

  it("does not transform commands starting with # but not #!", () => {
    expect(wrapScriptCommand("# comment\necho hello")).toBe("# comment\necho hello");
  });
});
