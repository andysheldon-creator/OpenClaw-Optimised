# Proposed Core Changes: Programmatic Cron for Plugins

**Status:** Proposal
**Target:** Core `clawdbrain` runtime

## Problem

Currently, plugins cannot programmatically register cron jobs. They must rely on users manually running `clawdbrain cron add` or exposing a CLI command that the user schedules. This creates friction for "autonomous" maintenance tasks like the `memory-lancedb` Daily Gardener.

## Proposed Solution

Expose a `registerCron` method on the `ClawdbrainPluginApi`.

### 1. Update Plugin SDK (`src/plugin-sdk/types.ts`)

Add the following interface to `ClawdbrainPluginApi`:

```typescript
export type PluginCronJob = {
  id: string; // Plugin-scoped ID (e.g. "memory-maintenance")
  schedule: string; // Cron expression
  handler: () => Promise<void>; // The function to run
  description?: string;
};

export interface ClawdbrainPluginApi {
  // ... existing members
  registerCron(job: PluginCronJob): void;
}
```

### 2. Update Gateway Implementation (`src/gateway/server.impl.ts`)

When constructing the `api` object for a plugin:

```typescript
// In buildPluginApi(...)
registerCron: (jobParams) => {
  const jobId = `${plugin.id}:${jobParams.id}`; // Namespaced ID

  // 1. Check if job exists in CronService
  // 2. If not, add it using cronService.add()
  // 3. If it exists but schedule changed, update it.
  // 4. Map the execution to a virtual handler that calls the plugin's function.

  // CHALLENGE: Cron jobs persist across restarts, but plugin handlers are memory-bound.
  // We need a way to bind a persistent cron job to a runtime plugin function.

  // PROPOSED MECHANISM:
  // - The cron job payload should be `kind: "systemEvent"` or a special `kind: "pluginInvoke"`.
  // - When the cron fires, it emits an event or calls a hook that the plugin is listening to.
  // - OR, we keep it simple: `registerCron` just ensures a "wake" job exists that triggers an event the plugin watches.
},
```

### Alternative: Event-Based Architecture

Instead of `registerCron` taking a function, it takes an event name.

```typescript
api.registerCron({
  id: "daily-maintenance",
  schedule: "0 4 * * *",
  payload: { kind: "systemEvent", text: "plugin:memory-lancedb:maintenance" },
});

// Plugin listens for this event
api.on("system_event", (evt) => {
  if (evt.text === "plugin:memory-lancedb:maintenance") {
    digestService.run();
  }
});
```

This leverages existing `systemEvent` infrastructure without needing new "Plugin Handler" types in the cron store.

## Recommendation for `memory-lancedb`

Until this core change lands, `memory-lancedb` exposes `ltm maintain` as a CLI command. Users should schedule it via:

```bash
clawdbrain cron add --name "Memory Maintenance" --cron "0 4 * * *" --session isolated --message "/ltm maintain"
```

(Note: This requires the agent to have permission to run `ltm maintain`, or we implement `systemEvent` listening as described above).
