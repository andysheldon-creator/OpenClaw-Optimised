export type ZulipClient = {
  /**
   * Preferred API base URLs. When multiple are provided, requests will fail over
   * automatically on network errors / 5xx / HTML error pages.
   */
  baseUrls?: string[];
  /** @deprecated Back-compat for older code/tests. Prefer baseUrls. */
  baseUrl?: string;
  email: string;
  apiKey: string;
};

export type ZulipRegisterResponse = {
  queue_id: string;
  last_event_id: number;
};

export type ZulipEventsResponse = {
  events?: Array<{ id: number; type: string; message?: ZulipMessage }>;
  result: string;
  msg?: string;
};

export class ZulipApiError extends Error {
  status?: number;
  retryAfterMs?: number;
  code?: string;

  constructor(message: string, opts: { status?: number; retryAfterMs?: number; code?: string } = {}) {
    super(message);
    this.name = "ZulipApiError";
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.code = opts.code;
  }
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.floor(seconds * 1000));
  }

  const when = Date.parse(trimmed);
  if (!Number.isFinite(when)) {
    return undefined;
  }
  return Math.max(0, when - Date.now());
}

export type ZulipUser = {
  user_id: number;
  email?: string;
  delivery_email?: string;
  full_name?: string;
  is_active?: boolean;
  is_bot?: boolean;
};

export type ZulipMessage = {
  id: number;
  type: "private" | "stream";
  content: string;
  content_type?: string;
  sender_email: string;
  sender_full_name?: string;
  sender_id?: number;
  timestamp: number;
  // stream
  stream_id?: number;
  display_recipient?: string;
  subject?: string;
  topic?: string;
  // private
  recipients?: Array<{ email: string; full_name?: string; id?: number }>;
  flags?: string[];
};

export function normalizeZulipBaseUrl(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function resolveClientBaseUrls(client: ZulipClient): string[] {
  const fromList = (client.baseUrls ?? [])
    .map((v) => normalizeZulipBaseUrl(v))
    .filter((v): v is string => Boolean(v));
  const fromSingle = normalizeZulipBaseUrl(client.baseUrl);
  const all = [...fromList, ...(fromSingle ? [fromSingle] : [])];
  return Array.from(new Set(all));
}

const LAST_GOOD_TTL_MS = 10 * 60 * 1000;

type LastGoodEntry = { url: string; expiresAt: number };
const lastGoodByClientKey = new Map<string, LastGoodEntry>();

function clientKey(client: ZulipClient): string {
  const baseUrls = resolveClientBaseUrls(client);
  return `${client.email}::${baseUrls.join("|")}`;
}

function getPreferredBaseUrls(client: ZulipClient): string[] {
  const baseUrls = resolveClientBaseUrls(client);
  if (baseUrls.length === 0) {
    return [];
  }

  const key = clientKey(client);
  const entry = lastGoodByClientKey.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) {
      lastGoodByClientKey.delete(key);
    }
    return baseUrls;
  }

  if (!baseUrls.includes(entry.url)) {
    return baseUrls;
  }

  return [entry.url, ...baseUrls.filter((u) => u !== entry.url)];
}

function rememberLastGood(client: ZulipClient, url: string): void {
  const key = clientKey(client);
  lastGoodByClientKey.set(key, { url, expiresAt: Date.now() + LAST_GOOD_TTL_MS });
}

function withAuth(client: ZulipClient, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const token = Buffer.from(`${client.email}:${client.apiKey}`).toString("base64");
  headers.set("Authorization", `Basic ${token}`);

  // Optional Cloudflare Access Service Token support.
  // If your Zulip is protected by Cloudflare Access, create a Service Token and
  // export these in the gateway environment (e.g. ~/.openclaw/.env):
  // - ZULIP_CF_ACCESS_CLIENT_ID
  // - ZULIP_CF_ACCESS_CLIENT_SECRET
  const cfId = process.env.ZULIP_CF_ACCESS_CLIENT_ID?.trim();
  const cfSecret = process.env.ZULIP_CF_ACCESS_CLIENT_SECRET?.trim();
  if (cfId && cfSecret) {
    headers.set("CF-Access-Client-Id", cfId);
    headers.set("CF-Access-Client-Secret", cfSecret);
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }
  return { ...init, headers };
}

