import type { Client } from "@larksuiteoapi/node-sdk";
import { resolveFeishuApiBase, resolveFeishuDomain } from "./domain.js";
import { normalizeMentionAllForCard } from "./mention.js";

const STREAM_UPDATE_INTERVAL_MS = 500;

export type FeishuStreamingCredentials = {
  appId: string;
  appSecret: string;
  domain?: string;
};

export type FeishuStreamingCardState = {
  cardId: string;
  messageId: string;
  sequence: number;
  elementId: string;
  currentText: string;
};

// Token cache (keyed by domain + appId)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const getTokenCacheKey = (credentials: FeishuStreamingCredentials) =>
  `${resolveFeishuDomain(credentials.domain)}|${credentials.appId}`;

async function getTenantAccessToken(credentials: FeishuStreamingCredentials): Promise<string> {
  const cacheKey = getTokenCacheKey(credentials);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const apiBase = resolveFeishuApiBase(credentials.domain);
  const response = await fetch(`${apiBase}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: credentials.appId,
      app_secret: credentials.appSecret,
    }),
  });

  const result = (await response.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (result.code !== 0 || !result.tenant_access_token) {
    throw new Error(`Failed to get tenant access token: ${result.msg}`);
  }

  tokenCache.set(cacheKey, {
    token: result.tenant_access_token,
    expiresAt: Date.now() + (result.expire ?? 7200) * 1000,
  });

  return result.tenant_access_token;
}

async function createStreamingCard(
  credentials: FeishuStreamingCredentials,
): Promise<{ cardId: string }> {
  const cardJson = {
    schema: "2.0",
    config: {
      streaming_mode: true,
      summary: { content: "[Generating...]" },
      streaming_config: {
        print_frequency_ms: { default: 50 },
        print_step: { default: 2 },
        print_strategy: "fast",
      },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "⏳ Thinking...",
          element_id: "streaming_content",
        },
      ],
    },
  };

  const apiBase = resolveFeishuApiBase(credentials.domain);
  const response = await fetch(`${apiBase}/cardkit/v1/cards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getTenantAccessToken(credentials)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "card_json",
      data: JSON.stringify(cardJson),
    }),
  });

  const result = (await response.json()) as {
    code: number;
    msg: string;
    data?: { card_id: string };
  };

  if (result.code !== 0 || !result.data?.card_id) {
    throw new Error(`Failed to create streaming card: ${result.msg}`);
  }

  return { cardId: result.data.card_id };
}

export type SendStreamingCardOpts = {
  receiveIdType?: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  replyToId?: string | null;
  isGroup?: boolean;
  threadId?: string | null;
};

async function sendStreamingCard(
  client: Client,
  receiveId: string,
  cardId: string,
  opts: SendStreamingCardOpts = {},
): Promise<{ messageId: string }> {
  const receiveIdType = opts.receiveIdType ?? "chat_id";
  const content = JSON.stringify({
    type: "card",
    data: { card_id: cardId },
  });

  const shouldReply =
    opts.isGroup === true && typeof opts.replyToId === "string" && opts.replyToId.trim().length > 0;
  const replyMessageId = shouldReply ? opts.replyToId!.trim() : undefined;
  const replyInThread = Boolean(opts.threadId);

  let res;
  if (replyMessageId) {
    res = await client.im.message.reply({
      path: { message_id: replyMessageId },
      data: {
        content,
        msg_type: "interactive",
        reply_in_thread: replyInThread,
      },
    });
  } else {
    res = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: receiveId,
        msg_type: "interactive",
        content,
      },
    });
  }

  if (res.code !== 0 || !res.data?.message_id) {
    throw new Error(`Failed to send streaming card: ${res.msg}`);
  }

  return { messageId: res.data.message_id };
}

async function updateStreamingCardText(
  credentials: FeishuStreamingCredentials,
  cardId: string,
  elementId: string,
  text: string,
  sequence: number,
): Promise<void> {
  const normalizedText = normalizeMentionAllForCard(text);
  const apiBase = resolveFeishuApiBase(credentials.domain);
  const response = await fetch(
    `${apiBase}/cardkit/v1/cards/${cardId}/elements/${elementId}/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${await getTenantAccessToken(credentials)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: normalizedText,
        sequence,
        uuid: `stream_${cardId}_${sequence}`,
      }),
    },
  );

  const result = (await response.json()) as { code: number; msg: string };
  if (result.code !== 0) {
    // Don't throw — streaming updates can fail occasionally
  }
}

async function closeStreamingMode(
  credentials: FeishuStreamingCredentials,
  cardId: string,
  sequence: number,
  finalSummary?: string,
): Promise<void> {
  const normalizedSummary = normalizeMentionAllForCard(finalSummary || "");
  const configObj: Record<string, unknown> = {
    streaming_mode: false,
    summary: { content: normalizedSummary },
  };

  const settings = { config: configObj };
  const apiBase = resolveFeishuApiBase(credentials.domain);
  const response = await fetch(`${apiBase}/cardkit/v1/cards/${cardId}/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${await getTenantAccessToken(credentials)}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      settings: JSON.stringify(settings),
      sequence,
      uuid: `close_${cardId}_${sequence}`,
    }),
  });

  const result = (await response.json()) as { code: number; msg: string };
  if (result.code !== 0) {
    // Log but don't throw — card may already be closed
  }
}

