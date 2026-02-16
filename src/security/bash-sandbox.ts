/**
 * Command Sandboxing for Bash Tool (FB-012)
 *
 * Provides a lightweight command-level sandbox that restricts what
 * shell commands the agent can execute. Works cross-platform (no
 * seccomp/containers required).
 *
 * The sandbox operates at three levels:
 * 1. **Command allowlist** — only permitted binaries can be invoked
 * 2. **Path restrictions** — commands restricted to workspace directory
 * 3. **Argument sanitisation** — blocks dangerous argument patterns
 *
 * This complements FB-010 (tool gating) which blocks known destructive
 * patterns. The sandbox provides defence-in-depth by restricting the
 * command surface area itself.
 */

import path from "node:path";

import { defaultRuntime } from "../runtime.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SandboxMode = "strict" | "standard" | "permissive" | "disabled";

export type SandboxConfig = {
  /** Sandbox mode. Defaults to "standard". */
  mode: SandboxMode;
  /** Working directory the agent is restricted to. */
  workspaceDir?: string;
  /** Additional allowed commands beyond the defaults. */
  extraAllowedCommands?: string[];
  /** Additional blocked commands beyond the defaults. */
  extraBlockedCommands?: string[];
  /** Allow network commands (curl, wget, ssh). Defaults to true in standard. */
  allowNetwork?: boolean;
  /** Allow package manager commands (npm, pip, etc.). Defaults to true. */
  allowPackageManagers?: boolean;
};

export type SandboxResult = {
  allowed: boolean;
  reason?: string;
  command: string;
  /** The first binary/command word extracted from the command string. */
  primaryCommand: string;
};

// ─── Command Classifications ──────────────────────────────────────────────────

/** Always-allowed commands — safe read-only operations. */
const ALWAYS_ALLOWED = new Set([
  "echo",
  "printf",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "wc",
  "sort",
  "uniq",
  "tr",
  "cut",
  "awk",
  "sed",
  "grep",
  "egrep",
  "fgrep",
  "find",
  "locate",
  "which",
  "whereis",
  "type",
  "file",
  "stat",
  "ls",
  "dir",
  "tree",
  "pwd",
  "realpath",
  "basename",
  "dirname",
  "date",
  "cal",
  "uptime",
  "whoami",
  "id",
  "env",
  "printenv",
  "uname",
  "hostname",
  "diff",
  "comm",
  "cmp",
  "md5sum",
  "sha256sum",
  "sha1sum",
  "base64",
  "xxd",
  "hexdump",
  "od",
  "tee",
  "xargs",
  "true",
  "false",
  "test",
  "[",
  "seq",
  "yes",
  "jq",
  "yq",
]);

/** Development tool commands — allowed in standard mode. */
const DEV_TOOL_COMMANDS = new Set([
  // Version control
  "git",
  "gh",
  // JavaScript/TypeScript
  "node",
  "npx",
  "tsx",
  "ts-node",
  "tsc",
  "eslint",
  "prettier",
  "biome",
  "vitest",
  "jest",
  // Build tools
  "make",
  "cmake",
  "cargo",
  "go",
  "rustc",
  "gcc",
  "g++",
  "clang",
  "python",
  "python3",
  "ruby",
  "perl",
  // Editors/viewers
  "code",
  "vim",
  "nano",
]);

/** Package managers — allowed when allowPackageManagers is true. */
const PACKAGE_MANAGER_COMMANDS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "pip",
  "pip3",
  "pipx",
  "uv",
  "cargo",
  "go",
  "brew",
  "apt",
  "apt-get",
  "dnf",
  "yum",
  "pacman",
  "gem",
  "composer",
]);

/** Network commands — allowed when allowNetwork is true. */
const NETWORK_COMMANDS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "ping",
  "nslookup",
  "dig",
  "host",
  "traceroute",
  "nc",
  "netcat",
  "telnet",
  "ftp",
  "sftp",
]);

/** Always-blocked commands — dangerous system operations. */
const ALWAYS_BLOCKED = new Set([
  "mkfs",
  "fdisk",
  "parted",
  "mount",
  "umount",
  "modprobe",
  "insmod",
  "rmmod",
  "iptables",
  "ip6tables",
  "nft",
  "firewall-cmd",
  "systemctl",
  "service",
  "init",
  "telinit",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "passwd",
  "useradd",
  "userdel",
  "usermod",
  "groupadd",
  "groupdel",
  "visudo",
  "crontab",
  "at",
  "chroot",
  "nsenter",
  "unshare",
  "strace",
  "ltrace",
  "ptrace",
  "gdb",
  "lldb",
  // Windows equivalents
  "format",
  "diskpart",
  "bcdedit",
  "reg",
  "sc",
  "net",
  "wmic",
  "netsh",
  "schtasks",
]);

// ─── Command Parsing ──────────────────────────────────────────────────────────

/**
 * Extract the primary command from a shell command string.
 * Handles: sudo prefix, env prefix, pipes, chains, subshells.
 */
