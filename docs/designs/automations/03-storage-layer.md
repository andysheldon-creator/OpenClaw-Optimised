# Storage Layer Design

**Component:** Automation Storage System
**Status:** Design Phase
**Author:** AI Design Session
**Date:** 2025-01-26

## Overview

The Storage Layer handles all persistence needs for the automation system. It manages configuration files, run logs, workspace directories, and state tracking. This layer extends Clawdbrain's existing file-based storage patterns (`/src/config/io.ts`) while introducing automation-specific storage locations and formats.

## Directory Structure

```
~/.clawdbrain/
├── automations/
│   ├── config/                    # Automation configuration files
│   │   ├── dispatcher.json        # Dispatcher configuration
│   │   ├── smart-sync-fork/       # Per-automation-type configs
│   │   │   ├── <automation-id>.json
│   │   │   └── <automation-id>.json
│   │   └── concurrency-state.json # Concurrency limiter state
│   ├── workspaces/                # Workspace clones for execution
│   │   └── <automation-id>/
│   │       ├── repo/              # Cloned repository
│   │       ├── state.json         # Runtime state
│   │       └── progress.json      # Progress tracker state
│   ├── logs/                      # Execution logs
│   │   ├── dispatcher/            # Dispatcher logs
│   │   │   └── YYYY-MM-DD.jsonl
│   │   └── smart-sync-fork/       # Per-automation-type logs
│   │       ├── <automation-id>-YYYY-MM-DD-HH-mm-ss.jsonl
│   │       └── ...
│   ├── locks/                     # Repository lock files
│   │   └── <repo-key>.lock
│   └── artifacts/                 # Generated artifacts (optional)
│       └── <automation-id>/
│           └── <artifact-name>
```

## Storage Components

### 1. Configuration Storage

#### File Structure

```
~/.clawdbrain/automations/config/
├── dispatcher.json                 # Global dispatcher config
├── concurrency-state.json          # Concurrency limiter state
└── smart-sync-fork/                # Automation-type subdirectory
    ├── auto-sync-main-123.json     # Individual automation configs
    ├── auto-sync-upstream-456.json
    └── ...
```

#### Dispatcher Configuration

```json
// ~/.clawdbrain/automations/config/dispatcher.json
{
  "version": 1,
  "maxConcurrent": 3,
  "lockTimeoutHours": 4,
  "enabled": true,
  "logLevel": "info",
  "notifications": {
    "onStart": false,
    "onComplete": true,
    "onError": true,
    "channels": ["#cb-activity"]
  },
  "lastModified": "2025-01-26T10:30:00Z",
  "lastModifiedBy": "user@example.com"
}
```

**Schema:**

```typescript
// src/automations/storage/config-schemas.ts

import { z } from "zod";

export const DispatcherConfigSchema = z.object({
  version: z.literal(1),
  maxConcurrent: z.number().min(1).max(10).default(3),
  lockTimeoutHours: z.number().min(1).max(24).default(4),
  enabled: z.boolean().default(true),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  notifications: z.object({
    onStart: z.boolean().default(false),
    onComplete: z.boolean().default(true),
    onError: z.boolean().default(true),
    channels: z.array(z.string()).default(["#cb-activity"]),
  }),
  lastModified: z.string().datetime(),
  lastModifiedBy: z.string().email().optional(),
});

export type DispatcherConfig = z.infer<typeof DispatcherConfigSchema>;
```

#### Automation Configuration

