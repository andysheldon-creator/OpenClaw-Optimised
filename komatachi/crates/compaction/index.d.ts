/* Auto-generated type definitions for @komatachi/compaction-native */

export interface MessageDetails {
  status?: string;
  exitCode?: number;
}

export interface Message {
  role: string;
  content: unknown;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: MessageDetails;
}

export interface ToolFailure {
  toolCallId: string;
  toolName: string;
  errorSummary: string;
  exitCode?: number;
}

export interface FileOperations {
  read: string[];
  edited: string[];
  written: string[];
}

export interface FileListsResult {
  filesRead: string[];
  filesModified: string[];
}

export interface CompactionMetadata {
  toolFailures: ToolFailure[];
  filesRead: string[];
  filesModified: string[];
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  inputTokens?: number;
}

export interface PreparedCompaction {
  inputTokens: number;
  metadata: CompactionMetadata;
  failuresSection: string;
  filesSection: string;
}

/** Estimate token count for a message (~4 chars per token) */
export function estimateTokens(message: Message): number;

/** Estimate total tokens across multiple messages */
export function estimateMessagesTokens(messages: Message[]): number;

/** Calculate the maximum input tokens for a given context window */
export function calculateMaxInputTokens(contextWindow: number): number;

/** Check if messages can be compacted within the given context window */
export function canCompact(messages: Message[], maxInputTokens: number): ValidationResult;

/** Extract tool failures from messages */
export function extractToolFailures(messages: Message[]): ToolFailure[];

/** Compute file lists from file operations */
export function computeFileLists(fileOps: FileOperations): FileListsResult;

/** Format tool failures as a section to append to the summary */
export function formatToolFailuresSection(failures: ToolFailure[]): string;

/** Format file operations as a section to append to the summary */
export function formatFileOperationsSection(filesRead: string[], filesModified: string[]): string;

/**
 * Prepare compaction: validate input, extract metadata, format sections.
 * Throws if input is too large.
 */
export function prepareCompaction(
  messages: Message[],
  fileOps: FileOperations,
  maxInputTokens: number
): PreparedCompaction;

/** Assemble the final summary from the summarizer output and prepared sections */
export function assembleSummary(
  summary: string,
  failuresSection: string,
  filesSection: string
): string;

/** Get the token safety margin constant (1.2) */
export function getTokenSafetyMargin(): number;
