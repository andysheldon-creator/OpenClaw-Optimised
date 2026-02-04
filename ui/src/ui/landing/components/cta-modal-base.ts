/**
 * CTA Modal Base
 *
 * Reusable base class for landing page modals (waitlist, demo request).
 * Provides backdrop, open/close, focus trapping, escape key, and animated transitions.
 */

import { html, css, LitElement, TemplateResult, PropertyValues } from "lit";
import { property, state, query } from "lit/decorators.js";

export class CtaModalBase extends LitElement {
  static styles = css`
    :host {
      display: contents;
      font-family: var(--landing-font-body, system-ui, sans-serif);
    }

    /* Backdrop */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    .modal-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    /* Modal container */
    .modal-container {
      position: fixed;
      inset: 0;
      z-index: 1001;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      pointer-events: none;
    }

    .modal-container.open {
      pointer-events: auto;
    }

    /* Modal panel */
    .modal-panel {
      position: relative;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      background: var(--landing-bg-elevated, #12121a);
      border: 1px solid var(--landing-border, rgba(255, 255, 255, 0.08));
      border-radius: 20px;
      box-shadow:
        var(--landing-shadow-lg, 0 8px 40px rgba(0, 0, 0, 0.5)),
        0 0 80px rgba(99, 102, 241, 0.15);
      padding: 2.5rem;
      transform: translateY(20px) scale(0.96);
      opacity: 0;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .modal-container.open .modal-panel {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    /* Close button */
    .modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--landing-border, rgba(255, 255, 255, 0.08));
      border-radius: 50%;
      color: var(--landing-text-muted, #64748b);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .modal-close:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--landing-border-hover, rgba(255, 255, 255, 0.15));
      color: var(--landing-text-primary, #f8fafc);
    }

    .modal-close:focus-visible {
      outline: 2px solid var(--landing-primary, #6366f1);
      outline-offset: 2px;
    }

    .modal-close svg {
      width: 16px;
      height: 16px;
    }

    /* Header */
    .modal-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .modal-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      display: block;
    }

    .modal-title {
      font-family: var(--landing-font-display, inherit);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--landing-text-primary, #f8fafc);
      margin: 0 0 0.5rem;
      line-height: 1.3;
    }

    .modal-subtitle {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: var(--landing-text-secondary, #94a3b8);
      margin: 0;
    }

    /* Form fields */
    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--landing-text-secondary, #94a3b8);
      margin-bottom: 0.5rem;
      letter-spacing: 0.01em;
    }

    .form-label .required {
      color: var(--landing-accent-coral, #fb7185);
      margin-left: 2px;
    }

    .form-input,
    .form-textarea,
    .form-select {
      width: 100%;
      padding: 0.75rem 1rem;
      font-family: var(--landing-font-body, inherit);
      font-size: 0.9375rem;
      color: var(--landing-text-primary, #f8fafc);
      background: var(--landing-bg-surface, #1a1a24);
      border: 1px solid var(--landing-border, rgba(255, 255, 255, 0.08));
      border-radius: 12px;
      outline: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .form-input::placeholder,
    .form-textarea::placeholder {
      color: var(--landing-text-muted, #64748b);
    }

    .form-input:focus,
    .form-textarea:focus,
    .form-select:focus {
      border-color: var(--landing-primary, #6366f1);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }

    .form-input.error,
    .form-textarea.error,
    .form-select.error {
      border-color: var(--landing-accent-coral, #fb7185);
      box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.1);
    }

    .form-textarea {
      min-height: 80px;
      resize: vertical;
    }

    .form-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 1rem center;
      padding-right: 2.5rem;
    }

    .form-error {
      font-size: 0.75rem;
      color: var(--landing-accent-coral, #fb7185);
      margin-top: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      opacity: 0;
      transform: translateY(-4px);
      transition: all 0.2s ease;
    }

    .form-error.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .form-error svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }

    /* Submit button */
    .modal-submit {
      width: 100%;
      padding: 0.875rem 1.5rem;
      font-family: var(--landing-font-body, inherit);
      font-size: 1rem;
      font-weight: 600;
      color: white;
      background: var(--landing-primary, #6366f1);
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      position: relative;
      overflow: hidden;
      margin-top: 1.75rem;
    }

    .modal-submit:hover:not(:disabled) {
      background: var(--landing-primary-light, #818cf8);
      transform: translateY(-1px);
      box-shadow:
        var(--landing-shadow-md, 0 4px 20px rgba(0, 0, 0, 0.4)),
        var(--landing-shadow-glow, 0 0 40px rgba(99, 102, 241, 0.3));
    }

    .modal-submit:active:not(:disabled) {
      transform: translateY(0);
    }

    .modal-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .modal-submit:focus-visible {
      outline: 2px solid var(--landing-primary-light, #818cf8);
      outline-offset: 2px;
    }

    /* Loading spinner */
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Success state */
    .success-container {
      text-align: center;
      padding: 1rem 0;
    }

    .success-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(45, 212, 191, 0.15), rgba(99, 102, 241, 0.15));
      border: 1px solid rgba(45, 212, 191, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    @keyframes successPop {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .success-icon svg {
      width: 32px;
      height: 32px;
      color: var(--landing-accent-teal, #2dd4bf);
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
      animation: drawCheck 0.4s ease-out 0.3s forwards;
    }

    @keyframes drawCheck {
      to {
        stroke-dashoffset: 0;
      }
    }

    .success-title {
      font-family: var(--landing-font-display, inherit);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--landing-text-primary, #f8fafc);
      margin: 0 0 0.5rem;
    }

    .success-message {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: var(--landing-text-secondary, #94a3b8);
      margin: 0 0 1.5rem;
    }

    .success-close-btn {
      padding: 0.75rem 2rem;
      font-family: var(--landing-font-body, inherit);
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--landing-text-primary, #f8fafc);
      background: transparent;
      border: 1px solid var(--landing-border, rgba(255, 255, 255, 0.08));
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .success-close-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--landing-border-hover, rgba(255, 255, 255, 0.15));
    }

    .success-close-btn:focus-visible {
      outline: 2px solid var(--landing-primary, #6366f1);
      outline-offset: 2px;
    }

    /* Server error */
    .server-error {
      padding: 0.75rem 1rem;
      font-size: 0.8125rem;
      color: var(--landing-accent-coral, #fb7185);
      background: rgba(251, 113, 133, 0.08);
      border: 1px solid rgba(251, 113, 133, 0.2);
      border-radius: 10px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .server-error svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    /* Responsive */
    @media (max-width: 480px) {
      .modal-panel {
        padding: 2rem 1.5rem;
        border-radius: 16px;
        max-width: 100%;
      }

      .modal-container {
        padding: 1rem;
        align-items: flex-end;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .modal-backdrop,
      .modal-panel,
      .form-error,
      .success-icon,
      .success-icon svg,
      .spinner {
        transition: none !important;
        animation: none !important;
      }

      .modal-container.open .modal-panel {
        opacity: 1;
        transform: none;
      }
    }
  `;

