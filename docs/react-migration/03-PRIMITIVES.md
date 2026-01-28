# Shared Primitives Specification

> Every shared UI primitive that must exist before view migration begins.
> Built and tested in isolation during Phase 1.
> Cross-referenced from the Inventory (Doc 02) — every view references these by name.

---

## Directory Structure

```
ui/src/components/ui/
  Avatar.tsx
  Badge.tsx
  Button.tsx
  Card.tsx
  Checkbox.tsx
  CodeBlock.tsx
  Collapsible.tsx
  Dialog.tsx
  AlertDialog.tsx
  EmptyState.tsx
  GlassPanel.tsx
  IconButton.tsx
  Input.tsx
  Markdown.tsx
  Popover.tsx
  Progress.tsx
  RadioGroup.tsx
  SaveButton.tsx
  ScrollArea.tsx
  SearchInput.tsx
  Select.tsx
  Separator.tsx
  Skeleton.tsx
  Slider.tsx
  SplitPane.tsx
  StatCard.tsx
  StatusDot.tsx
  Switch.tsx
  Tabs.tsx
  Toast.tsx
  Tooltip.tsx
```

Each file is a self-contained component with colocated CSS Module.
Every component uses the existing CSS custom properties (`--accent`, `--border`, `--text`, etc.).

---

## 1. Button

**Wraps:** Native `<button>` element
**Radix:** None needed

### Variants

| Variant | CSS | Use Case |
|---------|-----|----------|
| `primary` | `background: var(--accent)`, dark text | Primary actions (Send, Save, Create) |
| `secondary` | `border: 1px solid var(--border)`, transparent bg | Secondary actions (Cancel, Back) |
| `ghost` | No border/bg, muted text | Tertiary actions, inline links |
| `danger` | `background: var(--danger-muted)`, danger text | Destructive actions (Delete, Disconnect) |
| `outline` | `border: 1px solid var(--border)`, transparent | Alternative secondary |

### Sizes

| Size | Padding | Font | Height |
|------|---------|------|--------|
| `sm` | `6px 12px` | `12px` | `32px` |
| `md` (default) | `8px 16px` | `13px` | `36px` |
| `lg` | `10px 20px` | `14px` | `40px` |

### Props

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;        // Show spinner, disable interaction
  icon?: React.ReactNode;   // Leading icon
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}
```

### Behavior

- `loading` state shows a spinner icon and disables the button
- Keyboard: Enter/Space triggers click
- Focus ring: `0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`
- Disabled state: `opacity: 0.5; cursor: not-allowed`

---

## 2. IconButton

**Wraps:** `<Button>` with icon-only layout
**Radix:** None

### Props

```tsx
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'default' | 'send' | 'abort' | 'recording' | 'active';
  size?: 'sm' | 'md' | 'lg';
  badge?: number | string;  // Overlay badge (e.g., task count)
  tooltip?: string;         // Wraps in <Tooltip> if provided
}
```

### Variant Styles

| Variant | Background | Color | Extra |
|---------|-----------|-------|-------|
| `default` | transparent | `var(--muted)` | — |
| `send` | `linear-gradient(135deg, var(--accent), ...)` | `#000` | Box shadow glow |
| `abort` | `rgba(255, 107, 107, 0.15)` | `var(--danger)` | — |
| `recording` | `rgba(255, 107, 107, 0.12)` | `var(--danger)` | Pulse animation |
| `active` | `rgba(245, 159, 74, 0.15)` | `var(--accent)` | — |

### Badge

Positioned `absolute` top-right. Shows count or indicator.

---

## 3. Card

**Wraps:** Native `<div>` with glass morphism
**Radix:** None

### Props

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'glass-strong' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;          // Enable hover elevation
  header?: React.ReactNode; // Optional card header
  footer?: React.ReactNode; // Optional card footer
}
```

### Subcomponents

```tsx
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

---

## 4. GlassPanel

**Wraps:** `<div>` with backdrop-filter styling
**Radix:** None

Encapsulates the repeated glass morphism pattern:

```css
background: linear-gradient(135deg, rgba(var(--panel-rgb), 0.6), rgba(var(--panel-rgb), 0.4));
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.08);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
```

### Props

```tsx
interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: 'subtle' | 'medium' | 'strong';  // blur + opacity
  rounded?: 'sm' | 'md' | 'lg' | 'xl';
}
```

---

## 5. Popover

