# Custom Reusable React Components

> Application-specific components that sit on top of the shared UI primitives (Doc 03).
> These are **not** generic UI primitives — they are Clawdbrain-specific compositions
> that currently exist as repeated patterns across multiple views.
>
> Building these before view migration eliminates redundant per-view implementations
> and ensures consistency across the entire UI.

---

## Why This List Matters

The current Lit codebase has significant pattern duplication because there is no shared component
layer between "raw HTML" and "full view." The same dropdown, filter bar, data table, and form
patterns are reimplemented in each view with slight variations.

By building these components **once** during Phase 1 (alongside the UI primitives), every view
migration becomes a composition exercise rather than a reimplementation exercise.

---

## Component Catalog

### Tier 1: Build Before Any View Migration

These components are used across 3+ views. Build them during Phase 1 alongside the UI primitives.

---

#### 1. `<DataTable>`

**Replaces:** Per-view table implementations in Sessions (table mode), Logs (log entries), Cron (job list + run history), Automations (run history), Debug (model catalog), Nodes (node list).

**Current duplication:** Each view hand-codes its own grid/flex-based table with sorting, filtering, and row rendering. Sessions alone has 3 different layouts (list, table, grouped).

**Props:**
```tsx
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;

  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  getRowKey: (row: T) => string;

  // Row behavior
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  expandedRowRender?: (row: T) => React.ReactNode;

  // Pagination
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;

  // Virtual scrolling (optional, for large datasets)
  virtualized?: boolean;
  rowHeight?: number;
}

interface ColumnDef<T> {
  key: string;
  header: string | React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;          // CSS width
  align?: 'left' | 'center' | 'right';
  hideBelow?: number;      // Hide column below this viewport width (px)
}
```

**Features:**
- Responsive: columns hide below breakpoints via `hideBelow`
- Sortable headers with visual indicator
- Row expansion (click to expand detail row)
- Selection with Shift+Click range select
- Loading skeleton rows
- Empty state via `<EmptyState>` primitive
- Keyboard navigation (arrow keys to move focus)
- Sticky header on scroll

**Views that use it:** Sessions (table mode), Logs, Cron (jobs + runs), Automations (runs), Debug (models), Nodes, Agents (session list)

---

#### 2. `<FilterBar>`

**Replaces:** Per-view filter/search implementations in Sessions, Logs, Automations, Agents, Config.

**Current duplication:** Sessions has 8+ filter controls (search, agent label, kind, status, lane, tag, active minutes, preset). Logs has level filters + subsystem filters + text search. Each view builds its own flex-row of filter controls.

**Props:**
```tsx
interface FilterBarProps {
  children: React.ReactNode;       // Filter controls (composed by view)
  search?: {                       // Optional integrated search
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  presets?: Array<{                // Quick filter presets
    label: string;
    value: string;
    active: boolean;
  }>;
  onPresetChange?: (preset: string) => void;
  showAdvanced?: boolean;          // Toggle for advanced filters
  onToggleAdvanced?: () => void;
  resultCount?: number;            // "Showing N results"
  actions?: React.ReactNode;       // Right-side actions (export, refresh)
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ [🔍 Search...] [Preset1] [Preset2] [Preset3]  [▼ Filters] [Actions] │
│                                                              │
│ (Advanced filters row - collapsible)                         │
│ [Agent ▾] [Kind ▾] [Status ▾] [Lane ▾] [Tags...]            │
│                                                              │
│ Showing 42 results                                           │
└──────────────────────────────────────────────────────────────┘
```

**Features:**
- Responsive: collapses to stacked layout on mobile
- Presets as toggle group (`<ToggleGroup>`)
- Advanced filters section is collapsible
- Result count display
- Action slot for view-specific buttons (export, refresh, bulk actions)

**Views that use it:** Sessions, Logs, Automations, Agents, Config (search), Skills

---

#### 3. `<WizardDialog>`

**Replaces:** Channel config wizard, Onboarding wizard, Automation form (multi-step).

**Current duplication:** `channel-config-wizard.ts` (831 LOC), `onboarding-wizard.ts` (636 LOC), and `automation-form.ts` (315 LOC) each implement their own multi-step modal with navigation, validation, and progress indication.

