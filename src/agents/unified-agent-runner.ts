/**
 * Unified Agent Runner.
 *
 * Provides a single entry point for agent execution with runtime-outer, model-inner
 * failover composition. This ensures consistent runtime selection and failover behavior
 * across all agent execution paths.
 */

import type { MoltbotConfig } from "../config/config.js";
import { resolveAgentIdFromSessionKey } from "../config/sessions.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  AgentRuntime,
  AgentRuntimeKind,
  AgentRuntimeRunParams,
  AgentRuntimeResult,
} from "./agent-runtime.js";
import { resolveAgentModelFallbacksOverride } from "./agent-scope.js";
import {
  coerceToFailoverError,
  describeFailoverError,
  isFailoverError,
  isTimeoutError,
} from "./failover-error.js";
import { createAgentRuntime, resolveAgentRuntimeKind } from "./main-agent-runtime-factory.js";
import {
  buildModelAliasIndex,
  modelKey,
  parseModelRef,
  resolveConfiguredModelRef,
  resolveModelRefFromString,
} from "./model-selection.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";
import {
  ensureAuthProfileStore,
  isProfileInCooldown,
  resolveAuthProfileOrder,
} from "./auth-profiles.js";
import { isReasoningTagProvider } from "../utils/provider-utils.js";

const log = createSubsystemLogger("agent-runner");

/** Model candidate for fallback. */
type ModelCandidate = {
  provider: string;
  model: string;
};

/** Record of a single failover attempt. */
export type UnifiedFallbackAttempt = {
  runtime: AgentRuntimeKind;
  provider: string;
  model: string;
  error: string;
  reason?: string;
  status?: number;
  code?: string;
};

/** Result of unified agent run. */
export type UnifiedAgentRunResult = {
  result: AgentRuntimeResult;
  runtime: AgentRuntimeKind;
  provider: string;
  model: string;
  attempts: UnifiedFallbackAttempt[];
};

/** Parameters for unified agent runner (superset of AgentRuntimeRunParams). */
export type UnifiedAgentRunParams = AgentRuntimeRunParams & {
  /** Optional explicit fallbacks list; when provided (even empty), replaces agents.defaults.model.fallbacks. */
  fallbacksOverride?: string[];
  /** Callback when a model is selected (before each attempt). */
  onModelSelected?: (info: {
    runtime: AgentRuntimeKind;
    provider: string;
    model: string;
    attempt: number;
    total: number;
  }) => void | Promise<void>;
  /** Error callback for each failed attempt. */
  onError?: (attempt: {
    runtime: AgentRuntimeKind;
    provider: string;
    model: string;
    error: unknown;
    attempt: number;
    total: number;
  }) => void | Promise<void>;
};

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (isFailoverError(err)) return false;
  const name = "name" in err ? String(err.name) : "";
  return name === "AbortError";
}

function shouldRethrowAbort(err: unknown): boolean {
  return isAbortError(err) && !isTimeoutError(err);
}

function buildAllowedModelKeys(
  cfg: MoltbotConfig | undefined,
  defaultProvider: string,
): Set<string> | null {
  const rawAllowlist = (() => {
    const modelMap = cfg?.agents?.defaults?.models ?? {};
    return Object.keys(modelMap);
  })();
  if (rawAllowlist.length === 0) return null;
  const keys = new Set<string>();
  for (const raw of rawAllowlist) {
    const parsed = parseModelRef(String(raw ?? ""), defaultProvider);
    if (!parsed) continue;
    keys.add(modelKey(parsed.provider, parsed.model));
  }
  return keys.size > 0 ? keys : null;
}

