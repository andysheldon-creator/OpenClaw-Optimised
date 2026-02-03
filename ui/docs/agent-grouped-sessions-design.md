# Agent-Grouped Sessions View Design

## Overview

This document captures the complete design specification for implementing a hierarchical, agent-grouped sessions view. It includes UI/UX patterns from 21st.dev, a complete React component implementation, and expert analysis for adapting to our Lit-based web UI.

---

## Part 1: UI/UX Inspiration from 21st.dev

### Pattern 1: Expandable Card Component

**Demo Code:**

```tsx
// FILE: src/demos/expandable-card-demo.tsx
"use client";

import React, { useState } from "react";
import {
  Battery,
  Bluetooth,
  Calendar,
  Clock,
  Cloud,
  Droplets,
  Fingerprint,
  MapPin,
  MessageSquare,
  Mic,
  ShoppingCart,
  Star,
  Sun,
  Users,
  Video,
  Wind,
} from "lucide-react";
import { motion as framerMotion } from "framer-motion";

import {
  Component,
  ExpandableCard,
  ExpandableCardContent,
  ExpandableCardFooter,
  ExpandableCardHeader,
  ExpandableContent,
  ExpandableTrigger,
} from "@/components/ui/expandable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function DesignSyncExample() {
  return (
    <Component expandDirection="both" expandBehavior="replace" initialDelay={0.2}>
      {({ isExpanded }) => (
        <ExpandableTrigger>
          <ExpandableCard
            className="w-full relative"
            collapsedSize={{ width: 320, height: 240 }}
            expandedSize={{ width: 420, height: 480 }}
            hoverToExpand={false}
            expandDelay={200}
            collapseDelay={500}
          >
            <ExpandableCardHeader>
              <div className="flex justify-between items-start w-full">
                <div>
                  <Badge
                    variant="secondary"
                    className="bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-100 mb-2"
                  >
                    In 15 mins
                  </Badge>
                  <h3 className="font-semibold text-xl text-gray-800 dark:text-white">
                    Design Sync
                  </h3>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="outline" className="h-8 w-8">
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add to Calendar</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </ExpandableCardHeader>

            <ExpandableCardContent>
              <div className="flex flex-col items-start justify-between mb-4">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>1:30PM → 2:30PM</span>
                </div>

                <ExpandableContent preset="blur-md">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>Conference Room A</span>
                  </div>
                </ExpandableContent>
              </div>
              <ExpandableContent preset="blur-md" stagger staggerChildren={0.2}>
                <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">
                  Weekly design sync to discuss ongoing projects, share updates, and address any
                  design-related challenges.
                </p>
                <div className="mb-4">
                  <h4 className="font-medium text-sm text-gray-800 dark:text-gray-100 mb-2 flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Attendees:
                  </h4>
                  <div className="flex -space-x-2 overflow-hidden">
                    {["Alice", "Bob", "Charlie", "David"].map((name, index) => (
                      <TooltipProvider key={index}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="border-2 border-white dark:border-gray-800">
                              <AvatarImage
                                src={`/placeholder.svg?height=32&width=32&text=${name[0]}`}
                                alt={name}
                              />
                              <AvatarFallback>{name[0]}</AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Button className="w-full bg-red-600 hover:bg-red-700 text-white">
                    <Video className="h-4 w-4 mr-2" />
                    Join Meeting
                  </Button>
                  {isExpanded && (
                    <Button variant="outline" className="w-full">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Open Chat
                    </Button>
                  )}
                </div>
              </ExpandableContent>
            </ExpandableCardContent>
            <ExpandableContent preset="slide-up">
              <ExpandableCardFooter>
                <div className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-300">
                  <span>Weekly</span>
                  <span>Next: Mon, 10:00 AM</span>
                </div>
              </ExpandableCardFooter>
            </ExpandableContent>
          </ExpandableCard>
        </ExpandableTrigger>
      )}
    </Component>
  );
}
```

**Key Design Insights:**