**Props:**
```tsx
interface WizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void | Promise<void>;
  onCancel: () => void;
  size?: 'md' | 'lg' | 'xl';
  loading?: boolean;
  dirty?: boolean;                  // Warn before closing if dirty
  confirmClose?: boolean;           // Show "discard changes?" on close
}

interface WizardStep {
  id: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  content: React.ReactNode;
  validate?: () => boolean | Promise<boolean>;  // Gate progression
  optional?: boolean;
  disabled?: boolean;
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ [×] Title                               │
│─────────────────────────────────────────│
│ Step Navigation:                         │
│ (1) Setup ─── (2) Configure ─── (3) Done│
│─────────────────────────────────────────│
│                                         │
│   Step Content Area                      │
│                                         │
│─────────────────────────────────────────│
│ [Back]                    [Skip] [Next] │
└─────────────────────────────────────────┘
```

**Features:**
- Step validation before progression
- Dirty state detection with confirm-close dialog
- Step indicator (numbered dots or sidebar nav)
- Back/Next/Skip/Complete buttons
- Loading state during async validation or submission
- Keyboard: Enter to advance, Escape to close (with dirty check)

**Views that use it:** Channel config wizard, Onboarding wizard, Automation form

---

#### 4. `<PreviewDrawer>`

**Replaces:** Sessions preview drawer, Overseer goal drawer, potential future use in Logs/Debug.

**Current duplication:** Sessions has a preview drawer (expandable side panel showing chat history preview). Overseer has a drawer for node details. Both implement their own slide-in panel with header, body, and close button.

**Props:**
```tsx
interface PreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  width?: string;                   // Default: '400px'
  position?: 'right' | 'bottom';
  expandable?: boolean;             // Allow full-width expansion
  expanded?: boolean;
  onExpandToggle?: () => void;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  headerActions?: React.ReactNode;  // Buttons in header
  children: React.ReactNode;
}
```

**Features:**
- Slide-in animation from right (or bottom on mobile)
- Expandable to full width
- Loading skeleton
- Error state with retry
- Header with close button, title, and action slot
- Scrollable body
- Responsive: full-screen overlay on mobile

**Views that use it:** Sessions (preview), Overseer (node detail), potentially Logs (entry detail)

---

#### 5. `<ActivityTimeline>`

**Replaces:** Task sidebar timeline, Automation progress milestones, Overseer work node history, Cron run log.

**Current duplication:** The task sidebar (`chat-task-sidebar.ts`, 333 LOC), automation progress modal (`progress-modal.ts`, 227 LOC), and cron run log all display a vertical timeline of events with status indicators, timestamps, and expandable details.

**Props:**
```tsx
interface ActivityTimelineProps {
  items: TimelineItem[];
  loading?: boolean;
  emptyMessage?: string;
  variant?: 'compact' | 'full';
  maxItems?: number;              // Show "N more" link
  onShowMore?: () => void;
}

interface TimelineItem {
  id: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  timestamp?: number;
  duration?: number;
  icon?: React.ReactNode;
  detail?: React.ReactNode;      // Expandable detail content
  children?: TimelineItem[];     // Nested items
}
```

**Layout:**
```
● Running: Process user message          2s ago
│   └─ ○ tool_call: search_web          1s ago
│   └─ ● tool_result: 3 results         0s ago
│
✓ Completed: Format response             5s ago
│
◌ Pending: Send final response
```

**Features:**
- Vertical timeline with connecting line
- Status-colored dots (green=success, red=error, yellow=running, gray=pending)
- Running items show spinner animation
- Expandable detail sections
- Nested items (tool calls within a run)
- Compact variant for sidebar use
- Timestamp formatting via `formatAgo()`

**Views that use it:** Chat task sidebar, Automation progress modal, Cron run log, Overseer work node detail

---

#### 6. `<AgentPicker>`

**Replaces:** Agent selection in Session Navigator sidebar, Cron form agent select, Agent filter in Sessions, Agent list in Agents view.

**Current duplication:** The session navigator has an agent sidebar with emoji/letter avatars, names, and session counts. The cron form has an agent dropdown. The sessions filter has an agent label selector. All display agent data differently.

