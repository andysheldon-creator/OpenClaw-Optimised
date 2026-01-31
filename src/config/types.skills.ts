import type { PermissionRiskLevel } from "../agents/skills/types.js";

export type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
};

/**
 * Security configuration for skill permission manifests.
 */
export type SkillsSecurityConfig = {
  /**
   * How to handle skills without permission manifests.
   * - "allow": Load normally (legacy behavior)
   * - "warn": Load with warning in logs (default)
   * - "prompt": Require user confirmation (CLI only)
   * - "deny": Refuse to load
   *
   * Note: Default will change to "prompt" in a future major version.
   * Run `openclaw skill audit` to review your skills.
   */
  requireManifest?: "allow" | "warn" | "prompt" | "deny";

  /**
   * Maximum risk level to auto-load without confirmation.
   * Skills above this level require explicit approval.
   * Default: "moderate"
   */
  maxAutoLoadRisk?: PermissionRiskLevel;

  /**
   * Path to file containing approved skill hashes.
   * Skills in this file bypass risk checks.
   */
  approvedSkillsFile?: string;

  /**
   * Whether to log permission violations at runtime.
   * Default: true
   */
  logViolations?: boolean;
};

export type SkillsLoadConfig = {
  /**
   * Additional skill folders to scan (lowest precedence).
   * Each directory should contain skill subfolders with `SKILL.md`.
   */
  extraDirs?: string[];
  /** Watch skill folders for changes and refresh the skills snapshot. */
  watch?: boolean;
  /** Debounce for the skills watcher (ms). */
  watchDebounceMs?: number;
};

export type SkillsInstallConfig = {
  preferBrew?: boolean;
  nodeManager?: "npm" | "pnpm" | "yarn" | "bun";
};

export type SkillsConfig = {
  /** Optional bundled-skill allowlist (only affects bundled skills). */
  allowBundled?: string[];
  load?: SkillsLoadConfig;
  install?: SkillsInstallConfig;
  entries?: Record<string, SkillConfig>;
  /** Security settings for skill permission manifests. */
  security?: SkillsSecurityConfig;
};
