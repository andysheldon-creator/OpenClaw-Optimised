import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { A2AInboundKey } from "./config.js";

/**
 * Generate a cryptographically random API key (base64url, 32 bytes).
 */
export function generateApiKey(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Extract the API key from the request.
 * Checks `Authorization: Bearer <key>` first, then `X-A2A-Key` header.
 */
function extractKey(req: IncomingMessage): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (match) {
      return match[1];
    }
  }
  const a2aKey = req.headers["x-a2a-key"];
  if (typeof a2aKey === "string" && a2aKey) {
    return a2aKey;
  }
  return undefined;
}

export type ValidateResult =
  | { ok: true; label: string }
  | { ok: false; reason: string };

/**
 * Validate the API key from the request against the list of valid keys.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateApiKey(
  req: IncomingMessage,
  validKeys: A2AInboundKey[],
): ValidateResult {
  const key = extractKey(req);
  if (!key) {
    return { ok: false, reason: "missing_key" };
  }

  for (const entry of validKeys) {
    if (safeEqual(key, entry.key)) {
      return { ok: true, label: entry.label };
    }
  }

  return { ok: false, reason: "invalid_key" };
}

/**
 * Send a 401 JSON-RPC error with WWW-Authenticate header.
 */
export function sendAuthError(res: ServerResponse, message: string): void {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("WWW-Authenticate", 'Bearer realm="a2a"');
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message },
    }),
  );
}