**Props:**
```tsx
interface AgentPickerProps {
  agents: AgentInfo[];
  value: string | null;               // Selected agent ID
  onSelect: (agentId: string) => void;
  variant?: 'sidebar' | 'dropdown' | 'compact';
  showSessionCount?: boolean;
  showLastActive?: boolean;
  showDefaultBadge?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  emoji?: string | null;
  avatarUrl?: string | null;
  isDefault?: boolean;
  sessionCount?: number;
  lastActive?: number;
}
```

**Variants:**
- `sidebar`: Vertical list with avatars (session navigator style)
- `dropdown`: Select-style dropdown (cron form, filters)
- `compact`: Inline chip with avatar (compact display)

**Views that use it:** Session Navigator, Cron form, Sessions filter, Agents view, Exec approvals agent select

---

#### 7. `<ConnectionStatus>`

**Replaces:** Topbar connection indicator, Chat disabled-reason overlay, various "not connected" warnings.

**Current duplication:** Connection state is checked in the topbar (pill with dot), in chat (disabled send button + reason text), in config (disabled save), and in multiple views that gate actions on `connected`.

**Props:**
```tsx
interface ConnectionStatusProps {
  variant?: 'pill' | 'banner' | 'inline';
  showWhenConnected?: boolean;   // Hide when connected (default: false)
}
```

**Variants:**
- `pill`: Compact status pill for topbar (dot + "Connected" / "Disconnected")
- `banner`: Full-width banner at top of view ("Reconnecting..." with spinner)
- `inline`: Inline text message ("Not connected. Actions are disabled.")

Reads `useConnectionStore()` directly — no props for connection state.

**Views that use it:** Topbar, Chat, Config, Channels, Cron, any view that gates actions on connection

---

#### 8. `<JsonViewer>`

**Replaces:** Expandable JSON display in Logs, Debug method caller result, Tool card output.

**Current duplication:** Logs has `.log-json__*` CSS classes for expandable JSON. Debug has inline JSON display for method call results. Tool cards sometimes show JSON output.

**Props:**
```tsx
interface JsonViewerProps {
  data: unknown;                    // JSON-serializable value
  collapsed?: boolean | number;     // Collapse depth (true = all collapsed, number = collapse after N levels)
  copyable?: boolean;               // Show copy button
  maxHeight?: string;               // Scrollable container
  theme?: 'dark' | 'light' | 'auto';
  rootName?: string | null;         // Root key name (null = no root)
  sortKeys?: boolean;
}
```

**Features:**
- Collapsible object/array nodes with click-to-expand
- Syntax-colored values (strings=green, numbers=blue, booleans=purple, null=gray)
- Copy button (copies formatted JSON)
- Search within JSON (highlight matches)
- Scrollable container with max-height

**Views that use it:** Logs, Debug, Chat (tool cards), Config (raw preview)

---

#### 9. `<FormSection>`

**Replaces:** Repeated form section pattern in Config, Channels, Cron, Automations, Onboarding.

**Current duplication:** Config form uses `renderFormSection()` (276 LOC). Channel wizard has its own form sections. Cron form has manual section layout. Every form view builds its own section container with title, description, and field grid.

**Props:**
```tsx
interface FormSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: React.ReactNode;         // e.g., "Required", "Advanced"
  columns?: 1 | 2 | 3;            // Field grid columns
  children: React.ReactNode;       // Form fields
}
```

**Layout:**
```
┌──────────────────────────────────┐
│ ⚙ Section Title        [Advanced]│
│ Description text here             │
│──────────────────────────────────│
│ ┌─────────┐  ┌─────────┐        │
│ │ Field 1  │  │ Field 2  │        │
│ └─────────┘  └─────────┘        │
│ ┌─────────────────────────┐      │
│ │ Field 3 (full width)     │      │
│ └─────────────────────────┘      │
└──────────────────────────────────┘
```

**Features:**
- Collapsible sections (uses `<Collapsible>` primitive)
- Responsive grid (2 columns → 1 column on mobile)
- Badge slot for "Required", "Advanced", "Beta" labels
- Icon slot for section identifier
- Consistent spacing and typography

**Views that use it:** Config, Channels (wizard), Cron (form), Automations (form), Onboarding, Exec Approvals, Skills

---

#### 10. `<SchemaFormField>`

**Replaces:** Config form's schema-driven field rendering (`config-form.node.ts`, 1,007 LOC).

