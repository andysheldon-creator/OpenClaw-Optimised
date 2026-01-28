import http from "node:http";
import https from "node:https";

import { logSecurityEvent } from "./hardening-logger.js";

/**
 * Default domain whitelist for single-user secure mode.
 * Only these domains (and their subdomains) are allowed for outbound requests.
 */
const DEFAULT_ALLOWED_DOMAINS: string[] = [
  // Claude / Anthropic API
  "api.anthropic.com",
  // WhatsApp Web protocol (Baileys)
  "web.whatsapp.com",
  "w1.web.whatsapp.com",
  "w2.web.whatsapp.com",
  "w3.web.whatsapp.com",
  "w4.web.whatsapp.com",
  "w5.web.whatsapp.com",
  "w6.web.whatsapp.com",
  "w7.web.whatsapp.com",
  "w8.web.whatsapp.com",
  "w9.web.whatsapp.com",
  // WhatsApp media servers
  "mmg.whatsapp.net",
  "media.whatsapp.com",
  "media-ams2-1.cdn.whatsapp.net",
  // WhatsApp general
  "g.whatsapp.net",
  "v.whatsapp.net",
  "pps.whatsapp.net",
  // Localhost / loopback (gateway internal)
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
];

/** Suffix patterns that match any subdomain (e.g. ".whatsapp.net" matches "mmg.whatsapp.net") */
const DEFAULT_ALLOWED_SUFFIXES: string[] = [".whatsapp.net", ".whatsapp.com", ".cdn.whatsapp.net"];

export type NetworkMonitorOptions = {
  /** Extra domains to allow beyond the defaults. */
  extraAllowedDomains?: string[];
  /** Extra domain suffixes to allow (e.g. ".openai.com"). */
  extraAllowedSuffixes?: string[];
  /** Replace the default whitelist entirely. */
  allowedDomains?: string[];
  /** Replace the default suffix whitelist entirely. */
  allowedSuffixes?: string[];
  /** If true, log allowed requests too (verbose). Default: false. */
  logAllowed?: boolean;
  /** If true, block disallowed requests. If false, only log (monitor mode). Default: true. */
  enforce?: boolean;
};

let allowedDomainSet: Set<string> | null = null;
let allowedSuffixList: string[] | null = null;
let logAllowedRequests = false;
let enforceMode = true;
let originalFetch: typeof globalThis.fetch | null = null;
let originalHttpRequest: typeof http.request | null = null;
let originalHttpsRequest: typeof https.request | null = null;
let installed = false;

/**
 * Check if a hostname is allowed by the whitelist.
 */
export function isDomainAllowed(hostname: string): boolean {
  if (!allowedDomainSet || !allowedSuffixList) return true; // not initialized = passthrough
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return false;
  if (allowedDomainSet.has(normalized)) return true;
  for (const suffix of allowedSuffixList) {
    if (normalized.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Extract hostname from a URL string or Request object.
 */
function extractHostname(input: string | URL | Request): string | null {
  try {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(urlStr);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Install the network monitor by wrapping global.fetch and http(s).request.
 */
export function installNetworkMonitor(opts?: NetworkMonitorOptions): void {
  if (installed) return;

  const domains = opts?.allowedDomains ?? [
    ...DEFAULT_ALLOWED_DOMAINS,
    ...(opts?.extraAllowedDomains ?? []),
  ];
  const suffixes = opts?.allowedSuffixes ?? [
    ...DEFAULT_ALLOWED_SUFFIXES,
    ...(opts?.extraAllowedSuffixes ?? []),
  ];

  allowedDomainSet = new Set(domains.map((d) => d.trim().toLowerCase()));
  allowedSuffixList = suffixes.map((s) => s.trim().toLowerCase());
  logAllowedRequests = opts?.logAllowed ?? false;
  enforceMode = opts?.enforce !== false;

  // Wrap global.fetch
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const hostname = extractHostname(input as string | URL | Request);
    if (hostname && !isDomainAllowed(hostname)) {
      logSecurityEvent("blocked_network", {
        method: "fetch",
        hostname,
        url: String(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        ).slice(0, 200),
      });
      if (enforceMode) {
        throw new Error(`[network-monitor] Blocked outbound request to ${hostname}`);
      }
    } else if (hostname && logAllowedRequests) {
      logSecurityEvent("allowed_network", {
        method: "fetch",
        hostname,
      });
    }
    return originalFetch!(input, init);
  }) as typeof globalThis.fetch;

  // Wrap http.request
  originalHttpRequest = http.request;
  (http as { request: typeof http.request }).request = ((...args: unknown[]) => {
    const hostname = extractHostnameFromHttpArgs(args);
    if (hostname && !isDomainAllowed(hostname)) {
      logSecurityEvent("blocked_network", { method: "http.request", hostname });
      if (enforceMode) {
        throw new Error(`[network-monitor] Blocked outbound HTTP request to ${hostname}`);
      }
    } else if (hostname && logAllowedRequests) {
      logSecurityEvent("allowed_network", { method: "http.request", hostname });
    }
    return (originalHttpRequest as Function).apply(http, args);
  }) as typeof http.request;

  // Wrap https.request
  originalHttpsRequest = https.request;
  (https as { request: typeof https.request }).request = ((...args: unknown[]) => {
    const hostname = extractHostnameFromHttpArgs(args);
    if (hostname && !isDomainAllowed(hostname)) {
      logSecurityEvent("blocked_network", { method: "https.request", hostname });
      if (enforceMode) {
        throw new Error(`[network-monitor] Blocked outbound HTTPS request to ${hostname}`);
      }
    } else if (hostname && logAllowedRequests) {
      logSecurityEvent("allowed_network", { method: "https.request", hostname });
    }
    return (originalHttpsRequest as Function).apply(https, args);
  }) as typeof https.request;

  installed = true;

  logSecurityEvent("hardening_init", {
    module: "network-monitor",
    allowedDomainCount: allowedDomainSet.size,
    allowedSuffixCount: allowedSuffixList.length,
    enforce: enforceMode,
  });
}

/**
 * Extract hostname from http.request / https.request arguments.
 * Signature: (url, options, callback) | (options, callback) | (url, callback)
 */
function extractHostnameFromHttpArgs(args: unknown[]): string | null {
  const first = args[0];
  if (typeof first === "string") {
    try {
      return new URL(first).hostname;
    } catch {
      return null;
    }
  }
  if (first instanceof URL) {
    return first.hostname;
  }
  if (first && typeof first === "object") {
    const opts = first as Record<string, unknown>;
    if (typeof opts.hostname === "string") return opts.hostname;
    if (typeof opts.host === "string") {
      // host may include port
      return opts.host.replace(/:\d+$/, "");
    }
  }
  return null;
}

/**
 * Uninstall the network monitor, restoring original functions.
 */
export function uninstallNetworkMonitor(): void {
  if (!installed) return;
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  if (originalHttpRequest) {
    (http as { request: typeof http.request }).request = originalHttpRequest;
    originalHttpRequest = null;
  }
  if (originalHttpsRequest) {
    (https as { request: typeof https.request }).request = originalHttpsRequest;
    originalHttpsRequest = null;
  }
  allowedDomainSet = null;
  allowedSuffixList = null;
  installed = false;
}

/**
 * Check if the network monitor is currently active.
 */
export function isNetworkMonitorActive(): boolean {
  return installed;
}

/** Reset internal state (test-only). */
export function __resetNetworkMonitorForTest(): void {
  uninstallNetworkMonitor();
}
