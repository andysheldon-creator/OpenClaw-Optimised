/**
 * Provider configuration builders for the Claude Agent SDK.
 *
 * Supports multiple authentication methods:
 * - Anthropic API key (ANTHROPIC_API_KEY)
 * - Claude Code CLI OAuth (reuses ~/.claude credentials)
 * - z.AI subscription (via ANTHROPIC_AUTH_TOKEN or CLI auth)
 * - OpenRouter (Anthropic-compatible API)
 * - AWS Bedrock
 * - Google Vertex AI
 */

import type { SdkProviderConfig, SdkProviderEnv } from "./types.js";
import { readClaudeCliCredentialsCached } from "../cli-credentials.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk");

/**
 * Build provider config for direct Anthropic API access.
 */
export function buildAnthropicSdkProvider(apiKey: string): SdkProviderConfig {
  return {
    name: "Anthropic",
    env: {
      ANTHROPIC_API_KEY: apiKey,
    },
  };
}

/**
 * Build provider config for Claude Code CLI/subscription auth.
 *
 * This method reads credentials from the Claude Code CLI's keychain/file storage,
 * enabling subscription-based access (Claude Max, z.AI, etc.) without an API key.
 *
 * The SDK will automatically use these credentials when they're available in the
 * environment or via the CLI's native auth mechanism.
 */
export function buildClaudeCliSdkProvider(): SdkProviderConfig | null {
  // Read cached credentials from Claude Code CLI
  const credentials = readClaudeCliCredentialsCached({
    allowKeychainPrompt: false,
    ttlMs: 60_000, // 1 minute cache
  });

  if (!credentials) {
    log.debug("No Claude CLI credentials found");
    return null;
  }

  // For OAuth credentials, use the access token as ANTHROPIC_AUTH_TOKEN
  if (credentials.type === "oauth") {
    // Check if token is expired
    if (credentials.expires < Date.now()) {
      log.warn("Claude CLI credentials expired", {
        expiresAt: new Date(credentials.expires).toISOString(),
      });
      // Still return the config - the SDK may handle refresh internally
    }

    return {
      name: "Claude CLI (subscription)",
      env: {
        ANTHROPIC_AUTH_TOKEN: credentials.access,
      },
    };
  }

  // For token-type credentials (less common)
  if (credentials.type === "token") {
    return {
      name: "Claude CLI (token)",
      env: {
        ANTHROPIC_AUTH_TOKEN: credentials.token,
      },
    };
  }

  return null;
}

/**
 * Build provider config for z.AI subscription access.
 *
 * z.AI uses Anthropic-compatible API with a different base URL.
 */
export function buildZaiSdkProvider(authToken: string): SdkProviderConfig {
  return {
    name: "z.AI",
    env: {
      ANTHROPIC_AUTH_TOKEN: authToken,
      // z.AI may use a custom base URL - leave unset to use default
      // The SDK or z.AI gateway handles routing
    },
  };
}

/**
 * Build provider config for OpenRouter (Anthropic-compatible).
 */
export function buildOpenRouterSdkProvider(apiKey: string): SdkProviderConfig {
  return {
    name: "OpenRouter (Anthropic-compatible)",
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api/v1",
      ANTHROPIC_API_KEY: apiKey,
    },
  };
}

/**
 * Build provider config for AWS Bedrock.
 *
 * AWS credentials should be configured via standard AWS mechanisms
 * (environment variables, shared credentials file, IAM role, etc.).
 */
export function buildBedrockSdkProvider(): SdkProviderConfig {
  return {
    name: "AWS Bedrock",
    env: {
      CLAUDE_CODE_USE_BEDROCK: "1",
    },
  };
}

/**
 * Build provider config for Google Vertex AI.
 *
 * Google Cloud credentials should be configured via standard GCP mechanisms
 * (GOOGLE_APPLICATION_CREDENTIALS, default credentials, etc.).
 */
export function buildVertexSdkProvider(): SdkProviderConfig {
  return {
    name: "Google Vertex AI",
    env: {
      CLAUDE_CODE_USE_VERTEX: "1",
    },
  };
}

/**
 * Resolve provider configuration based on available credentials.
 *
 * Priority order:
 * 1. Explicit API key from config/env
 * 2. Claude Code CLI credentials (subscription auth)
 * 3. Environment variables (fallback)
 */
export function resolveProviderConfig(options?: {
  apiKey?: string;
  authToken?: string;
  baseUrl?: string;
  useCliCredentials?: boolean;
}): SdkProviderConfig {
  // 1. Explicit API key takes precedence
  if (options?.apiKey) {
    const config = buildAnthropicSdkProvider(options.apiKey);
    if (options.baseUrl && config.env) {
      config.env.ANTHROPIC_BASE_URL = options.baseUrl;
    }
    return config;
  }

  // 2. Explicit auth token (OAuth/subscription)
  if (options?.authToken) {
    const env: SdkProviderEnv = {
      ANTHROPIC_AUTH_TOKEN: options.authToken,
    };
    if (options.baseUrl) {
      env.ANTHROPIC_BASE_URL = options.baseUrl;
    }
    return {
      name: "Anthropic (auth token)",
      env,
    };
  }

  // 3. Try Claude CLI credentials if enabled (default: true)
  if (options?.useCliCredentials !== false) {
    const cliConfig = buildClaudeCliSdkProvider();
    if (cliConfig) {
      if (options?.baseUrl && cliConfig.env) {
        cliConfig.env.ANTHROPIC_BASE_URL = options.baseUrl;
      }
      return cliConfig;
    }
  }

  // 4. Check environment variables
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  const envAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (envApiKey) {
    return {
      name: "Anthropic (env)",
      env: {
        ANTHROPIC_API_KEY: envApiKey,
        ANTHROPIC_BASE_URL: options?.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
      },
    };
  }

  if (envAuthToken) {
    return {
      name: "Anthropic (env auth token)",
      env: {
        ANTHROPIC_AUTH_TOKEN: envAuthToken,
        ANTHROPIC_BASE_URL: options?.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
      },
    };
  }

  // 5. Return empty config - SDK will use its own credential resolution
  log.debug("No explicit credentials provided, SDK will use native auth");
  return {
    name: "Anthropic (SDK native)",
    env: {},
  };
}
