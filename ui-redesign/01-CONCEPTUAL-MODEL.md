# Conceptual Model - Second Brain Platform

## Philosophy

The platform presents itself as a **"Second Brain"** - a deeply personal, human-oriented system. Every concept should feel natural and approachable, not technical or intimidating.

### Naming Principles

- Use warm, human language (not technical jargon)
- "Rituals" not "Cron Jobs"
- "Memories" not "Context Database"
- "Connections" not "Channel Configurations"

---

## Concept Hierarchy

### Tier 1: Primary Concepts (Always Visible)

These form the main navigation and are immediately accessible to all users.

#### **You** (Profile/Identity)

- **What it represents**: Your identity, preferences, values, communication style
- **Underlying files**: USER.md, IDENTITY.md
- **User mental model**: "Who I am to my agents"
- **UX**: Rich profile editor with personality questions, values exploration, communication preferences

#### **Goals**

- **What it represents**: High-level aspirations and outcomes you're working toward
- **User mental model**: "What I'm trying to achieve"
- **UX**: Visual goal cards, progress indicators, connection to workstreams
- **Examples**: "Launch my podcast", "Improve customer response time", "Learn Spanish"

#### **Workspaces**

- **What it represents**: Containers for related work, separate contexts
- **User mental model**: "Areas of my life"
- **UX**: Switchable contexts, each with its own agents, memories, goals
- **Examples**: "Personal", "Work @ Acme Corp", "Side Project X"

#### **Agents**

- **What it represents**: AI assistants with distinct personalities and capabilities
- **Underlying files**: AGENTS.md, SOUL.md per agent
- **User mental model**: "My team of helpers"
- **UX**: Agent cards with avatars, personality summaries, status indicators

#### **Conversations**

- **What it represents**: Active and historical chats with your agents
- **User mental model**: "Talking to my team"
- **UX**: ChatGPT/Claude.ai-style interface, multi-modal input, rich tool display

#### **Memories**

- **What it represents**: What your agents know and remember about you
- **User mental model**: "What they've learned about me"
- **UX**: Browsable memory cards, search, ability to edit/delete, memory timeline

---

### Tier 2: Secondary Concepts (Contextual Display)

These appear within the context of a primary concept or in dedicated views.

#### **Workstreams**

- **What it represents**: Active efforts with task hierarchies (DAG structure)
- **Shown within**: Agent detail, Goal detail
- **User mental model**: "What's being worked on"
- **UX**: ReactFlow DAG visualization, task cards, progress tracking
- **Technical**: Hierarchy of Tasks and Subtasks with dependencies

#### **Rituals**

- **What it represents**: Recurring interactions and scheduled touchpoints
- **Shown within**: Agent settings, dedicated "Routines" view
- **User mental model**: "Regular check-ins"
- **UX**: Friendly scheduling ("Every morning at 8am", "Every Monday")
- **Examples**: "Morning briefing", "Weekly review", "End of day summary"

#### **Connections**

- **What it represents**: How you reach agents + what they can access
- **Shown within**: Settings, Agent configuration
- **User mental model**: "How we communicate and what tools are available"
- **Subcategories**:
  - **Channels**: WhatsApp, Telegram, Discord, Slack, etc.
  - **Integrations**: MCP servers, OAuth services, APIs

#### **Timeline**

- **What it represents**: History of interactions, decisions, and events
- **Shown within**: Agent detail, global history view
- **User mental model**: "What's happened"
- **UX**: Chronological feed, filterable, searchable

#### **Insights**

- **What it represents**: Patterns and observations the agent has noticed
- **Shown within**: Agent detail, dashboard cards
- **User mental model**: "What they've figured out"
- **UX**: Insight cards with explanations, actionable suggestions

---

### Tier 3: Power User Concepts (Opt-in Mode)

Only visible when "Advanced Features" is enabled.

#### **Jobs**

- **What it represents**: Technical scheduled tasks with cron expressions
- **Relation to Rituals**: Rituals are the friendly layer; Jobs are the underlying mechanism
- **UX**: Full cron expression editor, advanced scheduling options

#### **Nodes**

- **What it represents**: Paired devices and remote execution capabilities
- **UX**: Device list, capability configuration, command allowlists

#### **Debug**

- **What it represents**: Raw system access for troubleshooting
- **UX**: RPC console, event streams, raw logs, health metrics

#### **Raw Config**

- **What it represents**: Direct YAML/JSON editing of configuration files
- **UX**: Monaco editor with schema validation, diff view

---

## Concept Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                           YOU                                    │
│                    (Identity, Preferences)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WORKSPACES                                │
│              (Personal, Work, Project X, ...)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │  GOALS  │     │ AGENTS  │     │MEMORIES │
        └─────────┘     └─────────┘     └─────────┘
              │               │               │
              │               ▼               │
              │     ┌─────────────────┐       │
              └────▶│   WORKSTREAMS   │◀──────┘
                    │  (Task DAGs)    │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  CONVERSATIONS  │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ RITUALS │     │TIMELINE │     │INSIGHTS │
        └─────────┘     └─────────┘     └─────────┘
```

---

## Workspace Isolation

Each Workspace contains:

- Its own set of Agents (or shared agents with workspace-specific config)
- Workspace-specific Memories
- Workspace-specific Goals
- Separate Workstreams
- Independent Connections (optional - some may be global)

Users can:

- Switch between workspaces easily (dropdown or tab)
- Have a "Personal" workspace that's always present
- Create project-specific workspaces
- Archive completed project workspaces

---

## Agent ↔ Workstream Relationship

Each Agent can manage multiple Workstreams. A Workstream is:

- Tied to a Goal (optional)
- Contains a DAG of Tasks
- Has status (active, paused, completed)
- Shows progress visually

```
Agent: "Research Assistant"
├── Workstream: "Q1 Market Analysis"
│   ├── Task: Gather competitor data
│   │   ├── Subtask: Scrape pricing pages
│   │   └── Subtask: Compile feature matrices
│   ├── Task: Analyze trends
│   └── Task: Generate report
└── Workstream: "Customer Interview Synthesis"
    ├── Task: Process transcripts
    └── Task: Extract key themes
```

---

## Memory Architecture

Memories are organized in layers:

1. **Core Memories**: Fundamental facts (name, role, preferences)
2. **Episodic Memories**: Specific interactions and events
3. **Semantic Memories**: Learned patterns and generalizations
4. **Working Memory**: Current context and active considerations

**UX Approach**:

- Standard users see a simple "What [Agent] knows" view
- Power users can explore the full memory graph
- All users can edit/delete memories
- Memories show "learned from" attribution

---

## File Mapping

| Concept           | Underlying File(s)            |
| ----------------- | ----------------------------- |
| You (Identity)    | USER.md, IDENTITY.md          |
| Agent Personality | SOUL.md (per agent)           |
| Agent Definition  | AGENTS.md                     |
| Agent Tools       | TOOLS.md                      |
| Startup Config    | BOOT.md, BOOTSTRAP.md         |
| Memories          | memories/\*.md or database    |
| Rituals           | Part of config (cron section) |
| Goals             | New concept (needs storage)   |
| Workstreams       | New concept (needs storage)   |
