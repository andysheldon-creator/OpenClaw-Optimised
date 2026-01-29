/**
 * Pre-Exec Hooks for Clawdbot
 *
 * Claude Code-style hook system for intercepting and approving/denying
 * Bash/exec tool calls before they run.
 *
 * Hook Discovery:
 * - <workspace>/.clawdbot/hooks/ (preferred)
 * - <workspace>/hooks/ (fallback, for workspace compatibility)
 *
 * Hook Format (shell scripts):
 * - Receive JSON on stdin: {"tool_name": "exec"|"Bash", "tool_input": {...}}
 * - Output JSON: {"decision": "approve"|"deny", "reason": "optional message"}
 *
 * Reference: Claude Code hooks in ~/code/yieldnest/yieldnest-api/.claude/hooks/
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface PreExecHookInput {
  tool_name: string; // "exec" | "Bash"
  tool_input: {
    command: string;
    workdir?: string;
    env?: Record<string, string>;
    [key: string]: unknown;
  };
}

export interface PreExecHookOutput {
  decision: "approve" | "deny";
  reason?: string;
}

export interface PreExecHookResult {
  decision: "approve" | "deny";
  reason?: string;
  hookPath?: string;
  hookName?: string;
  durationMs: number;
}

export interface DiscoveredHook {
  path: string;
  name: string;
  source: "clawdbot-hooks" | "workspace-hooks";
}

export interface PreExecHookConfig {
  enabled?: boolean;
  timeoutMs?: number;
  // Hook directories to search (relative to workspace)
  hookDirs?: string[];
  // Skip hooks matching these patterns
  skipPatterns?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HOOK_DIRS = [".clawdbot/hooks", "hooks"];
const DEFAULT_TIMEOUT_MS = 10_000;
const HOOK_FILE_EXTENSIONS = [".sh", ".bash", ".zsh", ".fish", ""];

// ============================================================================
// Hook Discovery
// ============================================================================

/**
 * Check if a file is executable
 */
function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file looks like a shell script
 */
