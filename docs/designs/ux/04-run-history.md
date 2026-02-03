# Run History View - UI Prototype

**Generated:** 2025-01-26
**Component:** Run History Table with Expandable Details
**Magic MCP Response:** Full table component with filtering, pagination, and expandable rows

---

## ⚠️ Stack Translation Applied

**Original Magic MCP Output:** React + shadcn/ui Table component
**Clawdbrain Stack:** Lit Web Components + Tailwind v4 + Custom Design System

This document has been translated from React patterns to Lit Web Components following Clawdbrain's conventions.

### Translation Applied:

- React `useState` → Controller state with reactive properties
- React Table → `<table>` with Tailwind classes
- Expandable rows → Lit reactive state with CSS transitions
- Pagination buttons → Reactive page state in Lit
- Filters → Event listeners on input changes in Lit (`@input`, `@change`)
- lucide-react icons → Clawdbrain's `icon()` function
- shadcn/ui components → Native HTML with Tailwind classes
- CSS animations for expand/collapse with `@keyframes`

---

## Installation

**Note:** These packages were required for the original React prototype. The Clawdbrain Lit implementation uses existing dependencies only.

```bash
npm install lucide-react @radix-ui/react-slot class-variance-authority @radix-ui/react-select @radix-ui/react-separator clsx tailwind-merge
```

---

## Main History View Controller and Render Functions

```typescript
// ui/src/ui/controllers/run-history.ts

import type { GatewayBrowserClient } from "../gateway";

export interface Artifact {
  id: string;
  name: string;
  type: string;
  size: string;
  url: string;
}

export interface TimelineEvent {
  timestamp: string;
  action: string;
  status: "success" | "warning" | "error";
  details: string;
}

export interface ConflictDetail {
  type: string;
  description: string;
  resolution: string;
}

export interface ExecutionRecord {
  id: string;
  timestamp: string;
  duration: string;
  status: "success" | "failed" | "warning" | "running";
  summary: string;
  artifacts: Artifact[];
  timeline: TimelineEvent[];
  conflicts: ConflictDetail[];
  aiModel: {
    name: string;
    version: string;
    tokensUsed: number;
    cost: string;
  };
}

export interface RunHistoryState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  records: ExecutionRecord[];
  expandedRows: Set<string>;
  currentPage: number;
  statusFilter: "all" | ExecutionRecord["status"];
  dateFrom: string;
  dateTo: string;
  itemsPerPage: number;
  error: string | null;
}

// Computed properties
export function getFilteredData(state: RunHistoryState): ExecutionRecord[] {
  return state.records.filter((record) => {
    if (state.statusFilter !== "all" && record.status !== state.statusFilter) return false;
    if (state.dateFrom && record.timestamp < state.dateFrom) return false;
    if (state.dateTo && record.timestamp > state.dateTo) return false;
    return true;
  });
}

export function getTotalPages(state: RunHistoryState, filteredData: ExecutionRecord[]): number {
  return Math.ceil(filteredData.length / state.itemsPerPage);
}

export function getPaginatedData(
  state: RunHistoryState,
  filteredData: ExecutionRecord[],
): ExecutionRecord[] {
  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  return filteredData.slice(startIndex, startIndex + state.itemsPerPage);
}

export function toggleRow(state: RunHistoryState, id: string): void {
  if (state.expandedRows.has(id)) {
    state.expandedRows.delete(id);
  } else {
    state.expandedRows.add(id);
  }
}

export function clearFilters(state: RunHistoryState): void {
  state.statusFilter = "all";
  state.dateFrom = "";
  state.dateTo = "";
}
```

