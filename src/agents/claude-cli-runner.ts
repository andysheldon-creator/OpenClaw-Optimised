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
 * - Uses --resume with --session-id for conversation continuity.
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
  /**
   * When true, resume the conversation identified by `sessionId`.
   * The first turn in a new session should set this to false so that
   * the system prompt is established; subsequent turns set it to true
   * so `claude -p --resume <sessionId>` maintains context.
   */
  resumeSession?: boolean;
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
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes; reply.ts may override

/**
 * Spawn `claude -p` and return the response text.
 * This runs a single prompt through the Claude Code CLI in non-interactive mode.
 *
 * Session continuity:
 * - First turn: uses `--session-id <sessionId>` + `--system-prompt` to start
 *   a new CLI session with the full workspace personality.
 * - Subsequent turns: uses `--resume <sessionId>` so the CLI loads the prior
 *   conversation context. The system prompt is omitted on resume since the
 *   CLI persists it from the first turn.
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

  // Session continuity: on the first turn we start a named session with the
  // full system prompt; on subsequent turns we resume that session so the
  // CLI loads conversation history automatically.
  if (params.resumeSession) {
    args.push("--resume", params.sessionId);
  } else {
    // New session — pin the session-id so we can resume it later.
    args.push("--session-id", params.sessionId);
  }

  // System prompt: Claude Code reads CLAUDE.md files from the workspace
  // automatically, so we only pass a short personality hint rather than
  // the full 30KB+ workspace bootstrap.  Passing large --system-prompt
  // values causes `claude -p` to hang/timeout on many systems.
  if (params.systemPrompt && !params.resumeSession) {
    // Truncate to a short personality summary (max ~2000 chars) to avoid
    // command-line size issues.  The full context lives in workspace files
    // that Claude Code discovers on its own.
    const maxLen = 2000;
    const truncated =
      params.systemPrompt.length > maxLen
        ? params.systemPrompt.slice(0, maxLen).trimEnd() +
          "\n\n[System prompt truncated — see workspace CLAUDE.md for full context]"
        : params.systemPrompt;
    args.push("--system-prompt", truncated);
  }

  defaultRuntime.log?.(
    `[claude-cli] starting: runId=${params.runId} session=${params.sessionId} model=${model}`,
  );

  return new Promise<ClaudeCliRunResult>((resolve, reject) => {
    // Build a clean env for the child process:
    // - Remove CLAUDECODE to avoid "nested session" detection
    // - Remove CLAUDE_SESSION_ID to avoid session conflicts
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_SESSION_ID;

    const proc = spawn("claude", args, {
      cwd: params.workspaceDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
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
      const text = chunk.toString();
      stderr += text;
      // Log stderr in real-time so we can diagnose hangs
      if (text.trim()) {
        defaultRuntime.log?.(
          `[claude-cli] stderr (live): ${text.trim().slice(0, 300)}`,
        );
      }
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

/** Hard cap on pending queue entries to prevent unbounded memory growth. */
export const MAX_QUEUE_DEPTH = 20;

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
 * Rejects immediately if the queue is full (>{@link MAX_QUEUE_DEPTH} pending).
 */
export async function runClaudeCliQueued(
  params: ClaudeCliRunParams,
): Promise<ClaudeCliRunResult> {
  return new Promise<ClaudeCliRunResult>((resolve, reject) => {
    if (queue.length >= MAX_QUEUE_DEPTH) {
      reject(
        new Error(
          `[claude-cli] Queue full (${queue.length}/${MAX_QUEUE_DEPTH}). ` +
            `Rejecting runId=${params.runId}`,
        ),
      );
      return;
    }
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
