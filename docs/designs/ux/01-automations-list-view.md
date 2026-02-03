# Automations List View - UI Prototype

**Generated:** 2025-01-26
**Component:** Automation List View with Cards
**Magic MCP Response:** Full component bundle with all dependencies

---

## ⚠️ Stack Translation Applied

**Original Magic MCP Output:** React + shadcn/ui + Framer Motion
**Clawdbrain Stack:** Lit Web Components + Tailwind v4 + Custom Design System

This document has been translated from React patterns to Lit Web Components following Clawdbrain's conventions.

### Translation Applied:

- React `useState` → Controller state objects (e.g., `AutomationsState`)
- React `useMemo` → Computed functions or memoized controller methods
- React components → Lit render functions (e.g., `renderAutomationCard(props)`)
- Framer Motion → CSS `@keyframes` for slide-in animations
- shadcn/ui components → Tailwind classes and Clawdbrain design system
- lucide-react icons → Clawdbrain's `icon()` function from `ui/src/ui/icons.ts`
- Event handlers → Lit event listeners (`@click=${handler}`)

---

## Overview

A comprehensive automation list view displaying a grid of automation cards with filtering, search, and management controls. Built with React, TypeScript, Tailwind CSS v4, and shadcn/ui components.

## Installation

**Note:** The packages below are for the original React prototype. For Clawdbrain Lit implementation, no additional installation is needed beyond the existing stack.

```bash
npm install framer-motion lucide-react clsx tailwind-merge @radix-ui/react-slot class-variance-authority @radix-ui/react-dropdown-menu @radix-ui/react-select
```

---

## Main List View Component (Lit Web Components)

```typescript
// ui/src/ui/controllers/automations.ts
import type { GatewayBrowserClient } from "../gateway";
import { toast } from "../components/toast";

export type AutomationStatus = "active" | "suspended" | "error";
export type LastRunStatus = "success" | "failed" | "running";

export interface Automation {
  id: string;
  name: string;
  status: AutomationStatus;
  schedule: string;
  nextRun: string;
  lastRun: {
    time: string;
    status: LastRunStatus;
    duration?: string;
  };
  description: string;
  tags: string[];
}

export type AutomationsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  automations: Automation[];
  searchQuery: string;
  statusFilter: "all" | AutomationStatus;
  error: string | null;
};

// Status configuration for rendering
export const statusConfig: Record<
  AutomationStatus,
  { icon: string; class: string; label: string }
> = {
  active: { icon: "check-circle", class: "status-active", label: "Active" },
  suspended: { icon: "pause", class: "status-suspended", label: "Suspended" },
  error: { icon: "alert-circle", class: "status-error", label: "Error" },
};

export const lastRunStatusConfig: Record<LastRunStatus, { icon: string; class: string }> = {
  success: { icon: "check-circle", class: "text-ok" },
  failed: { icon: "x-circle", class: "text-danger" },
  running: { icon: "loader", class: "text-accent" },
};

// Filter automations based on search and status
export function filterAutomations(state: AutomationsState): Automation[] {
  return state.automations.filter((automation) => {
    const matchesSearch =
      automation.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      automation.description.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesStatus = state.statusFilter === "all" || automation.status === state.statusFilter;
    return matchesSearch && matchesStatus;
  });
}

// Controller actions
export async function loadAutomations(state: AutomationsState) {
  if (!state.client || !state.connected || state.loading) return;

  state.loading = true;
  state.error = null;
  try {
    const res = await state.client.request("automations.list");
    state.automations = res.automations ?? [];
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to load automations");
  } finally {
    state.loading = false;
  }
}

export async function runAutomation(state: AutomationsState, id: string) {
  if (!state.client || !state.connected) return;

  try {
    await state.client.request("automations.run", { id });
    toast.success("Automation started");
    await loadAutomations(state);
  } catch (err) {
    toast.error("Failed to start automation");
  }
}

export async function toggleSuspendAutomation(state: AutomationsState, id: string) {
  if (!state.client || !state.connected) return;

  const automation = state.automations.find((a) => a.id === id);
  if (!automation) return;

  const newStatus = automation.status === "suspended" ? "active" : "suspended";
  try {
    await state.client.request("automations.update", { id, status: newStatus });
    await loadAutomations(state);
    toast.success(`Automation ${newStatus === "active" ? "resumed" : "suspended"}`);
  } catch (err) {
    toast.error("Failed to update automation");
  }
}

export function setSearchQuery(state: AutomationsState, query: string) {
  state.searchQuery = query;
}

export function setStatusFilter(state: AutomationsState, filter: AutomationsState["statusFilter"]) {
  state.statusFilter = filter;
}
```

