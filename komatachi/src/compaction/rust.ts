/**
 * Compaction Module - Rust-backed Implementation
 *
 * This module provides the same interface as index.ts but uses
 * the Rust native module for core computation.
 *
 * Design: TypeScript handles async orchestration (calling the summarizer),
 * Rust handles pure computation (token estimation, metadata extraction).
 */

import * as native from "../../crates/compaction/index.js";

// Re-export types that match the original interface
export type {
  Message,
  ToolFailure,
  CompactionMetadata,
} from "../../crates/compaction/index.js";

// -----------------------------------------------------------------------------
// Types (matching original interface)
// -----------------------------------------------------------------------------

/**
 * File operations tracked during a session.
 * Uses Set for the public interface (matching original),
 * converted to arrays when calling Rust.
 */
export interface FileOperations {
  read: Set<string>;
  edited: Set<string>;
  written: Set<string>;
}

/**
 * Configuration for compaction.
 */
export interface CompactionConfig {
  maxInputTokens: number;
  summarize: (messages: native.Message[], previousSummary?: string) => Promise<string>;
  customInstructions?: string;
  previousSummary?: string;
}

/**
 * Result of compaction.
 */
export interface CompactionResult {
  summary: string;
  inputTokens: number;
  metadata: native.CompactionMetadata;
}

/**
 * Options for creating a model-based summarizer.
 */
export interface SummarizerOptions {
  contextWindow: number;
  callModel: (prompt: string, signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
  customInstructions?: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const TOKEN_SAFETY_MARGIN = native.getTokenSafetyMargin();

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

export class InputTooLargeError extends Error {
  constructor(
    public readonly inputTokens: number,
    public readonly maxTokens: number
  ) {
    super(
      `Input too large to compact: ${inputTokens} tokens exceeds maximum ${maxTokens} tokens. ` +
      `Caller should reduce input size before attempting compaction.`
    );
    this.name = "InputTooLargeError";
  }
}

// -----------------------------------------------------------------------------
// Adapters (Set <-> Array)
// -----------------------------------------------------------------------------

function fileOpsToNative(fileOps: FileOperations): native.FileOperations {
  return {
    read: [...fileOps.read],
    edited: [...fileOps.edited],
    written: [...fileOps.written],
  };
}

// -----------------------------------------------------------------------------
// Re-exported Functions (delegating to Rust)
// -----------------------------------------------------------------------------

export function estimateTokens(message: native.Message): number {
  return native.estimateTokens(message);
}

export function estimateMessagesTokens(messages: native.Message[]): number {
  return native.estimateMessagesTokens(messages);
}

export function canCompact(
  messages: native.Message[],
  maxInputTokens: number
): { ok: true } | { ok: false; reason: string; inputTokens: number } {
  const result = native.canCompact(messages, maxInputTokens);
  if (result.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: result.reason!,
    inputTokens: result.inputTokens!,
  };
}

export function extractToolFailures(messages: native.Message[]): native.ToolFailure[] {
  return native.extractToolFailures(messages);
}

export function computeFileLists(fileOps: FileOperations): {
  filesRead: string[];
  filesModified: string[];
} {
  return native.computeFileLists(fileOpsToNative(fileOps));
}

export function formatToolFailuresSection(failures: native.ToolFailure[]): string {
  return native.formatToolFailuresSection(failures);
}

export function formatFileOperationsSection(
  filesRead: string[],
  filesModified: string[]
): string {
  return native.formatFileOperationsSection(filesRead, filesModified);
}

export function calculateMaxInputTokens(contextWindow: number): number {
  return native.calculateMaxInputTokens(contextWindow);
}

// -----------------------------------------------------------------------------
// Core Compaction (TypeScript orchestration + Rust computation)
// -----------------------------------------------------------------------------

const FALLBACK_SUMMARY = "Summary unavailable. Older conversation history was truncated.";

export async function compact(
  messages: native.Message[],
  fileOps: FileOperations,
  config: CompactionConfig
): Promise<CompactionResult> {
  const nativeFileOps = fileOpsToNative(fileOps);

  // Handle empty input
  if (messages.length === 0) {
    const fileLists = native.computeFileLists(nativeFileOps);
    return {
      summary: config.previousSummary || "No prior conversation history.",
      inputTokens: 0,
      metadata: {
        toolFailures: [],
        filesRead: fileLists.filesRead,
        filesModified: fileLists.filesModified,
      },
    };
  }

  // Prepare compaction (validates, extracts metadata, formats sections)
  let prepared: native.PreparedCompaction;
  try {
    prepared = native.prepareCompaction(messages, nativeFileOps, config.maxInputTokens);
  } catch (error) {
    // Convert Rust error to our error type
    if (error instanceof Error && error.message.includes("Input too large")) {
      // Parse tokens from error message
      const match = error.message.match(/(\d+) tokens exceeds maximum (\d+)/);
      if (match) {
        throw new InputTooLargeError(parseInt(match[1]), parseInt(match[2]));
      }
    }
    throw error;
  }

  // Call the summarizer (async, in TypeScript)
  let summary: string;
  try {
    summary = await config.summarize(messages, config.previousSummary);
  } catch (error) {
    console.warn(
      `Compaction summarization failed: ${error instanceof Error ? error.message : String(error)}`
    );
    summary = FALLBACK_SUMMARY;
  }

  // Assemble final summary (Rust)
  const finalSummary = native.assembleSummary(
    summary,
    prepared.failuresSection,
    prepared.filesSection
  );

  return {
    summary: finalSummary,
    inputTokens: prepared.inputTokens,
    metadata: prepared.metadata,
  };
}

// -----------------------------------------------------------------------------
// Summarizer Factory
// -----------------------------------------------------------------------------

export function createSummarizer(
  options: SummarizerOptions
): (messages: native.Message[], previousSummary?: string) => Promise<string> {
  return async (messages: native.Message[], previousSummary?: string): Promise<string> => {
    const conversationText = messages
      .map((msg) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return `[${msg.role}]: ${content}`;
      })
      .join("\n\n");

    let prompt = `Summarize this conversation, preserving:
- Key decisions made
- Outstanding tasks and TODOs
- Important constraints or requirements
- Any errors or failures that should be remembered

${options.customInstructions ? `Additional focus: ${options.customInstructions}\n\n` : ""}`;

    if (previousSummary) {
      prompt += `Previous context:\n${previousSummary}\n\n`;
    }

    prompt += `Conversation:\n${conversationText}`;

    return options.callModel(prompt, options.signal);
  };
}
