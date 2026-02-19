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
  /** Conversation history block (formatted transcript of recent turns). */
  conversationHistory?: string;
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
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes; reply.ts may override

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

  // ── Build the prompt with optional personality preamble ─────────
  // We do NOT use the --system-prompt CLI flag (it causes hangs).
  // Instead, when a systemPrompt is provided, we prepend it directly
  // into the -p prompt text so the CLI receives one self-contained
  // string containing both the personality context and the user message.
  const MAX_SYSTEM_CHARS = 32000;
  let composedPrompt = params.prompt;

  if (params.systemPrompt) {
    const trimmed =
      params.systemPrompt.length > MAX_SYSTEM_CHARS
        ? params.systemPrompt.slice(0, MAX_SYSTEM_CHARS).trimEnd() + "\n…"
        : params.systemPrompt;
    const historyBlock = params.conversationHistory
      ? `\n${params.conversationHistory}\n`
      : "";
    composedPrompt =
      `[SYSTEM CONTEXT — follow these instructions for every response]\n${trimmed}\n` +
      historyBlock +
      `\n[USER MESSAGE]\n${params.prompt}`;
  }

  // Keep args as lean as possible — extra flags (--session-id,
  // --system-prompt flag, --verbose) have been observed to cause
  // `claude -p` to hang for 10+ minutes on some systems.
  //
  // For large prompts (>8KB), pipe via stdin instead of passing as a
  // command-line argument.  This avoids OS ARG_MAX limits and potential
  // issues with shell escaping of very large strings.
  const STDIN_THRESHOLD = 8_000;
  const useStdin = composedPrompt.length > STDIN_THRESHOLD;
  const args = useStdin
    ? ["-p", "--output-format", "text"]
    : ["-p", composedPrompt, "--output-format", "text"];

  // --model: only add if the caller explicitly set one
  if (params.model) {
    args.push("--model", params.model);
  }

  defaultRuntime.log?.(
    `[claude-cli] starting: runId=${params.runId} session=${params.sessionId} model=${model} promptLen=${composedPrompt.length} stdin=${useStdin}`,
  );

  return new Promise<ClaudeCliRunResult>((resolve, reject) => {
    // Build a clean env for the child process:
    // - Remove CLAUDECODE to avoid "nested session" detection
    // - Remove CLAUDE_SESSION_ID to avoid session conflicts
    // - Remove ANTHROPIC_API_KEY so the CLI uses the user's subscription
    //   instead of trying to make API calls with a potentially empty/expired key
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_SESSION_ID;
    delete childEnv.ANTHROPIC_API_KEY;

    const proc = spawn("claude", args, {
      cwd: params.workspaceDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    });

    // When piping via stdin, write the prompt and close stdin.
    // When using -p arg, close stdin immediately so claude -p doesn't
    // wait for EOF and hang.
    if (useStdin) {
      proc.stdin?.write(composedPrompt, "utf-8");
    }
    proc.stdin?.end();

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
      const stdoutTrimmed = stdout.trim();
      const stderrTrimmed = stderr.trim();

      defaultRuntime.log?.(
        `[claude-cli] done: runId=${params.runId} exit=${code ?? "null"} durationMs=${durationMs} stdoutLen=${stdoutTrimmed.length} stderrLen=${stderrTrimmed.length}`,
      );

      if (stderrTrimmed) {
        defaultRuntime.log?.(
          `[claude-cli] stderr: ${stderrTrimmed.slice(0, 500)}`,
        );
      }

      if (!stdoutTrimmed && stderrTrimmed) {
        // CLI produced no stdout but did write to stderr — likely an
        // error message.  Return stderr as the text so the caller can
        // surface it rather than silently falling through.
        defaultRuntime.log?.(
          `[claude-cli] no stdout — returning stderr as response text`,
        );
      }

      resolve({
        text: stdoutTrimmed || (stderrTrimmed ? `[claude-cli error] ${stderrTrimmed.slice(0, 500)}` : ""),
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
