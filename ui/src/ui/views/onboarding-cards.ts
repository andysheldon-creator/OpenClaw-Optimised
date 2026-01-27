/**
 * Onboarding Card Components
 *
 * Graphical list pattern for channels and models.
 * Each item is a compact card with status, edit/remove actions.
 * Click to open modal for configuration.
 */

import { html, nothing, type TemplateResult } from "lit";

import { icon, type IconName } from "../icons";

// ============================================================================
// Types
// ============================================================================

export type CardStatus = "configured" | "not-configured" | "connecting" | "error";

export type ChannelCard = {
  id: string;
  name: string;
  icon: IconName;
  status: CardStatus;
  details: string;
  config?: Record<string, unknown>;
};

export type ModelCard = {
  id: string;
  name: string;
  provider: string;
  icon: IconName;
  status: CardStatus;
  details: string;
  config?: Record<string, unknown>;
};

export type CardListProps = {
  title: string;
  description?: string;
  addLabel: string;
  showSkip: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onSkip?: () => void;
};

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render status indicator for a card
 */
function renderCardStatus(status: CardStatus): TemplateResult {
  const statusConfig = {
    configured: { icon: "check-circle", color: "var(--success, 34, 197, 94)", label: "Connected" },
    "not-configured": { icon: "circle", color: "var(--muted)", label: "Not configured" },
    connecting: { icon: "loader", color: "var(--warning, 245, 158, 11)", label: "Connecting..." },
    error: { icon: "alert-circle", color: "var(--danger, 239, 68, 68)", label: "Error" },
  };

  const config = statusConfig[status];

  return html`
    <div class="onboarding-card__status" style="--status-color: ${config.color}">
      ${icon(config.icon, { size: 14 })}
      <span class="onboarding-card__status-label">${config.label}</span>
    </div>
  `;
}

/**
 * Render a single channel card
 */
export function renderChannelCard(card: ChannelCard, onEdit: (id: string) => void, onRemove: (id: string) => void): TemplateResult {
  return html`
    <div class="onboarding-card onboarding-card--${card.status}">
      <div class="onboarding-card__header">
        <div class="onboarding-card__identity">
          <div class="onboarding-card__icon">${icon(card.icon, { size: 24 })}</div>
          <div class="onboarding-card__info">
            <div class="onboarding-card__name">${card.name}</div>
            <div class="onboarding-card__details">${card.details}</div>
          </div>
        </div>
        ${renderCardStatus(card.status)}
      </div>
      <div class="onboarding-card__actions">
        ${card.status === "not-configured"
          ? html`
              <button
                type="button"
                class="btn btn--sm primary onboarding-card__action"
                @click=${() => onEdit(card.id)}
              >
                Configure →
              </button>
            `
          : html`
              <button
                type="button"
                class="btn btn--sm onboarding-card__action"
                @click=${() => onEdit(card.id)}
              >
                Edit
              </button>
            `}
        ${card.status === "configured"
          ? html`
              <button
                type="button"
                class="btn btn--sm danger onboarding-card__action onboarding-card__action--remove"
                @click=${() => onRemove(card.id)}
                title="Remove"
              >
                ${icon("trash-2", { size: 14 })}
              </button>
            `
          : nothing}
      </div>
    </div>
  `;
}

/**
 * Render a single model card
 */
export function renderModelCard(card: ModelCard, onEdit: (id: string) => void, onRemove: (id: string) => void): TemplateResult {
  return html`
    <div class="onboarding-card onboarding-card--${card.status}">
      <div class="onboarding-card__header">
        <div class="onboarding-card__identity">
          <div class="onboarding-card__icon">${icon(card.icon, { size: 24 })}</div>
          <div class="onboarding-card__info">
            <div class="onboarding-card__name">${card.name}</div>
            <div class="onboarding-card__details">${card.provider} • ${card.details}</div>
          </div>
        </div>
        ${renderCardStatus(card.status)}
      </div>
      <div class="onboarding-card__actions">
        ${card.status === "not-configured"
          ? html`
              <button
                type="button"
                class="btn btn--sm primary onboarding-card__action"
                @click=${() => onEdit(card.id)}
              >
                Configure →
              </button>
            `
          : html`
              <button
                type="button"
                class="btn btn--sm onboarding-card__action"
                @click=${() => onEdit(card.id)}
              >
                Edit
              </button>
            `}
        ${card.status === "configured"
          ? html`
              <button
                type="button"
                class="btn btn--sm danger onboarding-card__action onboarding-card__action--remove"
                @click=${() => onRemove(card.id)}
                title="Remove"
              >
                ${icon("trash-2", { size: 14 })}
              </button>
            `
          : nothing}
      </div>
    </div>
  `;
}

