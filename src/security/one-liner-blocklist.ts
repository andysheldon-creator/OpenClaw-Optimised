/**
 * OpenClaw One-Liner Blocklist
 *
 * Detects and blocks dangerous "one-liner" command patterns that download
 * and execute remote code. These patterns are commonly used in supply-chain attacks.
 *
 * Blocked patterns include:
 * - curl | sh / curl | bash
 * - wget | sh / wget | bash
 * - bash <(curl ...)
 * - powershell iwr | iex
 * - python -c with urllib/requests + exec
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("security/one-liner-block");

export type OneLinerCheckResult = {
  blocked: boolean;
  pattern?: string;
  description?: string;
};

/**
 * Patterns that indicate dangerous one-liner execution
 * Each pattern has a regex and a human-readable description
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // curl piped to shell
  {
    pattern: /curl\s+[^|]*\|\s*(ba)?sh/i,
    description: "curl piped to shell (curl | sh)",
  },
  {
    pattern: /curl\s+[^|]*\|\s*zsh/i,
    description: "curl piped to zsh",
  },

  // wget piped to shell
  {
    pattern: /wget\s+[^|]*\|\s*(ba)?sh/i,
    description: "wget piped to shell (wget | sh)",
  },
  {
    pattern: /wget\s+-O\s*-\s*[^|]*\|\s*(ba)?sh/i,
    description: "wget -O - piped to shell",
  },

  // Process substitution with curl/wget
  {
    pattern: /(ba)?sh\s+<\s*\(\s*curl/i,
    description: "bash with process substitution (bash <(curl ...))",
  },
  {
    pattern: /(ba)?sh\s+<\s*\(\s*wget/i,
    description: "bash with process substitution (bash <(wget ...))",
  },
  {
    pattern: /source\s+<\s*\(\s*curl/i,
    description: "source with process substitution",
  },

  // Fetching and executing with eval
  {
    pattern: /eval\s+["'`]\$\(\s*curl/i,
    description: "eval with curl command substitution",
  },
  {
    pattern: /eval\s+["'`]\$\(\s*wget/i,
    description: "eval with wget command substitution",
  },

  // PowerShell patterns
  {
    pattern: /iwr\s+[^|]*\|\s*iex/i,
    description: "PowerShell Invoke-WebRequest piped to Invoke-Expression",
  },
  {
    pattern: /Invoke-WebRequest\s+[^|]*\|\s*Invoke-Expression/i,
    description: "PowerShell Invoke-WebRequest piped to Invoke-Expression",
  },
  {
    pattern: /\(New-Object\s+Net\.WebClient\)\.DownloadString[^)]*\)\s*\|\s*iex/i,
    description: "PowerShell WebClient.DownloadString piped to iex",
  },
  {
    pattern: /irm\s+[^|]*\|\s*iex/i,
    description: "PowerShell Invoke-RestMethod piped to iex",
  },

  // Python remote code execution
  {
    pattern: /python3?\s+-c\s+["'][^"']*urllib[^"']*exec/i,
    description: "Python one-liner with urllib and exec",
  },
  {
    pattern: /python3?\s+-c\s+["'][^"']*requests[^"']*exec/i,
    description: "Python one-liner with requests and exec",
  },
  {
    pattern: /python3?\s+-c\s+["'][^"']*import\s+os[^"']*system/i,
    description: "Python one-liner with os.system",
  },

  // Node.js remote execution
  {
    pattern: /node\s+-e\s+["'][^"']*require\(['"]https?['"]\)[^"']*eval/i,
    description: "Node.js one-liner fetching and executing",
  },

  // Ruby one-liners
  {
    pattern: /ruby\s+-e\s+["'][^"']*open\(['"]https?/i,
    description: "Ruby one-liner with open-uri",
  },

  // Perl one-liners
  {
    pattern: /perl\s+-e\s+["'][^"']*LWP::Simple[^"']*eval/i,
    description: "Perl one-liner with LWP and eval",
  },
];

/**
 * Additional patterns that are suspicious but might have legitimate uses
 * These generate warnings rather than hard blocks
 */
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /curl\s+.*--output\s+-.*\|\s*tar/i,
    description: "curl output piped to tar (review carefully)",
  },
  {
    pattern: /wget\s+.*-O\s*-.*\|\s*tar/i,
    description: "wget output piped to tar (review carefully)",
  },
  {
    pattern: /npm\s+install\s+-g\s+https?:/i,
    description: "npm install from URL (verify source)",
  },
];

