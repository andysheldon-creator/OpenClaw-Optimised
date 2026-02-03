# Interactions & Feedback - Second Brain Platform

## Philosophy

Every interaction should feel **immediate, responsive, and informative**. Users should never wonder "did that work?" or "what's happening?"

### Core Principles

1. **Acknowledge immediately** - Show something within 100ms of user action
2. **Progress over loading** - Show progress bars, not spinners when possible
3. **Graceful degradation** - Always have a fallback for slow/failed states
4. **Microinteractions matter** - Small delights make the product feel polished
5. **Respect motion preferences** - Honor `prefers-reduced-motion`

---

## Feedback Patterns

### Immediate Feedback (< 100ms)

For any user action, provide instant visual feedback:

| Action           | Feedback                                |
| ---------------- | --------------------------------------- |
| Button click     | Subtle press state (scale, color shift) |
| Checkbox toggle  | Immediate check animation               |
| Form input focus | Border color change, subtle glow        |
| Hover            | Background color shift, shadow change   |
| Link hover       | Underline, color change                 |
| Drag start       | Element lifts, cursor changes           |

### Loading States

#### Skeleton Loading

Use for content that's being fetched:

```tsx
// Replace content with skeletons during load
<Card>
  {loading ? (
    <>
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2" />
    </>
  ) : (
    <CardContent>{data}</CardContent>
  )}
</Card>
```

**Rules:**

- Match skeleton shape to final content shape
- Use subtle pulse animation
- Show within 200ms of navigation

#### Progress Indicators

Use for operations with known duration or progress:

```tsx
// Workstream progress
<Progress value={progress} className="h-2" />

// Upload progress
<Progress value={uploadPercent} className="h-1" />
```

#### Spinners

Use sparingly, only for short operations (< 2s):

```tsx
// Button loading state
<Button disabled={loading}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Save Changes
</Button>
```

### Optimistic Updates

Update UI immediately, then sync with server:

```tsx
// Example: Toggle agent status
const toggleAgent = async (id: string) => {
  // Optimistically update
  setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));

  try {
    await api.toggleAgent(id);
  } catch {
    // Revert on failure
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    toast.error("Failed to update agent");
  }
};
```

---

## Toast Notifications

Using Sonner for toast notifications.

### Toast Types

| Type    | When to Use                 | Duration                  |
| ------- | --------------------------- | ------------------------- |
| Success | Action completed            | 3s                        |
| Error   | Action failed               | 5s (with action to retry) |
| Warning | Potential issue             | 5s                        |
| Info    | FYI notification            | 4s                        |
| Loading | Async operation in progress | Until complete            |

### Toast Patterns

```tsx
// Success
toast.success("Agent created successfully");

// Error with action
toast.error("Failed to save", {
  action: {
    label: "Retry",
    onClick: () => handleSave(),
  },
});

// Loading → Success
const saveConfig = async () => {
  toast.loading("Saving configuration...");
  try {
    await api.save(config);
    toast.success("Configuration saved");
  } catch {
    toast.error("Failed to save configuration");
  }
};

// Rich content
toast("Workstream completed", {
  description: "Q1 Launch Prep has been marked as complete.",
  action: {
    label: "View",
    onClick: () => navigate("/workstreams/..."),
  },
});
```

### Toast Positioning

- Default: Bottom right
- Mobile: Bottom center, full width
- Never cover important content

---

## Modal & Dialog Interactions

### Opening

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
>
  <DialogContent>...</DialogContent>
</motion.div>
```

### Closing

- Click outside to close (unless destructive action pending)
- Escape key to close
- Explicit close button
- Animate out (fade + scale down)

### Focus Management

1. Focus first interactive element on open
2. Trap focus within modal
3. Restore focus to trigger on close

---

## Slide-in Panels (Sheets)

### Opening Animation

```tsx
// Right side panel
<motion.div
  initial={{ x: "100%" }}
  animate={{ x: 0 }}
  exit={{ x: "100%" }}
  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
>
  <SheetContent>...</SheetContent>
</motion.div>
```

### Behavior

- Overlay dims background (click to close)
- Content behind remains visible but non-interactive
- Panel width based on content (sm: 320px, md: 400px, lg: 480px)
- On mobile: Full screen with swipe-to-close

---

## Drag & Drop

### Drag Start

```tsx
<motion.div
  whileDrag={{
    scale: 1.02,
    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  }}
>
  <DraggableItem />
</motion.div>
```

### Drop Zones

- Highlight valid drop targets on drag start
- Show insertion point for lists
- Animate items shifting to make room

### Drop Feedback

- Item animates into place
- Toast confirms action if significant
- Undo available for 5 seconds

---

## Form Interactions

### Input Focus

```css
.input:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### Validation Feedback

