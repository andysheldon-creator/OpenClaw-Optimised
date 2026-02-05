/**
 * DingTalk API types and interfaces
 */

export interface DingTalkConfig {
  enabled?: boolean;
  webhookUrl: string;
  secret: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: string[];
}

export interface DingTalkTextMessage {
  msgtype: "text";
  text: {
    content: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

export interface DingTalkMarkdownMessage {
  msgtype: "markdown";
  markdown: {
    title: string;
    text: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

export interface DingTalkLinkMessage {
  msgtype: "link";
  link: {
    text: string;
    title: string;
    picUrl?: string;
    messageUrl: string;
  };
}

export type DingTalkOutboundMessage =
  | DingTalkTextMessage
  | DingTalkMarkdownMessage
  | DingTalkLinkMessage;

export interface DingTalkWebhookResponse {
  errcode: number;
  errmsg: string;
}

export interface DingTalkInboundMessage {
  msgtype: "text" | "picture" | "voice" | "video" | "file";
  text?: {
    content: string;
  };
  msgId: string;
  createAt: number;
  conversationType: "1" | "2"; // 1=single chat, 2=group chat
  conversationId: string;
  chatbotCorpId?: string;
  chatbotUserId?: string;
  senderId: string;
  senderNick: string;
  senderStaffId?: string;
  sessionWebhook: string;
  sessionWebhookExpiredTime: number;
  isAdmin?: boolean;
  isInAtList?: boolean;
  atUsers?: Array<{
    dingtalkId: string;
    staffId?: string;
  }>;
}

export interface DingTalkSignatureParams {
  timestamp: number;
  secret: string;
}