- Uses Framer Motion for smooth expand/collapse animations
- `ExpandableContent` with presets like "blur-md" for content that appears on expansion
- `stagger` and `staggerChildren` for sequential reveal animations
- Badge for status/category indicators
- Avatar stacking for group indicators
- Primary action always visible, secondary actions appear on expand

---

### Pattern 2: Hierarchical Tree Structure

**Demo Code:**

```tsx
"use client";

import React from "react";
import { Tree, TreeItem, TreeItemLabel } from "@/components/ui/tree";
import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";

interface Item {
  name: string;
  children?: string[];
}

const items: Record<string, Item> = {
  crm: {
    name: "CRM",
    children: ["leads", "accounts", "activities", "support"],
  },
  leads: {
    name: "Leads",
    children: ["new-lead", "contacted-lead", "qualified-lead"],
  },
  "new-lead": { name: "New Lead" },
  "contacted-lead": { name: "Contacted Lead" },
  "qualified-lead": { name: "Qualified Lead" },
  // ... more items
};

export default function Component() {
  const tree = useTree<Item>({
    initialState: {
      expandedItems: ["leads", "accounts", "activities"],
    },
    indent: 20,
    rootItemId: "crm",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
    dataLoader: {
      getItem: (itemId) => items[itemId],
      getChildren: (itemId) => items[itemId].children ?? [],
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  return (
    <div className="flex flex-col gap-5 p-10 w-full mx-auto max-w-[300px] h-screen">
      <Tree indent={indent} tree={tree}>
        {tree.getItems().map((item) => (
          <TreeItem key={item.getId()} item={item}>
            <TreeItemLabel />
          </TreeItem>
        ))}
      </Tree>
    </div>
  );
}
```

**Tree Component Code:**

```tsx
interface TreeContextValue<T = any> {
  indent: number;
  currentItem?: ItemInstance<T>;
  tree?: any;
  toggleIconType?: ToggleIconType;
}

const TreeContext = React.createContext<TreeContextValue>({
  indent: 20,
  toggleIconType: "chevron",
});

function Tree({ indent = 20, tree, className, toggleIconType = "chevron", ...props }) {
  return (
    <TreeContext.Provider value={{ indent, tree, toggleIconType }}>
      <div
        style={{ "--tree-indent": `${indent}px` }}
        className={cn("flex flex-col", className)}
        {...props}
      />
    </TreeContext.Provider>
  );
}

function TreeItem<T>({ item, className, ...props }) {
  const { indent } = useTreeContext<T>();
  const itemProps = item.getProps();

  return (
    <TreeContext.Provider value={{ ...parentContext, currentItem: item }}>
      <button
        style={{ "--tree-padding": `${item.getItemMeta().level * indent}px` }}
        className={cn(
          "ps-(--tree-padding) outline-hidden select-none focus:z-20",
          "data-[folder=true]:folder-indicator",
        )}
        aria-expanded={item.isExpanded()}
        {...itemProps}
      >
        {children}
      </button>
    </TreeContext.Provider>
  );
}
```

**Key Design Insights:**

- Hierarchical indentation based on level
- Folder vs leaf item distinction
- Toggle icons (chevron or plus/minus) for expand/collapse
- Keyboard navigation support
- Accessibility with proper ARIA attributes
- Data loader pattern for lazy loading

---

### Pattern 3: Grouped Listbox

**Demo Code:**