**Current duplication:** The config form renders fields from a JSON schema with widgets determined by field type, enum values, and UI hints. This same pattern could be reused for any schema-driven form (plugin config, skill config, automation config).

**Props:**
```tsx
interface SchemaFormFieldProps {
  schema: JsonSchemaField;         // JSON Schema field definition
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;                    // Dot-notation path for nested fields
  uiHints?: FieldUiHints;         // Override widget type, placeholder, etc.
  disabled?: boolean;
  errors?: string[];
}

interface JsonSchemaField {
  type: string;                    // string, number, boolean, array, object
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;                 // date, uri, email, etc.
  items?: JsonSchemaField;        // Array item schema
  properties?: Record<string, JsonSchemaField>;
  required?: string[];
}

interface FieldUiHints {
  widget?: 'text' | 'textarea' | 'select' | 'checkbox' | 'switch' | 'slider' | 'stepper' | 'password' | 'color';
  placeholder?: string;
  helpText?: string;
  hidden?: boolean;
  advanced?: boolean;
  order?: number;
}
```

**Renders:** Automatically selects the appropriate form primitive (`<Input>`, `<Select>`, `<Checkbox>`, `<Switch>`, `<Slider>`, `<RadioGroup>`) based on the JSON Schema field definition and optional UI hints.

**Views that use it:** Config form (primary), Channel config, Skill config, Automation config (potentially)

---

### Tier 2: Build During Phase 2-3 (As Views Need Them)

These components are used in 2+ views but are specific enough that they can be built when the first view that needs them is migrated.

---

#### 11. `<ViewModeSwitch>`

**Replaces:** Sessions view mode switcher (list/table/grouped), potential use in other data views.

**Props:**
```tsx
interface ViewModeSwitchProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
    icon: React.ReactNode;
  }>;
  size?: 'sm' | 'md';
}
```

Renders as a `<ToggleGroup>` with icon buttons. Persists selection to localStorage.

**Views that use it:** Sessions, potentially Agents, Nodes

---

#### 12. `<ScheduleBuilder>`

**Replaces:** Cron schedule form, Automation schedule form.

**Props:**
```tsx
interface ScheduleBuilderProps {
  scheduleType: 'at' | 'every' | 'cron';
  onScheduleTypeChange: (type: 'at' | 'every' | 'cron') => void;
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  showTimezone?: boolean;
}

interface ScheduleValue {
  at?: string;                     // ISO datetime
  everyAmount?: number;
  everyUnit?: 'minutes' | 'hours' | 'days';
  cronExpr?: string;
  cronTz?: string;
}
```

**Layout:**
```
Schedule Type: [At a time] [Every interval] [Cron expression]

(At a time)     → Date/time picker
(Every interval) → [Amount] [Unit ▾]
(Cron expression) → [Cron input] [Timezone ▾]
                    Next run: Jan 28, 2026 at 3:00 PM
```

**Views that use it:** Cron form, Automation form

---

#### 13. `<ChannelIcon>`

**Replaces:** Per-channel icon rendering in Session Navigator, Channels view, Logs, Sessions.

**Props:**
```tsx
interface ChannelIconProps {
  channel: string;                 // slack, telegram, discord, signal, etc.
  size?: number;
  className?: string;
}
```

Maps channel names to Lucide icons. Single source of truth for the channel → icon mapping.

**Views that use it:** Session Navigator (channel sections), Channels view, Sessions (channel labels), Logs (session sidebar)

---

#### 14. `<MasterDetailLayout>`

**Replaces:** Agents master/detail layout, Config sidebar/content layout.

**Props:**
```tsx
interface MasterDetailLayoutProps {
  sidebar: React.ReactNode;
  detail: React.ReactNode;
  sidebarWidth?: string;           // Default: '280px'
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  stickyHeader?: boolean;
}
```

**Features:**
- Two-column layout with border separator
- Sidebar scrolls independently
- Responsive: stacks vertically on mobile
- Collapsible sidebar

**Views that use it:** Agents, Config, Logs (sidebar mode), Nodes

---

#### 15. `<LiveIndicator>`

**Replaces:** Logs "Live" badge, Chat streaming indicator, Cron "running" indicator.

**Props:**
```tsx
interface LiveIndicatorProps {
  active: boolean;
  label?: string;                  // Default: "Live"
  variant?: 'badge' | 'dot' | 'text';
}
```

