/**
 * Onboarding Wizard - Simplified Design
 *
 * Step-by-step wizard with minimal questions per phase.
 * Card-based layout for channels and models.
 * Progressive disclosure with embedded advanced options.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { ConfigUiHints } from "../types";
import type { JsonSchema } from "./config-form";
import { icon } from "../icons";
import {
  renderChannelCardList,
  renderModelCardList,
  renderAddCardModal,
  type ChannelCard as ChannelCardType,
  type ModelCard as ModelCardType,
} from "./onboarding-cards";
import {
  renderConfigModal,
  type ConfigModalState,
  createConfigModalState,
} from "./onboarding-modal";
import {
  ONBOARDING_PHASES,
  type QuickStartForm,
  type ChannelCard,
  type ModelCard,
  getChannelCards,
  getModelCards,
  createChannelCard,
  createModelCard,
  DEFAULT_CHANNELS,
  DEFAULT_MODELS,
  getChannelById,
  getModelById,
  getDefaultQuickStartForm,
} from "./onboarding-phases";

// ============================================================================
// Types
// ============================================================================

export type OnboardingWizardState = {
  open: boolean;
  currentPhase: string;
  step: number;
  totalSteps: number;
  quickStartForm: QuickStartForm;
  channelCards: ChannelCard[];
  modelCards: ModelCard[];
  addModalOpen: boolean;
  addModalType: "channel" | "model" | null;
  configModal: ConfigModalState;
  isDirty: boolean;
  isSaving: boolean;
  showConfirmClose: boolean;
  progress: {
    startedAt: string;
    completedPhases: string[];
    lastSavedAt: string;
  } | null;
};

export type OnboardingWizardProps = {
  state: OnboardingWizardState;
  configSchema: JsonSchema | null;
  configValue: Record<string, unknown>;
  configSaving: boolean;
  configUiHints: ConfigUiHints;
  unsupported: Set<string>;
  onClose: () => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onAddChannel: (channelId: string) => void;
  onEditChannel: (channelId: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onAddModel: (modelId: string) => void;
  onEditModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
};

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render progress indicator (step X of Y)
 */
