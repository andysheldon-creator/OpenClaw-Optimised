/**
 * Agent Hook Bridge
 *
 * Bridges agent runtime events (tool lifecycle) to the internal hooks system,
 * enabling workspace hooks to react to tool execution.
 *
 * Events emitted:
 * - tool:start   - Tool execution begins (includes args)
 * - tool:update  - Streaming output during execution
 * - tool:result  - Tool execution completes (includes result, isError)
 *
 * IMPORTANT: tool:update events can fire at high frequency (token-level streaming).
 * Hook scripts are responsible for implementing their own throttling/debouncing
 * if targeting rate-limited APIs like Discord. This design allows different hooks
 * to handle updates differently (e.g., real-time WebSocket vs throttled Discord).
 *
 * @see https://github.com/moltbot/moltbot/issues/2904
 */

import { onAgentEvent, type AgentEventPayload } from "./agent-events.js";
import { triggerInternalHook, type InternalHookEvent } from "../hooks/internal-hooks.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";

export type ToolHookPhase = "start" | "update" | "result";

export type SessionMeta = {
  agentId: string | null;
  platform: string | null;
  channelType: string | null;
  channelId: string | null;
  raw: string | null;
};

export type ToolHookContext = {
  runId: string;
  toolName: string;
  toolCallId: string;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
  meta: Record<string, unknown>;
  sessionMeta: SessionMeta;
};

export type ToolHookEvent = Omit<InternalHookEvent, "type" | "action" | "context"> & {
  type: "tool";
  action: ToolHookPhase;
  context: ToolHookContext;
};

/**
 * Parse session key into structured metadata for hook convenience.
 *
 * Session keys look like: `agent:main:discord:channel:123456789`
 * The `rest` field contains: `discord:channel:123456789`
 */
function parseSessionMeta(sessionKey: string | undefined | null): SessionMeta {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return {
      agentId: null,
      platform: null,
      channelType: null,
      channelId: null,
      raw: null,
    };
  }

  const { agentId, rest } = parsed;
  const parts = rest.split(":");

  // Handle IDs that might contain colons (e.g., Matrix IDs)
  const rawChannelId = parts.length > 2 ? parts.slice(2).join(":") : null;
  // Normalize empty strings to null
  const channelId = rawChannelId && rawChannelId.trim() ? rawChannelId : null;

  return {
    agentId,
    platform: parts[0] ?? null,
    channelType: parts[1] ?? null,
    channelId,
    raw: rest,
  };
}

/**
 * Type guard for tool event data
 */
function isToolEventData(data: Record<string, unknown> | undefined): data is {
  phase: string;
  name: string;
  toolCallId: string;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
  meta?: Record<string, unknown>;
} {
  if (!data) return false;
  return (
    typeof data.phase === "string" &&
    typeof data.name === "string" &&
    typeof data.toolCallId === "string"
  );
}

/**
 * Check if a phase is a valid tool hook phase
 */
function isToolHookPhase(phase: string): phase is ToolHookPhase {
  return phase === "start" || phase === "update" || phase === "result";
}

let unsubscribeFromEvents: (() => void) | null = null;
let cleanupFunction: (() => void) | null = null;

/**
 * Start the agent hook bridge.
 *
 * Subscribes to agent events and translates tool lifecycle events
 * to internal hook events. Should be called during gateway startup
 * after hooks have been loaded.
 *
 * @returns Cleanup function to stop the bridge
 */
export function startAgentHookBridge(): () => void {
  // Prevent double-subscription - return same cleanup function
  if (cleanupFunction) {
    return cleanupFunction;
  }

  unsubscribeFromEvents = onAgentEvent((evt: AgentEventPayload) => {
    // Only care about tool streams
    if (evt.stream !== "tool") return;

    // Validate event data structure
    if (!isToolEventData(evt.data)) return;

    const { phase, name, toolCallId, args, result, partialResult, isError, meta } = evt.data;

    // Only bridge known phases
    if (!isToolHookPhase(phase)) return;

    const hookPayload: ToolHookEvent = {
      type: "tool",
      action: phase,
      sessionKey: evt.sessionKey ?? "",
      timestamp: new Date(evt.ts),
      // Explicitly undefined to signal this isn't a chat message event
      messages: [],
      context: {
        runId: evt.runId,
        toolName: name,
        toolCallId,
        // Only include relevant data per phase to reduce payload size
        args: phase === "start" ? args : undefined,
        result: phase === "result" ? result : undefined,
        partialResult: phase === "update" ? partialResult : undefined,
        isError: phase === "result" ? isError : undefined,
        meta: meta ?? {},
        // Parsed session metadata so hooks don't need to parse session keys
        sessionMeta: parseSessionMeta(evt.sessionKey),
      },
    };

    // Fire and forget - don't block tool execution on hook processing
    void triggerInternalHook(hookPayload as InternalHookEvent);
  });

  cleanupFunction = () => {
    if (unsubscribeFromEvents) {
      unsubscribeFromEvents();
      unsubscribeFromEvents = null;
    }
    cleanupFunction = null;
  };

  return cleanupFunction;
}

/**
 * Stop the agent hook bridge if running.
 */
export function stopAgentHookBridge(): void {
  if (cleanupFunction) {
    cleanupFunction();
  }
}
