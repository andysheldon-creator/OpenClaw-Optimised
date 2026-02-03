# Power User Mode - Second Brain Platform

## Overview

Power User Mode is an opt-in feature that unlocks advanced capabilities for technical users while keeping the default experience clean and approachable.

### Philosophy

1. **Progressive enhancement** - Everything works without it; it just adds more
2. **Non-destructive** - Turning it off doesn't lose any data
3. **Clearly marked** - Advanced features are visually distinct
4. **Graceful degradation** - If something breaks, the core experience remains

---

## Activation

### Toggle Location

Settings → Advanced → Enable Advanced Features

```tsx
<Card className="border-warning/20 bg-warning/5">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Zap className="h-5 w-5 text-warning" />
      Power User Mode
    </CardTitle>
    <CardDescription>Unlock advanced features for technical users</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">
          Enables: Debug console, raw config editing, filesystem browser, cron expressions, and
          more.
        </p>
      </div>
      <Switch checked={powerUserMode} onCheckedChange={setPowerUserMode} />
    </div>
  </CardContent>
</Card>
```

### Keyboard Shortcut

`Cmd+Shift+P` (or `Ctrl+Shift+P`) - Quick toggle with confirmation

### Persistence

- Stored in user preferences (persisted to cloud)
- Applied on login
- Per-user, not per-device

### Visual Indicator

When enabled, show a subtle indicator:

```tsx
// In the topbar or sidebar footer
{
  powerUserMode && (
    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
      <Zap className="h-3 w-3 mr-1" />
      Power
    </Badge>
  );
}
```

---

## Features Unlocked

### 1. Navigation Additions

New sidebar section appears:

```
ADVANCED
├── 📊 Debug
├── 📁 Filesystem
├── ⏰ Jobs
└── 💻 Nodes
```

### 2. Debug View (`/debug`)

Full debugging toolkit for technical troubleshooting.

#### Health Tab

- System status (gateway connection, memory, CPU)
- Agent process status (PID, memory per agent)
- Channel status (message counts, error counts)
- WebSocket connection info

#### RPC Tab

- Method selector dropdown (all available RPC methods)
- JSON parameter editor (Monaco or CodeMirror)
- Execute button
- Result viewer (formatted JSON)
- Request/response timing

#### Events Tab

- Real-time event stream from gateway
- Filter by event type
- Pause/resume stream
- Export events

#### Logs Tab

- Raw log viewer (virtualized for performance)
- Filter by level (trace, debug, info, warn, error, fatal)
- Search within logs
- Tail mode (auto-scroll)
- Export logs

### 3. Filesystem View (`/filesystem`)

Browse and edit files in the agent's data directory.

#### Features

- Tree navigation of `~/.clawdbrain/` directory
- File preview (markdown, YAML, JSON)
- Inline editing with syntax highlighting
- Create/rename/delete files
- File history (if git-tracked)

#### Security

- Sandboxed to agent data directory
- No system file access
- Confirmation for deletions

### 4. Jobs View (`/jobs`)

Full cron job management (technical layer behind Rituals).

#### Features

- Cron expression input (with helper)
- Next N run times preview
- Job history with output
- Enable/disable toggle
- Error tracking per job

#### Cron Helper

```tsx
<CronHelper
  value={cronExpression}
  onChange={setCronExpression}
>
  <div className="grid grid-cols-5 gap-2 mb-4">
    <div>
      <label className="text-xs">Minute</label>
      <Input value={minute} onChange={...} />
    </div>
    <div>
      <label className="text-xs">Hour</label>
      <Input value={hour} onChange={...} />
    </div>
    {/* ... */}
  </div>
  <p className="text-sm text-muted-foreground">
    Runs: {humanReadableSchedule}
  </p>
  <p className="text-xs text-muted-foreground">
    Next 5 runs: {nextRuns.join(", ")}
  </p>
</CronHelper>
```

### 5. Nodes View (`/nodes`)

Device pairing and remote execution management.

#### Features

- List of paired devices with status
- Pair new device (QR code or manual token)
- Device capabilities configuration
- Command allowlists
- Last seen timestamps
- Unpair with confirmation

### 6. Raw Config Editing

Everywhere there's a visual editor, add a "Raw" tab:

#### Agent Soul Editor

```
[Visual Editor] [Raw Markdown]
```

Clicking "Raw" shows:

```tsx
<MonacoEditor
  language="markdown"
  value={soulMd}
  onChange={setSoulMd}
  theme={theme === "dark" ? "vs-dark" : "light"}
/>
```

#### Agent Tools Editor

```
[Visual Checklist] [Raw YAML]
```

#### Settings

```
[Form View] [Raw JSON]
```

### 7. Enhanced Chat Features

#### Tool Call Inspector

- Default: Collapsed with summary
- Power mode: Expandable with full input/output JSON
- Copy buttons for inputs and outputs
- Timing information

#### Session Management

- View session ID
- Force end session
- Export session history (JSON)
- Clear session memory

### 8. Workstream Enhancements

#### Task Details

- View task metadata (IDs, timestamps)
- Manual status override
- Dependency graph raw data
- Task history log

#### Bulk Operations

- Select multiple tasks
- Bulk status change
- Bulk reassign
- Export workstream as JSON

### 9. Memory Enhancements

#### Memory Details

- View memory metadata (source, timestamp, type)
- Edit memory content directly
- View memory embedding (vector preview)
- Memory usage statistics

#### Memory Import/Export