```tsx
"use client";

import { Listbox, createListCollection } from "@ark-ui/react/listbox";
import { Check } from "lucide-react";

export default function WithGroups() {
  const collection = createListCollection({
    items: [
      { label: "React", value: "react", category: "Frontend Frameworks" },
      { label: "Vue", value: "vue", category: "Frontend Frameworks" },
      { label: "Angular", value: "angular", category: "Frontend Frameworks" },
      { label: "Svelte", value: "svelte", category: "Frontend Frameworks" },
      { label: "Node.js", value: "nodejs", category: "Backend" },
      { label: "Express", value: "express", category: "Backend" },
      { label: "FastAPI", value: "fastapi", category: "Backend" },
      { label: "Django", value: "django", category: "Backend" },
      { label: "PostgreSQL", value: "postgresql", category: "Databases" },
      { label: "MongoDB", value: "mongodb", category: "Databases" },
      { label: "Redis", value: "redis", category: "Databases" },
      { label: "MySQL", value: "mysql", category: "Databases" },
    ],
    groupBy: (item) => item.category,
  });

  return (
    <div className="flex items-center justify-center min-h-32">
      <Listbox.Root collection={collection}>
        <Listbox.Label>Select technologies</Listbox.Label>
        <Listbox.Content className="bg-white border rounded-lg px-1 py-2 w-72">
          {collection.group().map(([category, items]) => (
            <Listbox.ItemGroup key={category}>
              <Listbox.ItemGroupLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                {category}
              </Listbox.ItemGroupLabel>
              {items.map((item) => (
                <Listbox.Item
                  key={item.value}
                  item={item}
                  className="flex items-center justify-between px-3 py-2 mx-1 rounded-md hover:bg-gray-100 data-selected:bg-blue-50"
                >
                  <Listbox.ItemText>{item.label}</Listbox.ItemText>
                  <Listbox.ItemIndicator>
                    <Check className="w-4 h-4 text-blue-600" />
                  </Listbox.ItemIndicator>
                </Listbox.Item>
              ))}
              <div className="h-1" />
            </Listbox.ItemGroup>
          ))}
        </Listbox.Content>
      </Listbox.Root>
    </div>
  );
}
```

**Key Design Insights:**

- Group-by function for categorization
- Category headers with uppercase styling
- Spacer between groups
- Selection indicator (Check icon)
- Hover and selected states

---

## Part 2: Complete React Component Implementation

### Installation

```bash
npm install framer-motion lucide-react @radix-ui/react-slot class-variance-authority clsx tailwind-merge
```

### Styles (Tailwind v4)

```css
/* index.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --primary: oklch(0.205 0 0);
  --accent: oklch(0.97 0 0);
  --destructive: oklch(0.577 0.245 27.325);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --destructive: oklch(0.704 0.191 22.216);
}
```

### Utility: lib/utils.ts

```tsx
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Component: components/ui/badge.tsx

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
```

### Main Component: App.tsx