**Wraps:** `@radix-ui/react-popover`
**Replaces:** Session navigator panel, any future dropdowns

### Props

```tsx
interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  collisionPadding?: number;  // Viewport edge padding
  modal?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
```

### Key Behavior (provided by Radix)

- **Viewport-aware positioning**: Automatically flips/shifts to stay in viewport
- **Focus trapping**: Traps focus inside when `modal=true`
- **Dismiss**: Click outside or Escape to close
- **ARIA**: `aria-expanded`, `aria-controls`, focus return

### Styling

Uses our glass morphism tokens. Animation: `snPanelIn` keyframe (slide + fade).

---

## 6. Dialog

**Wraps:** `@radix-ui/react-dialog`
**Replaces:** Channel wizard, onboarding wizard, progress modal, cron form modal, keyboard shortcuts modal, automation form

### Props

```tsx
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
}
```

### Sizes

| Size | Width | Use Case |
|------|-------|----------|
| `sm` | `400px` | Simple confirms |
| `md` | `560px` | Forms, single-step |
| `lg` | `720px` | Multi-pane (channel wizard) |
| `xl` | `900px` | Complex layouts |
| `full` | `calc(100vw - 64px)` | Onboarding, simulator |

### Subcomponents

```tsx
<Dialog open={open} onOpenChange={setOpen} title="Create Cron Job">
  <Dialog.Body>
    {/* Form content */}
  </Dialog.Body>
  <Dialog.Footer>
    <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
    <Button variant="primary" onClick={handleSubmit}>Create</Button>
  </Dialog.Footer>
</Dialog>
```

### Behavior

- Backdrop: `rgba(0, 0, 0, 0.5)` with blur
- Focus trapped inside
- Escape closes (unless `onOpenChange` prevents it)
- Scroll lock on body
- Entrance animation: scale + fade

---

## 7. AlertDialog

**Wraps:** `@radix-ui/react-alert-dialog`
**Replaces:** `showConfirmDialog()`, `showDangerConfirmDialog()`

### API

```tsx
interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;         // Default: "Confirm"
  cancelLabel?: string;          // Default: "Cancel"
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}
```

The `danger` variant styles the confirm button with `var(--danger)` and adds a warning icon.

---

## 8. Toast

**Wraps:** `@radix-ui/react-toast`
**Replaces:** Current `toast` singleton

### API (imperative)

```tsx
// Singleton API (unchanged from current)
toast('Message');
toast.success('Saved successfully');
toast.error('Failed to save');
toast.warning('Rate limited');
toast.info('New version available');
toast.promise(asyncFn, {
  loading: 'Saving...',
  success: 'Saved!',
  error: 'Failed to save',
});
```

### Implementation

Provider wraps the app:

```tsx
<ToastProvider>
  <App />
</ToastProvider>
```

Imperative calls go through a shared ref. Radix handles stacking, auto-dismiss, swipe-to-dismiss, and accessibility announcements.

### Styling

- Position: bottom-right (viewport fixed)
- Glass morphism background with colored left border
- Auto-dismiss: 5s (configurable)
- Stacking: offset + scale for multiple toasts

---

## 9. Tooltip

**Wraps:** `@radix-ui/react-tooltip`
**Replaces:** All `title=""` attributes and `[data-tooltip]` CSS tooltips

### Props

```tsx
interface TooltipProps {
  content: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;  // Default: 300ms
  disabled?: boolean;
}
```

### Usage

```tsx
<Tooltip content="Refresh chat history">
  <IconButton icon={<RefreshCw />} onClick={refresh} />
</Tooltip>
```

### Provider

A single `<TooltipProvider delayDuration={300}>` wraps the app. All `<Tooltip>` instances share the delay group (hovering between tooltips shows instantly).

---

## 10. Select

**Wraps:** `@radix-ui/react-select`
**Replaces:** Voice select, form selects, filter dropdowns

### Props

```tsx
interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  triggerClassName?: string;
}
```

### Styling

Trigger: pill-shaped (matching `.voice-select__trigger` and `.sn-trigger` patterns).
Dropdown: glass morphism panel, positioned by Radix (viewport-aware).

---

## 11. Tabs

**Wraps:** `@radix-ui/react-tabs`
**Replaces:** Navigation tabs, config form/raw toggle, sessions view mode switcher

### Props

```tsx
interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{
    value: string;
    label: string;
    icon?: React.ReactNode;
    badge?: string | number;
    disabled?: boolean;
  }>;
  variant?: 'default' | 'pill' | 'underline';
  size?: 'sm' | 'md';
  orientation?: 'horizontal' | 'vertical';
}
```