function isShellScript(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    if (HOOK_FILE_EXTENSIONS.includes(ext)) {
      // Check shebang for extensionless files
      if (ext === "") {
        const content = fs.readFileSync(filePath, "utf-8");
        const firstLine = content.split("\n")[0] || "";
        return firstLine.startsWith("#!");
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Discover all pre-exec hooks in a directory
 */
function discoverHooksInDir(
  dir: string,
  source: DiscoveredHook["source"]
): DiscoveredHook[] {
  const hooks: DiscoveredHook[] = [];

  if (!fs.existsSync(dir)) return hooks;

  try {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return hooks;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && isExecutable(fullPath) && isShellScript(fullPath)) {
        hooks.push({
          path: fullPath,
          name: entry.name,
          source,
        });
      }
    }
  } catch (err) {
    console.warn(`[pre-exec-hooks] Failed to scan directory ${dir}:`, err);
  }

  return hooks;
}

/**
 * Discover all pre-exec hooks for a workspace
 */
export function discoverPreExecHooks(
  workspaceDir: string,
  config?: PreExecHookConfig
): DiscoveredHook[] {
  const hookDirs = config?.hookDirs ?? DEFAULT_HOOK_DIRS;
  const allHooks: DiscoveredHook[] = [];
  const seenNames = new Set<string>();

  // Process directories in order (first wins for duplicates)
  for (const relDir of hookDirs) {
    const absDir = path.resolve(workspaceDir, relDir);
    const source: DiscoveredHook["source"] =
      relDir === ".clawdbot/hooks" ? "clawdbot-hooks" : "workspace-hooks";

    const hooks = discoverHooksInDir(absDir, source);

    for (const hook of hooks) {
      if (!seenNames.has(hook.name)) {
        seenNames.add(hook.name);
        allHooks.push(hook);
      }
    }
  }

  // Filter by skip patterns if configured
  if (config?.skipPatterns?.length) {
    const patterns = config.skipPatterns.map(
      (p) => new RegExp(p.replace(/\*/g, ".*"), "i")
    );
    return allHooks.filter(
      (hook) => !patterns.some((p) => p.test(hook.name) || p.test(hook.path))
    );
  }

  return allHooks;
}

// ============================================================================
// Hook Execution
// ============================================================================

/**
 * Execute a single pre-exec hook
 */
async function executeHook(
  hook: DiscoveredHook,
  input: PreExecHookInput,
  timeoutMs: number
): Promise<PreExecHookOutput> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let settled = false;

    const settle = (output: PreExecHookOutput) => {
      if (settled) return;
      settled = true;
      resolve(output);
    };

    // Default to approve on timeout/error (fail-open for safety)
    const timer = setTimeout(() => {
      console.warn(
        `[pre-exec-hooks] Hook ${hook.name} timed out after ${timeoutMs}ms`
      );
      settle({ decision: "approve", reason: "hook timed out" });
    }, timeoutMs);

    try {
      const child = spawn(hook.path, [], {
        cwd: path.dirname(hook.path),
        env: {
          ...process.env,
          CLAWDBOT_HOOK_NAME: hook.name,
          CLAWDBOT_TOOL_NAME: input.tool_name,
        },
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // Write input JSON to stdin
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();

      child.on("error", (err) => {
        clearTimeout(timer);
        console.warn(`[pre-exec-hooks] Hook ${hook.name} error:`, err);
        settle({ decision: "approve", reason: `hook error: ${err.message}` });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (code !== 0) {
          console.warn(
            `[pre-exec-hooks] Hook ${hook.name} exited with code ${code}`
          );
          if (stderr) {
            console.warn(`[pre-exec-hooks] stderr: ${stderr.slice(0, 500)}`);
          }
          // Non-zero exit defaults to approve (fail-open)
          settle({
            decision: "approve",
            reason: `hook exited with code ${code}`,
          });
          return;
        }

        // Parse output
        try {
          const trimmed = stdout.trim();
          if (!trimmed) {
            settle({ decision: "approve" });
            return;
          }

          // Handle multiple lines of output - take the last JSON line
          const lines = trimmed.split("\n").filter((l) => l.trim());
          const lastLine = lines[lines.length - 1];

          const output = JSON.parse(lastLine) as PreExecHookOutput;

          // Validate decision field
          if (output.decision !== "approve" && output.decision !== "deny") {
            console.warn(
              `[pre-exec-hooks] Hook ${hook.name} returned invalid decision: ${output.decision}`
            );
            settle({ decision: "approve", reason: "invalid hook response" });
            return;
          }

          settle(output);
        } catch (parseErr) {
          console.warn(
            `[pre-exec-hooks] Hook ${hook.name} output parse error:`,
            parseErr
          );
          console.warn(`[pre-exec-hooks] stdout: ${stdout.slice(0, 500)}`);
          settle({ decision: "approve", reason: "hook output parse error" });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[pre-exec-hooks] Failed to spawn hook ${hook.name}:`, err);
      settle({ decision: "approve", reason: "failed to spawn hook" });
    }
  });
}

/**
 * Run all pre-exec hooks for a tool call
 *
 * Returns the aggregated result:
 * - If any hook returns "deny", the overall result is "deny"
 * - If all hooks return "approve", the overall result is "approve"
 */
export async function runPreExecHooks(
  workspaceDir: string,
  input: PreExecHookInput,
  config?: PreExecHookConfig
): Promise<PreExecHookResult> {
  const startTime = Date.now();

  // Check if hooks are enabled
  if (config?.enabled === false) {
    return {
      decision: "approve",
      reason: "hooks disabled",
      durationMs: Date.now() - startTime,
    };
  }

  // Discover hooks
  const hooks = discoverPreExecHooks(workspaceDir, config);

  if (hooks.length === 0) {
    return {
      decision: "approve",
      reason: "no hooks found",
      durationMs: Date.now() - startTime,
    };
  }

  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Run hooks sequentially (short-circuit on deny)
  for (const hook of hooks) {
    const result = await executeHook(hook, input, timeoutMs);

    if (result.decision === "deny") {
      return {
        decision: "deny",
        reason: result.reason,
        hookPath: hook.path,
        hookName: hook.name,
        durationMs: Date.now() - startTime,
      };
    }
  }

  return {
    decision: "approve",
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * Check if a command should be allowed to run
 *
 * This is the main entry point for integrating with bash-tools.exec.ts
 */
export async function checkPreExecApproval(params: {
  workspaceDir: string;
  toolName: string;
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  config?: PreExecHookConfig;
}): Promise<{
  allowed: boolean;
  reason?: string;
  hookName?: string;
  durationMs: number;
}> {
  const input: PreExecHookInput = {
    tool_name: params.toolName,
    tool_input: {
      command: params.command,
      workdir: params.workdir,
      env: params.env,
    },
  };

  const result = await runPreExecHooks(
    params.workspaceDir,
    input,
    params.config
  );

  return {
    allowed: result.decision === "approve",
    reason: result.reason,
    hookName: result.hookName,
    durationMs: result.durationMs,
  };
}

// ============================================================================
// CLI Testing Helper
// ============================================================================

/**
 * Test pre-exec hooks from command line
 */
export async function testPreExecHooks(
  workspaceDir: string,
  command: string
): Promise<void> {
  console.log(`Testing pre-exec hooks in: ${workspaceDir}`);
  console.log(`Command: ${command}\n`);

  const hooks = discoverPreExecHooks(workspaceDir);
  console.log(`Discovered ${hooks.length} hooks:`);
  for (const hook of hooks) {
    console.log(`  - ${hook.name} (${hook.source}): ${hook.path}`);
  }
  console.log();

  const result = await checkPreExecApproval({
    workspaceDir,
    toolName: "Bash",
    command,
  });

  console.log(`Result: ${result.allowed ? "APPROVED" : "DENIED"}`);
  if (result.reason) {
    console.log(`Reason: ${result.reason}`);
  }
  if (result.hookName) {
    console.log(`Hook: ${result.hookName}`);
  }
  console.log(`Duration: ${result.durationMs}ms`);
}
