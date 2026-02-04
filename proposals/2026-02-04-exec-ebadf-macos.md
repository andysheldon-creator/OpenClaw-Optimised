# Proposal: Fix exec Tool "spawn EBADF" Error on macOS

**GitHub Issue:** #8938 (labeled: bug)
**Priority:** HIGH
**Date:** 2026-02-04

## Problem

The exec tool fails with "spawn EBADF" (Bad File Descriptor) error on macOS. This is a critical bug that breaks core functionality - users cannot execute shell commands.

Error: `exec tool fails with "spawn EBADF" error on macOS`

## Why It Occurs

EBADF errors in Node.js child process spawning typically occur due to:

1. **File descriptor exhaustion** - Too many open FDs from previous tool calls not being cleaned up
2. **PTY handling issues** - macOS handles pseudo-terminals differently than Linux
3. **Stdio inheritance bugs** - When stdio options are misconfigured, especially with 'inherit' or custom FDs
4. **Race conditions** - FD cleanup happening after spawn attempt

Common culprits:

- `child_process.spawn()` with invalid stdio array
- Orphaned PTY sessions not properly closed
- FD leaks from browser or long-running subprocesses

## Technical Solution

### 1. Explicit Stdio Configuration

```typescript
// Before (problematic)
spawn(cmd, args, { stdio: "inherit" });

// After (explicit)
spawn(cmd, args, {
  stdio: ["pipe", "pipe", "pipe"],
  detached: false,
  windowsHide: true,
});
```

### 2. FD Cleanup Before Spawn

```typescript
async function safeSpawn(cmd: string, args: string[], opts: SpawnOptions) {
  // Force garbage collection of any leaked FDs
  if (global.gc) global.gc();

  // Close any orphaned PTY sessions
  await cleanupOrphanedPtys();

  return spawn(cmd, args, opts);
}
```

### 3. Retry with Fallback

```typescript
try {
  return spawn(cmd, args, opts);
} catch (e) {
  if (e.code === "EBADF") {
    // Retry with simpler stdio
    return spawn(cmd, args, { ...opts, stdio: "pipe" });
  }
  throw e;
}
```

### 4. macOS-Specific PTY Handling

```typescript
const ismacos = process.platform === "darwin";
const ptyOpts = ismacos ? { name: "xterm-256color", cols: 80, rows: 24 } : defaultPtyOpts;
```

## Impact

- **Critical Fix:** Restores core exec functionality on macOS
- **User Base:** Affects all macOS users (significant portion of OpenClaw users)
- **Reliability:** Prevents cascading failures from FD exhaustion

## Implementation Estimate

- **Effort:** 1-2 days
- **Risk:** Medium (modifying core exec path)
- **Files:** `packages/core/src/tools/exec.ts`, `packages/core/src/pty/*.ts`
- **Testing:** Requires macOS test environment