```tsx
"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Clock, User, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Type definitions
interface Session {
  id: string;
  title: string;
  timestamp: string;
  status: "active" | "completed" | "failed" | "pending";
  duration?: string;
  messages?: number;
}

interface AgentGroup {
  id: string;
  name: string;
  icon?: React.ReactNode;
  sessions: Session[];
}

interface HierarchicalSessionsListProps {
  agentGroups?: AgentGroup[];
  className?: string;
}

// Default data
const defaultAgentGroups: AgentGroup[] = [
  {
    id: "agent-1",
    name: "Customer Support Agent",
    icon: <User className="h-4 w-4" />,
    sessions: [
      {
        id: "session-1-1",
        title: "Product inquiry - Premium subscription",
        timestamp: "2 minutes ago",
        status: "active",
        duration: "5m 23s",
        messages: 12,
      },
      {
        id: "session-1-2",
        title: "Billing question - Invoice #1234",
        timestamp: "1 hour ago",
        status: "completed",
        duration: "8m 45s",
        messages: 18,
      },
      {
        id: "session-1-3",
        title: "Technical support - Login issues",
        timestamp: "3 hours ago",
        status: "completed",
        duration: "12m 10s",
        messages: 24,
      },
      {
        id: "session-1-4",
        title: "Feature request - API integration",
        timestamp: "Yesterday",
        status: "completed",
        duration: "15m 32s",
        messages: 31,
      },
    ],
  },
  {
    id: "agent-2",
    name: "Sales Assistant",
    icon: <Activity className="h-4 w-4" />,
    sessions: [
      {
        id: "session-2-1",
        title: "Demo request - Enterprise plan",
        timestamp: "30 minutes ago",
        status: "active",
        duration: "3m 15s",
        messages: 8,
      },
      {
        id: "session-2-2",
        title: "Pricing inquiry - Team plan",
        timestamp: "2 hours ago",
        status: "completed",
        duration: "6m 42s",
        messages: 14,
      },
      {
        id: "session-2-3",
        title: "Contract negotiation",
        timestamp: "5 hours ago",
        status: "failed",
        duration: "2m 18s",
        messages: 5,
      },
    ],
  },
  {
    id: "agent-3",
    name: "Technical Documentation",
    icon: <Clock className="h-4 w-4" />,
    sessions: [
      {
        id: "session-3-1",
        title: "API documentation review",
        timestamp: "15 minutes ago",
        status: "pending",
        messages: 3,
      },
      {
        id: "session-3-2",
        title: "Integration guide update",
        timestamp: "4 hours ago",
        status: "completed",
        duration: "20m 05s",
        messages: 42,
      },
    ],
  },
];

const getStatusColor = (status: Session["status"]) => {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 border-green-200";
    case "completed":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "failed":
      return "bg-red-100 text-red-700 border-red-200";
    case "pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getStatusDot = (status: Session["status"]) => {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "completed":
      return "bg-blue-500";
    case "failed":
      return "bg-red-500";
    case "pending":
      return "bg-yellow-500";
    default:
      return "bg-muted-foreground";
  }
};

function HierarchicalSessionsList({
  agentGroups = defaultAgentGroups,
  className,
}: HierarchicalSessionsListProps) {
  const [expandedAgents, setExpandedAgents] = useState<string[]>([]);

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      {agentGroups.map((agent) => {
        const isExpanded = expandedAgents.includes(agent.id);
        const mostRecentSession = agent.sessions[0];
        const historicalSessions = agent.sessions.slice(1);

        return (
          <div key={agent.id} className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Agent Header */}
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
                    {agent.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {agent.sessions.length} session
                      {agent.sessions.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                {historicalSessions.length > 0 && (
                  <motion.button
                    onClick={() => toggleAgent(agent.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-xs font-medium">
                      {isExpanded ? "Hide" : "Show"} history
                    </span>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </motion.div>
                  </motion.button>
                )}
              </div>
            </div>

            {/* Most Recent Session */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cn("w-2 h-2 rounded-full", getStatusDot(mostRecentSession.status))}
                    />
                    <h4 className="font-medium text-foreground truncate">
                      {mostRecentSession.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {mostRecentSession.timestamp}
                    </span>
                    {mostRecentSession.duration && (
                      <span>Duration: {mostRecentSession.duration}</span>
                    )}
                    {mostRecentSession.messages && (
                      <span>{mostRecentSession.messages} messages</span>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize text-xs font-medium",
                    getStatusColor(mostRecentSession.status),
                  )}
                >
                  {mostRecentSession.status}
                </Badge>
              </div>
            </div>

            {/* Historical Sessions */}
            <AnimatePresence>
              {isExpanded && historicalSessions.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border bg-muted/10">
                    <div className="px-4 py-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        History
                      </p>
                    </div>
                    <div className="divide-y divide-border">
                      {historicalSessions.map((session, index) => (
                        <motion.div
                          key={session.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.2,
                            delay: index * 0.05,
                          }}
                          className="px-4 py-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    getStatusDot(session.status),
                                  )}
                                />
                                <h5 className="text-sm text-foreground truncate">
                                  {session.title}
                                </h5>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {session.timestamp}
                                </span>
                                {session.duration && <span>{session.duration}</span>}
                                {session.messages && <span>{session.messages} messages</span>}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize text-xs font-medium shrink-0",
                                getStatusColor(session.status),
                              )}
                            >
                              {session.status}
                            </Badge>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function Demo() {
  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Agent Sessions</h1>
          <p className="text-muted-foreground">
            View and manage sessions grouped by agent with expandable history
          </p>
        </div>
        <HierarchicalSessionsList />
      </div>
    </div>
  );
}
```

---

## Part 3: Expert UI/UX Analysis

### Core Interaction Model

#### Primary Navigation (Click Agent Row)

- **Action**: Click anywhere on the agent's most recent session row
- **Result**: Navigate directly to the Chat view with that session loaded
- **Visual Feedback**: Entire row becomes clickable, hover state shows cursor change
- **Accessibility**:
  - `role="button"` or `<a>` tag with proper href
  - `aria-label="Open {agent name} session in chat"`
  - Enter/Space keyboard support