```tsx
// Inline validation as user types (debounced)
<Input className={cn(error && "border-error focus-visible:ring-error")} />;
{
  error && <p className="text-sm text-error mt-1 animate-slide-in-bottom">{error}</p>;
}
```

### Form Submission

1. Disable submit button during submission
2. Show loading indicator in button
3. On success: toast + navigate or update
4. On error: shake animation + inline errors + toast

```tsx
// Shake animation for form errors
<motion.form
  animate={hasError ? { x: [-10, 10, -10, 10, 0] } : {}}
  transition={{ duration: 0.4 }}
>
```

---

## Chat-Specific Interactions

### Message Sending

1. Message appears immediately in thread (optimistic)
2. Input clears
3. Subtle pulse on sent message until confirmed
4. Scroll to bottom

### Streaming Response

```tsx
<ChatBubbleMessage>
  {streamingContent}
  <motion.span
    animate={{ opacity: [1, 0] }}
    transition={{ duration: 0.5, repeat: Infinity }}
    className="inline-block w-2 h-4 bg-foreground ml-1"
  />
</ChatBubbleMessage>
```

### Tool Calls

```tsx
// Expand/collapse animation
<Collapsible>
  <CollapsibleTrigger asChild>
    <ToolCallCard onClick={() => setExpanded(!expanded)} />
  </CollapsibleTrigger>
  <CollapsibleContent asChild>
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
    >
      <ToolCallDetails />
    </motion.div>
  </CollapsibleContent>
</Collapsible>
```

### Abort Streaming

- Stop button visible during streaming
- Click immediately stops visual streaming
- Message marked as incomplete
- Clear feedback that response was stopped

---

## Navigation Transitions

### Page Transitions

Keep it subtle - don't slow down navigation:

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={pathname}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.15 }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

### Tab Switching

```tsx
<TabsContent asChild value={tab}>
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
    {content}
  </motion.div>
</TabsContent>
```

---

## Status Indicators

### Connection Status

```tsx
// Pulsing dot for active connection
<span className="relative flex h-3 w-3">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
  <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
</span>
```

### Agent Status

| Status           | Visual            |
| ---------------- | ----------------- |
| Active (working) | Pulsing green dot |
| Ready (idle)     | Solid green dot   |
| Paused           | Yellow dot        |
| Error            | Red dot           |
| Offline          | Gray dot          |

### Workstream Progress

```tsx
<div className="relative">
  <Progress value={progress} className="h-2" />
  {/* Animated shimmer on progress bar when actively working */}
  {isActive && (
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
      animate={{ x: ["-100%", "100%"] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  )}
</div>
```

---

## Error States

### Inline Errors

```tsx
<div className="flex items-center gap-2 text-error text-sm">
  <AlertCircle className="h-4 w-4" />
  <span>{errorMessage}</span>
</div>
```

### Full Page Errors

```tsx
<div className="flex flex-col items-center justify-center h-[400px] text-center">
  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
  <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
  <p className="text-muted-foreground mb-4">{errorMessage}</p>
  <Button onClick={retry}>Try Again</Button>
</div>
```

### Recovery Actions

Always provide a way forward:

- Retry button for network errors
- Help link for persistent issues
- Clear error state on next attempt

---

## Keyboard Shortcuts

### Global

| Shortcut      | Action                  |
| ------------- | ----------------------- |
| `Cmd+K`       | Open command palette    |
| `Cmd+N`       | New conversation        |
| `Cmd+\`       | Toggle sidebar          |
| `Cmd+Shift+D` | Toggle dark mode        |
| `?`           | Show keyboard shortcuts |

### Chat

| Shortcut      | Action                  |
| ------------- | ----------------------- |
| `Cmd+Enter`   | Send message            |
| `Escape`      | Stop streaming / cancel |
| `Cmd+Shift+T` | Toggle task panel       |
| `/`           | Focus input             |

### Navigation

| Shortcut | Action         |
| -------- | -------------- |
| `Cmd+1`  | Go to Home     |
| `Cmd+2`  | Go to Chat     |
| `Cmd+3`  | Go to Agents   |
| `Cmd+,`  | Go to Settings |

### Showing Shortcuts

Display keyboard shortcut hints in:

- Tooltips on hover
- Command palette results
- Button hover states (for power actions)

---

## Reduced Motion

For users with `prefers-reduced-motion: reduce`:

```tsx
const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

// Use instant transitions
<motion.div
  animate={{ opacity: 1 }}
  transition={{
    duration: prefersReducedMotion ? 0 : 0.2,
  }}
/>;
```

**What to reduce:**

- Page transitions → instant
- Micro-animations → instant or static
- Loading spinners → static progress indicator
- Pulse animations → solid states

**What to keep:**

- Essential progress indicators
- State change feedback (just instant)
- Focus indicators