```json
// ~/.clawdbrain/automations/config/smart-sync-fork/auto-sync-main-123.json
{
  "id": "auto-sync-main-123",
  "type": "smart-sync-fork",
  "name": "Sync Main Fork with Upstream",
  "description": "Automatically sync my fork with upstream using AI conflict resolution",
  "enabled": true,
  "schedule": {
    "type": "interval",
    "value": "2h"
  },
  "config": {
    "forkRepoUrl": "git@github.com:user/main-fork.git",
    "upstreamRepoUrl": "git@github.com:original/main.git",
    "forkBranch": "main",
    "upstreamBranch": "main",
    "aiModel": "claude-opus-4-5-20251101",
    "confidenceThreshold": 90,
    "uncertaintyAction": "report-at-end",
    "autoMerge": false,
    "maxWrongPathCorrections": 3,
    "maxMinutesPerConflict": 5,
    "shallowClone": true,
    "notifyOnSuccess": true,
    "notifyOnFailure": true,
    "notifyOnAttention": true,
    "notificationChannels": ["#cb-activity"]
  },
  "lastRun": {
    "timestamp": "2025-01-26T08:00:00Z",
    "status": "success",
    "duration": 324000,
    "summary": "Synced 15 commits, resolved 3 conflicts, PR #123 created"
  },
  "nextRun": "2025-01-26T10:00:00Z",
  "runHistory": [
    {
      "timestamp": "2025-01-26T08:00:00Z",
      "status": "success",
      "duration": 324000,
      "summary": "Synced 15 commits, resolved 3 conflicts, PR #123 created"
    },
    {
      "timestamp": "2025-01-26T06:00:00Z",
      "status": "partial",
      "duration": 456000,
      "summary": "2 conflicts require attention, branch pushed"
    }
  ],
  "created": "2025-01-20T10:00:00Z",
  "modified": "2025-01-26T08:00:00Z"
}
```

**Schema:**

```typescript
export const AutomationConfigSchema = z.object({
  // Metadata
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  enabled: z.boolean().default(true),

  // Scheduling
  schedule: z.object({
    type: z.enum(["cron", "interval", "at"]),
    value: z.string(),
  }),

  // Type-specific config (validated by automation type)
  config: z.record(z.any()),

  // Run tracking
  lastRun: z
    .object({
      timestamp: z.string().datetime(),
      status: z.enum(["success", "partial", "failed", "cancelled"]),
      duration: z.number(), // milliseconds
      summary: z.string(),
    })
    .optional(),

  nextRun: z.string().datetime().optional(),

  runHistory: z
    .array(
      z.object({
        timestamp: z.string().datetime(),
        status: z.enum(["success", "partial", "failed", "cancelled"]),
        duration: z.number(),
        summary: z.string(),
      }),
    )
    .max(100), // Keep last 100 runs

  // Timestamps
  created: z.string().datetime(),
  modified: z.string().datetime(),
});

export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;
```

#### Concurrency State

```json
// ~/.clawdbrain/automations/config/concurrency-state.json
{
  "version": 1,
  "maxSlots": 3,
  "activeSlots": [
    {
      "automationId": "auto-sync-main-123",
      "sessionId": "cron:abc-123-def",
      "acquiredAt": "2025-01-26T10:30:00Z",
      "slotNumber": 1
    }
  ],
  "lastUpdated": "2025-01-26T10:30:00Z"
}
```

**Schema:**

```typescript
export const ConcurrencyStateSchema = z.object({
  version: z.literal(1),
  maxSlots: z.number().min(1).max(10),
  activeSlots: z.array(
    z.object({
      automationId: z.string(),
      sessionId: z.string(),
      acquiredAt: z.string().datetime(),
      slotNumber: z.number().int().positive(),
    }),
  ),
  lastUpdated: z.string().datetime(),
});

export type ConcurrencyState = z.infer<typeof ConcurrencyStateSchema>;
```

### 2. Workspace Storage

#### Directory Layout

```
~/.clawdbrain/automations/workspaces/<automation-id>/
├── repo/                          # Git repository clone
│   ├── .git/
│   ├── src/
│   └── ...
├── state.json                     # Runtime state (updated during execution)
├── progress.json                  # Progress tracking (for UI polling)
└── workspace-info.json            # Metadata about workspace
```

#### Workspace Info

```json
// ~/.clawdbrain/automations/workspaces/<automation-id>/workspace-info.json
{
  "automationId": "auto-sync-main-123",
  "automationType": "smart-sync-fork",
  "sessionId": "cron:abc-123-def",
  "created": "2025-01-26T10:30:00Z",
  "lastUpdated": "2025-01-26T10:35:00Z",
  "status": "active",
  "repository": {
    "forkUrl": "git@github.com:user/main-fork.git",
    "upstreamUrl": "git@github.com:original/main.git",
    "branch": "main",
    "commit": "abc123def456"
  },
  "size": {
    "bytes": 52428800,
    "humanReadable": "50 MB"
  },
  "preserve": false
}
```

#### Runtime State

