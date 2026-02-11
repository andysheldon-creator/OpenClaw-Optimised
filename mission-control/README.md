# Mission Control 🎯

Standalone Next.js dashboard for managing AI agent tasks.

## Quick Start

```bash
cd /Users/claw/.openclaw/workspace/rifthome/mission-control
./start.sh
```

Then open: **http://localhost:3000**

## Features

- **Kanban Board**: Pending → In Progress → Done → Failed
- **Real-time Updates**: Auto-refreshes every 5 seconds
- **Task Creation**: Create tasks with title/description
- **Emotional Integration**: Tasks stored in episodic memory with emotional tags
- **API Endpoints**:
  - `GET /api/tasks` - List all jobs
  - `POST /api/tasks` - Create new job

## Database

Uses the existing SQLite database:
`~/.openclaw/workspace-dev/data/mission_control.db`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │────▶│  Next.js (3000) │────▶│   SQLite DB     │
│  (localhost)    │◀────│  Mission Control│◀────│  (mission_control.db)
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         │ (future)
         ▼
┌─────────────────┐
│  OpenClaw GW    │
│  (agent spawn)  │
└─────────────────┘
```

## Integration with Emotional System

When you create a task via Mission Control:

1. Job is stored in `mission_control.db`
2. Emotional episode is logged in `episodic_memory.db`
3. Need levels are adjusted (competence, purpose)
4. Pattern matching enables future emotional predictions

## Files Preserved

✅ `AUTONOMY.md` - Autonomy directives  
✅ `data/` - All databases and backups  
✅ Emotional core (`emotions.py`, `episodic_memory.db`)

## What's New

- Standalone Next.js app (separate from OpenClaw UI)
- No conflicts with existing gateway routes
- Clean Kanban interface
- Ready for agent dispatch integration

## Future: Agent Dispatch

To auto-assign tasks to AI agents:

1. Add OpenClaw Gateway connection
2. Call `sessions_spawn` when task created
3. Poll agent status and update job
4. Display agent logs in real-time
