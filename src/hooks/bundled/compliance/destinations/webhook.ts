/**
 * Webhook Destination
 *
 * Sends compliance events to an HTTP endpoint via POST.
 * Supports optional batching for high-throughput scenarios.
 */

import type { ComplianceEmitter, ComplianceEvent, WebhookDestination } from "../types.js";

export function createWebhookEmitter(
  config: WebhookDestination,
  logger?: { warn: (msg: string) => void },
): ComplianceEmitter {
  const timeoutMs = config.timeoutMs ?? 5000;
  const batchEnabled = config.batch ?? false;
  const batchSize = config.batchSize ?? 100;
  const batchFlushMs = config.batchFlushMs ?? 1000;

  let batch: ComplianceEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function sendEvents(events: ComplianceEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.headers,
        },
        body: JSON.stringify(events.length === 1 ? events[0] : { events }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger?.warn(`[compliance:webhook] HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        logger?.warn(`[compliance:webhook] Request timed out after ${timeoutMs}ms`);
      } else {
        logger?.warn(`[compliance:webhook] Request failed: ${String(err)}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, batchFlushMs);
  }

  async function flush(): Promise<void> {
    if (batch.length === 0) {
      return;
    }
    const events = batch;
    batch = [];
    await sendEvents(events);
  }

  async function emit(event: ComplianceEvent): Promise<void> {
    if (batchEnabled) {
      batch.push(event);
      if (batch.length >= batchSize) {
        await flush();
      } else {
        scheduleFlush();
      }
    } else {
      await sendEvents([event]);
    }
  }

  async function close(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flush();
  }

  return { emit, flush, close };
}
