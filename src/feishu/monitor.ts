/**
 * Feishu Event Monitor
 *
 * Supports two modes for receiving events:
 * 1. Webhook mode: HTTP server receives events from Feishu
 * 2. WebSocket mode: Long connection to Feishu for real-time events
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { ClawdbotConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { computeBackoff, sleepWithAbort } from "../infra/backoff.js";
import { formatErrorMessage } from "../infra/errors.js";
import { formatDurationMs } from "../infra/format-duration.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveFeishuAccount, type ResolvedFeishuAccount } from "./accounts.js";
import { createFeishuClient, type FeishuClient } from "./client.js";
import {
  parseFeishuEvent,
  isUrlVerificationEvent,
  isMessageReceiveEvent,
  isBotAddedEvent,
  parseMessageContent,
  extractMentionedText,
  type FeishuMessageReceiveEvent,
  type FeishuRawEventPayload,
} from "./events.js";
import { resolveFeishuEncryptKey, resolveFeishuVerificationToken } from "./token.js";

export type MonitorFeishuOpts = {
  accountId?: string;
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  /** Override event mode (webhook or websocket) */
  eventMode?: "webhook" | "websocket";
  /** Webhook server port */
  webhookPort?: number;
  /** Webhook server path */
  webhookPath?: string;
  /** Message handler callback */
  onMessage?: (ctx: FeishuMessageContext) => void | Promise<void>;
};

export type FeishuMessageContext = {
  event: FeishuMessageReceiveEvent;
  messageId: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  senderType: string;
  text: string;
  rawContent: unknown;
  mentions: FeishuMessageReceiveEvent["event"]["message"]["mentions"];
  wasMentioned: boolean;
  replyToMessageId?: string;
  threadId?: string;
  client: FeishuClient;
  account: ResolvedFeishuAccount;
  cfg: ClawdbotConfig;
  runtime?: RuntimeEnv;
  /** Reply to this message */
  reply: (text: string) => Promise<void>;
};

const FEISHU_RESTART_POLICY = {
  initialMs: 2000,
  maxMs: 30_000,
  factor: 1.8,
  jitter: 0.25,
};

/**
 * Process a Feishu message event
 */
function createMessageContext(
  event: FeishuMessageReceiveEvent,
  client: FeishuClient,
  account: ResolvedFeishuAccount,
  cfg: ClawdbotConfig,
  runtime?: RuntimeEnv,
): FeishuMessageContext {
  const msg = event.event.message;
  const sender = event.event.sender;

  const content = parseMessageContent(msg.content);
  const { strippedText, wasMentioned } = extractMentionedText(content.text ?? "", msg.mentions);

  const ctx: FeishuMessageContext = {
    event,
    messageId: msg.message_id,
    chatId: msg.chat_id,
    chatType: msg.chat_type,
    senderId: sender.sender_id.open_id ?? sender.sender_id.user_id ?? "",
    senderType: sender.sender_type,
    text: strippedText,
    rawContent: content.raw,
    mentions: msg.mentions,
    wasMentioned,
    replyToMessageId: msg.parent_id,
    threadId: msg.thread_id,
    client,
    account,
    cfg,
    runtime,
    reply: async (text: string) => {
      await client.replyMessage(msg.message_id, "text", JSON.stringify({ text }));
    },
  };

  return ctx;
}

/**
 * Start webhook server for receiving Feishu events
 */
