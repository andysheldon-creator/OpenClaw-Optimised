# Smart-Sync Fork Automation - Brainstorming Session

**Date:** 2025-01-26
**Status:** Design & Prototyping Complete - Ready for Implementation

## Overview

An automation system for Clawdbrain that automatically syncs forked repositories with upstream using AI-powered merge conflict resolution.

## Requirements Summary

### Core Features

1. Automatically sync forked repos with upstream using AI conflict resolution
2. New "Automations" vertical tab under existing Jobs/Cron tab
3. Smart cron scheduling: one dispatcher job checking due automations
4. Per-automation AI configuration (model, confidence threshold, uncertainty action)
5. SSH key detection/dropdown from ~/.ssh
6. Progress tracking with real-time updates
7. Notifications with toast + direct agent session link
8. Auto-Merge toggle (default off)
9. Git retry logic (3 wrong-path corrections OR 5 min per conflict)
10. Max 1 sync per repo (hard limit), max 3 concurrent automations (configurable)
11. 30-day log retention (configurable)

## Design Decisions

### Git Isolation Strategy: **Option B - Separate Clone Per Automation**

**Rationale:**

- Complete isolation between automation runs
- Simpler to reason about and debug
- Easier cleanup (delete directory)
- Only downsides: initial clone speed, disk space
- Disk space can be mitigated with:
  - Shallow clones when possible
  - Cleanup after successful runs
  - Configurable retention period
  - `--depth=1` for initial clone, deepen if needed

**Workspace Structure:**

```
~/.clawdbrain/automations/
├── smart-sync-fork/
│   ├── <automation-id-1>/
│   │   ├── fork/          # Cloned fork repo
│   │   ├── upstream/      # Added remote for upstream
│   │   └── state.json     # Run state/progress
│   ├── <automation-id-2>/
│   └── ...
└── logs/
    └── smart-sync-fork/
        └── <automation-id>-<timestamp>.jsonl
```

## Existing Codebase Integration Points

### Web UI Structure

- **Current tabs:** `/ui/src/ui/navigation.ts`
- **Tab groups:** Chat, Control, Agent, Settings
- **Cron tab location:** Under "Control" group, route `/cron`
- **New tab:** "Automations" under "Control", route `/automations`

### Cron Infrastructure

- **Service:** `/src/cron/service.ts` - cron job lifecycle
- **Types:** `/src/cron/types.ts` - schedule/payload structures
- **Store:** `/src/cron/store.ts` - persistent storage
- **Run log:** `/src/cron/run-log.ts` - execution logging
- **Isolated agent:** `/src/cron/isolated-agent.ts` - isolated runs

### Session Management

- **Session keys:** Pattern `cron:${jobId}` for cron jobs
- **Main session:** `/src/config/sessions/main-session.ts`
- **Session utils:** `/src/gateway/session-utils.ts`

### Notification System

- **Toast:** `/ui/src/ui/components/toast.ts`
- **Activity tracking:** `/src/infra/channel-activity.ts`

### Data Persistence

- **Config:** JSON5-based with Zod validation
- **Storage:** File-based in `~/.clawdbrain/`
- **Paths:** `/src/config/config-paths.ts`

## Key Technical Considerations

### 1. Smart Cron Scheduling (Dispatcher Pattern)

**Challenge:** Don't flood the Cron tab with many automation entries.

**Solution:** Single dispatcher cron job that:

- Runs at LCM (Least Common Multiple) of all automation schedules
- Checks which automations are due
- Spawns isolated agent sessions for due automations
- Enforces max 1 sync per repo, max N concurrent automations

**LCM Calculation Examples:**

- Hourly + Daily → LCM = Daily (run dispatcher daily)
- Every 15min + Every 20min → LCM = 60min (run dispatcher hourly)
- Every 6h + Every 8h → LCM = 24h (run dispatcher daily)

### 2. AI Confidence Threshold & Uncertainty Handling

**Flow:**

1. Agent encounters merge conflict
2. Agent assesses confidence (0-100%)
3. If confidence < threshold:
   - Log uncertainty with explanation
   - Generate 2+ resolution options
   - Continue based on "uncertainty action" setting
4. If confidence >= threshold:
   - Apply resolution
   - Track "wrong path" corrections

**Uncertainty Actions:**

- **Report at end (default):** Continue, summarize all uncertainties at end
- **Pause and ask:** Stop immediately, notify user
- **Skip file:** Leave conflict markers, move to next file

