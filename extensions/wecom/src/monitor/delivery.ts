import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import type { WecomInboundMessage } from "../types.js";
import type { ResolvedAgentAccount } from "../types/index.js";
import type { WecomWebhookTarget, StreamState } from "./types.js";
import {
  sendWecomText as sendAgentText,
  sendMedia as sendAgentMedia,
  uploadMedia,
} from "../agent/api-client.js";
import { resolveWecomAccounts } from "../config/index.js";
import { wecomFetch } from "../http.js";
import { truncateUtf8Bytes } from "./http-utils.js";
import { monitorState, LIMITS } from "./state.js";

const STREAM_MAX_BYTES = LIMITS.STREAM_MAX_BYTES;
const STREAM_MAX_DM_BYTES = 200_000;

// Convenience alias
const activeReplyStore = monitorState.activeReplyStore;

export function extractLocalImagePathsFromText(params: {
  text: string;
  mustAlsoAppearIn: string;
}): string[] {
  const text = params.text;
  const mustAlsoAppearIn = params.mustAlsoAppearIn;
  if (!text.trim()) return [];

  // Conservative: only accept common macOS absolute paths for images.
  // Also require that the exact path appeared in the user's original message to prevent exfil.
  const exts = "(png|jpg|jpeg|gif|webp|bmp)";
  const re = new RegExp(String.raw`(\/(?:Users|tmp)\/[^\s"'<>]+?\.${exts})`, "gi");
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = m[1];
    if (!p) continue;
    if (!mustAlsoAppearIn.includes(p)) continue;
    found.add(p);
  }
  return Array.from(found);
}

export function extractLocalFilePathsFromText(text: string): string[] {
  if (!text.trim()) return [];

  // Conservative: only accept common macOS absolute paths.
  // This is primarily for "send local file" style requests (operator/debug usage).
  const re = new RegExp(String.raw`(\/(?:Users|tmp)\/[^\s"'<>]+)`, "g");
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = m[1];
    if (!p) continue;
    found.add(p);
  }
  return Array.from(found);
}

export function guessContentTypeFromPath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    zip: "application/zip",
  };
  return map[ext];
}

export function looksLikeSendLocalFileIntent(rawBody: string): boolean {
  const t = rawBody.trim();
  if (!t) return false;
  // Heuristic: treat as "send file" intent only when there is an explicit local path AND a send-ish verb.
  // This avoids accidentally sending a file when the user is merely referencing a path.
  return /(发送|发给|发到|转发|把.*发|把.*发送|帮我发|给我发)/.test(t);
}

export async function sendAgentDmText(params: {
  agent: ResolvedAgentAccount;
  userId: string;
  text: string;
  core: PluginRuntime;
}): Promise<void> {
  const chunks = params.core.channel.text.chunkText(params.text, 20480);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    await sendAgentText({ agent: params.agent, toUser: params.userId, text: trimmed });
  }
}