function looksLikeHtml(text: string): boolean {
  return (
    /^\s*<!doctype html/i.test(text) ||
    /^\s*<html/i.test(text) ||
    /^\s*<head/i.test(text) ||
    /^\s*<meta\b/i.test(text)
  );
}

function shouldFailoverResponse(res: Response, bodyText: string): boolean {
  if (res.status >= 500) {
    return true;
  }
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const htmlish = looksLikeHtml(bodyText) || contentType.includes("text/html");
  if (!htmlish) {
    return false;
  }
  // HTML for /api is almost always a proxy/auth error. Even if it came back with 200,
  // it is not a valid Zulip API response.
  return true;
}

/**
 * Parse a Zulip API response, throwing a friendly error on auth/proxy HTML pages
 * or on Zulip-style {result:"error"} payloads.
 */
export async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const html = looksLikeHtml(text);

  let payload: Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    const snippet = text.trim().slice(0, 240).replace(/\s+/g, " ");

    if (html) {
      const likelyCause =
        res.status >= 500
          ? "This looks like an upstream/proxy error page (e.g. 502/503 from a reverse proxy, CDN, or load balancer), not a Zulip JSON API response. "
          : "This typically means an auth/SSO/proxy layer is intercepting API requests. ";

      throw new Error(
        "Zulip API error: received HTML instead of JSON from /api. " +
          `HTTP ${res.status} (content-type: ${contentType || "unknown"}). ` +
          likelyCause +
          "If Zulip works in one environment but not another, compare DNS (IPv6 vs IPv4), egress network/proxy, and reverse-proxy timeouts for long-polling (/api/v1/events). " +
          "If applicable, allow bot access to /api/v1/* (service token / bypass policy) or use an internal API base URL. " +
          (snippet ? `Snippet: ${snippet}` : ""),
      );
    }

    throw new Error(
      "Zulip API error: received non-JSON response from /api. " +
        `HTTP ${res.status} (content-type: ${contentType || "unknown"}). ` +
        "This can be caused by a proxy/load balancer error (502/503), a misconfigured base URL, or an auth layer. " +
        (snippet ? `Snippet: ${snippet}` : ""),
    );
  }

  const msgField =
    typeof payload?.msg === "string"
      ? payload.msg
      : typeof payload?.message === "string"
        ? payload.message
        : null;

  const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
  const codeField = typeof payload?.code === "string" ? payload.code : undefined;

  if (!res.ok) {
    const msg = msgField ?? `${res.status} ${res.statusText}`;
    throw new ZulipApiError(`Zulip API error: ${msg}`, {
      status: res.status,
      retryAfterMs,
      code: codeField,
    });
  }

  if (payload?.result && payload.result !== "success") {
    const resultField = typeof payload.result === "string" ? payload.result : "unknown";
    throw new ZulipApiError(`Zulip API error: ${msgField ?? resultField}`, {
      status: res.status,
      retryAfterMs,
      code: codeField,
    });
  }

  return payload;
}