/**
 * Render a card list for channels
 */
export function renderChannelCardList(
  channels: ChannelCard[],
  props: CardListProps,
): TemplateResult {
  return html`
    <div class="onboarding-card-list">
      <div class="onboarding-card-list__header">
        <h3 class="onboarding-card-list__title">${props.title}</h3>
        ${props.description
          ? html`<p class="onboarding-card-list__description">${props.description}</p>`
          : nothing}
      </div>

      <div class="onboarding-card-list__items">
        ${channels.map((card) => renderChannelCard(card, props.onEdit, props.onRemove))}

        <button
          type="button"
          class="onboarding-card-list__add"
          @click=${props.onAdd}
        >
          <div class="onboarding-card-list__add-icon">${icon("plus", { size: 20 })}</div>
          <div class="onboarding-card-list__add-label">${props.addLabel}</div>
        </button>
      </div>

      ${props.showSkip && props.onSkip
        ? html`
            <div class="onboarding-card-list__footer">
              <button type="button" class="btn btn--sm" @click=${props.onSkip}>
                Skip for now →
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

/**
 * Render a card list for models
 */
export function renderModelCardList(
  models: ModelCard[],
  props: CardListProps,
): TemplateResult {
  return html`
    <div class="onboarding-card-list">
      <div class="onboarding-card-list__header">
        <h3 class="onboarding-card-list__title">${props.title}</h3>
        ${props.description
          ? html`<p class="onboarding-card-list__description">${props.description}</p>`
          : nothing}
      </div>

      <div class="onboarding-card-list__items">
        ${models.map((card) => renderModelCard(card, props.onEdit, props.onRemove))}

        <button
          type="button"
          class="onboarding-card-list__add"
          @click=${props.onAdd}
        >
          <div class="onboarding-card-list__add-icon">${icon("plus", { size: 20 })}</div>
          <div class="onboarding-card-list__add-label">${props.addLabel}</div>
        </button>
      </div>

      ${props.showSkip && props.onSkip
        ? html`
            <div class="onboarding-card-list__footer">
              <button type="button" class="btn btn--sm" @click=${props.onSkip}>
                Skip for now →
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

/**
 * Render the "Add new" modal
 */
export function renderAddCardModal(params: {
  isOpen: boolean;
  title: string;
  options: Array<{ id: string; name: string; icon: IconName; description?: string }>;
  onSelect: (id: string) => void;
  onClose: () => void;
}): TemplateResult | typeof nothing {
  if (!params.isOpen) return nothing;

  return html`
    <div class="onboarding-modal-backdrop" @click=${params.onClose}></div>
    <div class="onboarding-modal">
      <div class="onboarding-modal__header">
        <h3 class="onboarding-modal__title">${params.title}</h3>
        <button
          type="button"
          class="onboarding-modal__close"
          @click=${params.onClose}
        >
          ${icon("x", { size: 20 })}
        </button>
      </div>
      <div class="onboarding-modal__body">
        <div class="onboarding-modal__options">
          ${params.options.map(
            (option) => html`
              <button
                type="button"
                class="onboarding-modal__option"
                @click=${() => params.onSelect(option.id)}
              >
                <div class="onboarding-modal__option-icon">${icon(option.icon, { size: 24 })}</div>
                <div class="onboarding-modal__option-content">
                  <div class="onboarding-modal__option-name">${option.name}</div>
                  ${option.description
                    ? html`
                        <div class="onboarding-modal__option-desc">${option.description}</div>
                      `
                    : nothing}
                </div>
                <div class="onboarding-modal__option-arrow">${icon("chevron-right", { size: 16 })}</div>
              </button>
            `,
          )}
        </div>
      </div>
    </div>
  `;
}
