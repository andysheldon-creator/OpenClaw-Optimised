import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { MentionTarget } from "./mention.js";
import type { FeishuSendResult, ResolvedFeishuAccount } from "./types.js";
import { resolveFeishuAccount } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { buildMentionedMessage, buildMentionedCardContent } from "./mention.js";
import { getFeishuRuntime } from "./runtime.js";
import { resolveReceiveIdType, normalizeFeishuTarget } from "./targets.js";

export type FeishuMessageInfo = {
  messageId: string;
  chatId: string;
  senderId?: string;
  senderOpenId?: string;
  content: string;
  contentType: string;
  createTime?: number;
};

/**
 * Get a message by its ID.
 * Useful for fetching quoted/replied message content.
 */
export async function getMessageFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  accountId?: string;
}): Promise<FeishuMessageInfo | null> {
  const { cfg, messageId, accountId } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  const client = createFeishuClient(account);

  try {
    const response = (await client.im.message.get({
      path: { message_id: messageId },
    })) as {
      code?: number;
      msg?: string;
      data?: {
        items?: Array<{
          message_id?: string;
          chat_id?: string;
          msg_type?: string;
          body?: { content?: string };
          sender?: {
            id?: string;
            id_type?: string;
            sender_type?: string;
          };
          create_time?: string;
        }>;
      };
    };

    if (response.code !== 0) {
      return null;
    }

    const item = response.data?.items?.[0];
    if (!item) {
      return null;
    }

    // Parse content based on message type
    let content = item.body?.content ?? "";
    try {
      const parsed = JSON.parse(content);
      if (item.msg_type === "text" && parsed.text) {
        content = parsed.text;
      }
    } catch {
      // Keep raw content if parsing fails
    }

    return {
      messageId: item.message_id ?? messageId,
      chatId: item.chat_id ?? "",
      senderId: item.sender?.id,
      senderOpenId: item.sender?.id_type === "open_id" ? item.sender?.id : undefined,
      content,
      contentType: item.msg_type ?? "text",
      createTime: item.create_time ? parseInt(item.create_time, 10) : undefined,
    };
  } catch {
    return null;
  }
}

export type SendFeishuMessageParams = {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
  /** Mention target users */
  mentions?: MentionTarget[];
  /** Account ID (optional, uses default if not specified) */
  accountId?: string;
};

function buildFeishuPostMessagePayload(params: { messageText: string }): {
  content: string;
  msgType: string;
} {
  const { messageText } = params;
  return {
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            {
              tag: "md",
              text: messageText,
            },
          ],
        ],
      },
    }),
    msgType: "post",
  };
}

export async function sendMessageFeishu(
  params: SendFeishuMessageParams,
): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId, mentions, accountId } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  const client = createFeishuClient(account);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const tableMode = getFeishuRuntime().channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "feishu",
  });

  // Build message content (with @mention support)
  let rawText = text ?? "";
  if (mentions && mentions.length > 0) {
    rawText = buildMentionedMessage(mentions, rawText);
  }
  const messageText = getFeishuRuntime().channel.text.convertMarkdownTables(rawText, tableMode);

  const { content, msgType } = buildFeishuPostMessagePayload({ messageText });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: msgType,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: msgType,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export type SendFeishuCardParams = {
  cfg: ClawdbotConfig;
  to: string;
  card: Record<string, unknown>;
  replyToMessageId?: string;
  accountId?: string;
};

