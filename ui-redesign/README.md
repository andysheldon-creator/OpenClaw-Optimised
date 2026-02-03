# Second Brain Platform - UI Redesign

Complete UI/UX redesign specification for a cloud-hosted AI agent management platform.

## Overview

This redesign transforms a developer-focused control panel into a **warm, approachable "Second Brain" platform** for power users and small business owners.

### Key Shifts

| From                  | To                         |
| --------------------- | -------------------------- |
| Developer-centric     | Power user friendly        |
| Information density   | Progressive disclosure     |
| Technical terminology | Human-centric language     |
| Monolithic state      | Feature-based architecture |
| Lit/Web Components    | React + Shadcn/Radix       |

---

## Documents

### Core Specifications

| Document                                                           | Description                                        |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| [00-DESIGN-BRIEF.md](./00-DESIGN-BRIEF.md)                         | Project overview, personas, goals                  |
| [01-CONCEPTUAL-MODEL.md](./01-CONCEPTUAL-MODEL.md)                 | Core concepts (You, Agents, Goals, Memories, etc.) |
| [02-INFORMATION-ARCHITECTURE.md](./02-INFORMATION-ARCHITECTURE.md) | Navigation structure, routing                      |
| [03-VIEW-SPECIFICATIONS.md](./03-VIEW-SPECIFICATIONS.md)           | Detailed wireframes for all views                  |
| [04-VIEW-COMPONENTS.md](./04-VIEW-COMPONENTS.md)                   | Reusable component library                         |
| [05-VISUAL-DESIGN.md](./05-VISUAL-DESIGN.md)                       | Colors, typography, spacing                        |
| [06-INTERACTIONS.md](./06-INTERACTIONS.md)                         | Animations, feedback patterns                      |
| [07-POWER-USER-MODE.md](./07-POWER-USER-MODE.md)                   | Advanced features specification                    |

### Development Guidelines

| Document                                           | Description                                                     |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [CLAUDE.md](./CLAUDE.md)                           | Comprehensive development guidelines, patterns, and quick start |
| [COMPONENT-LIBRARIES.md](./COMPONENT-LIBRARIES.md) | Research on external component libraries to leverage            |

### Magic MCP Inspiration

Component inspiration and code from the 21st.dev Magic MCP server:

| Directory                                                      | Contents                                           |
| -------------------------------------------------------------- | -------------------------------------------------- |
| [magic/chat-components/](./magic/chat-components/)             | Chat bubble, message list, input components        |
| [magic/dashboard-inspiration/](./magic/dashboard-inspiration/) | Dashboard layout patterns                          |
| [magic/activity-components/](./magic/activity-components/)     | Activity feed, timeline, chart components          |
| [magic/workflow-components/](./magic/workflow-components/)     | Agent Plan (task hierarchy), Workflow Builder Card |
| [magic/agent-components/](./magic/agent-components/)           | AgentStatusCard with status indicators and actions |

---

## Tech Stack

| Layer          | Choice                    |
| -------------- | ------------------------- |
| Framework      | React 19                  |
| Build          | Vite                      |
| Styling        | Tailwind CSS 4            |
| Components     | Shadcn/ui + Radix         |
| State (server) | TanStack Query v5         |
| State (client) | Zustand                   |
| Forms          | React Hook Form + Zod     |
| Routing        | TanStack Router           |
| Icons          | Lucide React              |
| Workflow Viz   | ReactFlow (from Crabwalk) |
| Animation      | Framer Motion             |

---

## Views Overview

### Standard User (9 main views)

1. **Home** - Dashboard with agents, workstreams, rituals
2. **Conversations** - Chat list and individual chats
3. **Goals** - High-level aspirations tracking
4. **Memories** - Browsable knowledge base
5. **You** - Identity, values, preferences editor
6. **Agents** - Agent gallery and configuration
7. **Workstreams** - Task DAG visualization
8. **Rituals** - Scheduled interactions
9. **Connections** - Channels and integrations

### Power User Additions (4 views)

10. **Debug** - Health, RPC, events, logs
11. **Filesystem** - File browser and editor
12. **Jobs** - Full cron management
13. **Nodes** - Device pairing

---

## Core Concepts

```
App (Second Brain)
├── You (Identity, Values, Preferences)
├── Goals (Aspirations)
├── Memories (Knowledge)
└── Team
    ├── Agents (AI Assistants)
    ├── Rituals (Scheduled Interactions)
    └── Workspaces (Contexts)
        └── Workstreams (Task DAGs)
```

---

## Design Principles

1. **Warm over cold** - Soft colors, rounded corners, friendly shadows
2. **Progressive disclosure** - Simple surface, power underneath
3. **Human language** - "Rituals" not "Cron Jobs"
4. **Immediate feedback** - Every action acknowledged
5. **Dark mode first** - Not an afterthought
6. **Accessible by default** - WCAG AA compliant

---

## Implementation Parallelization

The [04-VIEW-COMPONENTS.md](./04-VIEW-COMPONENTS.md) document is designed for parallel development:

**Week 1-2: Foundation**

- AppShell, Sidebar, PageHeader (Foundation Team)
- StatusBadge, EntityCard, MetricCard (Data Display Team)

**Week 2-3: Features**

- FormSection, MarkdownEditor, SchedulePicker (Forms Team)
- ChatMessage, ChatInput, ChatThread (Chat Team)
- WorkflowCanvas, TaskNode (Workflow Team)

**Week 3-4: Domain**

- Agent components
- Memory components
- Goal components
- Connection components

---

## Getting Started

1. Review [00-DESIGN-BRIEF.md](./00-DESIGN-BRIEF.md) for project context
2. Study [01-CONCEPTUAL-MODEL.md](./01-CONCEPTUAL-MODEL.md) for core concepts
3. Reference [03-VIEW-SPECIFICATIONS.md](./03-VIEW-SPECIFICATIONS.md) for specific views
4. Use [04-VIEW-COMPONENTS.md](./04-VIEW-COMPONENTS.md) when building components
5. Apply [05-VISUAL-DESIGN.md](./05-VISUAL-DESIGN.md) for styling
6. Implement [06-INTERACTIONS.md](./06-INTERACTIONS.md) for animations

---

## References

- [Crabwalk](https://github.com/luccast/crabwalk) - ReactFlow workflow visualization
- [Shadcn/ui](https://ui.shadcn.com/) - Component library
- [Radix UI](https://www.radix-ui.com/) - Headless primitives
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first styling
- [TanStack](https://tanstack.com/) - Query, Router
