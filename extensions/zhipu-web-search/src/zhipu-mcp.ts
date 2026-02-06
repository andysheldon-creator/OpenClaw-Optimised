/**
 * Zhipu Web Search — MCP (Streamable HTTP) backend.
 *
 * Implements a lightweight MCP client that talks to the Zhipu Coding Plan
 * web-search-prime MCP server. Uses the Coding Plan subscription quota
 * instead of per-call API billing.
 *
 * MCP flow:
 *   1. POST initialize → get Mcp-Session-Id
 *   2. POST notifications/initialized → 202
 *   3. POST tools/call (webSearchPrime) → search results
 *   4. On 404 → session expired → re-initialize
 */

import type { PluginLogger } from "./types.js";
import { wrapExternal } from "./types.js";

const MCP_ENDPOINT = "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp";
const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Per-API-key session cache. Maps key hash → session id. */
const sessionCache = new Map<string, string>();
/** Per-API-key in-flight init promise to prevent concurrent init races. */
const initInFlight = new Map<string, Promise<string | null>>();

/** Simple hash to avoid storing raw API keys as map keys. */
function hashKey(apiKey: string): string {
  let h = 0;
  for (let i = 0; i < apiKey.length; i++) {
    h = ((h << 5) - h + apiKey.charCodeAt(i)) | 0;
  }
  return `k${h}`;
}

interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpSearchResult {
  title?: string;
  url?: string;
  link?: string;
  content?: string;
  media?: string;
  icon?: string;
  refer?: string;
  publish_date?: string;
}

/**
 * Send a JSON-RPC request to the MCP endpoint.
 * Handles both JSON and SSE response formats.
 */
async function mcpPost(
  body: McpJsonRpcRequest | McpJsonRpcRequest[],
  apiKey: string,
  sessionId?: string,
): Promise<{ status: number; sessionId?: string; response?: McpJsonRpcResponse }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const newSessionId = res.headers.get("Mcp-Session-Id") ?? sessionId;

    // 202 Accepted or 200 with empty body (notification acknowledged)
    if (res.status === 202) {
      return { status: 202, sessionId: newSessionId };
    }

    // Detect empty body — some proxies omit Content-Length for empty responses
    const contentLength = res.headers.get("content-length");
    if (res.ok && (contentLength === "0" || contentLength === null)) {
      // Read body to check if truly empty
      const bodyText = await res.text();
      if (!bodyText.trim()) {
        return { status: res.status, sessionId: newSessionId };
      }
      // Non-empty body despite content-length quirks — try to parse it
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        const response = parseSseForJsonRpc(bodyText);
        return { status: res.status, sessionId: newSessionId, response };
      }
      try {
        const data = JSON.parse(bodyText) as McpJsonRpcResponse;
        return { status: res.status, sessionId: newSessionId, response: data };
      } catch {
        return { status: res.status, sessionId: newSessionId };
      }
    }

    // 404 = session expired
    if (res.status === 404) {
      return { status: 404 };
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: res.status,
        response: {
          jsonrpc: "2.0",
          error: { code: res.status, message: detail || res.statusText },
        },
      };
    }

    const contentType = res.headers.get("content-type") ?? "";

    // JSON response
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as McpJsonRpcResponse;
      return { status: res.status, sessionId: newSessionId, response: data };
    }

    // SSE response — extract JSON-RPC messages from event stream
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      const response = parseSseForJsonRpc(text);
      return { status: res.status, sessionId: newSessionId, response };
    }

    // Fallback: try JSON
    const data = (await res.json()) as McpJsonRpcResponse;
    return { status: res.status, sessionId: newSessionId, response: data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse SSE text to extract JSON-RPC response messages.
 * Implements proper SSE event parsing per the spec:
 * - Events are separated by blank lines
 * - Multiple `data:` lines within an event are joined with newlines
 * - `data:` with or without a trailing space are both valid
 */
function parseSseForJsonRpc(sseText: string): McpJsonRpcResponse | undefined {
  const lines = sseText.split("\n");
  let lastResponse: McpJsonRpcResponse | undefined;
  let currentDataLines: string[] = [];

  const flushEvent = () => {
    if (currentDataLines.length === 0) return;
    const payload = currentDataLines.join("\n").trim();
    currentDataLines = [];
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as McpJsonRpcResponse;
      if (parsed.jsonrpc === "2.0" && (parsed.result !== undefined || parsed.error !== undefined)) {
        lastResponse = parsed;
      }
    } catch {
      // Not valid JSON — skip
    }
  };

  for (const line of lines) {
    if (line === "" || line === "\r") {
      // Blank line = end of event
      flushEvent();
    } else if (line.startsWith("data:")) {
      // "data: value" or "data:value" — both valid per SSE spec
      const value = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
      currentDataLines.push(value);
    }
    // Ignore other SSE fields (id:, event:, retry:, comments)
  }

  // Flush any trailing event without a final blank line
  flushEvent();

  return lastResponse;
}

/**
 * Perform MCP initialize handshake.
 */