export async function sendCardFeishu(params: SendFeishuCardParams): Promise<FeishuSendResult> {
  const { cfg, to, card, replyToMessageId, accountId } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  const client = createFeishuClient(account);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify(card);

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "interactive",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "interactive",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export async function updateCardFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  card: Record<string, unknown>;
  accountId?: string;
}): Promise<void> {
  const { cfg, messageId, card, accountId } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  const client = createFeishuClient(account);
  const content = JSON.stringify(card);

  const response = await client.im.message.patch({
    path: { message_id: messageId },
    data: { content },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card update failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Extract markdown image references ![alt](url) from text.
 * Returns array of { full, alt, url } matches.
 */
function extractMarkdownImages(text: string): Array<{ full: string; alt: string; url: string }> {
  const results: Array<{ full: string; alt: string; url: string }> = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const url = match[2].trim();
    // Only match remote URLs (not already an image_key)
    if (url.startsWith("http://") || url.startsWith("https://")) {
      results.push({ full: match[0], alt: match[1], url });
    }
  }
  return results;
}

/**
 * Download an image from a URL and upload it to Feishu to get an image_key.
 * Returns the image_key on success, or null on failure.
 */
/**
 * Check if a URL is safe to fetch (block private/internal IPs to prevent SSRF).
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^192\.168\./.test(host) ||
      host === "0.0.0.0" ||
      host.startsWith("[") ||
      host === "metadata.google.internal" ||
      host === "169.254.169.254"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function uploadImageFromUrl(params: {
  cfg: ClawdbotConfig;
  url: string;
  accountId?: string;
}): Promise<string | null> {
  if (!isSafeUrl(params.url)) return null;
  const { uploadImageFeishu } = await import("./media.js");
  try {
    const response = await fetch(params.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null; // skip empty or >10MB
    const { imageKey } = await uploadImageFeishu({
      cfg: params.cfg,
      image: buffer,
      imageType: "message",
      accountId: params.accountId,
    });
    return imageKey;
  } catch {
    return null;
  }
}

/**
 * Process markdown text: upload remote images and replace URLs with image_keys.
 * Images that fail to upload are converted to links: ![alt](url) -> [img alt](url)
 */
export async function processMarkdownImages(params: {
  text: string;
  cfg: ClawdbotConfig;
  accountId?: string;
}): Promise<string> {
  const images = extractMarkdownImages(params.text);
  if (images.length === 0) return params.text;

  let result = params.text;

  // Upload images in parallel (max 5 concurrent)
  const uploadResults = await Promise.all(
    images.slice(0, 5).map(async (img) => {
      const imageKey = await uploadImageFromUrl({
        cfg: params.cfg,
        url: img.url,
        accountId: params.accountId,
      });
      return { ...img, imageKey };
    }),
  );

  for (const { full, alt, url, imageKey } of uploadResults) {
    if (imageKey) {
      // Replace URL with image_key (Feishu card markdown supports ![hover](image_key))
      result = result.split(full).join(`![${alt || "image"}](${imageKey})`);
    } else {
      // Fallback: convert to link
      result = result.split(full).join(`[\u{1F5BC} ${alt || "\u56FE\u7247"}](${url})`);
    }
  }

  // Any remaining images beyond the first 5: convert to links
  for (const img of images.slice(5)) {
    result = result.split(img.full).join(`[\u{1F5BC} ${img.alt || "\u56FE\u7247"}](${img.url})`);
  }

  return result;
}

/**
 * Parse a pipe-delimited row: "| A | B | C |" -> ["A", "B", "C"]
 */
function parsePipeRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/**
 * Build a Feishu native table element from header + rows.
 * Uses Feishu's tag:"table" which renders properly (unlike markdown tables).
 */
function buildTableElement(headers: string[], rows: string[][]): Record<string, unknown> {
  const columns = headers.map((h, i) => ({
    name: "c" + i,
    display_name: h,
    data_type: "text",
    width: "auto",
  }));
  const rowObjs = rows.map((r) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col.name] = r[i] || "";
    });
    return obj;
  });
  return {
    tag: "table",
    page_size: Math.max(rowObjs.length, 1),
    row_height: "low",
    header_style: {
      text_align: "left",
      text_size: "normal",
      background_style: "grey",
      bold: true,
      lines: 1,
    },
    columns,
    rows: rowObjs,
  };
}

/**
 * Build a Feishu interactive card with markdown content.
 * Uses schema 2.0 format for proper markdown rendering.
 *
 * Feishu card markdown (lark_md) does NOT support standard markdown tables
 * or blockquotes. This function parses the input and converts:
 *   - Standard markdown tables -> native Feishu tag:"table" elements
 *   - Blockquotes (> text)     -> visual bar format: **▎** *text*
 *   - Images ![alt](url)       -> should be pre-processed by processMarkdownImages
 *   - Everything else          -> tag:"markdown" elements
 */
