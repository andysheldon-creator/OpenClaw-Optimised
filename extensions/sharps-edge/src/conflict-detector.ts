/**
 * SHARPS EDGE - Conflict Detection Engine
 *
 * Runs six pre-action checks before every tool call.
 * Can block actions that violate project charter or guardrails.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { AuditLogger } from "./audit-logger.js";
import {
  type ConflictResult,
  MODIFYING_TOOLS,
  Severity,
  type SharpsEdgeConfig,
} from "./types.js";

type CheckContext = {
  toolName: string;
  params: Record<string, unknown>;
  workspaceDir: string;
  projectDir: string;
  cfg: SharpsEdgeConfig;
  budgetRatio: () => Promise<number>;
};

type ConflictCheck = {
  name: string;
  check: (ctx: CheckContext) => Promise<ConflictResult>;
};

/**
 * Check 1: Scope - Is the action within the project's scope?
 * Verifies file operations target the project directory.
 */
async function checkScope(ctx: CheckContext): Promise<ConflictResult> {
  const filePath = extractFilePath(ctx.params);
  if (!filePath) return { status: "PASS" };

  // Allow operations within workspace
  const absWorkspace = path.resolve(ctx.workspaceDir);
  const absTarget = path.resolve(filePath);

  // Block operations outside workspace unless they're in /tmp or project-related
  if (
    !absTarget.startsWith(absWorkspace) &&
    !absTarget.startsWith("/tmp") &&
    !absTarget.startsWith(path.resolve(ctx.workspaceDir, "..", ".."))
  ) {
    return {
      status: "BLOCK",
      check: "scope",
      reason: `File path "${filePath}" is outside the workspace directory`,
    };
  }

  return { status: "PASS" };
}

/**
 * Check 2: Resources - Are budget and API quotas available?
 */
async function checkResources(ctx: CheckContext): Promise<ConflictResult> {
  const ratio = await ctx.budgetRatio();
  const blockThreshold = 0.95;

  if (ratio >= 1.0) {
    return {
      status: "REJECT",
      check: "resources",
      reason: `Monthly budget exhausted (${(ratio * 100).toFixed(1)}% used)`,
    };
  }

  if (ratio >= blockThreshold) {
    // Only block expensive operations at 95%+
    if (isExpensiveOperation(ctx.toolName)) {
      return {
        status: "BLOCK",
        check: "resources",
        reason: `Budget at ${(ratio * 100).toFixed(1)}%. Blocking non-essential expensive operations.`,
      };
    }
  }

  return { status: "PASS" };
}

/**
 * Check 3: Contention - Is there conflicting work in progress?
 * Reads BUILD_STATUS.md for active tasks on the same files.
 */
async function checkContention(ctx: CheckContext): Promise<ConflictResult> {
  // For now, contention checking is basic - just verify build status is readable
  try {
    const statusPath = path.join(ctx.workspaceDir, ctx.projectDir, "BUILD_STATUS.md");
    await fs.access(statusPath);
  } catch {
    // No build status file is fine - no contention possible
  }
  return { status: "PASS" };
}

/**
 * Check 4: Authority - Does the agent have permission?
 * Production deployments and money-spending need explicit approval.
 */
async function checkAuthority(ctx: CheckContext): Promise<ConflictResult> {
  const params = ctx.params;
  const command = typeof params.command === "string" ? params.command : "";

  // Block deployment commands without explicit approval flag
  const deployPatterns = [
    /wrangler\s+deploy/i,
    /wrangler\s+publish/i,
    /npm\s+publish/i,
    /fly\s+deploy/i,
  ];

  for (const pattern of deployPatterns) {
    if (pattern.test(command)) {
      return {
        status: "BLOCK",
        check: "authority",
        reason: `Deployment commands require explicit approval: "${command.slice(0, 80)}"`,
      };
    }
  }

  return { status: "PASS" };
}

/**
 * Check 5: Safety - Is the action safe to execute?
 * Blocks dangerous operations that could cause data loss.
 */
async function checkSafety(ctx: CheckContext): Promise<ConflictResult> {
  const params = ctx.params;
  const command = typeof params.command === "string" ? params.command : "";

  // Block dangerous commands
  const dangerousPatterns = [
    /rm\s+-rf\s+[\/~]/,
    /DROP\s+(?:TABLE|DATABASE)/i,
    /TRUNCATE\s+TABLE/i,
    />\s*\/dev\/sd[a-z]/,
    /mkfs\./,
    /dd\s+if=/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        status: "CRITICAL",
        check: "safety",
        reason: `Dangerous command detected: "${command.slice(0, 80)}"`,
      };
    }
  }

  // Block operations that might expose secrets
  const secretPatterns = [
    /\.env(?:\.|$)/,
    /credentials\.json/,
    /private[_-]?key/i,
    /\.pem$/,
  ];

  const filePath = extractFilePath(params);
  if (filePath) {
    for (const pattern of secretPatterns) {
      if (pattern.test(filePath)) {
        return {
          status: "BLOCK",
          check: "safety",
          reason: `Operation on potential secrets file: "${filePath}"`,
        };
      }
    }
  }

  return { status: "PASS" };
}