export async function sendAgentDmMedia(params: {
  agent: ResolvedAgentAccount;
  userId: string;
  mediaUrlOrPath: string;
  contentType?: string;
  filename: string;
}): Promise<void> {
  let buffer: Buffer;
  let inferredContentType = params.contentType;

  const looksLikeUrl = /^https?:\/\//i.test(params.mediaUrlOrPath);
  if (looksLikeUrl) {
    const res = await fetch(params.mediaUrlOrPath, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`media download failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    inferredContentType =
      inferredContentType || res.headers.get("content-type") || "application/octet-stream";
  } else {
    const fs = await import("node:fs/promises");
    buffer = await fs.readFile(params.mediaUrlOrPath);
  }

  let mediaType: "image" | "voice" | "video" | "file" = "file";
  const ct = (inferredContentType || "").toLowerCase();
  if (ct.startsWith("image/")) mediaType = "image";
  else if (ct.startsWith("audio/")) mediaType = "voice";
  else if (ct.startsWith("video/")) mediaType = "video";

  const mediaId = await uploadMedia({
    agent: params.agent,
    type: mediaType,
    buffer,
    filename: params.filename,
  });
  await sendAgentMedia({
    agent: params.agent,
    toUser: params.userId,
    mediaId,
    mediaType,
  });
}

export function buildFallbackPrompt(params: {
  kind: "media" | "timeout" | "error";
  agentConfigured: boolean;
  userId?: string;
  filename?: string;
  chatType?: "group" | "direct";
}): string {
  const who = params.userId ? `（${params.userId}）` : "";
  const scope =
    params.chatType === "group" ? "群聊" : params.chatType === "direct" ? "私聊" : "会话";
  if (!params.agentConfigured) {
    return `${scope}中需要通过应用私信发送${params.filename ? `（${params.filename}）` : ""}，但管理员尚未配置企业微信自建应用（Agent）通道。请联系管理员配置后再试。${who}`.trim();
  }
  if (!params.userId) {
    return `${scope}中需要通过应用私信兜底发送${params.filename ? `（${params.filename}）` : ""}，但本次回调未能识别触发者 userid（请检查企微回调字段 from.userid / fromuserid）。请联系管理员排查配置。`.trim();
  }
  if (params.kind === "media") {
    return `已生成文件${params.filename ? `（${params.filename}）` : ""}，将通过应用私信发送给你。${who}`.trim();
  }
  if (params.kind === "timeout") {
    return `内容较长，为避免超时，后续内容将通过应用私信发送给你。${who}`.trim();
  }
  return `交付出现异常，已尝试通过应用私信发送给你。${who}`.trim();
}

export async function sendBotFallbackPromptNow(params: {
  streamId: string;
  text: string;
}): Promise<void> {
  const responseUrl = getActiveReplyUrl(params.streamId);
  if (!responseUrl) {
    throw new Error("no response_url（无法主动推送群内提示）");
  }
  await useActiveReplyOnce(params.streamId, async ({ responseUrl, proxyUrl }) => {
    const payload = {
      msgtype: "stream",
      stream: {
        id: params.streamId,
        finish: true,
        content: truncateUtf8Bytes(params.text, STREAM_MAX_BYTES) || "1",
      },
    };
    const res = await wecomFetch(
      responseUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { proxyUrl, timeoutMs: LIMITS.REQUEST_TIMEOUT_MS },
    );
    if (!res.ok) {
      throw new Error(`fallback prompt push failed: ${res.status}`);
    }
  });
}

export function appendDmContent(state: StreamState, text: string): void {
  const next = state.dmContent ? `${state.dmContent}\n\n${text}`.trim() : text.trim();
  state.dmContent = truncateUtf8Bytes(next, STREAM_MAX_DM_BYTES);
}

export function resolveAgentAccountOrUndefined(
  cfg: OpenClawConfig,
): ResolvedAgentAccount | undefined {
  const agent = resolveWecomAccounts(cfg).agent;
  return agent?.configured ? agent : undefined;
}

export function computeTaskKey(
  target: WecomWebhookTarget,
  msg: WecomInboundMessage,
): string | undefined {
  const msgid = msg.msgid ? String(msg.msgid) : "";
  if (!msgid) return undefined;
  const aibotid = String((msg as any).aibotid ?? "unknown").trim() || "unknown";
  return `bot:${target.account.accountId}:${aibotid}:${msgid}`;
}

export function storeActiveReply(streamId: string, responseUrl?: string, proxyUrl?: string): void {
  activeReplyStore.store(streamId, responseUrl, proxyUrl);
}

export function getActiveReplyUrl(streamId: string): string | undefined {
  return activeReplyStore.getUrl(streamId);
}

export async function useActiveReplyOnce(
  streamId: string,
  fn: (params: { responseUrl: string; proxyUrl?: string }) => Promise<void>,
): Promise<void> {
  return activeReplyStore.use(streamId, fn);
}
