import type { ClawdbotConfig, PluginRuntime } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./accounts.js";
import { decryptFeishuEncrypt } from "./auth.js";
import { getFeishuRuntime } from "./runtime.js";
import {
  extractMentions,
  parseFeishuTimestampMs,
  processFeishuMessage,
  type FeishuRuntimeEnv,
  type FeishuStatusSink,
} from "./inbound.js";

type FeishuLongConnectionOptions = {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: FeishuStatusSink;
};

type FeishuWsConnectConfig = {
  connectUrl: string;
  serviceId: number;
  pingIntervalMs: number;
  reconnectCount: number;
  reconnectIntervalMs: number;
  reconnectNonceMs: number;
};

type FrameHeader = { key: string; value: string };

type FrameMessage = {
  SeqID: bigint;
  LogID: bigint;
  service: number;
  method: number;
  headers: FrameHeader[];
  payloadEncoding?: string;
  payloadType?: string;
  payload?: Uint8Array;
  LogIDNew?: string;
};

const FEISHU_WS_CONFIG_URL = "https://open.feishu.cn/callback/ws/endpoint";

const FRAME_TYPE_CONTROL = 0;
const FRAME_TYPE_DATA = 1;

const MESSAGE_TYPE_EVENT = "event";
const MESSAGE_TYPE_PING = "ping";
const MESSAGE_TYPE_PONG = "pong";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sleepMs(ms: number, signal: AbortSignal): Promise<void> {
  const delay = Math.max(0, ms);
  if (delay === 0 || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchConnectConfig(
  options: FeishuLongConnectionOptions,
): Promise<FeishuWsConnectConfig> {
  const appId = options.account.config.appId?.trim() ?? "";
  const appSecret = options.account.config.appSecret?.trim() ?? "";
  if (!appId || !appSecret) {
    throw new Error("Feishu long connection requires appId/appSecret");
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.abortSignal.addEventListener("abort", onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(FEISHU_WS_CONFIG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        locale: "zh",
      },
      body: JSON.stringify({ AppID: appId, AppSecret: appSecret }),
      signal: controller.signal,
    });
    const text = await res.text();
    const payload = text.trim() ? parseJson(text) : { ok: true as const, value: null };
    if (!payload.ok) {
      throw new Error(`Feishu ws config returned invalid JSON: ${payload.error}`);
    }
    if (!isRecord(payload.value)) {
      throw new Error(`Feishu ws config returned invalid payload (status=${res.status})`);
    }
    const code = typeof payload.value.code === "number" ? payload.value.code : -1;
    const msg = readString(payload.value.msg) ?? "request failed";
    if (!res.ok || code !== 0) {
      throw new Error(`Feishu ws config failed: code=${code} msg=${msg}`);
    }
    const data = isRecord(payload.value.data) ? payload.value.data : null;
    const connectUrl = data ? readString(data.URL) : undefined;
    const clientConfig = data && isRecord(data.ClientConfig) ? data.ClientConfig : null;
    if (!connectUrl || !clientConfig) {
      throw new Error("Feishu ws config missing URL/ClientConfig");
    }

    let serviceId = 0;
    try {
      const url = new URL(connectUrl);
      const raw = url.searchParams.get("service_id")?.trim() ?? "";
      serviceId = Number.parseInt(raw, 10);
    } catch {
      serviceId = 0;
    }
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      throw new Error("Feishu ws config missing service_id");
    }

    const pingIntervalSec =
      typeof clientConfig.PingInterval === "number" ? clientConfig.PingInterval : 0;
    const reconnectCount =
      typeof clientConfig.ReconnectCount === "number" ? clientConfig.ReconnectCount : -1;
    const reconnectIntervalSec =
      typeof clientConfig.ReconnectInterval === "number" ? clientConfig.ReconnectInterval : 0;
    const reconnectNonceSec =
      typeof clientConfig.ReconnectNonce === "number" ? clientConfig.ReconnectNonce : 0;
    const pingIntervalMs = Math.max(5_000, Math.floor(pingIntervalSec * 1000));
    const reconnectIntervalMs = Math.max(1_000, Math.floor(reconnectIntervalSec * 1000));
    const reconnectNonceMs = Math.max(0, Math.floor(reconnectNonceSec * 1000));

    return {
      connectUrl,
      serviceId,
      pingIntervalMs,
      reconnectCount,
      reconnectIntervalMs,
      reconnectNonceMs,
    };
  } finally {
    clearTimeout(timeoutId);
    options.abortSignal.removeEventListener("abort", onAbort);
  }
}