### 3. Git Retry Logic

**Two limits (whichever comes first):**

- Max 3 "wrong path" corrections total
- OR 5 minutes per single conflict (configurable)

**"Wrong path" detection:**

- Agent makes code change
- Agent realizes it's incorrect
- Agent must revert/backtrack

### 4. Real-time Progress Updates

**Progress Milestones:**

1. Cloning fork repository
2. Adding upstream remote
3. Fetching upstream changes
4. Detecting conflicts
5. Resolving: [file list or "common change across N files"]
6. Pushing branch
7. Creating/updating PR
8. (If auto-merge enabled) Merging branch

**Update Mechanism:**

- Agent writes to state.json in automation directory
- UI polls or receives SSE updates
- Display progress bar + current milestone

### 5. Agent-Session Link in Notifications

**Notification Format:**

```
Smart-Sync Fork: [automation-name]
✅ Sync complete - 12 conflicts resolved, PR auto-merged

[View Session] [View PR #123]
```

**Link Format:**

- Session link: `/#sessions?sessionId=<agent-session-id>`
- PR link: standard GitHub URL

## Questions & Answers

### Q1: Git Isolation Strategy

**Answer:** Option B - Separate clone per automation in `~/.clawdbrain/automations/`

## Comprehensive Design Documents

### Architecture Layer Designs (~3,700 total lines)

Detailed design documents have been created for each architectural layer:

1. **[Dispatch Layer Design](docs/designs/automations/01-dispatch-layer.md)** (~700 lines) - Dispatcher orchestrator, LCM scheduling algorithm, repository lock manager, semaphore-based concurrency limiting
2. **[Automation Type Layer Design](docs/designs/automations/02-automation-type-layer.md)** (~900 lines) - Base automation interface, Smart-Sync Fork implementation, AI conflict resolution workflow, confidence threshold handling
3. **[Storage Layer Design](docs/designs/automations/03-storage-layer.md)** (~1,000 lines) - Configuration storage with JSON5/Zod, workspace manager, JSONL log manager with retention, file-based locking
4. **[UI Layer Design](docs/designs/automations/04-ui-layer.md)** (~1,100 lines) - Component patterns, navigation integration, controller patterns, SSE progress updates

### UX Prototype Documents (via Magic MCP)

Comprehensive UI prototypes have been generated for all major views, capturing full Magic MCP output including CSS, JavaScript, component code, and design guidance.

⚠️ **Stack Translation Required:** Magic MCP generates React components, but Clawdbrain uses **Lit Web Components**.

**📖 Translation Guide:** See **[React to Lit Translation Guide](docs/designs/ux/00-react-to-lit-translation-guide.md)** for comprehensive, detailed instructions on translating React components to Lit Web Components following Clawdbrain patterns. Covers:

- Component structure (render functions vs class-based)
- State management (controllers vs hooks)
- Event handling, forms, and lists
- Icons, toasts, modals, and navigation
- Complete translation examples with before/after code
- Quick reference cheat sheet

UX Prototype Documents:

1. **[Automations List View](docs/designs/ux/01-automations-list-view.md)** - Grid layout for automation cards with status badges, filter/search, quick actions (Run Now, Suspend, History, Edit, Delete)
2. **[Automation Form](docs/designs/ux/02-automation-form.md)** - Multi-step configuration wizard with 6 steps: Basic Info, Schedule, Repositories, AI Settings, Merge Behavior, Notifications
3. **[Progress Modal](docs/designs/ux/03-progress-modal.md)** - Real-time execution tracking with progress bar, execution timeline, statistics cards, SSE integration examples
4. **[Run History](docs/designs/ux/04-run-history.md)** - Table with expandable details, date/status filters, pagination, conflict details, AI model information

## Next Steps

The design and prototyping phase is complete. Ready to proceed with:

1. **Implementation Planning** - Create detailed implementation tasks based on all design documents
2. **Git Worktree Setup** - Create isolated workspace for implementation (per superpowers workflow)
3. **API Implementation** - Build backend endpoints to support UI functionality

## Open Questions (To Be Resolved)

1. Exact cron expression format for per-automation scheduling
2. SSH key passphrase handling (if keys are passphrase-protected)
3. Branch naming convention for failed/partial resolutions
4. PR title/description format
5. #cb-activity channel configuration (which channel to use)
6. Global vs per-automation default for max concurrent automations
7. Log rotation strategy for 30-day retention