async function startWebhookServer(
  opts: MonitorFeishuOpts & {
    account: ResolvedFeishuAccount;
    client: FeishuClient;
  },
): Promise<void> {
  const cfg = opts.config ?? loadConfig();
  const port = opts.webhookPort ?? opts.account.config.webhookPort ?? 3000;
  const path = opts.webhookPath ?? opts.account.config.webhookPath ?? "/feishu-webhook";
  const verificationToken = resolveFeishuVerificationToken(cfg, { accountId: opts.accountId });
  const encryptKey = resolveFeishuEncryptKey(cfg, { accountId: opts.accountId });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || req.url !== path) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    try {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString("utf-8");
      const payload = JSON.parse(body) as unknown;

      // Parse and possibly decrypt event
      const event = parseFeishuEvent(payload, encryptKey);
      if (!event) {
        res.writeHead(400);
        res.end("Invalid event");
        return;
      }

      // Handle URL verification challenge
      if (isUrlVerificationEvent(event)) {
        if (verificationToken && event.token !== verificationToken) {
          res.writeHead(401);
          res.end("Invalid token");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: event.challenge }));
        return;
      }

      // Verify token for regular events
      if (verificationToken && "header" in event && event.header.token !== verificationToken) {
        res.writeHead(401);
        res.end("Invalid token");
        return;
      }

      // Acknowledge receipt immediately
      res.writeHead(200);
      res.end("ok");

      // Process event asynchronously
      await handleFeishuEvent(event, opts);
    } catch (err) {
      opts.runtime?.error?.(`feishu webhook error: ${formatErrorMessage(err)}`);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  // Handle abort signal
  opts.abortSignal?.addEventListener("abort", () => {
    server.close();
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => {
      opts.runtime?.log?.(`feishu: webhook server listening on port ${port}${path}`);
      resolve();
    });
  });
}

/**
 * Handle a parsed Feishu event
 */
async function handleFeishuEvent(
  event: FeishuRawEventPayload,
  opts: MonitorFeishuOpts & {
    account: ResolvedFeishuAccount;
    client: FeishuClient;
  },
): Promise<void> {
  const cfg = opts.config ?? loadConfig();
  const log = opts.runtime?.log ?? console.log;

  if (isMessageReceiveEvent(event)) {
    log(`feishu: handling message receive event`);
    const ctx = createMessageContext(event, opts.client, opts.account, cfg, opts.runtime);
    log(
      `feishu: message context created - chatId=${ctx.chatId}, senderId=${ctx.senderId}, senderType=${ctx.senderType}, text="${ctx.text.substring(0, 100)}"`,
    );

    // Skip bot's own messages
    if (ctx.senderType === "bot") {
      log(`feishu: skipping bot's own message`);
      return;
    }

    // Call message handler
    if (opts.onMessage) {
      log(`feishu: calling onMessage handler`);
      try {
        await opts.onMessage(ctx);
        log(`feishu: onMessage handler completed`);
      } catch (err) {
        opts.runtime?.error?.(`feishu: message handler error: ${formatErrorMessage(err)}`);
      }
    } else {
      log(`feishu: no onMessage handler registered`);
    }
  } else if (isBotAddedEvent(event)) {
    opts.runtime?.log?.(`feishu: bot added to chat ${event.event.chat_id}`);
  } else {
    log(`feishu: received unknown event type`);
  }
}

/**
 * SDK message event data structure (from @larksuiteoapi/node-sdk)
 * Defined inline to avoid compile-time dependency on the SDK
 */
type SdkMessageEventData = {
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    thread_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
  };
};

/**
 * SDK bot added event data structure
 */
type SdkBotAddedEventData = {
  chat_id: string;
  operator_id?: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name?: string;
};

/**
 * Start WebSocket connection for receiving Feishu events
 *
 * Uses Feishu's official SDK WSClient for long connection mode.
 * This approach:
 * - Doesn't require a public IP/domain
 * - Works in local development environments
 * - No decryption/signature verification needed (auth at connection time)
 */
