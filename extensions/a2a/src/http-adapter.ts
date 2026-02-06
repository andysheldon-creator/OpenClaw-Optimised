import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentCard } from "@a2a-js/sdk";
import type { DefaultRequestHandler } from "@a2a-js/sdk/server";

import type { A2AInboundKey } from "./config.js";
import { validateApiKey, sendAuthError } from "./inbound-auth.js";

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

/**
 * Read JSON body from request.
 */
async function readJsonBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve({ ok: false, error: "Request body too large" });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!body.trim()) {
          resolve({ ok: true, value: {} });
          return;
        }
        const parsed = JSON.parse(body);
        resolve({ ok: true, value: parsed });
      } catch {
        resolve({ ok: false, error: "Invalid JSON body" });
      }
    });

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendJsonRpcError(res: ServerResponse, id: unknown, code: number, message: string) {
  sendJson(res, 200, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

function setSseHeaders(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export type A2AAuthConfig = {
  required: boolean;
  validKeys: A2AInboundKey[];
};

export type A2AHttpHandlerParams = {
  agentCard: AgentCard;
  requestHandler: DefaultRequestHandler;
  auth?: A2AAuthConfig;
};

/**
 * Create HTTP handlers for A2A protocol endpoints.
 */
export function createA2AHttpHandlers(params: A2AHttpHandlerParams) {
  const { agentCard, requestHandler, auth } = params;

  /**
   * Handle /.well-known/agent-card.json — always public (discovery endpoint).
   */
  async function handleAgentCard(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }
    sendJson(res, 200, agentCard);
  }

  /**
   * Handle JSON-RPC endpoint (typically /a2a or /a2a/jsonrpc)
   */
  async function handleJsonRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    // Inbound auth check — reject before reading the body
    if (auth?.required) {
      const result = validateApiKey(req, auth.validKeys);
      if (!result.ok) {
        sendAuthError(res, "Authentication required");
        return;
      }
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.ok) {
      sendJsonRpcError(res, null, -32700, bodyResult.error);
      return;
    }

    const body = bodyResult.value as Record<string, unknown>;
    const jsonrpc = body.jsonrpc;
    const id = body.id;
    const method = body.method;
    const bodyParams = body.params as Record<string, unknown> | undefined;

    if (jsonrpc !== "2.0") {
      sendJsonRpcError(res, id, -32600, "Invalid Request: jsonrpc must be 2.0");
      return;
    }

    if (typeof method !== "string") {
      sendJsonRpcError(res, id, -32600, "Invalid Request: method must be a string");
      return;
    }

    try {
      // Route based on A2A method
      switch (method) {
        case "message/send": {
          const message = bodyParams?.message;
          if (!message || typeof message !== "object") {
            sendJsonRpcError(res, id, -32602, "Invalid params: message required");
            return;
          }

          const result = await requestHandler.sendMessage({
            message: message as Parameters<typeof requestHandler.sendMessage>[0]["message"],
            contextId: typeof bodyParams?.contextId === "string" ? bodyParams.contextId : undefined,
          });

          sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result,
          });
          break;
        }

        case "message/stream": {
          const message = bodyParams?.message;
          if (!message || typeof message !== "object") {
            sendJsonRpcError(res, id, -32602, "Invalid params: message required");
            return;
          }

          // Set up SSE response
          setSseHeaders(res);

          const stream = await requestHandler.sendMessageStream({
            message: message as Parameters<typeof requestHandler.sendMessageStream>[0]["message"],
            contextId: typeof bodyParams?.contextId === "string" ? bodyParams.contextId : undefined,
          });

          // Stream events
          for await (const event of stream) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }

          res.write("data: [DONE]\n\n");
          res.end();
          break;
        }

        case "tasks/get": {
          const taskId = bodyParams?.taskId;
          if (typeof taskId !== "string") {
            sendJsonRpcError(res, id, -32602, "Invalid params: taskId required");
            return;
          }

          const result = await requestHandler.getTask({ taskId });
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result,
          });
          break;
        }

        case "tasks/cancel": {
          const taskId = bodyParams?.taskId;
          if (typeof taskId !== "string") {
            sendJsonRpcError(res, id, -32602, "Invalid params: taskId required");
            return;
          }

          const result = await requestHandler.cancelTask({ taskId });
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id,
            result,
          });
          break;
        }

        default:
          sendJsonRpcError(res, id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJsonRpcError(res, id, -32000, `Server error: ${message}`);
    }
  }

  return {
    handleAgentCard,
    handleJsonRpc,
  };
}