- Export all memories as JSON
- Import memories from file
- Bulk edit with validation

---

## UI Differences

### Standard vs Power User Comparison

| Feature      | Standard                  | Power User                   |
| ------------ | ------------------------- | ---------------------------- |
| Scheduling   | "Every day at 9am" picker | + Cron expression field      |
| Soul Editor  | Personality sliders       | + Raw markdown tab           |
| Tools Config | Toggle checkboxes         | + YAML editor                |
| Chat Tools   | Collapsed summary         | + Full JSON expand           |
| Navigation   | 4 sections                | + Advanced section (4 items) |
| Status       | Simple badges             | + Detailed metrics           |
| Settings     | Form only                 | + Raw JSON tab               |

### Visual Distinctions

Power user elements use subtle visual cues:

```tsx
// Power user only elements get a subtle badge
<div className="flex items-center gap-2">
  <label>Cron Expression</label>
  <Badge variant="outline" className="text-xs bg-secondary">
    Advanced
  </Badge>
</div>
```

### Tooltips

Power user features include explanatory tooltips:

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Terminal className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Open RPC Console</p>
      <p className="text-xs text-muted-foreground">Execute manual gateway commands (Power User)</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Implementation Pattern

### Conditional Rendering

```tsx
const { isPowerUser } = useUserPreferences();

return (
  <Tabs defaultValue="visual">
    <TabsList>
      <TabsTrigger value="visual">Visual Editor</TabsTrigger>
      {isPowerUser && (
        <TabsTrigger value="raw">Raw Markdown</TabsTrigger>
      )}
    </TabsList>
    <TabsContent value="visual">
      <SoulVisualEditor ... />
    </TabsContent>
    {isPowerUser && (
      <TabsContent value="raw">
        <SoulRawEditor ... />
      </TabsContent>
    )}
  </Tabs>
);
```

### Navigation Gating

```tsx
// In router configuration
const routes = [
  // Standard routes...
  ...(isPowerUser
    ? [
        { path: "/debug", element: <DebugView /> },
        { path: "/filesystem", element: <FilesystemView /> },
        { path: "/jobs", element: <JobsView /> },
        { path: "/nodes", element: <NodesView /> },
      ]
    : []),
];
```

### Feature Detection

```tsx
// Hook for checking power user features
function usePowerFeature(feature: PowerFeature): boolean {
  const { isPowerUser, enabledFeatures } = useUserPreferences();

  if (!isPowerUser) return false;

  // Could allow granular feature control in future
  return enabledFeatures.includes(feature) ?? true;
}

// Usage
const showCronEditor = usePowerFeature("cronExpressions");
```

---

## Onboarding

### First Enable

When a user first enables Power User Mode:

```tsx
<Dialog open={showPowerModeIntro}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Welcome to Power User Mode</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <p>You now have access to advanced features:</p>
      <ul className="list-disc list-inside space-y-2 text-sm">
        <li>Debug console for troubleshooting</li>
        <li>Raw config editing (Markdown, YAML, JSON)</li>
        <li>Filesystem browser for agent data</li>
        <li>Full cron expression support</li>
        <li>Device/node management</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        You can disable these features anytime in Settings → Advanced.
      </p>
    </div>
    <DialogFooter>
      <Button onClick={() => setShowPowerModeIntro(false)}>Got it</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Feature Discovery

Show tooltips for new features on first view:

```tsx
<OnboardingTooltip
  id="debug-view"
  title="Debug Console"
  description="Use this to inspect gateway state, make RPC calls, and view logs."
  showOnce
>
  <DebugView />
</OnboardingTooltip>
```

---

## Safety & Guardrails

### Dangerous Actions

Actions that could break things require confirmation:

```tsx
// Raw config editing shows warning
<Alert variant="warning" className="mb-4">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>Editing Raw Configuration</AlertTitle>
  <AlertDescription>
    Invalid configuration may prevent your agents from working. Changes are validated before saving.
  </AlertDescription>
</Alert>
```

### Validation

All raw input is validated before saving:

```tsx
// Validate YAML/JSON before saving
const handleSave = async (raw: string) => {
  try {
    const parsed = yaml.parse(raw);
    const validation = schema.safeParse(parsed);

    if (!validation.success) {
      toast.error("Invalid configuration", {
        description: validation.error.issues[0].message,
      });
      return;
    }

    await save(parsed);
    toast.success("Configuration saved");
  } catch (e) {
    toast.error("Invalid YAML syntax");
  }
};
```

### Recovery

If something breaks:

1. Show clear error message
2. Offer to restore defaults
3. Support team can reset remotely
4. Export current state for debugging

---

## Future Enhancements

### Granular Controls

Allow users to enable specific power features:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Power Features</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <label>Debug Console</label>
      <Switch checked={features.debug} ... />
    </div>
    <div className="flex items-center justify-between">
      <label>Raw Config Editing</label>
      <Switch checked={features.rawConfig} ... />
    </div>
    <div className="flex items-center justify-between">
      <label>Filesystem Browser</label>
      <Switch checked={features.filesystem} ... />
    </div>
    <div className="flex items-center justify-between">
      <label>Cron Expressions</label>
      <Switch checked={features.cron} ... />
    </div>
  </CardContent>
</Card>
```

### Custom Layouts

Power users can customize their workspace layout:

- Drag and drop panels
- Save layout presets
- Quick layout switching

### Scripting/Automation

Future consideration:

- Custom webhooks
- Workflow automation
- Script editor for advanced users
