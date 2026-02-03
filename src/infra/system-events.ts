// Lightweight in-memory queue for human-readable system events that should be
// prefixed to the next prompt. We intentionally avoid persistence to keep
// events ephemeral. Events are session-scoped and require an explicit key.

export type SystemEventType =
  | "exec-completion"
  | "subagent-announce"
  | "heartbeat"
  | "cron"
  | "channel"
  | "system";

export type SystemEvent = { text: string; ts: number };

const MAX_EVENTS = 20;

type SessionQueue = {
  queue: SystemEvent[];
  lastText: string | null;
  lastContextKey: string | null;
};

const queues = new Map<string, SessionQueue>();

// Global suppression list - can be enhanced to be per-agent in the future
let globalSuppressedEvents: Set<SystemEventType> = new Set();

type SystemEventOptions = {
  sessionKey: string;
  contextKey?: string | null;
  eventType?: SystemEventType;
};

function requireSessionKey(key?: string | null): string {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed) {
    throw new Error("system events require a sessionKey");
  }
  return trimmed;
}

function normalizeContextKey(key?: string | null): string | null {
  if (!key) {
    return null;
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function setSuppressedSystemEventTypes(types: SystemEventType[]): void {
  globalSuppressedEvents = new Set(types);
}

export function getSuppressedSystemEventTypes(): SystemEventType[] {
  return Array.from(globalSuppressedEvents);
}

/**
 * Initialize system event filtering from agent configuration.
 * TODO: This is currently a global setting. In future PRs, this should be enhanced
 * to support per-agent configuration via sessionKey to agentId resolution.
 */
export function initializeSystemEventFiltering(agentDefaults?: {
  systemEvents?: { suppress?: SystemEventType[] };
}): void {
  const suppressList = agentDefaults?.systemEvents?.suppress ?? [];
  setSuppressedSystemEventTypes(suppressList);
}

function shouldSuppressEvent(eventType?: SystemEventType): boolean {
  if (!eventType) {
    return false; // Untyped events pass through (backward compatibility)
  }
  return globalSuppressedEvents.has(eventType);
}

export function isSystemEventContextChanged(
  sessionKey: string,
  contextKey?: string | null,
): boolean {
  const key = requireSessionKey(sessionKey);
  const existing = queues.get(key);
  const normalized = normalizeContextKey(contextKey);
  return normalized !== (existing?.lastContextKey ?? null);
}

export function enqueueSystemEvent(text: string, options: SystemEventOptions) {
  // Check if this event type should be suppressed
  if (shouldSuppressEvent(options?.eventType)) {
    return;
  }

  const key = requireSessionKey(options?.sessionKey);
  const entry =
    queues.get(key) ??
    (() => {
      const created: SessionQueue = {
        queue: [],
        lastText: null,
        lastContextKey: null,
      };
      queues.set(key, created);
      return created;
    })();
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }
  entry.lastContextKey = normalizeContextKey(options?.contextKey);
  if (entry.lastText === cleaned) {
    return;
  } // skip consecutive duplicates
  entry.lastText = cleaned;
  entry.queue.push({ text: cleaned, ts: Date.now() });
  if (entry.queue.length > MAX_EVENTS) {
    entry.queue.shift();
  }
}

export function drainSystemEventEntries(sessionKey: string): SystemEvent[] {
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (!entry || entry.queue.length === 0) {
    return [];
  }
  const out = entry.queue.slice();
  entry.queue.length = 0;
  entry.lastText = null;
  entry.lastContextKey = null;
  queues.delete(key);
  return out;
}

export function drainSystemEvents(sessionKey: string): string[] {
  return drainSystemEventEntries(sessionKey).map((event) => event.text);
}

export function peekSystemEvents(sessionKey: string): string[] {
  const key = requireSessionKey(sessionKey);
  return queues.get(key)?.queue.map((e) => e.text) ?? [];
}

export function hasSystemEvents(sessionKey: string) {
  const key = requireSessionKey(sessionKey);
  return (queues.get(key)?.queue.length ?? 0) > 0;
}

export function resetSystemEventsForTest() {
  queues.clear();
}
