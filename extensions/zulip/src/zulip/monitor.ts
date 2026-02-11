import type {
  ChannelAccountSnapshot,
  OpenClawConfig,
  ReplyPayload,
  RuntimeEnv,
} from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import {
  DEFAULT_GROUP_HISTORY_LIMIT,
  createReplyPrefixContext,
  recordPendingHistoryEntryIfEnabled,
  clearHistoryEntriesIfEnabled,
  buildPendingHistoryContextFromMap,
  logInboundDrop,
  resolveControlCommandGate,
  type HistoryEntry,
} from "openclaw/plugin-sdk";
import { getZulipRuntime } from "../runtime.js";
import { resolveZulipAccount, type ResolvedZulipAccount } from "./accounts.js";
import {
  ZulipApiError,
  zulipGetEvents,
  zulipRegister,
  zulipSetTypingStatus,
  type ZulipClient,
  type ZulipMessage,
} from "./client.js";
import { reactEyes } from "./reactions.js";
import { sendMessageZulip } from "./send.js";
import { extractZulipTopicDirective } from "./directives.js";
import { extractZulipUploadUrls } from "./uploads.js";

export type MonitorZulipOpts = {
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

function resolveRuntime(opts: MonitorZulipOpts): RuntimeEnv {
  return (
    opts.runtime ?? {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    }
  );
}

function normalizeAllowEntry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "*";
  }
  return trimmed.toLowerCase();
}

function normalizeAllowList(entries: Array<string | number>): string[] {
  const normalized = entries.map((e) => normalizeAllowEntry(String(e))).filter(Boolean);
  return Array.from(new Set(normalized));
}

function isSenderAllowed(senderEmail: string, allowFrom: string[]): boolean {
  if (allowFrom.length === 0) {
    return false;
  }
  if (allowFrom.includes("*")) {
    return true;
  }
  const normalized = normalizeAllowEntry(senderEmail);
  return allowFrom.some((entry) => entry === normalized);
}

function isMentioned(message: ZulipMessage): boolean {
  const flags = message.flags ?? [];
  return flags.includes("mentioned") || flags.includes("wildcard_mentioned");
}

