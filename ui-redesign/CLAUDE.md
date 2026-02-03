# Second Brain Platform - UI Development Guidelines

This document provides comprehensive guidelines for developing the Second Brain platform UI.

---

## Project Overview

**Second Brain** is a cloud-hosted AI agent management platform designed for power users and small business owners. The UI transforms a developer-focused control panel into a warm, approachable experience with progressive disclosure for advanced features.

### Core Philosophy

- **Warm over cold** - Soft colors, rounded corners, friendly shadows
- **Progressive disclosure** - Simple surface, power underneath
- **Human language** - "Rituals" not "Cron Jobs", "Memories" not "Vector Store"
- **Immediate feedback** - Every action acknowledged within 100ms
- **Dark mode first** - Not an afterthought
- **Accessible by default** - WCAG AA compliant

---

## Tech Stack

| Layer               | Technology                    | Version |
| ------------------- | ----------------------------- | ------- |
| Framework           | React                         | 19      |
| Build               | Vite                          | Latest  |
| Styling             | Tailwind CSS                  | 4       |
| Components          | shadcn/ui + Radix             | Latest  |
| Extended Components | Origin UI                     | Latest  |
| Animations          | Aceternity UI + Framer Motion | Latest  |
| State (server)      | TanStack Query                | v5      |
| State (client)      | Zustand                       | Latest  |
| Forms               | React Hook Form + Zod         | Latest  |
| Routing             | TanStack Router               | Latest  |
| Icons               | Lucide React                  | Latest  |
| Workflow Viz        | ReactFlow                     | Latest  |
| Charts              | Tremor (Recharts-based)       | Latest  |

---

## Directory Structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui base components
│   ├── primitives/            # Extended primitives (Origin UI adapted)
│   ├── composed/              # Multi-component compositions
│   └── domain/                # Feature-specific components
│       ├── agents/
│       ├── chat/
│       ├── goals/
│       ├── memories/
│       ├── rituals/
│       ├── workstreams/
│       └── you/
├── features/                  # Feature modules (co-located)
│   ├── home/
│   ├── conversations/
│   ├── agents/
│   ├── goals/
│   ├── memories/
│   ├── you/
│   ├── workstreams/
│   ├── rituals/
│   ├── connections/
│   └── power-user/            # Debug, Filesystem, Jobs, Nodes
├── hooks/                     # Custom hooks
├── lib/                       # Utilities, API clients
├── stores/                    # Zustand stores
└── styles/                    # Global styles, theme
```

---

## Component Guidelines

### 1. Use Existing Libraries First

**Priority order for components:**

1. **shadcn/ui** - Base components (Button, Card, Dialog, etc.)
2. **Origin UI** - Extended components (400+ available)
3. **Aceternity UI** - Animated effects, hover states
4. **Magic MCP captured** - See `magic/` directory for inspiration
5. **Custom build** - Only when nothing fits

### 2. Magic MCP Components Available

Reference these captured components in `ui-redesign/magic/`:

| Directory                | Components                                               |
| ------------------------ | -------------------------------------------------------- |
| `chat-components/`       | ChatBubble, ChatMessageList, ChatInput, useAutoScroll    |
| `activity-components/`   | ActivityChartCard, ActivityDropdown, DashboardActivities |
| `workflow-components/`   | AgentPlan (task hierarchy), WorkflowBuilderCard          |
| `agent-components/`      | AgentStatusCard (expanded/compact variants)              |
| `dashboard-inspiration/` | Raw dashboard patterns (JSON)                            |

### 3. Component Anatomy

```tsx
// components/domain/agents/AgentCard.tsx
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/primitives/StatusBadge";

interface AgentCardProps {
  agent: Agent;
  variant?: "expanded" | "compact";
  onSelect?: () => void;
  className?: string;
}

export function AgentCard({ agent, variant = "expanded", onSelect, className }: AgentCardProps) {
  // Component implementation
}
```

### 4. Animation Standards

Use Framer Motion with these patterns:

```tsx
// Standard enter animation
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] },
  },
};

// Stagger children
const listVariants = {
  visible: {
    transition: { staggerChildren: 0.05 },
  },
};

// Respect reduced motion
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

### 5. Status Indicators

Consistent status colors across the app:

| Status          | Color             | Animation     |
| --------------- | ----------------- | ------------- |
| Active/Online   | `text-green-500`  | Pulsing dot   |
| Idle/Ready      | `text-gray-500`   | Solid         |
| Busy/Processing | `text-yellow-500` | Spinning icon |
| Error           | `text-red-500`    | Solid         |
| Paused          | `text-orange-500` | Solid         |

---

## Color System

Use CSS variables from `05-VISUAL-DESIGN.md`:

```css
/* Warm color palette - Dark mode first */
:root {
  --background: 240 10% 4%; /* Near black with warmth */
  --foreground: 60 10% 98%; /* Warm white */
  --primary: 25 95% 60%; /* Warm orange */
  --secondary: 240 5% 16%; /* Elevated surface */
  --accent: 280 60% 65%; /* Purple accent */
  --muted: 240 5% 26%;
  --success: 142 76% 46%; /* Green */
  --warning: 38 92% 50%; /* Amber */
  --error: 0 84% 60%; /* Red */
}
```

---

## View Implementation

### Standard User Views (9)

1. **Home** (`/`) - Dashboard with agents, workstreams, rituals
2. **Conversations** (`/conversations`) - Chat list
3. **Chat** (`/conversations/:id`) - Individual chat thread
4. **Goals** (`/goals`) - High-level aspirations
5. **Memories** (`/memories`) - Knowledge base browser
6. **You** (`/you`) - Identity, values, preferences
7. **Agents** (`/agents`) - Agent gallery
8. **Workstreams** (`/workstreams`) - Task DAG visualization
9. **Rituals** (`/rituals`) - Scheduled interactions

