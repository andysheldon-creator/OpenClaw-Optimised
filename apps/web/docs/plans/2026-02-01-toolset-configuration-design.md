# Toolset Configuration Design

**Date:** 2026-02-01
**Status:** Approved

## Overview

Create a "Toolset Configuration" concept - a labeled, reusable combination of tool permissions that can be shared across agents and other contexts where tool access is configured.

## Goals

1. Allow users to define named toolsets (e.g., "Research Mode", "Developer Tools")
2. Make toolsets reusable across multiple agents
3. Provide a global settings section for managing toolsets
4. Refactor existing tool UI into reusable components
5. Add collapsible sections with sensible defaults
6. Add new tool categories: Multi-Modality and Channels

## Data Model

### ToolsetConfig

```typescript
interface ToolsetConfig {
  id: string;
  name: string;                    // e.g., "Research Mode", "Developer Tools"
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  tools: ToolPermission[];
}

interface ToolPermission {
  toolId: string;
  enabled: boolean;
  permissions?: string[];          // Granular: "read", "write", "execute", etc.
}
```

### Tool Categories

```typescript
type ToolCategory =
  | "files"           // Files & Documents
  | "code"            // Code & Development
  | "channels"        // Channels (messaging integrations)
  | "communication"   // Communication (calendar, email)
  | "data"            // Data & Research
  | "multimodal"      // Multi-Modality (image/video/audio gen)
  | "other";          // Other Tools
```

### Category Display Order & Defaults

| Order | Category | Label | Default State |
|-------|----------|-------|---------------|
| 1 | files | Files & Documents | **Expanded** |
| 2 | code | Code & Development | **Expanded** |
| 3 | channels | Channels | Collapsed |
| 4 | communication | Communication | Collapsed |
| 5 | data | Data & Research | Collapsed |
| 6 | multimodal | Multi-Modality | Collapsed |
| 7 | other | Other Tools | Collapsed |

## Component Architecture

```
ToolAccessConfig (reusable container)
├── ToolCategorySection (collapsible section per category)
│   └── ToolPermissionRow (individual tool toggle)
└── Controls (summary, actions)
```

### Components

#### ToolPermissionRow
Single tool display with icon, name, permission badges, description, and toggle switch.

#### ToolCategorySection
Collapsible card for a category. Shows category icon, label, and enabled count in header. Expands to show ToolPermissionRow for each tool.

Props:
- `category: ToolCategory`
- `tools: Tool[]`
- `defaultExpanded: boolean`
- `onToolToggle: (toolId: string, enabled: boolean) => void`

#### ToolAccessConfig
Main reusable component combining all category sections. Used in:
- Toolset editor (Settings → Toolsets)
- Agent Tools tab (refactored)
- Any future tool configuration UI

Props:
- `tools: Tool[]`
- `onToolsChange: (tools: Tool[]) => void`
- `readOnly?: boolean` (when using inherited toolset)

## Settings Integration

### Navigation
Add "Toolsets" to Settings → Configuration group, positioned between "Agents" and "Advanced".

### ToolsetsSection
- Header with "Toolsets" title and "Create Toolset" button
- List of toolset cards showing:
  - Name and description
  - Summary: "X of Y tools enabled"
  - Usage count: "Used by N agents"
  - Actions: Edit, Duplicate, Delete

### ToolsetEditor
Inline editor with:
- Name input (required)
- Description textarea (optional)
- ToolAccessConfig component
- Save / Cancel buttons

### Default Toolsets
Built-in presets users can duplicate:
- **Minimal** - Read-only tools only
- **Standard** - Common tools without execution
- **Full Access** - Everything enabled

## Agent Integration

In AgentToolsTab, add toolset selection:
- Dropdown: "Use Toolset: [None / Custom / <toolset names>...]"
- When toolset selected: tool toggles become read-only, inherited from toolset
- "Custom" option allows agent-specific overrides

## New Tools

### Multi-Modality Category
| Tool | ID | Permissions | Description |
|------|----|-------------|-------------|
| Image Generation | image-gen | generate | Generate images using AI models |
| Video Generation | video-gen | generate | Generate videos using AI models |
| Audio Generation | audio-gen | generate | Generate audio and speech |

### Channels Category
| Tool | ID | Permissions | Description |
|------|----|-------------|-------------|
| Slack | slack-send | send | Send messages to Slack channels |
| Discord | discord-send | send | Send messages to Discord servers |
| Telegram | telegram-send | send | Send messages via Telegram |

## File Structure

### New Files
```
src/components/domain/tools/
├── types.ts                    # Tool, ToolCategory, ToolsetConfig types
├── tool-data.ts                # DEFAULT_TOOLS, category config
├── ToolPermissionRow.tsx       # Single tool toggle row
├── ToolCategorySection.tsx     # Collapsible category card
├── ToolAccessConfig.tsx        # Main reusable component
└── index.ts                    # Exports

src/components/domain/settings/
├── ToolsetsSection.tsx         # Settings section
└── ToolsetEditor.tsx           # Create/edit toolset
```

### Modified Files
```
src/components/domain/settings/SettingsConfigNav.tsx    # Add nav item
src/components/domain/settings/index.ts                 # Export section
src/components/domain/agents/AgentToolsTab.tsx          # Use ToolAccessConfig
src/routes/settings/index.tsx                           # Render section
```

## Implementation Order

1. Create `tools/` directory with types and tool data
2. Build ToolPermissionRow component
3. Build ToolCategorySection with collapsible behavior
4. Build ToolAccessConfig container
5. Create ToolsetsSection and ToolsetEditor
6. Add to settings navigation and routing
7. Refactor AgentToolsTab to use new components
8. Add toolset selection to AgentToolsTab
