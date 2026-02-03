# Automation Configuration Form - UI Prototype

**Generated:** 2025-01-26
**Component:** Smart-Sync Fork Configuration Form (Multi-Step Wizard)
**Magic MCP Response:** Full form bundle with validation, step navigation, and animations

---

## ⚠️ Stack Translation Applied

**Original Magic MCP Output:** React + shadcn/ui + Framer Motion
**Clawdbrain Stack:** Lit Web Components + Tailwind v4 + Custom Design System

This document has been translated from React patterns to Lit Web Components following Clawdbrain's conventions.

### Translation Applied:

- React `useState` → Controller state objects with reactive properties
- React multi-step wizard → Lit render function with step state in controller
- Framer Motion animations → CSS `@keyframes` and transitions
- shadcn/ui components → Tailwind classes and Clawdbrain design system
- lucide-react icons → Clawdbrain's `icon()` function from `ui/src/ui/icons.ts`
- Event handlers → Lit event listeners (`@click=${handler}`)
- Form validation → Controller validation functions

---

## Installation

```bash
npm install framer-motion lucide-react @radix-ui/react-label @radix-ui/react-slot class-variance-authority @radix-ui/react-switch @radix-ui/react-select clsx tailwind-merge
```

---

## Main Form Component (Lit Web Components - Multi-Step Wizard)

```typescript
// ui/src/ui/controllers/automation-form.ts

export interface FormField<T> {
  value: T;
  error?: string;
  touched: boolean;
}

export interface AutomationFormState {
  currentStep: number;
  errors: Partial<Record<string, string>>;
  formData: {
    name: string;
    description: string;
    schedule: string;
    customCron: string;
    upstreamUrl: string;
    forkUrl: string;
    aiProvider: string;
    aiModel: string;
    aiApiKey: string;
    enableAiReview: boolean;
    mergeStrategy: string;
    autoMerge: boolean;
    conflictResolution: string;
    emailNotifications: boolean;
    slackWebhook: string;
    notifyOnSuccess: boolean;
    notifyOnFailure: boolean;
  };
}

export const steps = [
  { id: 1, title: "Basic Info", description: "Name and description", icon: "git-branch" },
  { id: 2, title: "Schedule", description: "Sync frequency", icon: "clock" },
  { id: 3, title: "Repositories", description: "Source and target", icon: "link" },
  { id: 4, title: "AI Settings", description: "AI-powered features", icon: "brain" },
  { id: 5, title: "Merge Behavior", description: "Merge strategy", icon: "git-merge" },
  { id: 6, title: "Notifications", description: "Alert preferences", icon: "bell" },
];

export function setFormField<T>(state: AutomationFormState, field: string, value: T): void {
  (state.formData as any)[field] = value;
  if (state.errors[field]) {
    delete state.errors[field];
  }
}

export function validateStep(state: AutomationFormState, step: number): boolean {
  const newErrors: Partial<Record<string, string>> = {};

  if (step === 1) {
    if (!state.formData.name.trim()) newErrors.name = "Name is required";
  }
  if (step === 2) {
    if (state.formData.schedule === "custom" && !state.formData.customCron.trim()) {
      newErrors.customCron = "Custom cron expression is required";
    }
  }
  if (step === 3) {
    if (!state.formData.upstreamUrl.trim()) newErrors.upstreamUrl = "Upstream URL is required";
    if (!state.formData.forkUrl.trim()) newErrors.forkUrl = "Fork URL is required";
  }
  if (step === 4) {
    if (state.formData.enableAiReview && !state.formData.aiApiKey.trim()) {
      newErrors.aiApiKey = "API key is required when AI review is enabled";
    }
  }

  state.errors = newErrors;
  return Object.keys(newErrors).length === 0;
}

export function nextStep(state: AutomationFormState): void {
  if (validateStep(state, state.currentStep)) {
    state.currentStep = Math.min(state.currentStep + 1, steps.length);
  }
}

export function prevStep(state: AutomationFormState): void {
  state.currentStep = Math.max(state.currentStep - 1, 1);
}

export async function submitForm(state: AutomationFormState): Promise<boolean> {
  if (validateStep(state, state.currentStep)) {
    // Submit to backend
    return true;
  }
  return false;
}
```

