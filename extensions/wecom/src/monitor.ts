import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import type { WecomRuntimeEnv, WecomWebhookTarget, PendingInbound } from "./monitor/types.js";
import type { WecomInboundMessage } from "./types.js";
import type { ResolvedAgentAccount } from "./types/index.js";
import { handleAgentWebhook } from "./agent/index.js";
import { resolveWecomEgressProxyUrl } from "./config/index.js";
import { decryptWecomEncrypted, verifyWecomSignature } from "./crypto.js";
import { wecomFetch } from "./http.js";
import { startAgentForStream } from "./monitor/agent-stream.js";
import { storeActiveReply, useActiveReplyOnce, getActiveReplyUrl } from "./monitor/delivery.js";
// Import from new modules
import {
  normalizeWebhookPath,
  ensurePruneTimer,
  checkPruneTimer,
  jsonOk,
  readJsonBody,
  resolveQueryParams,
  resolvePath,
  resolveSignatureParam,
  logVerbose,
  wecomLogInfo,
  setTargetRegistryRefs,
} from "./monitor/http-utils.js";
import {
  resolveWecomSenderUserId,
  parseWecomPlainMessage,
  buildInboundBody,
} from "./monitor/message-parser.js";
import {
  buildEncryptedJsonReply,
  buildStreamPlaceholderReply,
  buildStreamTextPlaceholderReply,
  buildStreamReplyFromState,
} from "./monitor/reply-builder.js";
/**
 * **核心监控模块 (Monitor Loop)**
 *
 * 负责接收企业微信 Webhook 回调，处理消息流、媒体解密、消息去重防抖，并分发给 Agent 处理。
 * 它是插件与企业微信交互的"心脏"，管理着所有会话的生命周期。
 */
import { monitorState, LIMITS } from "./monitor/state.js";
import { getWecomRuntime } from "./runtime.js";
// Import agent-stream to register flush handler (side effect)
import "./monitor/agent-stream.js";
import { WEBHOOK_PATHS } from "./types/constants.js";

// Stores (convenience aliases)
const streamStore = monitorState.streamStore;
const activeReplyStore = monitorState.activeReplyStore;

// Target Registry
const webhookTargets = new Map<string, WecomWebhookTarget[]>();

// Agent 模式 target 存储
type AgentWebhookTarget = {
  agent: ResolvedAgentAccount;
  config: OpenClawConfig;
  runtime: WecomRuntimeEnv;
  // ...
};
const agentTargets = new Map<string, AgentWebhookTarget>();

const pendingInbounds = new Map<string, PendingInbound>();

// Initialize target registry refs for checkPruneTimer
setTargetRegistryRefs(webhookTargets, agentTargets);

/** 错误提示信息 */
const ERROR_HELP = "\n\n遇到问题？联系作者: YanHaidao (微信: YanHaidao)";

/**
 * **registerWecomWebhookTarget (注册 Webhook 目标)**
 *
 * 注册一个 Bot 模式的接收端点。
 * 同时会触发清理定时器的检查（如果有新注册，确保定时器运行）。
 * 返回一个注销函数。
 */
export function registerWecomWebhookTarget(target: WecomWebhookTarget): () => void {
  const key = normalizeWebhookPath(target.path);
  const normalizedTarget = { ...target, path: key };
  const existing = webhookTargets.get(key) ?? [];
  webhookTargets.set(key, [...existing, normalizedTarget]);
  ensurePruneTimer();
  return () => {
    const updated = (webhookTargets.get(key) ?? []).filter((entry) => entry !== normalizedTarget);
    if (updated.length > 0) webhookTargets.set(key, updated);
    else webhookTargets.delete(key);
    checkPruneTimer();
  };
}

/**
 * 注册 Agent 模式 Webhook Target
 */
export function registerAgentWebhookTarget(target: AgentWebhookTarget): () => void {
  const key = WEBHOOK_PATHS.AGENT;
  agentTargets.set(key, target);
  ensurePruneTimer();
  return () => {
    agentTargets.delete(key);
    checkPruneTimer();
  };
}

/**
 * **handleWecomWebhookRequest (HTTP 请求入口)**
 *
 * 处理来自企业微信的所有 Webhook 请求。
 * 职责：
 * 1. 路由分发：区分 Agent 模式 (`/wecom/agent`) 和 Bot 模式 (其他路径)。
 * 2. 安全校验：验证企业微信签名 (Signature)。
 * 3. 消息解密：处理企业微信的加密包。
 * 4. 响应处理：
 *    - GET 请求：处理 EchoStr 验证。
 *    - POST 请求：接收消息，放入 StreamStore，返回流式 First Chunk。
 */
