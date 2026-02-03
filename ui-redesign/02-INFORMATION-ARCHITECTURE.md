# Information Architecture - Second Brain Platform

## Navigation Philosophy

The navigation is organized around **human mental models**, not technical concepts:

- "Your Brain" = personal identity and knowledge
- "Team" = the agents that help you and their work
- Workspaces scope work context, not the entire app

---

## Hierarchy Model

```
App (Second Brain - your whole system)
├── Your Brain (personal, cross-cutting)
│   ├── You (identity, preferences)
│   ├── Goals (aspirations)
│   └── Memories (knowledge base)
│
└── Team (your agent collective)
    ├── Agents (team members - not workspace-scoped)
    ├── Rituals (scheduled interactions)
    └── Workspaces (switchable contexts)
        ├── Workspace A: "Q1 Launch"
        │   └── Workstreams (active task DAGs)
        ├── Workspace B: "Client Projects"
        │   └── Workstreams
        └── Workspace C: "Personal"
            └── Workstreams
```

### Key Insight: Scoping Rules

| Concept        | Scope       | Rationale                                    |
| -------------- | ----------- | -------------------------------------------- |
| You (Identity) | Global      | You're the same person everywhere            |
| Goals          | Global      | Aspirations span contexts                    |
| Memories       | Mixed       | Some global, some workspace-specific         |
| Agents         | Team-level  | Agents work across workspaces                |
| Workstreams    | Workspace   | Active work is context-specific              |
| Rituals        | Agent-level | Scheduled per-agent, may reference workspace |
| Connections    | Global      | Channels/integrations are system-wide        |

---

## Primary Navigation (Sidebar)

### Standard User View

```
┌─────────────────────────────────────────┐
│                                         │
│  [Logo] Second Brain     🌙/☀️          │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  🏠  Home                               │
│  💬  Conversations                      │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  YOUR BRAIN                             │
│  ├── 🎯  Goals                          │
│  ├── 🧠  Memories                       │
│  └── 👤  You                            │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  TEAM                                   │
│  ├── 🤖  Agents                         │
│  ├── 📋  Workstreams                    │
│  ├── 🔄  Rituals                        │
│  │                                      │
│  └── ┌────────────────────────────┐     │
│      │ 📂 Workspace: Q1 Launch ▼ │     │
│      └────────────────────────────┘     │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  ⚙️  Settings                           │
│  🔌  Connections                        │
│                                         │
└─────────────────────────────────────────┘
```

### Power User Additions

When "Advanced Features" is enabled:

```
│  ─────────────────────────────────────  │
│                                         │
│  ADVANCED                               │
│  ├── 📊  Debug                          │
│  ├── 📁  Filesystem                     │
│  ├── ⏰  Jobs                           │
│  └── 💻  Nodes                          │
```

---

## Route Structure

### Core Routes

```
/                           → Home (Dashboard)
/chat                       → New conversation (agent picker)
/chat/:agentId              → Conversation with specific agent
/chat/:agentId/:sessionId   → Resume specific session
```

### Your Brain Routes

```
/goals                      → Goals overview grid
/goals/new                  → Create new goal
/goals/:goalId              → Goal detail (linked workstreams, progress)

/memories                   → Memory browser (cards, search)
/memories/search            → Full memory search
/memories/:memoryId         → Memory detail/edit

/you                        → Profile overview
/you/identity               → Identity editor (IDENTITY.md)
/you/values                 → Values exploration wizard
/you/preferences            → Communication style, preferences
/you/about                  → Bio, background (USER.md)
```

### Team Routes

```
/agents                     → Agent gallery (cards)
/agents/new                 → Create new agent
/agents/:agentId            → Agent detail view
/agents/:agentId/soul       → Personality editor (SOUL.md)
/agents/:agentId/tools      → Tools configuration
/agents/:agentId/settings   → Agent settings

/workstreams                → All workstreams (current workspace)
/workstreams/:streamId      → Workstream DAG view (ReactFlow)
/workstreams/:streamId/tasks → Task list view

/rituals                    → Rituals overview
/rituals/new                → Create ritual wizard
/rituals/:ritualId          → Ritual detail/edit
```