```typescript
// ui/src/ui/views/automation-form.ts
import { html, nothing } from "lit";
import { icon } from "../icons";
import type { AutomationFormState, steps } from "../controllers/automation-form";

export interface AutomationFormProps {
  state: AutomationFormState;
  onFieldChange: (field: string, value: string | boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
}

export function renderAutomationForm(props: AutomationFormProps) {
  const { state, onFieldChange, onNext, onPrevious, onSubmit } = props;
  const totalSteps = steps.length;
  const progress = (state.currentStep / totalSteps) * 100;

  return html`
    <div class="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div class="max-w-4xl mx-auto">
        <div class="card-shadow-lg bg-card border border-border rounded-xl">
          <!-- Header with Progress -->
          <div class="border-b border-border px-6 py-6">
            <h2 class="text-2xl font-semibold text-foreground">Smart-Sync Fork Automation</h2>
            <p class="text-sm text-muted-foreground">
              Configure your repository synchronization automation
            </p>

            <!-- Progress Steps -->
            <div class="mt-6">
              <div class="flex items-center justify-between mb-4">
                <span class="text-sm font-medium text-muted-foreground">
                  Step ${state.currentStep} of ${totalSteps}
                </span>
              </div>

              <!-- Progress Bar -->
              <div class="relative">
                <div class="overflow-hidden h-2 mb-6 text-xs flex rounded-full bg-muted">
                  <div
                    style="width: ${progress}%"
                    class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary transition-all duration-500"
                  />
                </div>

                <!-- Step Icons -->
                <div class="flex justify-between">
                  ${steps.map((step) => {
                    const isCompleted = state.currentStep > step.id;
                    const isCurrent = state.currentStep === step.id;

                    return html`
                      <div class="flex flex-col items-center">
                        <div
                          class="rounded-full flex items-center justify-center transition-all w-10 h-10 ${isCompleted
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                              : "bg-muted text-muted-foreground"}"
                        >
                          ${isCompleted
                            ? icon("check", { size: 20 })
                            : icon(step.icon, { size: 20 })}
                        </div>
                        <div class="hidden sm:block mt-2 text-center">
                          <p
                            class="text-xs font-medium ${isCurrent || isCompleted
                              ? "text-primary"
                              : "text-muted-foreground"}"
                          >
                            ${step.title}
                          </p>
                        </div>
                      </div>
                    `;
                  })}
                </div>
              </div>
            </div>
          </div>

          <div class="p-6">
            <!-- Step Content with CSS Animation -->
            <div class="step-content min-h-[400px]">${renderStepContent(state, onFieldChange)}</div>

            <!-- Navigation Buttons -->
            <div class="flex justify-between mt-8 pt-6 border-t border-border">
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                @click=${onPrevious}
                ?disabled=${state.currentStep === 1}
              >
                ${icon("chevron-left", { size: 16 })} Previous
              </button>

              ${state.currentStep < totalSteps
                ? html`
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                      @click=${onNext}
                    >
                      Next ${icon("chevron-right", { size: 16 })}
                    </button>
                  `
                : html`
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                      @click=${onSubmit}
                    >
                      ${icon("check", { size: 16 })} Complete Setup
                    </button>
                  `}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CSS for step transitions -->
    <style>
      .step-content {
        animation: slideIn 0.4s ease-out;
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      .card-shadow-lg {
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      }
    </style>
  `;
}

function renderStepContent(
  state: AutomationFormState,
  onFieldChange: (field: string, value: string | boolean) => void,
) {
  const { formData, errors } = state;

  // STEP 1: Basic Information
  if (state.currentStep === 1) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">Basic Information</h3>
          <p class="text-sm text-muted-foreground">Give your automation a name and description</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Automation Name *
            </label>
            <input
              type="text"
              id="name"
              .value=${formData.name}
              @input=${(e: Event) => onFieldChange("name", (e.target as HTMLInputElement).value)}
              placeholder="My Fork Sync"
              class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.name
                ? "border-destructive"
                : ""}"
            />
            ${errors.name
              ? html`<p class="text-sm text-destructive mt-1 flex items-center gap-1">
                  ${icon("alert-circle", { size: 14 })} ${errors.name}
                </p>`
              : nothing}
          </div>

          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Description
            </label>
            <textarea
              id="description"
              .value=${formData.description}
              @input=${(e: Event) =>
                onFieldChange("description", (e.target as HTMLTextAreaElement).value)}
              placeholder="Describe what this automation does..."
              rows="4"
              class="border-input flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            ></textarea>
          </div>
        </div>
      </div>
    `;
  }

  // STEP 2: Schedule Configuration
  if (state.currentStep === 2) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">Sync Schedule</h3>
          <p class="text-sm text-muted-foreground">Configure how often to sync your fork</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Frequency
            </label>
            <select
              .value=${formData.schedule}
              @change=${(e: Event) =>
                onFieldChange("schedule", (e.target as HTMLSelectElement).value)}
              class="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            >
              <option value="hourly">Every Hour</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom (Cron)</option>
            </select>
          </div>

          ${formData.schedule === "custom"
            ? html`
                <div>
                  <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
                    Cron Expression *
                  </label>
                  <input
                    type="text"
                    id="customCron"
                    .value=${formData.customCron}
                    @input=${(e: Event) =>
                      onFieldChange("customCron", (e.target as HTMLInputElement).value)}
                    placeholder="0 0 * * *"
                    class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.customCron
                      ? "border-destructive"
                      : ""}"
                  />
                  ${errors.customCron
                    ? html`<p class="text-sm text-destructive mt-1 flex items-center gap-1">
                        ${icon("alert-circle", { size: 14 })} ${errors.customCron}
                      </p>`
                    : nothing}
                  <p class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    ${icon("info", { size: 12 })} Use standard cron syntax (e.g., "0 0 * * *" for
                    daily at midnight)
                  </p>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  // STEP 3: Repository Configuration
  if (state.currentStep === 3) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">Repository URLs</h3>
          <p class="text-sm text-muted-foreground">Specify the upstream and fork repositories</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Upstream Repository URL *
            </label>
            <input
              type="text"
              id="upstreamUrl"
              .value=${formData.upstreamUrl}
              @input=${(e: Event) =>
                onFieldChange("upstreamUrl", (e.target as HTMLInputElement).value)}
              placeholder="https://github.com/original/repo.git"
              class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.upstreamUrl
                ? "border-destructive"
                : ""}"
            />
            ${errors.upstreamUrl
              ? html`<p class="text-sm text-destructive mt-1 flex items-center gap-1">
                  ${icon("alert-circle", { size: 14 })} ${errors.upstreamUrl}
                </p>`
              : nothing}
          </div>

          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Your Fork URL *
            </label>
            <input
              type="text"
              id="forkUrl"
              .value=${formData.forkUrl}
              @input=${(e: Event) => onFieldChange("forkUrl", (e.target as HTMLInputElement).value)}
              placeholder="https://github.com/yourusername/repo.git"
              class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.forkUrl
                ? "border-destructive"
                : ""}"
            />
            ${errors.forkUrl
              ? html`<p class="text-sm text-destructive mt-1 flex items-center gap-1">
                  ${icon("alert-circle", { size: 14 })} ${errors.forkUrl}
                </p>`
              : nothing}
          </div>
        </div>
      </div>
    `;
  }

  // STEP 4: AI Settings
  if (state.currentStep === 4) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">AI-Powered Features</h3>
          <p class="text-sm text-muted-foreground">Configure AI assistance for code review</p>
        </div>

        <div class="space-y-4">
          <!-- Enable AI Review Toggle -->
          <div class="flex items-center justify-between p-4 border border-border rounded-lg">
            <div class="space-y-0.5">
              <label class="flex items-center gap-2 text-sm leading-none font-medium">
                Enable AI Code Review
              </label>
              <p class="text-sm text-muted-foreground">Use AI to analyze changes before merging</p>
            </div>
            <button
              type="button"
              role="switch"
              class="peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all"
              @click=${() => onFieldChange("enableAiReview", !formData.enableAiReview)}
              aria-checked=${formData.enableAiReview}
            >
              <span
                class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 ${formData.enableAiReview
                  ? "translate-x-[calc(100%-2px)]"
                  : ""}"
              ></span>
            </button>
          </div>

          ${formData.enableAiReview
            ? html`
                <!-- AI Settings (shown when enabled) -->
                <div class="space-y-4 pl-4 border-l-2 border-border">
                  <div>
                    <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
                      AI Provider
                    </label>
                    <select
                      .value=${formData.aiProvider}
                      @change=${(e: Event) =>
                        onFieldChange("aiProvider", (e.target as HTMLSelectElement).value)}
                      class="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google AI</option>
                    </select>
                  </div>

                  <div>
                    <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
                      Model
                    </label>
                    <select
                      .value=${formData.aiModel}
                      @change=${(e: Event) =>
                        onFieldChange("aiModel", (e.target as HTMLSelectElement).value)}
                      class="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                    >
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      <option value="claude-3">Claude 3</option>
                    </select>
                  </div>

                  <div>
                    <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
                      API Key *
                    </label>
                    <input
                      type="password"
                      id="aiApiKey"
                      .value=${formData.aiApiKey}
                      @input=${(e: Event) =>
                        onFieldChange("aiApiKey", (e.target as HTMLInputElement).value)}
                      placeholder="sk-..."
                      class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.aiApiKey
                        ? "border-destructive"
                        : ""}"
                    />
                    ${errors.aiApiKey
                      ? html`<p class="text-sm text-destructive mt-1 flex items-center gap-1">
                          ${icon("alert-circle", { size: 14 })} ${errors.aiApiKey}
                        </p>`
                      : nothing}
                  </div>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  // STEP 5: Merge Behavior
  if (state.currentStep === 5) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">Merge Strategy</h3>
          <p class="text-sm text-muted-foreground">Configure how changes are merged</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Strategy
            </label>
            <select
              .value=${formData.mergeStrategy}
              @change=${(e: Event) =>
                onFieldChange("mergeStrategy", (e.target as HTMLSelectElement).value)}
              class="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            >
              <option value="merge">Merge Commit</option>
              <option value="rebase">Rebase</option>
              <option value="squash">Squash and Merge</option>
            </select>
          </div>

          <div class="flex items-center justify-between p-4 border border-border rounded-lg">
            <div class="space-y-0.5">
              <label class="flex items-center gap-2 text-sm leading-none font-medium">
                Auto-merge
              </label>
              <p class="text-sm text-muted-foreground">Automatically merge when no conflicts</p>
            </div>
            <button
              type="button"
              role="switch"
              class="peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all"
              @click=${() => onFieldChange("autoMerge", !formData.autoMerge)}
              aria-checked=${formData.autoMerge}
            >
              <span
                class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform ${formData.autoMerge
                  ? "translate-x-[calc(100%-2px)]"
                  : ""}"
              ></span>
            </button>
          </div>

          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Conflict Resolution
            </label>
            <select
              .value=${formData.conflictResolution}
              @change=${(e: Event) =>
                onFieldChange("conflictResolution", (e.target as HTMLSelectElement).value)}
              class="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            >
              <option value="manual">Manual Review</option>
              <option value="upstream">Prefer Upstream</option>
              <option value="fork">Prefer Fork</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  // STEP 6: Notifications
  if (state.currentStep === 6) {
    return html`
      <div class="space-y-6">
        <div>
          <h3 class="text-lg font-semibold mb-1">Notification Settings</h3>
          <p class="text-sm text-muted-foreground">Configure how you want to be notified</p>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 border border-border rounded-lg">
            <div class="space-y-0.5">
              <label class="flex items-center gap-2 text-sm leading-none font-medium">
                Email Notifications
              </label>
              <p class="text-sm text-muted-foreground">Receive updates via email</p>
            </div>
            <button
              type="button"
              role="switch"
              class="peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all"
              @click=${() => onFieldChange("emailNotifications", !formData.emailNotifications)}
              aria-checked=${formData.emailNotifications}
            >
              <span
                class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform ${formData.emailNotifications
                  ? "translate-x-[calc(100%-2px)]"
                  : ""}"
              ></span>
            </button>
          </div>

          <div>
            <label class="flex items-center gap-2 text-sm leading-none font-medium mb-2">
              Slack Webhook URL
            </label>
            <input
              type="text"
              id="slackWebhook"
              .value=${formData.slackWebhook}
              @input=${(e: Event) =>
                onFieldChange("slackWebhook", (e.target as HTMLInputElement).value)}
              placeholder="https://hooks.slack.com/services/..."
              class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p class="text-xs text-muted-foreground mt-1">Optional: Send notifications to Slack</p>
          </div>

          <div class="space-y-3 p-4 border border-border rounded-lg">
            <label class="flex items-center gap-2 text-sm leading-none font-medium">
              Notify on:
            </label>
            <div class="flex items-center justify-between">
              <span class="text-sm">Successful sync</span>
              <button
                type="button"
                role="switch"
                class="peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all"
                @click=${() => onFieldChange("notifyOnSuccess", !formData.notifyOnSuccess)}
                aria-checked=${formData.notifyOnSuccess}
              >
                <span
                  class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform ${formData.notifyOnSuccess
                    ? "translate-x-[calc(100%-2px)]"
                    : ""}"
                ></span>
              </button>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm">Failed sync</span>
              <button
                type="button"
                role="switch"
                class="peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all"
                @click=${() => onFieldChange("notifyOnFailure", !formData.notifyOnFailure)}
                aria-checked=${formData.notifyOnFailure}
              >
                <span
                  class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform ${formData.notifyOnFailure
                    ? "translate-x-[calc(100%-2px)]"
                    : ""}"
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return nothing;
}
```

---

## Key Features Captured

### Multi-Step Wizard Pattern

1. **Progress Indicator** - Visual progress bar with step icons using Clawdbrain icon system
2. **Step Navigation** - Previous/Next buttons with validation in controller
3. **Animation** - CSS `@keyframes slideIn` for step transitions with 0.4s ease-out
4. **Step Icons** - Clawdbrain icons: git-branch, clock, link, brain, git-merge, bell

### Form Fields Per Step

**Step 1: Basic Info**

- Automation Name (required, with validation)
- Description (optional textarea)

**Step 2: Schedule**

- Frequency dropdown (Hourly, Daily, Weekly, Custom)
- Custom Cron expression input (conditional)

**Step 3: Repositories**

- Upstream Repository URL (required, validated)
- Fork Repository URL (required, validated)

**Step 4: AI Settings**

- Enable AI Review toggle
- AI Provider dropdown (conditional)
- AI Model dropdown (conditional)
- API Key input (conditional, password type)

**Step 5: Merge Behavior**

- Merge Strategy dropdown (Merge, Rebase, Squash)
- Auto-Merge toggle
- Conflict Resolution dropdown

**Step 6: Notifications**

- Email Notifications toggle
- Slack Webhook URL input
- Notify on Success toggle
- Notify on Failure toggle

### Validation & Error Handling

- Per-step validation before proceeding
- Error messages with AlertCircle icon
- Visual error states (red border)
- Help text with Info icon

### Styling Features

- Tailwind v4 CSS variables
- Dark mode support
- Responsive layout
- Card-based container
- Bordered sections for related controls

---

## Form Field Types

| Clawdbrain Implementation | Pattern                                                |
| ------------------------- | ------------------------------------------------------ |
| Input fields              | `<input>` with Tailwind classes                        |
| Textarea                  | `<textarea>` with Tailwind classes                     |
| Toggle/Switch             | Custom button with `[role="switch"]` and animated span |
| Select dropdown           | Native `<select>` with Tailwind classes                |
| Labels                    | `<label>` with Tailwind classes                        |
| Page transitions          | CSS `@keyframes slideIn` with 0.4s ease-out            |

---

## Smart-Sync Fork Specific Fields Mapping

| Magic MCP Field      | Smart-Sync Fork Field              |
| -------------------- | ---------------------------------- |
| `schedule`           | `schedule.type` + `schedule.value` |
| `upstreamUrl`        | `upstreamRepoUrl`                  |
| `forkUrl`            | `forkRepoUrl`                      |
| `enableAiReview`     | N/A (AI always used)               |
| `aiProvider`         | N/A (uses global default)          |
| `aiModel`            | `aiModel` (optional override)      |
| `mergeStrategy`      | `autoMergeMethod`                  |
| `autoMerge`          | `autoMerge`                        |
| `conflictResolution` | `uncertaintyAction`                |

Missing fields to add:

- `forkBranch` (default "main")
- `upstreamBranch` (default "main")
- `sshKeyPath` (dropdown with auto-detect)
- `confidenceThreshold` (slider 0-100, default 90)
- `maxWrongPathCorrections` (number, default 3)
- `maxMinutesPerConflict` (number, default 5)
