/**
 * Onboarding Controller
 *
 * Backend integration for the onboarding wizard.
 * Handles incremental config writes, progress tracking, and validation.
 */

import { toast } from "../components/toast";
import type {
  ConfigSnapshot,
  ConfigUiHints,
} from "../types";
import {
  cloneConfigObject,
  serializeConfigForm,
} from "../config/form-utils";
import type {
  OnboardingProgress,
  OnboardingWizardState,
} from "../views/onboarding-phases";
import {
  createWizardState,
  openWizard,
  closeWizard,
  setActivePhase,
  setActiveSection,
  setDirty,
  toggleAdvanced,
  showConfirmClose,
  hideConfirmClose,
} from "../views/onboarding-wizard";

// ============================================================================
// Types
// ============================================================================

export type OnboardingState = {
  wizard: OnboardingWizardState;
  client: import("../gateway").GatewayBrowserClient | null;
  connected: boolean;
  configLoading: boolean;
  configSaving: boolean;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormDirty: boolean;
  lastError: string | null;
};

// ============================================================================
// Load Functions
// ============================================================================

/**
 * Load the current onboarding state from the gateway.
 * This checks if there's incomplete onboarding to resume.
 */
export async function loadOnboardingState(state: OnboardingState): Promise<void> {
  if (!state.client || !state.connected) {
    state.lastError = "Not connected to gateway";
    return;
  }

  state.configLoading = true;
  state.lastError = null;

  try {
    // Load current config to check for onboarding progress
    const res = (await state.client.request("config.get", {})) as ConfigSnapshot;
    state.configSnapshot = res;
    state.configForm = cloneConfigObject(res.config ?? {});
    state.configFormOriginal = cloneConfigObject(res.config ?? {});
    state.configFormDirty = false;

    // Extract onboarding progress from config
    const wizardData = res.config?.wizard as Record<string, unknown> | undefined;
    const onboardingData = wizardData?.onboarding as OnboardingProgress | undefined;

    // Update wizard state with progress
    if (onboardingData) {
      state.wizard = openWizard(state.wizard, onboardingData);
    }
  } catch (err) {
    state.lastError = String(err);
    toast.error("Failed to load onboarding state");
  } finally {
    state.configLoading = false;
  }
}

/**
 * Save the onboarding progress for a single phase.
 * This writes the config incrementally for resumption safety.
 */
