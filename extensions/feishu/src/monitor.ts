import * as http from "node:http";
import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk";
import * as Lark from "@larksuiteoapi/node-sdk";
import type { ResolvedFeishuAccount } from "./types.js";
import { resolveFeishuAccount, listEnabledFeishuAccounts } from "./accounts.js";
import { handleFeishuMessage, type FeishuMessageEvent, type FeishuBotAddedEvent } from "./bot.js";
import { createFeishuWSClient, createEventDispatcher } from "./client.js";
import { probeFeishu } from "./probe.js";

export type MonitorFeishuOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

// Per-account WebSocket clients and bot info
const wsClients = new Map<string, Lark.WSClient>();
const botOpenIds = new Map<string, string>();
// Per-account webhook HTTP servers (for stopFeishuMonitor)
const webhookServers = new Map<string, http.Server>();

async function fetchBotOpenId(account: ResolvedFeishuAccount): Promise<string | undefined> {
  try {
    const result = await probeFeishu(account);
    return result.ok ? result.botOpenId : undefined;
  } catch {
    return undefined;
  }
}

/** Webhook payload: URL verification (Lark/Feishu event subscription). */
function isUrlVerification(data: unknown): data is { type: "url_verification"; challenge: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === "url_verification" &&
    typeof (data as { challenge?: string }).challenge === "string"
  );
}

/** Webhook payload: event callback (v2 schema). */
function getEventFromWebhookPayload(data: unknown): {
  eventType: string;
  event: unknown;
} | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { schema?: string; header?: { event_type?: string }; event?: unknown };
  if (d.schema === "2.0" && d.header?.event_type && d.event !== undefined) {
    return { eventType: d.header.event_type, event: d.event };
  }
  const legacy = data as { event?: { type?: string } & unknown };
  if (legacy.event && typeof legacy.event === "object" && typeof (legacy.event as { type?: string }).type === "string") {
    return {
      eventType: (legacy.event as { type: string }).type,
      event: legacy.event,
    };
  }
  return null;
}

/**
 * Start HTTP server for Feishu webhook mode.
 * Handles URL verification and im.message.receive_v1 events.
 */