#### Secondary Action (Expand/Collapse History)

- **Action**: Click the "Show history" button or chevron icon
- **Result**: Toggle inline expansion of historical sessions
- **Visual Feedback**:
  - Chevron rotates 180° when expanded
  - Button text changes from "Show" to "Hide"
  - Smooth height animation for reveal
- **Animation**: Use cubic-bezier(0.2, 0.65, 0.3, 0.9) for natural feel
- **Accessibility**:
  - `aria-expanded` attribute on toggle button
  - `aria-controls` pointing to history section
  - Proper focus management

### Information Hierarchy

#### Agent Header (Always Visible)

1. **Agent Icon**: Visual identifier, uses primary color background
2. **Agent Name**: Bold, primary text color
3. **Session Count**: Smaller, muted text ("X sessions")
4. **History Toggle**: Right-aligned, shows only if history exists

#### Most Recent Session (Default View)

1. **Status Dot**: 2px colored circle, indicates current state
2. **Session Title**: Truncated with ellipsis, full title in tooltip
3. **Metadata Row**:
   - Clock icon + timestamp
   - Duration (if available)
   - Message count (if available)
4. **Status Badge**: Right-aligned, color-coded

#### Historical Sessions (Expanded)

1. **Section Header**: "HISTORY" label, uppercase, muted
2. **Session Items** (same structure as most recent but condensed)
3. **Hover State**: Subtle background highlight
4. **Stagger Animation**: Items fade in sequentially

### State Mapping (From Existing Sessions)

| Session Field                   | Component Display  | Notes                               |
| ------------------------------- | ------------------ | ----------------------------------- |
| `key`                           | Session ID         | Used for navigation                 |
| `displayName` or `derivedTitle` | Title              | Truncate at ~60 chars               |
| `updatedAt`                     | Timestamp          | Use `formatAgo()`                   |
| `status` (derived)              | Badge + Dot        | active/idle/completed/aborted       |
| `abortedLastRun`                | Error State        | Overrides status with "aborted"     |
| `totalTokens`                   | Token Count        | Format with `formatSessionTokens()` |
| `modelProvider` + `model`       | Model Info         | "provider · model" format           |
| `contextTokens`                 | Context Window     | "ctx {tokens}" suffix               |
| `thinkingLevel`                 | Thinking Badge     | Brain icon + level                  |
| `activeTasks`                   | Activity Indicator | Pulsing dot if in-progress          |

### Color System Mapping

| Status          | Background    | Text       | Border     |
| --------------- | ------------- | ---------- | ---------- |
| Active          | Green-100     | Green-700  | Green-200  |
| Idle            | Yellow-100    | Yellow-700 | Yellow-200 |
| Completed       | Blue/Gray-100 | Muted      | Muted      |
| Aborted/Errored | Red-100       | Red-700    | Red-200    |

Dark mode uses `dark:` prefix with inverted luminance values.

### Responsive Behavior

| Breakpoint    | Behavior                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| < 640px       | - Stack agent header (icon + name on new line)<br>- Hide "Show history" text, keep chevron<br>- Reduce padding to 12px |
| 640px - 980px | - Keep header inline<br>- Show "Show history" text<br>- Metadata wraps to 2 lines if needed                            |
| > 980px       | - Full layout with all elements<br>- History section max-width 600px                                                   |

### Keyboard Navigation

- **Tab**: Navigate between agent groups
- **Enter/Space**: Activate focused agent (navigate to chat) or toggle history
- **Arrow Keys**: Navigate within expanded history
- **Home/End**: Jump to first/last agent
- **Escape**: Collapse expanded history if focused within

### Screen Reader Support

```html
<div role="list" aria-label="Agent sessions">
  <div role="listitem" aria-labelledby="agent-{id}-name">
    <h3 id="agent-{id}-name">{agentName}</h3>
    <div role="group" aria-label="Most recent session">
      <a href="/chat?session={sessionId}" aria-label="Open session {title}"> ... </a>
    </div>
    <div role="group" aria-label="Session history" aria-expanded="{isExpanded}">...</div>
  </div>
</div>
```

