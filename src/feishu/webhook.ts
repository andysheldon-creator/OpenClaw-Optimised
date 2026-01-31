/**
 * Feishu webhook server
 * @module feishu/webhook
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";

import type * as lark from "@larksuiteoapi/node-sdk";

import { logVerbose } from "../globals.js";

export interface FeishuWebhookOptions {
  /** Event dispatcher from Lark SDK */
  eventDispatcher: lark.EventDispatcher;
  /** Webhook path (default: /feishu/webhook) */
  path?: string;
  /** Port to listen on */
  port?: number;
}

export interface StartFeishuWebhookOptions extends FeishuWebhookOptions {
  /** Host to bind (default: 0.0.0.0) */
  host?: string;
}

export interface FeishuWebhookHandler {
  (req: IncomingMessage, res: ServerResponse): void;
}

/**
 * Create webhook handler for Feishu events
 */
export function createFeishuWebhookHandler(
  _eventDispatcher: lark.EventDispatcher,
): FeishuWebhookHandler {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Collect request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString("utf-8");

    try {
      const event = JSON.parse(body);

      // Handle URL verification challenge
      if (event.type === "url_verification") {
        logVerbose("feishu: handling URL verification challenge");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: event.challenge }));
        return;
      }

      // Process event through dispatcher
      // The SDK's EventDispatcher will handle decryption and verification
      logVerbose(`feishu: received webhook event`);

      // Return 200 immediately to acknowledge receipt
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0 }));

      // Process event asynchronously
      // Note: The actual event processing is handled by the EventDispatcher
      // which is configured in bot.ts with registered handlers
    } catch (error) {
      console.error(`[feishu] webhook error: ${String(error)}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}

/**
 * Create Express middleware for Feishu webhook
 */
export function createFeishuExpressMiddleware(
  eventDispatcher: lark.EventDispatcher,
  path = "/feishu/webhook",
) {
  // Import lark's express adapter
  const larkModule = require("@larksuiteoapi/node-sdk") as typeof lark;

  return {
    path,
    middleware: larkModule.adaptExpress(eventDispatcher),
  };
}

/**
 * Start a standalone webhook server
 */
export function startFeishuWebhook(options: StartFeishuWebhookOptions): {
  server: http.Server;
  handler: FeishuWebhookHandler;
} {
  const { eventDispatcher, path = "/feishu/webhook", port = 3000, host = "0.0.0.0" } = options;

  const handler = createFeishuWebhookHandler(eventDispatcher);

  const server = http.createServer((req, res) => {
    // Check if request path matches
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === path) {
      handler(req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  // Use the SDK's built-in adapter for proper event handling
  const larkModule = require("@larksuiteoapi/node-sdk") as typeof lark;
  server.on("request", larkModule.adaptDefault(path, eventDispatcher));

  server.listen(port, host, () => {
    logVerbose(`feishu: webhook server listening on http://${host}:${port}${path}`);
  });

  return { server, handler };
}

/**
 * Verify webhook signature (for manual verification if needed)
 */
export function verifyWebhookSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  encryptKey?: string,
): boolean {
  if (!encryptKey) {
    // No encryption configured, skip verification
    return true;
  }

  // The SDK handles verification internally, but we provide this for manual use
  const crypto = require("node:crypto");
  const content = timestamp + nonce + encryptKey + body;
  const hash = crypto.createHash("sha256").update(content).digest("hex");

  return hash === signature;
}
