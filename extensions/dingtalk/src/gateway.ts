/**
 * DingTalk gateway adapter - webhook server
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DingTalkConfig, DingTalkInboundMessage } from "./types.js";
import { parseInboundMessage } from "./inbound.js";
import { verifySignature } from "./signature.js";

export interface WebhookHandler {
  (message: DingTalkInboundMessage): Promise<void> | void;
}

/**
 * Handle incoming DingTalk webhook request
 */
export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: DingTalkConfig,
  handler: WebhookHandler,
): Promise<void> {
  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Parse query parameters for signature verification
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const timestamp = url.searchParams.get("timestamp");
    const sign = url.searchParams.get("sign");

    if (!timestamp || !sign) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing signature parameters" }));
      return;
    }

    // Verify signature
    if (!verifySignature(timestamp, sign, config.secret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString("utf-8");

    // Parse JSON payload
    let payload: DingTalkInboundMessage;
    try {
      payload = JSON.parse(body) as DingTalkInboundMessage;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }

    // Parse message
    const message = parseInboundMessage(payload);
    if (!message) {
      // Not a supported message type, return success anyway
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Handle message
    await handler(payload);

    // Return success response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("DingTalk webhook error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    );
  }
}

/**
 * Create webhook endpoint path
 */
export function getWebhookPath(): string {
  return "/webhooks/dingtalk";
}
