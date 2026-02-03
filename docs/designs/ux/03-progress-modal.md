# Real-Time Progress Modal - UI Prototype

**Generated:** 2025-01-26
**Component:** Progress Tracking Modal for Automation Execution
**Magic MCP Response:** Full modal bundle with timeline, progress bar, and real-time updates

---

## ⚠️ Stack Translation Applied

**Original Magic MCP Output:** React + shadcn/ui + Framer Motion
**Clawdbrain Stack:** Lit Web Components + Tailwind v4 + Custom Design System

This document has been translated from React patterns to Lit Web Components following Clawdbrain's conventions.

### Translation Applied:

- React `useState` → Controller state with reactive properties
- React Dialog → Custom modal overlay with Lit template
- Framer Motion animations → CSS `@keyframes` for fade-in/scale-in
- shadcn/ui Progress → Custom progress bar with Lit template
- lucide-react icons → Clawdbrain's `icon()` function
- Real-time updates → SSE (Server-Sent Events) with Lit lifecycle
- Event handlers → Lit event listeners (`@click=${handler}`)

---

## Installation

**Note:** These packages were required for the original React prototype. The Clawdbrain Lit implementation uses existing dependencies only.

```bash
npm install framer-motion lucide-react clsx tailwind-merge @radix-ui/react-progress @radix-ui/react-dialog
```

---

## Main Progress Modal Component (Lit Web Components)

```typescript
// ui/src/ui/controllers/progress-modal.ts

import type { GatewayBrowserClient } from "../gateway";

export type MilestoneStatus = "completed" | "current" | "pending";

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  timestamp?: string;
}

export type ProgressModalStatus = "running" | "complete" | "failed" | "cancelled";

export interface ProgressModalState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  isOpen: boolean;
  automationName: string;
  currentMilestone: string;
  progress: number;
  milestones: Milestone[];
  elapsedTime: string;
  conflicts: number;
  status: ProgressModalStatus;
  sessionId: string;
}

// Server-Sent Events for real-time updates
export function setupProgressUpdates(
  state: ProgressModalState,
  automationId: string,
  onUpdate: (update: {
    percentage: number;
    milestone: string;
    timeline: Milestone[];
    status: ProgressModalStatus;
  }) => void,
): () => void {
  const eventSource = new EventSource(`/api/automations/${automationId}/progress/stream`);

  eventSource.onmessage = (event) => {
    const update = JSON.parse(event.data);
    state.progress = update.percentage;
    state.currentMilestone = update.milestone;
    state.milestones = update.timeline;
    state.status = update.status;
    onUpdate(update);
  };

  return () => eventSource.close();
}

export async function cancelAutomation(
  state: ProgressModalState,
  automationId: string,
): Promise<void> {
  if (!state.client || !state.connected) return;

  try {
    await state.client.request("automations.cancel", { id: automationId });
    state.status = "cancelled";
  } catch (err) {
    console.error("Failed to cancel automation:", err);
  }
}

export function jumpToChat(state: ProgressModalState): void {
  window.location.hash = `#sessions?sessionId=${state.sessionId}`;
}
```

```typescript
// ui/src/ui/views/progress-modal.ts
import { html, nothing } from "lit";
import { icon } from "../icons";
import type { ProgressModalState, Milestone, MilestoneStatus } from "../controllers/progress-modal";

export interface ProgressModalProps {
  state: ProgressModalState;
  onClose: () => void;
  onJumpToChat: () => void;
  onCancel: () => void;
}

export function renderProgressModal(props: ProgressModalProps) {
  const { state, onClose, onJumpToChat, onCancel } = props;

  if (!state.isOpen) return nothing;

  return html`
    <div class="progress-modal-overlay" @click=${onClose}>
      <div class="progress-modal-content" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="flex items-start justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              ${icon("loader", { size: 20, class: "text-blue-500 animate-spin" })}
            </div>
            <div>
              <h2 class="text-xl font-semibold text-foreground">${state.automationName}</h2>
              <p class="text-sm text-muted-foreground">Execution in progress</p>
            </div>
          </div>
          <button
            @click=${onClose}
            class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            ${icon("x", { size: 16 })}
          </button>
        </div>

        <!-- Status Indicator with Progress Bar -->
        <div class="mb-6 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div class="flex items-center gap-2 mb-2">
            ${icon("loader", { size: 16, class: "text-blue-500 animate-spin" })}
            <span class="text-sm font-medium text-foreground"> ${state.currentMilestone} </span>
          </div>
          <div class="progress-bar bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
            <div
              class="progress-fill bg-primary h-full flex-1 transition-all"
              style="transform: translateX(-${100 - state.progress}%); width: 100%"
            ></div>
          </div>
          <div class="flex items-center justify-between mt-2">
            <span class="text-xs text-muted-foreground"> ${state.progress}% complete </span>
            <span class="text-xs text-blue-500 font-medium"> ${state.progress}% of 100% </span>
          </div>
        </div>

        <!-- Execution Timeline -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-foreground mb-4">Execution Timeline</h3>
          <div class="space-y-3">
            ${state.milestones.map((milestone, index) =>
              renderTimelineItem(milestone, index, state.milestones),
            )}
          </div>
        </div>

        <!-- Statistics Cards -->
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="p-4 rounded-lg bg-muted/50 border">
            <div class="flex items-center gap-2 mb-1">
              ${icon("clock", { size: 16, class: "text-muted-foreground" })}
              <span class="text-xs text-muted-foreground">Elapsed Time</span>
            </div>
            <p class="text-lg font-semibold text-foreground">${state.elapsedTime}</p>
          </div>
          <div class="p-4 rounded-lg bg-muted/50 border">
            <div class="flex items-center gap-2 mb-1">
              ${icon("alert-triangle", { size: 16, class: "text-orange-500" })}
              <span class="text-xs text-muted-foreground">Conflicts</span>
            </div>
            <p class="text-lg font-semibold text-foreground">${state.conflicts}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-3">
          <button
            @click=${onJumpToChat}
            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground"
          >
            ${icon("message-square", { size: 16 })} Jump to Chat
          </button>
          ${state.status === "running"
            ? html`
                <button
                  @click=${onCancel}
                  class="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border bg-background"
                >
                  Cancel
                </button>
              `
            : html`
                <button
                  @click=${onClose}
                  class="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border bg-background"
                >
                  Close
                </button>
              `}
        </div>
      </div>
    </div>

    <style>
      .progress-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgba(0, 0, 0, 0.8);
        animation: fadeIn 0.2s ease-out;
      }
      .progress-modal-content {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 90vw;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        background: var(--panel-strong);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 1.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        animation: zoomIn 0.2s ease-out;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes zoomIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .animate-spin {
        animation: spin 1s linear infinite;
      }
      .progress-bar {
        position: relative;
        overflow: hidden;
      }
      .progress-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        transition: transform 0.3s ease;
      }
    </style>
  `;
}