export async function handleWecomWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = resolvePath(req);
  const reqId = crypto.randomUUID().slice(0, 8);
  const remote = req.socket?.remoteAddress ?? "unknown";
  const ua = String(req.headers["user-agent"] ?? "");
  const cl = String(req.headers["content-length"] ?? "");
  // 不输出敏感参数内容，仅输出是否存在（排查"有没有打到网关/有没有带签名参数"）
  const q = resolveQueryParams(req);
  const hasTimestamp = Boolean(q.get("timestamp"));
  const hasNonce = Boolean(q.get("nonce"));
  const hasEchostr = Boolean(q.get("echostr"));
  const hasMsgSig = Boolean(q.get("msg_signature"));
  const hasSignature = Boolean(q.get("signature"));
  console.log(
    `[wecom] inbound(http): reqId=${reqId} path=${path} method=${req.method ?? "UNKNOWN"} remote=${remote} ua=${ua ? `"${ua}"` : "N/A"} contentLength=${cl || "N/A"} query={timestamp:${hasTimestamp},nonce:${hasNonce},echostr:${hasEchostr},msg_signature:${hasMsgSig},signature:${hasSignature}}`,
  );

  // Agent 模式路由: /wecom/agent
  if (path === WEBHOOK_PATHS.AGENT) {
    const agentTarget = agentTargets.get(WEBHOOK_PATHS.AGENT);
    if (agentTarget) {
      const core = getWecomRuntime();
      const query = resolveQueryParams(req);
      const timestamp = query.get("timestamp") ?? "";
      const nonce = query.get("nonce") ?? "";
      const hasSig = Boolean(query.get("msg_signature"));
      const remote = req.socket?.remoteAddress ?? "unknown";
      agentTarget.runtime.log?.(
        `[wecom] inbound(agent): reqId=${reqId} method=${req.method ?? "UNKNOWN"} remote=${remote} timestamp=${timestamp ? "yes" : "no"} nonce=${nonce ? "yes" : "no"} msg_signature=${hasSig ? "yes" : "no"}`,
      );
      return handleAgentWebhook({
        req,
        res,
        agent: agentTarget.agent,
        config: agentTarget.config,
        core,
        log: agentTarget.runtime.log,
        error: agentTarget.runtime.error,
      });
    }
    // 未注册 Agent，返回 404
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`agent not configured - Agent 模式未配置，请运行 openclaw onboarding${ERROR_HELP}`);
    return true;
  }

  // Bot 模式路由: /wecom, /wecom/bot
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) return false;

  const query = resolveQueryParams(req);
  const timestamp = query.get("timestamp") ?? "";
  const nonce = query.get("nonce") ?? "";
  const signature = resolveSignatureParam(query);

  if (req.method === "GET") {
    const echostr = query.get("echostr") ?? "";
    const target = targets.find(
      (c) =>
        c.account.token &&
        verifyWecomSignature({
          token: c.account.token,
          timestamp,
          nonce,
          encrypt: echostr,
          signature,
        }),
    );
    if (!target || !target.account.encodingAESKey) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`unauthorized - Bot 签名验证失败，请检查 Token 配置${ERROR_HELP}`);
      return true;
    }
    try {
      const plain = decryptWecomEncrypted({
        encodingAESKey: target.account.encodingAESKey,
        receiveId: target.account.receiveId,
        encrypt: echostr,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(plain);
      return true;
    } catch (err) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`decrypt failed - 解密失败，请检查 EncodingAESKey${ERROR_HELP}`);
      return true;
    }
  }

  if (req.method !== "POST") return false;

  const body = await readJsonBody(req, 1024 * 1024);
  if (!body.ok) {
    res.statusCode = 400;
    res.end(body.error || "invalid payload");
    return true;
  }
  const record = body.value as any;
  const encrypt = String(record?.encrypt ?? record?.Encrypt ?? "");
  // Bot POST 回调体积/字段诊断（不输出 encrypt 内容）
  console.log(
    `[wecom] inbound(bot): reqId=${reqId} rawJsonBytes=${Buffer.byteLength(JSON.stringify(record), "utf8")} hasEncrypt=${Boolean(encrypt)} encryptLen=${encrypt.length}`,
  );
  const target = targets.find(
    (c) =>
      c.account.token &&
      verifyWecomSignature({ token: c.account.token, timestamp, nonce, encrypt, signature }),
  );
  if (!target || !target.account.configured || !target.account.encodingAESKey) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`unauthorized - Bot 签名验证失败${ERROR_HELP}`);
    return true;
  }

  // 选定 target 后，把 reqId 带入结构化日志，方便串联排查
  wecomLogInfo(
    target,
    `inbound(bot): reqId=${reqId} selectedAccount=${target.account.accountId} path=${path}`,
  );

  let plain: string;
  try {
    plain = decryptWecomEncrypted({
      encodingAESKey: target.account.encodingAESKey,
      receiveId: target.account.receiveId,
      encrypt,
    });
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`decrypt failed - 解密失败${ERROR_HELP}`);
    return true;
  }

  const msg = parseWecomPlainMessage(plain);
  const msgtype = String(msg.msgtype ?? "").toLowerCase();
  const proxyUrl = resolveWecomEgressProxyUrl(target.config);

  // Handle Event
  if (msgtype === "event") {
    const eventtype = String((msg as any).event?.eventtype ?? "").toLowerCase();

    if (eventtype === "template_card_event") {
      const msgid = msg.msgid ? String(msg.msgid) : undefined;

      // Dedupe: skip if already processed this event
      if (msgid && streamStore.getStreamByMsgId(msgid)) {
        logVerbose(target, `template_card_event: already processed msgid=${msgid}, skipping`);
        jsonOk(
          res,
          buildEncryptedJsonReply({ account: target.account, plaintextJson: {}, nonce, timestamp }),
        );
        return true;
      }

      const cardEvent = (msg as any).event?.template_card_event;
      let interactionDesc = `[卡片交互] 按钮: ${cardEvent?.event_key || "unknown"}`;
      if (cardEvent?.selected_items?.selected_item?.length) {
        const selects = cardEvent.selected_items.selected_item.map(
          (i: any) => `${i.question_key}=${i.option_ids?.option_id?.join(",")}`,
        );
        interactionDesc += ` 选择: ${selects.join("; ")}`;
      }
      if (cardEvent?.task_id) interactionDesc += ` (任务ID: ${cardEvent.task_id})`;

      jsonOk(
        res,
        buildEncryptedJsonReply({ account: target.account, plaintextJson: {}, nonce, timestamp }),
      );

      const streamId = streamStore.createStream({ msgid });
      streamStore.markStarted(streamId);
      storeActiveReply(streamId, msg.response_url);
      const core = getWecomRuntime();
      startAgentForStream({
        target: { ...target, core },
        accountId: target.account.accountId,
        msg: { ...msg, msgtype: "text", text: { content: interactionDesc } } as any,
        streamId,
      }).catch((err) => target.runtime.error?.(`interaction failed: ${String(err)}`));
      return true;
    }

    if (eventtype === "enter_chat") {
      const welcome = target.account.config.welcomeText?.trim();
      jsonOk(
        res,
        buildEncryptedJsonReply({
          account: target.account,
          plaintextJson: welcome ? { msgtype: "text", text: { content: welcome } } : {},
          nonce,
          timestamp,
        }),
      );
      return true;
    }

    jsonOk(
      res,
      buildEncryptedJsonReply({ account: target.account, plaintextJson: {}, nonce, timestamp }),
    );
    return true;
  }

  // Handle Stream Refresh
  if (msgtype === "stream") {
    const streamId = String((msg as any).stream?.id ?? "").trim();
    const state = streamStore.getStream(streamId);
    const reply = state
      ? buildStreamReplyFromState(state)
      : buildStreamReplyFromState({
          streamId: streamId || "unknown",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          started: true,
          finished: true,
          content: "",
        });
    jsonOk(
      res,
      buildEncryptedJsonReply({ account: target.account, plaintextJson: reply, nonce, timestamp }),
    );
    return true;
  }

  // Handle Message (with Debounce)
  try {
    const userid = resolveWecomSenderUserId(msg) || "unknown";
    const chatId = msg.chattype === "group" ? msg.chatid?.trim() || "unknown" : userid;
    const conversationKey = `wecom:${target.account.accountId}:${userid}:${chatId}`;
    const msgContent = buildInboundBody(msg);

    wecomLogInfo(
      target,
      `inbound: msgtype=${msgtype} chattype=${String(msg.chattype ?? "")} chatid=${String(msg.chatid ?? "")} from=${userid} msgid=${String(msg.msgid ?? "")} hasResponseUrl=${Boolean((msg as any).response_url)}`,
    );

    // 去重: 若 msgid 已存在于 StreamStore，说明是重试请求，直接返回占位符
    if (msg.msgid) {
      const existingStreamId = streamStore.getStreamByMsgId(String(msg.msgid));
      if (existingStreamId) {
        wecomLogInfo(
          target,
          `message: 重复的 msgid=${msg.msgid}，跳过处理并返回占位符 streamId=${existingStreamId}`,
        );
        jsonOk(
          res,
          buildEncryptedJsonReply({
            account: target.account,
            plaintextJson: buildStreamPlaceholderReply({
              streamId: existingStreamId,
              placeholderContent: target.account.config.streamPlaceholderContent,
            }),
            nonce,
            timestamp,
          }),
        );
        return true;
      }
    }

    // 加入 Pending 队列 (防抖/聚合)
    // 消息不会立即处理，而是等待防抖计时器结束（flushPending）后统一触发
    const { streamId, status } = streamStore.addPendingMessage({
      conversationKey,
      target,
      msg,
      msgContent,
      nonce,
      timestamp,
      debounceMs: (target.account.config as any).debounceMs,
    });

    // 无论是否新建，都尽量保存 response_url（用于兜底提示/最终帧推送）
    if (msg.response_url) {
      storeActiveReply(streamId, msg.response_url, proxyUrl);
    }

    const defaultPlaceholder = target.account.config.streamPlaceholderContent;
    const queuedPlaceholder = "已收到，已排队处理中...";
    const mergedQueuedPlaceholder = "已收到，已合并排队处理中...";

    if (status === "active_new") {
      jsonOk(
        res,
        buildEncryptedJsonReply({
          account: target.account,
          plaintextJson: buildStreamPlaceholderReply({
            streamId,
            placeholderContent: defaultPlaceholder,
          }),
          nonce,
          timestamp,
        }),
      );
      return true;
    }

    if (status === "queued_new") {
      wecomLogInfo(
        target,
        `queue: 已进入下一批次 streamId=${streamId} msgid=${String(msg.msgid ?? "")}`,
      );
      jsonOk(
        res,
        buildEncryptedJsonReply({
          account: target.account,
          plaintextJson: buildStreamPlaceholderReply({
            streamId,
            placeholderContent: queuedPlaceholder,
          }),
          nonce,
          timestamp,
        }),
      );
      return true;
    }

    // active_merged / queued_merged：合并进某个批次，但本条消息不应该刷出"完整答案"，否则用户会看到重复内容。
    // 做法：为本条 msgid 创建一个"回执 stream"，先显示"已合并排队"，并在批次结束时自动更新为"已合并处理完成"。
    const ackStreamId = streamStore.createStream({ msgid: String(msg.msgid ?? "") || undefined });
    streamStore.updateStream(ackStreamId, (s) => {
      s.finished = false;
      s.started = true;
      s.content = mergedQueuedPlaceholder;
    });
    if (msg.msgid) streamStore.setStreamIdForMsgId(String(msg.msgid), ackStreamId);
    streamStore.addAckStreamForBatch({ batchStreamId: streamId, ackStreamId });
    wecomLogInfo(
      target,
      `queue: 已合并排队（回执流） ackStreamId=${ackStreamId} mergedIntoStreamId=${streamId} msgid=${String(msg.msgid ?? "")}`,
    );
    jsonOk(
      res,
      buildEncryptedJsonReply({
        account: target.account,
        plaintextJson: buildStreamTextPlaceholderReply({
          streamId: ackStreamId,
          content: mergedQueuedPlaceholder,
        }),
        nonce,
        timestamp,
      }),
    );
    return true;
  } catch (err) {
    target.runtime.error?.(`[wecom] Bot message handler crashed: ${String(err)}`);
    // 尽量返回 200，避免企微重试风暴；同时给一个可见的错误文本
    jsonOk(
      res,
      buildEncryptedJsonReply({
        account: target.account,
        plaintextJson: {
          msgtype: "text",
          text: { content: "服务内部错误：Bot 处理异常，请稍后重试。" },
        },
        nonce,
        timestamp,
      }),
    );
    return true;
  }
}

export async function sendActiveMessage(streamId: string, content: string): Promise<void> {
  await useActiveReplyOnce(streamId, async ({ responseUrl, proxyUrl }) => {
    const res = await wecomFetch(
      responseUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "text", text: { content } }),
      },
      { proxyUrl, timeoutMs: LIMITS.REQUEST_TIMEOUT_MS },
    );
    if (!res.ok) {
      throw new Error(`active send failed: ${res.status}`);
    }
  });
}
