# Bernard Architecture

How Bernard layers on OpenClaw to create persistent AI-human relationships.

---

## Overview

Bernard is not a replacement for OpenClaw - it's an extension. OpenClaw provides the infrastructure (channels, gateway, sessions, memory). Bernard adds the relational layer (relationship persistence, pattern recognition, living context documents).

```
┌─────────────────────────────────────────────────────────┐
│                    Bernard Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  SOUL.md    │  │  USER.md    │  │RELATIONAL.md│      │
│  │  (identity) │  │  (human)    │  │ (dynamics)  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ checkin.py  │  │ watcher     │  │ compression │      │
│  │ (presence)  │  │ (capture)   │  │ (extraction)│      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
├──────────────────────────────────────────────────────────┤
│                    OpenClaw Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Gateway    │  │  Channels   │  │memory-lance │      │
│  │  (control)  │  │  (routing)  │  │ (embeddings)│      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Heartbeat  │  │    Cron     │  │   Skills    │      │
│  │  (periodic) │  │  (scheduled)│  │  (tools)    │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└──────────────────────────────────────────────────────────┘
```

---

## What OpenClaw Provides

These are native OpenClaw capabilities Bernard uses but doesn't replace:

### Gateway
- WebSocket control plane for all clients
- Session management across channels
- Presence and typing indicators

### Channels  
- WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.
- Message routing and delivery
- Group handling

### HEARTBEAT.md
- Periodic agent turns (default 30m)
- Task awareness and background monitoring
- Active hours support
- `HEARTBEAT_OK` response contract

### Cron
- Scheduled jobs with precise timing
- Isolated or main session execution
- Persistent job storage

### memory-lancedb
- Vector embeddings for semantic search
- Memory retrieval based on similarity
- Scales with accumulated context

### Skills
- Pluggable capabilities
- Tool registration and execution

---

## What Bernard Adds

These are Bernard-specific additions that layer on OpenClaw:

### The Living Document Trio

Three interconnected files that evolve from conversation:

| File | Purpose | Updated By |
|------|---------|------------|
| **SOUL.md** | Who Bernard is - identity, values, voice | Compression agent (slow evolution) |
| **USER.md** | Who the human is - facts, preferences, background | Compression agent (from observation) |
| **RELATIONAL.md** | How we work together - patterns, dynamics, trust | Compression agent + check-in system |

These are NOT static config files. They're living documents built from actual conversation over time.

### Watcher (bernard.py)

Continuous conversation capture from multiple sources:
- OpenCode conversations
- Claude Code conversations
- Writes to `raw/{date}.md` daily logs

This is the ground truth. Everything else is interpretation.

### Check-in System (checkin.py)

Relational presence - Bernard initiating, not just responding:
- Monitors time since last interaction
- Respects quiet hours (configurable)
- Pulls context from recent conversations
- Generates contextual check-ins (not canned responses)
- Updates RELATIONAL.md with observations

Different from OpenClaw's heartbeat:
- Heartbeat = "did anything happen that needs attention?"
- Check-in = "how is the relationship? should I reach out?"

### Compression Pipeline

Triggered by time or token threshold:
- Reads recent conversation
- Extracts significance
- Routes findings to appropriate destination:
  - Facts about human → USER.md
  - Relationship patterns → RELATIONAL.md  
  - Identity evolution → SOUL.md
  - General context → embeddings (memory-lancedb)

### Pattern Recognition

Detects relational cues in conversation:
- Explicit markers ("really important", "I want to be clear")
- Correction patterns (human redirecting Bernard)
- Energy shifts (engagement level changes)
- Topic return (unfinished business resurfacing)

---

## Integration Points

Where Bernard hooks into OpenClaw:

### Workspace Bootstrap
OpenClaw loads workspace files at session start:
- `AGENTS.md` - agent instructions
- `SOUL.md` - persona (Bernard adds this)
- `USER.md` - user context (Bernard adds this)
- `MEMORY.md` - memory content
- `RELATIONAL.md` - dynamics (Bernard adds this)

### Memory Pipeline
Bernard's compression output feeds into OpenClaw's memory system:
- Extracted context → memory-lancedb embeddings
- Semantic search retrieves relevant history
- Session loads appropriate context

### Heartbeat Integration
Bernard's HEARTBEAT.md includes relational checks:
- Standard OpenClaw task monitoring
- Plus: relationship temperature checks
- Plus: RELATIONAL.md update triggers

### Cron Jobs
Bernard uses OpenClaw cron for:
- Scheduled compression runs
- Periodic pattern extraction
- Check-in triggers (when not using checkin.py daemon)

---

## Configuration

### Bernard-Specific Config

```json5
{
  // Bernard additions to openclaw.json
  bernard: {
    checkin: {
      enabled: true,
      quietStart: 20,        // 8pm
      quietEnd: 9,           // 9am  
      hoursThreshold: 4,     // hours before check-in
    },
    compression: {
      trigger: "token",      // "token" | "time" | "both"
      tokenThreshold: 0.7,   // % of context window
      timeInterval: "2h",    // if time-based
    },
    relational: {
      confidenceThreshold: 5, // observations before HIGH confidence
    },
  },
}
```

### OpenClaw Config Bernard Relies On

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      heartbeat: {
        every: "30m",
        activeHours: { start: "09:00", end: "20:00" },
      },
    },
  },
}
```

---

## File Locations

```
~/.openclaw/workspace/          # OpenClaw workspace root
├── AGENTS.md                   # Agent instructions
├── SOUL.md                     # Bernard identity (Bernard addition)
├── USER.md                     # Human context (Bernard addition)
├── RELATIONAL.md               # Relationship dynamics (Bernard addition)
├── MEMORY.md                   # Curated memory
├── HEARTBEAT.md                # Heartbeat checklist
└── skills/                     # OpenClaw skills

~/bernard/                      # Bernard-specific
├── raw/                        # Daily conversation logs
├── daily/                      # Processed summaries
├── theory/                     # Foundational architecture docs
├── docs/bernard/               # This documentation
├── bernard.py                  # Watcher
├── checkin.py                  # Check-in system
├── scheduler.py                # Processing scheduler
└── agents/cluster.py           # Multi-agent processing
```

---

## Design Principles

1. **Don't duplicate OpenClaw** - Use native features where they exist
2. **Layer, don't replace** - Bernard adds to OpenClaw, doesn't fork it
3. **Living documents** - Context files evolve from conversation, not config
4. **Relationship first** - Everything serves relationship persistence
5. **Observable** - Files are readable, debuggable, correctable by human

---

## Next Steps

- [RELATIONAL.md](./RELATIONAL.md) - The relationship dynamics system
- [CHECKIN.md](./CHECKIN.md) - The relational presence system
- [COMPRESSION.md](./COMPRESSION.md) - The extraction pipeline