```json
// ~/.clawdbrain/automations/workspaces/<automation-id>/state.json
{
  "automationId": "auto-sync-main-123",
  "sessionId": "cron:abc-123-def",
  "startTime": "2025-01-26T10:30:00Z",
  "lastUpdate": "2025-01-26T10:35:00Z",
  "status": "running",
  "currentPhase": "resolving-conflicts",
  "progress": {
    "percentage": 65,
    "milestone": "Resolving conflicts",
    "details": {
      "totalConflicts": 5,
      "resolvedConflicts": 3,
      "currentFile": "src/core/processor.ts"
    }
  },
  "git": {
    "workspaceInitialized": true,
    "forkCloned": true,
    "upstreamAdded": true,
    "currentCommit": "abc123def456",
    "upstreamCommit": "def789ghi012"
  },
  "merge": {
    "mergeStarted": true,
    "conflictsDetected": 5,
    "conflictsResolved": 3,
    "conflictsSkipped": 0,
    "uncertainResolutions": []
  },
  "resolution": {
    "wrongPathCorrections": 1,
    "totalConflicts": 5
  },
  "artifacts": {
    "branchCreated": "smart-sync/auto-sync-main-123-20250126-103000",
    "branchUrl": "https://github.com/user/main-fork/tree/smart-sync/auto-sync-main-123-20250126-103000"
  }
}
```

#### Progress State

```json
// ~/.clashdbot/automations/workspaces/<automation-id>/progress.json
{
  "automationId": "auto-sync-main-123",
  "sessionId": "cron:abc-123-def",
  "timeline": [
    {
      "timestamp": "2025-01-26T10:30:00Z",
      "milestone": "Initializing workspace",
      "percentage": 5,
      "details": { "workspaceDir": "/path/to/workspace" }
    },
    {
      "timestamp": "2025-01-26T10:30:15Z",
      "milestone": "Cloning fork repository",
      "percentage": 10,
      "details": { "repository": "git@github.com:user/main-fork.git" }
    },
    {
      "timestamp": "2025-01-26T10:31:00Z",
      "milestone": "Fetching upstream changes",
      "percentage": 15,
      "details": { "upstream": "git@github.com:original/main.git" }
    },
    {
      "timestamp": "2025-01-26T10:32:00Z",
      "milestone": "Detecting merge conflicts",
      "percentage": 25,
      "details": { "commitsAhead": 15 }
    },
    {
      "timestamp": "2025-01-26T10:32:30Z",
      "milestone": "Resolving conflicts",
      "percentage": 35,
      "details": { "totalConflicts": 5 }
    },
    {
      "timestamp": "2025-01-26T10:33:00Z",
      "milestone": "Resolving: src/core/processor.ts",
      "percentage": 45,
      "details": { "file": "src/core/processor.ts", "conflict": 3, "resolved": 3 }
    }
  ],
  "lastUpdate": "2025-01-26T10:33:00Z"
}
```

### 3. Log Storage

#### File Format

Logs are stored as **JSONL** (JSON Lines) files - one JSON object per line. This format allows for:

- Easy streaming and appending
- Line-by-line parsing without loading entire file
- Structured querying with tools like `jq`
- Simple log rotation

#### Dispatcher Log

```jsonl
// ~/.clawdbrain/automations/logs/dispatcher/2025-01-26.jsonl
{"timestamp":"2025-01-26T10:00:00Z","level":"info","event":"dispatch-started","automationsCount":5,"dueCount":2}
{"timestamp":"2025-01-26T10:00:01Z","level":"info","event":"automation-dispatched","automationId":"auto-sync-main-123","sessionId":"cron:abc-123"}
{"timestamp":"2025-01-26T10:00:01Z","level":"info","event":"automation-dispatched","automationId":"auto-sync-upstream-456","sessionId":"cron:def-456"}
{"timestamp":"2025-01-26T10:00:02Z","level":"info","event":"automation-skipped","automationId":"auto-sync-lib-789","reason":"repository-locked"}
{"timestamp":"2025-01-26T10:00:02Z","level":"info","event":"automation-skipped","automationId":"auto-sync-tools-101","reason":"concurrency-limit"}
{"timestamp":"2025-01-26T10:00:03Z","level":"info","event":"dispatch-completed","dispatched":2,"skipped":2,"duration":3000}
{"timestamp":"2025-01-26T12:00:00Z","level":"info","event":"dispatch-started","automationsCount":5,"dueCount":1}
{"timestamp":"2025-01-26T12:00:01Z","level":"error","event":"automation-failed","automationId":"auto-sync-main-123","error":"Failed to clone repository","sessionId":"cron:ghi-789"}
```