function buildPrivateReplyTarget(message: ZulipMessage): string {
  // Reply privately to the sender.
  return `pm:${message.sender_email}`;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function hashZulipTopicKey(topic: string): string {
  // Keep session keys stable, safe, and short.
  // Use a hash instead of raw topic (topics can be long and contain slashes/newlines).
  const digest = crypto.createHash("sha256").update(topic, "utf8").digest();
  return base64UrlEncode(digest).slice(0, 16);
}

function resolveStreamName(message: ZulipMessage): string {
  return message.display_recipient?.trim() || String(message.stream_id ?? "").trim() || "stream";
}

function resolveTopicName(message: ZulipMessage): string {
  return (message.topic ?? message.subject ?? "")?.trim() || "general";
}

function buildStreamReplyTarget(message: ZulipMessage, overrideTopic?: string): string {
  const stream = resolveStreamName(message);
  const topic = (overrideTopic?.trim() || resolveTopicName(message))?.trim() || "general";
  return `stream:${stream}/${topic}`;
}

function buildHistoryKeyForThread(message: ZulipMessage): string {
  const streamId = String(message.stream_id ?? resolveStreamName(message) ?? "stream");
  const topic = resolveTopicName(message);
  const topicKey = hashZulipTopicKey(topic);
  return `zulip:${streamId}:${topicKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function resolveMonitorBackoffMs(params: {
  error: unknown;
  consecutiveFailures: number;
}): number {
  const { error, consecutiveFailures } = params;
  const fallback = Math.min(30000, 2000 + Math.max(0, consecutiveFailures - 1) * 2000);

  if (error instanceof ZulipApiError) {
    if (typeof error.retryAfterMs === "number") {
      return Math.min(60000, Math.max(500, error.retryAfterMs));
    }
    if (error.status === 429) {
      return Math.min(60000, Math.max(3000, fallback * 2));
    }
  }

  return fallback;
}

function resolveClient(account: ResolvedZulipAccount): ZulipClient {
  const baseUrls = account.baseUrls;
  const email = account.email?.trim();
  const apiKey = account.apiKey?.trim();
  if (!baseUrls?.length || !email || !apiKey) {
    throw new Error(`Zulip not configured for account "${account.accountId}".`);
  }
  // Keep baseUrl for back-compat (tests/logging) but use baseUrls for failover.
  return { baseUrls, baseUrl: baseUrls[0], email, apiKey };
}

function createZulipAuthFetch(client: ZulipClient) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const token = Buffer.from(`${client.email}:${client.apiKey}`).toString("base64");
    headers.set("Authorization", `Basic ${token}`);

    const cfId = process.env.ZULIP_CF_ACCESS_CLIENT_ID?.trim();
    const cfSecret = process.env.ZULIP_CF_ACCESS_CLIENT_SECRET?.trim();
    if (cfId && cfSecret) {
      headers.set("CF-Access-Client-Id", cfId);
      headers.set("CF-Access-Client-Secret", cfSecret);
    }

    return await fetch(input, { ...init, headers });
  };
}

export async function monitorZulipProvider(opts: MonitorZulipOpts = {}): Promise<void> {
  const core = getZulipRuntime();
  const runtime = resolveRuntime(opts);
  const cfg = opts.config ?? core.config.loadConfig();

  const account = resolveZulipAccount({ cfg, accountId: opts.accountId });
  const client = resolveClient(account);

  const logger = core.logging.getChildLogger({ module: "zulip" });
  const logVerboseMessage = (message: string) => {
    if (!core.logging.shouldLogVerbose()) {
      return;
    }
    logger.debug?.(message);
  };

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg,
    surface: "zulip",
  });
  const historyLimit = Math.max(
    0,
    cfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );
  const channelHistories = new Map<string, HistoryEntry[]>();

  const defaultGroupPolicy = (cfg as { channels?: { defaults?: { groupPolicy?: string } } })
    .channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  const configAllowFrom = normalizeAllowList(account.config.allowFrom ?? []);
  const storeAllowFrom = normalizeAllowList(
    await core.channel.pairing.readAllowFromStore("zulip").catch(() => []),
  );
  const effectiveAllowFrom = Array.from(new Set([...configAllowFrom, ...storeAllowFrom]));

  const groupAllowFrom = normalizeAllowList(
    (account.config as { groupAllowFrom?: string[] }).groupAllowFrom ?? [],
  );

  let { queue_id: queueId, last_event_id: lastEventId } = await zulipRegister(client, {
    eventTypes: ["message"],
    allPublicStreams: false,
  });

  opts.statusSink?.({ connected: true, lastConnectedAt: Date.now(), lastError: null });
  runtime.log?.(`zulip connected: ${client.email} @ ${client.baseUrls?.[0] ?? client.baseUrl}`);

  const handleMessage = async (message: ZulipMessage) => {
    if (!message.sender_email) {
      return;
    }
    // Ignore self.
    if (message.sender_email.toLowerCase() === client.email.toLowerCase()) {
      return;
    }

    const senderEmail = message.sender_email;
    const senderName = message.sender_full_name?.trim() || senderEmail;
    const rawText = (message.content ?? "").trim();
    if (!rawText) {
      return;
    }

    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const isDm = message.type === "private";

    const hasControlCommand = core.channel.text.hasControlCommand(rawText, cfg);
    const isControlCommand = allowTextCommands && hasControlCommand;

    const senderAllowedDm = isSenderAllowed(senderEmail, effectiveAllowFrom);
    const senderAllowedGroup = isSenderAllowed(
      senderEmail,
      groupAllowFrom.length ? groupAllowFrom : effectiveAllowFrom,
    );

    if (isDm) {
      if (dmPolicy == "disabled") {
        logVerboseMessage(`zulip: drop dm (dmPolicy=disabled sender=${senderEmail})`);
        return;
      }
      if (dmPolicy != "open" && !senderAllowedDm) {
        if (dmPolicy == "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "zulip",
            id: senderEmail,
            meta: { name: senderName },
          });
          if (created) {
            const reply = core.channel.pairing.buildPairingReply({
              channel: "zulip",
              idLine: `Your Zulip email: ${senderEmail}`,
              code,
            });
            await sendMessageZulip(buildPrivateReplyTarget(message), reply, {
              accountId: account.accountId,
            });
            opts.statusSink?.({ lastOutboundAt: Date.now() });
          }
        }
        return;
      }
    } else {
      if (groupPolicy === "disabled") {
        return;
      }
      if (groupPolicy === "allowlist" && !senderAllowedGroup) {
        return;
      }
      // In streams, default to mention-gated.
      if (!isControlCommand && !isMentioned(message)) {
        recordPendingHistoryEntryIfEnabled({
          historyMap: channelHistories,
          limit: historyLimit,
          historyKey: buildHistoryKeyForThread(message),
          entry: {
            sender: senderName,
            body: rawText,
            timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
            messageId: String(message.id),
          },
        });
        return;
      }
    }

    const useAccessGroups =
      (cfg as { commands?: { useAccessGroups?: boolean } }).commands?.useAccessGroups !== false;
    const commandGate = resolveControlCommandGate({
      useAccessGroups,
      authorizers: [{ configured: effectiveAllowFrom.length > 0, allowed: senderAllowedGroup }],
      allowTextCommands,
      hasControlCommand,
    });
    const commandAuthorized = isDm
      ? dmPolicy === "open" || senderAllowedDm
      : commandGate.commandAuthorized;

    if (!isDm && commandGate.shouldBlock) {
      logInboundDrop({
        log: logVerboseMessage,
        channel: "zulip",
        reason: "control command (unauthorized)",
        target: senderEmail,
      });
      return;
    }

    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "inbound",
    });

    const streamName = !isDm ? resolveStreamName(message) : null;
    const topicName = !isDm ? resolveTopicName(message) : null;

    const groupLabel =
      message.type === "stream" && streamName && topicName
        ? `${streamName} · ${topicName || "general"}`
        : undefined;

    // Session/threading isolation:
    //  - DMs: one session per sender
    //  - Streams: one session per (stream + topic)
    const threadHistoryKey = !isDm ? buildHistoryKeyForThread(message) : null;
    const topicKey = !isDm && topicName ? hashZulipTopicKey(topicName) : null;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
      peer: {
        kind: isDm ? "dm" : "group",
        id: isDm
          ? senderEmail
          : `stream:${String(message.stream_id ?? streamName ?? "stream")}/${topicKey ?? "topic"}`,
      },
    });

    const historyKey = threadHistoryKey;

    const fromLabel = isDm
      ? senderName
      : `${senderName} @ ${message.display_recipient ?? "stream"}`;
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Zulip",
      from: fromLabel,
      timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
      body: `${rawText}\n[zulip message id: ${message.id}]`,
      chatType: isDm ? "direct" : "group",
      sender: { name: senderName, id: senderEmail },
    });

    let combinedBody = body;
    if (historyKey) {
      combinedBody = buildPendingHistoryContextFromMap({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
        currentMessage: combinedBody,
        formatEntry: (entry) =>
          core.channel.reply.formatInboundEnvelope({
            channel: "Zulip",
            from: fromLabel,
            timestamp: entry.timestamp,
            body: `${entry.body}${entry.messageId ? ` [id:${entry.messageId}]` : ""}`,
            chatType: "group",
            senderLabel: entry.sender,
          }),
      });
    }

    const to = isDm ? buildPrivateReplyTarget(message) : buildStreamReplyTarget(message);

    // Ack reaction (👀) only for messages we are going to process (post-gating).
    try {
      await reactEyes(client, message.id);
    } catch {
      // best-effort
    }

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: combinedBody,
      RawBody: rawText,
      CommandBody: rawText,
      From: isDm
        ? `zulip:${senderEmail}`
        : `zulip:stream:${message.stream_id ?? message.display_recipient ?? ""}`,
      To: to,
      SessionKey: route.sessionKey,
      ParentSessionKey: route.mainSessionKey,
      AccountId: route.accountId,
      ChatType: isDm ? "direct" : "group",
      ConversationLabel: fromLabel,
      GroupSubject: groupLabel,
      SenderName: senderName,
      SenderId: senderEmail,
      Provider: "zulip" as const,
      Surface: "zulip" as const,
      MessageSid: String(message.id),
      ReplyToId: !isDm ? String(message.id) : undefined,
      MessageThreadId: !isDm ? (message.topic ?? message.subject ?? undefined) : undefined,
      Timestamp: message.timestamp ? message.timestamp * 1000 : undefined,
      WasMentioned: !isDm ? isMentioned(message) : undefined,
      CommandAuthorized: commandAuthorized,
      OriginatingChannel: "zulip" as const,
      OriginatingTo: to,
    });

    // Attempt to fetch Zulip uploads (user_uploads) with Basic Auth so tools can access media
    // that requires login.
    try {
      const uploadUrls = extractZulipUploadUrls({
        contentHtml: message.content,
        baseUrl: client.baseUrls?.[0] ?? client.baseUrl ?? "",
        max: 3,
      });
      if (uploadUrls.length > 0) {
        const authFetch = createZulipAuthFetch(client);
        const mediaPaths: string[] = [];
        const mediaTypes: string[] = [];
        for (const url of uploadUrls) {
          try {
            const fetched = await core.channel.media.fetchRemoteMedia({
              url,
              fetchImpl: authFetch,
              maxBytes: 5 * 1024 * 1024,
            });
            const saved = await core.channel.media.saveMediaBuffer(
              fetched.buffer,
              fetched.contentType,
              "zulip",
              5 * 1024 * 1024,
              fetched.fileName,
            );
            mediaPaths.push(saved.path);
            if (saved.contentType) {
              mediaTypes.push(saved.contentType);
            }
          } catch (err) {
            logVerboseMessage(`zulip: failed fetching upload ${url}: ${String(err)}`);
          }
        }
        if (mediaPaths.length > 0) {
          ctxPayload.MediaPath = mediaPaths[0];
          ctxPayload.MediaPaths = mediaPaths;
          ctxPayload.MediaUrls = uploadUrls;
          if (mediaTypes.length > 0) {
            ctxPayload.MediaType = mediaTypes[0];
            ctxPayload.MediaTypes = mediaTypes;
          }
        }
      }
    } catch (err) {
      logVerboseMessage(`zulip: upload extraction failed: ${String(err)}`);
    }

    const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "zulip", account.accountId, {
      fallbackLimit: account.config.textChunkLimit ?? 9000,
    });
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
    });

    const prefixContext = createReplyPrefixContext({ cfg, agentId: route.agentId });

    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        responsePrefix: prefixContext.responsePrefix,
        responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
        humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        deliver: async (payload: ReplyPayload) => {
          const raw = payload.text ?? "";
          if (!raw.trim()) {
            return;
          }

          // Outbound directive: [[zulip_topic: <topic>]] overrides the topic for stream replies.
          const { text, topicOverride } = extractZulipTopicDirective(raw);
          const effectiveTo =
            !isDm && topicOverride ? buildStreamReplyTarget(message, topicOverride) : to;

          const rendered = core.channel.text.convertMarkdownTables(text, tableMode);
          const chunks = core.channel.text.chunkMarkdownText(rendered, textLimit);
          for (const chunk of chunks.length > 0 ? chunks : [rendered]) {
            if (!chunk?.trim()) {
              continue;
            }
            const result = await sendMessageZulip(effectiveTo, chunk, { accountId: account.accountId });
            if (!result.ok) {
              throw result.error;
            }
            opts.statusSink?.({ lastOutboundAt: Date.now() });
          }
        },
        onError: (err, info) => {
          runtime.error?.(`zulip ${info.kind} reply failed: ${String(err)}`);
        },
      });

    const typingUserId = isDm ? (message.sender_id ?? undefined) : undefined;
    if (typingUserId != null) {
      try {
        await zulipSetTypingStatus(client, { op: "start", to: [typingUserId] });
      } catch {
        // best-effort
      }
    }

    try {
      await core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg,
        dispatcher,
        replyOptions: {
          ...replyOptions,
          onModelSelected: prefixContext.onModelSelected,
        },
      });
    } finally {
      if (typingUserId != null) {
        try {
          await zulipSetTypingStatus(client, { op: "stop", to: [typingUserId] });
        } catch {
          // best-effort
        }
      }
    }

    markDispatchIdle();

    if (historyKey) {
      clearHistoryEntriesIfEnabled({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
      });
    }

    opts.statusSink?.({ lastInboundAt: Date.now() });
  };

  let consecutivePollFailures = 0;
  let consecutiveEmptyPayloads = 0;

  while (!opts.abortSignal?.aborted) {
    try {
      const response = await zulipGetEvents(client, {
        queueId,
        lastEventId,
        timeoutSeconds: 30,
      });
      consecutivePollFailures = 0;

      const events = Array.isArray(response.events) ? response.events : [];
      if (!Array.isArray(response.events)) {
        consecutiveEmptyPayloads++;
        // Defensive sleep to avoid hot-looping on malformed/empty poll payloads.
        await sleep(Math.min(5000, 250 * consecutiveEmptyPayloads));
      } else {
        consecutiveEmptyPayloads = 0;
      }

      for (const event of events) {
        lastEventId = Math.max(lastEventId, event.id);
        if (event.type !== "message" || !event.message) {
          continue;
        }
        await handleMessage(event.message);
      }
    } catch (err) {
      consecutivePollFailures++;
      const message = err instanceof Error ? err.message : String(err);
      const looksLikeBadQueue =
        /BAD_EVENT_QUEUE_ID|Bad event queue/i.test(message) ||
        (err instanceof ZulipApiError && err.code === "BAD_EVENT_QUEUE_ID");
      const httpStatus = err instanceof ZulipApiError ? (err.status ?? null) : null;

      runtime.error?.(`zulip events error: ${message}`);
      opts.statusSink?.({
        lastError: message,
        connected: false,
        lastDisconnect: { at: Date.now(), status: httpStatus ?? 0, error: message },
      });

      // Poll errors are often transient (Cloudflare/proxy/origin hiccups). Prefer retrying the
      // existing queue rather than immediately re-registering.
      const delayMs = resolveMonitorBackoffMs({ error: err, consecutiveFailures: consecutivePollFailures });
      await sleep(delayMs);

      // Only re-register when the queue is invalid (BAD_EVENT_QUEUE_ID). Avoid
      // re-registering on generic 5xx/proxy issues; those are often transient.
      if (!looksLikeBadQueue) {
        continue;
      }

      try {
        const reg = await zulipRegister(client, {
          eventTypes: ["message"],
          allPublicStreams: false,
        });
        queueId = reg.queue_id;
        lastEventId = reg.last_event_id;
        consecutivePollFailures = 0;
        opts.statusSink?.({ connected: true, lastConnectedAt: Date.now(), lastError: null });
      } catch (regErr) {
        runtime.error?.(`zulip register retry failed: ${String(regErr)}`);
        await sleep(5000);
      }
    }
  }
}