  @property({ type: Boolean, reflect: true })
  open = false;

  @state()
  protected loading = false;

  @state()
  protected success = false;

  @state()
  protected serverError = "";

  @query(".modal-panel")
  protected panelEl!: HTMLElement;

  private previousActiveElement: Element | null = null;

  updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.previousActiveElement = document.activeElement;
        document.body.style.overflow = "hidden";
        // Focus the panel after transition
        requestAnimationFrame(() => {
          const firstInput = this.renderRoot.querySelector<HTMLElement>(
            "input, textarea, select, button:not(.modal-close)",
          );
          firstInput?.focus();
        });
      } else {
        document.body.style.overflow = "";
        if (this.previousActiveElement instanceof HTMLElement) {
          this.previousActiveElement.focus();
        }
      }
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.body.style.overflow = "";
  }

  protected handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }

    // Focus trap
    if (e.key === "Tab") {
      const focusableEls = this.renderRoot.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || this.renderRoot.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || this.renderRoot.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  protected close(): void {
    this.open = false;
    this.dispatchEvent(new CustomEvent("modal-close", { bubbles: true, composed: true }));
  }

  protected handleBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains("modal-container")) {
      this.close();
    }
  }

  protected renderCloseButton(): TemplateResult {
    return html`
      <button
        class="modal-close"
        @click=${this.close}
        aria-label="Close modal"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    `;
  }

  protected renderSuccessState(title: string, message: string): TemplateResult {
    return html`
      <div class="success-container">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h3 class="success-title">${title}</h3>
        <p class="success-message">${message}</p>
        <button class="success-close-btn" @click=${this.close}>Done</button>
      </div>
    `;
  }

  protected renderServerError(): TemplateResult {
    if (!this.serverError) return html``;
    return html`
      <div class="server-error" role="alert">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${this.serverError}</span>
      </div>
    `;
  }

  protected renderFieldError(error: string): TemplateResult {
    return html`
      <div class="form-error ${error ? "visible" : ""}" role="alert" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${error}</span>
      </div>
    `;
  }

  protected renderSpinner(): TemplateResult {
    return html`
      <div class="spinner" aria-hidden="true"></div>
    `;
  }
}