```typescript
// ui/src/ui/views/run-history.ts
import { html, nothing } from "lit";
import { icon } from "../icons";
import type { RunHistoryState, ExecutionRecord, TimelineEvent } from "../controllers/run-history";

export interface RunHistoryProps {
  state: RunHistoryState;
  onToggleRow: (id: string) => void;
  onPageChange: (page: number) => void;
  onStatusFilterChange: (status: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onClearFilters: () => void;
  onDownloadArtifact: (artifactId: string) => void;
}

export function renderRunHistory(props: RunHistoryProps) {
  const {
    state,
    onToggleRow,
    onPageChange,
    onStatusFilterChange,
    onDateFromChange,
    onDateToChange,
    onClearFilters,
  } = props;

  const filteredData = getFilteredData(state);
  const totalPages = getTotalPages(state, filteredData);
  const paginatedData = getPaginatedData(state, filteredData);
  const startIndex = (state.currentPage - 1) * state.itemsPerPage;

  return html`
    <div class="run-history-view w-full min-h-screen bg-background p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold text-foreground">Run History</h1>
            <p class="text-muted-foreground mt-1">View and analyze past automation executions</p>
          </div>
        </div>

        <!-- Filter Card -->
        <div class="filter-card p-6 rounded-lg border border-border bg-card">
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex items-center gap-2">
              ${icon("filter", { size: 16, class: "text-muted-foreground" })}
              <span class="text-sm font-medium">Filters:</span>
            </div>

            <!-- Date Range -->
            <div class="flex items-center gap-2">
              ${icon("calendar", { size: 16, class: "text-muted-foreground" })}
              <input
                type="date"
                .value="${state.dateFrom}"
                @input="${(e: InputEvent) =>
                  onDateFromChange((e.target as HTMLInputElement).value)}"
                class="w-40 px-3 py-2 text-sm rounded-md border border-input bg-background"
                placeholder="From"
              />
              <span class="text-muted-foreground">to</span>
              <input
                type="date"
                .value="${state.dateTo}"
                @input="${(e: InputEvent) => onDateToChange((e.target as HTMLInputElement).value)}"
                class="w-40 px-3 py-2 text-sm rounded-md border border-input bg-background"
                placeholder="To"
              />
            </div>

            <!-- Status Filter -->
            <select
              .value="${state.statusFilter}"
              @change="${(e: Event) => onStatusFilterChange((e.target as HTMLSelectElement).value)}"
              class="w-40 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="warning">Warning</option>
              <option value="running">Running</option>
            </select>

            <!-- Clear Filters Button -->
            <button
              @click="${onClearFilters}"
              class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <!-- History Table -->
        <div class="history-card rounded-lg border border-border bg-card overflow-hidden">
          <table class="w-full">
            <thead class="bg-muted/50">
              <tr>
                <th class="w-12 px-4 py-3 text-left text-sm font-medium text-muted-foreground"></th>
                <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Timestamp
                </th>
                <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Duration
                </th>
                <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Summary
                </th>
                <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Artifacts
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              ${paginatedData.map((record) => renderHistoryRow(record, state, onToggleRow, props))}
            </tbody>
          </table>

          <!-- Empty State -->
          ${paginatedData.length === 0
            ? html`
                <div class="text-center py-12">
                  <p class="text-muted-foreground">No execution records found</p>
                </div>
              `
            : nothing}

          <!-- Pagination -->
          ${totalPages > 1
            ? renderPagination(state, filteredData, totalPages, startIndex, onPageChange)
            : nothing}
        </div>
      </div>
    </div>
  `;
}

function renderHistoryRow(
  record: ExecutionRecord,
  state: RunHistoryState,
  onToggleRow: (id: string) => void,
  props: RunHistoryProps,
) {
  const isExpanded = state.expandedRows.has(record.id);

  return html`
    <!-- Main Row (clickable to expand) -->
    <tr class="cursor-pointer hover:bg-muted/50 transition-colors">
      <td class="px-4 py-3">
        <button
          @click="${() => onToggleRow(record.id)}"
          class="p-0 h-8 w-8 rounded hover:bg-muted flex items-center justify-center"
        >
          ${icon(isExpanded ? "chevron-up" : "chevron-down", { size: 16 })}
        </button>
      </td>
      <td class="px-4 py-3 font-mono text-sm">${record.timestamp}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-1 text-muted-foreground">
          ${icon("clock", { size: 12, class: "text-muted-foreground" })}
          <span class="text-sm">${record.duration}</span>
        </div>
      </td>
      <td class="px-4 py-3">${renderStatusBadge(record.status)}</td>
      <td class="px-4 py-3 max-w-md">
        <p class="text-sm truncate">${record.summary}</p>
      </td>
      <td class="px-4 py-3">
        <span
          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground font-mono"
        >
          ${record.artifacts.length} files
        </span>
      </td>
    </tr>

    <!-- Expanded Details Row -->
    ${isExpanded
      ? html`
          <tr class="expanded-row">
            <td colspan="6" class="bg-muted/30 px-6 py-4">
              <div class="space-y-6">
                <!-- Two Column Layout -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- Left Column: Timeline + Conflicts -->
                  <div class="space-y-4">
                    <!-- Execution Timeline -->
                    <div>
                      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
                        ${icon("clock", { size: 16, class: "text-muted-foreground" })} Execution
                        Timeline
                      </h3>
                      <div class="space-y-3">
                        ${record.timeline.map((event, idx) =>
                          renderTimelineItem(event, idx, record.timeline),
                        )}
                      </div>
                    </div>

                    <!-- Conflict Details (if any) -->
                    ${record.conflicts.length > 0
                      ? html`
                          <div>
                            <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
                              ${icon("alert-triangle", { size: 16, class: "text-orange-500" })}
                              Conflict Details
                            </h3>
                            <div class="space-y-2">
                              ${record.conflicts.map((conflict) => renderConflictItem(conflict))}
                            </div>
                          </div>
                        `
                      : nothing}
                  </div>

                  <!-- Right Column: AI Info + Artifacts -->
                  <div class="space-y-4">
                    <!-- AI Model Information -->
                    <div>
                      <h3 class="text-sm font-semibold mb-3">AI Model Information</h3>
                      <div class="bg-background rounded-lg p-4 border border-border space-y-2">
                        <div class="flex justify-between">
                          <span class="text-sm text-muted-foreground">Model:</span>
                          <span class="text-sm font-medium">${record.aiModel.name}</span>
                        </div>
                        <div class="h-px bg-border"></div>
                        <div class="flex justify-between">
                          <span class="text-sm text-muted-foreground">Version:</span>
                          <span class="text-sm font-mono">${record.aiModel.version}</span>
                        </div>
                        <div class="h-px bg-border"></div>
                        <div class="flex justify-between">
                          <span class="text-sm text-muted-foreground">Tokens Used:</span>
                          <span class="text-sm font-mono"
                            >${record.aiModel.tokensUsed.toLocaleString()}</span
                          >
                        </div>
                        <div class="h-px bg-border"></div>
                        <div class="flex justify-between">
                          <span class="text-sm text-muted-foreground">Cost:</span>
                          <span class="text-sm font-medium">${record.aiModel.cost}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Artifacts -->
                    <div>
                      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
                        ${icon("file-text", { size: 16, class: "text-muted-foreground" })} Artifacts
                      </h3>
                      <div class="space-y-2">
                        ${record.artifacts.map((artifact) => renderArtifactItem(artifact, props))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `
      : nothing}
  `;
}

function renderStatusBadge(status: ExecutionRecord["status"]) {
  const config = getStatusConfig(status);
  return html`
    <span
      class="${config.classes} inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border"
    >
      ${icon(config.icon, { size: 12 })}
      <span class="capitalize">${status}</span>
    </span>
  `;
}

function renderTimelineItem(event: TimelineEvent, idx: number, allEvents: TimelineEvent[]) {
  const colorClass = getTimelineStatusColor(event.status);

  return html`
    <div class="flex gap-3">
      <div class="flex flex-col items-center">
        <div class="w-2 h-2 rounded-full ${colorClass}"></div>
        ${idx < allEvents.length - 1
          ? html`<div class="w-0.5 h-full bg-border mt-1"></div>`
          : nothing}
      </div>
      <div class="flex-1 pb-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-mono text-muted-foreground">${event.timestamp}</span>
          <span class="text-sm font-medium">${event.action}</span>
        </div>
        <p class="text-xs text-muted-foreground">${event.details}</p>
      </div>
    </div>
  `;
}

function renderConflictItem(conflict: ConflictDetail) {
  return html`
    <div class="bg-background rounded-lg p-3 border border-border">
      <div class="flex items-start gap-2">
        <span
          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border border-border"
        >
          ${conflict.type}
        </span>
      </div>
      <div>
        <p class="text-sm mt-2">${conflict.description}</p>
        <p class="text-xs text-muted-foreground mt-1">
          <span class="font-medium">Resolution:</span> ${conflict.resolution}
        </p>
      </div>
    </div>
  `;
}

function renderArtifactItem(artifact: Artifact, props: RunHistoryProps) {
  return html`
    <div
      class="bg-background rounded-lg p-3 border border-border flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <div class="flex items-center gap-3">
        ${icon("file-text", { size: 16, class: "text-muted-foreground" })}
        <div>
          <p class="text-sm font-medium">${artifact.name}</p>
          <p class="text-xs text-muted-foreground">
            ${artifact.type.toUpperCase()} • ${artifact.size}
          </p>
        </div>
      </div>
      <button
        @click="${() => props.onDownloadArtifact(artifact.id)}"
        class="p-2 rounded hover:bg-muted transition-colors"
      >
        ${icon("download", { size: 16 })}
      </button>
    </div>
  `;
}

function renderPagination(
  state: RunHistoryState,
  filteredData: ExecutionRecord[],
  totalPages: number,
  startIndex: number,
  onPageChange: (page: number) => void,
) {
  return html`
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <div class="text-sm text-muted-foreground">
        Showing ${startIndex + 1} to
        ${Math.min(startIndex + state.itemsPerPage, filteredData.length)} of ${filteredData.length}
        results
      </div>
      <div class="flex items-center gap-2">
        <!-- Previous Button -->
        <button
          @click="${() => onPageChange(Math.max(1, state.currentPage - 1))}"
          ?disabled="${state.currentPage === 1}"
          class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ${icon("chevron-left", { size: 16 })} Previous
        </button>

        <!-- Page Numbers -->
        <div class="flex items-center gap-1">
          ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (state.currentPage <= 3) {
              pageNum = i + 1;
            } else if (state.currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = state.currentPage - 2 + i;
            }

            const isActive = state.currentPage === pageNum;
            return html`
              <button
                @click="${() => onPageChange(pageNum)}"
                class="w-8 h-8 flex items-center justify-center text-sm font-medium rounded-md ${isActive
                  ? "bg-primary text-primary-foreground"
                  : "border border-input bg-background hover:bg-muted"}"
              >
                ${pageNum}
              </button>
            `;
          })}
        </div>

        <!-- Next Button -->
        <button
          @click="${() => onPageChange(Math.min(totalPages, state.currentPage + 1))}"
          ?disabled="${state.currentPage === totalPages}"
          class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next ${icon("chevron-right", { size: 16 })}
        </button>
      </div>
    </div>

    <style>
      .expanded-row {
        animation: expand-row 0.3s ease-out;
      }
      @keyframes expand-row {
        from {
          max-height: 0;
          opacity: 0;
        }
        to {
          max-height: 1000px;
          opacity: 1;
        }
      }
    </style>
  `;
}

// Status configuration
function getStatusConfig(status: ExecutionRecord["status"]) {
  switch (status) {
    case "success":
      return {
        classes: "bg-green-500/10 text-green-700 border-green-500/20",
        icon: "check-circle",
      };
    case "failed":
      return {
        classes: "bg-red-500/10 text-red-700 border-red-500/20",
        icon: "x-circle",
      };
    case "warning":
      return {
        classes: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
        icon: "alert-triangle",
      };
    case "running":
      return {
        classes: "bg-blue-500/10 text-blue-700 border-blue-500/20",
        icon: "clock",
      };
  }
}

function getTimelineStatusColor(status: TimelineEvent["status"]): string {
  switch (status) {
    case "success":
      return "bg-green-500";
    case "warning":
      return "bg-yellow-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}
```

