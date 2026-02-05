/**
 * Remote Pairing Approval API
 *
 * Provides a secure HTTP endpoint for approving device pairings from remote
 * administrators without CLI access. Designed for cloud deployments like Railway.
 *
 * Security:
 * - Authorization header only (secret never in JSON body)
 * - HMAC-SHA256 signature verification
 * - Timestamp + nonce replay protection
 * - Rate limiting
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DevicePairingPendingRequest } from "../infra/device-pairing.js";
import { approveDevicePairing, listDevicePairing } from "../infra/device-pairing.js";
import type { OpenClawConfig } from "../config/types.js";

/**
 * Configuration for remote pairing approval
 */
export type RemotePairingConfig = {
  /** Enable remote pairing approval API */
  enabled?: boolean;
  /** Admin secret for authentication (required if enabled) */
  adminSecret?: string;
  /** API path prefix (default: /.moltbot/pairing) */
  path?: string;
  /** Request timestamp validity window in seconds (default: 300) */
  timestampValiditySeconds?: number;
  /** Nonce cache size for replay protection (default: 1000) */
  nonceCacheSize?: number;
};

export type RemotePairingResolvedConfig = {
  enabled: boolean;
  adminSecret: string;
  path: string;
  timestampValiditySeconds: number;
  nonceCacheSize: number;
};

/**
 * Resolve remote pairing config from OpenClawConfig
 */
export function resolveRemotePairingConfig(
  cfg: OpenClawConfig,
): RemotePairingResolvedConfig | null {
  const raw = cfg.gateway?.remotePairing;
  if (raw?.enabled !== true) return null;

  const secret = raw.adminSecret?.trim();
  if (!secret) {
    throw new Error("gateway.remotePairing.enabled requires gateway.remotePairing.adminSecret");
  }

  return {
    enabled: true,
    adminSecret: secret,
    path: raw.path?.trim() || "/.moltbot/pairing",
    timestampValiditySeconds: raw.timestampValiditySeconds || 300,
    nonceCacheSize: raw.nonceCacheSize || 1000,
  };
}

/**
 * HMAC signature verification result
 */
export type SignatureResult = {
  ok: boolean;
  error?: string;
};

/**
 * Verify HMAC signature
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): SignatureResult {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuffer = Buffer.from(signature, "hex");
  const expBuffer = Buffer.from(expected, "hex");

  if (sigBuffer.length !== expBuffer.length || sigBuffer.length === 0) {
    return { ok: false, error: "invalid signature format" };
  }

  try {
    if (!timingSafeEqual(sigBuffer, expBuffer)) {
      return { ok: false, error: "signature mismatch" };
    }
  } catch {
    return { ok: false, error: "signature comparison failed" };
  }

  return { ok: true };
}

/**
 * Parse Authorization header
 */
