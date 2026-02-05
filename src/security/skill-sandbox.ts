/**
 * OpenClaw Skill Sandbox
 *
 * Enforces security policies for skill execution:
 * - Filesystem: read-only by default, sandbox directory for writes
 * - Network: egress deny by default, optional hostname allowlist
 * - Subprocess: completely disabled by default
 * - Runtime: timeout and resource limits
 */

import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { checkOneLinerPattern, enforceOneLinerBlocklist } from "./one-liner-blocklist.js";

const log = createSubsystemLogger("security/skill-sandbox");

export type SkillPermissions = {
  filesystem?: {
    mode?: "deny" | "read-only" | "sandbox-only" | "workspace-only" | "unrestricted";
    sandboxPath?: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };
  network?: {
    egress?: "deny" | "allowlist" | "unrestricted";
    egressAllowlist?: string[];
    listen?: boolean;
  };
  subprocess?: {
    allowed?: boolean;
    allowedCommands?: string[];
    deniedCommands?: string[];
    shellAccess?: boolean;
  };
  runtime?: {
    maxTimeoutSeconds?: number;
    maxMemoryMb?: number;
  };
};

export type SkillSandboxPolicy = {
  skillId: string;
  permissions: SkillPermissions;
  sandboxDir: string;
};

/**
 * Default permissions - very restrictive
 */
const DEFAULT_PERMISSIONS: Required<SkillPermissions> = {
  filesystem: {
    mode: "read-only",
    sandboxPath: undefined,
    allowedPaths: [],
    deniedPaths: [
      "/etc/passwd",
      "/etc/shadow",
      "~/.ssh",
      "~/.gnupg",
      "~/.aws",
      "~/.openclaw/credentials",
    ],
  },
  network: {
    egress: "deny",
    egressAllowlist: [],
    listen: false,
  },
  subprocess: {
    allowed: false,
    allowedCommands: [],
    deniedCommands: ["rm", "dd", "mkfs", "fdisk", "format", "del"],
    shellAccess: false,
  },
  runtime: {
    maxTimeoutSeconds: 30,
    maxMemoryMb: 128,
  },
};

/**
 * Always-denied paths (cannot be overridden)
 */
const HARDCODED_DENIED_PATHS = ["/etc/shadow", "/etc/sudoers", "~/.ssh/id_*", "~/.gnupg/private*"];

/**
 * Always-denied commands (cannot be overridden)
 */
const HARDCODED_DENIED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "dd if=/dev/zero of=/dev/sda",
  "mkfs",
  ":(){ :|:& };:",
  "chmod -R 777 /",
];

export type FilesystemCheckResult = {
  allowed: boolean;
  reason?: string;
};

export type NetworkCheckResult = {
  allowed: boolean;
  reason?: string;
};

export type SubprocessCheckResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Creates a sandbox policy for a skill
 */