**Schema:**

```typescript
export const DispatcherLogEntrySchema = z.object({
  timestamp: z.string().datetime(),
  level: z.enum(["debug", "info", "warn", "error"]),
  event: z.string(),
  automationId: z.string().optional(),
  sessionId: z.string().optional(),
  reason: z.string().optional(),
  error: z.string().optional(),
  // Event-specific fields
  automationsCount: z.number().optional(),
  dueCount: z.number().optional(),
  dispatched: z.number().optional(),
  skipped: z.number().optional(),
  duration: z.number().optional(),
});

export type DispatcherLogEntry = z.infer<typeof DispatcherLogEntrySchema>;
```

#### Automation Run Log

```jsonl
// ~/.clawdbrain/automations/logs/smart-sync-fork/auto-sync-main-123-20250126-100000.jsonl
{"timestamp":"2025-01-26T10:00:00Z","level":"info","phase":"init","message":"Starting Smart-Sync Fork automation","automationId":"auto-sync-main-123","sessionId":"cron:abc-123"}
{"timestamp":"2025-01-26T10:00:01Z","level":"info","phase":"workspace","message":"Creating workspace directory","workspaceDir":"/path/to/workspace","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:05Z","level":"info","phase":"git","message":"Cloning fork repository","repository":"git@github.com:user/main-fork.git","depth":1,"automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:30Z","level":"info","phase":"git","message":"Adding upstream remote","upstream":"git@github.com:original/main.git","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:35Z","level":"info","phase":"git","message":"Fetching upstream","branch":"main","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:40Z","level":"info","phase":"merge","message":"Starting merge","upstream":"original/main","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:41Z","level":"info","phase":"conflict","message":"Conflict detected","file":"src/core/processor.ts","hunks":3,"automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:00:50Z","level":"debug","phase":"resolution","message":"AI analyzing conflict","file":"src/core/processor.ts","confidence":85,"automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:01:00Z","level":"info","phase":"resolution","message":"Conflict resolved","file":"src/core/processor.ts","confidence":92,"automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:00Z","level":"info","phase":"git","message":"All conflicts resolved","total":5,"resolved":5,"automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:10Z","level":"info","phase":"git","message":"Creating feature branch","branch":"smart-sync/auto-sync-main-123-20250126-100000","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:15Z","level":"info","phase":"git","message":"Pushing branch","remote":"origin","branch":"smart-sync/auto-sync-main-123-20250126-100000","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:30Z","level":"info","phase":"pr","message":"Creating pull request","forkRepo":"user/main-fork","baseBranch":"main","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:35Z","level":"info","phase":"pr","message":"Pull request created","prNumber":123,"prUrl":"https://github.com/user/main-fork/pull/123","automationId":"auto-sync-main-123"}
{"timestamp":"2025-01-26T10:02:40Z","level":"info","phase":"complete","message":"Automation completed successfully","status":"success","duration":164000,"automationId":"auto-sync-main-123"}
```

**Schema:**

```typescript
export const AutomationLogEntrySchema = z.object({
  timestamp: z.string().datetime(),
  level: z.enum(["debug", "info", "warn", "error"]),
  phase: z.enum([
    "init",
    "workspace",
    "git",
    "merge",
    "conflict",
    "resolution",
    "pr",
    "complete",
    "cleanup",
  ]),
  message: z.string(),
  automationId: z.string(),
  sessionId: z.string().optional(),
  // Phase-specific fields
  workspaceDir: z.string().optional(),
  repository: z.string().optional(),
  upstream: z.string().optional(),
  branch: z.string().optional(),
  depth: z.number().optional(),
  file: z.string().optional(),
  hunks: z.number().optional(),
  confidence: z.number().optional(),
  total: z.number().optional(),
  resolved: z.number().optional(),
  prNumber: z.number().optional(),
  prUrl: z.string().optional(),
  status: z.enum(["success", "partial", "failed", "cancelled"]).optional(),
  duration: z.number().optional(),
  error: z.string().optional(),
});

export type AutomationLogEntry = z.infer<typeof AutomationLogEntrySchema>;
```

#### Log Retention

Logs are retained based on the configured retention period (default: 30 days).

**Cleanup Job:**