Shows a pulsing dot + label when `active`. Used for real-time data streams.

**Views that use it:** Logs, Chat (streaming), Cron (running job)

---

#### 16. `<SessionKeyDisplay>`

**Replaces:** Repeated session key parsing/display logic across views.

Session keys follow the pattern `agent:agentId:channelType:context` (e.g., `agent:main:slack:#cb-inbox`). Multiple views parse and display these differently.

**Props:**
```tsx
interface SessionKeyDisplayProps {
  sessionKey: string;
  agents?: AgentInfo[];            // For name resolution
  variant?: 'full' | 'compact' | 'label-only';
  showChannel?: boolean;
  showAgent?: boolean;
  showStatus?: boolean;
  maxLength?: number;
}
```

Uses `resolveCurrentSessionInfo()` internally. Single source of truth for session key display logic.

**Views that use it:** Chat header, Sessions (all modes), Agents (session list), Logs (sidebar), Cron (run log)

---

#### 17. `<ErrorBoundary>` + `<ErrorState>`

**Replaces:** Per-view error display patterns.

**ErrorBoundary** wraps each view and catches render errors:
```tsx
interface ErrorBoundaryProps {
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}
```

**ErrorState** displays inline error messages with retry:
```tsx
interface ErrorStateProps {
  error: string | Error;
  onRetry?: () => void;
  variant?: 'inline' | 'card' | 'fullpage';
  title?: string;
}
```

**Views that use it:** Every view (ErrorBoundary), plus inline errors in data-fetching views

---

#### 18. `<ConfirmAction>`

**Replaces:** The "are you sure?" pattern before destructive actions. Currently, each view calls `showConfirmDialog()` or `showDangerConfirmDialog()`.

**Props:**
```tsx
interface ConfirmActionProps {
  trigger: React.ReactElement;      // The button that triggers confirmation
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}
```

Wraps any trigger button with an `<AlertDialog>` that opens on click. Simplifies the common pattern of "button → confirm dialog → action."

**Views that use it:** Session delete, Cron job delete, Automation delete, Channel disconnect, Config reset, Logs clear

---

### Tier 3: Build During Phase 4-5 (Chat + Shell Specific)

These are chat-specific or shell-specific compositions.

---

#### 19. `<ChatMessage>`

**Replaces:** `renderMessageGroup()` in `grouped-render.ts` (313 LOC).

The complete message rendering pipeline: avatar, sender name, timestamp, message bubbles, tool cards, copy button, streaming cursor.

**Props:**
```tsx
interface ChatMessageProps {
  group: MessageGroup;
  assistantName: string;
  assistantAvatar: string | null;
  showThinking: boolean;
  isStreaming?: boolean;
  onCopy: (text: string) => void;
  onToolCardClick?: (toolId: string) => void;
  onReadAloud?: (text: string) => void;
}
```

---

#### 20. `<SessionNavigator>`

**Replaces:** `session-navigator.ts` (452 LOC).

The full agent/session dropdown with two-column layout.

**Props:**
```tsx
interface SessionNavigatorProps {
  sessionKey: string;
  onSelectSession: (key: string) => void;
  // All data fetched internally via useSessionsQuery() + useAgentsQuery()
}
```

**Composed from:** `<Popover>`, `<SearchInput>`, `<AgentPicker>`, `<ScrollArea>`, `<Badge>`, `<StatusDot>`, `<Avatar>`

---

#### 21. `<CommandPalette>`

**Replaces:** `command-palette.ts` (443 LOC).

