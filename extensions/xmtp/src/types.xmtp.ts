/**
 * XMTP Channel Type Definitions
 *
 * Type definitions for the XMTP channel plugin, following the patterns
 * established by Telegram/Discord channels in Clawdbot core.
 */

// Re-export common types from clawdbot for convenience
// (These would be imported in an integrated extension)
export type { ClawdbotRuntime } from "clawdbot/plugin-sdk";

// ============================================================================
// Base Types
// ============================================================================

/**
 * XMTP network environment.
 * - "dev": Development/testnet network (free, for testing)
 * - "production": Production mainnet (real XMTP network)
 */
export type XmtpEnv = "dev" | "production";

/**
 * DM policy for XMTP channel.
 * Controls how direct messages from unknown senders are handled.
 *
 * - "pairing": Unknown senders get a pairing code; owner must approve
 * - "allowlist": Only allow senders explicitly in allowFrom
 * - "open": Allow all inbound DMs (but only allowlisted users can run commands)
 */
export type XmtpDmPolicy = "pairing" | "allowlist" | "open";

/**
 * Markdown table rendering mode.
 * - "off": Leave tables as-is (may not render well in XMTP clients)
 * - "bullets": Convert tables to bullet lists (recommended for chat)
 * - "code": Wrap tables in code blocks
 */
export type XmtpMarkdownTableMode = "off" | "bullets" | "code";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Markdown formatting configuration for XMTP messages.
 */
export type XmtpMarkdownConfig = {
  /** Table rendering mode (off|bullets|code). Default: "bullets" */
  tables?: XmtpMarkdownTableMode;
};

/**
 * Per-action tool gating for XMTP channel.
 * Controls which actions the bot can perform.
 */
export type XmtpActionConfig = {
  /** Enable/disable reaction support. Default: true */
  reactions?: boolean;
  /** Enable/disable sending messages. Default: true */
  sendMessage?: boolean;
};

/**
 * Outbound retry configuration for XMTP API calls.
 */
export type XmtpRetryConfig = {
  /** Max retry attempts for outbound requests. Default: 3 */
  attempts?: number;
  /** Minimum retry delay in ms. Default: 500 */
  minDelayMs?: number;
  /** Maximum retry delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Jitter factor (0-1) applied to delays. Default: 0.1 */
  jitter?: number;
};

/**
 * Per-account XMTP configuration.
 * Defines all settings for a single XMTP bot account.
 */
export type XmtpAccountConfig = {
  /**
   * Optional display name for this account.
   * Used in CLI/UI lists and status displays.
   */
  name?: string;

  /**
   * If false, do not start this XMTP account.
   * Default: true (when walletKey is configured)
   */
  enabled?: boolean;

  /**
   * Ethereum wallet private key for XMTP identity.
   * Must be a 0x-prefixed 64-character hex string.
   * Can also be set via XMTP_WALLET_KEY environment variable.
   */
  walletKey?: string;

  /**
   * XMTP network environment.
   * - "dev": Development network (free, for testing)
   * - "production": Production mainnet
   * Default: "dev"
   */
  env?: XmtpEnv;

  /**
   * Path to XMTP database directory.
   * The actual database file will be created at {dbPath}/{env}/xmtp-{inboxId}.db3
   * Default: ".xmtp/db"
   */
  dbPath?: string;

  /**
   * Optional encryption key for XMTP database.
   * Must be a 0x-prefixed hex string if provided.
   * Can also be set via XMTP_DB_ENCRYPTION_KEY environment variable.
   */
  encryptionKey?: string;

  /**
   * Controls how direct messages from unknown senders are handled.
   * - "pairing": Unknown senders get a pairing code; owner must approve
   * - "allowlist": Only allow senders explicitly in allowFrom
   * - "open": Allow all inbound DMs
   * Default: "pairing"
   */
  dmPolicy?: XmtpDmPolicy;

  /**
   * List of authorized Ethereum addresses.
   * Used for allowlist/pairing policies.
   * Addresses should be lowercase 0x-prefixed.
   */
  allowFrom?: string[];

  /**
   * Markdown formatting configuration.
   */
  markdown?: XmtpMarkdownConfig;

  /**
   * Outbound text chunk size (chars).
   * Messages longer than this will be split into multiple sends.
   * Default: 4000
   */
  textChunkLimit?: number;

  /**
   * Chunking mode for long messages.
   * - "length": Split by character count (default)
   * - "newline": Split on every newline
   */
  chunkMode?: "length" | "newline";

  /**
   * Per-action tool gating.
   */
  actions?: XmtpActionConfig;

  /**
   * Retry policy for outbound XMTP API calls.
   */
  retry?: XmtpRetryConfig;

  /**
   * Controls which user reactions trigger notifications.
   * - "off": Ignore all reactions (default)
   * - "own": Notify when users react to bot messages
   * - "all": Notify agent of all reactions
   */
  reactionNotifications?: "off" | "own" | "all";

  /**
   * Controls agent's reaction capability.
   * - "off": Agent cannot react
   * - "ack": Bot sends acknowledgment reactions (default)
   * - "minimal": Agent can react sparingly
   * - "extensive": Agent can react liberally
   */
  reactionLevel?: "off" | "ack" | "minimal" | "extensive";
};

