/**
 * Smart Model Router - Configuration
 *
 * Default configuration and config utilities.
 */

import type { RoutingConfig, OverridePattern } from "./types.js";

/**
 * Model identifiers
 */
export const MODELS = {
  HAIKU: "claude-haiku-4",
  SONNET: "claude-sonnet-4",
  OPUS: "claude-opus-4-5",
} as const;

/**
 * Default provider
 */
export const DEFAULT_PROVIDER = "anthropic";

/**
 * Default override patterns for explicit model selection
 */
export const DEFAULT_OVERRIDES: OverridePattern[] = [
  {
    pattern: "@opus",
    model: MODELS.OPUS,
    provider: DEFAULT_PROVIDER,
    stripPattern: true,
  },
  {
    pattern: "@sonnet",
    model: MODELS.SONNET,
    provider: DEFAULT_PROVIDER,
    stripPattern: true,
  },
  {
    pattern: "@haiku",
    model: MODELS.HAIKU,
    provider: DEFAULT_PROVIDER,
    stripPattern: true,
  },
];

/**
 * Default routing configuration
 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  enabled: false,
  defaultModel: MODELS.HAIKU,
  defaultProvider: DEFAULT_PROVIDER,

  // Task-based routing
  tasks: {
    heartbeat: MODELS.HAIKU,
    status: MODELS.HAIKU,
    voice: MODELS.HAIKU,
    cron: MODELS.HAIKU,
    coding: MODELS.OPUS,
    subagent: MODELS.OPUS, // Subagents get full power
  },

  // Length-based thresholds
  thresholds: {
    promptTokens: {
      heavy: 2000,
      medium: 500, // Future use
    },
    contextTokens: {
      heavy: 100000,
      medium: 50000, // Future use
    },
    heavyModel: MODELS.OPUS,
    heavyProvider: DEFAULT_PROVIDER,
    mediumModel: MODELS.SONNET, // Future use
  },

  // Explicit override patterns
  overrides: DEFAULT_OVERRIDES,

  // Future: Middle tier (Sonnet)
  middleTier: {
    enabled: false,
    model: MODELS.SONNET,
    provider: DEFAULT_PROVIDER,
  },

  // Future: Local LLM support
  local: {
    enabled: false,
    provider: "ollama",
    url: "http://localhost:11434",
    triggers: ["@local", "@ollama"],
  },
};

/**
 * Deep clone the config object
 */
function cloneConfig(config: RoutingConfig): RoutingConfig {
  return {
    ...config,
    tasks: { ...config.tasks },
    taskProviders: config.taskProviders ? { ...config.taskProviders } : undefined,
    thresholds: {
      ...config.thresholds,
      promptTokens: { ...config.thresholds.promptTokens },
      contextTokens: { ...config.thresholds.contextTokens },
    },
    overrides: config.overrides.map((o) => ({ ...o })),
    middleTier: config.middleTier ? { ...config.middleTier } : undefined,
    local: config.local ? { ...config.local, triggers: [...config.local.triggers] } : undefined,
  };
}

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig?: Partial<RoutingConfig>): RoutingConfig {
  if (!userConfig) return cloneConfig(DEFAULT_ROUTING_CONFIG);

  return {
    ...DEFAULT_ROUTING_CONFIG,
    ...userConfig,
    tasks: {
      ...DEFAULT_ROUTING_CONFIG.tasks,
      ...userConfig.tasks,
    },
    thresholds: {
      ...DEFAULT_ROUTING_CONFIG.thresholds,
      ...userConfig.thresholds,
      promptTokens: {
        ...DEFAULT_ROUTING_CONFIG.thresholds.promptTokens,
        ...userConfig.thresholds?.promptTokens,
      },
      contextTokens: {
        ...DEFAULT_ROUTING_CONFIG.thresholds.contextTokens,
        ...userConfig.thresholds?.contextTokens,
      },
    },
    overrides: userConfig.overrides ?? DEFAULT_ROUTING_CONFIG.overrides,
    middleTier: userConfig.middleTier ?? DEFAULT_ROUTING_CONFIG.middleTier,
    local: userConfig.local ?? DEFAULT_ROUTING_CONFIG.local,
  };
}

/**
 * Validate routing configuration
 */
export function validateConfig(config: RoutingConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.defaultModel?.trim()) {
    errors.push("defaultModel is required");
  }

  if (!config.defaultProvider?.trim()) {
    errors.push("defaultProvider is required");
  }

  if (typeof config.thresholds?.promptTokens?.heavy !== "number") {
    errors.push("thresholds.promptTokens.heavy must be a number");
  }

  if (typeof config.thresholds?.contextTokens?.heavy !== "number") {
    errors.push("thresholds.contextTokens.heavy must be a number");
  }

  if (!Array.isArray(config.overrides)) {
    errors.push("overrides must be an array");
  } else {
    config.overrides.forEach((override, idx) => {
      if (!override.pattern?.trim()) {
        errors.push(`overrides[${idx}].pattern is required`);
      }
      if (!override.model?.trim()) {
        errors.push(`overrides[${idx}].model is required`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
