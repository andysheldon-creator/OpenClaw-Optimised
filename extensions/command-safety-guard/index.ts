/**
 * Command Safety Guard Plugin
 *
 * Blocks execution of potentially destructive shell commands.
 * Prevents operations like rm -rf, dd, mkfs, and exfiltration via
 * text utilities on sensitive paths.
 */

import {
  emptyPluginConfigSchema,
  type BaseStageConfig,
  type GuardrailBaseConfig,
  type GuardrailEvaluation,
  type GuardrailEvaluationContext,
  type OpenClawPluginApi,
  createGuardrailPlugin,
} from "openclaw/plugin-sdk";

// ============================================================================
// Types
// ============================================================================

type CommandRule = {
  /** Rule identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Pattern to match against the command */
  pattern: RegExp;
  /** Severity: error blocks, warning logs in monitor mode */
  severity: "error" | "warning";
};

type CommandSafetyConfig = GuardrailBaseConfig & {
  /** Additional patterns to block (regex strings) */
  extraPatterns?: string[];
  /** Patterns to allow even if they match block rules (regex strings) */
  allowPatterns?: string[];
  /** Disable specific built-in rules by ID */
  disabledRules?: string[];
  stages?: {
    beforeToolCall?: BaseStageConfig;
  };
};

// ============================================================================
// Built-in Rules
// ============================================================================

const BUILT_IN_RULES: CommandRule[] = [
  // Destructive file operations
  {
    id: "rm-recursive-force",
    description: "Recursive forced deletion",
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/,
    severity: "error",
  },
  {
    id: "rm-root",
    description: "Deletion targeting root or system paths",
    pattern: /\brm\s+.*\s+(\/|\/\*|\/bin|\/usr|\/etc|\/var|\/home|\/opt|\/Users|~|\$HOME)\s*$/,
    severity: "error",
  },
  {
    id: "rm-current-dir",
    description: "Deleting current directory or all hidden files",
    pattern: /\brm\s+(-[a-zA-Z]*\s+)*(\.|\.\.|\.\*)(\s|$)/,
    severity: "error",
  },
  {
    id: "rm-all-files",
    description: "Deleting all files in current directory",
    pattern: /\brm\s+(-[a-zA-Z]*\s+)*\*(\s|$)/,
    severity: "error",
  },
  {
    id: "find-delete-root",
    description: "Recursive deletion from root directory",
    pattern: /\bfind\s+\/\s+.*-delete/,
    severity: "error",
  },
  {
    id: "dd-device",
    description: "Direct disk write with dd",
    pattern: /\bdd\b.*\bof=\/dev\//,
    severity: "error",
  },
  {
    id: "mkfs",
    description: "Filesystem creation",
    pattern: /\bmkfs(\.[a-z0-9]+)?\s/,
    severity: "error",
  },
  {
    id: "format-disk",
    description: "Disk formatting commands",
    pattern: /\b(fdisk|parted|gdisk)\s+\/dev\//,
    severity: "error",
  },

  // Dangerous system commands
  {
    id: "shutdown-reboot",
    description: "System shutdown or reboot",
    pattern: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/,
    severity: "error",
  },
  {
    id: "chmod-recursive-permissive",
    description: "Recursive permissive chmod",
    pattern: /\bchmod\s+(-R|--recursive)\s+777\b/,
    severity: "warning",
  },
  {
    id: "chmod-any-permissive",
    description: "chmod 777 is a security risk",
    pattern: /\bchmod\s+777\b/,
    severity: "warning",
  },
  {
    id: "chmod-remove-perms",
    description: "Removing permissions on system directories",
    pattern: /\bchmod\s+(-R\s+)?000\s+\/(bin|usr|etc)(\s|$)/,
    severity: "error",
  },
  {
    id: "chown-recursive-root",
    description: "Recursive chown to root on sensitive paths",
    pattern: /\bchown\s+(-R|--recursive)\s+root[:\s].*\s+(\/|\/home|\/etc)\b/,
    severity: "error",
  },
  {
    id: "chown-root-dir",
    description: "Changing ownership of root directory",
    pattern: /\bchown\s+(-R\s+).*\/(\s|$)/,
    severity: "error",
  },

  // Fork bombs and resource exhaustion
  {
    id: "fork-bomb",
    description: "Fork bomb pattern",
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    severity: "error",
  },
  {
    id: "infinite-loop-yes",
    description: "Infinite output with yes command",
    pattern: /\byes\s*\|/,
    severity: "warning",
  },

  // Data exfiltration concerns
  {
    id: "curl-upload",
    description: "Uploading files via curl",
    pattern: /\bcurl\b.*(-F|--form|-d|--data|--data-binary|-T|--upload-file)\b.*(@|<)/,
    severity: "warning",
  },
  {
    id: "nc-listener",
    description: "Netcat listener or reverse shell",
    pattern: /\b(nc|netcat|ncat)\b.*(-l|-e|\/bin\/(ba)?sh)/,
    severity: "error",
  },
  {
    id: "base64-pipe-curl",
    description: "Base64 encoding piped to network command",
    pattern: /\bbase64\b.*\|\s*(curl|wget|nc|netcat)/,
    severity: "warning",
  },
  {
    id: "curl-pipe-interpreter",
    description: "Piping remote content to interpreters",
    pattern: /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(bash|sh|python|ruby|perl)/,
    severity: "error",
  },

  // Credential/key exposure
  {
    id: "cat-ssh-keys",
    description: "Reading SSH private keys",
    // Match SSH private keys but exclude .pub files (negative lookahead)
    pattern:
      /\b(cat|head|tail|less|more)\s+[^\n]*(\/\.ssh\/(id_[a-z0-9]+|[a-z0-9_]+_key)(?!\.pub)|\/\.gnupg\/)(\s|$)/,
    severity: "error",
  },
  {
    id: "cat-env-credentials",
    description: "Reading credential files",
    pattern: /\b(cat|head|tail|less|more)\s+.*\/(\.env|\.netrc|\.aws\/credentials|\.npmrc)/,
    severity: "error",
  },

  // History and audit evasion
  {
    id: "history-clear",
    description: "Clearing shell history",
    pattern: /\b(history\s+-c|>\s*~?\/?\.?\.?(bash_|zsh_)?history|unset\s+HISTFILE)\b/,
    severity: "warning",
  },
  {
    id: "shred-logs",
    description: "Shredding log files",
    pattern: /\bshred\b.*\/(var\/log|\.log)/,
    severity: "error",
  },

  // Privilege escalation attempts
  {
    id: "sudo-passwd",
    description: "Attempting to change password via sudo",
    pattern: /\bsudo\s+passwd\b/,
    severity: "error",
  },
  {
    id: "visudo-echo",
    description: "Modifying sudoers via echo",
    pattern: /\becho\b.*>.*\/etc\/sudoers/,
    severity: "error",
  },
  {
    id: "system-file-overwrite",
    description: "Overwriting critical system files",
    pattern: />\s*\/etc\/(passwd|shadow|group)/,
    severity: "error",
  },

  // Version control safety
  {
    id: "git-no-verify",
    description: "git commit --no-verify bypasses hooks",
    pattern: /\bgit\s+commit\b.*--no-verify/,
    severity: "error",
  },

  // Container safety
  {
    id: "docker-prune-all",
    description: "Wiping all Docker data including volumes",
    pattern: /docker\s+system\s+prune\s+-a.*--volumes/,
    severity: "error",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function extractBashCommand(params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const p = params as Record<string, unknown>;
  if (typeof p.command === "string") {
    return p.command;
  }
  return null;
}

function matchesAnyPattern(command: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(command));
}

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns
    .map((p) => {
      try {
        return new RegExp(p);
      } catch {
        return null;
      }
    })
    .filter((p): p is RegExp => p !== null);
}