/**
 * Top-level XMTP channel configuration.
 * Supports both single-account and multi-account setups.
 *
 * Single account:
 * ```json
 * { "channels": { "xmtp": { "walletKey": "0x...", "env": "dev" } } }
 * ```
 *
 * Multi-account:
 * ```json
 * { "channels": { "xmtp": { "accounts": { "main": { "walletKey": "0x..." } } } } }
 * ```
 */
export type XmtpConfig = {
  /** Optional per-account XMTP configuration (multi-account). */
  accounts?: Record<string, XmtpAccountConfig>;
} & XmtpAccountConfig;

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * Resolved XMTP account state.
 * This is the fully-resolved configuration for a single account,
 * with defaults applied and derived values computed.
 */
export interface ResolvedXmtpAccount {
  /** Account identifier (e.g., "default", "main", etc.) */
  accountId: string;
  /** Display name for this account */
  name: string | null;
  /** Whether this account is enabled */
  enabled: boolean;
  /** Whether wallet key is configured */
  configured: boolean;
  /** Wallet private key (if configured) */
  walletKey: string | null;
  /** Derived Ethereum address from wallet key */
  walletAddress: string | null;
  /** XMTP network environment */
  env: XmtpEnv;
  /** Path to XMTP database directory */
  dbPath: string;
  /** Database encryption key (if configured) */
  encryptionKey: string | null;
  /** Resolved config values */
  config: {
    /** DM handling policy */
    dmPolicy: XmtpDmPolicy;
    /** Authorized addresses */
    allowFrom: string[];
  };
}

/**
 * Runtime state for an XMTP account.
 * Tracks the operational status of the XMTP gateway.
 * Extends Record<string, unknown> for clawdbot SDK compatibility.
 */
export interface XmtpRuntimeState extends Record<string, unknown> {
  /** Account identifier */
  accountId: string;
  /** Whether the gateway is currently running */
  running: boolean;
  /** Timestamp of last gateway start */
  lastStartAt: number | null;
  /** Timestamp of last gateway stop */
  lastStopAt: number | null;
  /** Last error message (if any) */
  lastError: string | null;
  /** Timestamp of last inbound message received */
  lastInboundAt?: number | null;
  /** Timestamp of last outbound message sent */
  lastOutboundAt?: number | null;
}

/**
 * Status snapshot for an XMTP account.
 * Used for CLI status displays and health checks.
 * Extends Record<string, unknown> for clawdbot SDK compatibility.
 */
export interface XmtpAccountSnapshot extends Record<string, unknown> {
  /** Account identifier */
  accountId: string;
  /** Display name */
  name: string | null;
  /** Whether account is enabled in config */
  enabled: boolean;
  /** Whether wallet key is configured */
  configured: boolean;
  /** Ethereum wallet address */
  walletAddress: string | null;
  /** Network environment */
  env: XmtpEnv;
  /** Whether gateway is currently running */
  running: boolean;
  /** Timestamp of last gateway start */
  lastStartAt: number | null;
  /** Timestamp of last gateway stop */
  lastStopAt: number | null;
  /** Last error message */
  lastError: string | null;
  /** Timestamp of last inbound message */
  lastInboundAt?: number | null;
  /** Timestamp of last outbound message */
  lastOutboundAt?: number | null;
}

