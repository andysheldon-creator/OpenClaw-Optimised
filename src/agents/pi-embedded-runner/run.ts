import fs from "node:fs/promises";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import { enqueueCommandInLane } from "../../process/command-queue.js";
import { resolveUserPath } from "../../utils.js";
import { isMarkdownCapableMessageChannel } from "../../utils/message-channel.js";
import { resolveMoltbotAgentDir } from "../agent-paths.js";
import path from "node:path";
import {
  isProfileInCooldown,
  markAuthProfileFailure,
  markAuthProfileGood,
  markAuthProfileUsed,
} from "../auth-profiles.js";
import {
  CONTEXT_WINDOW_HARD_MIN_TOKENS,
  CONTEXT_WINDOW_WARN_BELOW_TOKENS,
  evaluateContextWindowGuard,
  resolveContextWindowInfo,
} from "../context-window-guard.js";
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MODEL, DEFAULT_PROVIDER } from "../defaults.js";
import { FailoverError, resolveFailoverStatus } from "../failover-error.js";
import {
  ensureAuthProfileStore,
  getApiKeyForModel,
  resolveAuthProfileOrder,
  type ResolvedProviderAuth,
} from "../model-auth.js";
import { normalizeProviderId } from "../model-selection.js";
import { ensureMoltbotModelsJson } from "../models-config.js";
import {
  classifyFailoverReason,
  formatAssistantErrorText,
  isAuthAssistantError,
  isCompactionFailureError,
  isContextOverflowError,
  isFailoverAssistantError,
  isFailoverErrorMessage,
  parseImageDimensionError,
  isRateLimitAssistantError,
  isTimeoutErrorMessage,
  pickFallbackThinkingLevel,
  type FailoverReason,
} from "../pi-embedded-helpers.js";
import { normalizeUsage, type UsageLike } from "../usage.js";
import { resolveSessionAgentId, resolveAgentConfig } from "../agent-scope.js";
import {
  loadWorkspaceBootstrapFiles,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_SOUL_FILENAME,
} from "../workspace.js";

import { streamSimple } from "@mariozechner/pi-ai";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import { resolveCompactionReserveTokensFloor } from "../pi-settings.js";

import { compactEmbeddedPiSessionDirect } from "./compact.js";
import { resolveGlobalLane, resolveSessionLane } from "./lanes.js";
import { log } from "./logger.js";
import { resolveModel } from "./model.js";
import { runEmbeddedAttempt } from "./run/attempt.js";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { limitHistoryTurns, getDmHistoryLimitFromSessionKey } from "./history.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";
import { buildEmbeddedRunPayloads } from "./run/payloads.js";
import type { EmbeddedPiAgentMeta, EmbeddedPiRunResult } from "./types.js";
import { describeUnknownError } from "./utils.js";

type ApiKeyInfo = ResolvedProviderAuth;

// Avoid Anthropic's refusal test token poisoning session transcripts.
const ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL = "ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL";
const ANTHROPIC_MAGIC_STRING_REPLACEMENT = "ANTHROPIC MAGIC STRING TRIGGER REFUSAL (redacted)";

function scrubAnthropicRefusalMagic(prompt: string): string {
  if (!prompt.includes(ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL)) return prompt;
  return prompt.replaceAll(
    ANTHROPIC_MAGIC_STRING_TRIGGER_REFUSAL,
    ANTHROPIC_MAGIC_STRING_REPLACEMENT,
  );
}