async function connectWebSocket(params: {
  url: string;
  abortSignal: AbortSignal;
}): Promise<WebSocket> {
  if (params.abortSignal.aborted) {
    throw new Error("aborted");
  }
  const ws = new WebSocket(params.url);
  ws.binaryType = "arraybuffer";
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      try {
        ws.close();
      } finally {
        reject(new Error("aborted"));
      }
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("websocket error"));
    };
    const cleanup = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      params.abortSignal.removeEventListener("abort", onAbort);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    params.abortSignal.addEventListener("abort", onAbort, { once: true });
  });
  return ws;
}

function encodeVarint(value: bigint): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80n) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return bytes;
}

function decodeVarint(data: Uint8Array, offset: number): { value: bigint; offset: number } {
  let value = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < data.length) {
    const byte = data[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value, offset: pos };
    }
    shift += 7n;
    if (shift > 70n) {
      throw new Error("varint overflow");
    }
  }
  throw new Error("unexpected EOF");
}

function encodeStringField(tag: number, value: string): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  return [tag, ...encodeVarint(BigInt(bytes.length)), ...Array.from(bytes)];
}

function encodeBytesField(tag: number, value: Uint8Array): number[] {
  return [tag, ...encodeVarint(BigInt(value.length)), ...Array.from(value)];
}

function decodeString(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function decodeLengthDelimited(
  data: Uint8Array,
  offset: number,
): { bytes: Uint8Array; offset: number } {
  const len = decodeVarint(data, offset);
  const length = Number(len.value);
  if (!Number.isFinite(length) || length < 0) {
    throw new Error("invalid length-delimited field");
  }
  const start = len.offset;
  const end = start + length;
  if (end > data.length) {
    throw new Error("unexpected EOF");
  }
  return { bytes: data.subarray(start, end), offset: end };
}

function encodeHeader(header: FrameHeader): number[] {
  const keyField = encodeStringField(10, header.key);
  const valueField = encodeStringField(18, header.value);
  const body = [...keyField, ...valueField];
  return [42, ...encodeVarint(BigInt(body.length)), ...body];
}

function decodeHeader(data: Uint8Array): FrameHeader {
  let offset = 0;
  let key = "";
  let value = "";
  while (offset < data.length) {
    const tag = decodeVarint(data, offset);
    offset = tag.offset;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    if (wireType !== 2) {
      throw new Error("invalid header encoding");
    }
    const field = decodeLengthDelimited(data, offset);
    offset = field.offset;
    const decoded = decodeString(field.bytes);
    if (fieldNumber === 1) key = decoded;
    if (fieldNumber === 2) value = decoded;
  }
  return { key, value };
}

export function encodeFeishuLongConnectionFrame(frame: FrameMessage): Uint8Array {
  const out: number[] = [];
  out.push(8, ...encodeVarint(frame.SeqID));
  out.push(16, ...encodeVarint(frame.LogID));
  out.push(24, ...encodeVarint(BigInt(frame.service)));
  out.push(32, ...encodeVarint(BigInt(frame.method)));
  for (const header of frame.headers) {
    out.push(...encodeHeader(header));
  }
  if (frame.payloadEncoding) {
    out.push(...encodeStringField(50, frame.payloadEncoding));
  }
  if (frame.payloadType) {
    out.push(...encodeStringField(58, frame.payloadType));
  }
  if (frame.payload) {
    out.push(...encodeBytesField(66, frame.payload));
  }
  if (frame.LogIDNew) {
    out.push(...encodeStringField(74, frame.LogIDNew));
  }
  return Uint8Array.from(out);
}

export function decodeFeishuLongConnectionFrame(data: Uint8Array): FrameMessage {
  let offset = 0;
  let SeqID: bigint | null = null;
  let LogID: bigint | null = null;
  let service: number | null = null;
  let method: number | null = null;
  const headers: FrameHeader[] = [];
  let payloadEncoding: string | undefined;
  let payloadType: string | undefined;
  let payload: Uint8Array | undefined;
  let LogIDNew: string | undefined;

  while (offset < data.length) {
    const tag = decodeVarint(data, offset);
    offset = tag.offset;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);

    if (fieldNumber === 1 && wireType === 0) {
      const v = decodeVarint(data, offset);
      SeqID = v.value;
      offset = v.offset;
      continue;
    }
    if (fieldNumber === 2 && wireType === 0) {
      const v = decodeVarint(data, offset);
      LogID = v.value;
      offset = v.offset;
      continue;
    }
    if (fieldNumber === 3 && wireType === 0) {
      const v = decodeVarint(data, offset);
      service = Number(v.value);
      offset = v.offset;
      continue;
    }
    if (fieldNumber === 4 && wireType === 0) {
      const v = decodeVarint(data, offset);
      method = Number(v.value);
      offset = v.offset;
      continue;
    }
    if (fieldNumber === 5 && wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      headers.push(decodeHeader(field.bytes));
      continue;
    }
    if (fieldNumber === 6 && wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      payloadEncoding = decodeString(field.bytes);
      continue;
    }
    if (fieldNumber === 7 && wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      payloadType = decodeString(field.bytes);
      continue;
    }
    if (fieldNumber === 8 && wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      payload = field.bytes;
      continue;
    }
    if (fieldNumber === 9 && wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      LogIDNew = decodeString(field.bytes);
      continue;
    }

    if (wireType === 0) {
      const v = decodeVarint(data, offset);
      offset = v.offset;
      continue;
    }
    if (wireType === 1) {
      offset += 8;
      continue;
    }
    if (wireType === 2) {
      const field = decodeLengthDelimited(data, offset);
      offset = field.offset;
      continue;
    }
    if (wireType === 5) {
      offset += 4;
      continue;
    }
    throw new Error(`unsupported wireType=${wireType}`);
  }

  if (SeqID == null || LogID == null || service == null || method == null) {
    throw new Error("invalid frame missing required fields");
  }

  return {
    SeqID,
    LogID,
    service,
    method,
    headers,
    payloadEncoding,
    payloadType,
    payload,
    LogIDNew,
  };
}

