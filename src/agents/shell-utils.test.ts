import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getShellConfig } from "./shell-utils.js";

const isWin = process.platform === "win32";

describe("getShellConfig", () => {
  const originalShell = process.env.SHELL;
  const originalPath = process.env.PATH;
  const tempDirs: string[] = [];

  const createTempBin = (files: string[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-shell-"));
    tempDirs.push(dir);
    for (const name of files) {
      const filePath = path.join(dir, name);
      fs.writeFileSync(filePath, "");
      fs.chmodSync(filePath, 0o755);
    }
    return dir;
  };

  beforeEach(() => {
    if (!isWin) {
      process.env.SHELL = "/usr/bin/fish";
    }
  });

  afterEach(() => {
    if (originalShell == null) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
    if (originalPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  if (isWin) {
    it("uses PowerShell on Windows", () => {
      const { shell } = getShellConfig();
      expect(shell.toLowerCase()).toContain("powershell");
    });
  }

  it("uses custom shell when override.shell is provided", () => {
    const customShell = isWin
      ? "d:\\Program Files\\Git\\bin\\bash.exe"
      : "/usr/local/bin/custom-bash";
    const { shell, args } = getShellConfig({ shell: customShell });
    expect(shell).toBe(customShell);
    expect(args).toEqual(["-c"]);
  });

  it("auto-detects args for bash-like shells", () => {
    const { args } = getShellConfig({ shell: "/usr/bin/bash" });
    expect(args).toEqual(["-c"]);
  });

  it("auto-detects args for powershell override", () => {
    const { args } = getShellConfig({
      shell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    });
    expect(args).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
  });

  it("auto-detects args for pwsh override", () => {
    const { args } = getShellConfig({ shell: "/usr/local/bin/pwsh" });
    expect(args).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
  });

  it("uses explicit shellArgs when provided", () => {
    const customArgs = ["-l", "-c"];
    const { shell, args } = getShellConfig({ shell: "/bin/bash", shellArgs: customArgs });
    expect(shell).toBe("/bin/bash");
    expect(args).toEqual(customArgs);
  });

  it("honors shellArgs override even when shell is not overridden", () => {
    const customArgs = ["-l", "-c"];
    const { shell, args } = getShellConfig({ shellArgs: customArgs });
    if (isWin) {
      expect(shell.toLowerCase()).toContain("powershell");
    } else {
      expect(shell).toMatch(/^\/|^sh$/);
    }
    expect(args).toEqual(customArgs);
  });

  it("falls back to platform default when override.shell is undefined", () => {
    const { shell } = getShellConfig({ shell: undefined });
    if (isWin) {
      expect(shell.toLowerCase()).toContain("powershell");
    } else {
      // Falls through to the normal logic — should be an absolute path or "sh"
      expect(shell).toMatch(/^\/|^sh$/);
    }
  });

  if (isWin) {
    return;
  }

  it("prefers bash when fish is default and bash is on PATH", () => {
    const binDir = createTempBin(["bash"]);
    process.env.PATH = binDir;
    const { shell } = getShellConfig();
    expect(shell).toBe(path.join(binDir, "bash"));
  });

  it("falls back to sh when fish is default and bash is missing", () => {
    const binDir = createTempBin(["sh"]);
    process.env.PATH = binDir;
    const { shell } = getShellConfig();
    expect(shell).toBe(path.join(binDir, "sh"));
  });

  it("falls back to env shell when fish is default and no sh is available", () => {
    process.env.PATH = "";
    const { shell } = getShellConfig();
    expect(shell).toBe("/usr/bin/fish");
  });

  it("uses sh when SHELL is unset", () => {
    delete process.env.SHELL;
    process.env.PATH = "";
    const { shell } = getShellConfig();
    expect(shell).toBe("sh");
  });
});

/**
 * Integration tests that actually spawn a process using the shell config
 * to verify the correct shell is used end-to-end.
 *
 * These cover the "Manual" test-plan items:
 *   - Configure tools.exec.shell to Git Bash on Windows and verify exec uses bash
 *   - Verify default behavior (no config) is unchanged on both Windows and Unix
 */
describe("getShellConfig integration — actual process spawn", () => {
  /**
   * Helper: spawn a command through the shell returned by getShellConfig and
   * return its trimmed stdout.
   */
  function execViaShellConfig(
    command: string,
    overrides?: { shell?: string; shellArgs?: string[] },
  ): string {
    const { shell, args } = getShellConfig(overrides);
    const output = execFileSync(shell, [...args, command], {
      encoding: "utf-8",
      timeout: 10_000,
      windowsHide: true,
    });
    return output.trim();
  }

  if (isWin) {
    // --- Windows-specific integration tests ---

    it("default (no config): exec uses PowerShell on Windows", () => {
      // $PSVersionTable is a PowerShell-only automatic variable.
      const output = execViaShellConfig("$PSVersionTable.PSVersion.Major");
      // Should be a numeric string like "5" (Windows PowerShell) or "7" (pwsh).
      expect(output).toMatch(/^\d+$/);
    });

    // Find a Git Bash binary on the system. Skip the test if unavailable.
    const gitBashCandidates = [
      "D:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    const gitBash = gitBashCandidates.find((p) => fs.existsSync(p));

    if (gitBash) {
      it("custom shell config: exec uses Git Bash when configured", () => {
        // echo $BASH_VERSION is a bash-only variable; PowerShell would
        // return an empty string or an error.
        const output = execViaShellConfig('echo "$BASH_VERSION"', {
          shell: gitBash,
        });
        expect(output.length).toBeGreaterThan(0);
        // The version string looks like "5.2.15(1)-release".
        expect(output).toMatch(/^\d+\.\d+/);
      });

      it("custom shell config: Unix-style commands work via Git Bash", () => {
        // 'uname' is available in Git Bash but not in PowerShell by default.
        const output = execViaShellConfig("uname -o", { shell: gitBash });
        // Git Bash on Windows reports "Msys" or "GNU/Linux" or similar.
        expect(output.length).toBeGreaterThan(0);
      });
    }
  } else {
    // --- Unix integration tests ---

    it("default (no config): exec uses a POSIX-compatible shell", () => {
      const output = execViaShellConfig("echo hello");
      expect(output).toBe("hello");
    });

    it("default (no config): shell is not PowerShell on Unix", () => {
      const { shell } = getShellConfig();
      const base = path.basename(shell).toLowerCase();
      expect(base).not.toContain("powershell");
      expect(base).not.toBe("pwsh");
    });
  }
});