### Variants

| Variant | Style | Use Case |
|---------|-------|----------|
| `default` | Bordered tabs with active accent | Navigation sidebar |
| `pill` | Rounded pill with active fill | View mode switcher |
| `underline` | Bottom border accent | Config form/raw tabs |

---

## 12. Collapsible

**Wraps:** `@radix-ui/react-collapsible`
**Replaces:** Nav group collapse, session group expand, tool card expand, task sidebar sections

### Props

```tsx
interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  animated?: boolean;  // Smooth height transition
}
```

---

## 13. ScrollArea

**Wraps:** `@radix-ui/react-scroll-area`
**Replaces:** Custom scrollbar styling on chat thread, logs output, session navigator

### Props

```tsx
interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  orientation?: 'vertical' | 'horizontal' | 'both';
  scrollbarSize?: number;  // Default: 8px
  onScroll?: (e: React.UIEvent) => void;
  ref?: React.RefObject<HTMLDivElement>;  // For scroll position control
}
```

### Styling

Scrollbar thumb: `rgba(255, 255, 255, 0.1)` with hover to `0.2`. Matches existing custom scrollbar styles.

---

## 14. Input

**Wraps:** Native `<input>` + `<textarea>`
**Radix:** None

### Props

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;        // Leading icon
  iconRight?: React.ReactNode;   // Trailing icon/action
  variant?: 'default' | 'ghost'; // Ghost = no border until focus
  size?: 'sm' | 'md';
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  autoResize?: boolean;  // Grow with content
  size?: 'sm' | 'md';
}
```

---

## 15. Checkbox

**Wraps:** `@radix-ui/react-checkbox`

### Props

```tsx
interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  indeterminate?: boolean;
}
```

---

## 16. Switch

**Wraps:** `@radix-ui/react-switch`

### Props

```tsx
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}
```

---

## 17. RadioGroup

**Wraps:** `@radix-ui/react-radio-group`

### Props

```tsx
interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>;
  orientation?: 'horizontal' | 'vertical';
}
```

---

## 18. Slider

**Wraps:** `@radix-ui/react-slider`
**Replaces:** Config sliders, split ratio control

### Props

```tsx
interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  showValue?: boolean;
}
```

---

## 19. Progress

**Wraps:** `@radix-ui/react-progress`
**Replaces:** Automation progress bar, compaction indicator

### Props

```tsx
interface ProgressProps {
  value: number;          // 0-100
  max?: number;           // Default: 100
  variant?: 'default' | 'accent' | 'success' | 'danger';
  size?: 'sm' | 'md';
  label?: string;
  showValue?: boolean;
  animated?: boolean;     // Pulse animation during active progress
}
```

---

## 20. Avatar

**Wraps:** `@radix-ui/react-avatar`
**Replaces:** Chat avatars, agent avatars, session navigator avatars

### Props

```tsx
interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback: string;       // Text fallback (initials or emoji)
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'circle' | 'rounded';
  role?: 'user' | 'assistant' | 'tool' | 'system'; // Color scheme
}
```

### Sizes

| Size | Dimensions | Font |
|------|-----------|------|
| `xs` | `24px` | `10px` |
| `sm` | `28px` | `12px` |
| `md` | `32px` | `14px` |
| `lg` | `40px` | `16px` |

### Role Colors

| Role | Gradient |
|------|---------|
| `user` | `var(--accent)` → warm orange |
| `assistant` | `var(--accent-2)` → teal |
| `tool` | `var(--info)` → blue |
| `system` | `var(--muted)` → gray |

---

## 21. Badge

**Replaces:** `.badge`, `.pill`, `.sn-badge`, status indicators

### Props

```tsx
interface BadgeProps {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}
```

---

## 22. StatusDot

**Replaces:** `.sn-status-dot`, `.statusDot`

### Props

```tsx
interface StatusDotProps {
  status: 'active' | 'idle' | 'historical' | 'error' | 'connecting';
  size?: 'sm' | 'md';
  pulse?: boolean;  // Animated pulse for active
}
```

---

## 23. SearchInput

**Replaces:** Session navigator search, logs search, sessions search, config search, command palette input

### Props

```tsx
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;       // Clear button handler
  onEscape?: () => void;      // Escape key handler
  autoFocus?: boolean;
  size?: 'sm' | 'md';
  debounceMs?: number;        // Debounce onChange (default: 0)
  icon?: React.ReactNode;     // Override search icon
}
```

---

## 24. SplitPane

**Replaces:** `<clawdbrain-resizable-divider>`, `.chat-split-container`

### Props

```tsx
interface SplitPaneProps {
  children: [React.ReactNode, React.ReactNode]; // Exactly 2 children
  ratio: number;                    // 0-1, default 0.5
  onRatioChange: (ratio: number) => void;
  direction?: 'horizontal' | 'vertical';
  minRatio?: number;                // Default: 0.2
  maxRatio?: number;                // Default: 0.8
  collapsible?: boolean;           // Allow collapsing secondary pane
}
```

---

## 25. Separator

**Wraps:** `@radix-ui/react-separator`

### Props

```tsx
interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}
```

---

## 26. Skeleton

**Replaces:** `.skeleton`, `.chat-skeleton`

### Props

```tsx
interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
  lines?: number;         // For text variant: render N lines
  animated?: boolean;     // Shimmer animation (default: true)
}
```

---

## 27. EmptyState

**Replaces:** `.sn-empty` and various inline "No data" messages

### Props

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;  // e.g., <Button>Create first item</Button>
}
```