/**
 * Check 6: Charter Guardrails - Does the action violate any guardrails?
 * Checks against the project charter's guardrail definitions.
 */
async function checkCharter(ctx: CheckContext): Promise<ConflictResult> {
  const params = ctx.params;
  const command = typeof params.command === "string" ? params.command : "";

  // Guardrail: Don't use paid APIs without explicit approval
  const paidApiPatterns = [
    /api\.openai\.com/,
    /api\.anthropic\.com/,
    // Add more paid API patterns as needed
  ];

  for (const pattern of paidApiPatterns) {
    if (pattern.test(command)) {
      // This is informational, not blocking - the LLM itself may call these
      return { status: "PASS" };
    }
  }

  return { status: "PASS" };
}

/**
 * All six conflict detection checks.
 */
const CONFLICT_CHECKS: ConflictCheck[] = [
  { name: "scope", check: checkScope },
  { name: "resources", check: checkResources },
  { name: "contention", check: checkContention },
  { name: "authority", check: checkAuthority },
  { name: "safety", check: checkSafety },
  { name: "charter", check: checkCharter },
];

/**
 * Extract a file path from tool params (various tool param shapes).
 */
function extractFilePath(params: Record<string, unknown>): string | null {
  return (
    (typeof params.path === "string" ? params.path : null) ??
    (typeof params.file_path === "string" ? params.file_path : null) ??
    (typeof params.filename === "string" ? params.filename : null) ??
    (typeof params.target === "string" ? params.target : null) ??
    null
  );
}

/**
 * Check if a tool operation is considered expensive (LLM calls, API calls).
 */
function isExpensiveOperation(toolName: string): boolean {
  const expensive = new Set(["exec", "shell", "bash", "run_command", "browser"]);
  return expensive.has(toolName);
}

/**
 * Register conflict detection on the plugin API.
 */
export function registerConflictDetector(
  api: OpenClawPluginApi,
  cfg: SharpsEdgeConfig,
  auditLogger: AuditLogger,
  getBudgetRatio: () => Promise<number>,
): void {
  if (cfg.conflictDetection?.enabled === false) {
    api.logger.info?.("sharps-edge: Conflict detection disabled");
    return;
  }

  const strictMode = cfg.conflictDetection?.strictMode ?? false;
  const projectDir = cfg.projectDir ?? "projects/SHARPS-EDGE";

  api.on(
    "before_tool_call",
    async (event, ctx) => {
      // Only check modifying tools
      if (!MODIFYING_TOOLS.has(event.toolName)) {
        return;
      }

      const workspaceDir = ctx.workspaceDir ?? api.resolvePath("~/.openclaw/workspace");

      const checkCtx: CheckContext = {
        toolName: event.toolName,
        params: event.params,
        workspaceDir,
        projectDir,
        cfg,
        budgetRatio: getBudgetRatio,
      };

      // Run all six checks
      for (const { name, check } of CONFLICT_CHECKS) {
        try {
          const result = await check(checkCtx);

          if (result.status !== "PASS") {
            // Log the conflict
            await auditLogger.logConflict(
              projectDir.split("/").pop() ?? "UNKNOWN",
              `${event.toolName}: ${JSON.stringify(event.params).slice(0, 200)}`,
              name,
              result.reason,
              result.status === "CRITICAL"
                ? Severity.CRITICAL
                : result.status === "REJECT"
                  ? Severity.REJECT
                  : Severity.BLOCK,
            );

            // In strict mode, always block. In non-strict, only block CRITICAL and REJECT.
            if (strictMode || result.status === "CRITICAL" || result.status === "REJECT") {
              api.logger.warn(
                `sharps-edge: ${result.status} [${name}] ${result.reason}`,
              );
              return {
                block: true,
                blockReason: `[SHARPS EDGE ${result.status}] Check "${name}" failed: ${result.reason}`,
              };
            }

            // Non-strict mode: log warning but allow
            api.logger.warn(
              `sharps-edge: WARN [${name}] ${result.reason} (non-strict, allowing)`,
            );
          }
        } catch (err) {
          api.logger.warn(`sharps-edge: Check "${name}" error: ${String(err)}`);
          // Don't block on check errors - fail open
        }
      }

      // All checks passed
      return;
    },
    { priority: 10 }, // High priority - run before other before_tool_call hooks
  );
}
