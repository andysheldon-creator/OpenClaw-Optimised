import type { ClawdbotConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import type { RuntimeEnv } from "../../runtime.js";
import { synthesizeReplyAudio } from "../audio-reply.js";
import { getReplyFromConfig } from "../reply.js";
import type { MsgContext } from "../templating.js";
import { isAudio } from "../transcription.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { tryFastAbortFromMessage } from "./abort.js";
import { shouldSkipDuplicateInbound } from "./inbound-dedupe.js";
import type { ReplyDispatcher, ReplyDispatchKind } from "./reply-dispatcher.js";
import { isRoutableChannel, routeReply } from "./route-reply.js";

export type DispatchFromConfigResult = {
  queuedFinal: boolean;
  counts: Record<ReplyDispatchKind, number>;
};

export async function dispatchReplyFromConfig(params: {
  ctx: MsgContext;
  cfg: ClawdbotConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof getReplyFromConfig;
  /** Runtime for error logging. Required for voice synthesis. */
  runtime?: RuntimeEnv;
}): Promise<DispatchFromConfigResult> {
  const { ctx, cfg, dispatcher, runtime } = params;

  if (shouldSkipDuplicateInbound(ctx)) {
    return { queuedFinal: false, counts: dispatcher.getQueuedCounts() };
  }

  // Check if we should route replies to originating channel instead of dispatcher.
  // Only route when the originating channel is DIFFERENT from the current surface.
  // This handles cross-provider routing (e.g., message from Telegram being processed
  // by a shared session that's currently on Slack) while preserving normal dispatcher
  // flow when the provider handles its own messages.
  //
  // Debug: `pnpm test src/auto-reply/reply/dispatch-from-config.test.ts`
  const originatingChannel = ctx.OriginatingChannel;
  const originatingTo = ctx.OriginatingTo;
  const currentSurface = (ctx.Surface ?? ctx.Provider)?.toLowerCase();
  const shouldRouteToOriginating =
    isRoutableChannel(originatingChannel) &&
    originatingTo &&
    originatingChannel !== currentSurface;

  /**
   * Helper to send a payload via route-reply (async).
   * Only used when actually routing to a different provider.
   * Note: Only called when shouldRouteToOriginating is true, so
   * originatingChannel and originatingTo are guaranteed to be defined.
   */
  const sendPayloadAsync = async (
    payload: ReplyPayload,
    abortSignal?: AbortSignal,
  ): Promise<void> => {
    // TypeScript doesn't narrow these from the shouldRouteToOriginating check,
    // but they're guaranteed non-null when this function is called.
    if (!originatingChannel || !originatingTo) return;
    if (abortSignal?.aborted) return;
    const result = await routeReply({
      payload,
      channel: originatingChannel,
      to: originatingTo,
      sessionKey: ctx.SessionKey,
      accountId: ctx.AccountId,
      threadId: ctx.MessageThreadId,
      cfg,
      abortSignal,
    });
    if (!result.ok) {
      logVerbose(
        `dispatch-from-config: route-reply failed: ${result.error ?? "unknown error"}`,
      );
    }
  };

  const fastAbort = await tryFastAbortFromMessage({ ctx, cfg });
  if (fastAbort.handled) {
    const payload = { text: "⚙️ Agent was aborted." } satisfies ReplyPayload;
    let queuedFinal = false;
    let routedFinalCount = 0;
    if (shouldRouteToOriginating && originatingChannel && originatingTo) {
      const result = await routeReply({
        payload,
        channel: originatingChannel,
        to: originatingTo,
        sessionKey: ctx.SessionKey,
        accountId: ctx.AccountId,
        threadId: ctx.MessageThreadId,
        cfg,
      });
      queuedFinal = result.ok;
      if (result.ok) routedFinalCount += 1;
      if (!result.ok) {
        logVerbose(
          `dispatch-from-config: route-reply (abort) failed: ${result.error ?? "unknown error"}`,
        );
      }
    } else {
      queuedFinal = dispatcher.sendFinalReply(payload);
    }
    await dispatcher.waitForIdle();
    const counts = dispatcher.getQueuedCounts();
    counts.final += routedFinalCount;
    return { queuedFinal, counts };
  }

  const replyResult = await (params.replyResolver ?? getReplyFromConfig)(
    ctx,
    {
      ...params.replyOptions,
      onToolResult: (payload: ReplyPayload) => {
        if (shouldRouteToOriginating) {
          // Fire-and-forget for streaming tool results when routing.
          void sendPayloadAsync(payload);
        } else {
          // Synchronous dispatch to preserve callback timing.
          dispatcher.sendToolResult(payload);
        }
      },
      onBlockReply: (payload: ReplyPayload, context) => {
        if (shouldRouteToOriginating) {
          // Await routed sends so upstream can enforce ordering/timeouts.
          return sendPayloadAsync(payload, context?.abortSignal);
        } else {
          // Synchronous dispatch to preserve callback timing.
          dispatcher.sendBlockReply(payload);
        }
      },
    },
    cfg,
  );

  const replies = replyResult
    ? Array.isArray(replyResult)
      ? replyResult
      : [replyResult]
    : [];

  let queuedFinal = false;
  let routedFinalCount = 0;
  for (const reply of replies) {
    if (shouldRouteToOriginating && originatingChannel && originatingTo) {
      // Route final reply to originating channel.
      const result = await routeReply({
        payload: reply,
        channel: originatingChannel,
        to: originatingTo,
        sessionKey: ctx.SessionKey,
        accountId: ctx.AccountId,
        threadId: ctx.MessageThreadId,
        cfg,
      });
      if (!result.ok) {
        logVerbose(
          `dispatch-from-config: route-reply (final) failed: ${result.error ?? "unknown error"}`,
        );
      }
      queuedFinal = result.ok || queuedFinal;
      if (result.ok) routedFinalCount += 1;
    } else {
      queuedFinal = dispatcher.sendFinalReply(reply) || queuedFinal;
    }
  }
  await dispatcher.waitForIdle();

  // Generic voice reply synthesis: if inbound was audio and we have accumulated
  // text without media, synthesize voice and send it.
  // This makes voice reply work across all providers (WhatsApp, Telegram, etc.).
  const accumulatedText = dispatcher.getAccumulatedText().trim();
  const shouldSynthesizeVoice =
    runtime &&
    isAudio(ctx.MediaType) &&
    accumulatedText &&
    !dispatcher.hasDispatchedMedia() &&
    cfg.audio?.reply?.command?.length;

  if (shouldSynthesizeVoice) {
    const audioReply = await synthesizeReplyAudio({
      cfg,
      ctx,
      replyText: accumulatedText,
      runtime,
    });
    if (audioReply?.mediaUrls?.length) {
      const voicePayload: ReplyPayload = {
        mediaUrls: audioReply.mediaUrls,
        mediaUrl: audioReply.mediaUrls[0],
        audioAsVoice: audioReply.audioAsVoice ?? true,
      };
      if (shouldRouteToOriginating && originatingChannel && originatingTo) {
        const result = await routeReply({
          payload: voicePayload,
          channel: originatingChannel,
          to: originatingTo,
          sessionKey: ctx.SessionKey,
          accountId: ctx.AccountId,
          threadId: ctx.MessageThreadId,
          cfg,
        });
        if (result.ok) {
          queuedFinal = true;
          routedFinalCount += 1;
        }
      } else {
        queuedFinal = dispatcher.sendFinalReply(voicePayload) || queuedFinal;
      }
      await dispatcher.waitForIdle();
      logVerbose("dispatch-from-config: synthesized voice reply");
    }
  }

  const counts = dispatcher.getQueuedCounts();
  counts.final += routedFinalCount;
  return { queuedFinal, counts };
}
