import type { WecomInboundMessage, WecomInboundQuote } from "../types.js";
import type { WecomWebhookTarget } from "./types.js";
import { resolveWecomEgressProxyUrl, resolveWecomMediaMaxBytes } from "../config/index.js";
import { decryptWecomMediaWithHttp } from "../media.js";

export function resolveWecomSenderUserId(msg: WecomInboundMessage): string | undefined {
  const direct = msg.from?.userid?.trim();
  if (direct) return direct;
  const legacy = String(
    (msg as any).fromuserid ?? (msg as any).from_userid ?? (msg as any).fromUserId ?? "",
  ).trim();
  return legacy || undefined;
}

export function parseWecomPlainMessage(raw: string): WecomInboundMessage {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed as WecomInboundMessage;
}

export type InboundResult = {
  body: string;
  media?: {
    buffer: Buffer;
    contentType: string;
    filename: string;
  };
};

export function formatQuote(quote: WecomInboundQuote): string {
  const type = quote.msgtype ?? "";
  if (type === "text") return quote.text?.content || "";
  if (type === "image") return `[引用: 图片] ${quote.image?.url || ""}`;
  if (type === "mixed" && quote.mixed?.msg_item) {
    const items = quote.mixed.msg_item
      .map((item) => {
        if (item.msgtype === "text") return item.text?.content;
        if (item.msgtype === "image") return `[图片] ${item.image?.url || ""}`;
        return "";
      })
      .filter(Boolean)
      .join(" ");
    return `[引用: 图文] ${items}`;
  }
  if (type === "voice") return `[引用: 语音] ${quote.voice?.content || ""}`;
  if (type === "file") return `[引用: 文件] ${quote.file?.url || ""}`;
  return "";
}

export function buildInboundBody(msg: WecomInboundMessage): string {
  let body = "";
  const msgtype = String(msg.msgtype ?? "").toLowerCase();

  if (msgtype === "text") body = (msg as any).text?.content || "";
  else if (msgtype === "voice") body = (msg as any).voice?.content || "[voice]";
  else if (msgtype === "mixed") {
    const items = (msg as any).mixed?.msg_item;
    if (Array.isArray(items)) {
      body = items
        .map((item: any) => {
          const t = String(item?.msgtype ?? "").toLowerCase();
          if (t === "text") return item?.text?.content || "";
          if (t === "image") return `[image] ${item?.image?.url || ""}`;
          return `[${t || "item"}]`;
        })
        .filter(Boolean)
        .join("\n");
    } else body = "[mixed]";
  } else if (msgtype === "image") body = `[image] ${(msg as any).image?.url || ""}`;
  else if (msgtype === "file") body = `[file] ${(msg as any).file?.url || ""}`;
  else if (msgtype === "event") body = `[event] ${(msg as any).event?.eventtype || ""}`;
  else if (msgtype === "stream") body = `[stream_refresh] ${(msg as any).stream?.id || ""}`;
  else body = msgtype ? `[${msgtype}]` : "";

  const quote = (msg as any).quote;
  if (quote) {
    const quoteText = formatQuote(quote).trim();
    if (quoteText) body += `\n\n> ${quoteText}`;
  }
  return body;
}

/**
 * **processInboundMessage (处理接收消息)**
 *
 * 解析企业微信传入的消息体。
 * 主要职责：
 * 1. 识别媒体消息（Image/File/Mixed）。
 * 2. 如果存在媒体文件，调用 `media.ts` 进行解密和下载。
 * 3. 构造统一的 `InboundResult` 供后续 Agent 处理。
 *
 * @param target Webhook 目标配置
 * @param msg 企业微信原始消息对象
 */
