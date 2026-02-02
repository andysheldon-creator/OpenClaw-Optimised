/**
 * Event Context Builder for OpenClaw
 *
 * Phase 2 of RFC-001: Build session context from events
 *
 * This replaces file-based memory with event-sourced context.
 * On session start, we query recent events and build a context document.
 */

import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  StringCodec,
  AckPolicy,
  DeliverPolicy,
} from "nats";

const sc = StringCodec();

export type EventContextConfig = {
  natsUrl: string;
  streamName: string;
  subjectPrefix: string;
};

export type ContextOptions = {
  /** Agent to build context for */
  agent: string;
  /** Session key */
  sessionKey?: string;
  /** Hours of history to include (default: 24) */
  hoursBack?: number;
  /** Max events to process (default: 1000) */
  maxEvents?: number;
  /** Include tool calls in context (default: false) */
  includeTools?: boolean;
};

export type EventContext = {
  /** Recent conversation messages */
  recentMessages: ConversationMessage[];
  /** Summary of older conversations */
  conversationSummary?: string;
  /** Active topics being discussed */
  activeTopics: string[];
  /** Pending decisions/questions */
  pendingItems: string[];
  /** Facts learned in this period */
  facts: string[];
  /** Timestamp of context build */
  builtAt: number;
  /** Number of events processed */
  eventsProcessed: number;
};

export type ConversationMessage = {
  timestamp: number;
  role: "user" | "assistant";
  text: string;
  session: string;
};

export type StoredEvent = {
  id: string;
  timestamp: number;
  agent: string;
  session: string;
  type: string;
  visibility: string;
  payload: {
    runId: string;
    stream: string;
    data: Record<string, unknown>;
    sessionKey?: string;
    seq: number;
    ts: number;
  };
  meta: {
    runId: string;
    seq: number;
    stream: string;
  };
};

/**
 * Query events from NATS JetStream
 */
async function queryEvents(
  config: EventContextConfig,
  options: ContextOptions,
): Promise<StoredEvent[]> {
  const nc = await connect({ servers: config.natsUrl });

  try {
    const jsm = await nc.jetstreamManager();

    // Check if stream exists and get info
    let streamInfo;
    try {
      streamInfo = await jsm.streams.info(config.streamName);
    } catch {
      console.log("[event-context] Stream not found, returning empty context");
      return [];
    }

    const events: StoredEvent[] = [];
    const hoursBack = options.hoursBack ?? 24;
    const maxEvents = options.maxEvents ?? 1000;
    const startTime = Date.now() - hoursBack * 60 * 60 * 1000;

    // Get message count
    const lastSeq = streamInfo.state.last_seq;
    if (lastSeq === 0) {
      return [];
    }

    // Start from end and go back
    const startSeq = Math.max(1, lastSeq - maxEvents);

    // Fetch messages by sequence
    for (let seq = startSeq; seq <= lastSeq && events.length < maxEvents; seq++) {
      try {
        const msg = await jsm.streams.getMessage(config.streamName, { seq });
        const data = JSON.parse(sc.decode(msg.data)) as StoredEvent;

        // Filter by timestamp
        if (data.timestamp < startTime) {
          continue;
        }

        // Filter by agent if specified
        if (options.agent && data.agent !== options.agent && data.agent !== "agent") {
          continue;
        }

        // Filter by session if specified
        if (options.sessionKey && data.session !== options.sessionKey) {
          continue;
        }

        // Filter out tool events unless requested
        if (!options.includeTools && data.type.includes("tool")) {
          continue;
        }

        events.push(data);
      } catch {
        // Message may have been deleted
        continue;
      }
    }

    return events;
  } finally {
    await nc.drain();
  }
}

/**
 * Extract conversation messages from events
 */
