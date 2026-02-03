# View Components Library - Second Brain Platform

## Purpose

This document defines **reusable custom components** that enable:

1. **Parallel development** - teams can build components independently
2. **Consistency** - shared patterns across all views
3. **Velocity** - compose views from proven building blocks

## Component Tiers

### Tier 1: Primitives (from Shadcn/Radix)

Use directly, configure via props. No custom wrapper needed.

### Tier 2: Composed Components

Custom components built from Shadcn primitives with domain-specific logic.

### Tier 3: Domain Components

Feature-specific components that encapsulate business logic.

---

## Tier 1: Shadcn/Radix Primitives

These are installed via `npx shadcn@latest add <component>`:

| Component        | Usage               | Notes                                                     |
| ---------------- | ------------------- | --------------------------------------------------------- |
| `Button`         | All actions         | Variants: default, secondary, outline, ghost, destructive |
| `Card`           | Content containers  | With CardHeader, CardContent, CardFooter                  |
| `Dialog`         | Modals              | For confirmations, forms                                  |
| `Sheet`          | Slide-in panels     | For detail views, inspectors                              |
| `Tabs`           | View switching      | Within cards and pages                                    |
| `Input`          | Text entry          | With label, error states                                  |
| `Textarea`       | Multi-line text     | Markdown support areas                                    |
| `Select`         | Dropdowns           | Single selection                                          |
| `Switch`         | Toggles             | Boolean settings                                          |
| `Badge`          | Status indicators   | Variants for states                                       |
| `Avatar`         | Agent/user images   | With fallback initials                                    |
| `Skeleton`       | Loading states      | Content placeholders                                      |
| `Tooltip`        | Hints               | On hover information                                      |
| `Command`        | Command palette     | Cmd+K interface                                           |
| `DropdownMenu`   | Action menus        | Context menus                                             |
| `ScrollArea`     | Scrollable regions  | With custom scrollbars                                    |
| `Separator`      | Visual dividers     | Horizontal/vertical                                       |
| `Form`           | Form wrapper        | With react-hook-form                                      |
| `Toast` / Sonner | Notifications       | Transient feedback                                        |
| `Progress`       | Progress bars       | For workstreams, tasks                                    |
| `Collapsible`    | Expandable sections | For tool calls, details                                   |

---

## Tier 2: Composed Components

### Layout Components

#### `<AppShell>`

The root layout wrapper for the entire application.

```tsx
interface AppShellProps {
  children: React.ReactNode;
}

// Provides: sidebar, topbar, main content area
// Handles: responsive collapse, theme context
```

**Responsibilities:**

- Sidebar rendering and collapse state
- Topbar with notifications, user menu
- Main content scrolling
- Responsive breakpoint handling

---

#### `<Sidebar>`

The main navigation sidebar.

```tsx
interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}
```

**Subcomponents:**

- `<SidebarSection>` - grouped nav items with label
- `<SidebarItem>` - individual nav link
- `<SidebarWorkspaceSwitcher>` - workspace dropdown

---

#### `<PageHeader>`

