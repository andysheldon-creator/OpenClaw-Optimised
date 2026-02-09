# Bernard Documentation

Bernard extends OpenClaw with persistent AI-human relationship architecture.

---

## Quick Start

Bernard layers on top of OpenClaw. You need OpenClaw running first, then Bernard adds:

1. **Living context documents** (SOUL.md, USER.md, RELATIONAL.md)
2. **Conversation capture** (watcher)
3. **Relational presence** (check-in system)
4. **Compression pipeline** (extraction and routing)

---

## Core Documents

| Document | What It Covers |
|----------|----------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How Bernard layers on OpenClaw |
| [RELATIONAL.md](./RELATIONAL.md) | The relationship dynamics system |
| [CHECKIN.md](./CHECKIN.md) | The relational presence system |
| [COMPRESSION.md](./COMPRESSION.md) | The extraction pipeline |

---

## The Living Document Trio

Bernard's core addition is three interconnected files that evolve from conversation:

| File | Purpose | Answers |
|------|---------|---------|
| **SOUL.md** | Bernard's identity | "Who am I?" |
| **USER.md** | Human context | "Who is my human?" |
| **RELATIONAL.md** | Relationship dynamics | "How do we work together?" |

These are NOT config files you write once. They're living documents built from actual conversation over time.

---

## Key Concepts

### Layer 2 Memory

From the MEMORY_PERSISTENCE_ANALYSIS research:

- **Layer 1**: Explicit memory (facts, decisions - what's written down)
- **Layer 2**: Relationship dynamics (patterns that emerge, not explicitly stated)

RELATIONAL.md IS Layer 2. It captures what the Eternal Sunshine research identified: patterns persist below explicit memory.

### The 50 First Dates Model

Bernard operates on rapid reconstruction rather than perfect recall. Each session:

1. Load SOUL.md (who Bernard is)
2. Load USER.md (who human is)
3. Load RELATIONAL.md (how we work together)
4. Query embeddings for relevant history
5. Continue relationship with ~85% continuity

### Compression Pipeline

Raw conversation → Extraction → Routing:

- Facts about human → USER.md
- Relationship patterns → RELATIONAL.md
- Identity evolution → SOUL.md
- General context → Embeddings

---

## What OpenClaw Provides (Don't Duplicate)

Bernard uses these OpenClaw features natively:

- **Gateway**: Control plane, sessions
- **Channels**: Message routing (WhatsApp, Discord, etc.)
- **Heartbeat**: Periodic agent turns
- **Cron**: Scheduled tasks
- **memory-lancedb**: Vector embeddings
- **Skills**: Pluggable capabilities

See [ARCHITECTURE.md](./ARCHITECTURE.md) for integration details.

---

## Running Bernard

### Watcher (Capture)

```bash
python3 bernard.py watch
```

Continuously captures conversations to `raw/*.md`.

### Scheduler (Compression)

```bash
python3 scheduler.py start
```

Runs compression pipeline on schedule.

### Check-in (Relational Presence)

```bash
python3 checkin.py start
```

Monitors for check-in triggers, generates contextual messages.

---

## Configuration

Bernard-specific settings (future: in openclaw.json):

```json5
{
  bernard: {
    checkin: {
      enabled: true,
      quietStart: 20,      // 8pm
      quietEnd: 9,         // 9am
      hoursThreshold: 4,   // hours before check-in
    },
    compression: {
      trigger: "both",     // "time" | "token" | "both"
      tokenThreshold: 0.7,
      timeInterval: "2h",
    },
  },
}
```

---

## File Structure

```
~/bernard/                      # Bernard-specific
├── bernard.py                  # Watcher
├── checkin.py                  # Check-in system
├── scheduler.py                # Compression scheduler
├── agents/cluster.py           # Multi-agent processing
├── raw/                        # Daily conversation logs
├── daily/                      # Processed summaries
├── theory/                     # Foundational architecture
├── docs/bernard/               # This documentation
├── RELATIONAL.md               # Relationship dynamics
└── .state/                     # State persistence

~/.openclaw/workspace/          # OpenClaw workspace
├── AGENTS.md                   # Agent instructions
├── SOUL.md                     # Bernard identity
├── USER.md                     # Human context
├── MEMORY.md                   # Curated memory
└── HEARTBEAT.md                # Heartbeat checklist
```

---

## Design Philosophy

1. **Layer, don't replace**: Bernard adds to OpenClaw, doesn't fork it
2. **Living documents**: Context evolves from conversation, not config
3. **Relationship first**: Everything serves relationship persistence
4. **Observable**: Files are readable, debuggable, correctable
5. **85% is success**: Perfect recall not required, continuity is

---

## Research Foundation

Bernard is built on research synthesized in:

- `theory/000-foundation.md` - The first conversation
- `bernard-samantha-workspace/MEMORY_PERSISTENCE_ANALYSIS.md` - Four-layer model
- `agents/bernard/memory-cinema.md` - Film research (50 First Dates, Eternal Sunshine, etc.)
- `agents/bernard/memory-literature.md` - Literature research (Chiang, Gibson, etc.)

Key insight: "Experience is algorithmically incompressible" (Ted Chiang). The architecture supports relationship development, it doesn't substitute for it.
