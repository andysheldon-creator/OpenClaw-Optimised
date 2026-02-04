/**
 * JSONL request logger for Ollama context manager.
 *
 * Uses the existing DEFAULT_LOG_DIR pattern from src/logging/logger.ts.
 * Logs are written to a subfolder to avoid polluting the main log directory.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { DEFAULT_LOG_DIR } from "../../../logging/logger.js";
import type { ChunkManifestEntry } from "../context/chunk-selector.js";

/** Subdirectory for Ollama context manager logs */
const OLLAMA_LOG_SUBDIR = "ollama";

/**
 * Log entry for an Ollama request.
 */
export interface RequestLogEntry {
  /** ISO8601 timestamp */
  timestamp: string;
  /** Unique request identifier */
  requestId: string;
  /** Model name */
  model: string;
  /** Estimated tokens before sending */
  tokenEstimate: number;
  /** Actual prompt tokens reported by Ollama */
  actualPromptTokens?: number;
  /** SHA256 hash of the assembled prompt */
  promptHash: string;
  /** Chunk manifest (what was included/excluded) */
  chunkManifest: ChunkManifestEntry[];
  /** Response metadata (without the huge context array) */
  responseMetadata?: {
    done: boolean;
    doneReason?: string;
    evalCount?: number;
    promptEvalCount?: number;
    durationMs?: number;
  };
  /** Error information if request failed */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Configuration for request logger.
 */
export interface RequestLoggerConfig {
  /** Log directory. Default: DEFAULT_LOG_DIR/ollama */
  logDir?: string;
  /** Whether logging is enabled. Default: true */
  enabled?: boolean;
  /** Maximum log file size in bytes before rotation. Default: 10MB */
  maxFileSizeBytes?: number;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Get the current log file path (dated for rotation).
 */
function getLogFilePath(logDir: string): string {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(logDir, `ollama-${today}.jsonl`);
}

/**
 * Ensure log directory exists.
 */
function ensureLogDir(logDir: string): void {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Check if log file exceeds max size.
 */
function isFileTooLarge(filePath: string, maxSize: number): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.size >= maxSize;
  } catch {
    return false; // File doesn't exist yet
  }
}

/**
 * Create a request logger for Ollama context manager.
 *
 * @param config - Logger configuration
 * @returns Logger with log and flush methods
 */
export function createRequestLogger(config: RequestLoggerConfig = {}) {
  const logDir = config.logDir ?? path.join(DEFAULT_LOG_DIR, OLLAMA_LOG_SUBDIR);
  const enabled = config.enabled ?? true;
  const maxFileSizeBytes = config.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  // Buffer for batching writes
  let buffer: string[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Generate a unique request ID.
   */
  function generateRequestId(): string {
    return randomUUID();
  }

  /**
   * Log a request entry.
   */
  function log(entry: Omit<RequestLogEntry, "timestamp" | "requestId">): string {
    if (!enabled) return "";

    const requestId = generateRequestId();
    const fullEntry: RequestLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      requestId,
    };

    const line = JSON.stringify(fullEntry);
    buffer.push(line);

    // Schedule flush if not already scheduled
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flush().catch(() => {
          // Ignore flush errors - logging should never block
        });
      }, 100); // Flush after 100ms of inactivity
    }

    return requestId;
  }

  /**
   * Flush buffered log entries to disk.
   */
  async function flush(): Promise<void> {
    if (!enabled || buffer.length === 0) return;

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    const toWrite = buffer;
    buffer = [];

    try {
      ensureLogDir(logDir);
      let filePath = getLogFilePath(logDir);

      // Check for rotation
      if (isFileTooLarge(filePath, maxFileSizeBytes)) {
        // Append timestamp to create new file
        const timestamp = Date.now();
        filePath = filePath.replace(".jsonl", `-${timestamp}.jsonl`);
      }

      const content = toWrite.join("\n") + "\n";
      fs.appendFileSync(filePath, content, { encoding: "utf8" });
    } catch {
      // Logging should never throw - silently drop on error
    }
  }

  /**
   * Create a log entry builder for a request.
   * Returns a function to finalize the entry with response data.
   */
  function startRequest(params: {
    model: string;
    tokenEstimate: number;
    promptHash: string;
    chunkManifest: ChunkManifestEntry[];
  }) {
    const startTime = Date.now();

    return {
      /**
       * Complete the log entry with success response.
       */
      success: (response: {
        done: boolean;
        doneReason?: string;
        evalCount?: number;
        promptEvalCount?: number;
      }) => {
        return log({
          model: params.model,
          tokenEstimate: params.tokenEstimate,
          promptHash: params.promptHash,
          chunkManifest: params.chunkManifest,
          actualPromptTokens: response.promptEvalCount,
          responseMetadata: {
            done: response.done,
            doneReason: response.doneReason,
            evalCount: response.evalCount,
            promptEvalCount: response.promptEvalCount,
            durationMs: Date.now() - startTime,
          },
        });
      },

      /**
       * Complete the log entry with error.
       */
      error: (err: Error) => {
        return log({
          model: params.model,
          tokenEstimate: params.tokenEstimate,
          promptHash: params.promptHash,
          chunkManifest: params.chunkManifest,
          error: {
            code: (err as { code?: string }).code ?? "unknown",
            message: err.message,
            stack: err.stack,
          },
        });
      },
    };
  }

  return {
    log,
    flush,
    startRequest,
    generateRequestId,
    /** Log directory path */
    logDir,
    /** Whether logging is enabled */
    enabled,
  };
}

export type RequestLogger = ReturnType<typeof createRequestLogger>;
