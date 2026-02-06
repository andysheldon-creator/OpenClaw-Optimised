import {
  createAgentSession,
  estimateTokens,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { ExecElevatedDefaults } from "../bash-tools.js";
import type { EmbeddedPiCompactResult } from "./types.js";
import { resolveHeartbeatPrompt } from "../../auto-reply/heartbeat.js";
import { resolveChannelCapabilities } from "../../config/channel-capabilities.js";
import { getMachineDisplayName } from "../../infra/machine-name.js";
import { type enqueueCommand, enqueueCommandInLane } from "../../process/command-queue.js";
import { isSubagentSessionKey } from "../../routing/session-key.js";
import { resolveSignalReactionLevel } from "../../signal/reaction-level.js";
import { resolveTelegramInlineButtonsScope } from "../../telegram/inline-buttons.js";
import { resolveTelegramReactionLevel } from "../../telegram/reaction-level.js";
import { buildTtsSystemPromptHint } from "../../tts/tts.js";
import { resolveUserPath } from "../../utils.js";
import { normalizeMessageChannel } from "../../utils/message-channel.js";
import { isReasoningTagProvider } from "../../utils/provider-utils.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { resolveSessionAgentIds } from "../agent-scope.js";
import { makeBootstrapWarn, resolveBootstrapContextForRun } from "../bootstrap-files.js";
import { listChannelSupportedActions, resolveChannelMessageToolHints } from "../channel-tools.js";
import { formatUserTime, resolveUserTimeFormat, resolveUserTimezone } from "../date-time.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../defaults.js";
import { resolveOpenClawDocsPath } from "../docs-path.js";
import { getApiKeyForModel, resolveModelAuthMode } from "../model-auth.js";
import { parseModelRef } from "../model-selection.js";
import { ensureOpenClawModelsJson } from "../models-config.js";
import {
  ensureSessionHeader,
  validateAnthropicTurns,
  validateGeminiTurns,
} from "../pi-embedded-helpers.js";
import {
  ensurePiCompactionReserveTokens,
  resolveCompactionReserveTokensFloor,
} from "../pi-settings.js";
import { createOpenClawCodingTools } from "../pi-tools.js";
import { resolveSandboxContext } from "../sandbox.js";
import { repairSessionFileIfNeeded } from "../session-file-repair.js";
import { guardSessionManager } from "../session-tool-result-guard-wrapper.js";
import { acquireSessionWriteLock } from "../session-write-lock.js";
import { detectRuntimeShell } from "../shell-utils.js";
import {
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
  loadWorkspaceSkillEntries,
  resolveSkillsPromptForRun,
  type SkillSnapshot,
} from "../skills.js";
import { resolveTranscriptPolicy } from "../transcript-policy.js";
import { buildEmbeddedExtensionPaths } from "./extensions.js";
import {
  logToolSchemasForGoogle,
  sanitizeSessionHistory,
  sanitizeToolsForGoogle,
} from "./google.js";
import { getDmHistoryLimitFromSessionKey, limitHistoryTurns } from "./history.js";
import { resolveGlobalLane, resolveSessionLane } from "./lanes.js";
import { log } from "./logger.js";
import { buildModelAliasLines, resolveModel } from "./model.js";
import { buildEmbeddedSandboxInfo } from "./sandbox-info.js";
import { prewarmSessionFile, trackSessionManagerAccess } from "./session-manager-cache.js";
import {
  applySystemPromptOverrideToSession,
  buildEmbeddedSystemPrompt,
  createSystemPromptOverride,
} from "./system-prompt.js";
import { splitSdkTools } from "./tool-split.js";
import { describeUnknownError, mapThinkingLevel, resolveExecToolDefaults } from "./utils.js";

export type CompactEmbeddedPiSessionParams = {
  sessionId: string;
  sessionKey?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  authProfileId?: string;
  /** Group id for channel-level tool policy resolution. */
  groupId?: string | null;
  /** Group channel label (e.g. #general) for channel-level tool policy resolution. */
  groupChannel?: string | null;
  /** Group space label (e.g. guild/team id) for channel-level tool policy resolution. */
  groupSpace?: string | null;
  /** Parent session key for subagent policy inheritance. */
  spawnedBy?: string | null;
  /** Whether the sender is an owner (required for owner-only tools). */
  senderIsOwner?: boolean;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  bashElevated?: ExecElevatedDefaults;
  customInstructions?: string;
  lane?: string;
  enqueue?: typeof enqueueCommand;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
};

/**
 * Core compaction logic without lane queueing.
 * Use this when already inside a session/global lane to avoid deadlocks.
 */
export async function compactEmbeddedPiSessionDirect(
  params: CompactEmbeddedPiSessionParams,
): Promise<EmbeddedPiCompactResult> {
  const resolvedWorkspace = resolveUserPath(params.workspaceDir);
  const prevCwd = process.cwd();

  const provider = (params.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
  const modelId = (params.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
  await ensureOpenClawModelsJson(params.config, agentDir);

  // Override with compaction-specific model if configured and enabled
  const compactionOverrideEnabled =
    params.config?.agents?.defaults?.compaction?.overrideModel ?? false;
  const compactionModelRef = compactionOverrideEnabled
    ? params.config?.agents?.defaults?.compaction?.model?.trim()
    : undefined;
  let effectiveProvider = provider;
  let effectiveModelId = modelId;
  if (compactionModelRef) {
    const parsed = parseModelRef(compactionModelRef, provider);
    if (parsed) {
      effectiveProvider = parsed.provider;
      effectiveModelId = parsed.model;
      log.info(`compaction: using override model ${effectiveProvider}/${effectiveModelId}`);
    }
  }

  const { model, error, authStorage, modelRegistry } = resolveModel(
    effectiveProvider,
    effectiveModelId,
    agentDir,
    params.config,
  );
  if (!model) {
    return {
      ok: false,
      compacted: false,
      reason: error ?? `Unknown model: ${effectiveProvider}/${effectiveModelId}`,
    };
  }
  try {
    const apiKeyInfo = await getApiKeyForModel({
      model,
      cfg: params.config,
      profileId: params.authProfileId,
      agentDir,
    });

    if (!apiKeyInfo.apiKey) {
      if (apiKeyInfo.mode !== "aws-sdk") {
        throw new Error(
          `No API key resolved for provider "${model.provider}" (auth mode: ${apiKeyInfo.mode}).`,
        );
      }
    } else if (model.provider === "github-copilot") {
      const { resolveCopilotApiToken } = await import("../../providers/github-copilot-token.js");
      const copilotToken = await resolveCopilotApiToken({
        githubToken: apiKeyInfo.apiKey,
      });
      authStorage.setRuntimeApiKey(model.provider, copilotToken.token);
    } else {
      authStorage.setRuntimeApiKey(model.provider, apiKeyInfo.apiKey);
    }
  } catch (err) {
    return {
      ok: false,
      compacted: false,
      reason: describeUnknownError(err),
    };
  }

  await fs.mkdir(resolvedWorkspace, { recursive: true });
  const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
  const sandbox = await resolveSandboxContext({
    config: params.config,
    sessionKey: sandboxSessionKey,
    workspaceDir: resolvedWorkspace,
  });
  const effectiveWorkspace = sandbox?.enabled
    ? sandbox.workspaceAccess === "rw"
      ? resolvedWorkspace
      : sandbox.workspaceDir
    : resolvedWorkspace;
  await fs.mkdir(effectiveWorkspace, { recursive: true });
  await ensureSessionHeader({
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    cwd: effectiveWorkspace,
  });

  let restoreSkillEnv: (() => void) | undefined;
  process.chdir(effectiveWorkspace);
  try {
    const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
    const skillEntries = shouldLoadSkillEntries
      ? loadWorkspaceSkillEntries(effectiveWorkspace)
      : [];
    restoreSkillEnv = params.skillsSnapshot
      ? applySkillEnvOverridesFromSnapshot({
          snapshot: params.skillsSnapshot,
          config: params.config,
        })
      : applySkillEnvOverrides({
          skills: skillEntries ?? [],
          config: params.config,
        });
    const skillsPrompt = resolveSkillsPromptForRun({
      skillsSnapshot: params.skillsSnapshot,
      entries: shouldLoadSkillEntries ? skillEntries : undefined,
      config: params.config,
      workspaceDir: effectiveWorkspace,
    });

    const sessionLabel = params.sessionKey ?? params.sessionId;
    const { contextFiles } = await resolveBootstrapContextForRun({
      workspaceDir: effectiveWorkspace,
      config: params.config,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      warn: makeBootstrapWarn({ sessionLabel, warn: (message) => log.warn(message) }),
    });
    const runAbortController = new AbortController();
    const toolsRaw = createOpenClawCodingTools({
      exec: {
        ...resolveExecToolDefaults(params.config),
        elevated: params.bashElevated,
      },
      sandbox,
      messageProvider: params.messageChannel ?? params.messageProvider,
      agentAccountId: params.agentAccountId,
      sessionKey: params.sessionKey ?? params.sessionId,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
      spawnedBy: params.spawnedBy,
      senderIsOwner: params.senderIsOwner,
      agentDir,
      workspaceDir: effectiveWorkspace,
      config: params.config,
      abortSignal: runAbortController.signal,
      modelProvider: model.provider,
      modelId,
      modelAuthMode: resolveModelAuthMode(model.provider, params.config),
    });
    const tools = sanitizeToolsForGoogle({ tools: toolsRaw, provider });
    logToolSchemasForGoogle({ tools, provider });
    const machineName = await getMachineDisplayName();
    const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
    let runtimeCapabilities = runtimeChannel
      ? (resolveChannelCapabilities({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        }) ?? [])
      : undefined;
    if (runtimeChannel === "telegram" && params.config) {
      const inlineButtonsScope = resolveTelegramInlineButtonsScope({
        cfg: params.config,
        accountId: params.agentAccountId ?? undefined,
      });
      if (inlineButtonsScope !== "off") {
        if (!runtimeCapabilities) {
          runtimeCapabilities = [];
        }
        if (
          !runtimeCapabilities.some((cap) => String(cap).trim().toLowerCase() === "inlinebuttons")
        ) {
          runtimeCapabilities.push("inlineButtons");
        }
      }
    }
    const reactionGuidance =
      runtimeChannel && params.config
        ? (() => {
            if (runtimeChannel === "telegram") {
              const resolved = resolveTelegramReactionLevel({
                cfg: params.config,
                accountId: params.agentAccountId ?? undefined,
              });
              const level = resolved.agentReactionGuidance;
              return level ? { level, channel: "Telegram" } : undefined;
            }
            if (runtimeChannel === "signal") {
              const resolved = resolveSignalReactionLevel({
                cfg: params.config,
                accountId: params.agentAccountId ?? undefined,
              });
              const level = resolved.agentReactionGuidance;
              return level ? { level, channel: "Signal" } : undefined;
            }
            return undefined;
          })()
        : undefined;
    // Resolve channel-specific message actions for system prompt
    const channelActions = runtimeChannel
      ? listChannelSupportedActions({
          cfg: params.config,
          channel: runtimeChannel,
        })
      : undefined;
    const messageToolHints = runtimeChannel
      ? resolveChannelMessageToolHints({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        })
      : undefined;

    const runtimeInfo = {
      host: machineName,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
      model: `${provider}/${modelId}`,
      shell: detectRuntimeShell(),
      channel: runtimeChannel,
      capabilities: runtimeCapabilities,
      channelActions,
    };
    const sandboxInfo = buildEmbeddedSandboxInfo(sandbox, params.bashElevated);
    const reasoningTagHint = isReasoningTagProvider(provider);
    const userTimezone = resolveUserTimezone(params.config?.agents?.defaults?.userTimezone);
    const userTimeFormat = resolveUserTimeFormat(params.config?.agents?.defaults?.timeFormat);
    const userTime = formatUserTime(new Date(), userTimezone, userTimeFormat);
    const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
      sessionKey: params.sessionKey,
      config: params.config,
    });
    const isDefaultAgent = sessionAgentId === defaultAgentId;
    const promptMode = isSubagentSessionKey(params.sessionKey) ? "minimal" : "full";
    const docsPath = await resolveOpenClawDocsPath({
      workspaceDir: effectiveWorkspace,
      argv1: process.argv[1],
      cwd: process.cwd(),
      moduleUrl: import.meta.url,
    });
    const ttsHint = params.config ? buildTtsSystemPromptHint(params.config) : undefined;
    const appendPrompt = buildEmbeddedSystemPrompt({
      workspaceDir: effectiveWorkspace,
      defaultThinkLevel: params.thinkLevel,
      reasoningLevel: params.reasoningLevel ?? "off",
      extraSystemPrompt: params.extraSystemPrompt,
      ownerNumbers: params.ownerNumbers,
      reasoningTagHint,
      heartbeatPrompt: isDefaultAgent
        ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
        : undefined,
      skillsPrompt,
      docsPath: docsPath ?? undefined,
      ttsHint,
      promptMode,
      runtimeInfo,
      reactionGuidance,
      messageToolHints,
      sandboxInfo,
      tools,
      modelAliasLines: buildModelAliasLines(params.config),
      userTimezone,
      userTime,
      userTimeFormat,
      contextFiles,
      memoryCitationsMode: params.config?.memory?.citations,
    });
    const systemPromptOverride = createSystemPromptOverride(appendPrompt);

    const sessionLock = await acquireSessionWriteLock({
      sessionFile: params.sessionFile,
    });
    try {
      await repairSessionFileIfNeeded({
        sessionFile: params.sessionFile,
        warn: (message) => log.warn(message),
      });
      await prewarmSessionFile(params.sessionFile);
      const transcriptPolicy = resolveTranscriptPolicy({
        modelApi: model.api,
        provider,
        modelId,
      });
      const sessionManager = guardSessionManager(SessionManager.open(params.sessionFile), {
        agentId: sessionAgentId,
        sessionKey: params.sessionKey,
        allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
      });
      trackSessionManagerAccess(params.sessionFile);
      const settingsManager = SettingsManager.create(effectiveWorkspace, agentDir);
      ensurePiCompactionReserveTokens({
        settingsManager,
        minReserveTokens: resolveCompactionReserveTokensFloor(params.config),
      });
      // Call for side effects (sets compaction/pruning runtime state)
      buildEmbeddedExtensionPaths({
        cfg: params.config,
        sessionManager,
        provider,
        modelId,
        model,
      });

      const { builtInTools, customTools } = splitSdkTools({
        tools,
        sandboxEnabled: !!sandbox?.enabled,
      });

      // Disable reasoning for compaction sessions. The SDK's generateSummary()
      // hardcodes reasoning: "high" which triggers extended thinking on
      // reasoning-capable models. Extended thinking adds significant latency
      // and token cost (16K+ budget) to summarization with marginal quality
      // benefit, and not all API-compatible providers support thinking params.
      const compactionModel = model.reasoning ? { ...model, reasoning: false } : model;

      const { session } = await createAgentSession({
        cwd: resolvedWorkspace,
        agentDir,
        authStorage,
        modelRegistry,
        model: compactionModel,
        thinkingLevel: mapThinkingLevel(params.thinkLevel),
        tools: builtInTools,
        customTools,
        sessionManager,
        settingsManager,
      });
      applySystemPromptOverrideToSession(session, systemPromptOverride());

      try {
        const prior = await sanitizeSessionHistory({
          messages: session.messages,
          modelApi: model.api,
          modelId,
          provider,
          sessionManager,
          sessionId: params.sessionId,
          policy: transcriptPolicy,
        });
        const validatedGemini = transcriptPolicy.validateGeminiTurns
          ? validateGeminiTurns(prior)
          : prior;
        const validated = transcriptPolicy.validateAnthropicTurns
          ? validateAnthropicTurns(validatedGemini)
          : validatedGemini;
        const limited = limitHistoryTurns(
          validated,
          getDmHistoryLimitFromSessionKey(params.sessionKey, params.config),
        );
        if (limited.length > 0) {
          session.agent.replaceMessages(limited);
        }
        const compactionTimeoutMs =
          params.config?.agents?.defaults?.compaction?.timeoutMs ?? 120_000;
        const compactionStartMs = Date.now();
        let compactionTimedOut = false;

        const timeoutHandle = setTimeout(() => {
          compactionTimedOut = true;
          session.abortCompaction();
        }, compactionTimeoutMs);
        timeoutHandle.unref();

        log.info(
          `compaction: start sessionId=${params.sessionId} ` +
            `model=${effectiveProvider}/${effectiveModelId} timeoutMs=${compactionTimeoutMs}`,
        );

        let result: Awaited<ReturnType<typeof session.compact>>;
        try {
          result = await session.compact(params.customInstructions);
        } catch (err) {
          clearTimeout(timeoutHandle);
          if (compactionTimedOut) {
            log.warn(
              `compaction: timeout sessionId=${params.sessionId} ` +
                `timeoutMs=${compactionTimeoutMs} elapsedMs=${Date.now() - compactionStartMs}`,
            );
            return {
              ok: false,
              compacted: false,
              reason: `compaction_timeout (${compactionTimeoutMs}ms)`,
            };
          }
          throw err;
        }
        clearTimeout(timeoutHandle);

        // Estimate tokens after compaction by summing token estimates for remaining messages
        let tokensAfter: number | undefined;
        try {
          tokensAfter = 0;
          for (const message of session.messages) {
            tokensAfter += estimateTokens(message);
          }
          // Sanity check: tokensAfter should be less than tokensBefore
          if (tokensAfter > result.tokensBefore) {
            tokensAfter = undefined; // Don't trust the estimate
          }
        } catch {
          // If estimation fails, leave tokensAfter undefined
          tokensAfter = undefined;
        }

        log.info(
          `compaction: done sessionId=${params.sessionId} ` +
            `model=${effectiveProvider}/${effectiveModelId} ` +
            `tokensBefore=${result.tokensBefore} tokensAfter=${tokensAfter ?? "?"} ` +
            `durationMs=${Date.now() - compactionStartMs}`,
        );

        return {
          ok: true,
          compacted: true,
          result: {
            summary: result.summary,
            firstKeptEntryId: result.firstKeptEntryId,
            tokensBefore: result.tokensBefore,
            tokensAfter,
            details: result.details,
          },
        };
      } finally {
        sessionManager.flushPendingToolResults?.();
        session.dispose();
      }
    } finally {
      await sessionLock.release();
    }
  } catch (err) {
    log.warn(
      `compaction: error sessionId=${params.sessionId} ` +
        `reason=${describeUnknownError(err).slice(0, 200)}`,
    );
    return {
      ok: false,
      compacted: false,
      reason: describeUnknownError(err),
    };
  } finally {
    restoreSkillEnv?.();
    process.chdir(prevCwd);
  }
}

/**
 * Compacts a session with lane queueing (session lane + global lane).
 * Use this from outside a lane context. If already inside a lane, use
 * `compactEmbeddedPiSessionDirect` to avoid deadlocks.
 */
export async function compactEmbeddedPiSession(
  params: CompactEmbeddedPiSessionParams,
): Promise<EmbeddedPiCompactResult> {
  const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
  const globalLane = resolveGlobalLane(params.lane);
  const enqueueGlobal =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
  return enqueueCommandInLane(sessionLane, () =>
    enqueueGlobal(async () => compactEmbeddedPiSessionDirect(params)),
  );
}
