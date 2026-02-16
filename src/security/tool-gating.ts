/**
 * Tool Gating — Human-in-the-Loop for Destructive Operations (FB-010)
 *
 * Wraps agent tools with a pre-execution gate that:
 * 1. Classifies each tool invocation by risk level
 * 2. Blocks known destructive patterns (rm -rf, DROP TABLE, etc.)
 * 3. Logs all high-risk invocations for audit
 * 4. Emits agent events so UI layers can implement interactive approval
 *
 * The gate is designed as a transparent wrapper — if the tool was safe
 * before gating, it stays safe after gating. Only destructive or
 * high-privilege operations are blocked or flagged.
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import { defaultRuntime } from "../runtime.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export type GateDecision = "allow" | "block" | "flag";

export type ToolGateResult = {
  decision: GateDecision;
  riskLevel: ToolRiskLevel;
  reason?: string;
  toolName: string;
  /** Sanitised description of what was attempted. */
  description: string;
};

export type ToolGateConfig = {
  /** Whether gating is enabled. Defaults to true. */
  enabled: boolean;
  /** Risk levels that should be blocked outright. Defaults to ["critical"]. */
  blockLevels: ToolRiskLevel[];
  /** Risk levels that should be flagged (logged but allowed). Defaults to ["high"]. */
  flagLevels: ToolRiskLevel[];
  /** Additional command patterns to always block (regex strings). */
  extraBlockPatterns?: string[];
  /** Tool names to always allow without gating. */
  alwaysAllowTools?: string[];
};

const DEFAULT_CONFIG: ToolGateConfig = {
  enabled: true,
  blockLevels: ["critical"],
  flagLevels: ["high"],
};

// ─── Tool Risk Classification ─────────────────────────────────────────────────

/**
 * Tools classified by their inherent risk level.
 * Tools not listed are assumed "medium" by default.
 */
const TOOL_RISK_LEVELS: Record<string, ToolRiskLevel> = {
  // Read-only / low risk
  read: "low",
  glob: "low",
  grep: "low",
  list_directory: "low",

  // Medium risk (modify local files within workspace)
  write: "medium",
  edit: "medium",

  // High risk (external effects, process control)
  bash: "high",
  process: "high",
  browser: "high",
  camera: "high",
  screen: "high",
  discord: "high",
  whatsapp_login: "high",
};

// ─── Destructive Command Patterns ─────────────────────────────────────────────

/**
 * Shell command patterns that are considered critically destructive.
 * These are blocked outright unless overridden.
 */
const CRITICAL_BASH_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // File system destruction
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+|--force\s+|--recursive\s+).*\//i, description: "Recursive/forced deletion" },
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)\./, description: "Recursive deletion of current directory" },
  { pattern: /\brmdir\s+--ignore-fail-on-non-empty/i, description: "Force remove non-empty directory" },
  { pattern: /\bmkfs\b/i, description: "Format filesystem" },
  { pattern: /\bformat\s+[a-z]:/i, description: "Format drive" },
  { pattern: /\bdd\s+.*of=/i, description: "Raw disk write (dd)" },

  // System modification
  { pattern: /\bchmod\s+(-[rR]\s+)?[0-7]{3,4}\s+\//i, description: "Recursive permission change on root" },
  { pattern: /\bchown\s+-[rR]\s+.*\//i, description: "Recursive ownership change on root" },
  { pattern: /\bsystemctl\s+(disable|stop|mask)\s/i, description: "Disabling system services" },

  // Network exfiltration
  { pattern: /\bcurl\b.*\|\s*bash\b/i, description: "Piping remote script to shell" },
  { pattern: /\bwget\b.*\|\s*bash\b/i, description: "Piping remote script to shell" },
  { pattern: /\bcurl\b.*-d\s+.*(@|password|token|key|secret|credential)/i, description: "Sending credentials via curl" },

  // Database destruction
  { pattern: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i, description: "SQL DROP statement" },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, description: "SQL TRUNCATE statement" },
  { pattern: /\bDELETE\s+FROM\b(?!.*WHERE)/i, description: "SQL DELETE without WHERE clause" },

  // Git destruction
  { pattern: /\bgit\s+push\s+.*--force\b/i, description: "Force push to remote" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, description: "Hard reset (destroys uncommitted work)" },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, description: "Git clean -f (removes untracked files)" },

  // Process/system
  { pattern: /\bkill\s+-9\s+1\b/i, description: "Kill init process" },
  { pattern: /\bshutdown\b/i, description: "System shutdown" },
  { pattern: /\breboot\b/i, description: "System reboot" },

  // Environment/config destruction
  { pattern: /\bunset\s+(PATH|HOME|USER)\b/i, description: "Unsetting critical env vars" },
  { pattern: />\s*\/etc\//i, description: "Overwriting system config files" },
];