---

## Part 4: Adaptation to Lit/Web Components

### Key Differences from React Version

1. **No Virtual DOM**: Lit uses direct DOM manipulation, need to manage state manually
2. **Templates**: Use `html` tagged template literal instead of JSX
3. **Reactivity**: Use `@property` decorators or `requestUpdate()` for state changes
4. **Icons**: Use existing `icon()` function from `../icons.ts`
5. **Styling**: Use existing CSS classes from `components.css`

### Component Structure

```typescript
// src/ui/components/agent-grouped-sessions.ts
import { html, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { icon } from "../icons";
import { formatAgo } from "../format";
import { formatSessionTokens } from "../presenter";
import type { GatewaySessionRow } from "../types";

// ... component implementation
```

### State Management

```typescript
@customElement("agent-grouped-sessions")
export class AgentGroupedSessions extends LitElement {
  // Input properties
  @property({ attribute: false })
  sessions: GatewaySessionRow[] = [];

  @property({ attribute: false })
  basePath: string = "";

  @property({ attribute: false })
  onSessionOpen?: (key: string) => void;

  // Internal state
  @state()
  private _expandedAgents = new Set<string>();

  // Computed property for grouping
  private _getAgentGroups() {
    const groups = new Map<string, GatewaySessionRow[]>();
    for (const session of this.sessions) {
      const agentId = this._parseAgentId(session.key);
      if (!agentId) continue;
      if (!groups.has(agentId)) {
        groups.set(agentId, []);
      }
      groups.get(agentId)!.push(session);
    }
    // Sort each group by updatedAt descending
    for (const [agentId, sessions] of groups) {
      groups.set(
        agentId,
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      );
    }
    return groups;
  }

  private _parseAgentId(key: string): string | null {
    // Extract agent ID from session key
    // Format: "agent:{agentId}:{sessionId}"
    const match = key.match(/^agent:([^:]+):/);
    return match ? match[1] : null;
  }

  private _toggleAgent(agentId: string) {
    if (this._expandedAgents.has(agentId)) {
      this._expandedAgents.delete(agentId);
    } else {
      this._expandedAgents.add(agentId);
    }
    this.requestUpdate("_expandedAgents");
  }

  private _handleSessionClick(session: GatewaySessionRow, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.onSessionOpen?.(session.key);
  }
```

### Template Rendering

