import type { IncomingMessage, ServerResponse } from "node:http";

import type { ClawdbotConfig } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./accounts.js";
import { decryptFeishuEncrypt, verifyFeishuSignature } from "./auth.js";
import { getFeishuRuntime } from "./runtime.js";
import { processFeishuMessage, parseFeishuTimestampMs, extractMentions } from "./inbound.js";
import type { FeishuRuntimeEnv, FeishuStatusSink } from "./inbound.js";
import { monitorFeishuLongConnection } from "./ws.js";

export type FeishuMonitorOptions = {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  abortSignal: AbortSignal;
  webhookPath?: string;
  webhookUrl?: string;
  statusSink?: FeishuStatusSink;
};

type FeishuCoreRuntime = ReturnType<typeof getFeishuRuntime>;

type WebhookTarget = {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  core: FeishuCoreRuntime;
  path: string;
  statusSink?: FeishuStatusSink;
};

const webhookTargets = new Map<string, WebhookTarget[]>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeWebhookPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

function resolveWebhookPath(webhookPath?: string, webhookUrl?: string): string | null {
  const trimmedPath = webhookPath?.trim();
  if (trimmedPath) return normalizeWebhookPath(trimmedPath);
  if (webhookUrl?.trim()) {
    try {
      const parsed = new URL(webhookUrl);
      return normalizeWebhookPath(parsed.pathname || "/");
    } catch {
      return null;
    }
  }
  return "/feishu";
}

export function registerFeishuWebhookTarget(target: WebhookTarget): () => void {
  const key = normalizeWebhookPath(target.path);
  const normalizedTarget = { ...target, path: key };
  const existing = webhookTargets.get(key) ?? [];
  const next = [...existing, normalizedTarget];
  webhookTargets.set(key, next);
  return () => {
    const updated = (webhookTargets.get(key) ?? []).filter((entry) => entry !== normalizedTarget);
    if (updated.length > 0) {
      webhookTargets.set(key, updated);
    } else {
      webhookTargets.delete(key);
    }
  };
}

