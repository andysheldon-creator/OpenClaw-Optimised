/**
 * Batched Writer - Asynchronous batched file writes with fallback to sync
 *
 * Batches multiple append calls and writes them in groups for better I/O efficiency.
 * Falls back to sync writes if async fails.
 */

import { appendFileSync, appendFile } from "node:fs";
import { promisify } from "node:util";

const appendFileAsync = promisify(appendFile);

interface TranscriptWriter {
  append(path: string, line: string): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Create a singleton batched writer instance.
 */
let singletonWriter: TranscriptWriter | null = null;

function createBatchedWriter(): TranscriptWriter {
  const queue = new Map<string, string[]>();
  let flushTimer: NodeJS.Timeout | null = null;
  const BATCH_INTERVAL_MS = 500;
  const BATCH_SIZE = 50;

  async function flush(): Promise<void> {
    const entries = Array.from(queue.entries());
    if (entries.length === 0) {
      return;
    }

    queue.clear();

    await Promise.all(
      entries.map(async ([path, lines]) => {
        const content = lines.join("\n") + "\n";
        try {
          await appendFileAsync(path, content);
        } catch {
          // Fallback to sync write
          try {
            appendFileSync(path, content);
          } catch (syncErr) {
            console.error(`[BatchedWriter] Failed to write to ${path}:`, syncErr);
          }
        }
      }),
    );
  }

  function scheduleFlush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(flush, BATCH_INTERVAL_MS);
  }

  return {
    async append(path: string, line: string): Promise<void> {
      if (!queue.has(path)) {
        queue.set(path, []);
      }
      const lines = queue.get(path)!;
      lines.push(line);

      if (lines.length >= BATCH_SIZE) {
        await flush();
      } else {
        scheduleFlush();
      }
    },

    flush,
  };
}

/**
 * Get the singleton batched writer instance.
 */
export function getTranscriptWriter(): TranscriptWriter {
  if (!singletonWriter) {
    singletonWriter = createBatchedWriter();
  }
  return singletonWriter;
}