export async function saveOnboardingPhase(
  state: OnboardingState,
  phaseId: string,
  phaseData: Record<string, unknown>,
): Promise<void> {
  if (!state.client || !state.connected) {
    state.lastError = "Not connected to gateway";
    toast.error("Not connected to gateway");
    return;
  }

  state.configSaving = true;
  state.lastError = null;

  try {
    // Merge phase data into current config
    const mergedConfig = {
      ...state.configForm,
      ...phaseData,
    };

    // Serialize to raw YAML
    const raw = serializeConfigForm(mergedConfig);
    const baseHash = state.configSnapshot?.hash;

    if (!baseHash) {
      state.lastError = "Config hash missing";
      toast.error("Config hash missing; reload and retry");
      return;
    }

    // Send to gateway with onboarding metadata
    await state.client.request("config.set", {
      raw,
      baseHash,
      metadata: {
        wizard: {
          onboarding: {
            phaseId,
            phaseData,
            timestamp: new Date().toISOString(),
          },
        },
      },
    });

    // Update local state
    state.configForm = mergedConfig;
    state.configFormDirty = false;

    // Reload to get the updated config with metadata
    await loadOnboardingState(state);

    toast.success(`Phase "${phaseId}" saved`);
  } catch (err) {
    state.lastError = String(err);
    toast.error(`Failed to save phase: ${err}`);
  } finally {
    state.configSaving = false;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that all required fields for a phase are complete.
 */
export function validatePhaseCompletion(
  state: OnboardingState,
  phaseId: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = state.configForm ?? {};

  switch (phaseId) {
    case "essentials": {
      // Check workspace
      const agents = config.agents as Record<string, unknown> | undefined;
      const defaults = agents?.defaults as Record<string, unknown> | undefined;

      if (!defaults || typeof defaults.workspace !== "string") {
        errors.push("Workspace directory is required");
      }

      // Check auth provider
      if (!defaults || typeof defaults.authProvider !== "string") {
        errors.push("Authentication provider is required");
      }

      // Check model
      if (!defaults || typeof defaults.model !== "string") {
        errors.push("Model selection is required");
      }

      // Check gateway mode
      const gateway = config.gateway as Record<string, unknown> | undefined;
      if (!gateway || typeof gateway.mode !== "string") {
        errors.push("Gateway mode is required");
      }

      break;
    }

    case "channels": {
      // Channels is optional, no validation required
      break;
    }

    case "advanced": {
      // Advanced is optional, no validation required
      break;
    }

    case "health-check": {
      // Health check validates by running tests, not by checking config
      break;
    }

    default: {
      errors.push(`Unknown phase: ${phaseId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Completion Functions
// ============================================================================

/**
 * Complete the onboarding process.
 * This clears the onboarding metadata and marks setup as complete.
 */
export async function completeOnboarding(state: OnboardingState): Promise<void> {
  if (!state.client || !state.connected) {
    state.lastError = "Not connected to gateway";
    toast.error("Not connected to gateway");
    return;
  }

  state.configSaving = true;
  state.lastError = null;

  try {
    // Get current config
    const currentConfig = state.configForm ?? {};
    const raw = serializeConfigForm(currentConfig);
    const baseHash = state.configSnapshot?.hash;

    if (!baseHash) {
      state.lastError = "Config hash missing";
      toast.error("Config hash missing; reload and retry");
      return;
    }

    // Remove onboarding metadata from config
    const wizardData = currentConfig.wizard as Record<string, unknown> | undefined;
    const { onboarding, ...remainingWizard } = wizardData ?? {};

    const cleanedConfig = {
      ...currentConfig,
      wizard: Object.keys(remainingWizard).length > 0 ? remainingWizard : undefined,
    };

    const cleanedRaw = serializeConfigForm(cleanedConfig);

    // Save cleaned config
    await state.client.request("config.set", {
      raw: cleanedRaw,
      baseHash,
    });

    // Update local state
    state.configForm = cleanedConfig;
    state.configFormDirty = false;
    state.wizard = closeWizard(state.wizard);

    // Reload to get final state
    await loadOnboardingState(state);

    toast.success("Onboarding complete!");
  } catch (err) {
    state.lastError = String(err);
    toast.error(`Failed to complete onboarding: ${err}`);
  } finally {
    state.configSaving = false;
  }
}

/**
 * Reset onboarding progress.
 * Use this to start fresh or clear incomplete onboarding.
 */
export async function resetOnboarding(state: OnboardingState): Promise<void> {
  if (!state.client || !state.connected) {
    state.lastError = "Not connected to gateway";
    toast.error("Not connected to gateway");
    return;
  }

  state.configSaving = true;
  state.lastError = null;

  try {
    // Get current config
    const currentConfig = state.configForm ?? {};
    const raw = serializeConfigForm(currentConfig);
    const baseHash = state.configSnapshot?.hash;

    if (!baseHash) {
      state.lastError = "Config hash missing";
      toast.error("Config hash missing; reload and retry");
      return;
    }

    // Remove onboarding metadata
    const wizardData = currentConfig.wizard as Record<string, unknown> | undefined;
    const { onboarding, ...remainingWizard } = wizardData ?? {};

    const cleanedConfig = {
      ...currentConfig,
      wizard: Object.keys(remainingWizard).length > 0 ? remainingWizard : undefined,
    };

    const cleanedRaw = serializeConfigForm(cleanedConfig);

    // Save cleaned config
    await state.client.request("config.set", {
      raw: cleanedRaw,
      baseHash,
    });

    // Update local state
    state.configForm = cleanedConfig;
    state.configFormDirty = false;
    state.wizard = createWizardState();

    // Reload to get final state
    await loadOnboardingState(state);

    toast.success("Onboarding reset");
  } catch (err) {
    state.lastError = String(err);
    toast.error(`Failed to reset onboarding: ${err}`);
  } finally {
    state.configSaving = false;
  }
}

// ============================================================================
// Health Check Functions
// ============================================================================

/**
 * Run health checks for the configured system.
 */
export async function runHealthCheck(state: OnboardingState): Promise<{
  gatewayReachable: boolean;
  channelsWorking: boolean;
  modelAccessible: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let gatewayReachable = false;
  let channelsWorking = false;
  let modelAccessible = false;

  if (!state.client || !state.connected) {
    errors.push("Not connected to gateway");
    return { gatewayReachable, channelsWorking, modelAccessible, errors };
  }

  try {
    // Test 1: Gateway health
    const health = (await state.client.request("health", {})) as {
      status?: string;
      uptime?: number;
    };
    gatewayReachable = health?.status === "ok";

    if (!gatewayReachable) {
      errors.push("Gateway is not reachable");
    }

    // Test 2: Channels status
    const channels = (await state.client.request("channels.status", {})) as {
      channels?: Record<string, { connected?: boolean }>;
    };
    const channelList = channels?.channels ?? {};
    const hasConnectedChannels = Object.values(channelList).some((ch) => ch.connected);
    channelsWorking = Object.keys(channelList).length === 0 || hasConnectedChannels;

    if (!channelsWorking) {
      errors.push("No channels are connected");
    }

    // Test 3: Model access (try a simple completion)
    const config = state.configForm ?? {};
    const agents = config.agents as Record<string, unknown> | undefined;
    const defaults = agents?.defaults as Record<string, unknown> | undefined;
    const model = defaults?.model;

    if (typeof model === "string" && model) {
      try {
        // Try a simple test call
        await state.client.request("agent.test", { model, maxTokens: 10 });
        modelAccessible = true;
      } catch {
        errors.push("Model API is not accessible");
      }
    } else {
      errors.push("No model configured");
    }
  } catch (err) {
    errors.push(`Health check failed: ${err}`);
  }

  return { gatewayReachable, channelsWorking, modelAccessible, errors };
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Handle phase change in the wizard.
 */
export function handlePhaseChange(
  state: OnboardingState,
  phaseId: string,
): void {
  state.wizard = setActivePhase(state.wizard, phaseId);
}

/**
 * Handle section change within a phase.
 */
export function handleSectionChange(
  state: OnboardingState,
  sectionId: string,
): void {
  state.wizard = setActiveSection(state.wizard, sectionId);
}

/**
 * Handle toggle of advanced settings.
 */
export function handleToggleAdvanced(state: OnboardingState): void {
  state.wizard = toggleAdvanced(state.wizard);
}

/**
 * Handle continue button click.
 */
export async function handleContinue(state: OnboardingState): Promise<void> {
  const currentPhase = state.wizard.currentPhase;

  // Validate current phase
  const validation = validatePhaseCompletion(state, currentPhase);
  if (!validation.valid) {
    toast.error(validation.errors.join("; "));
    return;
  }

  // Save phase data
  await saveOnboardingPhase(state, currentPhase, state.configForm ?? {});

  // Move to next phase or complete
  const phases = ["essentials", "channels", "advanced", "health-check"];
  const currentIndex = phases.indexOf(currentPhase);

  if (currentIndex < phases.length - 1) {
    const nextPhase = phases[currentIndex + 1];
    state.wizard = setActivePhase(state.wizard, nextPhase);
  } else {
    // Complete onboarding
    await completeOnboarding(state);
  }
}

/**
 * Handle back button click.
 */
export function handleBack(state: OnboardingState): void {
  const phases = ["essentials", "channels", "advanced", "health-check"];
  const currentIndex = phases.indexOf(state.wizard.currentPhase);

  if (currentIndex > 0) {
    const prevPhase = phases[currentIndex - 1];
    state.wizard = setActivePhase(state.wizard, prevPhase);
  }
}

/**
 * Handle skip button click.
 */
export function handleSkip(state: OnboardingState): void {
  const phases = ["essentials", "channels", "advanced", "health-check"];
  const currentIndex = phases.indexOf(state.wizard.currentPhase);

  if (currentIndex < phases.length - 1) {
    const nextPhase = phases[currentIndex + 1];
    state.wizard = setActivePhase(state.wizard, nextPhase);
  }
}

/**
 * Handle close button click.
 */
export function handleClose(state: OnboardingState): void {
  if (state.configFormDirty) {
    state.wizard = showConfirmClose(state.wizard);
  } else {
    state.wizard = closeWizard(state.wizard);
  }
}

/**
 * Handle confirm close dialog - keep editing.
 */
export function handleCancelClose(state: OnboardingState): void {
  state.wizard = hideConfirmClose(state.wizard);
}

/**
 * Handle confirm close dialog - discard and close.
 */
export async function handleConfirmClose(state: OnboardingState): Promise<void> {
  // Save progress before closing
  await saveOnboardingPhase(state, state.wizard.currentPhase, state.configForm ?? {});
  state.wizard = closeWizard(state.wizard);
}