```typescript
// Runs daily to clean up old logs
async function cleanupOldLogs(retentionDays: number): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const logDirs = [
    "~/.clawdbrain/automations/logs/dispatcher",
    "~/.clawdbrain/automations/logs/smart-sync-fork",
  ];

  for (const dir of logDirs) {
    const files = await fs.readdir(dir);

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;

      // Extract date from filename
      const match = file.match(/(\d{4}-\d{2}-\d{2})\.jsonl/);
      if (!match) continue;

      const fileDate = new Date(match[1]);
      if (fileDate < cutoffDate) {
        await fs.rm(path.join(dir, file), { force: true });
      }
    }
  }
}
```

### 4. Lock Storage

#### Lock File Format

```json
// ~/.clawdbrain/automations/locks/github.com-user-repo.lock
{
  "repoUrl": "https://github.com/user/repo.git",
  "repoKey": "github.com/user/repo",
  "automationId": "auto-sync-main-123",
  "sessionId": "cron:abc-123-def",
  "acquiredAt": "2025-01-26T10:30:00Z",
  "pid": 12345,
  "hostname": "gateway-host",
  "lockType": "repository"
}
```

**Schema:**

```typescript
export const RepositoryLockSchema = z.object({
  repoUrl: z.string().url(),
  repoKey: z.string(),
  automationId: z.string(),
  sessionId: z.string(),
  acquiredAt: z.string().datetime(),
  pid: z.number().int().positive(),
  hostname: z.string(),
  lockType: z.literal("repository"),
});

export type RepositoryLock = z.infer<typeof RepositoryLockSchema>;
```

**Lock Key Normalization:**

```typescript
function normalizeRepoKey(repoUrl: string): string {
  return repoUrl
    .replace(/\.git$/, "") // Remove .git suffix
    .replace(/^https?:\/\//, "") // Remove protocol
    .replace(/^git@([^:]+):/, "$1/") // Convert SSH to HTTPS-style
    .toLowerCase(); // Normalize case
}

// Examples:
// "https://github.com/User/Repo.git" → "github.com/user/repo"
// "git@github.com:User/Repo.git" → "github.com/user/repo"
// "HTTPS://GITHUB.COM/USER/REPO" → "github.com/user/repo"
```

### 5. Artifact Storage (Optional)

For automations that generate artifacts (reports, patches, etc.):

```
~/.clawdbrain/automations/artifacts/<automation-id>/
├── <timestamp>-conflict-report.md
├── <timestamp>-resolution-summary.json
└── <timestamp>-patch.diff
```

## Storage API

### Configuration Store

```typescript
// src/automations/storage/config-store.ts

/**
 * Manages automation configuration files.
 */
class AutomationConfigStore {
  private configDir: string;

  constructor() {
    this.configDir = path.join(getConfigPath(), "automations", "config");
  }

  /**
   * Get all automation configs.
   */
  async listAutomations(): Promise<AutomationConfig[]> {
    const types = await fs.readdir(this.configDir);

    const automations: AutomationConfig[] = [];

    for (const type of types) {
      const typeDir = path.join(this.configDir, type);

      // Skip dispatcher.json and concurrency-state.json
      if (type.endsWith(".json")) continue;

      const files = await fs.readdir(typeDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(typeDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const config = JSON5.parse(content);

        automations.push(AutomationConfigSchema.parse(config));
      }
    }

    return automations;
  }

  /**
   * Get a specific automation config.
   */
  async getAutomation(id: string): Promise<AutomationConfig | null> {
    // Search in all type directories
    const types = await fs.readdir(this.configDir);

    for (const type of types) {
      const typeDir = path.join(this.configDir, type);
      if (!(await isDirectory(typeDir))) continue;

      const filePath = path.join(typeDir, `${id}.json`);

      if (await fileExists(filePath)) {
        const content = await fs.readFile(filePath, "utf-8");
        const config = JSON5.parse(content);

        return AutomationConfigSchema.parse(config);
      }
    }

    return null;
  }

  /**
   * Save or update an automation config.
   */
  async saveAutomation(config: AutomationConfig): Promise<void> {
    const typeDir = path.join(this.configDir, config.type);

    // Ensure type directory exists
    await fs.mkdir(typeDir, { recursive: true });

    const filePath = path.join(typeDir, `${config.id}.json`);

    // Update modified timestamp
    config.modified = new Date().toISOString();

    // Validate
    AutomationConfigSchema.parse(config);

    // Write atomically
    await writeAtomic(filePath, JSON5.stringify(config, null, 2));
  }

  /**
   * Delete an automation config.
   */
  async deleteAutomation(id: string): Promise<void> {
    const config = await this.getAutomation(id);
    if (!config) {
      throw new Error(`Automation ${id} not found`);
    }

    const typeDir = path.join(this.configDir, config.type);
    const filePath = path.join(typeDir, `${id}.json`);

    await fs.rm(filePath, { force: true });
  }

  /**
   * Update the last run information for an automation.
   */
  async updateLastRun(id: string, runResult: LastRunInfo): Promise<void> {
    const config = await this.getAutomation(id);
    if (!config) {
      throw new Error(`Automation ${id} not found`);
    }

    // Update last run
    config.lastRun = runResult;

    // Add to history (keep last 100)
    config.runHistory = [runResult, ...(config.runHistory || [])].slice(0, 100);

    await this.saveAutomation(config);
  }
}

interface LastRunInfo {
  timestamp: string;
  status: "success" | "partial" | "failed" | "cancelled";
  duration: number;
  summary: string;
}
```