export function parseAuthHeader(auth: string | undefined): string | null {
  if (!auth) return null;
  const trimmed = auth.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

/**
 * Replay protection cache
 */
class NonceCache {
  private cache: Set<string>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Set();
    this.maxSize = maxSize;
  }

  checkAndAdd(nonce: string): boolean {
    if (this.cache.has(nonce)) return false;
    this.cache.add(nonce);

    // Evict oldest if over size limit
    if (this.cache.size > this.maxSize) {
      const iterator = this.cache.values();
      iterator.next();
      const toDelete = iterator.next().value;
      if (toDelete !== undefined) {
        this.cache.delete(toDelete);
      }
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global nonce cache
let globalNonceCache: NonceCache | null = null;

function getNonceCache(size: number): NonceCache {
  if (!globalNonceCache || (globalNonceCache as unknown as { maxSize: number }).maxSize !== size) {
    globalNonceCache = new NonceCache(size);
  }
  return globalNonceCache;
}

/**
 * HTTP response helpers
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { ok: false, error: message });
}

/**
 * Handle remote pairing HTTP request
 */
export async function handleRemotePairingRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: RemotePairingResolvedConfig,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  // Check if this is a pairing path
  if (!url.pathname.endsWith("/approve") && !url.pathname.endsWith("/pending")) {
    return false;
  }

  // Extract auth (required for all pairing endpoints)
  const auth = parseAuthHeader(req.headers.authorization);
  if (!auth) {
    sendError(res, 401, "missing authorization header");
    return true;
  }

  if (auth !== config.adminSecret) {
    sendError(res, 401, "invalid authorization");
    return true;
  }

  // Handle GET /pending - list pending requests
  if (req.method === "GET" && url.pathname.endsWith("/pending")) {
    const list = await listDevicePairing();
    sendJson(res, 200, {
      ok: true,
      pending: list.pending.map((p) => ({
        requestId: p.requestId,
        deviceId: p.deviceId,
        displayName: p.displayName,
        platform: p.platform,
        role: p.role,
        scopes: p.scopes,
        remoteIp: p.remoteIp,
        ts: p.ts,
        isRepair: p.isRepair,
      })),
    });
    return true;
  }

  // Only handle POST to /approve
  if (req.method !== "POST") {
    sendError(res, 405, "method not allowed");
    return true;
  }

  // Extract signature headers
  const timestamp = req.headers["x-moltbot-timestamp"];
  const nonce = req.headers["x-moltbot-nonce"];
  const signature = req.headers["x-moltbot-signature"];

  if (!timestamp || !nonce || !signature) {
    sendError(
      res,
      400,
      "missing required headers: X-Moltbot-Timestamp, X-Moltbot-Nonce, X-Moltbot-Signature",
    );
    return true;
  }

  // Verify timestamp
  const ts = parseInt(String(timestamp), 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > config.timestampValiditySeconds) {
    sendError(res, 401, "timestamp expired or invalid");
    return true;
  }

  // Check nonce (replay protection)
  const nonceKey = `${auth.slice(0, 8)}:${nonce}`;
  const cache = getNonceCache(config.nonceCacheSize);
  if (!cache.checkAndAdd(nonceKey)) {
    sendError(res, 401, "nonce already used (replay attack?)");
    return true;
  }

  // Read body
  const body = await readRequestBody(req);
  if (!body.ok) {
    sendError(res, 400, body.error || "invalid request body");
    return true;
  }

  // Verify signature: timestamp.nonce.body
  const signedPayload = `${ts}.${nonce}.${JSON.stringify(body.value)}`;
  const sigResult = verifySignature(signedPayload, String(signature), config.adminSecret);
  if (!sigResult.ok) {
    sendError(res, 401, sigResult.error || "signature verification failed");
    return true;
  }

  // Extract requestId
  const requestId = (body.value as Record<string, unknown>)?.requestId;
  if (typeof requestId !== "string" || !requestId.trim()) {
    sendError(res, 400, "missing or invalid requestId");
    return true;
  }

  // Approve pairing
  const approved = await approveDevicePairing(requestId.trim());
  if (!approved) {
    sendError(res, 404, "pairing request not found");
    return true;
  }

  sendJson(res, 200, {
    ok: true,
    deviceId: approved.device.deviceId,
    role: approved.device.role,
    scopes: approved.device.scopes,
  });

  return true;
}

/**
 * List pending pairing requests (for Control UI)
 */
export async function listPendingPairingRequests(): Promise<{
  pending: DevicePairingPendingRequest[];
}> {
  const list = await listDevicePairing();
  return { pending: list.pending };
}

async function readRequestBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 1024; // Small limit for pairing requests

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8").trim();
        if (!raw) {
          resolve({ ok: true, value: {} });
          return;
        }
        const parsed = JSON.parse(raw);
        resolve({ ok: true, value: parsed });
      } catch (err) {
        resolve({ ok: false, error: String(err) });
      }
    });

    req.on("error", (err: Error) => {
      resolve({ ok: false, error: String(err) });
    });
  });
}