function resolveHeaderMap(headers: FrameHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const key = header.key.trim();
    if (!key) continue;
    map[key] = String(header.value ?? "");
  }
  return map;
}

function buildControlPingFrame(params: { serviceId: number }): FrameMessage {
  return {
    SeqID: 0n,
    LogID: 0n,
    service: params.serviceId,
    method: FRAME_TYPE_CONTROL,
    headers: [{ key: "type", value: MESSAGE_TYPE_PING }],
  };
}

function buildAckFrame(params: { request: FrameMessage; code: number }): FrameMessage {
  const payload = new TextEncoder().encode(JSON.stringify({ code: params.code }));
  return {
    SeqID: params.request.SeqID,
    LogID: params.request.LogID,
    service: params.request.service,
    method: params.request.method,
    headers: [...params.request.headers, { key: "biz_rt", value: "0" }],
    payloadEncoding: params.request.payloadEncoding,
    payloadType: params.request.payloadType,
    LogIDNew: params.request.LogIDNew,
    payload,
  };
}

type ChunkBuffer = {
  parts: Array<Uint8Array | undefined>;
  received: number;
  createdAt: number;
};

function mergeChunks(buffer: ChunkBuffer): Uint8Array | null {
  if (!buffer.parts.every(Boolean)) return null;
  const combinedLength = buffer.parts.reduce((acc, cur) => acc + (cur?.length ?? 0), 0);
  const combined = new Uint8Array(combinedLength);
  let offset = 0;
  for (const part of buffer.parts) {
    if (!part) continue;
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

async function normalizeWebSocketData(data: unknown): Promise<Uint8Array | null> {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  }
  return null;
}

function decryptEnvelopeIfNeeded(params: {
  envelope: Record<string, unknown>;
  encryptKey?: string;
}): Record<string, unknown> {
  const encrypt = readString(params.envelope.encrypt);
  if (!encrypt) return params.envelope;
  const encryptKey = params.encryptKey?.trim();
  if (!encryptKey) return params.envelope;

  const { encrypt: _ignored, ...rest } = params.envelope;
  try {
    const decrypted = decryptFeishuEncrypt({ encrypt, encryptKey });
    const parsed = parseJson(decrypted);
    if (!parsed.ok || !isRecord(parsed.value)) return params.envelope;
    return { ...parsed.value, ...rest };
  } catch {
    return params.envelope;
  }
}

type FeishuExtractedMessage = {
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  content: string;
  mentions: Array<Record<string, unknown>>;
  senderOpenId: string;
  senderUserId?: string;
  senderType?: string;
  createdAt?: number;
};

function extractFeishuMessageFromEnvelope(
  envelope: Record<string, unknown>,
): FeishuExtractedMessage | null {
  const eventType = readString(isRecord(envelope.header) ? envelope.header.event_type : undefined);
  if (eventType !== "im.message.receive_v1") return null;
  const event = isRecord(envelope.event) ? envelope.event : null;
  const message = event && isRecord(event.message) ? event.message : null;
  const sender = event && isRecord(event.sender) ? event.sender : null;
  if (!message || !sender) return null;

  const messageId =
    readString(message.message_id) ?? readString(message.messageId) ?? readString(message.id) ?? "";
  const chatId = readString(message.chat_id) ?? readString(message.chatId) ?? "";
  const chatType = readString(message.chat_type) ?? readString(message.chatType) ?? "";
  const messageType = readString(message.message_type) ?? readString(message.messageType) ?? "";
  const content = readString(message.content) ?? "";
  if (!messageId || !chatId || !chatType || !messageType || !content) return null;

  const senderId = isRecord(sender.sender_id) ? sender.sender_id : null;
  const senderOpenId =
    readString((senderId ?? sender).open_id) ?? readString((senderId ?? sender).openId) ?? "";
  const senderUserId =
    readString((senderId ?? sender).user_id) ?? readString((senderId ?? sender).userId);
  const senderType = readString(sender.sender_type) ?? readString(sender.senderType);
  if (!senderOpenId) return null;

  const mentions = extractMentions(message.mentions);
  const createdAt = parseFeishuTimestampMs(
    readString(isRecord(envelope.header) ? envelope.header.create_time : undefined),
  );

  return {
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
  };
}

async function handleEventPayload(params: {
  core: PluginRuntime;
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  statusSink?: FeishuStatusSink;
  event: unknown;
}) {
  if (!isRecord(params.event)) return;
  const normalized = decryptEnvelopeIfNeeded({
    envelope: params.event,
    encryptKey: params.account.config.encryptKey,
  });
  const token =
    readString(normalized.token) ??
    readString(isRecord(normalized.header) ? normalized.header.token : undefined);
  const configuredToken = params.account.config.verificationToken?.trim();
  if (configuredToken && token && configuredToken !== token) {
    return;
  }
  const extracted = extractFeishuMessageFromEnvelope(normalized);
  if (!extracted) return;

  params.statusSink?.({ lastInboundAt: Date.now() });
  void processFeishuMessage({
    account: params.account,
    config: params.config,
    runtime: params.runtime,
    core: params.core,
    statusSink: params.statusSink,
    ...extracted,
  }).catch((err) => {
    params.runtime.error?.(
      `[${params.account.accountId}] Feishu long connection handler failed: ${String(err)}`,
    );
  });
}

async function monitorSingleSession(params: {
  ws: WebSocket;
  connectConfig: FeishuWsConnectConfig;
  options: FeishuLongConnectionOptions;
  core: PluginRuntime;
}): Promise<void> {
  const { ws, connectConfig, options, core } = params;
  const decoder = new TextDecoder();
  const chunkCache = new Map<string, ChunkBuffer>();
  const pingState = { intervalMs: connectConfig.pingIntervalMs };
  let pingTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePing = () => {
    if (options.abortSignal.aborted) return;
    if (pingTimer) clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const ping = buildControlPingFrame({ serviceId: connectConfig.serviceId });
          ws.send(encodeFeishuLongConnectionFrame(ping));
        } catch (err) {
          options.runtime.error?.(
            `[${options.account.accountId}] Feishu ping failed: ${String(err)}`,
          );
        }
      }
      schedulePing();
    }, pingState.intervalMs);
  };

  const clearCache = () => {
    chunkCache.clear();
  };

  const handleControlFrame = (frame: FrameMessage) => {
    const headerMap = resolveHeaderMap(frame.headers);
    const type = headerMap.type?.trim().toLowerCase();
    if (type === MESSAGE_TYPE_PONG && frame.payload) {
      const payload = decoder.decode(frame.payload);
      const parsed = parseJson(payload);
      if (parsed.ok && isRecord(parsed.value)) {
        const PingInterval =
          typeof parsed.value.PingInterval === "number" ? parsed.value.PingInterval : undefined;
        if (typeof PingInterval === "number" && PingInterval > 0) {
          pingState.intervalMs = Math.max(5_000, Math.floor(PingInterval * 1000));
          schedulePing();
        }
      }
    }
  };

  const handleDataFrame = async (frame: FrameMessage) => {
    const headerMap = resolveHeaderMap(frame.headers);
    const type = headerMap.type?.trim().toLowerCase();
    if (type !== MESSAGE_TYPE_EVENT) return;

    const messageId = headerMap.message_id?.trim() ?? "";
    const sum = Number.parseInt(headerMap.sum ?? "", 10);
    const seq = Number.parseInt(headerMap.seq ?? "", 10);
    if (!messageId || !Number.isFinite(sum) || !Number.isFinite(seq) || sum <= 0 || seq < 0) {
      return;
    }

    const payload = frame.payload;
    if (!payload || payload.length === 0) return;

    const existing = chunkCache.get(messageId);
    const buffer =
      existing ??
      ({
        parts: new Array(sum).fill(undefined),
        received: 0,
        createdAt: Date.now(),
      } satisfies ChunkBuffer);
    if (!existing) chunkCache.set(messageId, buffer);

    if (!buffer.parts[seq]) {
      buffer.parts[seq] = payload;
      buffer.received += 1;
    }

    const merged = mergeChunks(buffer);
    if (!merged) return;
    chunkCache.delete(messageId);

    const raw = decoder.decode(merged);
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      if (core.logging.shouldLogVerbose()) {
        options.runtime.error?.(
          `[${options.account.accountId}] Feishu long connection invalid JSON: ${parsed.error}`,
        );
      }
      ws.send(encodeFeishuLongConnectionFrame(buildAckFrame({ request: frame, code: 500 })));
      return;
    }

    ws.send(encodeFeishuLongConnectionFrame(buildAckFrame({ request: frame, code: 200 })));
    await handleEventPayload({
      core,
      account: options.account,
      config: options.config,
      runtime: options.runtime,
      statusSink: options.statusSink,
      event: parsed.value,
    });
  };

  const closePromise = new Promise<void>((resolve) => {
    const onAbort = () => {
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } finally {
        resolve();
      }
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onMessage = (event: { data: unknown }) => {
      void (async () => {
        const bytes = await normalizeWebSocketData(event.data);
        if (!bytes) return;
        const frame = decodeFeishuLongConnectionFrame(bytes);
        if (frame.method === FRAME_TYPE_CONTROL) {
          handleControlFrame(frame);
          return;
        }
        if (frame.method === FRAME_TYPE_DATA) {
          await handleDataFrame(frame);
        }
      })().catch((err) => {
        options.runtime.error?.(
          `[${options.account.accountId}] Feishu long connection message failed: ${String(err)}`,
        );
      });
    };
    const onError = () => {
      // The close event triggers the reconnect loop.
    };
    const cleanup = () => {
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      options.abortSignal.removeEventListener("abort", onAbort);
      if (pingTimer) clearTimeout(pingTimer);
      pingTimer = null;
      clearCache();
    };
    ws.addEventListener("close", onClose);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    options.abortSignal.addEventListener("abort", onAbort, { once: true });
  });

  schedulePing();
  await closePromise;
}

