import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { resolveClawdbotAgentDir } from "../agents/agent-paths.js";
import type { ClawdbotConfig } from "../config/config.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthProfileConfig } from "./onboard-auth.js";

const QUOTIO_DEFAULT_BASE_URL = "http://127.0.0.1:18317/v1";
const QUOTIO_DEFAULT_API_KEY = "quotio-local";
const QUOTIO_DEFAULT_MODEL = "quotio/gemini-claude-sonnet-4-thinking";

const QUOTIO_MODELS = [
  {
    id: "gemini-claude-opus-4-5-thinking",
    name: "Claude Opus 4.5 (Quotio)",
    reasoning: false,
    input: ["text", "image"] as Array<"text" | "image">,
    contextWindow: 200000,
    maxTokens: 32000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "gemini-claude-sonnet-4-thinking",
    name: "Claude Sonnet 4 (Quotio)",
    reasoning: false,
    input: ["text", "image"] as Array<"text" | "image">,
    contextWindow: 200000,
    maxTokens: 32000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash (Quotio)",
    reasoning: false,
    input: ["text", "image"] as Array<"text" | "image">,
    contextWindow: 1000000,
    maxTokens: 65536,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
];

function applyQuotioProviderConfig(
  config: ClawdbotConfig,
  baseUrl: string,
  apiKey: string,
): ClawdbotConfig {
  return {
    ...config,
    models: {
      ...config.models,
      providers: {
        ...config.models?.providers,
        quotio: {
          baseUrl,
          apiKey,
          api: "openai-completions",
          models: QUOTIO_MODELS,
        },
      },
    },
  };
}

function applyQuotioDefaultModel(config: ClawdbotConfig): ClawdbotConfig {
  const models = { ...config.agents?.defaults?.models };
  models[QUOTIO_DEFAULT_MODEL] = models[QUOTIO_DEFAULT_MODEL] ?? {};

  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        models,
        model: {
          primary: QUOTIO_DEFAULT_MODEL,
        },
      },
    },
  };
}

export async function applyAuthChoiceQuotio(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "quotio") return null;

  let nextConfig = params.config;
  const agentDir = params.agentDir ?? resolveClawdbotAgentDir();

  await params.prompter.note(
    [
      "Quotio is a local OpenAI-compatible proxy that routes to various AI models.",
      "Make sure Quotio is running before using clawdbot.",
      "Default endpoint: http://127.0.0.1:18317/v1",
    ].join("\n"),
    "Quotio",
  );

  const baseUrl = await params.prompter.text({
    message: "Enter Quotio base URL",
    initialValue: QUOTIO_DEFAULT_BASE_URL,
    validate: (value) => {
      if (!value?.trim()) return "Base URL is required";
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Invalid URL format";
      }
    },
  });

  const apiKey = await params.prompter.text({
    message: "Enter Quotio API key (or leave default for local)",
    initialValue: QUOTIO_DEFAULT_API_KEY,
  });

  upsertAuthProfile({
    profileId: "quotio:default",
    credential: {
      type: "api_key",
      provider: "quotio",
      key: String(apiKey).trim() || QUOTIO_DEFAULT_API_KEY,
    },
    agentDir,
  });

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "quotio:default",
    provider: "quotio",
    mode: "api_key",
  });

  nextConfig = applyQuotioProviderConfig(
    nextConfig,
    String(baseUrl).trim() || QUOTIO_DEFAULT_BASE_URL,
    String(apiKey).trim() || QUOTIO_DEFAULT_API_KEY,
  );

  let agentModelOverride: string | undefined;
  if (params.setDefaultModel) {
    nextConfig = applyQuotioDefaultModel(nextConfig);
    await params.prompter.note(`Default model set to ${QUOTIO_DEFAULT_MODEL}`, "Model configured");
  } else if (params.agentId) {
    agentModelOverride = QUOTIO_DEFAULT_MODEL;
    await params.prompter.note(
      `Default model set to ${QUOTIO_DEFAULT_MODEL} for agent "${params.agentId}".`,
      "Model configured",
    );
  }

  return { config: nextConfig, agentModelOverride };
}