Consistent header for all page views.

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode; // Right-aligned buttons
}
```

---

#### `<DetailPanel>`

Slide-in panel for detail views (uses Sheet).

```tsx
interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl"; // 320, 400, 480, 640px
}
```

---

#### `<SplitPane>`

Resizable multi-pane layout.

```tsx
interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number; // 0-1, default 0.5
  minLeft?: number; // min px
  minRight?: number;
  collapsible?: "left" | "right" | "both";
}
```

---

### Data Display Components

#### `<StatusBadge>`

Universal status indicator.

```tsx
interface StatusBadgeProps {
  status: "online" | "offline" | "busy" | "error" | "pending" | "success";
  label?: string;
  pulse?: boolean; // Animated pulse for active states
}
```

**Visual:**

- `online` → green dot + "Online"
- `offline` → gray dot + "Offline"
- `busy` → yellow dot + "Busy" (pulsing)
- `error` → red dot + "Error"
- `pending` → blue dot + "Pending"
- `success` → green check + "Complete"

---

#### `<EntityCard>`

Reusable card for displaying entities (agents, goals, workstreams).

```tsx
interface EntityCardProps {
  icon?: React.ReactNode;
  avatar?: string;
  title: string;
  subtitle?: string;
  status?: StatusBadgeProps;
  metadata?: { label: string; value: string }[];
  actions?: { label: string; onClick: () => void; variant?: "default" | "destructive" }[];
  onClick?: () => void;
  selected?: boolean;
}
```

**Usage:** Agent cards, goal cards, workspace cards, memory cards

---

#### `<MetricCard>`

Dashboard metric display.

```tsx
interface MetricCardProps {
  label: string;
  value: string | number;
  change?: { value: number; trend: "up" | "down" | "neutral" };
  icon?: React.ReactNode;
  href?: string;
}
```

---

#### `<ProgressBar>`

Enhanced progress with labels.

```tsx
interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "error";
}
```

---

#### `<Timeline>`

Chronological event display.

```tsx
interface TimelineProps {
  events: TimelineEvent[];
}

interface TimelineEvent {
  id: string;
  timestamp: Date;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actor?: { name: string; avatar?: string };
}
```

---

#### `<DataList>`

Key-value pair display.

```tsx
interface DataListProps {
  items: { label: string; value: React.ReactNode }[];
  columns?: 1 | 2; // Grid layout
}
```

---

### Form Components

#### `<FormSection>`

Grouped form fields with title.

```tsx
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}
```

---

#### `<FormField>`

Wrapper for labeled form inputs.

```tsx
interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}
```

---

#### `<MarkdownEditor>`

Rich markdown editing with preview.

```tsx
interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  preview?: boolean; // Show preview pane
  toolbar?: boolean; // Show formatting toolbar
  minHeight?: number;
}
```

**Features:**

- Formatting toolbar (bold, italic, lists, headers)
- Split view with live preview
- Drag-and-drop file upload
- Syntax highlighting for code blocks

---

#### `<RichTextInput>`

Enhanced textarea with attachments.

```tsx
interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  attachments?: Attachment[];
  onAttach?: (files: File[]) => void;
  placeholder?: string;
  submitLabel?: string;
  showVoice?: boolean;
}
```

---

#### `<SchedulePicker>`

User-friendly schedule selection (Rituals).

```tsx
interface SchedulePickerProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  showAdvanced?: boolean; // Show cron expression
}