### Workspace Manager

```typescript
// src/automations/storage/workspace-manager.ts

/**
 * Manages automation workspace directories.
 */
class WorkspaceManager {
  private workspaceBaseDir: string;

  constructor() {
    this.workspaceBaseDir = path.join(getConfigPath(), "automations", "workspaces");
  }

  /**
   * Create a new workspace for an automation.
   */
  async createWorkspace(automationId: string): Promise<string> {
    const workspaceDir = path.join(this.workspaceBaseDir, automationId);

    // Remove existing workspace if present
    await fs.rm(workspaceDir, { recursive: true, force: true });

    // Create new workspace
    await fs.mkdir(workspaceDir, { recursive: true });

    return workspaceDir;
  }

  /**
   * Get workspace directory for an automation.
   */
  getWorkspaceDir(automationId: string): string {
    return path.join(this.workspaceBaseDir, automationId);
  }

  /**
   * Check if workspace exists.
   */
  async workspaceExists(automationId: string): Promise<boolean> {
    const workspaceDir = this.getWorkspaceDir(automationId);
    return await fileExists(workspaceDir);
  }

  /**
   * Get workspace size in bytes.
   */
  async getWorkspaceSize(automationId: string): Promise<number> {
    const workspaceDir = this.getWorkspaceDir(automationId);

    if (!(await fileExists(workspaceDir))) {
      return 0;
    }

    return await getDirectorySize(workspaceDir);
  }

  /**
   * Clean up workspace directory.
   */
  async cleanupWorkspace(automationId: string): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(automationId);
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }

  /**
   * List all workspace directories.
   */
  async listWorkspaces(): Promise<string[]> {
    if (!(await fileExists(this.workspaceBaseDir))) {
      return [];
    }

    const entries = await fs.readdir(this.workspaceBaseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  /**
   * Get workspace info (metadata).
   */
  async getWorkspaceInfo(automationId: string): Promise<WorkspaceInfo | null> {
    const workspaceDir = this.getWorkspaceDir(automationId);
    const infoPath = path.join(workspaceDir, "workspace-info.json");

    if (!(await fileExists(infoPath))) {
      return null;
    }

    const content = await fs.readFile(infoPath, "utf-8");
    return JSON5.parse(content);
  }

  /**
   * Update workspace runtime state.
   */
  async updateState(automationId: string, state: Record<string, any>): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(automationId);
    const statePath = path.join(workspaceDir, "state.json");

    await writeAtomic(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Update progress state.
   */
  async updateProgress(automationId: string, progress: ProgressUpdate): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(automationId);
    const progressPath = path.join(workspaceDir, "progress.json");

    let current: ProgressState;

    if (await fileExists(progressPath)) {
      const content = await fs.readFile(progressPath, "utf-8");
      current = JSON5.parse(content);
    } else {
      current = { automationId, timeline: [] };
    }

    // Append new progress entry
    current.timeline.push({
      timestamp: new Date().toISOString(),
      ...progress,
    });
    current.lastUpdate = new Date().toISOString();

    // Keep last 1000 entries
    if (current.timeline.length > 1000) {
      current.timeline = current.timeline.slice(-1000);
    }

    await writeAtomic(progressPath, JSON.stringify(current, null, 2));
  }
}

interface WorkspaceInfo {
  automationId: string;
  automationType: string;
  sessionId: string;
  created: string;
  lastUpdated: string;
  status: "active" | "complete" | "failed" | "abandoned";
  repository: {
    forkUrl: string;
    upstreamUrl: string;
    branch: string;
    commit: string;
  };
  size: {
    bytes: number;
    humanReadable: string;
  };
  preserve: boolean;
}

interface ProgressState {
  automationId: string;
  timeline: Array<{
    timestamp: string;
    milestone: string;
    percentage: number;
    details: Record<string, any>;
  }>;
  lastUpdate: string;
}
```

