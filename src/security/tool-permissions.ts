/**
 * Per-Tool Permission Configuration (FB-014)
 *
 * Adds a permission-checking middleware that controls which tools are
 * available based on the input source (user, web, skill, system).
 *
 * This prevents untrusted sources (like web scrapes or skill outputs)
 * from invoking high-privilege tools (bash, discord, process).
 *
 * Integrates with FB-009 (source provenance) and FB-010 (tool gating).
 */

import { defaultRuntime } from "../runtime.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InputSource = "user" | "web" | "skill" | "tool" | "system" | "unknown";

export type ToolPermissionLevel = "full" | "read_only" | "none";

export type ToolPermissionRule = {
  /** Tool name pattern (exact name or "*" for wildcard). */
  tool: string;
  /** Input sources this rule applies to. */
  sources: InputSource[];
  /** Permission level to grant. */
  permission: ToolPermissionLevel;
};

export type ToolPermissionConfig = {
  /** Whether the permission system is enabled. Defaults to true. */
  enabled: boolean;
  /** Default permission level for unmatched tool/source combos. */
  defaultPermission: ToolPermissionLevel;
  /** Custom rules (checked in order, first match wins). */
  rules: ToolPermissionRule[];
};

export type PermissionCheckResult = {
  allowed: boolean;
  toolName: string;
  source: InputSource;
  permission: ToolPermissionLevel;
  matchedRule?: ToolPermissionRule;
};

// ─── Default Rules ────────────────────────────────────────────────────────────

/**
 * Default permission rules.
 * User and system sources get full access.
 * Web and unknown sources are restricted.
 */
const DEFAULT_RULES: ToolPermissionRule[] = [
  // User and system always get full access
  { tool: "*", sources: ["user"], permission: "full" },
  { tool: "*", sources: ["system"], permission: "full" },

  // Tool outputs get full access (tools invoking tools is normal flow)
  { tool: "*", sources: ["tool"], permission: "full" },

  // Skills can use read-only tools and basic write tools
  { tool: "read", sources: ["skill"], permission: "full" },
  { tool: "glob", sources: ["skill"], permission: "full" },
  { tool: "grep", sources: ["skill"], permission: "full" },
  { tool: "write", sources: ["skill"], permission: "full" },
  { tool: "edit", sources: ["skill"], permission: "full" },
  { tool: "bash", sources: ["skill"], permission: "full" },
  // Skills blocked from social/external actions by default
  { tool: "discord", sources: ["skill"], permission: "none" },
  { tool: "browser", sources: ["skill"], permission: "read_only" },

  // Web sources are highly restricted
  { tool: "read", sources: ["web"], permission: "full" },
  { tool: "glob", sources: ["web"], permission: "full" },
  { tool: "grep", sources: ["web"], permission: "full" },
  { tool: "bash", sources: ["web"], permission: "none" },
  { tool: "process", sources: ["web"], permission: "none" },
  { tool: "discord", sources: ["web"], permission: "none" },
  { tool: "camera", sources: ["web"], permission: "none" },
  { tool: "screen", sources: ["web"], permission: "none" },
  { tool: "whatsapp_login", sources: ["web"], permission: "none" },

  // Unknown sources are restricted like web
  { tool: "bash", sources: ["unknown"], permission: "none" },
  { tool: "process", sources: ["unknown"], permission: "none" },
  { tool: "discord", sources: ["unknown"], permission: "none" },
];

const DEFAULT_CONFIG: ToolPermissionConfig = {
  enabled: true,
  defaultPermission: "full",
  rules: DEFAULT_RULES,
};

// ─── Permission Checking ──────────────────────────────────────────────────────

/**
 * Check if a tool is allowed for a given input source.
 */
export function checkToolPermission(
  toolName: string,
  source: InputSource,
  config: ToolPermissionConfig = DEFAULT_CONFIG,
): PermissionCheckResult {
  if (!config.enabled) {
    return {
      allowed: true,
      toolName,
      source,
      permission: "full",
    };
  }

  // Find first matching rule
  for (const rule of config.rules) {
    const toolMatch = rule.tool === "*" || rule.tool === toolName;
    const sourceMatch = rule.sources.includes(source);

    if (toolMatch && sourceMatch) {
      const allowed = rule.permission !== "none";
      return {
        allowed,
        toolName,
        source,
        permission: rule.permission,
        matchedRule: rule,
      };
    }
  }

  // No rule matched — use default
  const allowed = config.defaultPermission !== "none";
  return {
    allowed,
    toolName,
    source,
    permission: config.defaultPermission,
  };
}

/**
 * Filter tools based on permissions for a given source.
 * Returns only tools that the source is allowed to use.
 */
export function filterToolsByPermission<T extends { name: string }>(
  tools: T[],
  source: InputSource,
  config?: Partial<ToolPermissionConfig>,
): T[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) return tools;

  const allowed: T[] = [];
  const blocked: string[] = [];

  for (const tool of tools) {
    const result = checkToolPermission(tool.name, source, cfg);
    if (result.allowed) {
      allowed.push(tool);
    } else {
      blocked.push(tool.name);
    }
  }

  if (blocked.length > 0) {
    defaultRuntime.log?.(
      `[tool-permissions] source=${source} blocked tools: [${blocked.join(", ")}]`,
    );
  }

  return allowed;
}

/**
 * Get the tool permission config with optional overrides.
 */
export function getToolPermissionConfig(
  overrides?: Partial<ToolPermissionConfig>,
): ToolPermissionConfig {
  if (!overrides) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    rules: overrides.rules
      ? [...overrides.rules, ...DEFAULT_RULES]
      : DEFAULT_RULES,
  };
}
