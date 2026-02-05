import { type Api, completeSimple, type Model } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../config/config.js";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { getApiKeyForModel, resolveApiKeyForProvider } from "../agents/model-auth.js";
import { resolveModel } from "../agents/model-resolution.js";
import {
  buildModelAliasIndex,
  resolveDefaultModelForAgent,
  resolveModelRefFromString,
} from "../agents/model-selection.js";
import { ensureOpenClawModelsJson } from "../agents/models-config.js";

function isTextContentBlock(block: { type: string }): block is { type: "text"; text: string } {
  return block.type === "text";
}

/**
 * Complete text using a pre-resolved provider/model.
 * Lower-level function that skips model ref resolution and goes straight to the API.
 */
export async function completeText(params: {
  cfg: OpenClawConfig;
  provider: string;
  model: string;
  prompt: string;
  authProfileId?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; provider: string; model: string; durationMs: number }> {
  const startedAt = Date.now();
  const timeoutMs = params.timeoutMs ?? 10_000;
  const maxTokens = params.maxTokens ?? 256;

  const agentDir = resolveOpenClawAgentDir();
  await ensureOpenClawModelsJson(params.cfg, agentDir);

  const { model, error } = resolveModel(params.provider, params.model, agentDir, params.cfg);
  if (!model || error) {
    throw new Error(error ?? `Failed to resolve model: ${params.provider}/${params.model}`);
  }

  const auth = await resolveApiKeyForProvider({
    provider: params.provider,
    cfg: params.cfg,
    profileId: params.authProfileId,
    agentDir,
  });
  let apiKey = auth.apiKey?.trim() ?? "";
  if (!apiKey && auth.mode !== "aws-sdk") {
    throw new Error(
      `No API key resolved for provider "${params.provider}" (auth mode: ${auth.mode}).`,
    );
  }

  // GitHub Copilot special case: exchange GitHub token for Copilot API token
  if (params.provider === "github-copilot") {
    const { resolveCopilotApiToken } = await import("../providers/github-copilot-token.js");
    const copilotToken = await resolveCopilotApiToken({ githubToken: apiKey });
    apiKey = copilotToken.token;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  timer.unref?.();

  try {
    const res = await completeSimple(
      model as Model<Api>,
      {
        messages: [
          {
            role: "user",
            content: params.prompt,
            timestamp: startedAt,
          },
        ],
      },
      {
        apiKey,
        maxTokens,
        temperature: params.temperature,
        signal: controller.signal,
      },
    );

    const text = res.content
      .filter(isTextContentBlock)
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) {
      throw new Error("No text returned");
    }

    return {
      text,
      provider: params.provider,
      model: params.model,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const error = err as Error;
    if (error?.name === "AbortError") {
      throw new Error("Completion timed out", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Complete text using a model reference string (e.g., "anthropic/claude-sonnet-4-5" or "haiku").
 * Resolves the model ref, then delegates to completeText().
 */
export async function completeTextWithModelRef(params: {
  cfg: OpenClawConfig;
  modelRef: string;
  prompt: string;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  const defaultRef = resolveDefaultModelForAgent({ cfg: params.cfg, agentId: undefined });
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: defaultRef.provider,
  });
  const resolved = resolveModelRefFromString({
    raw: params.modelRef,
    defaultProvider: defaultRef.provider,
    aliasIndex,
  });
  if (!resolved) {
    throw new Error(`Invalid model ref: ${params.modelRef}`);
  }

  const result = await completeText({
    cfg: params.cfg,
    provider: resolved.ref.provider,
    model: resolved.ref.model,
    prompt: params.prompt,
    timeoutMs: params.timeoutMs,
    maxTokens: params.maxTokens,
  });

  return {
    text: result.text,
    model: `${result.provider}/${result.model}`,
  };
}

export async function probeModelRefAuth(params: {
  cfg: OpenClawConfig;
  modelRef: string;
}): Promise<{
  ok: boolean;
  provider: string;
  hasKey: boolean;
  source?: string;
  error?: string;
}> {
  const defaultRef = resolveDefaultModelForAgent({ cfg: params.cfg, agentId: undefined });
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: defaultRef.provider,
  });
  const resolved = resolveModelRefFromString({
    raw: params.modelRef,
    defaultProvider: defaultRef.provider,
    aliasIndex,
  });
  if (!resolved) {
    return {
      ok: false,
      provider: "",
      hasKey: false,
      error: `Invalid model ref: ${params.modelRef}`,
    };
  }

  const provider = resolved.ref.provider;
  try {
    const agentDir = resolveOpenClawAgentDir();
    await ensureOpenClawModelsJson(params.cfg, agentDir);
    const { model, error } = resolveModel(provider, resolved.ref.model, agentDir, params.cfg);
    if (!model || error) {
      return {
        ok: true,
        provider,
        hasKey: false,
        error: error ?? `Failed to resolve model: ${provider}/${resolved.ref.model}`,
      };
    }
    const auth = await getApiKeyForModel({ model: model as Model<Api>, cfg: params.cfg, agentDir });
    const key = auth.apiKey?.trim() ?? "";
    return {
      ok: true,
      provider,
      hasKey: Boolean(key) || auth.mode === "aws-sdk",
      source: auth.source,
      ...(key ? {} : auth.mode === "aws-sdk" ? {} : { error: `Missing API key (${auth.mode})` }),
    };
  } catch (err) {
    return {
      ok: true,
      provider,
      hasKey: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