export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
  const globalLane = resolveGlobalLane(params.lane);
  const enqueueGlobal =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
  const enqueueSession =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(sessionLane, task, opts));
  const channelHint = params.messageChannel ?? params.messageProvider;
  const resolvedToolResultFormat =
    params.toolResultFormat ??
    (channelHint
      ? isMarkdownCapableMessageChannel(channelHint)
        ? "markdown"
        : "plain"
      : "markdown");
  const isProbeSession = params.sessionId?.startsWith("probe-") ?? false;

  return enqueueSession(() =>
    enqueueGlobal(async () => {
      const resolvedWorkspace = resolveUserPath(params.workspaceDir);
      const prevCwd = process.cwd();

      const provider = (params.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
      const modelId = (params.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
      const agentDir = params.agentDir ?? resolveMoltbotAgentDir();
      await ensureMoltbotModelsJson(params.config, agentDir);

      const { model, error, authStorage, modelRegistry } = resolveModel(
        provider,
        modelId,
        agentDir,
        params.config,
      );
      if (!model) {
        return {
          ok: false,
          error: error ?? `Unknown model: ${provider}/${modelId}`,
          meta: {} as any,
        };
      }

      try {
        const apiKeyInfo = await getApiKeyForModel({
          model,
          cfg: params.config,
          profileId: params.authProfileId,
          agentDir,
        });

        if (!apiKeyInfo.apiKey && apiKeyInfo.mode !== "aws-sdk") {
          throw new Error(
            `No API key resolved for provider "${model.provider}" (auth mode: ${apiKeyInfo.mode}).`,
          );
        }

        let runtimeApiKey = apiKeyInfo.apiKey;
        if (model.provider === "github-copilot" && apiKeyInfo.apiKey) {
          const { resolveCopilotApiToken } =
            await import("../../providers/github-copilot-token.js");
          const copilotToken = await resolveCopilotApiToken({
            githubToken: apiKeyInfo.apiKey,
          });
          runtimeApiKey = copilotToken.token;
          authStorage.setRuntimeApiKey(model.provider, runtimeApiKey);
        } else if (apiKeyInfo.apiKey) {
          authStorage.setRuntimeApiKey(model.provider, apiKeyInfo.apiKey);
        }

        const mindConfig = params.config?.plugins?.entries?.["mind-memory"] as any;
        const debug = !!mindConfig?.config?.debug;

        // Create a lightweight LLM client for the subconscious (reusable for consolidation)
        const subconsciousAgent: {
          complete: (prompt: string) => Promise<{ text: string | null }>;
          autoBootstrapHistory?: boolean;
        } = {
          complete: async (prompt: string) => {
            let fullText = "";
            try {
              const key = (runtimeApiKey || apiKeyInfo.apiKey) as string;
              if (!key) return { text: "" };
              const stream = streamSimple(
                model,
                {
                  messages: [{ role: "user", content: prompt, timestamp: Date.now() } as any],
                  temperature: 0, // Force deterministic output to avoid loops
                } as any,
                {
                  apiKey: key,
                },
              );
              if (debug)
                process.stderr.write(`  🧩 [DEBUG] Subconscious stream open (${modelId})... `);
              for await (const chunk of stream) {
                const ch = chunk as any;
                let text = "";

                // SIMPLIFIED LOGIC (User Request): Trust provider 'content' or 'text' fully if present.
                // No complex deduplication or startWith checks.
                if (ch.content) {
                  fullText = ch.content;
                } else if (ch.text) {
                  fullText = ch.text;
                } else if (ch.delta?.text) {
                  text = ch.delta.text;
                } else if (typeof ch.delta === "string") {
                  text = ch.delta;
                } else if (ch.delta?.content?.[0]?.text) {
                  text = ch.delta.content[0].text;
                } else if (ch.partial?.content?.[0]?.text) {
                  text = ch.partial.content[0].text;
                }

                if (text) {
                  fullText += text;
                }
              }
              if (debug && fullText.length > 0) process.stderr.write("\n");
            } catch (e: any) {
              if (debug)
                process.stderr.write(`  ❌ [DEBUG] Subconscious LLM error: ${e.message}\n`);
            }
            return { text: fullText };
          },
          autoBootstrapHistory: mindConfig?.config?.narrative?.autoBootstrapHistory ?? false,
        };

        const agentId = resolveSessionAgentId({
          sessionKey: params.sessionKey,
          config: params.config,
        });
        const agentConfig = resolveAgentConfig(params.config ?? {}, agentId);

        // Resolve identity context for narrative updates
        let identityContext = "";
        try {
          const bootstrapFiles = await loadWorkspaceBootstrapFiles(resolvedWorkspace);
          const identityFile = bootstrapFiles.find((f) => f.name === DEFAULT_IDENTITY_FILENAME);
          const soulFile = bootstrapFiles.find((f) => f.name === DEFAULT_SOUL_FILENAME);

          const identityParts: string[] = [];
          if (identityFile && !identityFile.missing && identityFile.content) {
            identityParts.push(`IDENTITY:\n${identityFile.content}`);
          }
          if (soulFile && !soulFile.missing && soulFile.content) {
            identityParts.push(`SOUL:\n${soulFile.content}`);
          }
          if (agentConfig?.identity) {
            identityParts.push(`CONFIG IDENTITY: ${agentConfig.identity}`);
          }

          identityContext = identityParts.join("\n\n").trim();
        } catch (e: any) {
          if (debug)
            process.stderr.write(`  ⚠️ [DEBUG] Failed to load identity context: ${e.message}\n`);
        }

        let finalExtraSystemPrompt = params.extraSystemPrompt ?? "";
        let narrativeStory: { content: string; updatedAt: Date } | null = null;
        const storyPath = path.join(resolvedWorkspace, "STORY.md");
        const isMindEnabled =
          mindConfig?.enabled && (mindConfig?.config?.narrative?.enabled ?? true);
        const tokenThreshold = mindConfig?.config?.narrative?.tokenThreshold ?? 5000;

        // HEARTBEAT DETECTION (Incoming)
        const isHeartbeatPrompt =
          params.prompt.includes("Read HEARTBEAT.md") &&
          params.prompt.includes("reply HEARTBEAT_OK");

        try {
          if (isMindEnabled) {
            if (debug)
              process.stderr.write(
                `🧠 [MIND] Starting modular subconscious pipeline (Model: ${modelId})...\n`,
              );

            const { GraphService } = await import("../../services/memory/GraphService.js");
            const { SubconsciousService } =
              await import("../../services/memory/SubconsciousService.js");
            const { ConsolidationService } =
              await import("../../services/memory/ConsolidationService.js");

            const gUrl = (mindConfig?.config as any)?.graphiti?.baseUrl || "http://localhost:8001";
            const gs = new GraphService(gUrl, debug);
            const sub = new SubconsciousService(gs, debug);
            const cons = new ConsolidationService(gs, debug);
            const globalSessionId = "global-user-memory";

            if (!isHeartbeatPrompt) {
              // 1. Storage & Consolidation (Only for real messages)
              const memoryDir = path.join(path.dirname(storyPath), "memory");
              const sessionMgr = SessionManager.open(params.sessionFile);
              const sessionMessages = sessionMgr.buildSessionContext().messages || [];

              // Bootstrap historical episodes
              await cons.bootstrapHistoricalEpisodes(params.sessionId, memoryDir, sessionMessages);

              // Consolidation Check
              const contextInfo = resolveContextWindowInfo({
                cfg: params.config,
                provider,
                modelId,
                defaultTokens: DEFAULT_CONTEXT_TOKENS,
              });
              const safeTokenLimit = Math.floor(contextInfo.tokens * 0.5);
              await cons.checkAndConsolidate(
                params.sessionId,
                subconsciousAgent,
                storyPath,
                sessionMessages,
                identityContext,
                safeTokenLimit,
                tokenThreshold,
              );

              // Persist User Message
              if (debug)
                process.stderr.write(
                  `Tape [GRAPH] Storing episode for Global ID: ${globalSessionId} (Trace: ${params.sessionId})\n`,
                );
              await gs.addEpisode(globalSessionId, `human: ${params.prompt}`);
              await cons.trackPendingEpisode(path.dirname(storyPath), `human: ${params.prompt}`);
            } else {
              if (debug)
                process.stderr.write(
                  `💓 [MIND] Heartbeat detected - skipping memory storage & consolidation.\n`,
                );
            }

            // 2. Fetch Narrative Story (ALWAYS, even for heartbeats)
            try {
              const storyContent = await fs.readFile(storyPath, "utf-8").catch(() => null);
              if (storyContent) {
                narrativeStory = { content: storyContent, updatedAt: new Date() };
                if (debug)
                  process.stderr.write(
                    `📖 [MIND] Local Story retrieved (${storyContent.length} chars)\n`,
                  );
              }
            } catch (e: any) {
              if (debug)
                process.stderr.write(`⚠️ [MIND] Failed to read local story: ${e.message}\n`);
            }

            // 3. Get Flashbacks (Only for real messages)
            if (!isHeartbeatPrompt) {
              let oldestContextTimestamp: Date | undefined;
              let rawHistory: any[] = [];
              try {
                const tempSessionManager = SessionManager.open(params.sessionFile);
                const branch = tempSessionManager.getBranch();

                rawHistory = branch
                  .filter((e) => e.type === "message")
                  .map((e: any) => ({
                    role: e.message?.role,
                    text: e.message?.text || e.message?.content,
                    timestamp: e.timestamp,
                  }));

                const contextMessages = tempSessionManager.buildSessionContext().messages || [];
                if (contextMessages.length > 0) {
                  const limit = getDmHistoryLimitFromSessionKey(params.sessionKey, params.config);
                  const limited = limitHistoryTurns(contextMessages, limit);
                  if (limited.length > 0 && (limited[0] as any).timestamp) {
                    oldestContextTimestamp = new Date((limited[0] as any).timestamp);
                  }
                }
              } catch (e) {}

              const flashbacks = await sub.getFlashback(
                globalSessionId, // STRICTLY use global-user-memory
                params.prompt,
                subconsciousAgent,
                oldestContextTimestamp,
                rawHistory,
              );

              if (flashbacks) {
                if (debug)
                  process.stderr.write("✨ [MIND] Memories injected into system prompt.\n");
                finalExtraSystemPrompt += flashbacks;
              }
            } else {
              if (debug)
                process.stderr.write(
                  `💓 [MIND] Heartbeat detected - skipping resonance retrieval.\n`,
                );
            }
          }
        } catch (e: any) {
          process.stderr.write(`❌ [MIND] Subconscious error: ${e.message}\n`);
        }

        const startTime = Date.now();
        let attemptResult: any;
        let retryCount = 0;
        const maxRetries = 1;

        while (retryCount <= maxRetries) {
          try {
            process.stderr.write(
              retryCount > 0
                ? "🔄 [MIND] Retrying after compaction...\n"
                : "🤖 [MIND] Calling LLM...\n",
            );
            attemptResult = await runEmbeddedAttempt({
              runId: params.runId,
              sessionId: params.sessionId,
              sessionKey: params.sessionKey,
              provider,
              modelId,
              model,
              authStorage,
              modelRegistry,
              sessionFile: params.sessionFile,
              workspaceDir: resolvedWorkspace,
              agentDir,
              config: params.config,
              prompt: params.prompt,
              images: params.images,
              extraSystemPrompt: finalExtraSystemPrompt,
              narrativeStory: narrativeStory?.content || "",
              thinkLevel: params.thinkLevel ?? "low",
              verboseLevel: params.verboseLevel,
              reasoningLevel: params.reasoningLevel,
              toolResultFormat: resolvedToolResultFormat,
              timeoutMs: params.timeoutMs,
              abortSignal: params.abortSignal,
              onPartialReply: (payload) => {
                if (payload.text) process.stderr.write("✍️");
                params.onPartialReply?.(payload);
              },
              onAssistantMessageStart: params.onAssistantMessageStart,
              onBlockReply: params.onBlockReply,
              onBlockReplyFlush: params.onBlockReplyFlush,
              blockReplyBreak: params.blockReplyBreak,
              blockReplyChunking: params.blockReplyChunking,
              onReasoningStream: params.onReasoningStream,
              onToolResult: params.onToolResult,
              onAgentEvent: params.onAgentEvent,
              streamParams: params.streamParams,
              ownerNumbers: params.ownerNumbers,
              enforceFinalTag: params.enforceFinalTag,
            });

            // Check for context overflow in promptError (returned by attempt)
            if (attemptResult.promptError && isContextOverflowError(attemptResult.promptError)) {
              if (retryCount < maxRetries) {
                if (debug)
                  process.stderr.write(
                    `⚠️ [MIND] Context overflow detected! Triggering compaction...\n`,
                  );
                await compactEmbeddedPiSessionDirect({
                  sessionFile: params.sessionFile,
                  sessionId: params.sessionId,
                  sessionKey: params.sessionKey,
                  config: params.config,
                  agentDir,
                  authProfileId: params.authProfileId,
                  model: modelId,
                  provider,
                  workspaceDir: resolvedWorkspace,
                });
                retryCount++;
                continue;
              }
            }

            break;
          } catch (err: any) {
            if (isContextOverflowError(err) && retryCount < maxRetries) {
              if (debug)
                process.stderr.write(
                  `⚠️ [MIND] Context overflow caught! Triggering compaction...\n`,
                );
              await compactEmbeddedPiSessionDirect({
                sessionFile: params.sessionFile,
                sessionId: params.sessionId,
                sessionKey: params.sessionKey,
                config: params.config,
                agentDir,
                authProfileId: params.authProfileId,
                model: modelId,
                provider,
                workspaceDir: resolvedWorkspace,
              });
              retryCount++;
              continue;
            }
            throw err;
          }
        }

        process.stderr.write("\n✅ [MIND] Response finished.\n");

        // Token & History Analysis
        try {
          const messageCount = (attemptResult.messagesSnapshot || []).length;
          const totalTokens = (attemptResult.messagesSnapshot || []).reduce(
            (acc: number, msg: any) => acc + estimateTokens(msg),
            0,
          );
          const floor = resolveCompactionReserveTokensFloor(params.config);
          if (debug)
            process.stderr.write(
              `📊 [DEBUG] History: ${messageCount} messages, ~${totalTokens.toLocaleString()} tokens (Floor: ${floor.toLocaleString()})\n`,
            );
        } catch (e) {
          if (debug) process.stderr.write(`📊 [DEBUG] Stats analysis failed\n`);
        }

        // MIND INTEGRATION v1.0: Persist Assistant Message & Consolidate
        try {
          if (isMindEnabled) {
            const assistantText = attemptResult.assistantTexts.join("\n").trim();
            const isHeartbeatResponse = assistantText === "HEARTBEAT_OK";

            if (!isHeartbeatPrompt && !isHeartbeatResponse) {
              if (assistantText) {
                const { GraphService } = await import("../../services/memory/GraphService.js");
                const { ConsolidationService } =
                  await import("../../services/memory/ConsolidationService.js");

                const gUrl =
                  (mindConfig?.config as any)?.graphiti?.baseUrl || "http://localhost:8001";
                const gs = new GraphService(gUrl, debug);
                const cons = new ConsolidationService(gs, debug);

                await gs.addEpisode("global-user-memory", `assistant: ${assistantText}`);
                await cons.trackPendingEpisode(
                  path.dirname(storyPath),
                  `assistant: ${assistantText}`,
                );
              }
            } else if (isHeartbeatResponse) {
              if (debug)
                process.stderr.write(
                  `💓 [MIND] Heartbeat response detected - skipping memory storage.\n`,
                );
            }
          }
        } catch (e: any) {
          process.stderr.write(`❌ [MIND] Consolidation / Persistence error: ${e.message}\n`);
        }

        return {
          payloads: buildEmbeddedRunPayloads(attemptResult),
          meta: {
            durationMs: Date.now() - startTime,
            agentMeta: {
              sessionId: params.sessionId,
              provider,
              model: modelId,
            },
            systemPromptReport: attemptResult.systemPromptReport,
            stopReason: attemptResult.lastAssistant?.stopReason,
          },
          didSendViaMessagingTool: attemptResult.didSendViaMessagingTool,
          messagingToolSentTexts: attemptResult.messagingToolSentTexts,
          messagingToolSentTargets: attemptResult.messagingToolSentTargets,
        };
      } catch (err: any) {
        return {
          meta: {
            durationMs: 0,
            agentMeta: {
              sessionId: params.sessionId,
              provider,
              model: modelId,
            },
            error: {
              kind: isContextOverflowError(err) ? "context_overflow" : "compaction_failure",
              message: describeUnknownError(err),
            },
          },
        } as any;
      } finally {
        process.chdir(prevCwd);
      }
    }),
  );
}
