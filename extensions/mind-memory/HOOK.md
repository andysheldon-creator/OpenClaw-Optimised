---
name: Graphiti Memory Search
description: Allows the agent to consciously search the Graphiti knowledge graph for memories, facts, and entities.
version: 1.0.0
---

# Graphiti Memory Search Hook

This hook provides tools for the agent to consciously query the Graphiti temporal knowledge graph.

## Available Tools

### `search_memory_nodes`
Search for entities (nodes) in the knowledge graph.

**Use when:** You need to find information about specific people, places, concepts, or entities mentioned in past conversations.

**Example:**
```
User: "What do you know about my project?"
Agent uses: search_memory_nodes(query: "user's project")
```

### `search_memory_facts`
Search for relationships and facts (edges) in the knowledge graph.

**Use when:** You need to find specific relationships or facts about entities.

**Example:**
```
User: "What technologies am I using?"
Agent uses: search_memory_facts(query: "technologies user is using")
```

## How It Works

1. **Automatic Flashbacks**: The system automatically retrieves relevant memories based on conversation context (passive recall)
2. **Conscious Search**: The agent can actively search for specific information using these tools (active recall)

## Integration

This hook is automatically registered by the `mind-memory` plugin and uses the Graphiti MCP server running at `http://localhost:8001`.