### Workspace Routes

```
/workspaces                 → Workspace manager
/workspaces/new             → Create workspace
/workspaces/:workspaceId    → Switch to workspace (redirect to home)
/workspaces/:workspaceId/settings → Workspace settings
```

### Settings Routes

```
/settings                   → Settings overview
/settings/appearance        → Theme, density, layout
/settings/notifications     → Alert preferences
/settings/advanced          → Power user toggle, experimental features
/settings/account           → Account management, billing (cloud)
/settings/export            → Data export

/connections                → Connections overview
/connections/channels       → Messaging channels
/connections/channels/:id   → Channel configuration
/connections/integrations   → MCP servers, OAuth apps
/connections/integrations/new → Add integration
```

### Power User Routes (when enabled)

```
/debug                      → Debug dashboard
/debug/rpc                  → RPC console
/debug/events               → Event stream
/debug/logs                 → Raw logs viewer
/debug/health               → Health metrics

/filesystem                 → File browser
/filesystem/*path           → Navigate filesystem

/jobs                       → Cron job manager
/jobs/new                   → Create job (full cron)
/jobs/:jobId                → Job detail

/nodes                      → Paired devices
/nodes/pair                 → Pair new device
/nodes/:nodeId              → Node configuration
```

---

## Navigation Patterns

### Workspace Switching

The workspace switcher appears in the Team section:

- Click to open dropdown
- Shows all workspaces with status indicators
- "Create new workspace" at bottom
- Current workspace highlighted
- Switching workspace updates:
  - Workstreams view
  - Context-specific memories
  - Active work state

### Quick Navigation

**Command Palette** (Cmd+K):

- Search across all concepts
- Quick actions ("New agent", "Start conversation")
- Recent items
- Keyboard-first navigation

**Breadcrumbs**:

- Shown in main content area
- Context-aware (Agent > Soul, Goal > Workstream)
- Clickable for navigation

### Mobile Navigation

On mobile:

- Bottom tab bar with 4-5 primary items
- "More" tab for secondary navigation
- Swipe gestures for workspace switching
- Full-screen views, no sidebar

```
┌─────────────────────────────────────────┐
│                                         │
│              [Content Area]             │
│                                         │
├─────────────────────────────────────────┤
│  🏠    💬    🤖    🧠    •••           │
│ Home  Chat  Agents Memory More          │
└─────────────────────────────────────────┘
```

---

## Responsive Breakpoints

| Breakpoint | Width       | Layout                             |
| ---------- | ----------- | ---------------------------------- |
| Desktop XL | > 1400px    | Sidebar + content + optional panel |
| Desktop    | 1024-1400px | Sidebar + content                  |
| Tablet     | 768-1023px  | Collapsible sidebar or top nav     |
| Mobile     | < 768px     | Bottom nav, full-screen views      |

### Layout Modes

**Standard (Desktop)**:

```
┌──────────┬─────────────────────────────────┐
│          │                                 │
│ Sidebar  │         Main Content            │
│  240px   │                                 │
│          │                                 │
└──────────┴─────────────────────────────────┘
```

**With Detail Panel (Desktop XL)**:

```
┌──────────┬───────────────────────┬─────────┐
│          │                       │         │
│ Sidebar  │    Main Content       │ Detail  │
│  240px   │                       │  320px  │
│          │                       │         │
└──────────┴───────────────────────┴─────────┘
```

**Collapsed Sidebar (Tablet)**:

```
┌────┬────────────────────────────────────────┐
│    │                                        │
│ 64 │           Main Content                 │
│ px │                                        │
│    │                                        │
└────┴────────────────────────────────────────┘
```

---

## Deep Linking

All views should support deep linking:

- Share links to specific agents, goals, memories
- Bookmarkable states (filters, search queries)
- URL reflects full navigation path

Examples:

- `/agents/assistant-1/soul` → Direct to personality editor
- `/workstreams/ws-123?view=dag` → Workstream in DAG mode
- `/memories?search=project+alpha` → Memory search results