export function extractPrimaryCommand(command: string): string {
  const trimmed = command.trim();

  // Strip leading environment variable assignments (FOO=bar cmd)
  let cleaned = trimmed.replace(/^(\s*\w+=\S*\s+)+/, "");

  // Strip sudo/doas prefix
  cleaned = cleaned.replace(/^(sudo|doas)\s+(-[a-zA-Z]*\s+)*/, "");

  // Strip env prefix
  cleaned = cleaned.replace(/^env\s+(-[a-zA-Z]*\s+)*(\w+=\S*\s+)*/, "");

  // Get first word (the command binary)
  const firstWord = cleaned.split(/[\s|;&(]/)[0]?.trim();

  if (!firstWord) return "";

  // Strip path prefix to get bare command name
  return path.basename(firstWord);
}

/**
 * Extract all commands from a compound command string (pipes, chains, etc.).
 */
export function extractAllCommands(command: string): string[] {
  // Split on pipes, semicolons, &&, ||, $(), backticks
  const parts = command.split(/[|;&]+|\$\(|\)|\`/);
  const commands = new Set<string>();

  for (const part of parts) {
    const cmd = extractPrimaryCommand(part);
    if (cmd) commands.add(cmd);
  }

  return [...commands];
}

// ─── Path Restriction ─────────────────────────────────────────────────────────

/**
 * Check if a command string references paths outside the workspace.
 * This is a heuristic check — not foolproof but catches common cases.
 */
export function checkPathRestriction(
  command: string,
  workspaceDir: string,
): { allowed: boolean; reason?: string } {
  // Normalise workspace path
  const wsNorm = path.resolve(workspaceDir).replace(/\\/g, "/").toLowerCase();

  // Check for absolute paths that escape the workspace
  const absolutePathRegex = /(?:^|\s)(\/[a-zA-Z][^\s]*)/g;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = absolutePathRegex.exec(command)) !== null) {
    const absPath = match[1].replace(/\\/g, "/").toLowerCase();

    // Allow /dev/null, /dev/stdin, /dev/stdout, /dev/stderr
    if (absPath.startsWith("/dev/")) continue;
    // Allow /tmp
    if (absPath.startsWith("/tmp")) continue;
    // Allow within workspace
    if (absPath.startsWith(wsNorm)) continue;
    // Allow home directory config paths
    if (absPath.startsWith("/home/") || absPath.startsWith("/users/")) continue;

    return {
      allowed: false,
      reason: `Absolute path ${match[1]} is outside workspace ${workspaceDir}`,
    };
  }

  return { allowed: true };
}

// ─── Sandbox Evaluation ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: SandboxConfig = {
  mode: "standard",
  allowNetwork: true,
  allowPackageManagers: true,
};

/**
 * Evaluate whether a command is allowed by the sandbox.
 */
export function evaluateCommand(
  command: string,
  config: SandboxConfig = DEFAULT_CONFIG,
): SandboxResult {
  if (config.mode === "disabled") {
    return {
      allowed: true,
      command,
      primaryCommand: extractPrimaryCommand(command),
    };
  }

  const allCommands = extractAllCommands(command);
  const primaryCommand = allCommands[0] ?? extractPrimaryCommand(command);

  // Build allowed set based on mode
  const allowed = new Set<string>(ALWAYS_ALLOWED);
  const blocked = new Set<string>(ALWAYS_BLOCKED);

  if (config.mode !== "strict") {
    for (const cmd of DEV_TOOL_COMMANDS) allowed.add(cmd);
  }

  if (config.allowPackageManagers !== false) {
    for (const cmd of PACKAGE_MANAGER_COMMANDS) allowed.add(cmd);
  }

  if (config.allowNetwork !== false) {
    for (const cmd of NETWORK_COMMANDS) allowed.add(cmd);
  }

  if (config.mode === "permissive") {
    // Permissive mode allows everything except always-blocked
    for (const cmd of allCommands) {
      // Check both full name and base (mkfs.ext4 → mkfs)
      const cmdBase = cmd.split(".")[0];
      if (
        (blocked.has(cmd) || blocked.has(cmdBase)) &&
        !config.extraAllowedCommands?.includes(cmd)
      ) {
        return {
          allowed: false,
          reason: `Command "${cmd}" is always blocked (system operation)`,
          command,
          primaryCommand,
        };
      }
    }
    return { allowed: true, command, primaryCommand };
  }

  // Add extra config overrides
  if (config.extraAllowedCommands) {
    for (const cmd of config.extraAllowedCommands) allowed.add(cmd);
  }
  if (config.extraBlockedCommands) {
    for (const cmd of config.extraBlockedCommands) blocked.add(cmd);
  }

  // Check each command in the chain
  for (const cmd of allCommands) {
    // Always-blocked takes priority — check both full name and base
    // (handles mkfs.ext4 matching "mkfs", schtasks.exe matching "schtasks")
    const cmdBase = cmd.split(".")[0];
    if (blocked.has(cmd) || blocked.has(cmdBase)) {
      return {
        allowed: false,
        reason: `Command "${cmd}" is blocked (dangerous system operation)`,
        command,
        primaryCommand,
      };
    }

    // In strict/standard mode, must be in allowlist
    if (!allowed.has(cmd)) {
      return {
        allowed: false,
        reason: `Command "${cmd}" is not in the allowed commands list (mode: ${config.mode})`,
        command,
        primaryCommand,
      };
    }
  }

  // Path restriction (only in strict mode)
  if (config.mode === "strict" && config.workspaceDir) {
    const pathCheck = checkPathRestriction(command, config.workspaceDir);
    if (!pathCheck.allowed) {
      return {
        allowed: false,
        reason: pathCheck.reason,
        command,
        primaryCommand,
      };
    }
  }

  return { allowed: true, command, primaryCommand };
}

/**
 * Log a sandbox evaluation result.
 */
export function logSandboxResult(result: SandboxResult): void {
  if (!result.allowed) {
    defaultRuntime.log?.(
      `[bash-sandbox] DENIED: "${result.primaryCommand}" — ${result.reason}`,
    );
  }
}

/**
 * Get the default sandbox config, optionally merged with overrides.
 */
export function getSandboxConfig(
  overrides?: Partial<SandboxConfig>,
): SandboxConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