### Log Manager

```typescript
// src/automations/storage/log-manager.ts

/**
 * Manages automation log files.
 */
class AutomationLogManager {
  private logBaseDir: string;
  private retentionDays: number;

  constructor(retentionDays: number = 30) {
    this.logBaseDir = path.join(getConfigPath(), "automations", "logs");
    this.retentionDays = retentionDays;
  }

  /**
   * Write a log entry.
   */
  async writeLog(
    automationType: string,
    automationId: string,
    entry: AutomationLogEntry | DispatcherLogEntry,
  ): Promise<void> {
    const logDir = path.join(this.logBaseDir, automationType);
    await fs.mkdir(logDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const logFile = path.join(logDir, `${date}.jsonl`);

    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });

    // Append to log file
    await fs.appendFile(logFile, line + "\n");
  }

  /**
   * Read log entries for a date range.
   */
  async readLogs(
    automationType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<AutomationLogEntry | DispatcherLogEntry>> {
    const entries = [];

    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const date = currentDate.toISOString().split("T")[0];
      const logFile = path.join(this.logBaseDir, automationType, `${date}.jsonl`);

      if (await fileExists(logFile)) {
        const content = await fs.readFile(logFile, "utf-8");
        const lines = content.trim().split("\n");

        for (const line of lines) {
          if (line.trim()) {
            entries.push(JSON.parse(line));
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return entries;
  }

  /**
   * Get recent logs for an automation.
   */
  async getRecentLogs(
    automationType: string,
    automationId: string,
    limit: number = 100,
  ): Promise<AutomationLogEntry[]> {
    const logs: AutomationLogEntry[] = [];

    // Read recent log files (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const allLogs = await this.readLogs(automationType, startDate, endDate);

    // Filter by automation ID and limit
    return allLogs
      .filter(
        (log): log is AutomationLogEntry =>
          "automationId" in log && log.automationId === automationId,
      )
      .slice(-limit);
  }

  /**
   * Clean up old logs based on retention policy.
   */
  async cleanupOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const typeDirs = await fs.readdir(this.logBaseDir);

    for (const typeDir of typeDirs) {
      const dirPath = path.join(this.logBaseDir, typeDir);
      if (!(await isDirectory(dirPath))) continue;

      const files = await fs.readdir(dirPath);

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;

        // Extract date from filename
        const match = file.match(/(\d{4}-\d{2}-\d{2})\.jsonl/);
        if (!match) continue;

        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          await fs.rm(path.join(dirPath, file), { force: true });
        }
      }
    }
  }
}
```

### Lock Manager