export function buildMarkdownCard(text: string): Record<string, unknown> {
  const lines = text.trim().split("\n");
  const elements: Record<string, unknown>[] = [];
  let mdBuf: string[] = [];
  let tableBuf: string[] = [];
  let inCode = false;

  const flushMd = () => {
    const content = mdBuf.join("\n").trim();
    if (content) elements.push({ tag: "markdown", content });
    mdBuf = [];
  };

  const flushTable = () => {
    if (tableBuf.length < 2) {
      // Not a real table, push as markdown
      mdBuf.push(...tableBuf);
      tableBuf = [];
      return;
    }
    flushMd();
    const headers = parsePipeRow(tableBuf[0]);
    const rows: string[][] = [];
    for (let i = 2; i < tableBuf.length; i++) {
      // skip separator at [1]
      const line = tableBuf[i].trim();
      if (!line) continue;
      rows.push(parsePipeRow(line));
    }
    if (headers.length > 0 && rows.length > 0) {
      elements.push(buildTableElement(headers, rows));
    } else {
      mdBuf.push(...tableBuf);
    }
    tableBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Track fenced code blocks
    if (trimmed.startsWith("```")) {
      if (tableBuf.length > 0) flushTable();
      inCode = !inCode;
      mdBuf.push(line);
      continue;
    }

    if (inCode) {
      mdBuf.push(line);
      continue;
    }

    // Table detection: line starts and ends with |
    const isTableLine = /^\s*\|.*\|\s*$/.test(line);

    if (isTableLine) {
      if (tableBuf.length === 0) {
        flushMd(); // flush any markdown before table
      }
      tableBuf.push(line);
      continue;
    }

    if (tableBuf.length > 0) flushTable();

    // Blockquote conversion: > text -> **▎** *text*
    const quoteMatch = line.match(/^(>{1,3})\s*(.*)/);
    if (quoteMatch) {
      const depth = quoteMatch[1].length;
      const content = quoteMatch[2].trim();
      if (content) {
        const bar = "\u258E".repeat(depth);
        mdBuf.push("**" + bar + "** *" + content + "*");
      }
      continue;
    }

    // Normalize unordered list markers: * item -> - item (lark_md prefers -)
    const listMatch = line.match(/^(\s*)\*\s+(.*)/);
    if (listMatch) {
      mdBuf.push(listMatch[1] + "- " + listMatch[2]);
      continue;
    }

    mdBuf.push(line);
  }

  if (tableBuf.length > 0) flushTable();
  flushMd();

  if (elements.length === 0) {
    elements.push({ tag: "markdown", content: text.trim() });
  }

  return {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
    },
    body: {
      elements,
    },
  };
}

/**
 * Send a message as a markdown card (interactive message).
 * This renders markdown properly in Feishu (code blocks, tables, bold/italic, etc.)
 */
export async function sendMarkdownCardFeishu(params: {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
  /** Mention target users */
  mentions?: MentionTarget[];
  accountId?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId, mentions, accountId } = params;
  // Build message content (with @mention support)
  let cardText = text;
  if (mentions && mentions.length > 0) {
    cardText = buildMentionedCardContent(mentions, text);
  }
  const card = buildMarkdownCard(cardText);
  return sendCardFeishu({ cfg, to, card, replyToMessageId, accountId });
}

/**
 * Edit an existing text message.
 * Note: Feishu only allows editing messages within 24 hours.
 */
export async function editMessageFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  text: string;
  accountId?: string;
}): Promise<void> {
  const { cfg, messageId, text, accountId } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  const client = createFeishuClient(account);
  const tableMode = getFeishuRuntime().channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "feishu",
  });
  const messageText = getFeishuRuntime().channel.text.convertMarkdownTables(text ?? "", tableMode);

  const { content, msgType } = buildFeishuPostMessagePayload({ messageText });

  const response = await client.im.message.update({
    path: { message_id: messageId },
    data: {
      msg_type: msgType,
      content,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu message edit failed: ${response.msg || `code ${response.code}`}`);
  }
}