async function startWebSocketMode(
  opts: MonitorFeishuOpts & {
    account: ResolvedFeishuAccount;
    client: FeishuClient;
  },
): Promise<void> {
  const log = opts.runtime?.log ?? console.log;
  const error = opts.runtime?.error ?? console.error;

  log(`feishu: starting WebSocket event monitor for account "${opts.account.accountId}"`);

  // Dynamically import the official Feishu SDK
  // This allows the core feishu module to work without the SDK installed
  // while the extension provides it
  // Use string variable to prevent TypeScript from resolving at compile time
  const sdkModule = "@larksuiteoapi/node-sdk";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lark: any;
  try {
    lark = await import(/* webpackIgnore: true */ sdkModule);
  } catch {
    throw new Error(
      `Feishu WebSocket mode requires ${sdkModule}. ` +
        `Install it with: npm install ${sdkModule}\n` +
        `Or use webhook mode instead (eventMode: "webhook").`,
    );
  }

  const { appId, appSecret } = opts.account.credentials;

  // Create WebSocket client with Feishu domain
  // Use warn level to suppress SDK info logs about persistent connection setup
  const wsClient = new lark.WSClient({
    appId,
    appSecret,
    domain: lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.warn,
  });

  // Create event dispatcher to handle incoming events
  const eventDispatcher = new lark.EventDispatcher({
    // encryptKey not needed for WebSocket mode (plaintext after auth)
  }).register({
    // Handle message receive events
    "im.message.receive_v1": async (data: SdkMessageEventData) => {
      try {
        log(
          `feishu: received message event from ${data.sender?.sender_id?.open_id ?? "unknown"} in chat ${data.message?.chat_id ?? "unknown"}`,
        );
        log(`feishu: message content: ${data.message?.content?.substring(0, 200) ?? "(empty)"}`);
        // Convert SDK event format to our internal format
        const event = convertSdkMessageEvent(data);
        await handleFeishuEvent(event, opts);
      } catch (err) {
        error(`feishu: WebSocket message handler error: ${formatErrorMessage(err)}`);
      }
    },
    // Handle bot added to chat events
    "im.chat.member.bot.added_v1": async (data: SdkBotAddedEventData) => {
      log(`feishu: bot added to chat ${data.chat_id}`);
    },
    // Handle user entering P2P chat with bot (suppress warning)
    "im.chat.access_event.bot_p2p_chat_entered_v1": async (data: {
      chat_id?: string;
      operator_id?: unknown;
    }) => {
      log(`feishu: user entered P2P chat ${data.chat_id ?? "unknown"}`);
    },
  });

  // Handle abort signal - close WebSocket connection
  let wsAborted = false;
  opts.abortSignal?.addEventListener("abort", () => {
    wsAborted = true;
    // Note: The SDK doesn't expose a direct close method,
    // but the process exit will close the connection
  });

  // Start WebSocket connection
  log(`feishu: connecting to Feishu WebSocket server...`);

  try {
    await wsClient.start({
      eventDispatcher,
    });
    log(`feishu: WebSocket connection established`);
  } catch (wsErr) {
    throw new Error(`Feishu WebSocket connection failed: ${formatErrorMessage(wsErr)}`);
  }

  // Keep running until aborted
  // The WSClient maintains the connection internally
  if (!wsAborted) {
    await new Promise<void>((resolve) => {
      opts.abortSignal?.addEventListener("abort", () => resolve());
    });
  }
}

/**
 * Convert SDK message event format to our internal FeishuMessageReceiveEvent format
 */
