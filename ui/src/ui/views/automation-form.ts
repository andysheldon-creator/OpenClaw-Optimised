import { html, nothing } from "lit";
import type { AutomationFormState } from "../controllers/automations";
import { AUTOMATION_FORM_STEPS } from "../controllers/automations";
import { icon } from "../icons";

export interface AutomationFormProps {
  state: AutomationFormState;
  onFieldChange: (field: string, value: unknown) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function renderStepIndicator(props: AutomationFormProps) {
  const { state } = props;
  const totalSteps = AUTOMATION_FORM_STEPS.length;
  const progress = (state.currentStep / totalSteps) * 100;

  return html`
    <div class="wizard-progress">
      <div class="wizard-progress__bar">
        <div class="wizard-progress__fill" style="width: ${progress}%"></div>
      </div>
      <div class="wizard-progress__steps">
        ${AUTOMATION_FORM_STEPS.map((step) => {
          const isCompleted = state.currentStep > step.id;
          const isCurrent = state.currentStep === step.id;

          return html`
            <div class="wizard-progress__step">
              <div
                class="wizard-progress__step-icon ${
                  isCompleted
                    ? "wizard-progress__step-icon--completed"
                    : isCurrent
                      ? "wizard-progress__step-icon--current"
                      : ""
                }"
              >
                ${isCompleted ? icon("check", { size: 16 }) : icon(step.icon, { size: 16 })}
              </div>
              <div class="wizard-progress__step-label ${
                isCurrent || isCompleted ? "wizard-progress__step-label--active" : ""
              }">
                ${step.title}
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