function extractConversations(events: StoredEvent[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  const seenTexts = new Set<string>();

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sorted) {
    if (event.type !== "conversation.message.out") continue;

    const text = event.payload.data?.text as string;
    if (!text || seenTexts.has(text)) continue;

    // Only keep final/complete messages (skip deltas)
    // We detect this by checking if this is the last event with this runId
    const runId = event.payload.runId;
    const laterEvents = sorted.filter(
      (e) => e.payload.runId === runId && e.timestamp > event.timestamp,
    );

    // If there are later events with same runId, this is a delta - skip
    if (laterEvents.length > 0) continue;

    seenTexts.add(text);
    messages.push({
      timestamp: event.timestamp,
      role: "assistant",
      text: text.trim(),
      session: event.session,
    });
  }

  return messages;
}

/**
 * Extract active topics from recent conversation
 */
function extractTopics(messages: ConversationMessage[]): string[] {
  const topics: string[] = [];
  const recentMessages = messages.slice(-10);

  // Simple keyword extraction (could be enhanced with LLM)
  const topicKeywords = new Map<string, number>();

  for (const msg of recentMessages) {
    // Extract capitalized phrases (likely topics)
    const matches = msg.text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    for (const match of matches) {
      if (match.length > 3) {
        topicKeywords.set(match, (topicKeywords.get(match) || 0) + 1);
      }
    }
  }

  // Get top topics
  const sorted = [...topicKeywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  for (const [topic] of sorted) {
    topics.push(topic);
  }

  return topics;
}

/**
 * Build context document from events
 */
export async function buildEventContext(
  config: EventContextConfig,
  options: ContextOptions,
): Promise<EventContext> {
  const events = await queryEvents(config, options);
  const messages = extractConversations(events);
  const topics = extractTopics(messages);

  // Split messages into recent (last 2 hours) and older
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const recentMessages = messages.filter((m) => m.timestamp > twoHoursAgo);
  const olderMessages = messages.filter((m) => m.timestamp <= twoHoursAgo);

  // Create summary of older messages (simple for now)
  let conversationSummary: string | undefined;
  if (olderMessages.length > 0) {
    const count = olderMessages.length;
    const firstTime = new Date(olderMessages[0].timestamp).toLocaleString();
    conversationSummary = `[${count} earlier messages starting from ${firstTime}]`;
  }

  return {
    recentMessages,
    conversationSummary,
    activeTopics: topics,
    pendingItems: [], // TODO: Extract from lifecycle events
    facts: [], // TODO: Extract from fact events
    builtAt: Date.now(),
    eventsProcessed: events.length,
  };
}

/**
 * Format context for injection into system prompt
 */
export function formatContextForPrompt(context: EventContext): string {
  const lines: string[] = [];

  lines.push("## Event-Sourced Context");
  lines.push(`Built at: ${new Date(context.builtAt).toISOString()}`);
  lines.push(`Events processed: ${context.eventsProcessed}`);
  lines.push("");

  if (context.activeTopics.length > 0) {
    lines.push("### Active Topics");
    for (const topic of context.activeTopics) {
      lines.push(`- ${topic}`);
    }
    lines.push("");
  }

  if (context.conversationSummary) {
    lines.push("### Earlier Conversation");
    lines.push(context.conversationSummary);
    lines.push("");
  }

  if (context.recentMessages.length > 0) {
    lines.push("### Recent Messages (last 2h)");
    for (const msg of context.recentMessages.slice(-5)) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const preview = msg.text.length > 100 ? msg.text.substring(0, 100) + "..." : msg.text;
      lines.push(`- [${time}] ${msg.role}: ${preview}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * CLI helper to test context building
 */
export async function testContextBuild(natsUrl: string = "nats://localhost:4222"): Promise<void> {
  console.log("Building event context...");

  const config: EventContextConfig = {
    natsUrl,
    streamName: "openclaw-events",
    subjectPrefix: "openclaw.events",
  };

  const context = await buildEventContext(config, {
    agent: "agent",
    hoursBack: 1,
    maxEvents: 100,
  });

  console.log("\n=== Event Context ===");
  console.log(formatContextForPrompt(context));
  console.log("\n=== Raw Context ===");
  console.log(JSON.stringify(context, null, 2));
}
