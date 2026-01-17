import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import {
  readNumberParam,
  readStringArrayParam,
  readStringParam,
} from "../../agents/tools/common.js";
import { parseReplyDirectives } from "../../auto-reply/reply/reply-directives.js";
import { dispatchChannelMessageAction } from "../../channels/plugins/message-actions.js";
import type {
  ChannelId,
  ChannelMessageActionName,
  ChannelThreadingToolContext,
} from "../../channels/plugins/types.js";
import type { ClawdbotConfig } from "../../config/config.js";
import type { GatewayClientMode, GatewayClientName } from "../../utils/message-channel.js";
import {
  listConfiguredMessageChannels,
  resolveMessageChannelSelection,
} from "./channel-selection.js";
import { applyTargetToParams } from "./channel-target.js";
import type { OutboundSendDeps } from "./deliver.js";
import type { MessagePollResult, MessageSendResult } from "./message.js";
import {
  applyCrossContextDecoration,
  buildCrossContextDecoration,
  type CrossContextDecoration,
  enforceCrossContextPolicy,
  shouldApplyCrossContextMarker,
} from "./outbound-policy.js";
import { executePollAction, executeSendAction } from "./outbound-send-service.js";
import { actionRequiresTarget } from "./message-action-spec.js";
import { resolveChannelTarget } from "./target-resolver.js";

export type MessageActionRunnerGateway = {
  url?: string;
  token?: string;
  timeoutMs?: number;
  clientName: GatewayClientName;
  clientDisplayName?: string;
  mode: GatewayClientMode;
};

export type RunMessageActionParams = {
  cfg: ClawdbotConfig;
  action: ChannelMessageActionName;
  params: Record<string, unknown>;
  defaultAccountId?: string;
  toolContext?: ChannelThreadingToolContext;
  gateway?: MessageActionRunnerGateway;
  deps?: OutboundSendDeps;
  sessionKey?: string;
  agentId?: string;
  dryRun?: boolean;
};

export type MessageActionRunResult =
  | {
      kind: "send";
      channel: ChannelId;
      action: "send";
      to: string;
      handledBy: "plugin" | "core";
      payload: unknown;
      toolResult?: AgentToolResult<unknown>;
      sendResult?: MessageSendResult;
      dryRun: boolean;
    }
  | {
      kind: "broadcast";
      channel: ChannelId;
      action: "broadcast";
      handledBy: "core" | "dry-run";
      payload: {
        results: Array<{
          channel: ChannelId;
          to: string;
          ok: boolean;
          error?: string;
          result?: MessageSendResult;
        }>;
      };
      dryRun: boolean;
    }
  | {
      kind: "poll";
      channel: ChannelId;
      action: "poll";
      to: string;
      handledBy: "plugin" | "core";
      payload: unknown;
      toolResult?: AgentToolResult<unknown>;
      pollResult?: MessagePollResult;
      dryRun: boolean;
    }
  | {
      kind: "action";
      channel: ChannelId;
      action: Exclude<ChannelMessageActionName, "send" | "poll">;
      handledBy: "plugin" | "dry-run";
      payload: unknown;
      toolResult?: AgentToolResult<unknown>;
      dryRun: boolean;
    };

export function getToolResult(
  result: MessageActionRunResult,
): AgentToolResult<unknown> | undefined {
  return "toolResult" in result ? result.toolResult : undefined;
}

function extractToolPayload(result: AgentToolResult<unknown>): unknown {
  if (result.details !== undefined) return result.details;
  const textBlock = Array.isArray(result.content)
    ? result.content.find(
        (block) =>
          block &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "text" &&
          typeof (block as { text?: unknown }).text === "string",
      )
    : undefined;
  const text = (textBlock as { text?: string } | undefined)?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result.content ?? result;
}

function applyCrossContextMessageDecoration({
  params,
  message,
  decoration,
  preferEmbeds,
}: {
  params: Record<string, unknown>;
  message: string;
  decoration: CrossContextDecoration;
  preferEmbeds: boolean;
}): string {
  const applied = applyCrossContextDecoration({
    message,
    decoration,
    preferEmbeds,
  });
  params.message = applied.message;
  if (applied.embeds?.length) {
    params.embeds = applied.embeds;
  }
  return applied.message;
}

