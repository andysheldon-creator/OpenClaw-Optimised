/**
 * Reverse-proxy handler for Mission Control.
 *
 * Proxies HTTP requests at `/{basePath}/*` to a local Mission Control
 * Next.js server (default: http://127.0.0.1:3100). This keeps the Gateway
 * as the single entry-point URL so users only need one port.
 *
 * Architecture:
 *   Browser ──▶ Gateway :18789 ──▶ Mission Control :3100
 *                  ↓
 *             Control UI (static)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { MissionControlConfig } from "../config/config.js";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MC_URL = "http://127.0.0.1:3100";
const DEFAULT_BASE_PATH = "/mc";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MissionControlProxyOpts = {
  /** Upstream Mission Control URL (default: http://127.0.0.1:3100). */
  url: string;
  /** Gateway path prefix to match (default: /mc). Must start with /. */
  basePath: string;
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build the proxy options from the config, applying defaults.
 */
export function buildProxyOpts(
  cfg?: MissionControlConfig,
): MissionControlProxyOpts {
  const raw = cfg?.url?.trim() || DEFAULT_MC_URL;
  // Strip trailing slash from upstream URL
  const url = raw.endsWith("/") ? raw.slice(0, -1) : raw;

  let basePath = cfg?.basePath?.trim() || DEFAULT_BASE_PATH;
  if (!basePath.startsWith("/")) basePath = `/${basePath}`;
  if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);

  return { url, basePath };
}

// ── Hop-by-hop headers that must NOT be forwarded ─────────────────────────────

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

function filterHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    // Skip the host header — we'll set it to the upstream host.
    if (key.toLowerCase() === "host") continue;
    out[key] = Array.isArray(val) ? val.join(", ") : val;
  }
  return out;
}

// ── Proxy Handler ─────────────────────────────────────────────────────────────

/**
 * Returns an HTTP handler function following the Gateway's handler pattern:
 * returns `true` if the request was handled, `false` if it should pass through.
 */
export function createMissionControlProxy(
  opts: MissionControlProxyOpts,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const { url: upstream, basePath } = opts;
  const upstreamUrl = new URL(upstream);
  const isHttps = upstreamUrl.protocol === "https:";
  const requester = isHttps ? httpsRequest : httpRequest;
  const upstreamHost = upstreamUrl.host;
  const upstreamPort = upstreamUrl.port
    ? Number(upstreamUrl.port)
    : isHttps
      ? 443
      : 80;
  const upstreamHostname = upstreamUrl.hostname;

  return async (req, res) => {
    const urlRaw = req.url ?? "/";

    // Only handle requests under the base path
    if (urlRaw !== basePath && !urlRaw.startsWith(`${basePath}/`)) {
      return false;
    }

    // Strip the base path prefix to get the upstream path
    let upstreamPath =
      urlRaw === basePath ? "/" : urlRaw.slice(basePath.length);
    if (!upstreamPath.startsWith("/")) upstreamPath = `/${upstreamPath}`;

    const headers = filterHeaders(
      req.headers as Record<string, string | string[] | undefined>,
    );
    headers.host = upstreamHost;
    // Preserve X-Forwarded headers for the upstream app
    headers["x-forwarded-for"] = req.socket.remoteAddress ?? "127.0.0.1";
    headers["x-forwarded-proto"] = "http";
    headers["x-forwarded-host"] = req.headers.host ?? "localhost";

    return new Promise<boolean>((resolve) => {
      const proxyReq = requester(
        {
          hostname: upstreamHostname,
          port: upstreamPort,
          path: upstreamPath,
          method: req.method ?? "GET",
          headers,
        },
        (proxyRes) => {
          // Copy status + headers from upstream to the client
          const statusCode = proxyRes.statusCode ?? 502;
          const resHeaders = filterHeaders(
            proxyRes.headers as Record<string, string | string[] | undefined>,
          );
          res.writeHead(statusCode, resHeaders);
          proxyRes.pipe(res, { end: true });
          resolve(true);
        },
      );

      proxyReq.on("error", (err) => {
        // Upstream unreachable — return a 502 Bad Gateway
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(
            `Mission Control proxy error: ${String(err)}.\n\nIs Mission Control running at ${upstream}?`,
          );
        }
        resolve(true);
      });

      // Pipe the client request body to the upstream
      req.pipe(proxyReq, { end: true });
    });
  };
}