---

## Key Features Captured

### Filter Controls

1. **Date Range Picker** - From/To date inputs for filtering by date range
2. **Status Dropdown** - Filter by execution status (All/Success/Failed/Warning/Running)
3. **Clear Filters Button** - Reset all filters to default

### Table Columns

1. **Expand Toggle** - Chevron up/down button to expand row details
2. **Timestamp** - Formatted date string
3. **Duration** - Time elapsed with clock icon
4. **Status Badge** - Color-coded badge with icon
5. **Summary** - One-line description of execution
6. **Artifacts Count** - Number of artifacts produced

### Expanded Details Section

1. **Execution Timeline** - Vertical timeline with colored dots, connecting lines, timestamps
2. **Conflict Details** - Shows conflict type, description, resolution (when applicable)
3. **AI Model Info** - Model name, version, tokens used, cost
4. **Artifacts List** - Downloadable files with type, size, and name

### Status Colors

- **Success**: Green background, checkmark icon
- **Failed**: Red background, X icon
- **Warning**: Yellow background, alert triangle icon
- **Running**: Blue background, clock icon

### Timeline Visuals

- Colored dots (green/yellow/red/gray) for each event status
- Vertical connecting lines between timeline events
- Timestamp + action label + details for each event

### Pagination

- Smart page number display (shows max 5 page numbers)
- Previous/Next buttons with disabled states
- Results count display ("Showing 1 to 20 of 156 results")