/**
 * Checks a command string for dangerous one-liner patterns
 */
export function checkOneLinerPattern(command: string): OneLinerCheckResult {
  if (!command || typeof command !== "string") {
    return { blocked: false };
  }

  // Normalize whitespace for better matching
  const normalized = command.replace(/\s+/g, " ").trim();

  // Check dangerous patterns (hard block)
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      log.warn(`SECURITY_EVENT: blocked dangerous one-liner pattern: ${description}`);
      return {
        blocked: true,
        pattern: pattern.source,
        description,
      };
    }
  }

  return { blocked: false };
}

/**
 * Checks a command for suspicious patterns (warning only)
 */
export function checkSuspiciousPattern(
  command: string,
): { suspicious: boolean; description?: string } | null {
  if (!command || typeof command !== "string") {
    return null;
  }

  const normalized = command.replace(/\s+/g, " ").trim();

  for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalized)) {
      log.info(`SECURITY_EVENT: suspicious pattern detected: ${description}`);
      return { suspicious: true, description };
    }
  }

  return null;
}

/**
 * Enforces the one-liner blocklist - throws if a dangerous pattern is detected
 */
export function enforceOneLinerBlocklist(command: string): void {
  const result = checkOneLinerPattern(command);

  if (result.blocked) {
    const message = [
      "",
      "═══════════════════════════════════════════════════════════════",
      " OPENCLAW SECURITY: Dangerous Command Pattern Blocked",
      "═══════════════════════════════════════════════════════════════",
      "",
      ` Pattern: ${result.description}`,
      "",
      " This command pattern is commonly used in supply-chain attacks.",
      " Remote code should never be downloaded and executed directly.",
      "",
      " Safe alternatives:",
      "   1. Download the script first, review it, then execute",
      "   2. Use package managers with verification (npm, pip, brew)",
      "   3. Clone repositories and review code before running",
      "",
      " This block cannot be bypassed - it's a critical security control.",
      "",
      "═══════════════════════════════════════════════════════════════",
      "",
    ].join("\n");

    // Log the full message for visibility
    console.error(message);

    throw new Error(`Security: Blocked dangerous command pattern - ${result.description}`);
  }
}

/**
 * Checks an array of command strings for dangerous patterns
 */
export function checkCommandArray(commands: string[]): OneLinerCheckResult {
  for (const command of commands) {
    const result = checkOneLinerPattern(command);
    if (result.blocked) {
      return result;
    }
  }
  return { blocked: false };
}

/**
 * Sanitizes a command by removing or warning about dangerous patterns
 * Returns the command unchanged if safe, or throws if dangerous
 */
export function sanitizeCommand(command: string): string {
  enforceOneLinerBlocklist(command);
  return command;
}

/**
 * Gets all blocked patterns for documentation/testing
 */
export function getBlockedPatterns(): Array<{ pattern: string; description: string }> {
  return DANGEROUS_PATTERNS.map(({ pattern, description }) => ({
    pattern: pattern.source,
    description,
  }));
}

/**
 * Gets all suspicious patterns for documentation/testing
 */
export function getSuspiciousPatterns(): Array<{ pattern: string; description: string }> {
  return SUSPICIOUS_PATTERNS.map(({ pattern, description }) => ({
    pattern: pattern.source,
    description,
  }));
}
