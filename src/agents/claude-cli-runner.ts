/**
 * Claude CLI Runner — Backend for Claude Code Subscription mode.
 *
 * Spawns `claude -p` (headless prompt mode) to handle queries via a
 * user's Claude Pro/Max subscription.  This is an alternative to the
 * Pi Embedded Runner which uses the Anthropic API (pay-per-token).
 *
 * Key constraints:
 * - Only one `claude -p` process at a time (sequential queue).
 * - Subscription defaults to Sonnet 4.5 for cost efficiency.
 * - Falls back to Pi Embedded Runner if `claude` CLI is unavailable.
 */

import { spawn } from "node:child_process";

import { defaultRuntime } from "../runtime.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClaudeCliRunParams = {
  /** The user's prompt / message text. */
  prompt: string;
  /** Working directory (agent workspace). */
  workspaceDir: string;
  /** Model to use (default: "claude-sonnet-4-5"). */
  model?: string;
  /** System prompt injected from workspace files (SOUL.md, etc.). */
  systemPrompt?: string;
  /** Timeout in milliseconds (default: 120_000). */
  timeoutMs?: number;
  /** Unique run identifier for logging. */
  runId: string;
  /** Session identifier for logging. */
  sessionId: string;
};

export type ClaudeCliRunResult = {
  /** The assistant's response text. */
  text: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Model used for the response. */
  model: string;
  /** Process exit code (0 = success). */
  exitCode: number;
};

// ─── Core Runner ────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Spawn `claude -p` and return the response text.
 * This runs a single prompt through the Claude Code CLI in non-interactive mode.
 */
export async function runClaudeCli(
  params: ClaudeCliRunParams,
): Promise<ClaudeCliRunResult> {
  const model = params.model ?? DEFAULT_MODEL;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();

  const args = ["-p", params.prompt, "--output-format", "text"];

  // Pass model hint (Claude Code may or may not honour this depending on
  // subscription tier, but it's the best we can do).
  if (model) {
    args.push("--model", model);
  }

  // System prompt via --system-prompt flag
  if (params.systemPrompt) {
    args.push("--system-prompt", params.systemPrompt);
  }

  defaultRuntime.log?.(
    `[claude-cli] starting: runId=${params.runId} session=${params.sessionId} model=${model}`,
  );

  return new Promise<ClaudeCliRunResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd: params.workspaceDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        resolve({
          text: stdout.trim() || "[claude-cli] Timed out waiting for response.",
          durationMs: Date.now() - started,
          model,
          exitCode: 124, // timeout exit code convention
        });
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const durationMs = Date.now() - started;

      if (stderr.trim()) {
        defaultRuntime.log?.(
          `[claude-cli] stderr: ${stderr.trim().slice(0, 200)}`,
        );
      }

      defaultRuntime.log?.(
        `[claude-cli] done: runId=${params.runId} exit=${code ?? "null"} durationMs=${durationMs}`,
      );

      resolve({
        text: stdout.trim(),
        durationMs,
        model,
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── Sequential Queue ───────────────────────────────────────────────────────
// Only one `claude -p` process should run at a time to avoid overwhelming
// the subscription rate limits and ensuring coherent responses.

type QueueEntry = {
  params: ClaudeCliRunParams;
  resolve: (result: ClaudeCliRunResult) => void;
  reject: (err: unknown) => void;
};

let running = false;
const queue: QueueEntry[] = [];

/**
 * Queue a Claude CLI run.  If no other run is active, starts immediately.
 * Otherwise the request is queued and processed sequentially.
 */
export async function runClaudeCliQueued(
  params: ClaudeCliRunParams,
): Promise<ClaudeCliRunResult> {
  return new Promise<ClaudeCliRunResult>((resolve, reject) => {
    queue.push({ params, resolve, reject });
    if (queue.length > 1) {
      defaultRuntime.log?.(
        `[claude-cli] queued: runId=${params.runId} position=${queue.length}`,
      );
    }
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (running || queue.length === 0) return;
  running = true;

  const entry = queue.shift();
  if (!entry) {
    running = false;
    return;
  }

  try {
    const result = await runClaudeCli(entry.params);
    entry.resolve(result);
  } catch (err) {
    entry.reject(err);
  } finally {
    running = false;
    processQueue();
  }
}

/**
 * Get the current queue depth (for monitoring / logging).
 */
export function getQueueDepth(): number {
  return queue.length + (running ? 1 : 0);
}