---

## Smart-Sync Fork Specific Fields

For Git fork sync automation runs, the expanded details should show:

```typescript
interface GitSyncExecutionRecord extends ExecutionRecord {
  // Basic fields (inherited)
  id: string;
  timestamp: string;
  duration: string;
  status: "success" | "partial" | "failed";
  summary: string;

  // Git-specific artifacts
  artifacts: [
    {
      id: "art-1";
      name: "feature-branch";
      type: "branch";
      url: "https://github.com/user/repo/tree/branch";
    },
    { id: "art-2"; name: "PR #123"; type: "pr"; url: "https://github.com/user/repo/pull/123" },
    { id: "art-3"; name: "run-log.txt"; type: "log"; url: "/api/logs/automation-run-id.log" },
  ];

  // Git-specific timeline
  timeline: [
    {
      timestamp: "10:30:15";
      action: "Clone Repository";
      status: "success";
      details: "Cloned from git@github.com:user/repo.git";
    },
    {
      timestamp: "10:30:30";
      action: "Fetch Upstream";
      status: "success";
      details: "Fetched 15 commits from upstream";
    },
    {
      timestamp: "10:31:00";
      action: "Merge Detected";
      status: "warning";
      details: "Found 5 merge conflicts";
    },
    {
      timestamp: "10:32:15";
      action: "Conflicts Resolved";
      status: "success";
      details: "Resolved 4 conflicts, 1 requires attention";
    },
    {
      timestamp: "10:33:00";
      action: "Pushed Branch";
      status: "success";
      details: "Pushed to smart-sync/auto-sync-timestamp";
    },
    { timestamp: "10:33:15"; action: "PR Created"; status: "success"; details: "Opened PR #123" },
  ];

  // Conflict details
  conflicts: [
    {
      type: "Merge Conflict";
      description: "src/core/processor.ts - Conflicting changes in function signature";
      resolution: "Accepted upstream version, preserved local additions";
    },
    {
      type: "Uncertain Resolution";
      description: "package.json - Dependency version conflict";
      resolution: "Flagged for review - not auto-resolved";
    },
  ];

  // AI information
  aiModel: {
    name: "claude-opus-4-5-20251101";
    version: "latest";
    tokensUsed: 12450;
    cost: "$0.08";
  };
}
```

