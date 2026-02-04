/**
 * Demo Request Modal
 *
 * Multi-field form for requesting a product demo.
 * Captures name, email, company, and use case.
 * Dispatches "demo-submit" event with form data on successful submission.
 */

import { html, css, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { CtaModalBase } from "./cta-modal-base";
import { validateEmail } from "./waitlist-modal";

export interface DemoRequestData {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

export interface DemoFormErrors {
  name: string;
  email: string;
  company: string;
  useCase: string;
}

/** Validate name field */
export function validateName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  return "";
}

/** Validate company field */
export function validateCompany(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Company is required";
  return "";
}

/** Validate use case selection */
export function validateUseCase(value: string): string {
  if (!value) return "Please select a use case";
  return "";
}

/** Validate the full demo request form */
export function validateDemoForm(data: DemoRequestData): DemoFormErrors {
  return {
    name: validateName(data.name),
    email: validateEmail(data.email),
    company: validateCompany(data.company),
    useCase: validateUseCase(data.useCase),
  };
}

/** Check whether a form errors object has any errors */
export function hasErrors(errors: DemoFormErrors): boolean {
  return Object.values(errors).some((e) => e !== "");
}

const USE_CASES = [
  { value: "", label: "Select a use case…" },
  { value: "dev-workflows", label: "Development workflows" },
  { value: "content-ops", label: "Content operations" },
  { value: "data-analysis", label: "Data analysis & reporting" },
  { value: "customer-support", label: "Customer support automation" },
  { value: "devops", label: "DevOps & infrastructure" },
  { value: "other", label: "Something else" },
];

@customElement("demo-request-modal")
export class DemoRequestModal extends CtaModalBase {
  static styles = [
    CtaModalBase.styles,
    css`
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }

      @media (max-width: 480px) {
        .form-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];

  @state()
  private formData: DemoRequestData = {
    name: "",
    email: "",
    company: "",
    useCase: "",
  };

  @state()
  private errors: DemoFormErrors = {
    name: "",
    email: "",
    company: "",
    useCase: "",
  };

  @state()
  private touched: Record<keyof DemoRequestData, boolean> = {
    name: false,
    email: false,
    company: false,
    useCase: false,
  };

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
        aria-labelledby="demo-title"
        @click=${this.handleBackdropClick}
        @keydown=${this.handleKeydown}
      >
        <div class="modal-panel" @click=${(e: Event) => e.stopPropagation()}>
          ${this.renderCloseButton()}

          ${
            this.success
              ? this.renderSuccessState(
                  "Demo request received!",
                  "Our team will reach out within 24 hours to schedule your personalized demo.",
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
        <span class="modal-icon">🎯</span>
        <h2 class="modal-title" id="demo-title">Request a Demo</h2>
        <p class="modal-subtitle">
          See how Clawdbrain can orchestrate AI agents for your team's workflows.
        </p>
      </div>

      ${this.renderServerError()}

      <form @submit=${this.handleSubmit} novalidate>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="demo-name">
              Name <span class="required">*</span>
            </label>
            <input
              id="demo-name"
              class="form-input ${this.errors.name && this.touched.name ? "error" : ""}"
              type="text"
              placeholder="Jane Smith"
              .value=${this.formData.name}
              @input=${(e: InputEvent) => this.handleInput("name", e)}
              @blur=${() => this.handleBlur("name")}
              autocomplete="name"
              required
            />
            ${this.touched.name ? this.renderFieldError(this.errors.name) : html``}
          </div>

          <div class="form-group">
            <label class="form-label" for="demo-email">
              Email <span class="required">*</span>
            </label>
            <input
              id="demo-email"
              class="form-input ${this.errors.email && this.touched.email ? "error" : ""}"
              type="email"
              placeholder="jane@company.com"
              .value=${this.formData.email}
              @input=${(e: InputEvent) => this.handleInput("email", e)}
              @blur=${() => this.handleBlur("email")}
              autocomplete="email"
              required
            />
            ${this.touched.email ? this.renderFieldError(this.errors.email) : html``}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="demo-company">
            Company <span class="required">*</span>
          </label>
          <input
            id="demo-company"
            class="form-input ${this.errors.company && this.touched.company ? "error" : ""}"
            type="text"
            placeholder="Acme Inc."
            .value=${this.formData.company}
            @input=${(e: InputEvent) => this.handleInput("company", e)}
            @blur=${() => this.handleBlur("company")}
            autocomplete="organization"
            required
          />
          ${this.touched.company ? this.renderFieldError(this.errors.company) : html``}
        </div>

        <div class="form-group">
          <label class="form-label" for="demo-usecase">
            Use Case <span class="required">*</span>
          </label>
          <select
            id="demo-usecase"
            class="form-select ${this.errors.useCase && this.touched.useCase ? "error" : ""}"
            .value=${this.formData.useCase}
            @change=${(e: Event) => this.handleSelectChange("useCase", e)}
            @blur=${() => this.handleBlur("useCase")}
            required
          >
            ${USE_CASES.map(
              (uc) => html`<option value=${uc.value} ?disabled=${!uc.value}>${uc.label}</option>`,
            )}
          </select>
          ${this.touched.useCase ? this.renderFieldError(this.errors.useCase) : html``}
        </div>

        <button
          class="modal-submit"
          type="submit"
          ?disabled=${this.loading}
        >
          ${this.loading ? html`${this.renderSpinner()} Submitting…` : "Request Demo"}
        </button>
      </form>
    `;
  }

  private handleInput(field: keyof DemoRequestData, e: InputEvent): void {
    const value = (e.target as HTMLInputElement).value;
    this.formData = { ...this.formData, [field]: value };
    if (this.touched[field]) {
      this.validateField(field);
    }
    this.serverError = "";
  }

  private handleSelectChange(field: keyof DemoRequestData, e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.formData = { ...this.formData, [field]: value };
    this.touched = { ...this.touched, [field]: true };
    this.validateField(field);
    this.serverError = "";
  }

  private handleBlur(field: keyof DemoRequestData): void {
    this.touched = { ...this.touched, [field]: true };
    this.validateField(field);
  }

  private validateField(field: keyof DemoRequestData): void {
    const validators: Record<keyof DemoRequestData, (val: string) => string> = {
      name: validateName,
      email: validateEmail,
      company: validateCompany,
      useCase: validateUseCase,
    };
    this.errors = {
      ...this.errors,
      [field]: validators[field](this.formData[field]),
    };
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    // Touch all fields
    this.touched = { name: true, email: true, company: true, useCase: true };
    this.errors = validateDemoForm(this.formData);

    if (hasErrors(this.errors)) return;

    this.loading = true;
    this.serverError = "";

    try {
      // Simulate API call — replace with real endpoint
      await new Promise((resolve) => setTimeout(resolve, 1500));

      this.dispatchEvent(
        new CustomEvent("demo-submit", {
          detail: {
            name: this.formData.name.trim(),
            email: this.formData.email.trim(),
            company: this.formData.company.trim(),
            useCase: this.formData.useCase,
          },
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
      this.formData = { name: "", email: "", company: "", useCase: "" };
      this.errors = { name: "", email: "", company: "", useCase: "" };
      this.touched = { name: false, email: false, company: false, useCase: false };
      this.success = false;
      this.serverError = "";
      this.loading = false;
    }, 350);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "demo-request-modal": DemoRequestModal;
  }
}
