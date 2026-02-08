/**
 * TOOLS-002 (#38) -- CLI allowlist
 *
 * Gate-keeps which commands the CLI runner is permitted to execute.
 * Each entry specifies a command pattern with optional allowed/denied
 * argument patterns, so operators can lock down the sandbox to a set of
 * known-safe operations.
 *
 * @see ./cli-runner.ts
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the CLI allowlist. */
export type CliAllowlistEntry = {
  /**
   * Glob-style pattern matched against the command name.
   * Examples: `"git"`, `"npm"`, `"curl"`.
   */
  command_pattern: string;

  /**
   * Argument patterns that are explicitly permitted.
   * When non-empty, at least one pattern must match the provided args
   * for the invocation to be allowed.
   *
   * Each pattern is matched against the joined argument string.
   * Use `"*"` to allow any arguments.
   */
  allowed_args: string[];

  /**
   * Argument patterns that are explicitly denied even when `allowed_args`
   * would permit them.
   * Deny rules are evaluated after allow rules and take precedence.
   *
   * Examples: `["--force"]`, `["-rf /"]`
   */
  denied_args: string[];
};

// ---------------------------------------------------------------------------
// Default allowlist
// ---------------------------------------------------------------------------

/**
 * Safe-by-default allowlist for common development and introspection
 * commands. The list is intentionally conservative -- operators can extend
 * it via configuration.
 */
const DEFAULT_ENTRIES: CliAllowlistEntry[] = [
  {
    command_pattern: "git",
    allowed_args: ["*"],
    denied_args: ["push --force", "reset --hard", "clean -fd"],
  },
  {
    command_pattern: "ls",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "cat",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "head",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "tail",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "wc",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "grep",
    allowed_args: ["*"],
    denied_args: [],
  },
  {
    command_pattern: "find",
    allowed_args: ["*"],
    denied_args: ["-delete", "-exec rm"],
  },
  {
    command_pattern: "curl",
    allowed_args: ["*"],
    denied_args: ["--upload-file", "-T"],
  },
  {
    command_pattern: "node",
    allowed_args: ["--version", "-v", "-e"],
    denied_args: [],
  },
  {
    command_pattern: "npm",
    allowed_args: ["list", "view", "info", "ls", "outdated", "audit"],
    denied_args: ["publish"],
  },
  {
    command_pattern: "pnpm",
    allowed_args: ["list", "why", "outdated", "audit"],
    denied_args: ["publish"],
  },
  {
    command_pattern: "gads",
    allowed_args: ["*"],
    denied_args: ["--delete-account", "--close-account"],
  },
  {
    command_pattern: "google-ads",
    allowed_args: ["*"],
    denied_args: ["--delete-account", "--close-account"],
  },
];

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

/**
 * Validates CLI commands against a configurable allowlist.
 *
 * The evaluation order is:
 * 1. Find an entry whose `command_pattern` matches the command.
 * 2. If no entry matches, the command is **denied**.
 * 3. Check `denied_args` -- if any denied pattern matches, **deny**.
 * 4. Check `allowed_args` -- if the list is non-empty, at least one
 *    pattern must match; otherwise **deny**.
 * 5. If all checks pass, **allow**.
 */
export class CliAllowlist {
  private readonly entries: CliAllowlistEntry[];

  constructor(entries?: CliAllowlistEntry[]) {
    this.entries = entries ?? [...DEFAULT_ENTRIES];
  }

  /**
   * Check whether a command with the given arguments is allowed.
   *
   * @returns `true` when the command passes all gates, `false` otherwise.
   */
  isAllowed(command: string, args: string[]): boolean {
    const entry = this.entries.find((e) => matchPattern(e.command_pattern, command));

    // No matching entry -- deny by default.
    if (!entry) {
      return false;
    }

    const joinedArgs = args.join(" ");

    // Deny rules take precedence.
    for (const denied of entry.denied_args) {
      if (joinedArgs.includes(denied)) {
        return false;
      }
    }

    // If no explicit allow patterns, the command itself is enough.
    if (entry.allowed_args.length === 0) {
      return true;
    }

    // Wildcard allows everything.
    if (entry.allowed_args.includes("*")) {
      return true;
    }

    // At least one allowed pattern must match.
    return entry.allowed_args.some((pattern) => joinedArgs.includes(pattern));
  }

  /** Add an entry to the allowlist at runtime. */
  addEntry(entry: CliAllowlistEntry): void {
    this.entries.push(entry);
  }

  /** Return a shallow copy of the current entries (for inspection / serialization). */
  getEntries(): CliAllowlistEntry[] {
    return [...this.entries];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple pattern matcher -- supports exact match and trailing wildcard.
 * This is intentionally minimal; full glob support can be added later.
 */
function matchPattern(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}
