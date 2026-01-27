/**
 * Onboarding Configuration Modal
 *
 * Slide-out modal for editing individual channel/model configurations.
 * Keeps user in the wizard flow while allowing detailed configuration.
 */

import { html, nothing, type TemplateResult } from "lit";

import { icon } from "../icons";
import type { JsonSchema } from "./config-form";
import { renderNode } from "./config-form";

// ============================================================================
// Types
// ============================================================================

export type ConfigModalState = {
  open: boolean;
  itemId: string | null;
  itemName: string;
  itemIcon: string;
  isDirty: boolean;
  isSaving: boolean;
  showConfirmClose: boolean;
};

export type ConfigModalProps = {
  state: ConfigModalState;
  schema: JsonSchema | null;
  configValue: Record<string, unknown>;
  configUiHints: Record<string, unknown>;
  unsupported: Set<string>;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
  onConfirmClose: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
};

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render the configuration modal
 */
export function renderConfigModal(params: ConfigModalProps): TemplateResult | typeof nothing {
  const {
    state,
    schema,
    configValue,
    configUiHints,
    unsupported,
    disabled,
    onSave,
    onCancel,
    onConfirmClose,
    onConfigPatch,
  } = params;

  if (!state.open) {
    return nothing;
  }

  return html`
    <div class="onboarding-config-backdrop" @click=${() => state.isDirty ? onConfirmClose() : onCancel()}></div>
    <div class="onboarding-config-modal">
      <div class="onboarding-config-modal__header">
        <div class="onboarding-config-modal__title-row">
          <div class="onboarding-config-modal__icon">${icon(state.itemIcon as any, { size: 24 })}</div>
          <div>
            <h3 class="onboarding-config-modal__title">Configure ${state.itemName}</h3>
            <p class="onboarding-config-modal__subtitle">Update your settings below</p>
          </div>
        </div>
        <button
          type="button"
          class="onboarding-config-modal__close"
          @click=${() => (state.isDirty ? onConfirmClose() : onCancel())}
        >
          ${icon("x", { size: 20 })}
        </button>
      </div>

      <div class="onboarding-config-modal__body">
        ${state.isDirty
          ? html`
              <div class="onboarding-config-modal__dirty-banner">
                ${icon("alert-circle", { size: 14 })} You have unsaved changes
              </div>
            `
          : nothing}

        <div class="onboarding-config-modal__form">
          ${schema
            ? renderNode({
                schema,
                value: configValue,
                path: [],
                hints: configUiHints,
                unsupported,
                disabled,
                showLabel: true,
                compactToggles: true,
                flattenObjects: true,
                onPatch: onConfigPatch,
              })
            : html`
                <div class="onboarding-config-modal__placeholder">No configuration available</div>
              `}
        </div>
      </div>

      <div class="onboarding-config-modal__footer">
        <button
          type="button"
          class="btn btn--sm"
          @click=${() => (state.isDirty ? onConfirmClose() : onCancel())}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn--sm primary"
          ?disabled=${!state.isDirty || disabled}
          @click=${onSave}
        >
          ${state.isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>

    ${state.showConfirmClose ? renderConfirmDialog({ onKeepEditing: onCancel, onDiscard: onCancel }) : nothing}
  `;
}

/**
 * Render confirm close dialog
 */
function renderConfirmDialog(params: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}): TemplateResult {
  return html`
    <div class="onboarding-confirm-backdrop" @click=${params.onKeepEditing}></div>
    <div class="onboarding-confirm-dialog">
      <div class="onboarding-confirm-dialog__header">
        <h3 class="onboarding-confirm-dialog__title">Discard changes?</h3>
      </div>
      <div class="onboarding-confirm-dialog__body">
        <p class="onboarding-confirm-dialog__message">
          You have unsaved changes. Are you sure you want to discard them?
        </p>
      </div>
      <div class="onboarding-confirm-dialog__footer">
        <button type="button" class="btn btn--sm" @click=${params.onKeepEditing}>
          Keep Editing
        </button>
        <button type="button" class="btn btn--sm danger" @click=${params.onDiscard}>
          Discard
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// State Management Helpers
// ============================================================================

/**
 * Create initial modal state
 */
export function createConfigModalState(): ConfigModalState {
  return {
    open: false,
    itemId: null,
    itemName: "",
    itemIcon: "settings",
    isDirty: false,
    isSaving: false,
    showConfirmClose: false,
  };
}

/**
 * Open modal for an item
 */
export function openConfigModal(
  state: ConfigModalState,
  itemId: string,
  itemName: string,
  itemIcon: string,
): ConfigModalState {
  return {
    ...state,
    open: true,
    itemId,
    itemName,
    itemIcon,
    isDirty: false,
    showConfirmClose: false,
  };
}

/**
 * Close modal
 */
export function closeConfigModal(state: ConfigModalState): ConfigModalState {
  return {
    ...state,
    open: false,
    showConfirmClose: false,
  };
}

/**
 * Mark modal as dirty (unsaved changes)
 */
export function setConfigModalDirty(state: ConfigModalState, isDirty: boolean): ConfigModalState {
  return {
    ...state,
    isDirty,
  };
}

/**
 * Show confirm close dialog
 */
export function showConfigModalConfirmClose(state: ConfigModalState): ConfigModalState {
  return {
    ...state,
    showConfirmClose: true,
  };
}

/**
 * Hide confirm close dialog
 */
export function hideConfigModalConfirmClose(state: ConfigModalState): ConfigModalState {
  return {
    ...state,
    showConfirmClose: false,
  };
}
