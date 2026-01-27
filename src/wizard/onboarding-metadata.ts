/**
 * Onboarding Metadata Helpers
 *
 * Backend utilities for tracking onboarding progress in the config file.
 * Progress is stored in config.wizard.onboarding for resumption safety.
 */

import type { ClawdbotConfig } from "../config/config.js";

// ============================================================================
// Types
// ============================================================================

export type OnboardingProgress = {
  startedAt: string;
  currentPhase: string;
  completedPhases: string[];
  phaseData: Record<string, Record<string, unknown>>;
  lastSavedAt: string;
};

export type OnboardingMetadata = {
  command: string;
  mode?: string;
  onboarding?: OnboardingProgress;
};

// ============================================================================
// Read Functions
// ============================================================================

/**
 * Extract onboarding progress from the config object.
 * Returns undefined if no onboarding is in progress.
 */
export function readOnboardingProgress(config: ClawdbotConfig): OnboardingProgress | undefined {
  const wizard = config.wizard as Record<string, unknown> | undefined;
  if (!wizard) return undefined;

  const onboarding = wizard.onboarding as OnboardingProgress | undefined;
  if (!onboarding) return undefined;

  // Validate structure
  if (
    typeof onboarding.startedAt !== "string" ||
    typeof onboarding.currentPhase !== "string" ||
    !Array.isArray(onboarding.completedPhases) ||
    typeof onboarding.phaseData !== "object" ||
    typeof onboarding.lastSavedAt !== "string"
  ) {
    return undefined;
  }

  return onboarding;
}

/**
 * Check if onboarding is complete.
 * Onboarding is complete if all required phases are done.
 */
export function isOnboardingComplete(config: ClawdbotConfig): boolean {
  const progress = readOnboardingProgress(config);
  if (!progress) return false;

  // Required phases: essentials, health-check
  const requiredPhases = ["essentials", "health-check"];
  return requiredPhases.every((phase) => progress.completedPhases.includes(phase));
}

/**
 * Check if onboarding is in progress (started but not complete).
 */
export function isOnboardingInProgress(config: ClawdbotConfig): boolean {
  const progress = readOnboardingProgress(config);
  return progress !== undefined && !isOnboardingComplete(config);
}

/**
 * Determine which phase to resume from.
 * Returns the currentPhase if not completed, otherwise the next incomplete phase.
 */
export function getResumptionPhase(config: ClawdbotConfig): string | null {
  const progress = readOnboardingProgress(config);
  if (!progress) return null;

  // If current phase is not completed, resume there
  if (!progress.completedPhases.includes(progress.currentPhase)) {
    return progress.currentPhase;
  }

  // Find the next incomplete phase
  const allPhases = ["essentials", "channels", "advanced", "health-check"];
  for (const phase of allPhases) {
    if (!progress.completedPhases.includes(phase)) {
      return phase;
    }
  }

  // All phases complete
  return null;
}

/**
 * Get phase-specific data that was saved during onboarding.
 */
export function getPhaseData(
  config: ClawdbotConfig,
  phaseId: string,
): Record<string, unknown> | undefined {
  const progress = readOnboardingProgress(config);
  if (!progress) return undefined;

  return progress.phaseData[phaseId];
}

// ============================================================================
// Write Functions
// ============================================================================

/**
 * Initialize onboarding progress in the config.
 * This should be called when the user starts the onboarding wizard.
 */
export function initOnboardingProgress(config: ClawdbotConfig): ClawdbotConfig {
  const now = new Date().toISOString();

  return {
    ...config,
    wizard: {
      ...(config.wizard as Record<string, unknown> | undefined),
      onboarding: {
        startedAt: now,
        currentPhase: "essentials",
        completedPhases: [],
        phaseData: {},
        lastSavedAt: now,
      },
    },
  };
}

/**
 * Update onboarding progress after completing a phase.
 * Merges phase data with config and updates progress tracking.
 */
export function writeOnboardingProgress(
  config: ClawdbotConfig,
  phaseId: string,
  phaseData: Record<string, unknown>,
): ClawdbotConfig {
  const progress = readOnboardingProgress(config);
  const now = new Date().toISOString();

  if (!progress) {
    // Initialize if not exists
    return writeOnboardingProgress(initOnboardingProgress(config), phaseId, phaseData);
  }

  // Merge phase data into existing phaseData
  const existingPhaseData = progress.phaseData[phaseId] ?? {};
  const mergedPhaseData = {
    ...existingPhaseData,
    ...phaseData,
  };

  // Update completed phases if not already included
  const completedPhases = progress.completedPhases.includes(phaseId)
    ? progress.completedPhases
    : [...progress.completedPhases, phaseId];

  // Determine next phase
  const allPhases = ["essentials", "channels", "advanced", "health-check"];
  const currentIndex = allPhases.indexOf(phaseId);
  const nextPhase = currentIndex < allPhases.length - 1 ? allPhases[currentIndex + 1] : phaseId;

  const newProgress: OnboardingProgress = {
    ...progress,
    currentPhase: nextPhase,
    completedPhases,
    phaseData: {
      ...progress.phaseData,
      [phaseId]: mergedPhaseData,
    },
    lastSavedAt: now,
  };

  return {
    ...config,
    wizard: {
      ...(config.wizard as Record<string, unknown> | undefined),
      onboarding: newProgress,
    },
  };
}

/**
 * Update the current phase without marking it complete.
 * Use this when the user navigates to a different phase.
 */
export function updateCurrentPhase(config: ClawdbotConfig, phaseId: string): ClawdbotConfig {
  const progress = readOnboardingProgress(config);
  if (!progress) return config;

  const now = new Date().toISOString();

  return {
    ...config,
    wizard: {
      ...(config.wizard as Record<string, unknown> | undefined),
      onboarding: {
        ...progress,
        currentPhase: phaseId,
        lastSavedAt: now,
      },
    },
  };
}

/**
 * Mark onboarding as complete and clean up metadata.
 * This removes the onboarding progress from the config.
 */
export function completeOnboarding(config: ClawdbotConfig): ClawdbotConfig {
  const wizard = config.wizard as Record<string, unknown> | undefined;
  if (!wizard) return config;

  // Remove onboarding metadata
  const { onboarding: _onboarding, ...remainingWizard } = wizard;

  return {
    ...config,
    wizard: Object.keys(remainingWizard).length > 0 ? remainingWizard : undefined,
  };
}

/**
 * Reset onboarding progress.
 * Use this to start fresh or clear incomplete onboarding.
 */
export function resetOnboarding(config: ClawdbotConfig): ClawdbotConfig {
  return completeOnboarding(config);
}

/**
 * Apply phase data to the main config object.
 * This merges the phase-specific config changes into the main config.
 */
export function applyPhaseData(
  config: ClawdbotConfig,
  phaseData: Record<string, unknown>,
): ClawdbotConfig {
  // Deep merge phase data into config
  return deepMerge(config, phaseData);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deep merge two objects.
 * The source object is merged into the target object.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}