---

## Empty State

```html
<!-- When no history exists -->
<div class="text-center py-12">
  <svg
    class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 8v4l-6 6" />
  </svg>
  <h3 class="text-lg font-semibold text-foreground mb-2">No run history yet</h3>
  <p class="text-muted-foreground">
    This automation hasn't been executed yet. Run it manually to see history here.
  </p>
</div>
```

---

## Responsive Behavior

- **Desktop (< 768px)**: Full table with all columns, two-column detail layout
- **Tablet (< 1024px)**: Hide less important columns, single column details
- **Mobile**: Stacked layout, full-width cards instead of table

---

## CSS Animations for Expand/Collapse

```css
/* Expandable row animation */
.expanded-row {
  animation: expand-row 0.3s ease-out;
}

@keyframes expand-row {
  from {
    max-height: 0;
    opacity: 0;
  }
  to {
    max-height: 1000px;
    opacity: 1;
  }
}

/* Chevron rotation */
.chevron {
  transition: transform 0.2s ease;
}

.chevron.up {
  transform: rotate(180deg);
}
```

---

## API Integration Notes

```typescript
// ui/src/ui/controllers/run-history.ts

// Fetch run history from Clawdbrain API
export async function fetchRunHistory(
  state: RunHistoryState,
  automationId: string,
  limit = 50,
): Promise<void> {
  if (!state.client || !state.connected) return;

  try {
    state.loading = true;
    const response = await state.client.request("automations.history", { id: automationId, limit });
    state.records = response.records;
    state.error = null;
  } catch (err) {
    console.error("Failed to fetch run history:", err);
    state.error = "Failed to load run history";
  } finally {
    state.loading = false;
  }
}

// Real-time updates via SSE (optional)
export function subscribeToHistoryUpdates(
  state: RunHistoryState,
  automationId: string,
  onUpdate: (record: ExecutionRecord) => void,
): () => void {
  const eventSource = new EventSource(`/api/automations/${automationId}/history/stream`);

  eventSource.onmessage = (event) => {
    const newRecord = JSON.parse(event.data) as ExecutionRecord;
    // Prepend to data array, maintain max limit
    state.records.unshift(newRecord);
    if (state.records.length > 100) {
      state.records = state.records.slice(0, 100);
    }
    onUpdate(newRecord);
  };

  return () => eventSource.close();
}

// Download artifact
export async function downloadArtifact(artifact: Artifact): Promise<void> {
  const link = document.createElement("a");
  link.href = artifact.url;
  link.download = artifact.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```