export async function monitorFeishuLongConnection(
  options: FeishuLongConnectionOptions,
): Promise<void> {
  const core = getFeishuRuntime();

  let attempts = 0;
  while (!options.abortSignal.aborted) {
    let connectConfig: FeishuWsConnectConfig;
    try {
      connectConfig = await fetchConnectConfig(options);
    } catch (err) {
      if (options.abortSignal.aborted) return;
      options.runtime.error?.(
        `[${options.account.accountId}] Feishu long connection config failed: ${String(err)}`,
      );
      await sleepMs(5_000, options.abortSignal);
      continue;
    }

    try {
      const ws = await connectWebSocket({
        url: connectConfig.connectUrl,
        abortSignal: options.abortSignal,
      });
      attempts = 0;
      await monitorSingleSession({ ws, connectConfig, options, core });
    } catch (err) {
      if (options.abortSignal.aborted) return;
      options.runtime.error?.(
        `[${options.account.accountId}] Feishu long connection failed: ${String(err)}`,
      );
    }

    if (options.abortSignal.aborted) return;
    attempts += 1;
    const maxAttempts = connectConfig.reconnectCount;
    if (maxAttempts >= 0 && attempts > maxAttempts) {
      options.runtime.error?.(
        `[${options.account.accountId}] Feishu long connection exceeded reconnect attempts`,
      );
      return;
    }
    const jitter =
      connectConfig.reconnectNonceMs > 0 ? Math.random() * connectConfig.reconnectNonceMs : 0;
    await sleepMs(connectConfig.reconnectIntervalMs + jitter, options.abortSignal);
  }
}