Consider using `cmdk` (https://cmdk.paco.me/) as the base instead of building from scratch. cmdk provides keyboard navigation, fuzzy search, and grouping out of the box.

**Props:**
```tsx
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  onSelect: (command: Command) => void;
}
```

---

## Component Dependency Graph

```
UI Primitives (Doc 03)
    │
    ├── Button, IconButton, Card, Badge, StatusDot, Input, Select, ...
    │
Custom Components (this doc)
    │
    ├── Tier 1 (build first):
    │   ├── DataTable ─────── uses: Button, Badge, Skeleton, EmptyState, ScrollArea
    │   ├── FilterBar ──────── uses: SearchInput, Button, Badge, Select, Collapsible
    │   ├── WizardDialog ──── uses: Dialog, Button, Progress
    │   ├── PreviewDrawer ─── uses: GlassPanel, Button, IconButton, ScrollArea, Skeleton
    │   ├── ActivityTimeline ─ uses: StatusDot, Badge, Collapsible
    │   ├── AgentPicker ────── uses: Avatar, Badge, Select, ScrollArea
    │   ├── ConnectionStatus ─ uses: Badge, StatusDot
    │   ├── JsonViewer ─────── uses: Collapsible, Button (copy)
    │   ├── FormSection ────── uses: Collapsible, Badge
    │   └── SchemaFormField ── uses: Input, Select, Checkbox, Switch, Slider, RadioGroup
    │
    ├── Tier 2 (build with views):
    │   ├── ViewModeSwitch ── uses: Tabs
    │   ├── ScheduleBuilder ─ uses: Input, Select, Tabs
    │   ├── ChannelIcon ───── uses: lucide-react icons
    │   ├── MasterDetailLayout uses: SplitPane
    │   ├── LiveIndicator ─── uses: StatusDot, Badge
    │   ├── SessionKeyDisplay  uses: Avatar, Badge
    │   ├── ErrorBoundary ──── uses: Card, Button
    │   └── ConfirmAction ──── uses: AlertDialog, Button
    │
    └── Tier 3 (chat + shell):
        ├── ChatMessage ────── uses: Avatar, Badge, Markdown, CodeBlock, Tooltip
        ├── SessionNavigator ─ uses: Popover, SearchInput, AgentPicker, ScrollArea
        └── CommandPalette ─── uses: Dialog, SearchInput (or cmdk library)
```

---

## Migration Impact Summary

| Metric | Without These Components | With These Components |
|--------|------------------------|-----------------------|
| Per-view boilerplate | ~200-400 LOC of layout/table/filter code per view | ~50-100 LOC of composition code per view |
| Table implementations | 6+ separate implementations | 1 shared `<DataTable>` |
| Form section layouts | 5+ copy-paste patterns | 1 shared `<FormSection>` |
| Wizard implementations | 3 separate multi-step modals | 1 shared `<WizardDialog>` |
| Filter bar layouts | 4+ custom filter rows | 1 shared `<FilterBar>` |
| Timeline displays | 4+ timeline patterns | 1 shared `<ActivityTimeline>` |
| Agent display logic | 5+ places parsing agent data | 1 shared `<AgentPicker>` |
| Error display | Per-view inline patterns | 1 shared `<ErrorBoundary>` + `<ErrorState>` |
| Confirm dialogs | Per-view `showConfirmDialog()` calls | 1 shared `<ConfirmAction>` wrapper |
| JSON display | 3+ inline JSON renderers | 1 shared `<JsonViewer>` |
| **Estimated LOC saved** | — | **~8,000-12,000 lines** across all views |

---

## Build Order

**Phase 1 (build with primitives):**
1. `FormSection` + `SchemaFormField` — needed by Config, Channels, Cron, Automations
2. `DataTable` — needed by Sessions, Logs, Cron, Automations, Agents
3. `FilterBar` — needed by Sessions, Logs, Automations
4. `AgentPicker` — needed by Session Navigator, Cron, Sessions
5. `ConnectionStatus` — needed by every view
6. `ActivityTimeline` — needed by Chat task sidebar, Automations
7. `JsonViewer` — needed by Logs, Debug
8. `WizardDialog` — needed by Channels, Automations, Onboarding
9. `PreviewDrawer` — needed by Sessions, Overseer
10. `ErrorBoundary` + `ErrorState` — needed by every view

**Phase 2-3 (build as needed):**
11. `ViewModeSwitch` — when Sessions view is migrated
12. `ScheduleBuilder` — when Cron view is migrated
13. `ChannelIcon` — when Channels or Session Navigator is migrated
14. `MasterDetailLayout` — when Agents view is migrated
15. `LiveIndicator` — when Logs view is migrated
16. `SessionKeyDisplay` — when Sessions view is migrated
17. `ConfirmAction` — when first destructive action is migrated

**Phase 4-5 (build with chat/shell):**
18. `ChatMessage` — when Chat view is migrated
19. `SessionNavigator` — when Chat view is migrated
20. `CommandPalette` — when App Shell is migrated
