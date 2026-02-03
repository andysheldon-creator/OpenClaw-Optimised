# Second Brain Platform - Design Brief

## Project Overview

Complete UI redesign for a cloud-hosted AI agent management platform. The goal is to create a **human-centric "Second Brain"** experience that helps non-developers manage personalized AI assistants.

**Key Shift:** Moving from a developer-focused control panel to a warm, approachable platform for power users and small business owners.

---

## Target Personas

### Primary: Tech-Comfortable Power User

- Not a developer, but comfortable with technology
- Values: clean defaults, accessible depth, reliability indicators
- Wants: progressive disclosure (simple surface, power underneath)
- Examples: Marketing director with AI assistant, consultant managing client workflows

### Secondary: Small Business Owner

- Running AI to handle customer inquiries, scheduling, workflows
- Values: reliability, cost visibility, easy setup, clear status
- Wants: confidence that things are working, minimal learning curve

### Tertiary: Power User (Opt-in)

- Wants full control when needed
- Unlocks: raw config, terminal views, cron expressions, debug tools
- Toggle: "Enable Advanced Features" in settings

---

## Interaction Model

**Dashboard + Chat** with progressive disclosure:

### Standard User Experience

- **Home = Dashboard**: Agent health, recent activity, quick stats
- **Agent Cards**: Simple status indicators, one-click actions
- **Chat**: Full-featured conversational interface
- **Guided Wizards**: For setup and configuration
- **Visual Editors**: Personality sliders, preset templates

### Power User Mode (Opt-in Toggle)

Unlocks:

- Multi-pane workspace layouts
- Raw config editing (YAML/JSON)
- Filesystem browser + terminal view
- Memory architecture explorer
- Advanced automation builder (cron, webhooks)
- Debug console and event streams
- Custom theming and layout persistence

---

## Visual Style

**Playful and Warm** - Think Notion, Linear, Figma

- Rounded corners, soft shadows
- Warm color palette with personality
- Friendly typography
- Delightful micro-interactions
- Light/dark mode with care

---

## Technical Foundation

### Stack (from SETUP.md)

- React 19 + Vite
- Tailwind CSS 4
- Shadcn/ui + Radix primitives
- TanStack Query v5 (server state)
- Zustand (client state)
- React Hook Form + Zod (forms)
- TanStack Router
- Lucide React (icons)
- **ReactFlow** (workflow visualization - from Crabwalk)
- Framer Motion (animations)

### Key Integrations

- WebSocket connection to gateway
- Third-party MCP servers
- Enterprise OAuth flows (browser auth challenges for containers)

---

## Reference Projects

- **Crabwalk** (https://github.com/luccast/crabwalk): ReactFlow-based agent workflow visualization
- **Notion**: Warm, playful SaaS aesthetic
- **Linear**: Clean progressive disclosure
- **ChatGPT/Claude.ai**: Conversational UX patterns

---

## Documents in This Series

1. `00-DESIGN-BRIEF.md` - This document (overview)
2. `01-CONCEPTUAL-MODEL.md` - Core concepts and hierarchy
3. `02-INFORMATION-ARCHITECTURE.md` - Navigation and routing
4. `03-VIEW-SPECIFICATIONS.md` - Detailed view designs
5. `04-COMPONENT-LIBRARY.md` - Reusable component patterns
6. `05-VISUAL-DESIGN.md` - Colors, typography, spacing
7. `06-INTERACTIONS.md` - Animations, transitions, feedback
8. `07-POWER-USER-MODE.md` - Advanced features specification