async function startFeishuWebhookServer(params: {
  cfg: ClawdbotConfig;
  account: ResolvedFeishuAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  port: number;
  webhookPath: string;
  botOpenId?: string;
  chatHistories: Map<string, HistoryEntry[]>;
}): Promise<void> {
  const {
    cfg,
    account,
    runtime,
    abortSignal,
    port,
    webhookPath,
    botOpenId,
    chatHistories,
  } = params;
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const matchesPath = (url: string | undefined): boolean => {
    if (!url) return false;
    const pathOnly = url.split("?")[0];
    return pathOnly === webhookPath || pathOnly === `${webhookPath}/`;
  };

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", channel: "feishu", accountId }),
      );
      return;
    }

    if (req.method !== "POST" || !matchesPath(req.url)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as unknown;

        if (isUrlVerification(data)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ challenge: data.challenge }));
          log(`feishu[${accountId}]: URL verification completed`);
          return;
        }

        const payload = getEventFromWebhookPayload(data);
        if (!payload) {
          log(`feishu[${accountId}]: unknown webhook payload, responding 200`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // Respond immediately; process event asynchronously
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));

        if (payload.eventType !== "im.message.receive_v1") {
          log(`feishu[${accountId}]: ignoring event type ${payload.eventType}`);
          return;
        }

        void handleFeishuMessage({
          cfg,
          event: payload.event as FeishuMessageEvent,
          botOpenId,
          runtime,
          chatHistories,
          accountId,
        }).catch((err) => {
          error(`feishu[${accountId}]: webhook message handler error: ${String(err)}`);
        });
      } catch (err) {
        error(`feishu[${accountId}]: webhook parse error: ${String(err)}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    });
  });

  webhookServers.set(accountId, server);

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        log(`feishu[${accountId}]: stopping webhook server`);
        webhookServers.delete(accountId);
        server.close();
      },
      { once: true },
    );
  }

  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      webhookServers.delete(accountId);
      error(`feishu[${accountId}]: webhook server error: ${String(err)}`);
      reject(err);
    });
    server.listen(port, () => {
      log(`feishu[${accountId}]: webhook server listening on port ${port} at ${webhookPath}`);
      resolve();
    });
  });
}

/**
 * Monitor a single Feishu account.
 */
async function monitorSingleAccount(params: {
  cfg: ClawdbotConfig;
  account: ResolvedFeishuAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, account, runtime, abortSignal } = params;
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  // Fetch bot open_id
  const botOpenId = await fetchBotOpenId(account);
  botOpenIds.set(accountId, botOpenId ?? "");
  log(`feishu[${accountId}]: bot open_id resolved: ${botOpenId ?? "unknown"}`);

  const connectionMode = account.config.connectionMode ?? "websocket";

  if (connectionMode === "webhook") {
    const port = account.config.webhookPort ?? 9000;
    const webhookPath =
      (account.config.webhookPath ?? "/feishu/events").replace(/\/+$/, "") || "/feishu/events";
    return startFeishuWebhookServer({
      cfg,
      account,
      runtime,
      abortSignal,
      port,
      webhookPath,
      botOpenId: botOpenId ?? undefined,
      chatHistories: new Map<string, HistoryEntry[]>(),
    });
  }

  log(`feishu[${accountId}]: starting WebSocket connection...`);

  const wsClient = createFeishuWSClient(account);
  wsClients.set(accountId, wsClient);

  const chatHistories = new Map<string, HistoryEntry[]>();
  const eventDispatcher = createEventDispatcher(account);

  eventDispatcher.register({
    "im.message.receive_v1": async (data) => {
      try {
        const event = data as unknown as FeishuMessageEvent;
        await handleFeishuMessage({
          cfg,
          event,
          botOpenId: botOpenIds.get(accountId),
          runtime,
          chatHistories,
          accountId,
        });
      } catch (err) {
        error(`feishu[${accountId}]: error handling message: ${String(err)}`);
      }
    },
    "im.message.message_read_v1": async () => {
      // Ignore read receipts
    },
    "im.chat.member.bot.added_v1": async (data) => {
      try {
        const event = data as unknown as FeishuBotAddedEvent;
        log(`feishu[${accountId}]: bot added to chat ${event.chat_id}`);
      } catch (err) {
        error(`feishu[${accountId}]: error handling bot added event: ${String(err)}`);
      }
    },
    "im.chat.member.bot.deleted_v1": async (data) => {
      try {
        const event = data as unknown as { chat_id: string };
        log(`feishu[${accountId}]: bot removed from chat ${event.chat_id}`);
      } catch (err) {
        error(`feishu[${accountId}]: error handling bot removed event: ${String(err)}`);
      }
    },
  });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      wsClients.delete(accountId);
      botOpenIds.delete(accountId);
    };

    const handleAbort = () => {
      log(`feishu[${accountId}]: abort signal received, stopping`);
      cleanup();
      resolve();
    };

    if (abortSignal?.aborted) {
      cleanup();
      resolve();
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    try {
      void wsClient.start({ eventDispatcher });
      log(`feishu[${accountId}]: WebSocket client started`);
    } catch (err) {
      cleanup();
      abortSignal?.removeEventListener("abort", handleAbort);
      reject(err);
    }
  });
}

/**
 * Main entry: start monitoring for all enabled accounts.
 */
export async function monitorFeishuProvider(opts: MonitorFeishuOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Feishu monitor");
  }

  const log = opts.runtime?.log ?? console.log;

  // If accountId is specified, only monitor that account
  if (opts.accountId) {
    const account = resolveFeishuAccount({ cfg, accountId: opts.accountId });
    if (!account.enabled || !account.configured) {
      throw new Error(`Feishu account "${opts.accountId}" not configured or disabled`);
    }
    return monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
    });
  }

  // Otherwise, start all enabled accounts
  const accounts = listEnabledFeishuAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled Feishu accounts configured");
  }

  log(
    `feishu: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`,
  );

  // Start all accounts in parallel
  await Promise.all(
    accounts.map((account) =>
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    ),
  );
}

/**
 * Stop monitoring for a specific account or all accounts.
 */
export function stopFeishuMonitor(accountId?: string): void {
  const toStop = accountId ? [accountId] : [...webhookServers.keys()];
  for (const id of toStop) {
    const s = webhookServers.get(id);
    if (s) {
      s.close();
      webhookServers.delete(id);
    }
  }
  if (accountId) {
    wsClients.delete(accountId);
    botOpenIds.delete(accountId);
  } else {
    wsClients.clear();
    botOpenIds.clear();
    webhookServers.clear();
  }
}
