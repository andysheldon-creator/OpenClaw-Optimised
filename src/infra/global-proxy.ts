/**
 * Global proxy support for Node.js fetch (undici).
 *
 * Node.js native fetch does not respect http_proxy/https_proxy/all_proxy
 * environment variables by default. This module sets up a global ProxyAgent
 * dispatcher so all fetch requests go through the proxy when configured.
 */

import { setGlobalDispatcher, ProxyAgent } from "undici";

let initialized = false;

/**
 * Initialize global proxy for fetch if proxy env vars are set.
 * Should be called early in the CLI entry point.
 */
export function initGlobalProxy(): void {
  if (initialized) return;
  initialized = true;

  const proxyUrl =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY ||
    process.env.all_proxy ||
    process.env.ALL_PROXY;

  if (!proxyUrl) return;

  try {
    // Normalize socks5h:// to socks5:// for undici compatibility
    const normalizedUrl = proxyUrl.replace(/^socks5h:\/\//, "socks5://");
    const agent = new ProxyAgent(normalizedUrl);
    setGlobalDispatcher(agent);
  } catch (err) {
    // Silently ignore proxy setup failures - fallback to direct connection
    // Log only in debug mode to avoid noise during normal operation
    if (process.env.DEBUG || process.env.CLAWDBOT_DEBUG) {
      console.warn("[global-proxy] Failed to initialize proxy:", err);
    }
  }
}
