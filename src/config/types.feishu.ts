/**
 * Feishu configuration types for OpenClaw
 * @module config/types.feishu
 */

import type {
  DmPolicy,
  GroupPolicy,
  MarkdownConfig,
  OutboundRetryConfig,
  ReplyToMode,
} from "./types.base.js";
import type { ChannelHeartbeatVisibilityConfig } from "./types.channels.js";
import type { DmConfig, ProviderCommandsConfig } from "./types.messages.js";

/**
 * Feishu action configuration
 */
export type FeishuActionConfig = {
  /** Enable sending messages (default: true) */
  sendMessage?: boolean;
  /** Enable reactions (default: true) */
  reactions?: boolean;
  /** Enable message cards (default: true) */
  cards?: boolean;
};

/**
 * Feishu group configuration
 */
export type FeishuGroupConfig = {
  /** If true, bot requires @mention to respond. */
  requireMention?: boolean;
  /** If specified, only load these skills for this group. */
  skills?: string[];
  /** If false, disable the bot for this group. */
  enabled?: boolean;
  /** Optional allowlist for group senders. */
  allowFrom?: string[];
  /** Optional system prompt snippet for this group. */
  systemPrompt?: string;
};

/**
 * Feishu account configuration
 */
export type FeishuAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** If false, do not start this Feishu account. Default: true. */
  enabled?: boolean;

  // Credentials
  /** Feishu App ID from developer console. */
  appId?: string;
  /** Feishu App Secret from developer console. */
  appSecret?: string;
  /** Path to file containing app secret (for secret managers). */
  appSecretFile?: string;
  /** Encryption key for webhook (optional for long connection mode). */
  encryptKey?: string;
  /** Verification token for webhook (optional for long connection mode). */
  verificationToken?: string;

  // Connection mode
  /** Connection mode: "long-connection" (WebSocket) or "webhook" (HTTP callback). Default: "long-connection". */
  connectionMode?: "long-connection" | "webhook";
  /** Webhook URL for callback mode. */
  webhookUrl?: string;
  /** Webhook path for callback mode. */
  webhookPath?: string;

  // Behavior
  /** Control reply threading when reply tags are present. */
  replyToMode?: ReplyToMode;
  /** Markdown formatting overrides. */
  markdown?: MarkdownConfig;
  /** Override native command registration. */
  commands?: ProviderCommandsConfig;
  /** Allow channel-initiated config writes (default: true). */
  configWrites?: boolean;

  // DM Policy
  /**
   * Controls how Feishu direct chats (DMs) are handled:
   * - "allowlist": only allow senders in allowFrom
   * - "open": allow all inbound DMs
   * - "disabled": ignore all inbound DMs
   */
  dmPolicy?: DmPolicy;
  /** Optional allowlist for DM senders. */
  allowFrom?: string[];
  /** Per-DM config overrides keyed by user ID. */
  dms?: Record<string, DmConfig>;

  // Group Policy
  /**
   * Controls how group messages are handled:
   * - "open": groups bypass allowFrom, only mention-gating applies
   * - "disabled": block all group messages entirely
   * - "allowlist": only allow group messages from senders in groupAllowFrom
   */
  groupPolicy?: GroupPolicy;
  /** Optional allowlist for group senders. */
  groupAllowFrom?: string[];
  /** Per-group configuration. */
  groups?: Record<string, FeishuGroupConfig>;

  // Limits
  /** Max group messages to keep as history context. */
  historyLimit?: number;
  /** Max DM turns to keep as history context. */
  dmHistoryLimit?: number;
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Max media file size in MB. */
  mediaMaxMb?: number;

  // Streaming
  /** Draft streaming mode (off|partial|block). Default: off. */
  streamMode?: "off" | "partial" | "block";

  // Retry and timeout
  /** Retry policy for outbound API calls. */
  retry?: OutboundRetryConfig;
  /** API timeout in seconds. */
  timeoutSeconds?: number;

  // Actions
  /** Per-action tool gating. */
  actions?: FeishuActionConfig;

  // Reactions
  /**
   * Controls agent's reaction capability:
   * - "off": agent cannot react
   * - "ack": bot sends acknowledgment reactions
   * - "minimal": agent can react sparingly
   * - "extensive": agent can react liberally
   */
  reactionLevel?: "off" | "ack" | "minimal" | "extensive";

  /** Heartbeat visibility settings. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
};

/**
 * Top-level Feishu configuration
 */
export type FeishuConfig = {
  /** Optional per-account Feishu configuration (multi-account). */
  accounts?: Record<string, FeishuAccountConfig>;
} & FeishuAccountConfig;