async function maybeApplyCrossContextMarker(params: {
  cfg: ClawdbotConfig;
  channel: ChannelId;
  action: ChannelMessageActionName;
  target: string;
  toolContext?: ChannelThreadingToolContext;
  accountId?: string | null;
  args: Record<string, unknown>;
  message: string;
  preferEmbeds: boolean;
}): Promise<string> {
  if (!shouldApplyCrossContextMarker(params.action) || !params.toolContext) {
    return params.message;
  }
  const decoration = await buildCrossContextDecoration({
    cfg: params.cfg,
    channel: params.channel,
    target: params.target,
    toolContext: params.toolContext,
    accountId: params.accountId ?? undefined,
  });
  if (!decoration) return params.message;
  return applyCrossContextMessageDecoration({
    params: params.args,
    message: params.message,
    decoration,
    preferEmbeds: params.preferEmbeds,
  });
}

function readBooleanParam(params: Record<string, unknown>, key: string): boolean | undefined {
  const raw = params[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
  }
  return undefined;
}

function parseButtonsParam(params: Record<string, unknown>): void {
  const raw = params.buttons;
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (!trimmed) {
    delete params.buttons;
    return;
  }
  try {
    params.buttons = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("--buttons must be valid JSON");
  }
}

<<<<<<< HEAD
<<<<<<< HEAD
const CONTEXT_GUARDED_ACTIONS = new Set<ProviderMessageActionName>([
=======
const CONTEXT_GUARDED_ACTIONS = new Set<ChannelMessageActionName>([
>>>>>>> upstream/main
  "send",
  "poll",
  "thread-create",
  "thread-reply",
  "sticker",
]);

function resolveContextGuardTarget(
<<<<<<< HEAD
  action: ProviderMessageActionName,
=======
  action: ChannelMessageActionName,
>>>>>>> upstream/main
  params: Record<string, unknown>,
): string | undefined {
  if (!CONTEXT_GUARDED_ACTIONS.has(action)) return undefined;

  if (action === "thread-reply" || action === "thread-create") {
    return (
      readStringParam(params, "channelId") ?? readStringParam(params, "to")
    );
  }

  return readStringParam(params, "to") ?? readStringParam(params, "channelId");
}

function enforceContextIsolation(params: {
<<<<<<< HEAD
  provider: ProviderId;
  action: ProviderMessageActionName;
  params: Record<string, unknown>;
  toolContext?: ProviderThreadingToolContext;
=======
  channel: ChannelId;
  action: ChannelMessageActionName;
  params: Record<string, unknown>;
  toolContext?: ChannelThreadingToolContext;
>>>>>>> upstream/main
}): void {
  const currentTarget = params.toolContext?.currentChannelId?.trim();
  if (!currentTarget) return;
  if (!CONTEXT_GUARDED_ACTIONS.has(params.action)) return;

  const target = resolveContextGuardTarget(params.action, params.params);
  if (!target) return;

  const normalizedTarget =
<<<<<<< HEAD
    normalizeTargetForProvider(params.provider, target) ?? target.toLowerCase();
  const normalizedCurrent =
    normalizeTargetForProvider(params.provider, currentTarget) ??
=======
    normalizeTargetForProvider(params.channel, target) ?? target.toLowerCase();
  const normalizedCurrent =
    normalizeTargetForProvider(params.channel, currentTarget) ??
>>>>>>> upstream/main
    currentTarget.toLowerCase();

  if (!normalizedTarget || !normalizedCurrent) return;
  if (normalizedTarget === normalizedCurrent) return;

  throw new Error(
<<<<<<< HEAD
    `Cross-context messaging denied: action=${params.action} target="${target}" while bound to "${currentTarget}" (provider=${params.provider}).`,
  );
}

async function resolveProvider(
=======
    `Cross-context messaging denied: action=${params.action} target="${target}" while bound to "${currentTarget}" (channel=${params.channel}).`,
  );
}

async function resolveChannel(
>>>>>>> upstream/main
  cfg: ClawdbotConfig,
  params: Record<string, unknown>,
) {
=======
async function resolveChannel(cfg: ClawdbotConfig, params: Record<string, unknown>) {
>>>>>>> upstream/main
  const channelHint = readStringParam(params, "channel");
  const selection = await resolveMessageChannelSelection({
    cfg,
    channel: channelHint,
  });
  return selection.channel;
}

async function resolveActionTarget(params: {
  cfg: ClawdbotConfig;
  channel: ChannelId;
  action: ChannelMessageActionName;
  args: Record<string, unknown>;
  accountId?: string | null;
}): Promise<void> {
  const toRaw = typeof params.args.to === "string" ? params.args.to.trim() : "";
  if (toRaw) {
    const resolved = await resolveChannelTarget({
      cfg: params.cfg,
      channel: params.channel,
      input: toRaw,
      accountId: params.accountId ?? undefined,
    });
    if (resolved.ok) {
      params.args.to = resolved.target.to;
    } else {
      throw resolved.error;
    }
  }
  const channelIdRaw =
    typeof params.args.channelId === "string" ? params.args.channelId.trim() : "";
  if (channelIdRaw) {
    const resolved = await resolveChannelTarget({
      cfg: params.cfg,
      channel: params.channel,
      input: channelIdRaw,
      accountId: params.accountId ?? undefined,
      preferredKind: "group",
    });
    if (resolved.ok) {
      if (resolved.target.kind === "user") {
        throw new Error(`Channel id "${channelIdRaw}" resolved to a user target.`);
      }
      params.args.channelId = resolved.target.to.replace(/^(channel|group):/i, "");
    } else {
      throw resolved.error;
    }
  }
}

type ResolvedActionContext = {
  cfg: ClawdbotConfig;
  params: Record<string, unknown>;
  channel: ChannelId;
  accountId?: string | null;
  dryRun: boolean;
  gateway?: MessageActionRunnerGateway;
  input: RunMessageActionParams;
};
function resolveGateway(input: RunMessageActionParams): MessageActionRunnerGateway | undefined {
  if (!input.gateway) return undefined;
  return {
    url: input.gateway.url,
    token: input.gateway.token,
    timeoutMs: input.gateway.timeoutMs,
    clientName: input.gateway.clientName,
    clientDisplayName: input.gateway.clientDisplayName,
    mode: input.gateway.mode,
  };
}

async function handleBroadcastAction(
  input: RunMessageActionParams,
  params: Record<string, unknown>,
): Promise<MessageActionRunResult> {
  const broadcastEnabled = input.cfg.tools?.message?.broadcast?.enabled !== false;
  if (!broadcastEnabled) {
    throw new Error("Broadcast is disabled. Set tools.message.broadcast.enabled to true.");
  }
  const rawTargets = readStringArrayParam(params, "targets", { required: true }) ?? [];
  if (rawTargets.length === 0) {
    throw new Error("Broadcast requires at least one target in --targets.");
  }
  const channelHint = readStringParam(params, "channel");
  const configured = await listConfiguredMessageChannels(input.cfg);
  if (configured.length === 0) {
    throw new Error("Broadcast requires at least one configured channel.");
  }
  const targetChannels =
    channelHint && channelHint.trim().toLowerCase() !== "all"
      ? [await resolveChannel(input.cfg, { channel: channelHint })]
      : configured;
  const results: Array<{
    channel: ChannelId;
    to: string;
    ok: boolean;
    error?: string;
    result?: MessageSendResult;
  }> = [];
  for (const targetChannel of targetChannels) {
    for (const target of rawTargets) {
      try {
        const resolved = await resolveChannelTarget({
          cfg: input.cfg,
          channel: targetChannel,
          input: target,
        });
        if (!resolved.ok) throw resolved.error;
        const sendResult = await runMessageAction({
          ...input,
          action: "send",
          params: {
            ...params,
            channel: targetChannel,
            target: resolved.target.to,
          },
        });
        results.push({
          channel: targetChannel,
          to: resolved.target.to,
          ok: true,
          result: sendResult.kind === "send" ? sendResult.sendResult : undefined,
        });
      } catch (err) {
        results.push({
          channel: targetChannel,
          to: target,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return {
    kind: "broadcast",
    channel: (targetChannels[0] ?? "discord") as ChannelId,
    action: "broadcast",
    handledBy: input.dryRun ? "dry-run" : "core",
    payload: { results },
    dryRun: Boolean(input.dryRun),
  };
}

async function handleSendAction(ctx: ResolvedActionContext): Promise<MessageActionRunResult> {
  const { cfg, params, channel, accountId, dryRun, gateway, input } = ctx;
  const action: ChannelMessageActionName = "send";
  const to = readStringParam(params, "to", { required: true });
  const mediaHint = readStringParam(params, "media", { trim: false });
  let message =
    readStringParam(params, "message", {
      required: !mediaHint,
      allowEmpty: true,
    }) ?? "";

<<<<<<< HEAD
  enforceContextIsolation({
<<<<<<< HEAD
    provider,
=======
=======
  const parsed = parseReplyDirectives(message);
  message = parsed.text;
  params.message = message;
  if (!params.replyTo && parsed.replyToId) params.replyTo = parsed.replyToId;
  if (!params.media) {
    params.media = parsed.mediaUrls?.[0] || parsed.mediaUrl || undefined;
  }

  message = await maybeApplyCrossContextMarker({
    cfg,
>>>>>>> upstream/main
    channel,
>>>>>>> upstream/main
    action,
    target: to,
    toolContext: input.toolContext,
    accountId,
    args: params,
    message,
    preferEmbeds: true,
  });

<<<<<<< HEAD
  const gateway = input.gateway
    ? {
        url: input.gateway.url,
        token: input.gateway.token,
        timeoutMs: input.gateway.timeoutMs,
        clientName: input.gateway.clientName,
        clientDisplayName: input.gateway.clientDisplayName,
        mode: input.gateway.mode,
      }
    : undefined;

  if (action === "send") {
<<<<<<< HEAD
    // Allow omitting `to` when agent has a bound context (e.g., replying to same conversation)
    const toParam = readStringParam(params, "to");
    const to = toParam || input.toolContext?.currentChannelId;
    if (!to) {
      return {
        kind: "send",
        channel,
        action,
        to: "",
        handledBy: "core",
        payload: { status: "error", tool: "message", error: "to required" },
        dryRun,
      };
    }
    let message = readStringParam(params, "message", {
      required: true,
      allowEmpty: true,
    });
=======
    const to = readStringParam(params, "to", { required: true });
    // Allow message to be omitted when sending media-only (e.g., voice notes)
    const mediaHint = readStringParam(params, "media", { trim: false });
    let message =
      readStringParam(params, "message", {
        required: !mediaHint, // Only require message if no media hint
        allowEmpty: true,
      }) ?? "";
>>>>>>> upstream/main

    const parsed = parseReplyDirectives(message);
    message = parsed.text;
    params.message = message;
    if (!params.replyTo && parsed.replyToId) params.replyTo = parsed.replyToId;
    if (!params.media) {
      params.media = parsed.mediaUrls?.[0] || parsed.mediaUrl || undefined;
    }

    const mediaUrl = readStringParam(params, "media", { trim: false });
    const gifPlayback = readBooleanParam(params, "gifPlayback") ?? false;
    const bestEffort = readBooleanParam(params, "bestEffort");

    if (!dryRun) {
      const handled = await dispatchChannelMessageAction({
        channel,
        action,
        cfg,
        params,
        accountId: accountId ?? undefined,
        gateway,
        toolContext: input.toolContext,
        dryRun,
      });
      if (handled) {
        return {
          kind: "send",
          channel,
          action,
          to,
          handledBy: "plugin",
          payload: extractToolPayload(handled),
          toolResult: handled,
          dryRun,
        };
      }
    }

    const result: MessageSendResult = await sendMessage({
=======
  const mediaUrl = readStringParam(params, "media", { trim: false });
  const gifPlayback = readBooleanParam(params, "gifPlayback") ?? false;
  const bestEffort = readBooleanParam(params, "bestEffort");
  const send = await executeSendAction({
    ctx: {
>>>>>>> upstream/main
      cfg,
      channel,
      params,
      accountId: accountId ?? undefined,
      gateway,
      toolContext: input.toolContext,
      deps: input.deps,
      dryRun,
      mirror:
        input.sessionKey && !dryRun
          ? {
              sessionKey: input.sessionKey,
              agentId: input.agentId,
            }
          : undefined,
    },
    to,
    message,
    mediaUrl: mediaUrl || undefined,
    gifPlayback,
    bestEffort: bestEffort ?? undefined,
  });

  return {
    kind: "send",
    channel,
    action,
    to,
    handledBy: send.handledBy,
    payload: send.payload,
    toolResult: send.toolResult,
    sendResult: send.sendResult,
    dryRun,
  };
}

async function handlePollAction(ctx: ResolvedActionContext): Promise<MessageActionRunResult> {
  const { cfg, params, channel, accountId, dryRun, gateway, input } = ctx;
  const action: ChannelMessageActionName = "poll";
  const to = readStringParam(params, "to", { required: true });
  const question = readStringParam(params, "pollQuestion", {
    required: true,
  });
  const options = readStringArrayParam(params, "pollOption", { required: true }) ?? [];
  if (options.length < 2) {
    throw new Error("pollOption requires at least two values");
  }
  const allowMultiselect = readBooleanParam(params, "pollMulti") ?? false;
  const durationHours = readNumberParam(params, "pollDurationHours", {
    integer: true,
  });
  const maxSelections = allowMultiselect ? Math.max(2, options.length) : 1;
  const base = typeof params.message === "string" ? params.message : "";
  await maybeApplyCrossContextMarker({
    cfg,
    channel,
    action,
    target: to,
    toolContext: input.toolContext,
    accountId,
    args: params,
    message: base,
    preferEmbeds: true,
  });

  const poll = await executePollAction({
    ctx: {
      cfg,
      channel,
      params,
      accountId: accountId ?? undefined,
      gateway,
      toolContext: input.toolContext,
      dryRun,
    },
    to,
    question,
    options,
    maxSelections,
    durationHours: durationHours ?? undefined,
  });

  return {
    kind: "poll",
    channel,
    action,
    to,
    handledBy: poll.handledBy,
    payload: poll.payload,
    toolResult: poll.toolResult,
    pollResult: poll.pollResult,
    dryRun,
  };
}

async function handlePluginAction(ctx: ResolvedActionContext): Promise<MessageActionRunResult> {
  const { cfg, params, channel, accountId, dryRun, gateway, input } = ctx;
  const action = input.action as Exclude<ChannelMessageActionName, "send" | "poll" | "broadcast">;
  if (dryRun) {
    return {
      kind: "action",
      channel,
      action,
      handledBy: "dry-run",
      payload: { ok: true, dryRun: true, channel, action },
      dryRun: true,
    };
  }

  const handled = await dispatchChannelMessageAction({
    channel,
    action,
    cfg,
    params,
    accountId: accountId ?? undefined,
    gateway,
    toolContext: input.toolContext,
    dryRun,
  });
  if (!handled) {
    throw new Error(`Message action ${action} not supported for channel ${channel}.`);
  }
  return {
    kind: "action",
    channel,
    action,
    handledBy: "plugin",
    payload: extractToolPayload(handled),
    toolResult: handled,
    dryRun,
  };
}

export async function runMessageAction(
  input: RunMessageActionParams,
): Promise<MessageActionRunResult> {
  const cfg = input.cfg;
  const params = { ...input.params };
  parseButtonsParam(params);

  const action = input.action;
  if (action === "broadcast") {
    return handleBroadcastAction(input, params);
  }

  applyTargetToParams({ action, args: params });
  if (actionRequiresTarget(action)) {
    const hasTarget =
      (typeof params.to === "string" && params.to.trim()) ||
      (typeof params.channelId === "string" && params.channelId.trim());
    if (!hasTarget) {
      throw new Error(`Action ${action} requires a target.`);
    }
  }

  const channel = await resolveChannel(cfg, params);
  const accountId = readStringParam(params, "accountId") ?? input.defaultAccountId;
  const dryRun = Boolean(input.dryRun ?? readBooleanParam(params, "dryRun"));

  await resolveActionTarget({
    cfg,
    channel,
    action,
    args: params,
    accountId,
  });

  enforceCrossContextPolicy({
    channel,
    action,
    args: params,
    toolContext: input.toolContext,
    cfg,
  });

  const gateway = resolveGateway(input);

  if (action === "send") {
    return handleSendAction({
      cfg,
      params,
      channel,
      accountId,
      dryRun,
      gateway,
      input,
    });
  }

  if (action === "poll") {
    return handlePollAction({
      cfg,
      params,
      channel,
      accountId,
      dryRun,
      gateway,
      input,
    });
  }

  return handlePluginAction({
    cfg,
    params,
    channel,
    accountId,
    dryRun,
    gateway,
    input,
  });
}