/**
 * Discord actions that are considered high-risk.
 */
const HIGH_RISK_DISCORD_ACTIONS = new Set([
  "ban_member",
  "kick_member",
  "delete_message",
  "delete_channel",
  "modify_role",
]);

// ─── Risk Assessment ──────────────────────────────────────────────────────────

/**
 * Assess the risk level of a tool invocation based on tool name and parameters.
 */
export function assessToolRisk(
  toolName: string,
  args: unknown,
): ToolGateResult {
  const baseRisk = TOOL_RISK_LEVELS[toolName] ?? "medium";
  const params =
    args && typeof args === "object"
      ? (args as Record<string, unknown>)
      : {};

  // ── Bash tool: check command content ──
  if (toolName === "bash") {
    const command =
      typeof params.command === "string" ? params.command : "";

    for (const { pattern, description } of CRITICAL_BASH_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "block",
          riskLevel: "critical",
          reason: description,
          toolName,
          description: `bash: ${truncateCommand(command)}`,
        };
      }
    }

    // Even non-critical bash is still "high"
    return {
      decision: "flag",
      riskLevel: "high",
      toolName,
      description: `bash: ${truncateCommand(command)}`,
    };
  }

  // ── Process tool: killing processes is high risk ──
  if (toolName === "process") {
    const action =
      typeof params.action === "string" ? params.action : "";
    if (action === "kill" || action === "signal") {
      return {
        decision: "flag",
        riskLevel: "high",
        reason: `process ${action}`,
        toolName,
        description: `process: ${action}`,
      };
    }
  }

  // ── Discord tool: destructive social actions ──
  if (toolName === "discord") {
    const action =
      typeof params.action === "string" ? params.action : "";
    if (HIGH_RISK_DISCORD_ACTIONS.has(action)) {
      return {
        decision: "block",
        riskLevel: "critical",
        reason: `Destructive discord action: ${action}`,
        toolName,
        description: `discord: ${action}`,
      };
    }
    if (action === "send_message") {
      return {
        decision: "flag",
        riskLevel: "high",
        toolName,
        description: `discord: send_message`,
      };
    }
  }

  // ── Default: allow with base risk ──
  return {
    decision: "allow",
    riskLevel: baseRisk,
    toolName,
    description: `${toolName}: ${Object.keys(params).join(", ") || "(no params)"}`,
  };
}

// ─── Gate Logic ───────────────────────────────────────────────────────────────

/**
 * Apply the gating policy to a risk assessment.
 */
export function applyGatePolicy(
  assessment: ToolGateResult,
  config: ToolGateConfig = DEFAULT_CONFIG,
): ToolGateResult {
  if (!config.enabled) {
    return { ...assessment, decision: "allow" };
  }

  // Always-allow tools bypass gating entirely
  if (config.alwaysAllowTools?.includes(assessment.toolName)) {
    return { ...assessment, decision: "allow", riskLevel: "low" };
  }

  // Check extra block patterns against description
  if (config.extraBlockPatterns) {
    for (const patternStr of config.extraBlockPatterns) {
      try {
        const re = new RegExp(patternStr, "i");
        if (re.test(assessment.description)) {
          return {
            ...assessment,
            decision: "block",
            riskLevel: "critical",
            reason: `Matched custom block pattern: ${patternStr}`,
          };
        }
      } catch {
        // Invalid regex — skip
      }
    }
  }

  // Apply block/flag levels
  if (config.blockLevels.includes(assessment.riskLevel)) {
    return { ...assessment, decision: "block" };
  }
  if (config.flagLevels.includes(assessment.riskLevel)) {
    return { ...assessment, decision: "flag" };
  }

  return { ...assessment, decision: "allow" };
}