export async function processInboundMessage(
  target: WecomWebhookTarget,
  msg: WecomInboundMessage,
): Promise<InboundResult> {
  const msgtype = String(msg.msgtype ?? "").toLowerCase();
  const aesKey = target.account.encodingAESKey;
  const maxBytes = resolveWecomMediaMaxBytes(target.config);
  const proxyUrl = resolveWecomEgressProxyUrl(target.config);

  // 图片消息处理：如果存在 url 且配置了 aesKey，则尝试解密下载
  if (msgtype === "image") {
    const url = String((msg as any).image?.url ?? "").trim();
    if (url && aesKey) {
      try {
        const buf = await decryptWecomMediaWithHttp(url, aesKey, { maxBytes, http: { proxyUrl } });
        return {
          body: "[image]",
          media: {
            buffer: buf,
            contentType: "image/jpeg", // WeCom images are usually generic; safest assumption or could act as generic
            filename: "image.jpg",
          },
        };
      } catch (err) {
        target.runtime.error?.(`Failed to decrypt inbound image: ${String(err)}`);
        target.runtime.error?.(
          `图片解密失败: ${String(err)}; 可调大 channels.wecom.media.maxBytes（当前=${maxBytes}）例如：openclaw config set channels.wecom.media.maxBytes ${50 * 1024 * 1024}`,
        );
        return {
          body: `[image] (decryption failed: ${typeof err === "object" && err ? (err as any).message : String(err)})`,
        };
      }
    }
  }

  if (msgtype === "file") {
    const url = String((msg as any).file?.url ?? "").trim();
    if (url && aesKey) {
      try {
        const buf = await decryptWecomMediaWithHttp(url, aesKey, { maxBytes, http: { proxyUrl } });
        return {
          body: "[file]",
          media: {
            buffer: buf,
            contentType: "application/octet-stream",
            filename: "file.bin", // WeCom doesn't guarantee filename in webhook payload always, defaulting
          },
        };
      } catch (err) {
        target.runtime.error?.(
          `Failed to decrypt inbound file: ${String(err)}; 可调大 channels.wecom.media.maxBytes（当前=${maxBytes}）例如：openclaw config set channels.wecom.media.maxBytes ${50 * 1024 * 1024}`,
        );
        return {
          body: `[file] (decryption failed: ${typeof err === "object" && err ? (err as any).message : String(err)})`,
        };
      }
    }
  }

  // Mixed message handling: extract first media if available
  if (msgtype === "mixed") {
    const items = (msg as any).mixed?.msg_item;
    if (Array.isArray(items)) {
      let foundMedia: InboundResult["media"] | undefined = undefined;
      let bodyParts: string[] = [];

      for (const item of items) {
        const t = String(item.msgtype ?? "").toLowerCase();
        if (t === "text") {
          const content = String(item.text?.content ?? "").trim();
          if (content) bodyParts.push(content);
        } else if ((t === "image" || t === "file") && !foundMedia && aesKey) {
          // Found first media, try to download
          const url = String(item[t]?.url ?? "").trim();
          if (url) {
            try {
              const buf = await decryptWecomMediaWithHttp(url, aesKey, {
                maxBytes,
                http: { proxyUrl },
              });
              foundMedia = {
                buffer: buf,
                contentType: t === "image" ? "image/jpeg" : "application/octet-stream",
                filename: t === "image" ? "image.jpg" : "file.bin",
              };
              bodyParts.push(`[${t}]`);
            } catch (err) {
              target.runtime.error?.(
                `Failed to decrypt mixed ${t}: ${String(err)}; 可调大 channels.wecom.media.maxBytes（当前=${maxBytes}）例如：openclaw config set channels.wecom.media.maxBytes ${50 * 1024 * 1024}`,
              );
              bodyParts.push(`[${t}] (decryption failed)`);
            }
          } else {
            bodyParts.push(`[${t}]`);
          }
        } else {
          // Other items or already found media -> just placeholder
          bodyParts.push(`[${t}]`);
        }
      }
      return {
        body: bodyParts.join("\n"),
        media: foundMedia,
      };
    }
  }

  return { body: buildInboundBody(msg) };
}
