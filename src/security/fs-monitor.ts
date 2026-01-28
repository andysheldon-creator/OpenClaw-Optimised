import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { logSecurityEvent } from "./hardening-logger.js";

/**
 * Default sensitive path patterns to monitor.
 * Paths are resolved relative to the user's home directory.
 */
const DEFAULT_SENSITIVE_PATHS: string[] = [
  "~/.ssh",
  "~/.aws",
  "~/.gnupg",
  "~/.config/gcloud",
  "~/.azure",
  "~/.kube",
  "~/.docker",
  "~/.npmrc",
  "~/.netrc",
  "~/.clawdbot/credentials",
  "~/.moltbot/credentials",
  "~/.gitconfig",
  "~/.bash_history",
  "~/.zsh_history",
  "/etc/shadow",
  "/etc/passwd",
];

export type FsMonitorOptions = {
  /** Extra sensitive paths to monitor. Supports ~ for home dir. */
  extraSensitivePaths?: string[];
  /** Replace the default sensitive paths entirely. */
  sensitivePaths?: string[];
  /** If true, block access to sensitive paths. If false, only log. Default: false (audit mode). */
  enforce?: boolean;
};

let resolvedSensitivePaths: string[] | null = null;
let enforceMode = false;
let installed = false;

let originalReadFile: typeof fs.readFileSync | null = null;
let originalReadFileAsync: typeof fs.promises.readFile | null = null;

/**
 * Resolve a path that may start with ~.
 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Check if a path falls under any sensitive path prefix.
 */
export function isSensitivePath(filePath: string): boolean {
  if (!resolvedSensitivePaths) return false;
  const normalized = path.resolve(filePath);
  for (const sensitive of resolvedSensitivePaths) {
    if (normalized === sensitive || normalized.startsWith(sensitive + path.sep)) {
      return true;
    }
  }
  return false;
}

/**
 * Record an access to a sensitive file in the audit log.
 * Returns true if access is allowed, false if blocked (enforce mode).
 */
export function auditFileAccess(
  filePath: string,
  operation: "read" | "write" | "stat" | "readdir" | "unlink",
): boolean {
  if (!resolvedSensitivePaths) return true;
  const normalized = path.resolve(filePath);
  if (!isSensitivePath(normalized)) return true;

  logSecurityEvent("sensitive_file_access", {
    operation,
    path: normalized,
    allowed: !enforceMode,
  });

  return !enforceMode;
}

/**
 * Install lightweight fs monitoring hooks.
 * Only intercepts fs.readFileSync and fs.promises.readFile for sensitive path auditing.
 * This is intentionally minimal to avoid breaking the application.
 */
export function installFsMonitor(opts?: FsMonitorOptions): void {
  if (installed) return;

  const rawPaths = opts?.sensitivePaths ?? [
    ...DEFAULT_SENSITIVE_PATHS,
    ...(opts?.extraSensitivePaths ?? []),
  ];
  resolvedSensitivePaths = rawPaths.map((p) => path.resolve(expandHome(p)));
  enforceMode = opts?.enforce ?? false;

  // Wrap fs.readFileSync for synchronous reads
  originalReadFile = fs.readFileSync;
  (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((...args: unknown[]) => {
    const filePath = args[0];
    if (typeof filePath === "string") {
      const allowed = auditFileAccess(filePath, "read");
      if (!allowed) {
        throw new Error(`[fs-monitor] Blocked read access to sensitive path: ${filePath}`);
      }
    }
    return (originalReadFile as Function).apply(fs, args);
  }) as typeof fs.readFileSync;

  // Wrap fs.promises.readFile for async reads
  originalReadFileAsync = fs.promises.readFile;
  (fs.promises as { readFile: typeof fs.promises.readFile }).readFile = (async (
    ...args: unknown[]
  ) => {
    const filePath = args[0];
    if (typeof filePath === "string") {
      const allowed = auditFileAccess(filePath, "read");
      if (!allowed) {
        throw new Error(`[fs-monitor] Blocked read access to sensitive path: ${filePath}`);
      }
    }
    return (originalReadFileAsync as Function).apply(fs.promises, args);
  }) as typeof fs.promises.readFile;

  installed = true;

  logSecurityEvent("hardening_init", {
    module: "fs-monitor",
    sensitivePathCount: resolvedSensitivePaths.length,
    enforce: enforceMode,
  });
}

/**
 * Uninstall the fs monitor, restoring original functions.
 */
export function uninstallFsMonitor(): void {
  if (!installed) return;
  if (originalReadFile) {
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = originalReadFile;
    originalReadFile = null;
  }
  if (originalReadFileAsync) {
    (fs.promises as { readFile: typeof fs.promises.readFile }).readFile = originalReadFileAsync;
    originalReadFileAsync = null;
  }
  resolvedSensitivePaths = null;
  installed = false;
}

/**
 * Check if the fs monitor is currently active.
 */
export function isFsMonitorActive(): boolean {
  return installed;
}

/** Reset internal state (test-only). */
export function __resetFsMonitorForTest(): void {
  uninstallFsMonitor();
}