function resolveFallbackCandidates(params: {
  cfg: MoltbotConfig | undefined;
  provider: string;
  model: string;
  fallbacksOverride?: string[];
}): ModelCandidate[] {
  const primary = params.cfg
    ? resolveConfiguredModelRef({
        cfg: params.cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      })
    : null;
  const defaultProvider = primary?.provider ?? DEFAULT_PROVIDER;
  const defaultModel = primary?.model ?? DEFAULT_MODEL;
  const provider = String(params.provider ?? "").trim() || defaultProvider;
  const model = String(params.model ?? "").trim() || defaultModel;
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg ?? {},
    defaultProvider,
  });
  const allowlist = buildAllowedModelKeys(params.cfg, defaultProvider);
  const seen = new Set<string>();
  const candidates: ModelCandidate[] = [];

  const addCandidate = (candidate: ModelCandidate, enforceAllowlist: boolean) => {
    if (!candidate.provider || !candidate.model) return;
    const key = modelKey(candidate.provider, candidate.model);
    if (seen.has(key)) return;
    if (enforceAllowlist && allowlist && !allowlist.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  addCandidate({ provider, model }, false);

  const modelFallbacks = (() => {
    if (params.fallbacksOverride !== undefined) return params.fallbacksOverride;
    const model = params.cfg?.agents?.defaults?.model as
      | { fallbacks?: string[] }
      | string
      | undefined;
    if (model && typeof model === "object") return model.fallbacks ?? [];
    return [];
  })();

  for (const raw of modelFallbacks) {
    const resolved = resolveModelRefFromString({
      raw: String(raw ?? ""),
      defaultProvider,
      aliasIndex,
    });
    if (!resolved) continue;
    addCandidate(resolved.ref, true);
  }

  if (params.fallbacksOverride === undefined && primary?.provider && primary.model) {
    addCandidate({ provider: primary.provider, model: primary.model }, false);
  }

  return candidates;
}

/**
 * Resolve runtime failover chain.
 *
 * Returns the primary runtime first, followed by the opposite runtime as fallback.
 */
function resolveRuntimeFailoverChain(primaryRuntime: AgentRuntimeKind): AgentRuntimeKind[] {
  if (primaryRuntime === "ccsdk") {
    return ["ccsdk", "pi"];
  }
  return ["pi", "ccsdk"];
}

/**
 * Run agent with unified failover.
 *
 * Implements runtime-outer, model-inner failover composition:
 * - First tries all model candidates with the primary runtime
 * - If all fail, switches to the fallback runtime and tries model candidates again
 *
 * @param params - Unified agent run parameters
 * @returns Result with runtime, provider, model, and attempt history
 */
export async function runAgentWithUnifiedFailover(
  params: UnifiedAgentRunParams,
): Promise<UnifiedAgentRunResult> {
  const config = params.config;
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey) ?? "main";

  // Resolve primary runtime and build failover chain
  const primaryRuntime = config ? resolveAgentRuntimeKind(config, agentId) : "pi";
  const runtimeChain = resolveRuntimeFailoverChain(primaryRuntime);

  // Resolve model fallback candidates
  const fallbacksOverride =
    params.fallbacksOverride ??
    (config ? resolveAgentModelFallbacksOverride(config, agentId) : undefined);
  const modelCandidates = resolveFallbackCandidates({
    cfg: config,
    provider: params.provider ?? DEFAULT_PROVIDER,
    model: params.model ?? DEFAULT_MODEL,
    fallbacksOverride,
  });

  const authStore = config
    ? ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false })
    : null;

  const attempts: UnifiedFallbackAttempt[] = [];
  let lastError: unknown;
  let attemptIndex = 0;
  const totalAttempts = runtimeChain.length * modelCandidates.length;

  log.info("Starting Agent run", {
    sessionId: params.sessionId,
    runId: params.runId,
    agentId,
    primaryRuntime,
    provider: params.provider ?? DEFAULT_PROVIDER,
    model: params.model ?? DEFAULT_MODEL,
    modelCandidatesCount: modelCandidates.length,
  });

  // Runtime-outer loop
  for (const runtimeKind of runtimeChain) {
    let runtime: AgentRuntime;
    try {
      // Force the specific runtime kind we want in the failover chain
      runtime = await createAgentRuntime(config ?? ({} as MoltbotConfig), agentId, runtimeKind);

      // If the runtime kind doesn't match what we wanted (e.g., CCSDK unavailable),
      // skip to the next runtime in the chain
      if (runtime.kind !== runtimeKind) {
        log.debug("Runtime kind mismatch, skipping", {
          requested: runtimeKind,
          actual: runtime.kind,
        });
        continue;
      }
    } catch (err) {
      log.warn("Failed to create runtime, trying next", {
        runtime: runtimeKind,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Model-inner loop
    for (const candidate of modelCandidates) {
      attemptIndex += 1;

      // Check auth profile cooldown
      if (authStore) {
        const profileIds = resolveAuthProfileOrder({
          cfg: config,
          store: authStore,
          provider: candidate.provider,
        });
        const isAnyProfileAvailable = profileIds.some((id) => !isProfileInCooldown(authStore, id));

        if (profileIds.length > 0 && !isAnyProfileAvailable) {
          attempts.push({
            runtime: runtimeKind,
            provider: candidate.provider,
            model: candidate.model,
            error: `Provider ${candidate.provider} is in cooldown (all profiles unavailable)`,
            reason: "rate_limit",
          });
          continue;
        }
      }

      try {
        // Notify model selection before attempt (wrapped in try/catch to be resilient)
        try {
          await params.onModelSelected?.({
            runtime: runtimeKind,
            provider: candidate.provider,
            model: candidate.model,
            attempt: attemptIndex,
            total: totalAttempts,
          });
        } catch (err) {
          log.warn("onModelSelected callback failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Determine if this is a different provider than originally requested
        const originalProvider = params.provider ?? DEFAULT_PROVIDER;
        const providerChanged = candidate.provider !== originalProvider;

        // Drop authProfileId when provider changes (auth profile is provider-specific)
        const effectiveAuthProfileId = providerChanged ? undefined : params.authProfileId;
        const effectiveAuthProfileIdSource = providerChanged
          ? undefined
          : params.authProfileIdSource;

        // Compute enforceFinalTag based on current provider's reasoning tag support
        const baseEnforceFinalTag = params.piOptions?.enforceFinalTag ?? false;
        const currentProviderRequiresReasoningTags = isReasoningTagProvider(candidate.provider);
        const effectiveEnforceFinalTag =
          baseEnforceFinalTag || currentProviderRequiresReasoningTags;

        const result = await runtime.run({
          ...params,
          provider: candidate.provider,
          model: candidate.model,
          authProfileId: effectiveAuthProfileId,
          authProfileIdSource: effectiveAuthProfileIdSource,
          // Update piOptions with computed enforceFinalTag
          piOptions: params.piOptions
            ? { ...params.piOptions, enforceFinalTag: effectiveEnforceFinalTag }
            : { enforceFinalTag: effectiveEnforceFinalTag },
        });

        log.info("Agent run completed", {
          sessionId: params.sessionId,
          runId: params.runId,
          runtime: runtimeKind,
          provider: candidate.provider,
          model: candidate.model,
          attemptsCount: attempts.length,
        });

        return {
          result,
          runtime: runtimeKind,
          provider: candidate.provider,
          model: candidate.model,
          attempts,
        };
      } catch (err) {
        if (shouldRethrowAbort(err)) throw err;

        const normalized =
          coerceToFailoverError(err, {
            provider: candidate.provider,
            model: candidate.model,
          }) ?? err;

        if (!isFailoverError(normalized)) throw err;

        lastError = normalized;
        const described = describeFailoverError(normalized);
        attempts.push({
          runtime: runtimeKind,
          provider: candidate.provider,
          model: candidate.model,
          error: described.message,
          reason: described.reason,
          status: described.status,
          code: described.code,
        });

        await params.onError?.({
          runtime: runtimeKind,
          provider: candidate.provider,
          model: candidate.model,
          error: normalized,
          attempt: attemptIndex,
          total: totalAttempts,
        });
      }
    }
  }

  // All attempts exhausted
  if (attempts.length <= 1 && lastError) throw lastError;

  const summary =
    attempts.length > 0
      ? attempts
          .map(
            (attempt) =>
              `${attempt.runtime}:${attempt.provider}/${attempt.model}: ${attempt.error}${
                attempt.reason ? ` (${attempt.reason})` : ""
              }`,
          )
          .join(" | ")
      : "unknown";

  throw new Error(
    `All runtimes and models failed (${attempts.length || totalAttempts}): ${summary}`,
    { cause: lastError instanceof Error ? lastError : undefined },
  );
}