interface ScheduleValue {
  type: "daily" | "weekly" | "monthly" | "custom";
  time?: string; // "09:00"
  days?: number[]; // 0-6 for weekly
  dayOfMonth?: number;
  cronExpression?: string; // For advanced
  timezone?: string;
}
```

**UX:** "Every day at 9:00 AM" with simple dropdowns, expandable to cron for power users.

---

#### `<PersonalitySlider>`

Custom slider for personality traits.

```tsx
interface PersonalitySliderProps {
  trait: string;
  leftLabel: string;
  rightLabel: string;
  value: number; // 0-100
  onChange: (value: number) => void;
  description?: string;
}
```

**Usage:** Soul/personality editor - "Formal ←→ Casual", "Concise ←→ Detailed"

---

### Chat Components

#### `<ChatMessage>`

Individual message in conversation.

```tsx
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string; // Markdown
  timestamp: Date;
  avatar?: string;
  name?: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  error?: string;
}
```

---

#### `<ToolCallCard>`

Collapsible tool call display.

```tsx
interface ToolCallCardProps {
  name: string;
  status: "pending" | "running" | "success" | "error";
  duration?: number; // ms
  input?: unknown;
  output?: unknown;
  defaultExpanded?: boolean;
}
```

---

#### `<ChatInput>`

Message composition area.

```tsx
interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach?: (files: File[]) => void;
  attachments?: Attachment[];
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean; // Show stop button
  onStop?: () => void;
}
```

---

#### `<ChatThread>`

Full conversation thread with virtualization.

```tsx
interface ChatThreadProps {
  messages: ChatMessage[];
  loading?: boolean;
  onLoadMore?: () => void;
  autoScroll?: boolean;
}
```

---

### Workflow Components

#### `<WorkflowCanvas>`

ReactFlow-based DAG visualization.

```tsx
interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onNodeClick?: (nodeId: string) => void;
  onNodeStatusChange?: (nodeId: string, status: TaskStatus) => void;
  interactive?: boolean;
  minimap?: boolean;
  controls?: boolean;
}
```

---

#### `<TaskNode>`

Custom ReactFlow node for tasks.

```tsx
interface TaskNodeProps {
  data: {
    title: string;
    status: "pending" | "in_progress" | "completed" | "blocked";
    assignee?: { name: string; avatar?: string };
    dueDate?: Date;
    priority?: "low" | "medium" | "high";
  };
}
```

---

#### `<TaskList>`

Linear task display (alternative to DAG).

```tsx
interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  groupBy?: "status" | "assignee" | "priority";
  showCompleted?: boolean;
}
```

---

### Navigation Components

#### `<Breadcrumbs>`

Navigation breadcrumb trail.

```tsx
interface BreadcrumbsProps {
  items: { label: string; href?: string }[];
}
```

---

#### `<TabNav>`

Tab navigation with route integration.

```tsx
interface TabNavProps {
  tabs: { label: string; value: string; href?: string; icon?: React.ReactNode }[];
  value: string;
  onChange?: (value: string) => void;
}
```

---

#### `<WorkspaceSwitcher>`

Dropdown for switching workspaces.

```tsx
interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSwitch: (workspaceId: string) => void;
  onCreate?: () => void;
}
```

---

### Feedback Components

#### `<EmptyState>`

Empty content placeholder.

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

---

#### `<LoadingState>`

Full-area loading indicator.

```tsx
interface LoadingStateProps {
  message?: string;
  progress?: number;
}
```

---

#### `<ErrorState>`

Error display with retry.

```tsx
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}
```

---

#### `<ConfirmDialog>`

Confirmation modal.

```tsx
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
}
```

---

## Tier 3: Domain Components

### Agent Components

#### `<AgentCard>`

Agent display card (extends EntityCard).

```tsx
interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
  showTasks?: boolean;
  showLastActive?: boolean;
}
```

---

#### `<AgentAvatar>`

Agent avatar with status indicator.

```tsx
interface AgentAvatarProps {
  agent: Agent;
  size?: "sm" | "md" | "lg" | "xl";
  showStatus?: boolean;
}
```

---

#### `<AgentSelector>`

Agent picker dropdown/modal.

```tsx
interface AgentSelectorProps {
  agents: Agent[];
  value?: string; // agentId
  onChange: (agentId: string) => void;
  placeholder?: string;
}
```

---

#### `<SoulEditor>`

Personality/SOUL.md visual editor.

```tsx
interface SoulEditorProps {
  value: SoulConfig;
  onChange: (value: SoulConfig) => void;
  showRaw?: boolean; // Toggle raw markdown
}
```

**Features:**

- Personality sliders
- Values/principles editor
- Communication style picker
- Template selection
- Raw markdown toggle

---

### Memory Components

#### `<MemoryCard>`

Individual memory display.

```tsx
interface MemoryCardProps {
  memory: Memory;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showSource?: boolean;
}
```

---

#### `<MemoryBrowser>`

Searchable memory list with filters.

```tsx
interface MemoryBrowserProps {
  memories: Memory[];
  onSelect?: (memoryId: string) => void;
  onEdit?: (memoryId: string) => void;
  onDelete?: (memoryId: string) => void;
  filters?: MemoryFilters;
}
```

---

### Goal Components

#### `<GoalCard>`

Goal display with progress.

```tsx
interface GoalCardProps {
  goal: Goal;
  onClick?: () => void;
  showWorkstreams?: boolean;
}
```

---

#### `<GoalProgress>`

Visual goal progress indicator.

```tsx
interface GoalProgressProps {
  goal: Goal;
  showMilestones?: boolean;
}
```

---

### Connection Components

#### `<ChannelCard>`

Messaging channel status and config.

```tsx
interface ChannelCardProps {
  channel: Channel;
  onConfigure?: () => void;
  onToggle?: (enabled: boolean) => void;
}
```

---

#### `<IntegrationCard>`

MCP/OAuth integration card.

```tsx
interface IntegrationCardProps {
  integration: Integration;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConfigure?: () => void;
}
```

---

#### `<OAuthFlow>`

OAuth authentication flow handler.

```tsx
interface OAuthFlowProps {
  provider: string;
  onSuccess: (tokens: OAuthTokens) => void;
  onError: (error: Error) => void;
  redirectUri: string;
}
```

---

## Component Development Guidelines

### File Structure

```
src/components/
├── ui/                    # Shadcn primitives (auto-generated)
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
├── composed/              # Tier 2 components
│   ├── layout/
│   │   ├── app-shell.tsx
│   │   ├── sidebar.tsx
│   │   ├── page-header.tsx
│   │   └── detail-panel.tsx
│   ├── data-display/
│   │   ├── status-badge.tsx
│   │   ├── entity-card.tsx
│   │   ├── metric-card.tsx
│   │   └── timeline.tsx
│   ├── forms/
│   │   ├── form-section.tsx
│   │   ├── markdown-editor.tsx
│   │   ├── schedule-picker.tsx
│   │   └── personality-slider.tsx
│   ├── chat/
│   │   ├── chat-message.tsx
│   │   ├── chat-input.tsx
│   │   ├── chat-thread.tsx
│   │   └── tool-call-card.tsx
│   ├── workflow/
│   │   ├── workflow-canvas.tsx
│   │   ├── task-node.tsx
│   │   └── task-list.tsx
│   └── feedback/
│       ├── empty-state.tsx
│       ├── loading-state.tsx
│       ├── error-state.tsx
│       └── confirm-dialog.tsx
├── domain/                # Tier 3 components
│   ├── agents/
│   │   ├── agent-card.tsx
│   │   ├── agent-avatar.tsx
│   │   ├── agent-selector.tsx
│   │   └── soul-editor.tsx
│   ├── memories/
│   │   ├── memory-card.tsx
│   │   └── memory-browser.tsx
│   ├── goals/
│   │   ├── goal-card.tsx
│   │   └── goal-progress.tsx
│   └── connections/
│       ├── channel-card.tsx
│       ├── integration-card.tsx
│       └── oauth-flow.tsx
└── index.ts               # Barrel exports
```

### Parallelization Strategy

**Independent work streams:**

1. **Foundation Team** (Week 1-2)
   - AppShell, Sidebar, PageHeader
   - Theme system, dark/light mode
   - Base Shadcn installation

2. **Data Display Team** (Week 1-2)
   - StatusBadge, EntityCard, MetricCard
   - Timeline, DataList, ProgressBar
   - Loading/Error/Empty states

3. **Forms Team** (Week 2-3)
   - FormSection, FormField, MarkdownEditor
   - SchedulePicker, PersonalitySlider
   - RichTextInput

4. **Chat Team** (Week 2-3)
   - ChatMessage, ChatInput, ChatThread
   - ToolCallCard, streaming support
   - Message virtualization

5. **Workflow Team** (Week 2-3)
   - WorkflowCanvas (ReactFlow setup)
   - TaskNode, TaskList
   - DAG interactions

6. **Domain Teams** (Week 3-4)
   - Agent components
   - Memory components
   - Goal components
   - Connection components

### Testing Requirements

Each component should have:

- Unit tests with React Testing Library
- Storybook stories for visual testing
- Accessibility audit (axe-core)

### Documentation

Each component file should include:

- JSDoc comments on props
- Usage examples in Storybook
- Accessibility notes