function convertSdkMessageEvent(sdkData: SdkMessageEventData): FeishuMessageReceiveEvent {
  return {
    schema: "2.0",
    header: {
      event_id: `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      event_type: "im.message.receive_v1",
      create_time: sdkData.message.create_time,
      token: "", // Not provided in WebSocket mode
      app_id: "", // Filled by caller context if needed
      tenant_key: sdkData.sender.tenant_key ?? "",
    },
    event: {
      sender: sdkData.sender,
      message: {
        ...sdkData.message,
        chat_type: sdkData.message.chat_type as "p2p" | "group",
      },
    },
  };
}

/**
 * Main entry point for Feishu event monitoring
 */
export async function monitorFeishuProvider(opts: MonitorFeishuOpts = {}): Promise<void> {
  const cfg = opts.config ?? loadConfig();
  const log = opts.runtime?.log ?? console.log;
  const account = resolveFeishuAccount({
    cfg,
    accountId: opts.accountId,
  });

  log(`feishu: initializing account "${account.accountId}"...`);

  if (account.credentials.source === "none") {
    throw new Error(
      `Feishu credentials missing for account "${account.accountId}" (set channels.feishu.appId/appSecret or FEISHU_APP_ID/FEISHU_APP_SECRET env vars).`,
    );
  }

  if (!account.enabled) {
    throw new Error(`Feishu account "${account.accountId}" is disabled.`);
  }

  log(
    `feishu: credentials loaded from ${account.credentials.source} (appId: ${account.credentials.appId.slice(0, 8)}...)`,
  );

  const client = createFeishuClient(account.credentials, {
    timeoutMs: (account.config.timeoutSeconds ?? 30) * 1000,
  });

  // Verify credentials by getting bot info
  log(`feishu: verifying bot credentials...`);
  try {
    const botInfo = await client.getBotInfo();
    log(`feishu: connected as "${botInfo.app_name}" (${botInfo.open_id})`);
  } catch (err) {
    throw new Error(`Feishu authentication failed: ${formatErrorMessage(err)}`);
  }

  // Default to websocket mode (recommended, no public URL required)
  const eventMode = opts.eventMode ?? account.config.eventMode ?? "websocket";
  log(`feishu: event mode is "${eventMode}"`);
  let restartAttempts = 0;

  while (!opts.abortSignal?.aborted) {
    try {
      if (eventMode === "webhook") {
        await startWebhookServer({ ...opts, account, client });
        return; // Webhook server stays running
      } else {
        await startWebSocketMode({ ...opts, account, client });
        return;
      }
    } catch (err) {
      if (opts.abortSignal?.aborted) {
        throw err;
      }

      restartAttempts += 1;
      const delayMs = computeBackoff(FEISHU_RESTART_POLICY, restartAttempts);
      const errMsg = formatErrorMessage(err);
      (opts.runtime?.error ?? console.error)(
        `Feishu monitor error: ${errMsg}; retrying in ${formatDurationMs(delayMs)}.`,
      );

      try {
        await sleepWithAbort(delayMs, opts.abortSignal);
      } catch (sleepErr) {
        if (opts.abortSignal?.aborted) return;
        throw sleepErr;
      }
    }
  }
}

/**
 * Create a Feishu webhook handler for use with external HTTP servers
 */
export function createFeishuWebhookHandler(opts: MonitorFeishuOpts = {}) {
  const cfg = opts.config ?? loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: opts.accountId,
  });

  if (account.credentials.source === "none") {
    throw new Error(`Feishu credentials missing for account "${account.accountId}".`);
  }

  const client = createFeishuClient(account.credentials);
  const verificationToken = resolveFeishuVerificationToken(cfg, { accountId: opts.accountId });
  const encryptKey = resolveFeishuEncryptKey(cfg, { accountId: opts.accountId });

  return async (body: unknown): Promise<{ status: number; body: unknown }> => {
    const event = parseFeishuEvent(body, encryptKey);
    if (!event) {
      return { status: 400, body: { error: "Invalid event" } };
    }

    // Handle URL verification
    if (isUrlVerificationEvent(event)) {
      if (verificationToken && event.token !== verificationToken) {
        return { status: 401, body: { error: "Invalid token" } };
      }
      return { status: 200, body: { challenge: event.challenge } };
    }

    // Verify token
    if (verificationToken && "header" in event && event.header.token !== verificationToken) {
      return { status: 401, body: { error: "Invalid token" } };
    }

    // Process event asynchronously (don't await to respond quickly)
    handleFeishuEvent(event, { ...opts, account, client }).catch((err) => {
      opts.runtime?.error?.(`feishu webhook handler error: ${formatErrorMessage(err)}`);
    });

    return { status: 200, body: { ok: true } };
  };
}