```typescript
// src/automations/storage/lock-manager.ts

/**
 * Manages repository lock files.
 */
class RepositoryLockManager {
  private lockDir: string;

  constructor() {
    this.lockDir = path.join(getConfigPath(), "automations", "locks");
  }

  /**
   * Try to acquire a lock for a repository.
   */
  async acquireLock(
    repoUrl: string,
    automationId: string,
    sessionId: string,
  ): Promise<RepositoryLock | null> {
    await fs.mkdir(this.lockDir, { recursive: true });

    const repoKey = normalizeRepoKey(repoUrl);
    const lockFile = path.join(this.lockDir, `${repoKey}.lock`);

    // Check if lock already exists
    if (await this.isLocked(repoUrl)) {
      const existing = await this.getLock(repoUrl);
      if (existing) {
        // Check if lock is stale
        const lockAge = Date.now() - new Date(existing.acquiredAt).getTime();
        const staleTimeout = 4 * 60 * 60 * 1000; // 4 hours

        if (lockAge > staleTimeout) {
          // Force release stale lock
          await this.forceRelease(repoUrl);
        } else {
          return null; // Lock is held by another automation
        }
      }
    }

    // Create lock
    const lock: RepositoryLock = {
      repoUrl,
      repoKey,
      automationId,
      sessionId,
      acquiredAt: new Date().toISOString(),
      pid: process.pid,
      hostname: os.hostname(),
      lockType: "repository",
    };

    await writeAtomic(lockFile, JSON.stringify(lock, null, 2));

    return lock;
  }

  /**
   * Release a lock.
   */
  async releaseLock(lock: RepositoryLock): Promise<void> {
    const lockFile = path.join(this.lockDir, `${lock.repoKey}.lock`);
    await fs.rm(lockFile, { force: true });
  }

  /**
   * Check if a repository is locked.
   */
  async isLocked(repoUrl: string): Promise<boolean> {
    const repoKey = normalizeRepoKey(repoUrl);
    const lockFile = path.join(this.lockDir, `${repoKey}.lock`);
    return await fileExists(lockFile);
  }

  /**
   * Get lock information for a repository.
   */
  async getLock(repoUrl: string): Promise<RepositoryLock | null> {
    const repoKey = normalizeRepoKey(repoUrl);
    const lockFile = path.join(this.lockDir, `${repoKey}.lock`);

    if (!(await fileExists(lockFile))) {
      return null;
    }

    const content = await fs.readFile(lockFile, "utf-8");
    return JSON5.parse(content);
  }

  /**
   * Force release a lock (admin operation).
   */
  async forceRelease(repoUrl: string): Promise<void> {
    const repoKey = normalizeRepoKey(repoUrl);
    const lockFile = path.join(this.lockDir, `${repoKey}.lock`);
    await fs.rm(lockFile, { force: true });
  }

  /**
   * List all active locks.
   */
  async listLocks(): Promise<RepositoryLock[]> {
    if (!(await fileExists(this.lockDir))) {
      return [];
    }

    const files = await fs.readdir(this.lockDir);
    const locks: RepositoryLock[] = [];

    for (const file of files) {
      if (!file.endsWith(".lock")) continue;

      const lockPath = path.join(this.lockDir, file);
      const content = await fs.readFile(lockPath, "utf-8");
      locks.push(JSON5.parse(content));
    }

    return locks;
  }
}
```

## Utility Functions

```typescript
// src/automations/storage/utils.ts

/**
 * Write file atomically (write to temp, then rename).
 */
async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tempPath, content, { mode: 0o600 });
  await fs.rename(tempPath, filePath);
}

/**
 * Check if file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory.
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get directory size recursively.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      totalSize += await getDirectorySize(fullPath);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      totalSize += stat.size;
    }
  }

  return totalSize;
}

/**
 * Get the Clawdbrain config path.
 */
function getConfigPath(): string {
  // Use existing config path from Clawdbrain
  return path.join(os.homedir(), ".clawdbrain");
}

/**
 * Format bytes to human-readable size.
 */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
```

## File Permissions

All automation storage files should have restrictive permissions:

- **Config files:** 0600 (owner read/write only)
- **Lock files:** 0600
- **State files:** 0600
- **Log files:** 0600
- **Workspace directories:** 0700 (owner access only)

```typescript
// Applied in writeAtomic and mkdir calls
await fs.mkdir(dirPath, { mode: 0o700, recursive: true });
await fs.writeFile(filePath, content, { mode: 0o600 });
```

## Migration & Versioning

Configuration files include a `version` field for future migrations:

```typescript
// Example migration function
async function migrateConfig(config: any): Promise<any> {
  switch (config.version) {
    case 1:
      // Current version
      return config;

    case 0:
      // Migrate from v0 to v1
      return {
        ...config,
        version: 1,
        // Add new fields with defaults
        maxConcurrent: config.maxConcurrent ?? 3,
      };

    default:
      throw new Error(`Unknown config version: ${config.version}`);
  }
}
```

## Backup & Export

For automation backup/restore:

```typescript
/**
 * Export all automation configurations.
 */
async function exportAutomations(outputPath: string): Promise<void> {
  const store = new AutomationConfigStore();
  const automations = await store.listAutomations();

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    automations,
  };

  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
}

/**
 * Import automation configurations.
 */
async function importAutomations(inputPath: string): Promise<void> {
  const content = await fs.readFile(inputPath, "utf-8");
  const data = JSON5.parse(content);

  // Validate version
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const store = new AutomationConfigStore();

  for (const automation of data.automations) {
    await store.saveAutomation(automation);
  }
}
```