// ─── Tool Wrapper ─────────────────────────────────────────────────────────────

/**
 * Generic tool type matching the pi-agent-core AgentTool interface.
 * Using `any` because the upstream type uses different TypeBox instances
 * that create type incompatibility.
 */
// biome-ignore lint/suspicious/noExplicitAny: AgentTool type compatibility
type AnyTool = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
  execute: (...args: any[]) => Promise<any>;
};

/**
 * Wrap a single tool with the human-in-the-loop gate.
 *
 * The wrapper:
 * 1. Assesses tool risk before execution
 * 2. Blocks critical/destructive operations
 * 3. Logs flagged operations
 * 4. Emits agent events for UI-layer approval flows
 * 5. Returns a clear denial message if blocked
 */
export function wrapToolWithGate<T extends AnyTool>(
  tool: T,
  config: ToolGateConfig = DEFAULT_CONFIG,
  runId?: string,
): T {
  if (!config.enabled) return tool;

  // Low-risk tools don't need wrapping
  const baseRisk = TOOL_RISK_LEVELS[tool.name] ?? "medium";
  if (baseRisk === "low" && !config.extraBlockPatterns?.length) {
    return tool;
  }

  const originalExecute = tool.execute;

  const wrappedExecute = async (...executeArgs: unknown[]): Promise<unknown> => {
    // Extract the args parameter (second argument to execute())
    const toolCallId = executeArgs[0];
    const args = executeArgs[1];

    // Assess risk
    const assessment = assessToolRisk(tool.name, args);
    const gateResult = applyGatePolicy(assessment, config);

    // Emit event for all non-trivial risk
    if (gateResult.riskLevel !== "low") {
      emitAgentEvent({
        runId: runId ?? "unknown",
        stream: "tool",
        data: {
          phase: "gate",
          name: tool.name,
          toolCallId: String(toolCallId ?? ""),
          decision: gateResult.decision,
          riskLevel: gateResult.riskLevel,
          reason: gateResult.reason,
          description: gateResult.description,
        },
      });
    }

    // Log flagged/blocked operations
    if (gateResult.decision === "flag") {
      defaultRuntime.log?.(
        `[tool-gate] FLAGGED: ${gateResult.description} (risk=${gateResult.riskLevel})`,
      );
    }

    if (gateResult.decision === "block") {
      defaultRuntime.log?.(
        `[tool-gate] BLOCKED: ${gateResult.description} — ${gateResult.reason ?? "policy"}`,
      );

      // Return a structured denial that the LLM will understand
      return {
        content: [
          {
            type: "text",
            text:
              `⛔ Tool execution blocked by safety gate.\n` +
              `Tool: ${tool.name}\n` +
              `Risk: ${gateResult.riskLevel}\n` +
              `Reason: ${gateResult.reason ?? "Destructive operation not allowed"}\n\n` +
              `This operation requires human approval. ` +
              `Please ask the user to perform this action manually, or rephrase ` +
              `the request to use a safer alternative.`,
          },
        ],
      };
    }

    // Allow — execute the original tool
    return originalExecute.apply(tool, executeArgs as never);
  };

  return { ...tool, execute: wrappedExecute } as T;
}

/**
 * Wrap all tools in an array with the gating system.
 * Low-risk tools are returned unwrapped for performance.
 */
export function wrapToolsWithGate<T extends AnyTool>(
  tools: T[],
  config?: Partial<ToolGateConfig>,
  runId?: string,
): T[] {
  const mergedConfig: ToolGateConfig = { ...DEFAULT_CONFIG, ...config };

  if (!mergedConfig.enabled) return tools;

  return tools.map((tool) => wrapToolWithGate(tool, mergedConfig, runId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateCommand(command: string): string {
  const cleaned = command.trim().replace(/\s+/g, " ");
  return cleaned.length > 120 ? `${cleaned.slice(0, 120)}…` : cleaned;
}

/**
 * Get the default gating config, optionally merged with overrides.
 */
export function getToolGateConfig(
  overrides?: Partial<ToolGateConfig>,
): ToolGateConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