```typescript
// ui/src/ui/views/automations.ts
import { html, nothing } from "lit";
import { icon } from "../icons";
import type {
  Automation,
  AutomationStatus,
  LastRunStatus,
  statusConfig,
  lastRunStatusConfig,
} from "../controllers/automations";

export interface AutomationCardProps {
  automation: Automation;
  onRun: (id: string) => void;
  onSuspend: (id: string) => void;
  onHistory: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function renderAutomationCard(props: AutomationCardProps) {
  const { automation, onRun, onSuspend, onHistory, onEdit, onDelete } = props;
  const statusInfo = statusConfig[automation.status];
  const lastRunInfo = lastRunStatusConfig[automation.lastRun.status];

  return html`
    <div
      class="automation-card overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow"
      data-id="${automation.id}"
    >
      <div class="p-6">
        <!-- Header with title, status badge, and kebab menu -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-foreground mb-2 truncate">${automation.name}</h3>
            <div class="flex items-center gap-2 mb-3">
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusInfo.class}">
                ${icon(statusInfo.icon, { size: 14, class: statusInfo.class })}
                <span class="text-xs font-medium">${statusInfo.label}</span>
              </div>
              ${automation.tags.map(
                (tag) => html`
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium bg-secondary text-secondary-foreground"
                  >
                    ${tag}
                  </span>
                `,
              )}
            </div>
          </div>

          <!-- Kebab menu trigger -->
          <div class="relative">
            <button
              class="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent"
              @click=${(e: Event) => {
                const menu = (e.target as HTMLElement)
                  .closest(".automation-card")
                  ?.querySelector(".dropdown-menu") as HTMLElement;
                menu?.classList.toggle("hidden");
              }}
            >
              ${icon("more-vertical", { size: 16 })}
            </button>
            <div
              class="dropdown-menu hidden absolute right-0 mt-1 w-48 rounded-md border bg-popover shadow-md z-50"
            >
              <div class="py-1">
                <button
                  class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
                  @click=${() => onRun(automation.id)}
                >
                  <span class="flex items-center gap-2">
                    ${icon("play", { size: 14 })} Run Now
                  </span>
                </button>
                <button
                  class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
                  @click=${() => onSuspend(automation.id)}
                >
                  <span class="flex items-center gap-2">
                    ${icon("pause", { size: 14 })}
                    ${automation.status === "suspended" ? "Resume" : "Suspend"}
                  </span>
                </button>
                <button
                  class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
                  @click=${() => onHistory(automation.id)}
                >
                  <span class="flex items-center gap-2">
                    ${icon("history", { size: 14 })} View History
                  </span>
                </button>
                <button
                  class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
                  @click=${() => onEdit(automation.id)}
                >
                  <span class="flex items-center gap-2"> ${icon("edit", { size: 14 })} Edit </span>
                </button>
                <div class="border-t border-border my-1"></div>
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
                  @click=${() => onDelete(automation.id)}
                >
                  <span class="flex items-center gap-2">
                    ${icon("trash", { size: 14 })} Delete
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <p class="text-sm text-muted-foreground mb-4 line-clamp-2">${automation.description}</p>

        <!-- Info section -->
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm">
            ${icon("calendar", { size: 16, class: "text-muted-foreground" })}
            <span class="text-muted-foreground">Schedule:</span>
            <span class="font-medium text-foreground">${automation.schedule}</span>
          </div>

          <div class="flex items-center gap-2 text-sm">
            ${icon("clock", { size: 16, class: "text-muted-foreground" })}
            <span class="text-muted-foreground">Next Run:</span>
            <span class="font-medium text-foreground">${automation.nextRun}</span>
          </div>

          <div class="pt-3 border-t border-border">
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                ${icon(lastRunInfo.icon, { size: 16, class: lastRunInfo.class })}
                <span class="text-muted-foreground">Last Run:</span>
                <span class="font-medium text-foreground">${automation.lastRun.time}</span>
              </div>
              ${automation.lastRun.duration
                ? html`<span class="text-xs text-muted-foreground"
                    >${automation.lastRun.duration}</span
                  >`
                : nothing}
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2 mt-4 pt-4 border-t border-border">
          <button
            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            @click=${() => onRun(automation.id)}
          >
            ${icon("play", { size: 14 })} Run
          </button>
          <button
            class="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border bg-background hover:bg-accent"
            @click=${() => onHistory(automation.id)}
          >
            ${icon("history", { size: 14 })}
          </button>
          <button
            class="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border bg-background hover:bg-accent"
            @click=${() => onEdit(automation.id)}
          >
            ${icon("edit", { size: 14 })}
          </button>
        </div>
      </div>
    </div>
  `;
}

export interface AutomationsListViewProps {
  state: {
    automations: Automation[];
    searchQuery: string;
    statusFilter: "all" | AutomationStatus;
  };
  onRun: (id: string) => void;
  onSuspend: (id: string) => void;
  onHistory: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: AutomationsListViewProps["state"]["statusFilter"]) => void;
  onCreate: () => void;
}

export function renderAutomationsListView(props: AutomationsListViewProps) {
  const {
    state,
    onRun,
    onSuspend,
    onHistory,
    onEdit,
    onDelete,
    onSearchChange,
    onFilterChange,
    onCreate,
  } = props;

  // Filter automations
  const filteredAutomations = state.automations.filter((automation) => {
    const matchesSearch =
      automation.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      automation.description.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesStatus = state.statusFilter === "all" || automation.status === state.statusFilter;
    return matchesSearch && matchesStatus;
  });

  return html`
    <div class="min-h-screen bg-background p-6">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-3xl font-bold text-foreground mb-2">Automations</h1>
              <p class="text-muted-foreground">Manage and monitor your automated workflows</p>
            </div>
            <button
              class="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              @click=${onCreate}
            >
              ${icon("plus", { size: 16 })} Create Automation
            </button>
          </div>

          <!-- Search and Filter -->
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="relative flex-1">
              ${icon("search", {
                size: 16,
                class: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
              })}
              <input
                type="text"
                placeholder="Search automations..."
                .value=${state.searchQuery}
                @input=${(e: Event) => onSearchChange((e.target as HTMLInputElement).value)}
                class="pl-10 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select
              .value=${state.statusFilter}
              @change=${(e: Event) =>
                onFilterChange(
                  (e.target as HTMLSelectElement)
                    .value as AutomationsListViewProps["state"]["statusFilter"],
                )}
              class="flex h-9 w-full sm:w-[180px] items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>

        <!-- Automation Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${filteredAutomations.length > 0
            ? filteredAutomations.map((automation) =>
                renderAutomationCard({ automation, onRun, onSuspend, onHistory, onEdit, onDelete }),
              )
            : html`
                <div class="col-span-full text-center py-12">
                  <p class="text-muted-foreground text-lg">No automations found</p>
                  <p class="text-muted-foreground text-sm mt-2">
                    Try adjusting your search or filters
                  </p>
                </div>
              `}
        </div>
      </div>
    </div>
  `;
}
```