async function fetchJsonWithFailover(
  client: ZulipClient,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const baseUrls = getPreferredBaseUrls(client);
  if (baseUrls.length === 0) {
    throw new Error("Zulip client misconfigured: missing baseUrl/baseUrls.");
  }

  const errors: string[] = [];

  for (const baseUrl of baseUrls) {
    const url = new URL(path, baseUrl);

    try {
      const res = await fetch(url, withAuth(client, init));

      // Decide failover based on status/HTML without consuming the main body stream.
      // (clone() is safe for small API responses).
      const bodyPreview = await res.clone().text().catch(() => "");
      if (shouldFailoverResponse(res, bodyPreview)) {
        errors.push(`${baseUrl} -> HTTP ${res.status} (HTML/proxy response)`);
        continue;
      }

      const payload = await parseJsonOrThrow(res);
      rememberLastGood(client, baseUrl);
      return payload;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetwork =
        /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket/i.test(msg);
      const isHtml = /received HTML instead of JSON/i.test(msg);
      const isApiError = err instanceof ZulipApiError;
      const status = isApiError ? err.status : undefined;
      const is5xx = status != null ? status >= 500 : /\b5\d\d\b/.test(msg);

      // Keep 429/4xx semantics (Retry-After, auth errors) for caller backoff/handling.
      if (isApiError && status != null && status < 500) {
        throw err;
      }

      // Fail over only for network/5xx-ish/proxy HTML failures.
      if (isNetwork || isHtml || is5xx) {
        errors.push(`${baseUrl} -> ${msg}`);
        continue;
      }

      // For auth errors / BAD_EVENT_QUEUE_ID / etc, do not try other base URLs.
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Zulip API error: all base URLs failed for ${path}. Attempts: ${errors.join("; ")}`,
  );
}

export async function zulipRegister(
  client: ZulipClient,
  params: {
    eventTypes?: string[];
    allPublicStreams?: boolean;
  } = {},
): Promise<ZulipRegisterResponse> {
  const body = new URLSearchParams();
  body.set("event_types", JSON.stringify(params.eventTypes ?? ["message"]));
  body.set("apply_markdown", "false");
  body.set("client_gravatar", "false");
  if (typeof params.allPublicStreams === "boolean") {
    body.set("all_public_streams", params.allPublicStreams ? "true" : "false");
  }

  const payload = (await fetchJsonWithFailover(client, "/api/v1/register", {
    method: "POST",
    body,
  })) as ZulipRegisterResponse;
  return payload;
}

export async function zulipGetEvents(
  client: ZulipClient,
  params: {
    queueId: string;
    lastEventId: number;
    timeoutSeconds?: number;
  },
): Promise<ZulipEventsResponse> {
  const url = new URL("/api/v1/events", "https://example.invalid");
  url.searchParams.set("queue_id", params.queueId);
  url.searchParams.set("last_event_id", String(params.lastEventId));
  if (typeof params.timeoutSeconds === "number") {
    url.searchParams.set("dont_block", "false");
    url.searchParams.set("timeout", String(Math.max(1, Math.floor(params.timeoutSeconds))));
  }

  return (await fetchJsonWithFailover(client, url.pathname + url.search, {
    method: "GET",
  })) as ZulipEventsResponse;
}

export async function zulipGetMe(client: ZulipClient, init?: RequestInit): Promise<unknown> {
  return await fetchJsonWithFailover(client, "/api/v1/users/me", { method: "GET", ...init });
}

export async function zulipGetUsers(client: ZulipClient): Promise<ZulipUser[]> {
  const payload = await fetchJsonWithFailover(client, "/api/v1/users", { method: "GET" });
  return Array.isArray(payload?.members) ? (payload.members as ZulipUser[]) : [];
}

export async function zulipSetTypingStatus(
  client: ZulipClient,
  params: { op: "start" | "stop"; to: number[]; type?: "direct" },
): Promise<void> {
  const body = new URLSearchParams();
  body.set("type", params.type ?? "direct");
  body.set("op", params.op);
  body.set("to", JSON.stringify(params.to));
  await fetchJsonWithFailover(client, "/api/v1/typing", { method: "POST", body });
}

export async function zulipAddReaction(
  client: ZulipClient,
  params: { messageId: number; emojiName: string },
): Promise<void> {
  const body = new URLSearchParams();
  body.set("emoji_name", params.emojiName);
  await fetchJsonWithFailover(
    client,
    `/api/v1/messages/${params.messageId}/reactions`,
    { method: "POST", body },
  );
}

export async function zulipSendMessage(
  client: ZulipClient,
  params:
    | { type: "stream"; stream: string; topic: string; content: string }
    | { type: "private"; to: Array<string | number>; content: string },
): Promise<{ id: number } | null> {
  const body = new URLSearchParams();
  body.set("type", params.type);
  if (params.type === "stream") {
    body.set("to", params.stream);
    body.set("topic", params.topic);
  } else {
    body.set("to", JSON.stringify(params.to));
  }
  body.set("content", params.content);

  const payload = await fetchJsonWithFailover(client, "/api/v1/messages", {
    method: "POST",
    body,
  });
  if (typeof payload?.id === "number") {
    return { id: payload.id };
  }
  return null;
}