/**
 * Channel-level status summary for XMTP.
 * Aggregated view across all accounts.
 * Extends Record<string, unknown> for clawdbot SDK compatibility.
 */
export interface XmtpChannelSummary extends Record<string, unknown> {
  /** Whether any account is configured */
  configured: boolean;
  /** Primary wallet address */
  walletAddress: string | null;
  /** Network environment */
  env: XmtpEnv;
  /** Whether any account is running */
  running: boolean;
  /** Timestamp of most recent start */
  lastStartAt: number | null;
  /** Timestamp of most recent stop */
  lastStopAt: number | null;
  /** Most recent error */
  lastError: string | null;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Inbound message context for XMTP.
 * Contains all information about an incoming message.
 */
export interface XmtpInboundContext {
  /** Message body text */
  Body: string;
  /** Raw message body (unprocessed) */
  RawBody: string;
  /** Sender address with xmtp: prefix */
  From: string;
  /** Conversation ID with xmtp: prefix */
  To: string;
  /** Session key for conversation tracking */
  SessionKey: string;
  /** Account ID handling this message */
  AccountId: string;
  /** Chat type: "direct" or "group" */
  ChatType: "direct" | "group";
  /** Human-readable label for conversation */
  ConversationLabel: string;
  /** Sender display name (usually address) */
  SenderName: string;
  /** Sender identifier */
  SenderId: string;
  /** Provider name */
  Provider: "xmtp";
  /** Surface/platform */
  Surface: "xmtp";
  /** Unique message ID */
  MessageSid: string;
  /** Conversation ID */
  ConversationId: string;
  /** Sender's XMTP inbox ID */
  SenderInboxId: string;
  /** Message timestamp */
  Timestamp: number;
  /** Whether sender can execute commands */
  CommandAuthorized: boolean;
  /** Original channel name */
  OriginatingChannel: "xmtp";
  /** Original conversation target */
  OriginatingTo: string;
  /** Reply-to message ID (if this is a reply) */
  ReplyToId?: string;
}

/**
 * Authorization check result for an XMTP sender.
 */
export interface XmtpAuthorizationResult {
  /** Whether the sender is allowed to message */
  allowed: boolean;
  /** Whether the sender can execute commands */
  commandAuthorized: boolean;
  /** Reason for denial (if not allowed) */
  reason?: "needs_pairing" | "not_in_allowlist" | "unknown_policy";
}

// ============================================================================
// Directory Types
// ============================================================================

/**
 * Directory entry for XMTP peer (user).
 */
export interface XmtpPeerEntry {
  kind: "user";
  /** Ethereum address or inbox ID */
  id: string;
  /** Display name (usually same as address) */
  name: string;
}

/**
 * Directory entry for XMTP group.
 */
export interface XmtpGroupEntry {
  kind: "group";
  /** Group conversation ID */
  id: string;
  /** Group name */
  name: string;
}

// ============================================================================
// Action Types
// ============================================================================

/**
 * Result from an XMTP action (e.g., react).
 */
export interface XmtpActionResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

/**
 * Parameters for the react action.
 * All fields are optional because params come from untyped input.
 */
export interface XmtpReactParams {
  /** Conversation ID (or "to" as alias) */
  conversationId?: string;
  /** Alias for conversationId */
  to?: string;
  /** Message ID to react to */
  messageId?: string;
  /** Emoji to react with. Default: "👍" */
  emoji?: string;
  /** Whether to remove the reaction. Default: false */
  remove?: boolean;
  /** Sender inbox ID (required for group messages) */
  senderInboxId?: string;
}

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * Status issue from XMTP channel.
 */
export interface XmtpStatusIssue {
  channel: "xmtp";
  accountId: string;
  kind: "runtime";
  message: string;
}

/**
 * XMTP plugin metadata.
 */
export interface XmtpPluginMeta {
  id: "xmtp";
  label: "XMTP";
  selectionLabel: "XMTP (Decentralized Messaging)";
  docsPath: "/channels/xmtp";
  docsLabel: "xmtp";
  blurb: "Decentralized messaging via XMTP protocol";
  order: number;
}

/**
 * XMTP plugin capabilities.
 */
export interface XmtpPluginCapabilities {
  chatTypes: Array<"direct" | "group">;
  reactions: boolean;
  media: boolean;
}