function renderTimelineItem(milestone: Milestone, index: number, allMilestones: Milestone[]) {
  const statusIcon = getMilestoneStatusIcon(milestone.status);
  const statusColor = getMilestoneStatusColor(milestone.status);

  return html`
    <div class="timeline-item flex items-start gap-3">
      <div class="relative">
        ${statusIcon}
        ${index < allMilestones.length - 1
          ? html`
              <div
                class="absolute left-1/2 top-6 w-0.5 h-6 -translate-x-1/2 ${milestone.status ===
                "completed"
                  ? "bg-green-500"
                  : "bg-muted"}"
              ></div>
            `
          : nothing}
      </div>
      <div class="flex-1 pt-0.5">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium ${statusColor}"> ${milestone.title} </span>
          ${milestone.timestamp
            ? html`<span class="text-xs text-muted-foreground">${milestone.timestamp}</span>`
            : nothing}
        </div>
        ${milestone.status === "current"
          ? html`<p class="text-xs text-muted-foreground mt-1">Processing...</p>`
          : nothing}
      </div>
    </div>
  `;
}

function getMilestoneStatusIcon(status: MilestoneStatus) {
  switch (status) {
    case "completed":
      return html`${icon("check-circle", { size: 20, class: "text-green-500" })}`;
    case "current":
      return html`${icon("loader", { size: 20, class: "text-blue-500 animate-spin" })}`;
    case "pending":
      return html`<div class="h-5 w-5 rounded-full border-2 border-muted"></div>`;
  }
}

function getMilestoneStatusColor(status: MilestoneStatus): string {
  switch (status) {
    case "completed":
      return "text-green-500";
    case "current":
      return "text-blue-500";
    case "pending":
      return "text-muted-foreground";
  }
}
```

---

## Key Features Captured

### Modal Structure

1. **Overlay** - Semi-transparent backdrop with CSS animation (`bg-black/80` with `fadeIn` animation)
2. **Centered Content** - Fixed positioning with translate transforms
3. **Close Button** - X icon in top-right corner
4. **Animation** - CSS `@keyframes fadeIn` and `zoomIn` for 0.2s ease-out

### Header Section

- Status icon (spinning loader for running) with CSS `animate-spin`
- Automation name
- Status subtitle
- Close button

### Progress Display

- Blue highlighted status banner
- Spinning loader icon (CSS animation)
- Current milestone text
- Horizontal progress bar with transition (transform-based)
- Dual percentage display (text + visual)

### Execution Timeline

- Vertical list of milestones
- Three states per milestone:
  - **Completed**: Green checkmark icon + timestamp
  - **Current**: Blue spinning loader + "Processing..." text
  - **Pending**: Gray circle placeholder
- Connecting lines between milestones (green when completed, gray otherwise)

### Statistics Section

- Two-column grid layout
- Cards with Clawdbrain icons + label + value
- Elapsed Time card
- Conflicts count card

### Action Buttons

- "Jump to Chat" - Primary style, message-square icon
- "Cancel" - Outline style
- "Close" - Shown when not running

### Animations Preserved

- **Modal open**: `fadeIn` (opacity) + `zoomIn` (scale) - 0.2s ease-out
- **Spinner**: `spin` keyframe animation - 1s linear infinite
- **Progress bar**: CSS `transition: transform 0.3s ease`

---

## Smart-Sync Fork Milestones

For Git fork sync automation, the timeline should be:

```typescript
const gitSyncMilestones = [
  { id: "1", title: "Initialize Workspace", status: "completed" },
  { id: "2", title: "Clone Fork Repository", status: "completed" },
  { id: "3", title: "Add Upstream Remote", status: "completed" },
  { id: "4", title: "Fetch Upstream Changes", status: "completed" },
  { id: "5", title: "Detect Merge Conflicts", status: "current" },
  { id: "6", title: "Resolve Conflicts", status: "pending" },
  { id: "7", title: "Push Feature Branch", status: "pending" },
  { id: "8", title: "Create Pull Request", status: "pending" },
  { id: "9", title: "Complete", status: "pending" },
];
```
