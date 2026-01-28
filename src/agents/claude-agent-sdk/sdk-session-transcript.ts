/**
 * Session transcript persistence for the Claude Agent SDK.
 *
 * Appends user/assistant turn pairs to the session JSONL file for
 * multi-turn continuity when using the SDK main-agent mode.
 */

import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk/sdk-session-transcript");

type TranscriptRole = "user" | "assistant";

function fileEndsWithNewline(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return true;
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(1);
      fs.readSync(fd, buffer, 0, 1, stat.size - 1);
      return buffer[0] === 0x0a;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return true;
  }
}

function appendJsonlLine(params: { filePath: string; value: unknown }) {
  fs.mkdirSync(path.dirname(params.filePath), { recursive: true });
  const prefix =
    fs.existsSync(params.filePath) && !fileEndsWithNewline(params.filePath) ? "\n" : "";
  fs.appendFileSync(params.filePath, `${prefix}${JSON.stringify(params.value)}\n`, "utf-8");
}

/**
 * Append a single text turn to the session transcript.
 */
export function appendSdkTextTurnToSessionTranscript(params: {
  sessionFile: string;
  role: TranscriptRole;
  text: string;
  timestamp?: number;
}): void {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  try {
    appendJsonlLine({
      filePath: params.sessionFile,
      value: {
        role: params.role,
        content: [{ type: "text", text: trimmed }],
        timestamp: params.timestamp ?? Date.now(),
      },
    });
  } catch (err) {
    log.debug(`Failed to append transcript: ${String(err)}`);
  }
}

/**
 * Append a user/assistant turn pair to the session transcript.
 *
 * This enables multi-turn continuity for the SDK main-agent mode
 * by recording both the user prompt and assistant response.
 */
export function appendSdkTurnPairToSessionTranscript(params: {
  sessionFile: string;
  prompt: string;
  assistantText?: string;
  timestamp?: number;
}): void {
  const ts = params.timestamp ?? Date.now();
  appendSdkTextTurnToSessionTranscript({
    sessionFile: params.sessionFile,
    role: "user",
    text: params.prompt,
    timestamp: ts,
  });
  if (params.assistantText) {
    appendSdkTextTurnToSessionTranscript({
      sessionFile: params.sessionFile,
      role: "assistant",
      text: params.assistantText,
      timestamp: ts,
    });
  }
}