export function createSkillSandboxPolicy(params: {
  skillId: string;
  permissions?: SkillPermissions;
  baseDir?: string;
}): SkillSandboxPolicy {
  const baseDir =
    params.baseDir ?? process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`;
  const sandboxDir = path.join(baseDir, "skill_sandboxes", params.skillId);

  const permissions: SkillPermissions = {
    filesystem: {
      ...DEFAULT_PERMISSIONS.filesystem,
      ...params.permissions?.filesystem,
      sandboxPath: sandboxDir,
    },
    network: {
      ...DEFAULT_PERMISSIONS.network,
      ...params.permissions?.network,
    },
    subprocess: {
      ...DEFAULT_PERMISSIONS.subprocess,
      ...params.permissions?.subprocess,
    },
    runtime: {
      ...DEFAULT_PERMISSIONS.runtime,
      ...params.permissions?.runtime,
    },
  };

  return {
    skillId: params.skillId,
    permissions,
    sandboxDir,
  };
}

/**
 * Checks if a filesystem path is allowed for a skill
 */
export function checkFilesystemAccess(params: {
  policy: SkillSandboxPolicy;
  path: string;
  operation: "read" | "write" | "execute";
}): FilesystemCheckResult {
  const { policy, operation } = params;
  const requestedPath = path.resolve(params.path);
  const fsPolicy = policy.permissions.filesystem ?? DEFAULT_PERMISSIONS.filesystem;
  const mode = fsPolicy.mode ?? "read-only";

  // Always check hardcoded denied paths
  for (const denied of HARDCODED_DENIED_PATHS) {
    const resolvedDenied = denied.replace("~", process.env.HOME ?? "");
    if (requestedPath.startsWith(resolvedDenied) || requestedPath.includes(resolvedDenied)) {
      return {
        allowed: false,
        reason: `Path is in hardcoded deny list: ${denied}`,
      };
    }
  }

  // Check policy denied paths
  for (const denied of fsPolicy.deniedPaths ?? []) {
    const resolvedDenied = denied.replace("~", process.env.HOME ?? "");
    if (requestedPath.startsWith(resolvedDenied)) {
      return {
        allowed: false,
        reason: `Path is denied by policy: ${denied}`,
      };
    }
  }

  // Mode-based checks
  if (mode === "deny") {
    return {
      allowed: false,
      reason: "Filesystem access is completely denied",
    };
  }

  if (mode === "read-only" && operation !== "read") {
    return {
      allowed: false,
      reason: `Write/execute operations not allowed in read-only mode`,
    };
  }

  if (mode === "sandbox-only") {
    const sandboxPath = fsPolicy.sandboxPath ?? policy.sandboxDir;
    if (!requestedPath.startsWith(sandboxPath)) {
      if (operation !== "read") {
        return {
          allowed: false,
          reason: `Write/execute only allowed in sandbox directory: ${sandboxPath}`,
        };
      }
    }
  }

  // Check allowed paths
  const allowedPaths = fsPolicy.allowedPaths ?? [];
  if (allowedPaths.length > 0 && operation !== "read") {
    const isAllowed = allowedPaths.some((allowed) => {
      const resolvedAllowed = allowed.replace("~", process.env.HOME ?? "");
      return requestedPath.startsWith(resolvedAllowed);
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Path not in allowed list for ${operation}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Checks if a network request is allowed for a skill
 */
export function checkNetworkAccess(params: {
  policy: SkillSandboxPolicy;
  hostname: string;
  port?: number;
  operation: "connect" | "listen";
}): NetworkCheckResult {
  const { policy, hostname, operation } = params;
  const netPolicy = policy.permissions.network ?? DEFAULT_PERMISSIONS.network;

  // Check listen permission
  if (operation === "listen" && !netPolicy.listen) {
    return {
      allowed: false,
      reason: "Skill is not allowed to listen on ports",
    };
  }

  // Check egress policy
  if (operation === "connect") {
    const egressMode = netPolicy.egress ?? "deny";

    if (egressMode === "deny") {
      return {
        allowed: false,
        reason: "Network egress is denied",
      };
    }

    if (egressMode === "allowlist") {
      const allowlist = netPolicy.egressAllowlist ?? [];
      const isAllowed = allowlist.some((allowed) => {
        // Support wildcards
        if (allowed.startsWith("*.")) {
          return hostname.endsWith(allowed.slice(1));
        }
        return hostname === allowed || hostname.endsWith(`.${allowed}`);
      });

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Hostname not in egress allowlist: ${hostname}`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Checks if a subprocess command is allowed for a skill
 */
export function checkSubprocessAccess(params: {
  policy: SkillSandboxPolicy;
  command: string;
  args?: string[];
}): SubprocessCheckResult {
  const { policy, command, args } = params;
  const subPolicy = policy.permissions.subprocess ?? DEFAULT_PERMISSIONS.subprocess;

  // First check for one-liner patterns
  const fullCommand = args ? `${command} ${args.join(" ")}` : command;
  const oneLinerCheck = checkOneLinerPattern(fullCommand);
  if (oneLinerCheck.blocked) {
    return {
      allowed: false,
      reason: `Blocked dangerous pattern: ${oneLinerCheck.description}`,
    };
  }

  // Check if subprocess is allowed at all
  if (!subPolicy.allowed) {
    return {
      allowed: false,
      reason: "Subprocess execution is disabled for this skill",
    };
  }

  // Check hardcoded denied commands
  for (const denied of HARDCODED_DENIED_COMMANDS) {
    if (fullCommand.includes(denied)) {
      return {
        allowed: false,
        reason: `Command contains hardcoded denied pattern: ${denied}`,
      };
    }
  }

  // Check shell access
  const shellCommands = ["sh", "bash", "zsh", "fish", "cmd", "powershell", "pwsh"];
  const baseCommand = path.basename(command);
  if (shellCommands.includes(baseCommand) && !subPolicy.shellAccess) {
    return {
      allowed: false,
      reason: "Shell access is not allowed for this skill",
    };
  }

  // Check denied commands
  for (const denied of subPolicy.deniedCommands ?? []) {
    if (baseCommand === denied || command.includes(denied)) {
      return {
        allowed: false,
        reason: `Command is in deny list: ${denied}`,
      };
    }
  }

  // Check allowed commands (if list is non-empty, only those are allowed)
  const allowedCommands = subPolicy.allowedCommands ?? [];
  if (allowedCommands.length > 0) {
    const isAllowed = allowedCommands.some(
      (allowed) => baseCommand === allowed || command === allowed,
    );
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Command not in allowed list`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Enforces all sandbox policies - throws if any check fails
 */
export function enforceSkillSandbox(params: {
  policy: SkillSandboxPolicy;
  operation:
    | { type: "filesystem"; path: string; operation: "read" | "write" | "execute" }
    | { type: "network"; hostname: string; port?: number; operation: "connect" | "listen" }
    | { type: "subprocess"; command: string; args?: string[] };
}): void {
  const { policy, operation } = params;

  if (operation.type === "filesystem") {
    const result = checkFilesystemAccess({
      policy,
      path: operation.path,
      operation: operation.operation,
    });
    if (!result.allowed) {
      log.warn(
        `SECURITY_EVENT: skill ${policy.skillId} filesystem access denied: ${result.reason}`,
      );
      throw new Error(`Sandbox violation: ${result.reason}`);
    }
  }

  if (operation.type === "network") {
    const result = checkNetworkAccess({
      policy,
      hostname: operation.hostname,
      port: operation.port,
      operation: operation.operation,
    });
    if (!result.allowed) {
      log.warn(`SECURITY_EVENT: skill ${policy.skillId} network access denied: ${result.reason}`);
      throw new Error(`Sandbox violation: ${result.reason}`);
    }
  }

  if (operation.type === "subprocess") {
    // Also enforce one-liner blocklist
    const fullCommand = operation.args
      ? `${operation.command} ${operation.args.join(" ")}`
      : operation.command;
    enforceOneLinerBlocklist(fullCommand);

    const result = checkSubprocessAccess({
      policy,
      command: operation.command,
      args: operation.args,
    });
    if (!result.allowed) {
      log.warn(
        `SECURITY_EVENT: skill ${policy.skillId} subprocess access denied: ${result.reason}`,
      );
      throw new Error(`Sandbox violation: ${result.reason}`);
    }
  }
}

/**
 * Gets the default permissions for documentation
 */
export function getDefaultPermissions(): Required<SkillPermissions> {
  return { ...DEFAULT_PERMISSIONS };
}