function renderBasicInfoStep(props: AutomationFormProps) {
  const { state, onFieldChange } = props;
  const { formData, errors } = state;

  return html`
    <div class="form-step">
      <h3 class="form-step__title">Basic Information</h3>
      <p class="form-step__description">Give your automation a name and description</p>

      <div class="form-fields">
        <div class="field ${errors.name ? "field--error" : ""}">
          <label class="field__label">Automation Name *</label>
          <input
            type="text"
            .value=${formData.name}
            @input=${(e: Event) => onFieldChange("name", (e.target as HTMLInputElement).value)}
            placeholder="My Automation"
            class="field__input"
          />
          ${
            errors.name
              ? html`<span class="field__error">${icon("alert-circle", { size: 12 })} ${errors.name}</span>`
              : nothing
          }
        </div>

        <div class="field">
          <label class="field__label">Description</label>
          <textarea
            .value=${formData.description}
            @input=${(e: Event) => onFieldChange("description", (e.target as HTMLTextAreaElement).value)}
            placeholder="Describe what this automation does..."
            rows="3"
            class="field__textarea"
          ></textarea>
        </div>

        <div class="field">
          <label class="field__label">Type</label>
          <select
            .value=${formData.type}
            @change=${(e: Event) => onFieldChange("type", (e.target as HTMLSelectElement).value)}
            class="field__select"
          >
            <option value="smart-sync-fork">Smart-Sync Fork</option>
            <option value="custom-script">Custom Script</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

function renderScheduleStep(props: AutomationFormProps) {
  const { state, onFieldChange } = props;
  const { formData, errors } = state;

  return html`
    <div class="form-step">
      <h3 class="form-step__title">Schedule</h3>
      <p class="form-step__description">Configure how often this automation runs</p>

      <div class="form-fields">
        <div class="field">
          <label class="field__label">Schedule Type</label>
          <select
            .value=${formData.scheduleType}
            @change=${(e: Event) => onFieldChange("scheduleType", (e.target as HTMLSelectElement).value)}
            class="field__select"
          >
            <option value="every">Every (interval)</option>
            <option value="cron">Cron Expression</option>
            <option value="at">At Specific Time</option>
          </select>
        </div>

        ${
          formData.scheduleType === "every"
            ? html`
              <div class="form-grid">
                <div class="field">
                  <label class="field__label">Interval</label>
                  <input
                    type="number"
                    .value=${formData.scheduleEveryAmount}
                    @input=${(e: Event) => onFieldChange("scheduleEveryAmount", (e.target as HTMLInputElement).value)}
                    placeholder="1"
                    min="1"
                    class="field__input"
                  />
                </div>
                <div class="field">
                  <label class="field__label">Unit</label>
                  <select
                    .value=${formData.scheduleEveryUnit}
                    @change=${(e: Event) => onFieldChange("scheduleEveryUnit", (e.target as HTMLSelectElement).value)}
                    class="field__select"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
            `
            : nothing
        }

        ${
          formData.scheduleType === "cron"
            ? html`
              <div class="field ${errors.scheduleCronExpr ? "field--error" : ""}">
                <label class="field__label">Cron Expression *</label>
                <input
                  type="text"
                  .value=${formData.scheduleCronExpr}
                  @input=${(e: Event) => onFieldChange("scheduleCronExpr", (e.target as HTMLInputElement).value)}
                  placeholder="0 0 * * *"
                  class="field__input"
                />
                ${
                  errors.scheduleCronExpr
                    ? html`<span class="field__error">${icon("alert-circle", { size: 12 })} ${errors.scheduleCronExpr}</span>`
                    : nothing
                }
                <div class="field__hint">
                  ${icon("info", { size: 12 })}
                  Use standard cron syntax (e.g., "0 0 * * *" for daily at midnight)
                </div>
              </div>

              <div class="field">
                <label class="field__label">Timezone (optional)</label>
                <input
                  type="text"
                  .value=${formData.scheduleCronTz}
                  @input=${(e: Event) => onFieldChange("scheduleCronTz", (e.target as HTMLInputElement).value)}
                  placeholder="America/New_York"
                  class="field__input"
                />
              </div>
            `
            : nothing
        }

        ${
          formData.scheduleType === "at"
            ? html`
              <div class="field ${errors.scheduleAt ? "field--error" : ""}">
                <label class="field__label">Run At *</label>
                <input
                  type="datetime-local"
                  .value=${formData.scheduleAt}
                  @input=${(e: Event) => onFieldChange("scheduleAt", (e.target as HTMLInputElement).value)}
                  class="field__input"
                />
                ${
                  errors.scheduleAt
                    ? html`<span class="field__error">${icon("alert-circle", { size: 12 })} ${errors.scheduleAt}</span>`
                    : nothing
                }
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

function renderConfigurationStep(props: AutomationFormProps) {
  const { state, onFieldChange } = props;
  const { formData } = state;

  return html`
    <div class="form-step">
      <h3 class="form-step__title">Configuration</h3>
      <p class="form-step__description">Configure automation-specific settings</p>

      <div class="form-fields">
        <p class="text-sm text-muted-foreground">
          ${icon("info", { size: 14 })}
          Configuration options will be shown based on the automation type selected.
        </p>

        <div class="field">
          <label class="field__label">Additional Configuration (JSON)</label>
          <textarea
            .value=${JSON.stringify(formData.config, null, 2)}
            @input=${(e: Event) => {
              try {
                const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
                onFieldChange("config", parsed);
              } catch {
                // Invalid JSON, ignore
              }
            }}
            rows="6"
            class="field__textarea font-mono"
            placeholder='{"key": "value"}'
          ></textarea>
        </div>
      </div>
    </div>
  `;
}

function renderStepContent(props: AutomationFormProps) {
  const { state } = props;

  switch (state.currentStep) {
    case 1:
      return renderBasicInfoStep(props);
    case 2:
      return renderScheduleStep(props);
    case 3:
      return renderConfigurationStep(props);
    default:
      return nothing;
  }
}

export function renderAutomationForm(props: AutomationFormProps) {
  const { state, onNext, onPrevious, onSubmit, onCancel } = props;
  const totalSteps = AUTOMATION_FORM_STEPS.length;

  return html`
    <div class="automation-form">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Create Automation</h2>
          <button class="card-close" @click=${onCancel} aria-label="Close">
            ${icon("x", { size: 20 })}
          </button>
        </div>

        <div class="card-content">
          ${renderStepIndicator(props)}
          ${renderStepContent(props)}
        </div>

        <div class="card-footer card-footer--actions">
          <button
            class="btn btn-secondary"
            @click=${onPrevious}
            ?disabled=${state.currentStep === 1}
          >
            ${icon("chevron-left", { size: 14 })}
            Previous
          </button>

          ${
            state.currentStep < totalSteps
              ? html`
                <button class="btn btn-primary" @click=${onNext}>
                  Next
                  ${icon("chevron-right", { size: 14 })}
                </button>
              `
              : html`
                <button class="btn btn-primary" @click=${onSubmit}>
                  ${icon("check", { size: 14 })}
                  Create Automation
                </button>
              `
          }
        </div>
      </div>
    </div>
  `;
}