export class FeishuStreamingSession {
  private client: Client;
  private credentials: FeishuStreamingCredentials;
  private state: FeishuStreamingCardState | null = null;
  private updateQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private lastUpdateAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingText: string | null = null;

  constructor(client: Client, credentials: FeishuStreamingCredentials) {
    this.client = client;
    this.credentials = credentials;
  }

  async start(
    receiveId: string,
    receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id" = "chat_id",
    opts?: { replyToId?: string | null; isGroup?: boolean; threadId?: string | null },
  ): Promise<void> {
    if (this.state) {
      return;
    }

    const { cardId } = await createStreamingCard(this.credentials);
    const { messageId } = await sendStreamingCard(this.client, receiveId, cardId, {
      receiveIdType,
      replyToId: opts?.replyToId,
      isGroup: opts?.isGroup,
      threadId: opts?.threadId,
    });

    this.state = {
      cardId,
      messageId,
      sequence: 1,
      elementId: "streaming_content",
      currentText: "",
    };
  }

  async update(text: string): Promise<void> {
    if (!this.state || this.closed) {
      return;
    }
    const mergedText = this.mergeText(text);
    if (!mergedText || mergedText === this.state.currentText) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastUpdateAt;
    if (elapsed >= STREAM_UPDATE_INTERVAL_MS) {
      this.clearPendingUpdate();
      this.lastUpdateAt = now;
      await this.queueUpdate(mergedText);
      return;
    }

    this.pendingText = mergedText;
    if (!this.pendingTimer) {
      const delay = Math.max(0, STREAM_UPDATE_INTERVAL_MS - elapsed);
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        const nextText = this.pendingText;
        this.pendingText = null;
        if (!nextText || this.closed) {
          return;
        }
        this.lastUpdateAt = Date.now();
        void this.queueUpdate(nextText);
      }, delay);
    }
  }

  private clearPendingUpdate(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private queueUpdate(text: string): Promise<void> {
    if (!this.state || this.closed) {
      return this.updateQueue;
    }

    this.updateQueue = this.updateQueue.then(async () => {
      if (!this.state || this.closed) {
        return;
      }

      this.state.currentText = text;
      this.state.sequence += 1;

      try {
        await updateStreamingCardText(
          this.credentials,
          this.state.cardId,
          this.state.elementId,
          text,
          this.state.sequence,
        );
      } catch {
        // Streaming update failures are non-fatal; next update will retry
      }
    });
    return this.updateQueue;
  }

  private mergeText(next: string): string {
    if (!this.state) {
      return next;
    }
    const prev = this.state.currentText;
    if (!prev) {
      return next;
    }
    if (next.startsWith(prev)) {
      return next;
    }
    return prev + next;
  }

  async close(finalText?: string, summary?: string): Promise<void> {
    if (!this.state || this.closed) {
      return;
    }
    this.closed = true;

    const pendingText = this.pendingText;
    this.pendingText = null;
    this.clearPendingUpdate();

    await this.updateQueue;

    const mergedFinal = typeof finalText === "string" ? this.mergeText(finalText) : undefined;
    const text = mergedFinal ?? pendingText ?? this.state.currentText;

    this.state.currentText = text ?? "";
    this.state.sequence += 1;

    try {
      if (text) {
        await updateStreamingCardText(
          this.credentials,
          this.state.cardId,
          this.state.elementId,
          text,
          this.state.sequence,
        );
      }

      this.state.sequence += 1;
      await closeStreamingMode(
        this.credentials,
        this.state.cardId,
        this.state.sequence,
        summary ?? truncateForSummary(text),
      );
    } catch {
      // Close failures are non-fatal
    }
  }

  isActive(): boolean {
    return this.state !== null && !this.closed;
  }

  getMessageId(): string | null {
    return this.state?.messageId ?? null;
  }

  getCurrentText(): string {
    return this.state?.currentText ?? "";
  }
}

function truncateForSummary(text: string, maxLength: number = 50): string {
  if (!text) {
    return "";
  }
  const cleaned = text.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength - 3) + "...";
}