function renderProgressIndicator(params: {
  currentPhase: string;
  step: number;
  totalSteps: number;
}): TemplateResult {
  const currentPhaseDef = ONBOARDING_PHASES.find((p) => p.id === params.currentPhase);

  return html`
    <div class="onboarding-wizard-v2__progress">
      <div class="onboarding-wizard-v2__progress-text">
        Step ${params.step} of ${params.totalSteps}
      </div>
      <div class="onboarding-wizard-v2__progress-bar">
        <div
          class="onboarding-wizard-v2__progress-fill"
          style="width: ${(params.step / params.totalSteps) * 100}%"
        ></div>
      </div>
      ${
        currentPhaseDef
          ? html`
            <div class="onboarding-wizard-v2__progress-time">
              ${icon("clock", { size: 12 })} ${currentPhaseDef.estimatedTime}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * Render Phase 1: Quick Start (3 questions)
 */
function renderQuickStartPhase(params: {
  form: QuickStartForm;
  onFormChange: (updates: Partial<QuickStartForm>) => void;
  onToggleAdvanced: () => void;
}): TemplateResult {
  const { form, onFormChange, onToggleAdvanced } = params;

  return html`
    <div class="onboarding-wizard-v2__phase">
      <div class="onboarding-wizard-v2__phase-header">
        <div class="onboarding-wizard-v2__phase-icon">${icon("zap", { size: 32 })}</div>
        <div>
          <h2 class="onboarding-wizard-v2__phase-title">Welcome to Clawdbot!</h2>
          <p class="onboarding-wizard-v2__phase-subtitle">Let's get you started in 60 seconds</p>
        </div>
      </div>

      <div class="onboarding-wizard-v2__phase-body">
        <!-- Question 1: Workspace -->
        <div class="onboarding-wizard-v2__question">
          <label class="onboarding-wizard-v2__question-label">
            1. Where should Clawdbot work?
          </label>
          <input
            type="text"
            class="input input--md"
            .value=${form.workspace}
            @input=${(e: InputEvent) => {
              onFormChange({ workspace: (e.target as HTMLInputElement).value });
            }}
            placeholder="~/clawdbot"
          />
          <p class="onboarding-wizard-v2__question-hint">
            This is where your agent sessions and files will be stored.
          </p>
        </div>

        <!-- Question 2: AI Provider -->
        <div class="onboarding-wizard-v2__question">
          <label class="onboarding-wizard-v2__question-label">
            2. Which AI do you prefer?
          </label>
          <div class="onboarding-wizard-v2__provider-options">
            ${["anthropic", "openai", "google"].map(
              (provider) => html`
                <label class="onboarding-wizard-v2__provider-option">
                  <input
                    type="radio"
                    name="provider"
                    .value=${provider}
                    ?checked=${form.authProvider === provider}
                    @change=${() => onFormChange({ authProvider: provider as any })}
                  />
                  <span class="onboarding-wizard-v2__provider-label">
                    ${provider === "anthropic" ? "Anthropic (Claude)" : provider === "openai" ? "OpenAI (GPT)" : "Google (Gemini)"}
                  </span>
                </label>
              `,
            )}
          </div>
        </div>

        <!-- Question 3: Ready -->
        <div class="onboarding-wizard-v2__question">
          <label class="onboarding-wizard-v2__question-label">
            3. Ready to start?
          </label>
          <p class="onboarding-wizard-v2__question-hint">
            You can always change these settings later.
          </p>
        </div>

        <!-- Advanced Options (Collapsible) -->
        <details
          class="onboarding-wizard-v2__advanced"
          ?open=${form.showAdvanced}
          @toggle=${(e: Event) => {
            if ((e.target as HTMLDetailsElement).open) {
              onToggleAdvanced();
            }
          }}
        >
          <summary class="onboarding-wizard-v2__advanced-toggle">
            ${icon("settings", { size: 14 })} Advanced options
          </summary>
          <div class="onboarding-wizard-v2__advanced-body">
            <div class="onboarding-wizard-v2__question">
              <label class="onboarding-wizard-v2__question-label">Gateway port</label>
              <input
                type="number"
                class="input input--sm"
                .value=${form.gatewayPort ?? 18789}
                @input=${(e: InputEvent) => {
                  onFormChange({ gatewayPort: Number((e.target as HTMLInputElement).value) });
                }}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  `;
}

/**
 * Render Phase 2: Messaging Apps (Card List)
 */
function renderChannelsPhase(params: {
  cards: ChannelCard[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSkip: () => void;
}): TemplateResult {
  return html`
    <div class="onboarding-wizard-v2__phase">
      <div class="onboarding-wizard-v2__phase-header">
        <div class="onboarding-wizard-v2__phase-icon">${icon("message-square", { size: 32 })}</div>
        <div>
          <h2 class="onboarding-wizard-v2__phase-title">Add your messaging apps</h2>
          <p class="onboarding-wizard-v2__phase-subtitle">Connect the platforms you use every day</p>
        </div>
      </div>

      <div class="onboarding-wizard-v2__phase-body">
        ${renderChannelCardList(params.cards, {
          title: "Your apps",
          description: "Click to configure, or add a new one",
          addLabel: "Add another app",
          showSkip: true,
          onAdd: params.onAdd,
          onEdit: params.onEdit,
          onRemove: params.onRemove,
          onSkip: params.onSkip,
        })}
      </div>
    </div>
  `;
}

/**
 * Render Phase 3: AI Models (Card List)
 */
function renderModelsPhase(params: {
  cards: ModelCard[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSkip: () => void;
}): TemplateResult {
  return html`
    <div class="onboarding-wizard-v2__phase">
      <div class="onboarding-wizard-v2__phase-header">
        <div class="onboarding-wizard-v2__phase-icon">${icon("cpu", { size: 32 })}</div>
        <div>
          <h2 class="onboarding-wizard-v2__phase-title">Your AI models</h2>
          <p class="onboarding-wizard-v2__phase-subtitle">
            Your default model is already configured. Add more if you like.
          </p>
        </div>
      </div>

      <div class="onboarding-wizard-v2__phase-body">
        ${renderModelCardList(params.cards, {
          title: "Your models",
          description: "Click to edit, or add a new model",
          addLabel: "Add another model",
          showSkip: true,
          onAdd: params.onAdd,
          onEdit: params.onEdit,
          onRemove: params.onRemove,
          onSkip: params.onSkip,
        })}
      </div>
    </div>
  `;
}

/**
 * Render Phase 4: Ready to Go (Summary)
 */
function renderReadyPhase(): TemplateResult {
  return html`
    <div class="onboarding-wizard-v2__phase">
      <div class="onboarding-wizard-v2__phase-header">
        <div class="onboarding-wizard-v2__phase-icon">${icon("check-circle", { size: 32 })}</div>
        <div>
          <h2 class="onboarding-wizard-v2__phase-title">You're all set!</h2>
          <p class="onboarding-wizard-v2__phase-subtitle">Here's what we configured</p>
        </div>
      </div>

      <div class="onboarding-wizard-v2__phase-body">
        <div class="onboarding-wizard-v2__summary">
          <div class="onboarding-wizard-v2__summary-item">
            ${icon("check", { size: 20, color: "var(--success, 34, 197, 94)" })}
            <span>Workspace configured</span>
          </div>
          <div class="onboarding-wizard-v2__summary-item">
            ${icon("check", { size: 20, color: "var(--success, 34, 197, 94)" })}
            <span>AI provider selected</span>
          </div>
          <div class="onboarding-wizard-v2__summary-item">
            ${icon("check", { size: 20, color: "var(--success, 34, 197, 94)" })}
            <span>Gateway ready to start</span>
          </div>
        </div>

        <div class="onboarding-wizard-v2__next-steps">
          <h3>What's next?</h3>
          <p>Your gateway will start automatically. You can:</p>
          <ul>
            <li>Start chatting with your connected apps</li>
            <li>Configure more channels in Settings</li>
            <li>Add more AI models as needed</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render footer with navigation
 */
function renderFooter(params: {
  currentPhase: string;
  hasNextPhase: boolean;
  hasPreviousPhase: boolean;
  canSkip: boolean;
  isSaving: boolean;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}): TemplateResult {
  const {
    currentPhase,
    hasNextPhase,
    hasPreviousPhase,
    canSkip,
    isSaving,
    onBack,
    onSkip,
    onContinue,
  } = params;

  const isLastPhase = !hasNextPhase;

  return html`
    <div class="onboarding-wizard-v2__footer">
      <div class="onboarding-wizard-v2__footer-nav">
        ${
          hasPreviousPhase
            ? html`
              <button type="button" class="btn btn--sm" @click=${onBack}>
                ← Back
              </button>
            `
            : html`
                <div></div>
              `
        }
      </div>

      <div class="onboarding-wizard-v2__footer-actions">
        ${
          canSkip && !isLastPhase
            ? html`
              <button type="button" class="btn btn--sm" @click=${onSkip}>
                Skip →
              </button>
            `
            : nothing
        }

        <button
          type="button"
          class="btn btn--md primary"
          @click=${onContinue}
          ?disabled=${isSaving}
        >
          ${isLastPhase ? "Finish Setup" : "Continue →"}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Main Wizard Component
// ============================================================================

/**
 * Render the simplified onboarding wizard
 */
export function renderOnboardingWizard(
  params: OnboardingWizardProps,
): TemplateResult | typeof nothing {
  const {
    state,
    configValue,
    onAddChannel,
    onEditChannel,
    onRemoveChannel,
    onAddModel,
    onEditModel,
    onRemoveModel,
  } = params;

  if (!state.open) {
    return nothing;
  }

  const currentPhaseDef = ONBOARDING_PHASES.find((p) => p.id === state.currentPhase);
  if (!currentPhaseDef) {
    return html`<div>Phase not found: ${state.currentPhase}</div>`;
  }

  const hasNextPhase = ONBOARDING_PHASES.indexOf(currentPhaseDef) < ONBOARDING_PHASES.length - 1;
  const hasPreviousPhase = ONBOARDING_PHASES.indexOf(currentPhaseDef) > 0;
  const canSkip = currentPhaseDef.canSkip;

  // Render current phase content
  let phaseContent: TemplateResult;
  switch (state.currentPhase) {
    case "quickstart":
      phaseContent = renderQuickStartPhase({
        form: state.quickStartForm,
        onFormChange: (updates) => {
          state.quickStartForm = { ...state.quickStartForm, ...updates };
        },
        onToggleAdvanced: () => {
          state.quickStartForm.showAdvanced = !state.quickStartForm.showAdvanced;
        },
      });
      break;
    case "channels":
      phaseContent = renderChannelsPhase({
        cards: state.channelCards,
        onAdd: () => {
          state.addModalOpen = true;
          state.addModalType = "channel";
        },
        onEdit: onEditChannel,
        onRemove: onRemoveChannel,
        onSkip: params.onSkip,
      });
      break;
    case "models":
      phaseContent = renderModelsPhase({
        cards: state.modelCards,
        onAdd: () => {
          state.addModalOpen = true;
          state.addModalType = "model";
        },
        onEdit: onEditModel,
        onRemove: onRemoveModel,
        onSkip: params.onSkip,
      });
      break;
    case "ready":
      phaseContent = renderReadyPhase();
      break;
    default:
      phaseContent = html`<div>Unknown phase: ${state.currentPhase}</div>`;
  }

  return html`
    <div class="onboarding-wizard-v2-backdrop" @click=${() => (state.isDirty ? params.onClose() : params.onClose())}></div>
    <div class="onboarding-wizard-v2" @click=${(e: Event) => e.stopPropagation()}>
      ${renderProgressIndicator({
        currentPhase: state.currentPhase,
        step: state.step,
        totalSteps: state.totalSteps,
      })}

      ${phaseContent}

      ${renderFooter({
        currentPhase: state.currentPhase,
        hasNextPhase,
        hasPreviousPhase,
        canSkip,
        isSaving: state.isSaving,
        onBack: params.onBack,
        onSkip: params.onSkip,
        onContinue: params.onContinue,
      })}

      ${
        state.addModalOpen && state.addModalType === "channel"
          ? renderAddCardModal({
              isOpen: true,
              title: "Add a messaging app",
              options: DEFAULT_CHANNELS,
              onSelect: (id) => onAddChannel(id),
              onClose: () => {
                state.addModalOpen = false;
                state.addModalType = null;
              },
            })
          : nothing
      }

      ${
        state.addModalOpen && state.addModalType === "model"
          ? renderAddCardModal({
              isOpen: true,
              title: "Add an AI model",
              options: DEFAULT_MODELS.map((m) => ({
                id: m.id,
                name: m.name,
                icon: m.icon,
                description: `${m.provider} • ${m.description}`,
              })),
              onSelect: (id) => onAddModel(id),
              onClose: () => {
                state.addModalOpen = false;
                state.addModalType = null;
              },
            })
          : nothing
      }

      ${renderConfigModal({
        state: state.configModal,
        schema: params.configSchema,
        configValue: params.configValue,
        configUiHints: params.configUiHints,
        unsupported: params.unsupported,
        disabled: params.configSaving,
        onSave: async () => {
          // Save logic
        },
        onCancel: () => {
          state.configModal = createConfigModalState();
        },
        onConfirmClose: () => {
          state.configModal = { ...state.configModal, showConfirmClose: true };
        },
        onConfigPatch: params.onConfigPatch,
      })}
    </div>
  `;
}

// ============================================================================
// State Management Helpers
// ============================================================================

/**
 * Create initial wizard state
 */
export function createWizardState(): OnboardingWizardState {
  return {
    open: false,
    currentPhase: "quickstart",
    step: 1,
    totalSteps: 4,
    quickStartForm: getDefaultQuickStartForm(),
    channelCards: [],
    modelCards: [],
    addModalOpen: false,
    addModalType: null,
    configModal: createConfigModalState(),
    isDirty: false,
    isSaving: false,
    showConfirmClose: false,
    progress: null,
  };
}

/**
 * Open wizard
 */
export function openWizard(
  state: OnboardingWizardState,
  config: Record<string, unknown>,
): OnboardingWizardState {
  return {
    ...state,
    open: true,
    currentPhase: "quickstart",
    step: 1,
    channelCards: getChannelCards(config),
    modelCards: getModelCards(config),
    progress: {
      startedAt: new Date().toISOString(),
      completedPhases: [],
      lastSavedAt: new Date().toISOString(),
    },
  };
}

/**
 * Close wizard
 */
export function closeWizard(state: OnboardingWizardState): OnboardingWizardState {
  return {
    ...state,
    open: false,
    addModalOpen: false,
    addModalType: null,
    configModal: createConfigModalState(),
  };
}

/**
 * Move to next phase
 */
export function nextPhase(state: OnboardingWizardState): OnboardingWizardState {
  const currentIndex = ONBOARDING_PHASES.findIndex((p) => p.id === state.currentPhase);
  if (currentIndex < ONBOARDING_PHASES.length - 1) {
    const nextPhase = ONBOARDING_PHASES[currentIndex + 1];
    return {
      ...state,
      currentPhase: nextPhase.id,
      step: state.step + 1,
      progress: state.progress
        ? {
            ...state.progress,
            completedPhases: [...state.progress.completedPhases, state.currentPhase],
            lastSavedAt: new Date().toISOString(),
          }
        : null,
    };
  }
  return state;
}

/**
 * Move to previous phase
 */
export function prevPhase(state: OnboardingWizardState): OnboardingWizardState {
  const currentIndex = ONBOARDING_PHASES.findIndex((p) => p.id === state.currentPhase);
  if (currentIndex > 0) {
    const prevPhase = ONBOARDING_PHASES[currentIndex - 1];
    return {
      ...state,
      currentPhase: prevPhase.id,
      step: state.step - 1,
    };
  }
  return state;
}
