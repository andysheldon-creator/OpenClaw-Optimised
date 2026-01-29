import crypto from "node:crypto";
import fs from "node:fs";
import { resolveAgentModelFallbacksOverride } from "../../agents/agent-scope.js";
import { runCliAgent } from "../../agents/cli-runner.js";
import { getCliSessionId } from "../../agents/cli-session.js";
import { isCliProvider } from "../../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { logToolEvent } from "../../agents/tool-event-logger.js";
import { runAgentWithUnifiedFailover } from "../../agents/unified-agent-runner.js";
import {
  isCompactionFailureError,
  isContextOverflowError,
  isLikelyContextOverflowError,
  sanitizeUserFacingText,
} from "../../agents/pi-embedded-helpers.js";
import {
  resolveAgentIdFromSessionKey,
  resolveGroupSessionKey,
  resolveSessionTranscriptPath,
  type SessionEntry,
  updateSessionStore,
} from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";
import { emitAgentEvent, registerAgentRunContext } from "../../infra/agent-events.js";
import { defaultRuntime } from "../../runtime.js";
import {
  isMarkdownCapableMessageChannel,
  resolveMessageChannel,
} from "../../utils/message-channel.js";
import { stripHeartbeatToken } from "../heartbeat.js";
import type { TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { buildThreadingToolContext, resolveEnforceFinalTag } from "./agent-runner-utils.js";
import type { BlockReplyPipeline } from "./block-reply-pipeline.js";
import { createPayloadKey } from "./payload-normalization.js";
import type { FollowupRun } from "./queue.js";
import { parseReplyDirectives } from "./reply-directives.js";
import { applyReplyTagsToPayload, isRenderablePayload } from "./reply-payloads.js";
import type { TypingSignaler } from "./typing-mode.js";

export type AgentRunLoopResult =
  | {
      kind: "success";
      runResult: Awaited<ReturnType<typeof runEmbeddedPiAgent>>;
      fallbackProvider?: string;
      fallbackModel?: string;
      didLogHeartbeatStrip: boolean;
      autoCompactionCompleted: boolean;
      /** Payload keys sent directly (not via pipeline) during tool flush. */
      directlySentBlockKeys?: Set<string>;
    }
  | { kind: "final"; payload: ReplyPayload };

export async function runAgentTurnWithFallback(params: {
  commandBody: string;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  opts?: GetReplyOptions;
  typingSignals: TypingSignaler;
  blockReplyPipeline: BlockReplyPipeline | null;
  blockStreamingEnabled: boolean;
  blockReplyChunking?: {
    minChars: number;
    maxChars: number;
    breakPreference: "paragraph" | "newline" | "sentence";
  };
  resolvedBlockStreamingBreak: "text_end" | "message_end";
  applyReplyToMode: (payload: ReplyPayload) => ReplyPayload;
  shouldEmitToolResult: () => boolean;
  shouldEmitToolOutput: () => boolean;
  pendingToolTasks: Set<Promise<void>>;
  resetSessionAfterCompactionFailure: (reason: string) => Promise<boolean>;
  resetSessionAfterRoleOrderingConflict: (reason: string) => Promise<boolean>;
  isHeartbeat: boolean;
  sessionKey?: string;
  getActiveSessionEntry: () => SessionEntry | undefined;
  activeSessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  resolvedVerboseLevel: VerboseLevel;
}): Promise<AgentRunLoopResult> {
  let didLogHeartbeatStrip = false;
  let autoCompactionCompleted = false;
  // Track payloads sent directly (not via pipeline) during tool flush to avoid duplicates.
  const directlySentBlockKeys = new Set<string>();

  const runId = params.opts?.runId ?? crypto.randomUUID();
  params.opts?.onAgentRunStart?.(runId);
  if (params.sessionKey) {
    registerAgentRunContext(runId, {
      sessionKey: params.sessionKey,
      verboseLevel: params.resolvedVerboseLevel,
      isHeartbeat: params.isHeartbeat,
    });
  }
  let runResult: Awaited<ReturnType<typeof runEmbeddedPiAgent>>;
  let fallbackProvider = params.followupRun.run.provider;
  let fallbackModel = params.followupRun.run.model;
  let didResetAfterCompactionFailure = false;

  // Check if primary provider is a CLI provider - these bypass the runtime abstraction
  const primaryIsCliProvider = isCliProvider(
    params.followupRun.run.provider,
    params.followupRun.run.config,
  );

  while (true) {
    try {
      const allowPartialStream = !(
        params.followupRun.run.reasoningLevel === "stream" && params.opts?.onReasoningStream
      );
      const normalizeStreamingText = (payload: ReplyPayload): { text?: string; skip: boolean } => {
        if (!allowPartialStream) return { skip: true };
        let text = payload.text;
        if (!params.isHeartbeat && text?.includes("HEARTBEAT_OK")) {
          const stripped = stripHeartbeatToken(text, {
            mode: "message",
          });
          if (stripped.didStrip && !didLogHeartbeatStrip) {
            didLogHeartbeatStrip = true;
            logVerbose("Stripped stray HEARTBEAT_OK token from reply");
          }
          if (stripped.shouldSkip && (payload.mediaUrls?.length ?? 0) === 0) {
            return { skip: true };
          }
          text = stripped.text;
        }
        if (isSilentReplyText(text, SILENT_REPLY_TOKEN)) {
          return { skip: true };
        }
        if (!text) return { skip: true };
        const sanitized = sanitizeUserFacingText(text);
        if (!sanitized.trim()) return { skip: true };
        return { text: sanitized, skip: false };
      };
      const handlePartialForTyping = async (payload: ReplyPayload): Promise<string | undefined> => {
        const { text, skip } = normalizeStreamingText(payload);
        if (skip || !text) return undefined;
        await params.typingSignals.signalTextDelta(text);
        return text;
      };
      const blockReplyPipeline = params.blockReplyPipeline;
      const onToolResult = params.opts?.onToolResult;

      // CLI provider path - bypass runtime abstraction
      if (primaryIsCliProvider) {
        const startedAt = Date.now();
        emitAgentEvent({
          runId,
          stream: "lifecycle",
          data: {
            phase: "start",
            startedAt,
          },
        });

        params.opts?.onModelSelected?.({
          provider: params.followupRun.run.provider,
          model: params.followupRun.run.model,
          thinkLevel: params.followupRun.run.thinkLevel,
        });

        const cliSessionId = getCliSessionId(
          params.getActiveSessionEntry(),
          params.followupRun.run.provider,
        );

        try {
          runResult = await runCliAgent({
            sessionId: params.followupRun.run.sessionId,
            sessionKey: params.sessionKey,
            sessionFile: params.followupRun.run.sessionFile,
            workspaceDir: params.followupRun.run.workspaceDir,
            config: params.followupRun.run.config,
            prompt: params.commandBody,
            provider: params.followupRun.run.provider,
            model: params.followupRun.run.model,
            thinkLevel: params.followupRun.run.thinkLevel,
            timeoutMs: params.followupRun.run.timeoutMs,
            runId,
            extraSystemPrompt: params.followupRun.run.extraSystemPrompt,
            ownerNumbers: params.followupRun.run.ownerNumbers,
            cliSessionId,
            images: params.opts?.images,
          });

          // CLI backends don't emit streaming assistant events
          const cliText = runResult.payloads?.[0]?.text?.trim();
          if (cliText) {
            emitAgentEvent({
              runId,
              stream: "assistant",
              data: { text: cliText },
            });
          }
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            data: {
              phase: "end",
              startedAt,
              endedAt: Date.now(),
            },
          });

          fallbackProvider = params.followupRun.run.provider;
          fallbackModel = params.followupRun.run.model;
        } catch (err) {
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            data: {
              phase: "error",
              startedAt,
              endedAt: Date.now(),
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      } else {
        // Non-CLI path - use unified runtime with failover
        const threadingContext = buildThreadingToolContext({
          sessionCtx: params.sessionCtx,
          config: params.followupRun.run.config,
          hasRepliedRef: params.opts?.hasRepliedRef,
        });

        const toolResultFormat = (() => {
          const channel = resolveMessageChannel(
            params.sessionCtx.Surface,
            params.sessionCtx.Provider,
          );
          if (!channel) return "markdown" as const;
          return isMarkdownCapableMessageChannel(channel)
            ? ("markdown" as const)
            : ("plain" as const);
        })();

        const unifiedResult = await runAgentWithUnifiedFailover({
          // Core params
          sessionId: params.followupRun.run.sessionId,
          sessionKey: params.sessionKey,
          sessionFile: params.followupRun.run.sessionFile,
          workspaceDir: params.followupRun.run.workspaceDir,
          agentDir: params.followupRun.run.agentDir,
          config: params.followupRun.run.config,
          skillsSnapshot: params.followupRun.run.skillsSnapshot,
          prompt: params.commandBody,
          images: params.opts?.images,
          extraSystemPrompt: params.followupRun.run.extraSystemPrompt,
          provider: params.followupRun.run.provider,
          model: params.followupRun.run.model,
          authProfileId: params.followupRun.run.authProfileId,
          authProfileIdSource: params.followupRun.run.authProfileIdSource,
          thinkLevel: params.followupRun.run.thinkLevel,
          verboseLevel: params.followupRun.run.verboseLevel,
          timeoutMs: params.followupRun.run.timeoutMs,
          runId,
          abortSignal: params.opts?.abortSignal,

          // Messaging context
          messageProvider: params.sessionCtx.Provider?.trim().toLowerCase() || undefined,
          agentAccountId: params.sessionCtx.AccountId,
          messageTo: params.sessionCtx.OriginatingTo ?? params.sessionCtx.To,
          messageThreadId: params.sessionCtx.MessageThreadId ?? undefined,
          groupId: resolveGroupSessionKey(params.sessionCtx)?.id,
          groupChannel:
            params.sessionCtx.GroupChannel?.trim() ?? params.sessionCtx.GroupSubject?.trim(),
          groupSpace: params.sessionCtx.GroupSpace?.trim() ?? undefined,
          ...threadingContext,

          // Sender context
          senderId: params.sessionCtx.SenderId?.trim() || undefined,
          senderName: params.sessionCtx.SenderName?.trim() || undefined,
          senderUsername: params.sessionCtx.SenderUsername?.trim() || undefined,
          senderE164: params.sessionCtx.SenderE164?.trim() || undefined,

          // Generalized fields
          reasoningLevel: params.followupRun.run.reasoningLevel,
          toolResultFormat,
          blockReplyBreak: params.resolvedBlockStreamingBreak,
          blockReplyChunking: params.blockReplyChunking,
          shouldEmitToolResult: params.shouldEmitToolResult,
          shouldEmitToolOutput: params.shouldEmitToolOutput,
          ownerNumbers: params.followupRun.run.ownerNumbers,

          // Sandbox info (minimal version for CCSDK permission mode)
          sandboxInfo: (() => {
            const bashElevated = params.followupRun.run.bashElevated;
            const elevatedAllowed = Boolean(bashElevated?.enabled && bashElevated?.allowed);
            if (!elevatedAllowed) return undefined;
            return {
              enabled: true,
              elevated: {
                allowed: true,
                defaultLevel: bashElevated?.defaultLevel ?? "off",
              },
            };
          })(),

          // Exec tool configuration (shared by both runtimes)
          bashElevated: params.followupRun.run.bashElevated,
          execOverrides: params.followupRun.run.execOverrides,

          // Pi-specific options
          piOptions: {
            enforceFinalTag: resolveEnforceFinalTag(
              params.followupRun.run,
              params.followupRun.run.provider,
            ),
          },

          // Provider session ID for session resumption (CCSDK and CLI providers)
          providerSessionId: (() => {
            const entry = params.getActiveSessionEntry();
            const sessionId = getCliSessionId(entry, "ccsdk");
            logVerbose(
              `[PROVIDER-SESSION] Retrieving provider session ID: ${sessionId ?? "(none)"}, ` +
                `cliSessionIds keys: ${entry?.cliSessionIds ? Object.keys(entry.cliSessionIds).join(", ") : "(none)"}`,
            );
            return sessionId;
          })(),

          // Fallback config
          fallbacksOverride: resolveAgentModelFallbacksOverride(
            params.followupRun.run.config,
            resolveAgentIdFromSessionKey(params.followupRun.run.sessionKey),
          ),

          // Model selection callback
          onModelSelected: ({ provider, model }) => {
            params.opts?.onModelSelected?.({
              provider,
              model,
              thinkLevel: params.followupRun.run.thinkLevel,
            });
          },

          // Streaming callbacks
          onPartialReply: allowPartialStream
            ? async (payload) => {
                const textForTyping = await handlePartialForTyping(payload);
                if (!params.opts?.onPartialReply || textForTyping === undefined) return;
                await params.opts.onPartialReply({
                  text: textForTyping,
                  mediaUrls: payload.mediaUrls,
                });
              }
            : undefined,
          onAssistantMessageStart: async () => {
            await params.typingSignals.signalMessageStart();
          },
          onReasoningStream:
            params.typingSignals.shouldStartOnReasoning || params.opts?.onReasoningStream
              ? async (payload) => {
                  await params.typingSignals.signalReasoningDelta();
                  await params.opts?.onReasoningStream?.({
                    text: payload.text,
                    mediaUrls: payload.mediaUrls,
                  });
                }
              : undefined,
          onAgentEvent: async (evt) => {
            // Log tool events centrally.
            logToolEvent(evt, runId);
            // Trigger typing when tools start executing.
            if (evt.stream === "tool") {
              const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
              if (phase === "start" || phase === "update") {
                await params.typingSignals.signalToolStart();
              }
            }
            // Track auto-compaction completion
            if (evt.stream === "compaction") {
              const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
              const willRetry = Boolean(evt.data.willRetry);
              if (phase === "end" && !willRetry) {
                autoCompactionCompleted = true;
              }
            }
          },
          onBlockReply: params.opts?.onBlockReply
            ? async (payload) => {
                const { text, skip } = normalizeStreamingText(payload);
                const hasPayloadMedia = (payload.mediaUrls?.length ?? 0) > 0;
                if (skip && !hasPayloadMedia) return;
                const currentMessageId =
                  params.sessionCtx.MessageSidFull ?? params.sessionCtx.MessageSid;
                const taggedPayload = applyReplyTagsToPayload(
                  {
                    text,
                    mediaUrls: payload.mediaUrls,
                    mediaUrl: payload.mediaUrls?.[0],
                    replyToId: payload.replyToId,
                    replyToTag: payload.replyToTag,
                    replyToCurrent: payload.replyToCurrent,
                  },
                  currentMessageId,
                );
                if (!isRenderablePayload(taggedPayload) && !payload.audioAsVoice) return;
                const parsed = parseReplyDirectives(taggedPayload.text ?? "", {
                  currentMessageId,
                  silentToken: SILENT_REPLY_TOKEN,
                });
                const cleaned = parsed.text || undefined;
                const hasRenderableMedia =
                  Boolean(taggedPayload.mediaUrl) || (taggedPayload.mediaUrls?.length ?? 0) > 0;
                if (
                  !cleaned &&
                  !hasRenderableMedia &&
                  !payload.audioAsVoice &&
                  !parsed.audioAsVoice
                )
                  return;
                if (parsed.isSilent && !hasRenderableMedia) return;

                const blockPayload: ReplyPayload = params.applyReplyToMode({
                  ...taggedPayload,
                  text: cleaned,
                  audioAsVoice: Boolean(parsed.audioAsVoice || payload.audioAsVoice),
                  replyToId: taggedPayload.replyToId ?? parsed.replyToId,
                  replyToTag: taggedPayload.replyToTag || parsed.replyToTag,
                  replyToCurrent: taggedPayload.replyToCurrent || parsed.replyToCurrent,
                });

                void params.typingSignals
                  .signalTextDelta(cleaned ?? taggedPayload.text)
                  .catch((err) => {
                    logVerbose(`block reply typing signal failed: ${String(err)}`);
                  });

                if (params.blockStreamingEnabled && params.blockReplyPipeline) {
                  params.blockReplyPipeline.enqueue(blockPayload);
                } else {
                  // Direct send: either block streaming enabled without pipeline,
                  // or block streaming disabled with callback (e.g., CCSDK runtime).
                  directlySentBlockKeys.add(createPayloadKey(blockPayload));
                  await params.opts?.onBlockReply?.(blockPayload);
                }
              }
            : undefined,
          onBlockReplyFlush:
            params.blockStreamingEnabled && blockReplyPipeline
              ? async () => {
                  await blockReplyPipeline.flush({ force: true });
                }
              : params.opts?.onBlockReply
                ? async () => {
                    // No-op flush when block reply callback was provided but no pipeline.
                    // This signals message completion to runtimes like CCSDK.
                  }
                : undefined,
          onToolResult: onToolResult
            ? (payload) => {
                const task = (async () => {
                  const { text, skip } = normalizeStreamingText(payload);
                  if (skip) return;
                  await params.typingSignals.signalTextDelta(text);
                  await onToolResult({
                    text,
                    mediaUrls: payload.mediaUrls,
                  });
                })()
                  .catch((err) => {
                    logVerbose(`tool result delivery failed: ${String(err)}`);
                  })
                  .finally(() => {
                    params.pendingToolTasks.delete(task);
                  });
                params.pendingToolTasks.add(task);
              }
            : undefined,
        });

        runResult = unifiedResult.result;
        fallbackProvider = unifiedResult.provider;
        fallbackModel = unifiedResult.model;
      }

      // Some embedded runs surface context overflow as an error payload instead of throwing.
      const embeddedError = runResult.meta?.error;
      if (
        embeddedError &&
        isContextOverflowError(embeddedError.message) &&
        !didResetAfterCompactionFailure &&
        (await params.resetSessionAfterCompactionFailure(embeddedError.message))
      ) {
        didResetAfterCompactionFailure = true;
        return {
          kind: "final",
          payload: {
            text: "⚠️ Context limit exceeded. I've reset our conversation to start fresh - please try again.\n\nTo prevent this, increase your compaction buffer by setting `agents.defaults.compaction.reserveTokensFloor` to 4000 or higher in your config.",
          },
        };
      }
      if (embeddedError?.kind === "role_ordering") {
        const didReset = await params.resetSessionAfterRoleOrderingConflict(embeddedError.message);
        if (didReset) {
          return {
            kind: "final",
            payload: {
              text: "⚠️ Message ordering conflict. I've reset the conversation - please try again.",
            },
          };
        }
      }

      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isContextOverflow = isLikelyContextOverflowError(message);
      const isCompactionFailure = isCompactionFailureError(message);
      const isSessionCorruption = /function call turn comes immediately after/i.test(message);
      const isRoleOrderingError = /incorrect role information|roles must alternate/i.test(message);

      if (
        isCompactionFailure &&
        !didResetAfterCompactionFailure &&
        (await params.resetSessionAfterCompactionFailure(message))
      ) {
        didResetAfterCompactionFailure = true;
        return {
          kind: "final",
          payload: {
            text: "⚠️ Context limit exceeded during compaction. I've reset our conversation to start fresh - please try again.\n\nTo prevent this, increase your compaction buffer by setting `agents.defaults.compaction.reserveTokensFloor` to 4000 or higher in your config.",
          },
        };
      }
      if (isRoleOrderingError) {
        const didReset = await params.resetSessionAfterRoleOrderingConflict(message);
        if (didReset) {
          return {
            kind: "final",
            payload: {
              text: "⚠️ Message ordering conflict. I've reset the conversation - please try again.",
            },
          };
        }
      }

      // Auto-recover from Gemini session corruption by resetting the session
      if (
        isSessionCorruption &&
        params.sessionKey &&
        params.activeSessionStore &&
        params.storePath
      ) {
        const sessionKey = params.sessionKey;
        const corruptedSessionId = params.getActiveSessionEntry()?.sessionId;
        defaultRuntime.error(
          `Session history corrupted (Gemini function call ordering). Resetting session: ${params.sessionKey}`,
        );

        try {
          if (corruptedSessionId) {
            const transcriptPath = resolveSessionTranscriptPath(corruptedSessionId);
            try {
              fs.unlinkSync(transcriptPath);
            } catch {
              // Ignore if file doesn't exist
            }
          }

          delete params.activeSessionStore[sessionKey];

          await updateSessionStore(params.storePath, (store) => {
            delete store[sessionKey];
          });
        } catch (cleanupErr) {
          defaultRuntime.error(
            `Failed to reset corrupted session ${params.sessionKey}: ${String(cleanupErr)}`,
          );
        }

        return {
          kind: "final",
          payload: {
            text: "⚠️ Session history was corrupted. I've reset the conversation - please try again!",
          },
        };
      }

      defaultRuntime.error(`Embedded agent failed before reply: ${message}`);
      const trimmedMessage = message.replace(/\.\s*$/, "");
      const fallbackText = isContextOverflow
        ? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model."
        : isRoleOrderingError
          ? "⚠️ Message ordering conflict - please try again. If this persists, use /new to start a fresh session."
          : `⚠️ Agent failed before reply: ${trimmedMessage}.\nLogs: moltbot logs --follow`;

      return {
        kind: "final",
        payload: {
          text: fallbackText,
        },
      };
    }
  }

  return {
    kind: "success",
    runResult,
    fallbackProvider,
    fallbackModel,
    didLogHeartbeatStrip,
    autoCompactionCompleted,
    directlySentBlockKeys: directlySentBlockKeys.size > 0 ? directlySentBlockKeys : undefined,
  };
}
