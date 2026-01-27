/**
 * Onboarding Phases - Simplified Structure
 *
 * Redesigned for minimal questions and progressive disclosure.
 * 4 phases, each focused on a single decision area.
 * Advanced options are embedded within each phase.
 */

import type { IconName } from "../icons";
import type {
  ChannelCard,
  ModelCard,
  CardStatus,
} from "./onboarding-cards";

// ============================================================================
// Types
// ============================================================================

export type OnboardingPhase = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  required: boolean;
  canSkip: boolean;
  estimatedTime: string;
};

export type QuickStartForm = {
  workspace: string;
  authProvider: "anthropic" | "openai" | "google" | "other";
  model?: string;
  // Advanced options
  gatewayPort?: number;
  gatewayMode?: "local" | "remote";
  showAdvanced: boolean;
};

// ============================================================================
// Phase Definitions
// ============================================================================

export const ONBOARDING_PHASES: OnboardingPhase[] = [
  {
    id: "quickstart",
    title: "Quick Start",
    description: "Get started in 60 seconds",
    icon: "zap",
    required: true,
    canSkip: false,
    estimatedTime: "1 min",
  },
  {
    id: "channels",
    title: "Messaging Apps",
    description: "Add your chat platforms",
    icon: "message-square",
    required: false,
    canSkip: true,
    estimatedTime: "2 min",
  },
  {
    id: "models",
    title: "AI Models",
    description: "Configure additional models",
    icon: "cpu",
    required: false,
    canSkip: true,
    estimatedTime: "1 min",
  },
  {
    id: "ready",
    title: "Ready to Go",
    description: "Review and start",
    icon: "check-circle",
    required: true,
    canSkip: false,
    estimatedTime: "30 sec",
  },
];

// ============================================================================
// Default Channels
// ============================================================================

export const DEFAULT_CHANNELS: Array<{ id: string; name: string; icon: IconName; description: string; popular: boolean }> = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "message-square",
    description: "Connect via WhatsApp Web QR code",
    popular: true,
  },
  {
    id: "discord",
    name: "Discord",
    icon: "message-square",
    description: "Connect via Discord bot token",
    popular: true,
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "send",
    description: "Connect via Telegram bot token",
    popular: true,
  },
  {
    id: "slack",
    name: "Slack",
    icon: "message-square",
    description: "Connect via Slack app",
    popular: false,
  },
  {
    id: "signal",
    name: "Signal",
    icon: "radio",
    description: "Link Signal desktop",
    popular: false,
  },
  {
    id: "imessage",
    name: "iMessage",
    icon: "message-square",
    description: "Apple Messages integration",
    popular: false,
  },
];

// ============================================================================
// Default Models
// ============================================================================

export const DEFAULT_MODELS: Array<{ id: string; name: string; provider: string; icon: IconName; description: string }> = [
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    icon: "cpu",
    description: "Best balance of intelligence and speed",
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    icon: "cpu",
    description: "Most capable for complex tasks",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    icon: "cpu",
    description: "Fast and multimodal",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    icon: "cpu",
    description: "Fast and cost-effective",
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "Google",
    icon: "cpu",
    description: "Google's latest model",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function getPhaseById(phaseId: string): OnboardingPhase | undefined {
  return ONBOARDING_PHASES.find((p) => p.id === phaseId);
}

export function getNextPhase(currentPhaseId: string): OnboardingPhase | undefined {
  const currentIndex = ONBOARDING_PHASES.findIndex((p) => p.id === currentPhaseId);
  if (currentIndex === -1 || currentIndex === ONBOARDING_PHASES.length - 1) {
    return undefined;
  }
  return ONBOARDING_PHASES[currentIndex + 1];
}

export function getPreviousPhase(currentPhaseId: string): OnboardingPhase | undefined {
  const currentIndex = ONBOARDING_PHASES.findIndex((p) => p.id === currentPhaseId);
  if (currentIndex <= 0) {
    return undefined;
  }
  return ONBOARDING_PHASES[currentIndex - 1];
}

export function getChannelById(channelId: string): typeof DEFAULT_CHANNELS[0] | undefined {
  return DEFAULT_CHANNELS.find((c) => c.id === channelId);
}

export function getModelById(modelId: string): typeof DEFAULT_MODELS[0] | undefined {
  return DEFAULT_MODELS.find((m) => m.id === modelId);
}

/**
 * Get default quickstart form values
 */
export function getDefaultQuickStartForm(): QuickStartForm {
  return {
    workspace: "~/clawdbot",
    authProvider: "anthropic",
    model: "claude-3-5-sonnet",
    gatewayPort: 18789,
    gatewayMode: "local",
    showAdvanced: false,
  };
}

/**
 * Create channel card from config
 */
export function createChannelCard(
  channelId: string,
  config: Record<string, unknown>,
): ChannelCard {
  const channelDef = getChannelById(channelId);
  const channelConfig = config.channels?.[channelId] as Record<string, unknown> | undefined;

  // Determine status
  let status: CardStatus = "not-configured";
  if (channelConfig?.enabled) {
    status = "configured";
  }

  // Get details
  let details = "Not configured";
  if (channelId === "whatsapp" && channelConfig?.phoneNumber) {
    details = String(channelConfig.phoneNumber);
  } else if (channelId === "discord" && channelConfig?.botToken) {
    details = "Bot configured";
  } else if (channelId === "telegram" && channelConfig?.botToken) {
    details = "Bot configured";
  } else if (status === "configured") {
    details = "Connected";
  }

  return {
    id: channelId,
    name: channelDef?.name || channelId,
    icon: channelDef?.icon || "message-square",
    status,
    details,
    config: channelConfig,
  };
}

/**
 * Create model card from config
 */
export function createModelCard(
  modelId: string,
  config: Record<string, unknown>,
): ModelCard {
  const modelDef = getModelById(modelId);

  // Determine status (default model from quickstart is always configured)
  const isDefaultModel = config.agents?.defaults?.model === modelId;
  const status: CardStatus = isDefaultModel ? "configured" : "not-configured";

  return {
    id: modelId,
    name: modelDef?.name || modelId,
    provider: modelDef?.provider || "Unknown",
    icon: modelDef?.icon || "cpu",
    status,
    details: modelDef?.description || "",
    config: {},
  };
}

/**
 * Get all configured channel cards
 */
export function getChannelCards(config: Record<string, unknown>): ChannelCard[] {
  const cards: ChannelCard[] = [];

  // Check which channels have config
  const channels = config.channels as Record<string, unknown> | undefined;
  if (channels) {
    for (const channelId of Object.keys(channels)) {
      cards.push(createChannelCard(channelId, config));
    }
  }

  return cards;
}

/**
 * Get all configured model cards
 */
export function getModelCards(config: Record<string, unknown>): ModelCard[] {
  const cards: ModelCard[] = [];

  // Add default model
  const defaultModel = config.agents?.defaults?.model;
  if (typeof defaultModel === "string") {
    cards.push(createModelCard(defaultModel, config));
  }

  // Add any additional configured models
  // (This would be expanded when we support multiple models)

  return cards;
}