---

## 28. StatCard

**Replaces:** `.stat`, `.stat-label`, `.stat-value`

### Props

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  status?: 'ok' | 'warn' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  subtitle?: string;
}
```

---

## 29. CodeBlock

**Replaces:** `.code-block` pattern in chat messages

### Props

```tsx
interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  showCopyButton?: boolean;  // Default: true
  maxHeight?: string;
  filename?: string;         // Display filename in header
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}
```

---

## 30. Markdown

**Replaces:** `toSanitizedMarkdownHtml()` + `unsafeHTML` rendering

### Props

```tsx
interface MarkdownProps {
  content: string;
  className?: string;
  components?: Record<string, React.ComponentType>;  // Override renderers
}
```

### Implementation

Use `react-markdown` with `remark-gfm` (GitHub Flavored Markdown) and `rehype-highlight` (syntax highlighting). Custom component overrides for `<code>` blocks render our `<CodeBlock>` component.

---

## 31. SaveButton

**Replaces:** `renderSaveButton()` state machine

### Props

```tsx
interface SaveButtonProps {
  onClick: () => void | Promise<void>;
  dirty?: boolean;          // Show unsaved indicator
  loading?: boolean;
  saved?: boolean;          // Briefly show check mark
  error?: string | null;    // Show error state
  label?: string;           // Default: "Save"
  savingLabel?: string;     // Default: "Saving..."
  savedLabel?: string;      // Default: "Saved"
  disabled?: boolean;
}
```

### State Machine

```
idle → (click) → saving → saved → (2s) → idle
                        → error → (3s) → idle
```

`saved` and `error` states auto-reset after a timeout.

---

## Design Token Reference

All primitives use these CSS custom properties (from `design-system.css`):

```css
/* Colors */
--accent: #f59f4a;
--accent-muted: rgba(245, 159, 74, 0.12);
--accent-2: #34c7b7;
--ok: #2bd97f;
--warn: #f2c94c;
--danger: #ff6b6b;
--info: #60a5fa;

/* Surfaces */
--bg, --panel, --panel-strong, --panel-rgb
--surface-1, --surface-2, --surface-3
--border, --border-strong

/* Text */
--text, --text-strong, --text-secondary, --text-tertiary, --muted

/* Spacing (via Tailwind or direct) */
/* Use Tailwind utilities: gap-*, p-*, m-* */

/* Radius */
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;

/* Shadows */
--shadow-sm, --shadow-md, --shadow-lg, --shadow-xl

/* Transitions */
--duration-fast: 150ms;
--duration-normal: 250ms;
--ease-out: cubic-bezier(0.33, 1, 0.68, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## Testing Checklist (Per Primitive)

Every primitive must have:

- [ ] **Unit test**: Renders correctly with default props
- [ ] **Variant test**: Each variant renders correct classes/styles
- [ ] **Disabled test**: Disabled state prevents interaction
- [ ] **Keyboard test**: Keyboard navigation works (where applicable)
- [ ] **Dark/Light test**: Both themes render correctly
- [ ] **Responsive test**: Works at 320px, 640px, 1024px viewports
- [ ] **a11y test**: `axe-core` audit passes (no violations)