/**
 * Remove quoted strings to reduce false positives.
 * Commands inside quotes (e.g. echo "rm -rf /") are less likely to be dangerous.
 */
function stripQuotedStrings(cmd: string): string {
  return cmd.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, "");
}

// ============================================================================
// Plugin Definition
// ============================================================================

const commandSafetyGuardPlugin = createGuardrailPlugin<CommandSafetyConfig>({
  id: "command-safety-guard",
  name: "Command Safety Guard",
  description: "Blocks execution of potentially destructive shell commands",

  async evaluate(
    ctx: GuardrailEvaluationContext,
    config: CommandSafetyConfig,
    _api: OpenClawPluginApi,
  ): Promise<GuardrailEvaluation | null> {
    // Only evaluate before_tool_call for Bash
    if (ctx.stage !== "before_tool_call") {
      return { safe: true };
    }

    // Tool name is lowercase "exec" (not "Bash")
    if (ctx.metadata.toolName !== "exec") {
      return { safe: true };
    }

    const command = extractBashCommand(ctx.metadata.toolParams);
    if (!command) {
      return { safe: true };
    }

    // Strip quoted strings to reduce false positives (e.g. echo "rm -rf /")
    const cleanedCommand = stripQuotedStrings(command);

    // Check allow patterns first (escape hatch) — use original command for allowlist
    if (config.allowPatterns && config.allowPatterns.length > 0) {
      const allowRegexes = compilePatterns(config.allowPatterns);
      if (matchesAnyPattern(command, allowRegexes)) {
        return { safe: true };
      }
    }

    // Check extra block patterns from config
    if (config.extraPatterns && config.extraPatterns.length > 0) {
      const extraRegexes = compilePatterns(config.extraPatterns);
      if (matchesAnyPattern(cleanedCommand, extraRegexes)) {
        return {
          safe: false,
          reason: "Command matches custom block pattern",
          details: { command, source: "custom" },
        };
      }
    }

    // Check built-in rules
    const disabledRules = new Set(config.disabledRules ?? []);
    for (const rule of BUILT_IN_RULES) {
      if (disabledRules.has(rule.id)) {
        continue;
      }
      if (rule.pattern.test(cleanedCommand)) {
        return {
          safe: false,
          reason: rule.description,
          details: {
            command,
            ruleId: rule.id,
            severity: rule.severity,
          },
        };
      }
    }

    return { safe: true };
  },

  formatViolationMessage(evaluation: GuardrailEvaluation, _location: string): string {
    const details = evaluation.details as
      | {
          command?: string;
          ruleId?: string;
          severity?: string;
        }
      | undefined;

    const parts = [`Command blocked by safety guard: ${evaluation.reason}.`];

    if (details?.ruleId) {
      parts.push(`Rule: ${details.ruleId}.`);
    }

    return parts.join(" ");
  },

  onRegister(api: OpenClawPluginApi, config: CommandSafetyConfig) {
    const disabledCount = config.disabledRules?.length ?? 0;
    const extraCount = config.extraPatterns?.length ?? 0;
    api.logger.info(
      `Command safety guard enabled (${BUILT_IN_RULES.length - disabledCount} built-in rules, ${extraCount} custom patterns)`,
    );
  },
});

// Apply config schema
const pluginWithSchema = {
  ...commandSafetyGuardPlugin,
  configSchema: emptyPluginConfigSchema(),
};

export default pluginWithSchema;

// Export for testing
export { BUILT_IN_RULES, extractBashCommand, stripQuotedStrings };
export type { CommandSafetyConfig, CommandRule };
