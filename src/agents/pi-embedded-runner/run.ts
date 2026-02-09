import { SessionManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import path from "node:path";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";
import type { EmbeddedPiAgentMeta, EmbeddedPiRunResult } from "./types.js";
import { type OpenClawConfig } from "../../config/types.js";
import { enqueueCommandInLane } from "../../process/command-queue.js";
import { isSubagentSessionKey } from "../../routing/session-key.js";
import { isMarkdownCapableMessageChannel } from "../../utils/message-channel.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { resolveSessionAgentId, resolveAgentConfig } from "../agent-scope.js";
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
import { ensureOpenClawModelsJson } from "../models-config.js";
import {
  BILLING_ERROR_USER_MESSAGE,
  classifyFailoverReason,
  formatAssistantErrorText,
  isAuthAssistantError,
  isBillingAssistantError,
  isCompactionFailureError,
  isContextOverflowError,
  isFailoverErrorMessage,
  isRateLimitAssistantError,
  isTimeoutErrorMessage,
  parseImageSizeError,
  pickFallbackThinkingLevel,
  type FailoverReason,
} from "../pi-embedded-helpers.js";
import { normalizeUsage, type UsageLike } from "../usage.js";
import { redactRunIdentifier, resolveRunWorkspaceDir } from "../workspace-run.js";
import {
  loadWorkspaceBootstrapFiles,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_SOUL_FILENAME,
} from "../workspace.js";
import { compactEmbeddedPiSessionDirect } from "./compact.js";
import { log } from "./logger.js";
import { resolveModel } from "./model.js";
import { runEmbeddedAttempt } from "./run/attempt.js";
import { buildEmbeddedRunPayloads } from "./run/payloads.js";
import {
  truncateOversizedToolResultsInSession,
  sessionLikelyHasOversizedToolResults,
} from "./tool-result-truncation.js";
import { describeUnknownError } from "./utils.js";

// Session queuing helper (from main)
const enqueueSession = <T>(fn: () => Promise<T>): Promise<T> => {
  return enqueueCommandInLane("session", fn);
};

// Global queuing helper (from main)
const enqueueGlobal = <T>(fn: () => Promise<T>): Promise<T> => {
  return enqueueCommandInLane("global", fn);
};

type ApiKeyInfo = ResolvedProviderAuth;

type UsageAccumulator = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

const createUsageAccumulator = (): UsageAccumulator => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
});

const hasUsageValues = (
  usage: ReturnType<typeof normalizeUsage>,
): usage is NonNullable<ReturnType<typeof normalizeUsage>> =>
  !!usage &&
  [usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.total].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

interface MindConfig {
  enabled?: boolean;
  config?: {
    debug?: boolean;
    narrative?: {
      enabled?: boolean;
      autoBootstrapHistory?: boolean;
    };
    graphiti?: {
      baseUrl?: string;
    };
  };
}

