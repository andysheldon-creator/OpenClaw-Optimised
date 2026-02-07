import type { BlueskyClient, BlueskyMessage } from "./bluesky-client.js";

export interface BlueskyPollerOptions {
  client: BlueskyClient;
  pollInterval: number;
  onMessage: (message: BlueskyMessage) => Promise<void>;
  onError: (error: Error, context: string) => void;
}

/**
 * Polls Bluesky conversations for new DMs.
 *
 * Strategy:
 * 1. On first poll, record the latest message ID per convo (no delivery).
 * 2. On subsequent polls, deliver only messages newer than the last seen ID.
 * 3. Only process messages from other users (skip own messages).
 */
export class BlueskyPoller {
  private readonly client: BlueskyClient;
  private readonly pollInterval: number;
  private readonly onMessage: (message: BlueskyMessage) => Promise<void>;
  private readonly onError: (error: Error, context: string) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeenMessageIds = new Map<string, string>();
  private initialized = false;
  private polling = false;

  constructor(opts: BlueskyPollerOptions) {
    this.client = opts.client;
    this.pollInterval = opts.pollInterval;
    this.onMessage = opts.onMessage;
    this.onError = opts.onError;
  }

  /** Start polling for new DMs */
  start(): void {
    if (this.timer) return;

    // Initial poll to seed last-seen state
    void this.poll();

    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollInterval);
  }

  /** Stop polling */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    // Prevent overlapping polls
    if (this.polling) return;
    this.polling = true;

    try {
      const myDid = this.client.getDid();
      const { convos } = await this.client.listConvos({ limit: 20 });

      for (const convo of convos) {
        try {
          const { messages } = await this.client.getMessages(convo.id, { limit: 10 });

          if (messages.length === 0) continue;

          const lastSeenId = this.lastSeenMessageIds.get(convo.id);

          // Sort messages oldest-first for ordered delivery
          const sorted = [...messages].reverse();

          if (!this.initialized || !lastSeenId) {
            // First poll: just record the latest message ID, don't deliver
            this.lastSeenMessageIds.set(convo.id, messages[0].id);
            continue;
          }

          // Find new messages (after last seen)
          const lastSeenIndex = sorted.findIndex((m) => m.id === lastSeenId);
          const newMessages = lastSeenIndex === -1 ? sorted : sorted.slice(lastSeenIndex + 1);

          for (const msg of newMessages) {
            // Skip own messages
            if (msg.senderDid === myDid) continue;

            // Skip empty messages
            if (!msg.text.trim()) continue;

            try {
              await this.onMessage(msg);
            } catch (err) {
              this.onError(
                err instanceof Error ? err : new Error(String(err)),
                `processing message ${msg.id}`,
              );
            }
          }

          // Update last seen to newest message
          this.lastSeenMessageIds.set(convo.id, messages[0].id);
        } catch (err) {
          this.onError(
            err instanceof Error ? err : new Error(String(err)),
            `polling convo ${convo.id}`,
          );
        }
      }

      this.initialized = true;
    } catch (err) {
      this.onError(
        err instanceof Error ? err : new Error(String(err)),
        "listing conversations",
      );
    } finally {
      this.polling = false;
    }
  }
}