async function mcpInitialize(apiKey: string, logger?: PluginLogger): Promise<string | null> {
  const initReq: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "openclaw-zhipu-web-search",
        version: "1.0.0",
      },
    },
  };

  const initResult = await mcpPost(initReq, apiKey);
  if (!initResult.sessionId) {
    logger?.error(
      `MCP initialize failed: no Mcp-Session-Id returned (status ${initResult.status})`,
    );
    return null;
  }

  const sessionId = initResult.sessionId;

  // Send initialized notification — expect 202 Accepted
  const notifyReq: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  };
  const notifyResult = await mcpPost(notifyReq, apiKey, sessionId);
  if (notifyResult.status !== 202 && notifyResult.status !== 200) {
    logger?.warn(
      `MCP initialized notification unexpected status: ${notifyResult.status} (continuing anyway)`,
    );
  }

  logger?.info(`MCP session initialized: ${sessionId?.slice(0, 8)}...`);
  return sessionId ?? null;
}

/**
 * Ensure we have a valid MCP session. Re-initialize if needed.
 * Uses per-key caching and in-flight deduplication to prevent races.
 */
async function ensureSession(apiKey: string, logger?: PluginLogger): Promise<string | null> {
  const key = hashKey(apiKey);

  // Return cached session if available
  const cached = sessionCache.get(key);
  if (cached) {
    return cached;
  }

  // Deduplicate concurrent init calls for the same key
  const existing = initInFlight.get(key);
  if (existing) {
    return existing;
  }

  const initPromise = mcpInitialize(apiKey, logger).then((sessionId) => {
    if (sessionId) {
      sessionCache.set(key, sessionId);
    }
    initInFlight.delete(key);
    return sessionId;
  }).catch((err) => {
    initInFlight.delete(key);
    throw err;
  });

  initInFlight.set(key, initPromise);
  return initPromise;
}

/**
 * Invalidate cached session for a given API key.
 */
function invalidateSession(apiKey: string): void {
  sessionCache.delete(hashKey(apiKey));
}

/**
 * Call webSearchPrime via MCP tools/call.
 * Auto-retries once on session expiry (404).
 */
export async function mcpSearch(params: {
  apiKey: string;
  query: string;
  searchDomainFilter?: string;
  searchRecencyFilter?: string;
  contentSize?: string;
  logger?: PluginLogger;
}): Promise<{ results: McpSearchResult[]; tookMs: number } | { error: string; message: string }> {
  const { apiKey, query, searchDomainFilter, searchRecencyFilter, contentSize, logger } = params;
  const start = Date.now();

  let sessionId = await ensureSession(apiKey, logger);
  if (!sessionId) {
    return { error: "mcp_init_failed", message: "Failed to initialize MCP session with Zhipu." };
  }

  const mcpArgs: Record<string, unknown> = { search_query: query };
  if (searchDomainFilter) mcpArgs.search_domain_filter = searchDomainFilter;
  if (searchRecencyFilter) mcpArgs.search_recency_filter = searchRecencyFilter;
  if (contentSize) mcpArgs.content_size = contentSize;

  const callReq: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "webSearchPrime",
      arguments: mcpArgs,
    },
  };

  let result = await mcpPost(callReq, apiKey, sessionId);

  // Session expired → re-initialize and retry once
  if (result.status === 404) {
    logger?.info("MCP session expired, re-initializing...");
    invalidateSession(apiKey);
    sessionId = await ensureSession(apiKey, logger);
    if (!sessionId) {
      return { error: "mcp_reinit_failed", message: "Failed to re-initialize MCP session." };
    }
    result = await mcpPost(callReq, apiKey, sessionId);
  }

  if (result.response?.error) {
    return {
      error: "mcp_call_error",
      message: result.response.error.message || "MCP tools/call failed",
    };
  }

  // Parse result — MCP tools/call returns content array
  const content = result.response?.result as
    | { content?: Array<{ type: string; text?: string }> }
    | undefined;

  const textContent = content?.content?.find((c) => c.type === "text")?.text;
  if (!textContent) {
    return { error: "mcp_empty_result", message: "MCP returned empty search results." };
  }

  // The MCP server may return structured JSON or plain text.
  // Zhipu sometimes double-encodes: the text field contains a JSON string
  // that itself is a stringified JSON array — need to unwrap.
  try {
    let parsed = JSON.parse(textContent);
    // Handle double-encoded JSON (string → parse again)
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Not double-encoded, treat as plain text
        return {
          results: [{ title: "Search Result", content: parsed }],
          tookMs: Date.now() - start,
        };
      }
    }
    const results: McpSearchResult[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.search_result)
        ? parsed.search_result
        : Array.isArray(parsed?.results)
          ? parsed.results
          : [];
    return { results, tookMs: Date.now() - start };
  } catch {
    // Plain text response — wrap as single result
    return {
      results: [{ title: "Search Result", content: textContent }],
      tookMs: Date.now() - start,
    };
  }
}

/**
 * Format MCP search results into the same shape as the HTTP API backend.
 */
export function formatMcpResults(
  query: string,
  raw: { results: McpSearchResult[]; tookMs: number },
): Record<string, unknown> {
  const mapped = raw.results.map((entry) => ({
    title: entry.title ? wrapExternal(entry.title) : "",
    url: entry.link || entry.url || "",
    description: entry.content ? wrapExternal(entry.content) : "",
    published: entry.publish_date ? wrapExternal(entry.publish_date) : undefined,
    media: entry.media || undefined,
    source: entry.refer ? wrapExternal(entry.refer) : undefined,
  }));

  return {
    query,
    provider: "zhipu",
    mode: "mcp",
    count: mapped.length,
    tookMs: raw.tookMs,
    results: mapped,
  };
}