```typescript
render() {
  const agentGroups = this._getAgentGroups();

  return html`
    <div class="agent-grouped-sessions">
      ${repeat(
        agentGroups.entries(),
        ([agentId]) => agentId,
        ([agentId, sessions]) => this._renderAgentGroup(agentId, sessions)
      )}
    </div>
  `;
}

private _renderAgentGroup(agentId: string, sessions: GatewaySessionRow[]) {
  const isExpanded = this._expandedAgents.has(agentId);
  const [mostRecent, ...history] = sessions;
  const hasHistory = history.length > 0;

  return html`
    <div class="agent-group">
      ${this._renderAgentHeader(agentId, sessions.length, hasHistory, isExpanded)}
      ${this._renderMostRecentSession(mostRecent)}
      ${hasHistory && isExpanded
        ? this._renderHistorySection(history)
        : nothing
      }
    </div>
  `;
}

private _renderAgentHeader(
  agentId: string,
  sessionCount: number,
  hasHistory: boolean,
  isExpanded: boolean
) {
  return html`
    <div class="agent-group__header">
      <div class="agent-group__header-main">
        <div class="agent-group__icon">
          ${icon("user", { size: 16 })}
        </div>
        <div class="agent-group__info">
          <h3 class="agent-group__name">${this._formatAgentName(agentId)}</h3>
          <p class="agent-group__meta">
            ${sessionCount} session${sessionCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      ${hasHistory
        ? html`
            <button
              class="agent-group__toggle"
              aria-label="${isExpanded ? "Hide" : "Show"} session history"
              aria-expanded="${isExpanded}"
              @click=${() => this._toggleAgent(agentId)}
            >
              <span class="agent-group__toggle-text">
                ${isExpanded ? "Hide" : "Show"} history
              </span>
              <span class="agent-group__toggle-chevron ${classMap({ "agent-group__toggle-chevron--expanded": isExpanded })}">
                ${icon("chevron-down", { size: 14 })}
              </span>
            </button>
          `
        : nothing}
    </div>
  `;
}
```

### CSS Styling

Add to `src/styles/components.css`:

```css
/* Agent Grouped Sessions */
.agent-grouped-sessions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-group {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.14);
  overflow: hidden;
}

:root[data-theme="light"] .agent-group {
  background: rgba(255, 255, 255, 0.75);
}

.agent-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.04);
}

:root[data-theme="light"] .agent-group__header {
  background: rgba(0, 0, 0, 0.02);
}

.agent-group__header-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-group__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-foreground);
}

.agent-group__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.agent-group__meta {
  font-size: 11px;
  color: var(--muted);
  margin: 2px 0 0 0;
}

.agent-group__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.agent-group__toggle:hover {
  background: var(--accent);
  color: var(--text);
}

.agent-group__toggle-text {
  display: block;
}

@media (max-width: 640px) {
  .agent-group__toggle-text {
    display: none;
  }
}

.agent-group__toggle-chevron {
  display: flex;
  align-items: center;
  transition: transform 200ms ease;
}

.agent-group__toggle-chevron--expanded {
  transform: rotate(180deg);
}

/* Most Recent Session */
.agent-group__session {
  padding: 14px 16px;
  cursor: pointer;
  transition: background 150ms ease;
}

.agent-group__session:hover {
  background: rgba(255, 255, 255, 0.04);
}

:root[data-theme="light"] .agent-group__session:hover {
  background: rgba(0, 0, 0, 0.03);
}

.agent-group__session-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-group__session-content {
  flex: 1;
  min-width: 0;
}

.agent-group__session-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-group__session-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-group__session-dot--active {
  background: var(--success);
}

.agent-group__session-dot--idle {
  background: var(--warn);
}

.agent-group__session-dot--completed {
  background: var(--muted);
}

.agent-group__session-dot--aborted {
  background: var(--danger);
}

.agent-group__session-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-group__session-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--muted);
}

.agent-group__session-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* History Section */
.agent-group__history {
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.04);
}

:root[data-theme="light"] .agent-group__history {
  background: rgba(0, 0, 0, 0.01);
}

.agent-group__history-header {
  padding: 8px 16px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.agent-group__history-list {
  display: flex;
  flex-direction: column;
}

.agent-group__history-item {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  cursor: pointer;
  transition: background 150ms ease;
}

.agent-group__history-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

:root[data-theme="light"] .agent-group__history-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.agent-group__history-item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

/* Animations */
@media (prefers-reduced-motion: no-preference) {
  .agent-group__history {
    animation: slide-down 0.3s cubic-bezier(0.2, 0.65, 0.3, 0.9);
  }

  .agent-group__history-item {
    animation: fade-in 0.2s ease-out backwards;
  }

  .agent-group__history-item:nth-child(1) {
    animation-delay: 0ms;
  }

  .agent-group__history-item:nth-child(2) {
    animation-delay: 50ms;
  }

  .agent-group__history-item:nth-child(3) {
    animation-delay: 100ms;
  }

  .agent-group__history-item:nth-child(4) {
    animation-delay: 150ms;
  }
}

@keyframes slide-down {
  from {
    opacity: 0;
    height: 0;
  }
  to {
    opacity: 1;
    height: var(--target-height);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

## Part 5: Integration Points

### Sessions View Mode Toggle

Extend the existing view mode toggle to include "grouped" option:

```typescript
// src/ui/views/sessions.ts
export type SessionViewMode = "list" | "table" | "grouped";

// In the toolbar:
<button
  class="sessions-view-toggle__btn ${props.viewMode === "grouped" ? "sessions-view-toggle__btn--active" : ""}"
  type="button"
  title="Grouped by agent"
  aria-pressed=${props.viewMode === "grouped"}
  @click=${() => props.onViewModeChange("grouped")}
>
  ${icon("users", { size: 14 })}
  <span>By Agent</span>
</button>
```

### Render Logic

```typescript
// In renderSessions():
${props.viewMode === "grouped"
  ? renderAgentGroupedSessions(props)
  : props.viewMode === "list"
    ? renderSessionsList(props, rows)
    : renderSessionsTable(props, rows)
}
```

### Persistence

Save view mode preference:

```typescript
// src/ui/app-state.ts
_sessionsViewMode: SessionViewMode = "list";

get sessionsViewMode(): SessionViewMode {
  return this._sessionsViewMode;
}

set sessionsViewMode(value: SessionViewMode) {
  this._sessionsViewMode = value;
  this.persistSessionsViewMode(value);
}
```

---

## Part 6: Non-Obvious Interactions & Edge Cases

### Session Selection Without Expansion

**Scenario**: User clicks "Show history" to expand, then clicks on a historical session.

**Expected Behavior**:

1. Navigate to the selected session in Chat view
2. Maintain expanded state when returning to Sessions view
3. Highlight the currently selected session visually

**Implementation**:

```typescript
@property({ attribute: false })
activeSessionKey?: string;

private _renderSession(session: GatewaySessionRow, isHistory: boolean) {
  const isActive = this.activeSessionKey === session.key;

  return html`
    <div class="agent-group__session ${classMap({ 'agent-group__session--active': isActive })}"
         @click=${(e: Event) => this._handleSessionClick(session, e)}>
      ...
    </div>
  `;
}
```

### Empty States

**Scenario**: An agent has no sessions (shouldn't happen, but defensive).

**Expected Behavior**: Show placeholder or skip the agent group entirely.

**Scenario**: Filtering results in no visible agents.

**Expected Behavior**: Show "No matching sessions" message in the results area.

### Large History Lists

**Scenario**: An agent has 50+ historical sessions.

**Expected Behavior**:

- Show all by default (no arbitrary pagination)
- Consider virtualization if performance degrades
- Could add "Load more" at 20 sessions if needed

### Multiple Active Sessions

**Scenario**: An agent has 3 active sessions (unusual but possible with cron).

**Expected Behavior**:

- Show the most recent (highest `updatedAt`) as the primary session
- Include all active sessions in history
- Each shows the active indicator (pulsing green dot)

### Agent Name Resolution

**Priority Order for Display**:

1. `row.label` - User-set label
2. `row.displayName` - Session display name (fallback)
3. Extracted agent ID from `row.key` - Parse "agent:{agentId}:..."
4. "Unlabeled" - Final fallback

### Session Key Parsing

**Key Formats to Handle**:

- `agent:{agentId}:{rest}` - Standard agent session
- `agent:{agentId}` - Agent without specific session ID
- `subagent:{agentId}:{rest}` - Subagent session
- `{channel}:{groupId}:{userId}` - Channel-based session (not agent)

Only group sessions where a clear agent ID can be extracted.

### Error State Handling

When `abortedLastRun === true`:

1. Override status badge to show "aborted" (red)
2. Status dot should be red
3. This takes precedence over active/idle/completed

### Activity Indicators

When `activeTasks` array has items with `status === "in-progress"`:

1. Show pulsing animation on status dot
2. Add task count badge next to session title
3. Animation: `pulse 2s infinite` using `@keyframes`

---

## Summary

This design provides:

1. **Clear Information Hierarchy**: Agent → Most Recent Session → Historical Sessions
2. **Progressive Disclosure**: Most relevant info always visible, history on-demand
3. **Smooth Animations**: Chevron rotation, height expansion, stagger fade-in
4. **Accessibility First**: Keyboard nav, screen reader support, semantic HTML
5. **Responsive**: Adapts gracefully from mobile to desktop
6. **Integration Ready**: Maps cleanly to existing `GatewaySessionRow` structure

The component can be implemented in Lit following the existing patterns in the codebase, using `html` template literals, `@property` decorators, and the existing CSS variable system.