const mergeUsageIntoAccumulator = (
  target: UsageAccumulator,
  usage: ReturnType<typeof normalizeUsage>,
) => {
  if (!hasUsageValues(usage)) {
    return;
  }
  target.input += usage.input ?? 0;
  target.output += usage.output ?? 0;
  target.cacheRead += usage.cacheRead ?? 0;
  target.cacheWrite += usage.cacheWrite ?? 0;
  target.total +=
    usage.total ??
    (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
};

const toNormalizedUsage = (usage: UsageAccumulator) => {
  const hasUsage =
    usage.input > 0 ||
    usage.output > 0 ||
    usage.cacheRead > 0 ||
    usage.cacheWrite > 0 ||
    usage.total > 0;
  if (!hasUsage) {
    return undefined;
  }
  const derivedTotal = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  return {
    input: usage.input || undefined,
    output: usage.output || undefined,
    cacheRead: usage.cacheRead || undefined,
    cacheWrite: usage.cacheWrite || undefined,
    total: usage.total || derivedTotal || undefined,
  };
};

export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const channelHint = params.messageChannel ?? params.messageProvider;
  const resolvedToolResultFormat =
    params.toolResultFormat ??
    (channelHint
      ? isMarkdownCapableMessageChannel(channelHint)
        ? "markdown"
        : "plain"
      : "markdown");
  const provider = (params.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
  const modelId = (params.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
  const agentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.config,
  });

  const fallbackConfigured = (params.config?.agents?.defaults?.model?.fallbacks?.length ?? 0) > 0;
  await ensureOpenClawModelsJson(params.config, agentDir);

  const { model, error, authStorage, modelRegistry } = resolveModel(
    provider,
    modelId,
    agentDir,
    params.config,
  );

  if (!model) {
    return {
      meta: {
        durationMs: 0,
        error: {
          kind: "unknown",
          message: error ?? `Unknown model: ${provider}/${modelId}`,
        } as {
          kind:
            | "context_overflow"
            | "compaction_failure"
            | "role_ordering"
            | "image_size"
            | "unknown";
          message: string;
        },
      },
    };
  }

  // Use main's queuing structure
  return enqueueSession(() =>
    enqueueGlobal(async () => {
      const started = Date.now();

      // Resolve workspace using main's logic, but fallback to UserPath if needed
      const workspaceResolution = resolveRunWorkspaceDir({
        workspaceDir: params.workspaceDir,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        config: params.config,
      });
      const resolvedWorkspace = workspaceResolution.workspaceDir;
      const redactedSessionId = redactRunIdentifier(params.sessionId);
      const redactedSessionKey = redactRunIdentifier(params.sessionKey);
      const redactedWorkspace = redactRunIdentifier(resolvedWorkspace);

      if (workspaceResolution.usedFallback) {
        log.warn(
          `[workspace-fallback] caller=runEmbeddedPiAgent reason=${workspaceResolution.fallbackReason} run=${params.runId} session=${redactedSessionId} sessionKey=${redactedSessionKey} agent=${workspaceResolution.agentId} workspace=${redactedWorkspace}`,
        );
      }
      // const prevCwd = process.cwd(); // Not strictly needed unless chdir is used, likely safe to omit or keep if used down stream? keeping straightforward.

      const ctxInfo = resolveContextWindowInfo({
        cfg: params.config as OpenClawConfig,
        provider,
        modelId,
        modelContextWindow: model.contextWindow,
        defaultTokens: DEFAULT_CONTEXT_TOKENS,
      });
      const ctxGuard = evaluateContextWindowGuard({
        info: ctxInfo,
        warnBelowTokens: CONTEXT_WINDOW_WARN_BELOW_TOKENS,
        hardMinTokens: CONTEXT_WINDOW_HARD_MIN_TOKENS,
      });
      if (ctxGuard.shouldWarn) {
        log.warn(
          `low context window: ${provider}/${modelId} ctx=${ctxGuard.tokens} (warn<${CONTEXT_WINDOW_WARN_BELOW_TOKENS}) source=${ctxGuard.source}`,
        );
      }
      if (ctxGuard.shouldBlock) {
        log.error(
          `blocked model (context window too small): ${provider}/${modelId} ctx=${ctxGuard.tokens} (min=${CONTEXT_WINDOW_HARD_MIN_TOKENS}) source=${ctxGuard.source}`,
        );
        throw new FailoverError(
          `Model context window too small (${ctxGuard.tokens} tokens). Minimum is ${CONTEXT_WINDOW_HARD_MIN_TOKENS}.`,
          { reason: "unknown", provider, model: modelId },
        );
      }

      const authStore = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
      const preferredProfileId = params.authProfileId?.trim();
      let lockedProfileId = params.authProfileIdSource === "user" ? preferredProfileId : undefined;
      if (lockedProfileId) {
        const lockedProfile = authStore.profiles[lockedProfileId];
        if (
          !lockedProfile ||
          normalizeProviderId(lockedProfile.provider) !== normalizeProviderId(provider)
        ) {
          lockedProfileId = undefined;
        }
      }
      const profileOrder = resolveAuthProfileOrder({
        cfg: params.config as OpenClawConfig,
        store: authStore,
        provider,
        preferredProfile: preferredProfileId,
      });
      if (lockedProfileId && !profileOrder.includes(lockedProfileId)) {
        throw new Error(`Auth profile "${lockedProfileId}" is not configured for ${provider}.`);
      }
      const profileCandidates = lockedProfileId
        ? [lockedProfileId]
        : profileOrder.length > 0
          ? profileOrder
          : [undefined];
      let profileIndex = 0;

      const initialThinkLevel = params.thinkLevel ?? "off";
      let thinkLevel = initialThinkLevel;
      const attemptedThinking = new Set<ThinkLevel>();
      let apiKeyInfo: ApiKeyInfo | null = null;
      let lastProfileId: string | undefined;

      const resolveAuthProfileFailoverReason = (params: {
        allInCooldown: boolean;
        message: string;
      }): FailoverReason => {
        if (params.allInCooldown) {
          return "rate_limit";
        }
        const classified = classifyFailoverReason(params.message);
        return classified ?? "auth";
      };

      const throwAuthProfileFailover = (params: {
        allInCooldown: boolean;
        message?: string;
        error?: unknown;
      }): never => {
        const fallbackMessage = `No available auth profile for ${provider} (all in cooldown or unavailable).`;
        const message =
          params.message?.trim() ||
          (params.error ? describeUnknownError(params.error).trim() : "") ||
          fallbackMessage;
        const reason = resolveAuthProfileFailoverReason({
          allInCooldown: params.allInCooldown,
          message,
        });
        if (fallbackConfigured) {
          throw new FailoverError(message, {
            reason,
            provider,
            model: modelId,
            status: resolveFailoverStatus(reason),
            cause: params.error,
          });
        }
        if (params.error instanceof Error) {
          throw params.error;
        }
        throw new Error(message);
      };

      const resolveApiKeyForCandidate = async (candidate?: string) => {
        return getApiKeyForModel({
          model,
          cfg: params.config as OpenClawConfig,
          profileId: candidate,
          agentDir,
        });
      };

      const applyApiKeyInfo = async (candidate?: string) => {
        lastProfileId = candidate;
        apiKeyInfo = await resolveApiKeyForCandidate(candidate);
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
        return runtimeApiKey;
      };

      const advanceAuthProfile = async (): Promise<boolean> => {
        if (lockedProfileId) {
          return false;
        }
        let nextIndex = profileIndex + 1;
        while (nextIndex < profileCandidates.length) {
          const candidate = profileCandidates[nextIndex];
          if (candidate && isProfileInCooldown(authStore, candidate)) {
            nextIndex += 1;
            continue;
          }
          try {
            await applyApiKeyInfo(candidate);
            profileIndex = nextIndex;
            thinkLevel = initialThinkLevel;
            attemptedThinking.clear();
            return true;
          } catch (err) {
            if (candidate && candidate === lockedProfileId) {
              throw err;
            }
            nextIndex += 1;
          }
        }
        return false;
      };

      try {
        await applyApiKeyInfo(profileCandidates[profileIndex]);
        if (profileIndex >= profileCandidates.length) {
          throwAuthProfileFailover({ allInCooldown: true });
        }
      } catch (err) {
        if (err instanceof FailoverError) {
          throw err;
        }
        if (profileCandidates[profileIndex] === lockedProfileId) {
          throwAuthProfileFailover({ allInCooldown: false, error: err });
        }
        const advanced = await advanceAuthProfile();
        if (!advanced) {
          throwAuthProfileFailover({ allInCooldown: false, error: err });
        }
      }

      // 🧠 MIND MEMORY INITIALIZATION
      const mindConfig = params.config?.plugins?.entries?.["mind-memory"] as MindConfig | undefined;
      const debug = !!mindConfig?.config?.debug;

      const { createSubconsciousAgent } = await import("./subconscious-agent.js");
      const subconsciousAgent = createSubconsciousAgent({
        model,
        authStorage,
        modelRegistry,
        debug,
        autoBootstrapHistory: mindConfig?.config?.narrative?.autoBootstrapHistory ?? false,
      });

      const agentConfig = resolveAgentConfig(params.config ?? {}, agentId);
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
          identityParts.push(`CONFIG IDENTITY: ${JSON.stringify(agentConfig.identity)}`);
        }
        identityContext = identityParts.join("\n\n").trim();
      } catch (e: unknown) {
        if (debug) {
          process.stderr.write(
            `  ⚠️ [DEBUG] Failed to load identity context: ${e instanceof Error ? e.message : String(e)}\n`,
          );
        }
      }

      let finalExtraSystemPrompt = params.extraSystemPrompt ?? "";
      let narrativeStory: { content: string; updatedAt: Date } | null = null;
      const storyPath = path.join(resolvedWorkspace, "STORY.md");
      const isMindEnabled =
        !!mindConfig?.enabled && (mindConfig?.config?.narrative?.enabled ?? true);
      const safeTokenLimit = Math.floor((ctxInfo.tokens || 50000) * 0.5);

      const isHeartbeatPrompt =
        params.prompt.includes("Read HEARTBEAT.md") && params.prompt.includes("reply HEARTBEAT_OK");

      try {
        if (isMindEnabled) {
          if (isSubagentSessionKey(params.sessionKey)) {
            if (debug) {
              process.stderr.write(`🧠 [MIND] Sub-agent detected - skipping Mind pipeline.\n`);
            }
          } else {
            if (debug) {
              process.stderr.write(
                `🧠 [MIND] Starting modular subconscious pipeline (Model: ${modelId})...\n`,
              );
            }

            interface MindGraphConfig {
              graphiti?: {
                baseUrl?: string;
              };
            }

            const { GraphService } = await import("../../services/memory/GraphService.js");
            const { SubconsciousService } =
              await import("../../services/memory/SubconsciousService.js");
            const { ConsolidationService } =
              await import("../../services/memory/ConsolidationService.js");

            const gUrl =
              (mindConfig?.config as MindGraphConfig)?.graphiti?.baseUrl || "http://localhost:8001";
            const gs = new GraphService(gUrl, debug);
            const sub = new SubconsciousService(gs, debug);
            const cons = new ConsolidationService(gs, debug);
            const globalSessionId = "global-user-memory";

            if (!isHeartbeatPrompt) {
              const memoryDir = path.join(path.dirname(storyPath), "memory");
              const sessionMgr = SessionManager.open(params.sessionFile);
              const sessionMessages = sessionMgr.buildSessionContext().messages || [];

              await cons.bootstrapHistoricalEpisodes(params.sessionId, memoryDir, sessionMessages);

              try {
                const earlyStory = await fs.readFile(storyPath, "utf-8").catch(() => null);
                if (earlyStory) {
                  narrativeStory = { content: earlyStory, updatedAt: new Date() };
                  if (debug) {
                    process.stderr.write(
                      `📖 [MIND] Pre-sync Story retrieved (${earlyStory.length} chars)\n`,
                    );
                  }
                }
              } catch {}

              {
                const { resolveSessionTranscriptsDir } =
                  await import("../../config/sessions/paths.js");
                const sessionsDir = resolveSessionTranscriptsDir();
                await cons.syncGlobalNarrative(
                  sessionsDir,
                  storyPath,
                  subconsciousAgent,
                  identityContext,
                  safeTokenLimit,
                  params.sessionFile,
                );
              }

              if (debug) {
                process.stderr.write(
                  `Tape [GRAPH] Storing episode for Global ID: ${globalSessionId} (Trace: ${params.sessionId})\n`,
                );
              }
              await gs.addEpisode(globalSessionId, `human: ${params.prompt}`);
            } else {
              if (debug) {
                process.stderr.write(
                  `💓 [MIND] Heartbeat detected - skipping memory storage & consolidation.\n`,
                );
              }
            }

            try {
              const storyContent = await fs.readFile(storyPath, "utf-8").catch(() => null);
              if (storyContent) {
                narrativeStory = { content: storyContent, updatedAt: new Date() };
                if (debug) {
                  process.stderr.write(
                    `📖 [MIND] Local Story retrieved (${storyContent.length} chars)\n`,
                  );
                }
              }
            } catch (e: unknown) {
              if (debug) {
                process.stderr.write(
                  `⚠️ [MIND] Failed to read local story: ${e instanceof Error ? e.message : String(e)}\n`,
                );
              }
            }

            const skipResonance = process.env.MIND_SKIP_RESONANCE === "1";
            if (!isHeartbeatPrompt && !skipResonance) {
              let oldestContextTimestamp: Date | undefined;
              let rawHistory: Array<{ role: string; text: string }> = [];
              try {
                const tempSessionManager = SessionManager.open(params.sessionFile);
                const branch = tempSessionManager.getBranch();
                const fullMessages: Array<{
                  role?: string;
                  text?: string;
                  timestamp?: number | string;
                }> = [];

                rawHistory = branch
                  .filter((e) => e.type === "message")
                  .filter((e) => (e.message as { role?: string })?.role !== "system")
                  .map((e) => {
                    const m = e.message as {
                      role?: string;
                      text?: string;
                      content?: string | unknown[];
                    };
                    let text = m.text || "";
                    if (!text && typeof m.content === "string") {
                      text = m.content;
                    }
                    if (!text && Array.isArray(m.content)) {
                      text =
                        (m.content as Array<{ type?: string; text?: string }>).find(
                          (c) => c.type === "text",
                        )?.text || "";
                    }
                    fullMessages.push({
                      role: m.role || "assistant",
                      text: m.text,
                      timestamp: e.timestamp,
                    });
                    return {
                      role: m.role || "assistant",
                      text: text,
                      timestamp: e.timestamp as unknown as number,
                    };
                  });

                const contextMessages = tempSessionManager.buildSessionContext().messages || [];
                if (contextMessages.length > 0) {
                  const { getDmHistoryLimitFromSessionKey } = await import("./history.js");
                  const { limitHistoryTurns } = await import("./history.js");
                  const limit = getDmHistoryLimitFromSessionKey(
                    params.sessionKey,
                    params.config as OpenClawConfig,
                  );
                  const limited = limitHistoryTurns(contextMessages, limit);
                  if (
                    limited.length > 0 &&
                    (limited[0] as { timestamp?: string | number }).timestamp
                  ) {
                    oldestContextTimestamp = new Date(
                      (limited[0] as { timestamp?: string | number }).timestamp!,
                    );
                  }
                }
              } catch {}

              const flashbacks = await sub.getFlashback(
                globalSessionId,
                params.prompt,
                subconsciousAgent,
                oldestContextTimestamp,
                rawHistory,
              );

              if (flashbacks) {
                if (debug) {
                  process.stderr.write("✨ [MIND] Memories injected into system prompt.\n");
                }
                finalExtraSystemPrompt += flashbacks;
              }
            } else {
              if (debug) {
                const reason = skipResonance
                  ? "MIND_SKIP_RESONANCE=1 (voice mode)"
                  : "Heartbeat detected";
                process.stderr.write(`⏭️ [MIND] ${reason} - skipping resonance retrieval.\n`);
              }
            }
          }
        }
      } catch (e: unknown) {
        process.stderr.write(
          `❌ [MIND] Subconscious error: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }

      const MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3;
      let overflowCompactionAttempts = 0;
      let toolResultTruncationAttempted = false;
      const usageAccumulator = createUsageAccumulator();
      let autoCompactionCount = 0;

      // Define Mind's compaction hook wrapper
      const wrappedOnAgentEvent =
        isMindEnabled && !isSubagentSessionKey(params.sessionKey) && !isHeartbeatPrompt
          ? (evt: { stream: string; data: Record<string, unknown> }) => {
              // Pass through original event
              params.onAgentEvent?.(evt);

              if (
                evt.stream === "compaction" &&
                (evt.data as { phase?: string })?.phase === "end" &&
                !(evt.data as { willRetry?: boolean })?.willRetry
              ) {
                // Fire-and-forget: narrate compacted-away messages to STORY.md
                void (async () => {
                  try {
                    const sm = SessionManager.open(params.sessionFile);
                    const allMessages = sm
                      .getBranch()
                      .filter((e) => e.type === "message")
                      .filter((e) => (e.message as { role?: string })?.role !== "system")
                      .map((e) => ({
                        role: (e.message as { role?: string })?.role,
                        text:
                          (e.message as { text?: string; content?: string })?.text ||
                          (e.message as { text?: string; content?: string })?.content,
                        timestamp: e.timestamp,
                      }));

                    const contextMessages = sm.buildSessionContext().messages || [];
                    const contextTimestamps = new Set(
                      contextMessages.map((m: { timestamp?: string | number }) => m.timestamp),
                    );

                    const compactedMessages = allMessages.filter(
                      (m) => m.timestamp && !contextTimestamps.has(m.timestamp),
                    );

                    if (compactedMessages.length === 0) {
                      if (debug) {
                        process.stderr.write(
                          `🧠 [MIND] Auto-compaction detected — no new compacted messages to narrate.\n`,
                        );
                      }
                      return;
                    }

                    if (debug) {
                      process.stderr.write(
                        `🧠 [MIND] Auto-compaction detected — narrating ${compactedMessages.length} compacted messages to STORY.md...\n`,
                      );
                    }

                    const { ConsolidationService } =
                      await import("../../services/memory/ConsolidationService.js");
                    const { GraphService } = await import("../../services/memory/GraphService.js");
                    const gUrl = mindConfig?.config?.graphiti?.baseUrl || "http://localhost:8001";
                    const gs = new GraphService(gUrl, debug);
                    const cons = new ConsolidationService(gs, debug);

                    await cons.syncStoryWithSession(
                      compactedMessages as Array<{
                        role: string;
                        text?: string;
                        content?: unknown;
                        timestamp?: number | string;
                        created_at?: string;
                      }>,
                      storyPath,
                      subconsciousAgent,
                      identityContext,
                      safeTokenLimit,
                    );

                    if (debug) {
                      process.stderr.write(`✅ [MIND] Post-compaction STORY.md sync complete.\n`);
                    }
                  } catch (e: unknown) {
                    process.stderr.write(
                      `❌ [MIND] Post-compaction story sync failed: ${e instanceof Error ? e.message : String(e)}\n`,
                    );
                  }
                })();
              }
            }
          : params.onAgentEvent;

      let aborted = false;
      let timedOut = false;
      while (true) {
        attemptedThinking.add(thinkLevel);
        await fs.mkdir(resolvedWorkspace, { recursive: true });

        const attempt = await runEmbeddedAttempt({
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          messageChannel: params.messageChannel,
          messageProvider: params.messageProvider,
          agentAccountId: params.agentAccountId,
          messageTo: params.messageTo,
          messageThreadId: params.messageThreadId,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
          spawnedBy: params.spawnedBy,
          senderIsOwner: params.senderIsOwner,
          currentChannelId: params.currentChannelId,
          currentThreadTs: params.currentThreadTs,
          replyToMode: params.replyToMode,
          hasRepliedRef: params.hasRepliedRef,
          sessionFile: params.sessionFile,
          workspaceDir: resolvedWorkspace,
          agentDir,
          config: params.config,
          skillsSnapshot: params.skillsSnapshot,
          prompt: params.prompt,
          images: params.images,
          disableTools: params.disableTools,
          provider,
          modelId,
          model,
          authStorage,
          modelRegistry,
          agentId: workspaceResolution.agentId,
          thinkLevel,
          verboseLevel: params.verboseLevel,
          reasoningLevel: params.reasoningLevel,
          toolResultFormat: resolvedToolResultFormat,
          execOverrides: params.execOverrides,
          bashElevated: params.bashElevated,
          timeoutMs: params.timeoutMs,
          runId: params.runId,
          abortSignal: params.abortSignal,
          shouldEmitToolResult: params.shouldEmitToolResult,
          shouldEmitToolOutput: params.shouldEmitToolOutput,
          onPartialReply: params.onPartialReply,
          onAssistantMessageStart: params.onAssistantMessageStart,
          onBlockReply: params.onBlockReply,
          onBlockReplyFlush: params.onBlockReplyFlush,
          blockReplyBreak: params.blockReplyBreak,
          blockReplyChunking: params.blockReplyChunking,
          onReasoningStream: params.onReasoningStream,
          onToolResult: params.onToolResult,
          onAgentEvent: wrappedOnAgentEvent, // Use wrapper!
          extraSystemPrompt: finalExtraSystemPrompt, // Use Mind injected prompt!
          narrativeStory: narrativeStory?.content || "", // Pass narrative story!
          streamParams: params.streamParams,
          ownerNumbers: params.ownerNumbers,
          enforceFinalTag: params.enforceFinalTag,
        });

        ({ aborted, timedOut } = attempt);
        const { promptError, sessionIdUsed, lastAssistant } = attempt;
        mergeUsageIntoAccumulator(
          usageAccumulator,
          attempt.attemptUsage ?? normalizeUsage(lastAssistant?.usage as UsageLike),
        );
        autoCompactionCount += Math.max(0, attempt.compactionCount ?? 0);
        const formattedAssistantErrorText = lastAssistant
          ? formatAssistantErrorText(lastAssistant, {
              cfg: params.config,
              sessionKey: params.sessionKey ?? params.sessionId,
            })
          : undefined;
        const assistantErrorText =
          lastAssistant?.stopReason === "error"
            ? lastAssistant.errorMessage?.trim() || formattedAssistantErrorText
            : undefined;

        const contextOverflowError = !aborted
          ? (() => {
              if (promptError) {
                const errorText = describeUnknownError(promptError);
                if (isContextOverflowError(errorText)) {
                  return { text: errorText, source: "promptError" as const };
                }
                return null;
              }
              if (assistantErrorText && isContextOverflowError(assistantErrorText)) {
                return { text: assistantErrorText, source: "assistantError" as const };
              }
              return null;
            })()
          : null;

        if (contextOverflowError) {
          const errorText = contextOverflowError.text;
          const msgCount = attempt.messagesSnapshot?.length ?? 0;
          log.warn(
            `[context-overflow-diag] sessionKey=${params.sessionKey ?? params.sessionId} ` +
              `provider=${provider}/${modelId} source=${contextOverflowError.source} ` +
              `messages=${msgCount} sessionFile=${params.sessionFile} ` +
              `compactionAttempts=${overflowCompactionAttempts} error=${errorText.slice(0, 200)}`,
          );
          const isCompactionFailure = isCompactionFailureError(errorText);

          if (
            !isCompactionFailure &&
            overflowCompactionAttempts < MAX_OVERFLOW_COMPACTION_ATTEMPTS
          ) {
            overflowCompactionAttempts++;
            log.warn(
              `context overflow detected (attempt ${overflowCompactionAttempts}/${MAX_OVERFLOW_COMPACTION_ATTEMPTS}); attempting auto-compaction for ${provider}/${modelId}`,
            );
            const compactResult = await compactEmbeddedPiSessionDirect({
              sessionId: params.sessionId,
              sessionKey: params.sessionKey,
              messageChannel: params.messageChannel,
              messageProvider: params.messageProvider,
              agentAccountId: params.agentAccountId,
              authProfileId: lastProfileId,
              sessionFile: params.sessionFile,
              workspaceDir: resolvedWorkspace,
              agentDir,
              config: params.config,
              skillsSnapshot: params.skillsSnapshot,
              senderIsOwner: params.senderIsOwner,
              provider,
              model: modelId,
              thinkLevel,
              reasoningLevel: params.reasoningLevel,
              bashElevated: params.bashElevated,
              extraSystemPrompt: params.extraSystemPrompt,
              ownerNumbers: params.ownerNumbers,
            });

            if (compactResult.compacted) {
              autoCompactionCount += 1;
              log.info(`auto-compaction succeeded for ${provider}/${modelId}; retrying prompt`);
              continue;
            }
            log.warn(
              `auto-compaction failed for ${provider}/${modelId}: ${compactResult.reason ?? "nothing to compact"}`,
            );
          }

          if (!toolResultTruncationAttempted) {
            const contextWindowTokens = ctxInfo.tokens;
            const hasOversized = attempt.messagesSnapshot
              ? sessionLikelyHasOversizedToolResults({
                  messages: attempt.messagesSnapshot,
                  contextWindowTokens,
                })
              : false;

            if (hasOversized) {
              toolResultTruncationAttempted = true;
              log.warn(
                `[context-overflow-recovery] Attempting tool result truncation for ${provider}/${modelId} ` +
                  `(contextWindow=${contextWindowTokens} tokens)`,
              );
              const truncResult = await truncateOversizedToolResultsInSession({
                sessionFile: params.sessionFile,
                contextWindowTokens,
                sessionId: params.sessionId,
                sessionKey: params.sessionKey,
              });
              if (truncResult.truncated) {
                log.info(
                  `[context-overflow-recovery] Truncated ${truncResult.truncatedCount} tool result(s); retrying prompt`,
                );
                overflowCompactionAttempts = 0;
                continue;
              }
              log.warn(
                `[context-overflow-recovery] Tool result truncation did not help: ${truncResult.reason ?? "unknown"}`,
              );
            }
          }
          const kind = isCompactionFailure ? "compaction_failure" : "context_overflow";
          return {
            payloads: [
              {
                text:
                  "Context overflow: prompt too large for the model. " +
                  "Try again with less input or a larger-context model.",
                isError: true,
              },
            ],
            meta: {
              durationMs: Date.now() - started,
              agentMeta: {
                sessionId: sessionIdUsed,
                provider,
                model: model.id,
              },
              systemPromptReport: attempt.systemPromptReport,
              error: { kind, message: errorText },
            },
          };
        }

        if (promptError && !aborted) {
          const errorText = describeUnknownError(promptError);
          if (/incorrect role information|roles must alternate/i.test(errorText)) {
            return {
              payloads: [
                {
                  text:
                    "Message ordering conflict - please try again. " +
                    "If this persists, use /new to start a fresh session.",
                  isError: true,
                },
              ],
              meta: {
                durationMs: Date.now() - started,
                agentMeta: {
                  sessionId: sessionIdUsed,
                  provider,
                  model: model.id,
                },
                systemPromptReport: attempt.systemPromptReport,
                error: { kind: "role_ordering", message: errorText },
              },
            };
          }

          const imageSizeError = parseImageSizeError(errorText);
          if (imageSizeError) {
            const maxMb = imageSizeError.maxMb;
            const maxMbLabel =
              typeof maxMb === "number" && Number.isFinite(maxMb) ? `${maxMb}` : null;
            const maxBytesHint = maxMbLabel ? ` (max ${maxMbLabel}MB)` : "";
            return {
              payloads: [
                {
                  text:
                    `Image too large for the model${maxBytesHint}. ` +
                    "Please compress or resize the image and try again.",
                  isError: true,
                },
              ],
              meta: {
                durationMs: Date.now() - started,
                agentMeta: {
                  sessionId: sessionIdUsed,
                  provider,
                  model: model.id,
                },
                systemPromptReport: attempt.systemPromptReport,
                error: { kind: "image_size", message: errorText },
              },
            };
          }

          const promptFailoverReason = classifyFailoverReason(errorText);
          if (promptFailoverReason && promptFailoverReason !== "timeout" && lastProfileId) {
            await markAuthProfileFailure({
              store: authStore,
              profileId: lastProfileId,
              reason: promptFailoverReason,
              cfg: params.config,
              agentDir: params.agentDir,
            });
          }
          if (
            isFailoverErrorMessage(errorText) &&
            promptFailoverReason !== "timeout" &&
            (await advanceAuthProfile())
          ) {
            continue;
          }
          const fallbackThinking = pickFallbackThinkingLevel({
            message: errorText,
            attempted: attemptedThinking,
          });
          if (fallbackThinking) {
            log.warn(
              `unsupported thinking level for ${provider}/${modelId}; retrying with ${fallbackThinking}`,
            );
            thinkLevel = fallbackThinking;
            continue;
          }
          if (fallbackConfigured && isFailoverErrorMessage(errorText)) {
            throw new FailoverError(errorText, {
              reason: promptFailoverReason ?? "unknown",
              provider,
              model: modelId,
              profileId: lastProfileId,
              status: resolveFailoverStatus(promptFailoverReason ?? "unknown"),
            });
          }
          throw promptError;
        }

        if (aborted || timedOut || !attempt) {
          break;
        }

        // Check for assistant error requiring rotation
        const authFailure = isAuthAssistantError(lastAssistant);
        const rateLimitFailure = isRateLimitAssistantError(lastAssistant);
        const billingFailure = isBillingAssistantError(lastAssistant);
        const assistantFailoverReason = classifyFailoverReason(lastAssistant?.errorMessage ?? "");

        const shouldRotate = assistantFailoverReason && assistantFailoverReason !== "timeout";

        if (shouldRotate && lastProfileId) {
          await markAuthProfileFailure({
            store: authStore,
            profileId: lastProfileId,
            reason: assistantFailoverReason,
            cfg: params.config as OpenClawConfig,
            agentDir,
          });
          const rotated = await advanceAuthProfile();
          if (rotated) {
            continue;
          }

          if (fallbackConfigured) {
            const message =
              (lastAssistant
                ? formatAssistantErrorText(lastAssistant, {
                    cfg: params.config,
                    sessionKey: params.sessionKey ?? params.sessionId,
                  })
                : undefined) ||
              lastAssistant?.errorMessage?.trim() ||
              (timedOut
                ? "LLM request timed out."
                : rateLimitFailure
                  ? "LLM request rate limited."
                  : billingFailure
                    ? BILLING_ERROR_USER_MESSAGE
                    : authFailure
                      ? "LLM request unauthorized."
                      : "LLM request failed.");
            const status =
              resolveFailoverStatus(assistantFailoverReason ?? "unknown") ??
              (isTimeoutErrorMessage(message) ? 408 : undefined);
            throw new FailoverError(message, {
              reason: assistantFailoverReason ?? "unknown",
              provider,
              model: modelId,
              profileId: lastProfileId,
              status,
            });
          }
        }

        // 💾 MIND PERSISTENCE: Save assistant response to Graphiti
        try {
          if (isMindEnabled && !isSubagentSessionKey(params.sessionKey)) {
            const assistantText = attempt.assistantTexts.join("\n").trim();
            const isHeartbeatResponse = assistantText === "HEARTBEAT_OK";

            if (!isHeartbeatPrompt && !isHeartbeatResponse) {
              if (assistantText) {
                const { GraphService } = await import("../../services/memory/GraphService.js");
                const gUrl = mindConfig?.config?.graphiti?.baseUrl || "http://localhost:8001";
                const gs = new GraphService(gUrl, debug);
                await gs.addEpisode("global-user-memory", `assistant: ${assistantText}`);
              }
            } else if (isHeartbeatResponse) {
              if (debug) {
                process.stderr.write(
                  `💓 [MIND] Heartbeat response detected - skipping memory storage.\n`,
                );
              }
            }
          }
        } catch (e: unknown) {
          process.stderr.write(
            `❌ [MIND] Consolidation / Persistence error: ${e instanceof Error ? e.message : String(e)}\n`,
          );
        }

        const usage = toNormalizedUsage(usageAccumulator);
        const agentMeta: EmbeddedPiAgentMeta = {
          sessionId: sessionIdUsed,
          provider: lastAssistant?.provider ?? provider,
          model: lastAssistant?.model ?? model.id,
          usage,
          compactionCount: autoCompactionCount > 0 ? autoCompactionCount : undefined,
        };

        const payloads = buildEmbeddedRunPayloads({
          assistantTexts: attempt.assistantTexts,
          toolMetas: attempt.toolMetas,
          lastAssistant: attempt.lastAssistant,
          lastToolError: attempt.lastToolError,
          config: params.config,
          sessionKey: params.sessionKey ?? params.sessionId,
          verboseLevel: params.verboseLevel,
          reasoningLevel: params.reasoningLevel,
          toolResultFormat: resolvedToolResultFormat,
          inlineToolResultsAllowed: false,
        });

        if (lastProfileId) {
          await markAuthProfileGood({
            store: authStore,
            provider,
            profileId: lastProfileId,
            agentDir: params.agentDir,
          });
          await markAuthProfileUsed({
            store: authStore,
            profileId: lastProfileId,
            agentDir: params.agentDir,
          });
        }

        return {
          payloads: payloads.length ? payloads : undefined,
          meta: {
            durationMs: Date.now() - started,
            agentMeta,
            aborted,
            systemPromptReport: attempt.systemPromptReport,
            stopReason: attempt.clientToolCall ? "tool_calls" : undefined,
            pendingToolCalls: attempt.clientToolCall
              ? [
                  {
                    id: `call_${Date.now()}`,
                    name: attempt.clientToolCall.name,
                    arguments: JSON.stringify(attempt.clientToolCall.params),
                  },
                ]
              : undefined,
          },
          didSendViaMessagingTool: attempt.didSendViaMessagingTool,
          messagingToolSentTexts: attempt.messagingToolSentTexts,
          messagingToolSentTargets: attempt.messagingToolSentTargets,
        };
      }

      return {
        meta: {
          durationMs: Date.now() - started,
          agentMeta: {
            sessionId: params.sessionId,
            provider,
            model: modelId,
          },
          error: {
            kind: timedOut ? "timeout" : "unknown",
            message: timedOut ? "LLM request timed out." : "LLM request aborted.",
          },
        },
      } as unknown as EmbeddedPiRunResult;
    }),
  );
}
