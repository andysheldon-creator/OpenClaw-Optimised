import type { MsgContext } from "../auto-reply/templating.js";

type SyntheticContextParams = {
  body: string;
  sessionKey: string;
  senderId: string;
  senderName?: string;
};

/**
 * Builds a synthetic MsgContext for MCP requests.
 *
 * Field mapping (actual MsgContext fields from src/auto-reply/templating.ts):
 * - Body: Main message content
 * - RawBody / CommandBody / BodyForCommands: Used for command detection
 * - BodyForAgent: Agent prompt body (may include envelope/history)
 * - SessionKey: Session identifier for conversation continuity
 * - From / SenderId / SenderName / SenderUsername: Sender identification
 * - MessageSid: Provider-specific message id
 * - Provider / Surface / AccountId: Channel and account identification
 * - WasMentioned: Whether the bot was mentioned
 * - CommandAuthorized: Whether commands are allowed
 * - CommandSource: "text" or "native"
 *
 * Note: OriginatingChannel is intentionally NOT set because MCP returns
 * responses in-band (synchronously) rather than routing to external channels.
 */
export function buildSyntheticContext(params: SyntheticContextParams): MsgContext {
  const messageSid = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    // Core message content (use actual field names from MsgContext)
    Body: params.body,
    RawBody: params.body,
    CommandBody: params.body,
    BodyForCommands: params.body,
    BodyForAgent: params.body,

    // Session/routing
    SessionKey: params.sessionKey,

    // Provider identification
    // "mcp" is not a routable channel - responses are returned in-band
    Provider: "mcp",
    Surface: "mcp",
    AccountId: "mcp",

    // Sender info
    From: params.senderId,
    SenderId: params.senderId,
    SenderName: params.senderName ?? "MCP Client",
    SenderUsername: params.senderId,

    // Message metadata
    MessageSid: messageSid,

    // Mention flag - treat MCP requests as direct mentions
    WasMentioned: true,

    // Command handling (allow all commands for MCP)
    CommandAuthorized: true,
    CommandSource: "native",

    // Media (none for text-only MCP calls)
    MediaUrl: undefined,
    MediaUrls: [],
    MediaPath: undefined,
    MediaPaths: [],

    // Threading (none for MCP)
    ReplyToId: undefined,
    MessageThreadId: undefined,

    // OriginatingChannel is intentionally omitted:
    // MCP responses are returned synchronously, not routed to external channels.
    // Setting an invalid channel here would cause routeReply() to fail.
  };
}
