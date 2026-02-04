/**
 * Waitlist Modal
 *
 * Email capture form with animated submit and success confirmation.
 * Dispatches "waitlist-submit" event with email on successful submission.
 */

import { html, css, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { CtaModalBase } from "./cta-modal-base";

/** Email regex — generous but reasonable */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validate an email address and return an error string or empty */
export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Email is required";
  if (!EMAIL_REGEX.test(trimmed)) return "Please enter a valid email address";
  return "";
}

@customElement("waitlist-modal")
export class WaitlistModal extends CtaModalBase {
  static styles = [
    CtaModalBase.styles,
    css`
      .email-hint {
        font-size: 0.75rem;
        color: var(--landing-text-muted, #64748b);
        margin-top: 0.375rem;
      }
    `,
  ];

  @state()
  private email = "";

  @state()
  private emailError = "";

  @state()
  private touched = false;

  render(): TemplateResult {
    return html`
      <div
        class="modal-backdrop ${this.open ? "open" : ""}"
        @click=${this.handleBackdropClick}
        aria-hidden="true"
      ></div>
      <div
        class="modal-container ${this.open ? "open" : ""}"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        @click=${this.handleBackdropClick}
        @keydown=${this.handleKeydown}
      >
        <div class="modal-panel" @click=${(e: Event) => e.stopPropagation()}>
          ${this.renderCloseButton()}

          ${
            this.success
              ? this.renderSuccessState(
                  "You're on the list!",
                  "We'll reach out when early access opens. Keep an eye on your inbox.",
                )
              : this.renderForm()
          }
        </div>
      </div>
    `;
  }

  private renderForm(): TemplateResult {
    return html`
      <div class="modal-header">
        <span class="modal-icon">🚀</span>
        <h2 class="modal-title" id="waitlist-title">Join the Waitlist</h2>
        <p class="modal-subtitle">
          Be among the first to orchestrate autonomous agent teams with Clawdbrain.
        </p>
      </div>

      ${this.renderServerError()}

      <form @submit=${this.handleSubmit} novalidate>
        <div class="form-group">
          <label class="form-label" for="waitlist-email">
            Email <span class="required">*</span>
          </label>
          <input
            id="waitlist-email"
            class="form-input ${this.emailError && this.touched ? "error" : ""}"
            type="email"
            placeholder="you@company.com"
            .value=${this.email}
            @input=${this.handleEmailInput}
            @blur=${this.handleEmailBlur}
            autocomplete="email"
            required
          />
          ${this.touched ? this.renderFieldError(this.emailError) : html``}
          ${
            !this.emailError && !this.touched
              ? html`
                  <div class="email-hint">We'll only use this to reach out about early access.</div>
                `
              : html``
          }
        </div>

        <button
          class="modal-submit"
          type="submit"
          ?disabled=${this.loading}
        >
          ${this.loading ? html`${this.renderSpinner()} Joining…` : "Join Waitlist"}
        </button>
      </form>
    `;
  }

  private handleEmailInput(e: InputEvent): void {
    this.email = (e.target as HTMLInputElement).value;
    if (this.touched) {
      this.emailError = validateEmail(this.email);
    }
    this.serverError = "";
  }

  private handleEmailBlur(): void {
    this.touched = true;
    this.emailError = validateEmail(this.email);
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.touched = true;
    this.emailError = validateEmail(this.email);

    if (this.emailError) return;

    this.loading = true;
    this.serverError = "";

    try {
      // Simulate API call — replace with real endpoint
      await new Promise((resolve) => setTimeout(resolve, 1200));

      this.dispatchEvent(
        new CustomEvent("waitlist-submit", {
          detail: { email: this.email.trim() },
          bubbles: true,
          composed: true,
        }),
      );

      this.success = true;
    } catch {
      this.serverError = "Something went wrong. Please try again.";
    } finally {
      this.loading = false;
    }
  }

  protected close(): void {
    super.close();
    // Reset state after close animation
    setTimeout(() => {
      this.email = "";
      this.emailError = "";
      this.touched = false;
      this.success = false;
      this.serverError = "";
      this.loading = false;
    }, 350);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "waitlist-modal": WaitlistModal;
  }
}
