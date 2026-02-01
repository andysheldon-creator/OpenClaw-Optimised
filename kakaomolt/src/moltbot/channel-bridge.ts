/**
 * Moltbot Channel Bridge
 *
 * Enables cross-platform messaging between KakaoTalk and other channels
 * connected to Moltbot (Telegram, Discord, Slack, Signal, etc.)
 */

import { MoltbotGatewayClient } from "./gateway-client.js";

// Supported channels
export type ChannelType =
  | "telegram"
  | "discord"
  | "slack"
  | "signal"
  | "imessage"
  | "line"
  | "whatsapp"
  | "matrix"
  | "teams"
  | "googlechat"
  | "mattermost"
  | "twitch"
  | "nostr"
  | "zalo";

export interface ChannelInfo {
  type: ChannelType;
  name: string;
  description: string;
  icon: string;
  supportsMedia: boolean;
  supportsReactions: boolean;
  supportsThreads: boolean;
  supportsEdit: boolean;
  supportsDelete: boolean;
}

// Channel metadata
export const CHANNELS: Record<ChannelType, ChannelInfo> = {
  telegram: {
    type: "telegram",
    name: "Telegram",
    description: "텔레그램 메시지",
    icon: "✈️",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  discord: {
    type: "discord",
    name: "Discord",
    description: "디스코드 서버/DM",
    icon: "🎮",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  slack: {
    type: "slack",
    name: "Slack",
    description: "슬랙 워크스페이스",
    icon: "💼",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  signal: {
    type: "signal",
    name: "Signal",
    description: "시그널 보안 메시지",
    icon: "🔒",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: false,
    supportsEdit: false,
    supportsDelete: true,
  },
  imessage: {
    type: "imessage",
    name: "iMessage",
    description: "애플 iMessage",
    icon: "📱",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: false,
    supportsEdit: true,
    supportsDelete: false,
  },
  line: {
    type: "line",
    name: "LINE",
    description: "라인 메시지",
    icon: "🟢",
    supportsMedia: true,
    supportsReactions: false,
    supportsThreads: false,
    supportsEdit: false,
    supportsDelete: false,
  },
  whatsapp: {
    type: "whatsapp",
    name: "WhatsApp",
    description: "왓츠앱 메시지",
    icon: "📞",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: false,
    supportsEdit: true,
    supportsDelete: true,
  },
  matrix: {
    type: "matrix",
    name: "Matrix",
    description: "매트릭스 프로토콜",
    icon: "🔗",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  teams: {
    type: "teams",
    name: "Microsoft Teams",
    description: "마이크로소프트 팀즈",
    icon: "🏢",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  googlechat: {
    type: "googlechat",
    name: "Google Chat",
    description: "구글 챗",
    icon: "💬",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  mattermost: {
    type: "mattermost",
    name: "Mattermost",
    description: "매터모스트",
    icon: "🔵",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: true,
    supportsEdit: true,
    supportsDelete: true,
  },
  twitch: {
    type: "twitch",
    name: "Twitch",
    description: "트위치 채팅",
    icon: "🎬",
    supportsMedia: false,
    supportsReactions: false,
    supportsThreads: false,
    supportsEdit: false,
    supportsDelete: true,
  },
  nostr: {
    type: "nostr",
    name: "Nostr",
    description: "Nostr 탈중앙 메시지",
    icon: "🌐",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: false,
    supportsEdit: false,
    supportsDelete: false,
  },
  zalo: {
    type: "zalo",
    name: "Zalo",
    description: "Zalo 베트남 메시지",
    icon: "🇻🇳",
    supportsMedia: true,
    supportsReactions: true,
    supportsThreads: false,
    supportsEdit: false,
    supportsDelete: true,
  },
};

export interface BridgeMessage {
  fromChannel: "kakao";
  fromUserId: string;
  toChannel: ChannelType;
  toRecipient: string;
  text: string;
  mediaUrls?: string[];
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeResult {
  success: boolean;
  messageId?: string;
  error?: string;
  channel?: ChannelType;
}

export interface ChannelStatus {
  channel: ChannelType;
  connected: boolean;
  lastSeen?: Date;
  error?: string;
}

/**
 * Channel Bridge for cross-platform messaging
 */
export class MoltbotChannelBridge {
  private gateway: MoltbotGatewayClient;

  constructor(gateway: MoltbotGatewayClient) {
    this.gateway = gateway;
  }

  /**
   * Get list of all supported channels
   */
  getSupportedChannels(): ChannelInfo[] {
    return Object.values(CHANNELS);
  }

  /**
   * Get channel info by type
   */
  getChannelInfo(channel: ChannelType): ChannelInfo | undefined {
    return CHANNELS[channel];
  }

  /**
   * Check if a channel is available via Gateway
   */
  async checkChannelStatus(channel: ChannelType): Promise<ChannelStatus> {
    try {
      // Ask gateway about channel status
      const response = await this.gateway.sendMessage({
        userId: "channel-bridge",
        text: `[System] Check channel status: ${channel}`,
        useMemory: false,
      });

      // Parse response to determine if channel is connected
      const connected = response.success && !response.error;

      return {
        channel,
        connected,
        lastSeen: connected ? new Date() : undefined,
        error: response.error,
      };
    } catch (err) {
      return {
        channel,
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send a message to another channel
   */
  async sendMessage(message: BridgeMessage): Promise<BridgeResult> {
    const channelInfo = CHANNELS[message.toChannel];
    if (!channelInfo) {
      return {
        success: false,
        error: `Unknown channel: ${message.toChannel}`,
        channel: message.toChannel,
      };
    }

    // Build the message request for the agent
    let agentRequest = `[Bridge Request]
From: KakaoTalk user ${message.fromUserId}
To: ${channelInfo.name} - ${message.toRecipient}
Message: ${message.text}`;

    if (message.mediaUrls?.length) {
      agentRequest += `\nMedia: ${message.mediaUrls.join(", ")}`;
    }

    if (message.replyToId) {
      agentRequest += `\nReply to: ${message.replyToId}`;
    }

    try {
      const response = await this.gateway.sendMessage({
        userId: message.fromUserId,
        text: agentRequest,
        useMemory: false,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error,
          channel: message.toChannel,
        };
      }

      // Extract message ID from tool results if available
      const messageId = this.extractMessageId(response.toolResults);

      return {
        success: true,
        messageId,
        channel: message.toChannel,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        channel: message.toChannel,
      };
    }
  }

  /**
   * Forward a KakaoTalk message to another channel
   */
  async forwardToChannel(
    channel: ChannelType,
    recipient: string,
    kakaoUserId: string,
    text: string,
    options?: { mediaUrls?: string[]; replyToId?: string },
  ): Promise<BridgeResult> {
    return this.sendMessage({
      fromChannel: "kakao",
      fromUserId: kakaoUserId,
      toChannel: channel,
      toRecipient: recipient,
      text,
      ...options,
    });
  }

  /**
   * Set up a two-way bridge between KakaoTalk user and another channel
   */
  async setupBridge(
    kakaoUserId: string,
    targetChannel: ChannelType,
    targetRecipient: string,
  ): Promise<{
    success: boolean;
    bridgeId?: string;
    error?: string;
  }> {
    // Generate a unique bridge ID
    const bridgeId = `bridge-${kakaoUserId}-${targetChannel}-${Date.now()}`;

    // Register the bridge with the gateway
    const response = await this.gateway.sendMessage({
      userId: kakaoUserId,
      text: `[System] Setup bridge: ${bridgeId} -> ${targetChannel}:${targetRecipient}`,
      useMemory: false,
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    return {
      success: true,
      bridgeId,
    };
  }

  /**
   * Extract message ID from tool results
   */
  private extractMessageId(toolResults?: unknown[]): string | undefined {
    if (!toolResults?.length) return undefined;

    for (const result of toolResults) {
      if (typeof result === "object" && result !== null) {
        const r = result as Record<string, unknown>;
        if (typeof r.messageId === "string") return r.messageId;
        if (typeof r.message_id === "string") return r.message_id;
        if (typeof r.id === "string") return r.id;
      }
    }

    return undefined;
  }
}

/**
 * Create a channel bridge instance
 */
export function createChannelBridge(gateway: MoltbotGatewayClient): MoltbotChannelBridge {
  return new MoltbotChannelBridge(gateway);
}

/**
 * Parse bridge command from KakaoTalk message
 * Examples:
 *   "/전송 telegram @username 안녕하세요"
 *   "/forward discord #channel-name Hello world"
 */
export function parseBridgeCommand(message: string): {
  isCommand: boolean;
  channel?: ChannelType;
  recipient?: string;
  text?: string;
  error?: string;
} {
  const trimmed = message.trim();

  // Korean commands
  const koreanMatch = trimmed.match(/^[/\/](전송|보내기|forward)\s+(\w+)\s+(@?\S+)\s+(.+)$/is);
  if (koreanMatch) {
    const channel = normalizeChannelName(koreanMatch[2]);
    if (!channel) {
      return {
        isCommand: true,
        error: `알 수 없는 채널: ${koreanMatch[2]}`,
      };
    }

    return {
      isCommand: true,
      channel,
      recipient: koreanMatch[3],
      text: koreanMatch[4],
    };
  }

  // English commands
  const englishMatch = trimmed.match(/^[/\/](send|forward|msg)\s+(\w+)\s+(@?\S+)\s+(.+)$/is);
  if (englishMatch) {
    const channel = normalizeChannelName(englishMatch[2]);
    if (!channel) {
      return {
        isCommand: true,
        error: `Unknown channel: ${englishMatch[2]}`,
      };
    }

    return {
      isCommand: true,
      channel,
      recipient: englishMatch[3],
      text: englishMatch[4],
    };
  }

  return { isCommand: false };
}

/**
 * Normalize channel name to ChannelType
 */
function normalizeChannelName(input: string): ChannelType | undefined {
  const normalized = input.toLowerCase().trim();

  const aliases: Record<string, ChannelType> = {
    // Korean aliases
    텔레그램: "telegram",
    디스코드: "discord",
    슬랙: "slack",
    시그널: "signal",
    아이메시지: "imessage",
    라인: "line",
    왓츠앱: "whatsapp",
    매트릭스: "matrix",
    팀즈: "teams",
    구글챗: "googlechat",
    트위치: "twitch",
    잘로: "zalo",

    // English aliases
    tg: "telegram",
    dc: "discord",
    wa: "whatsapp",
    im: "imessage",
    msteams: "teams",
    gchat: "googlechat",
  };

  if (normalized in CHANNELS) {
    return normalized as ChannelType;
  }

  return aliases[normalized];
}

/**
 * Format channel list for display
 */
export function formatChannelList(): string {
  let output = "📡 **연결 가능한 채널**\n\n";

  for (const channel of Object.values(CHANNELS)) {
    const features: string[] = [];
    if (channel.supportsMedia) features.push("미디어");
    if (channel.supportsReactions) features.push("반응");
    if (channel.supportsThreads) features.push("스레드");
    if (channel.supportsEdit) features.push("수정");

    output += `${channel.icon} **${channel.name}** (\`${channel.type}\`)\n`;
    output += `   ${channel.description}\n`;
    if (features.length) {
      output += `   지원: ${features.join(", ")}\n`;
    }
    output += "\n";
  }

  output += "**사용법:**\n";
  output += "`/전송 telegram @username 메시지`\n";
  output += "`/전송 discord #channel 메시지`\n";

  return output;
}

/**
 * Format bridge status for display
 */
export function formatBridgeStatus(statuses: ChannelStatus[]): string {
  let output = "📊 **채널 상태**\n\n";

  for (const status of statuses) {
    const info = CHANNELS[status.channel];
    const statusIcon = status.connected ? "🟢" : "🔴";
    const statusText = status.connected ? "연결됨" : "오프라인";

    output += `${info.icon} ${info.name}: ${statusIcon} ${statusText}`;
    if (status.lastSeen) {
      output += ` (마지막 확인: ${status.lastSeen.toLocaleTimeString("ko-KR")})`;
    }
    if (status.error) {
      output += ` - ${status.error}`;
    }
    output += "\n";
  }

  return output;
}
