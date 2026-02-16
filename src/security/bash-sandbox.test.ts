/**
 * Tests for FB-012: Command Sandboxing for Bash Tool
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

const {
  extractPrimaryCommand,
  extractAllCommands,
  checkPathRestriction,
  evaluateCommand,
  getSandboxConfig,
} = await import("./bash-sandbox.js");

// ─── extractPrimaryCommand ────────────────────────────────────────────────────

describe("extractPrimaryCommand", () => {
  it("extracts simple command", () => {
    expect(extractPrimaryCommand("ls -la")).toBe("ls");
  });

  it("strips sudo prefix", () => {
    expect(extractPrimaryCommand("sudo rm -rf /tmp")).toBe("rm");
  });

  it("strips env prefix", () => {
    expect(extractPrimaryCommand("env NODE_ENV=production node app.js")).toBe("node");
  });

  it("strips environment variable assignments", () => {
    expect(extractPrimaryCommand("FOO=bar BAZ=qux python script.py")).toBe("python");
  });

  it("handles full paths", () => {
    expect(extractPrimaryCommand("/usr/bin/git status")).toBe("git");
  });

  it("handles empty command", () => {
    expect(extractPrimaryCommand("")).toBe("");
  });

  it("handles pipe — gets first command", () => {
    expect(extractPrimaryCommand("cat file.txt | grep foo")).toBe("cat");
  });
});

// ─── extractAllCommands ───────────────────────────────────────────────────────

describe("extractAllCommands", () => {
  it("extracts single command", () => {
    expect(extractAllCommands("ls -la")).toEqual(["ls"]);
  });

  it("extracts piped commands", () => {
    const cmds = extractAllCommands("cat file | grep foo | sort | uniq");
    expect(cmds).toContain("cat");
    expect(cmds).toContain("grep");
    expect(cmds).toContain("sort");
    expect(cmds).toContain("uniq");
  });

  it("extracts chained commands (&&)", () => {
    const cmds = extractAllCommands("npm install && npm run build");
    expect(cmds).toContain("npm");
  });

  it("extracts semicolon-separated commands", () => {
    const cmds = extractAllCommands("echo hello; ls; pwd");
    expect(cmds).toContain("echo");
    expect(cmds).toContain("ls");
    expect(cmds).toContain("pwd");
  });

  it("extracts from subshell", () => {
    const cmds = extractAllCommands("echo $(whoami)");
    expect(cmds).toContain("echo");
    expect(cmds).toContain("whoami");
  });
});

// ─── checkPathRestriction ─────────────────────────────────────────────────────

describe("checkPathRestriction", () => {
  it("allows paths within workspace", () => {
    const result = checkPathRestriction("cat /home/user/project/file.txt", "/home/user/project");
    expect(result.allowed).toBe(true);
  });

  it("allows /dev/null", () => {
    const result = checkPathRestriction("echo foo > /dev/null", "/workspace");
    expect(result.allowed).toBe(true);
  });

  it("allows /tmp paths", () => {
    const result = checkPathRestriction("cp file /tmp/backup", "/workspace");
    expect(result.allowed).toBe(true);
  });

  it("blocks /etc paths", () => {
    const result = checkPathRestriction("cat /etc/passwd", "/workspace");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("/etc/passwd");
  });

  it("blocks /var paths", () => {
    const result = checkPathRestriction("ls /var/log/syslog", "/workspace");
    expect(result.allowed).toBe(false);
  });
});

// ─── evaluateCommand ──────────────────────────────────────────────────────────

describe("evaluateCommand", () => {
  // Standard mode tests
  describe("standard mode", () => {
    const config = getSandboxConfig({ mode: "standard" });

    it("allows basic safe commands", () => {
      expect(evaluateCommand("ls -la", config).allowed).toBe(true);
      expect(evaluateCommand("cat file.txt", config).allowed).toBe(true);
      expect(evaluateCommand("echo hello", config).allowed).toBe(true);
      expect(evaluateCommand("grep 'pattern' file", config).allowed).toBe(true);
    });

    it("allows dev tool commands", () => {
      expect(evaluateCommand("git status", config).allowed).toBe(true);
      expect(evaluateCommand("node app.js", config).allowed).toBe(true);
      expect(evaluateCommand("tsc --noEmit", config).allowed).toBe(true);
      expect(evaluateCommand("npx vitest run", config).allowed).toBe(true);
    });

    it("allows package managers", () => {
      expect(evaluateCommand("npm install", config).allowed).toBe(true);
      expect(evaluateCommand("pnpm build", config).allowed).toBe(true);
    });

    it("allows network commands", () => {
      expect(evaluateCommand("curl https://api.example.com", config).allowed).toBe(true);
    });

    it("blocks dangerous system commands", () => {
      expect(evaluateCommand("mkfs.ext4 /dev/sda1", config).allowed).toBe(false);
      expect(evaluateCommand("systemctl stop nginx", config).allowed).toBe(false);
      expect(evaluateCommand("passwd root", config).allowed).toBe(false);
      expect(evaluateCommand("iptables -F", config).allowed).toBe(false);
      expect(evaluateCommand("crontab -e", config).allowed).toBe(false);
    });

    it("blocks unknown commands", () => {
      const result = evaluateCommand("some_weird_binary --flag", config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allowed commands list");
    });

    it("blocks system commands in pipe chains", () => {
      const result = evaluateCommand("echo test | systemctl restart nginx", config);
      expect(result.allowed).toBe(false);
    });

    it("blocks sudo escalation to blocked commands", () => {
      const result = evaluateCommand("sudo systemctl stop sshd", config);
      expect(result.allowed).toBe(false);
    });
  });

  // Strict mode tests
  describe("strict mode", () => {
    const config = getSandboxConfig({
      mode: "strict",
      workspaceDir: "/home/user/project",
    });

    it("blocks dev tool commands in strict mode", () => {
      expect(evaluateCommand("node app.js", config).allowed).toBe(false);
      expect(evaluateCommand("git status", config).allowed).toBe(false);
    });

    it("allows always-allowed commands", () => {
      expect(evaluateCommand("ls -la", config).allowed).toBe(true);
      expect(evaluateCommand("cat file.txt", config).allowed).toBe(true);
    });

    it("enforces path restrictions", () => {
      const result = evaluateCommand("cat /etc/hosts", config);
      expect(result.allowed).toBe(false);
    });
  });

  // Permissive mode tests
  describe("permissive mode", () => {
    const config = getSandboxConfig({ mode: "permissive" });

    it("allows unknown commands", () => {
      expect(evaluateCommand("custom_tool --arg", config).allowed).toBe(true);
    });

    it("still blocks always-blocked commands", () => {
      expect(evaluateCommand("mkfs.ext4 /dev/sda1", config).allowed).toBe(false);
      expect(evaluateCommand("iptables -F", config).allowed).toBe(false);
    });
  });

  // Disabled mode
  describe("disabled mode", () => {
    const config = getSandboxConfig({ mode: "disabled" });

    it("allows everything", () => {
      expect(evaluateCommand("mkfs.ext4 /dev/sda1", config).allowed).toBe(true);
      expect(evaluateCommand("rm -rf /", config).allowed).toBe(true);
    });
  });

  // Config overrides
  describe("config overrides", () => {
    it("respects extraAllowedCommands", () => {
      const config = getSandboxConfig({
        mode: "standard",
        extraAllowedCommands: ["my_custom_tool"],
      });
      expect(evaluateCommand("my_custom_tool --arg", config).allowed).toBe(true);
    });

    it("respects extraBlockedCommands", () => {
      const config = getSandboxConfig({
        mode: "standard",
        extraBlockedCommands: ["git"],
      });
      expect(evaluateCommand("git push", config).allowed).toBe(false);
    });

    it("disables network when allowNetwork is false", () => {
      const config = getSandboxConfig({
        mode: "standard",
        allowNetwork: false,
      });
      expect(evaluateCommand("curl http://example.com", config).allowed).toBe(false);
    });

    it("disables package managers when allowPackageManagers is false", () => {
      const config = getSandboxConfig({
        mode: "standard",
        allowPackageManagers: false,
      });
      expect(evaluateCommand("npm install express", config).allowed).toBe(false);
    });
  });
});