---

## Styles (index.css)

```css
/* Tailwind 4 CSS file */
/* Extending Tailwind configuration */
/* Add only the styles that your component needs */

/* Base imports */
@import "tailwindcss";
@import "tw-animate-css";

/* Custom dark variant for targeting dark mode elements */
@custom-variant dark (&:is(.dark *));

/* CSS variables and theme definitions */
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

/* Light theme variables */
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

/* Dark theme variables */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

/* Tailwind base styles */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## API Integration Notes

For production use with the actual Clawdbrain backend, the controller integrates directly with the GatewayBrowserClient:

```typescript
// The controller already uses the GatewayBrowserClient
// From ui/src/ui/controllers/automations.ts:

import type { GatewayBrowserClient } from "../gateway";

export async function loadAutomations(state: AutomationsState) {
  if (!state.client || !state.connected || state.loading) return;

  state.loading = true;
  state.error = null;
  try {
    const res = await state.client.request("automations.list");
    state.automations = res.automations ?? [];
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to load automations");
  } finally {
    state.loading = false;
  }
}

// The view connects to the controller via state and callbacks
// See ui/src/ui/app.ts for wiring
```

---

## Mock Data Structure

```typescript
// Smart-Sync Fork specific automation data structure:
interface SmartSyncForkAutomationData extends AutomationData {
  type: "smart-sync-fork";
  config: {
    forkRepoUrl: string;
    upstreamRepoUrl: string;
    forkBranch: string;
    upstreamBranch: string;
    aiModel: string;
    confidenceThreshold: number;
    uncertaintyAction: "report-at-end" | "pause-and-ask" | "skip-file";
    autoMerge: boolean;
  };
}
```

---

## Key Features Captured

1. **Grid Layout** - Responsive 3-column grid (desktop) / 2-column (tablet) / 1-column (mobile) using Tailwind classes
2. **Card Styling** - Tailwind classes for borders, shadows, hover effects
3. **Status Badges** - Color-coded badges with Clawdbrain icons (Active, Suspended, Error, Running)
4. **Filter/Search** - Reactive state in controller with real-time filtering
5. **Quick Actions** - Run, Suspend/Resume, History, Edit, Delete buttons with Lit event handlers
6. **Kebab Menu** - CSS-based dropdown with toggle functionality
7. **Last Run Display** - Shows time, status (icon + color), duration
8. **Next Run Display** - Shows countdown or "Suspended" state
9. **Tags** - Display automation tags as styled spans
10. **Empty State** - Helpful message when no automations match filters
11. **Dark Mode** - Full dark mode support via CSS custom properties (var(--panel-strong), etc.)