### Power User Views (4)

Gated behind `isPowerUser` flag:

10. **Debug** (`/debug`) - Health, RPC, events, logs
11. **Filesystem** (`/filesystem`) - File browser
12. **Jobs** (`/jobs`) - Cron management
13. **Nodes** (`/nodes`) - Device pairing

### Power User Implementation

```tsx
const { isPowerUser } = useUserPreferences();

// Conditional navigation
{
  isPowerUser && (
    <SidebarSection title="ADVANCED">
      <NavItem to="/debug" icon={Terminal} />
      <NavItem to="/filesystem" icon={Folder} />
      <NavItem to="/jobs" icon={Clock} />
      <NavItem to="/nodes" icon={Monitor} />
    </SidebarSection>
  );
}

// Conditional features within views
{
  isPowerUser && <TabsTrigger value="raw">Raw Markdown</TabsTrigger>;
}
```

---

## Form Patterns

### React Hook Form + Zod

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  personality: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function AgentForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", personality: "" },
  });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}
```

---

## Data Fetching

### TanStack Query Patterns

```tsx
// hooks/useAgents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agents", id],
    queryFn: () => api.getAgent(id),
    enabled: !!id,
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAgentInput) => api.updateAgent(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.id] });
      toast.success("Agent updated");
    },
    onError: () => {
      toast.error("Failed to update agent");
    },
  });
}
```

---

## State Management

### Zustand for Client State

```tsx
// stores/useUIStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  powerUserMode: boolean;
  theme: "light" | "dark" | "system";
  toggleSidebar: () => void;
  setPowerUserMode: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      powerUserMode: false,
      theme: "dark",
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPowerUserMode: (enabled) => set({ powerUserMode: enabled }),
    }),
    { name: "ui-preferences" },
  ),
);
```

---

## Keyboard Shortcuts

Implement these global shortcuts:

| Shortcut      | Action                  |
| ------------- | ----------------------- |
| `Cmd+K`       | Open command palette    |
| `Cmd+N`       | New conversation        |
| `Cmd+\`       | Toggle sidebar          |
| `Cmd+Shift+D` | Toggle dark mode        |
| `Cmd+Shift+P` | Toggle power user mode  |
| `?`           | Show keyboard shortcuts |

---

## Accessibility Checklist

- [ ] All interactive elements have focus states
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Form inputs have associated labels
- [ ] Error messages are announced to screen readers
- [ ] Keyboard navigation works for all features
- [ ] Reduced motion is respected
- [ ] Focus trapping in modals/dialogs

---

## Testing Strategy

```bash
# Unit tests for components
pnpm test

# E2E tests for critical flows
pnpm test:e2e

# Accessibility tests
pnpm test:a11y

# Visual regression
pnpm test:visual
```

---

## Performance Guidelines

1. **Lazy load routes** - Use TanStack Router's lazy loading
2. **Virtualize long lists** - Use `@tanstack/react-virtual` for chat, memories
3. **Memoize expensive renders** - Use `React.memo` for list items
4. **Optimize images** - Use next-gen formats, lazy loading
5. **Bundle splitting** - Keep initial bundle under 200KB gzipped

---

## Documentation References

| Document                         | Purpose                       |
| -------------------------------- | ----------------------------- |
| `00-DESIGN-BRIEF.md`             | Project overview, personas    |
| `01-CONCEPTUAL-MODEL.md`         | Core concepts hierarchy       |
| `02-INFORMATION-ARCHITECTURE.md` | Navigation, routing           |
| `03-VIEW-SPECIFICATIONS.md`      | Wireframes for all views      |
| `04-VIEW-COMPONENTS.md`          | Component library spec        |
| `05-VISUAL-DESIGN.md`            | Colors, typography, spacing   |
| `06-INTERACTIONS.md`             | Animations, feedback patterns |
| `07-POWER-USER-MODE.md`          | Advanced features spec        |
| `COMPONENT-LIBRARIES.md`         | External library research     |

---

## Quick Start Commands

```bash
# Initialize project
pnpm create vite@latest second-brain --template react-ts
cd second-brain

# Install core dependencies
pnpm add react@19 react-dom@19
pnpm add tailwindcss@4 @tailwindcss/vite
pnpm add @tanstack/react-query @tanstack/react-router
pnpm add zustand react-hook-form @hookform/resolvers zod
pnpm add framer-motion lucide-react
pnpm add @reactflow/core @reactflow/background @reactflow/controls

# Install shadcn/ui
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog input tabs toast

# Run development server
pnpm dev
```

---

## Commit Message Format

```
feat(agents): add AgentStatusCard component with status animations
fix(chat): resolve auto-scroll not triggering on new messages
style(theme): update warm color palette for dark mode
refactor(forms): migrate to React Hook Form + Zod
docs(readme): add component library research
```

---

## Before Shipping Checklist

- [ ] All views implemented per `03-VIEW-SPECIFICATIONS.md`
- [ ] Color system matches `05-VISUAL-DESIGN.md`
- [ ] Animations follow `06-INTERACTIONS.md` patterns
- [ ] Power user mode works per `07-POWER-USER-MODE.md`
- [ ] Keyboard shortcuts implemented
- [ ] Accessibility audit passed
- [ ] Performance budget met (< 200KB initial)
- [ ] Dark mode tested thoroughly
- [ ] Mobile responsive (320px - 1440px+)