async function readRawBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<{ ok: boolean; raw?: string; error?: string }>((resolve) => {
    let resolved = false;
    const doResolve = (value: { ok: boolean; raw?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      req.removeAllListeners();
      resolve(value);
    };
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        doResolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        doResolve({ ok: false, error: "empty payload" });
        return;
      }
      doResolve({ ok: true, raw });
    });
    req.on("error", (err) => {
      doResolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type SelectedRequest = {
  target: WebhookTarget;
  payload: Record<string, unknown>;
};

function extractVerificationToken(payload: Record<string, unknown>): string | undefined {
  const token = readString(payload.token);
  if (token) return token;
  const header = isRecord(payload.header) ? payload.header : undefined;
  return header ? readString(header.token) : undefined;
}

function selectTarget(params: {
  targets: WebhookTarget[];
  rawBody: string;
  outer: Record<string, unknown>;
  headers: {
    timestamp: string;
    nonce: string;
    signature: string;
  };
}): SelectedRequest | null {
  const { targets, rawBody, outer, headers } = params;
  const encrypt = readString(outer.encrypt);

  if (encrypt) {
    for (const candidate of targets) {
      const encryptKey = candidate.account.config.encryptKey?.trim();
      if (!encryptKey) continue;
      if (
        verifyFeishuSignature({
          rawBody,
          encryptKey,
          timestamp: headers.timestamp,
          nonce: headers.nonce,
          signature: headers.signature,
        })
      ) {
        try {
          const decrypted = decryptFeishuEncrypt({ encrypt, encryptKey });
          const json = parseJson(decrypted);
          if (!json.ok || !isRecord(json.value)) continue;
          return { target: candidate, payload: json.value };
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  const token = extractVerificationToken(outer);
  if (token) {
    const match = targets.find(
      (candidate) => candidate.account.config.verificationToken?.trim() === token,
    );
    if (match) return { target: match, payload: outer };
  }

  if (headers.signature && headers.timestamp && headers.nonce) {
    for (const candidate of targets) {
      const encryptKey = candidate.account.config.encryptKey?.trim();
      if (!encryptKey) continue;
      if (
        verifyFeishuSignature({
          rawBody,
          encryptKey,
          timestamp: headers.timestamp,
          nonce: headers.nonce,
          signature: headers.signature,
        })
      ) {
        return { target: candidate, payload: outer };
      }
    }
  }

  return null;
}

function readHeaderValues(req: IncomingMessage) {
  const timestamp = String(
    req.headers["x-lark-request-timestamp"] ?? req.headers["x-feishu-request-timestamp"] ?? "",
  ).trim();
  const nonce = String(
    req.headers["x-lark-request-nonce"] ?? req.headers["x-feishu-request-nonce"] ?? "",
  ).trim();
  const signature = String(req.headers["x-lark-signature"] ?? "").trim();
  return { timestamp, nonce, signature };
}

export async function handleFeishuWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = normalizeWebhookPath(url.pathname);
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) return false;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readRawBody(req, 1024 * 1024);
  if (!body.ok) {
    res.statusCode = body.error === "payload too large" ? 413 : 400;
    res.end(body.error ?? "invalid payload");
    return true;
  }

  const parsed = parseJson(body.raw ?? "");
  if (!parsed.ok || !isRecord(parsed.value)) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const headers = readHeaderValues(req);
  const selected = selectTarget({
    targets,
    rawBody: body.raw ?? "",
    outer: parsed.value,
    headers,
  });
  if (!selected) {
    res.statusCode = 401;
    res.end("unauthorized");
    return true;
  }

  const payload = selected.payload;
  const eventType = readString(isRecord(payload.header) ? payload.header.event_type : undefined);
  const type = readString(payload.type);

  if (type === "url_verification") {
    const challenge = readString(payload.challenge);
    if (!challenge) {
      res.statusCode = 400;
      res.end("invalid payload");
      return true;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ challenge }));
    return true;
  }

  if (eventType !== "im.message.receive_v1") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
    return true;
  }

  const event = isRecord(payload.event) ? payload.event : null;
  const message = event && isRecord(event.message) ? event.message : null;
  const sender = event && isRecord(event.sender) ? event.sender : null;
  if (!message || !sender) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const messageId =
    readString(message.message_id) ?? readString(message.messageId) ?? readString(message.id);
  const chatId = readString(message.chat_id) ?? readString(message.chatId);
  const chatType = readString(message.chat_type) ?? readString(message.chatType) ?? "";
  const messageType = readString(message.message_type) ?? readString(message.messageType) ?? "";
  const content = readString(message.content) ?? "";
  if (!messageId || !chatId || !chatType || !messageType || !content) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const senderId = isRecord(sender.sender_id) ? sender.sender_id : null;
  const senderOpenId =
    readString((senderId ?? sender).open_id) ?? readString((senderId ?? sender).openId) ?? "";
  const senderUserId =
    readString((senderId ?? sender).user_id) ?? readString((senderId ?? sender).userId);
  const senderType = readString(sender.sender_type) ?? readString(sender.senderType);
  if (!senderOpenId) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const mentions = extractMentions(message.mentions);
  const createdAt = parseFeishuTimestampMs(
    readString(isRecord(payload.header) ? payload.header.create_time : undefined),
  );

  selected.target.statusSink?.({ lastInboundAt: Date.now() });
  processFeishuMessage({
    account: selected.target.account,
    config: selected.target.config,
    runtime: selected.target.runtime,
    core: selected.target.core,
    statusSink: selected.target.statusSink,
    messageId,
    chatId,
    chatType,
    messageType,
    content,
    mentions,
    senderOpenId,
    senderUserId,
    senderType,
    createdAt,
  }).catch((err) => {
    selected.target.runtime.error?.(
      `[${selected.target.account.accountId}] Feishu webhook failed: ${String(err)}`,
    );
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end("{}");
  return true;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export async function startFeishuMonitor(options: FeishuMonitorOptions): Promise<void> {
  const core = getFeishuRuntime();
  const mode = options.account.config.mode ?? "http";

  if (mode === "ws") {
    await monitorFeishuLongConnection({
      account: options.account,
      config: options.config,
      runtime: options.runtime,
      abortSignal: options.abortSignal,
      statusSink: options.statusSink,
    });
    return;
  }

  const webhookPath = resolveWebhookPath(options.webhookPath, options.webhookUrl);
  if (!webhookPath) {
    options.runtime.error?.(`[${options.account.accountId}] invalid webhook path`);
    await waitForAbort(options.abortSignal);
    return;
  }

  const unregister = registerFeishuWebhookTarget({
    account: options.account,
    config: options.config,
    runtime: options.runtime,
    core,
    path: webhookPath,
    statusSink: options.statusSink,
  });

  try {
    await waitForAbort(options.abortSignal);
  } finally {
    unregister();
  }
}

export function resolveFeishuWebhookPath(params: { account: ResolvedFeishuAccount }): string {
  return (
    resolveWebhookPath(params.account.config.webhookPath, params.account.config.webhookUrl) ??
    "/feishu"
  );
}
