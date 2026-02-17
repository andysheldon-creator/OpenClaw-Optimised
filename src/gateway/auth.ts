import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
export type ResolvedGatewayAuthMode = "none" | "token" | "password";

export type ResolvedGatewayAuth = {
  mode: ResolvedGatewayAuthMode;
  token?: string;
  password?: string;
  allowTailscale: boolean;
};

export type GatewayAuthResult = {
  ok: boolean;
  method?: "none" | "token" | "password" | "tailscale";
  user?: string;
  reason?: string;
};

type ConnectAuth = {
  token?: string;
  password?: string;
};

type TailscaleUser = {
  login: string;
  name: string;
  profilePic?: string;
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  if (ip === "127.0.0.1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip === "::1") return true;
  if (ip.startsWith("::ffff:127.")) return true;
  return false;
}

function isLocalDirectRequest(req?: IncomingMessage): boolean {
  if (!req) return false;
  const clientIp = req.socket?.remoteAddress ?? "";
  if (!isLoopbackAddress(clientIp)) return false;

  const host = (req.headers.host ?? "").toLowerCase();
  const hostIsLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  const hasForwarded = Boolean(
    req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-host"],
  );

  return hostIsLocal && !hasForwarded;
}

function getTailscaleUser(req?: IncomingMessage): TailscaleUser | null {
  if (!req) return null;
  const login = req.headers["tailscale-user-login"];
  if (typeof login !== "string" || !login.trim()) return null;
  const nameRaw = req.headers["tailscale-user-name"];
  const profilePic = req.headers["tailscale-user-profile-pic"];
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : login.trim();
  return {
    login: login.trim(),
    name,
    profilePic:
      typeof profilePic === "string" && profilePic.trim()
        ? profilePic.trim()
        : undefined,
  };
}

function hasTailscaleProxyHeaders(req?: IncomingMessage): boolean {
  if (!req) return false;
  return Boolean(
    req.headers["x-forwarded-for"] &&
      req.headers["x-forwarded-proto"] &&
      req.headers["x-forwarded-host"],
  );
}

function isTailscaleProxyRequest(req?: IncomingMessage): boolean {
  if (!req) return false;
  return (
    isLoopbackAddress(req.socket?.remoteAddress) &&
    hasTailscaleProxyHeaders(req)
  );
}

export function assertGatewayAuthConfigured(auth: ResolvedGatewayAuth): void {
  if (auth.mode === "token" && !auth.token) {
    throw new Error(
      "gateway auth mode is token, but no token was configured (set gateway.auth.token or CLAWDIS_GATEWAY_TOKEN)",
    );
  }
  if (auth.mode === "password" && !auth.password) {
    throw new Error(
      "gateway auth mode is password, but no password was configured",
    );
  }
}

export async function authorizeGatewayConnect(params: {
  auth: ResolvedGatewayAuth;
  connectAuth?: ConnectAuth | null;
  req?: IncomingMessage;
}): Promise<GatewayAuthResult> {
  const { auth, connectAuth, req } = params;
  const localDirect = isLocalDirectRequest(req);

  if (auth.mode === "none") {
    if (auth.allowTailscale && !localDirect) {
      const tailscaleUser = getTailscaleUser(req);
      if (!tailscaleUser) {
        return { ok: false, reason: "unauthorized" };
      }
      if (!isTailscaleProxyRequest(req)) {
        return { ok: false, reason: "unauthorized" };
      }
      return {
        ok: true,
        method: "tailscale",
        user: tailscaleUser.login,
      };
    }
    return { ok: true, method: "none" };
  }

  if (auth.mode === "token") {
    if (auth.token && connectAuth?.token === auth.token) {
      return { ok: true, method: "token" };
    }
  }

  if (auth.mode === "password") {
    // Accept password from either the password field or the token field.
    // The control UI persists credentials via the "token" field (localStorage)
    // but not the "password" field (memory-only), so on page refresh the
    // credential arrives as connectAuth.token.  Accepting it here means the
    // dashboard stays authenticated across refreshes without requiring users
    // to switch the server to token mode.
    const password = connectAuth?.password || connectAuth?.token;
    if (!password || !auth.password) {
      return { ok: false, reason: "unauthorized" };
    }
    if (!safeEqual(password, auth.password)) {
      return { ok: false, reason: "unauthorized" };
    }
    return { ok: true, method: "password" };
  }

  if (auth.allowTailscale) {
    const tailscaleUser = getTailscaleUser(req);
    if (tailscaleUser && isTailscaleProxyRequest(req)) {
      return {
        ok: true,
        method: "tailscale",
        user: tailscaleUser.login,
      };
    }
  }

  return { ok: false, reason: "unauthorized" };
}

/**
 * Loopback origin patterns allowed for WebSocket upgrade requests.
 * Matches http(s)://localhost, 127.0.0.1, [::1] with any port.
 */
const LOOPBACK_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https?:\/\/\[::1\](:\d+)?$/i,
];

/**
 * Validates whether a WebSocket upgrade request has an acceptable Origin header.
 *
 * - `undefined` origin: allowed (non-browser clients like CLI tools don't send Origin)
 * - `"null"` origin: allowed (same-origin requests from file:// or data: URIs)
 * - Loopback origins: always allowed (localhost, 127.0.0.1, [::1])
 * - When extraAllowedOrigins are provided: also allows those (for LAN/tailnet bind modes)
 * - All other origins: rejected (blocks cross-site WebSocket hijacking / CSRF)
 */
export function isAllowedOrigin(
  origin: string | undefined,
  extraAllowedOrigins?: string[],
): boolean {
  // Non-browser clients (CLI, native apps) don't send Origin — always allow.
  if (origin === undefined) return true;

  // Same-origin requests from certain contexts send "null" as the Origin.
  if (origin === "null") return true;

  // Allow any loopback origin (localhost, 127.0.0.1, [::1]).
  for (const pattern of LOOPBACK_ORIGIN_PATTERNS) {
    if (pattern.test(origin)) return true;
  }

  // Allow explicitly configured extra origins (e.g. LAN IP, Tailscale hostname).
  if (extraAllowedOrigins) {
    const normalized = origin.toLowerCase();
    for (const allowed of extraAllowedOrigins) {
      if (normalized === allowed.toLowerCase()) return true;
    }
  }

  return false;
}
